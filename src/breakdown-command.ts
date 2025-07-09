import { Octokit } from '@octokit/rest';
import { IssueHierarchyManager, ParsedIssue } from './issue-hierarchy';
import { TaskmasterCLIManager, DEFAULT_CLI_CONFIG } from './cli-manager';
import * as fs from 'fs';
import * as path from 'path';

export interface BreakdownCommandOptions {
  depth: number;
  threshold: number;
  issueNumber: number;
  commentId: number;
  commenter: string;
}

export interface BreakdownResult {
  success: boolean;
  parentIssueNumber: number;
  subIssuesCreated: number[];
  message: string;
  error?: string;
}

export class BreakdownCommandHandler {
  private octokit: Octokit;
  private hierarchyManager: IssueHierarchyManager;
  private cliManager: TaskmasterCLIManager;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.hierarchyManager = new IssueHierarchyManager(this.octokit, owner, repo);
    this.cliManager = new TaskmasterCLIManager(DEFAULT_CLI_CONFIG);
  }

  /**
   * Parse breakdown command from comment body
   */
  parseBreakdownCommand(commentBody: string): BreakdownCommandOptions | null {
    const breakdownMatch = commentBody.match(/\/breakdown(?:\s+(.*))?/);
    if (!breakdownMatch) {
      return null;
    }

    const args = breakdownMatch[1] || '';
    
    // Parse depth parameter
    const depthMatch = args.match(/--depth\s+(\d+)/);
    const depth = depthMatch ? parseInt(depthMatch[1], 10) : 2;
    
    // Parse threshold parameter
    const thresholdMatch = args.match(/--threshold\s+(\d+)/);
    const threshold = thresholdMatch ? parseInt(thresholdMatch[1], 10) : 10;
    
    // Validate depth doesn't exceed maximum
    const maxDepth = 2; // breakdown-max-depth limit
    const finalDepth = Math.min(depth, maxDepth);
    
    if (depth > maxDepth) {
      console.warn(`Requested depth ${depth} exceeds maximum allowed depth ${maxDepth}. Using ${finalDepth}.`);
    }

    return {
      depth: finalDepth,
      threshold,
      issueNumber: 0, // Will be set by caller
      commentId: 0,   // Will be set by caller
      commenter: ''   // Will be set by caller
    };
  }

  /**
   * Check if breakdown has already been performed on this issue
   */
  private async checkIdempotency(issueNumber: number): Promise<boolean> {
    try {
      // Check if issue has sub-issues already created by breakdown
      const issue = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      // Parse YAML front-matter to check if breakdown has been performed
      const parsed = this.hierarchyManager.parseYAMLFrontMatter(issue.data.body || '');
      
      // Check if issue has breakdown metadata or existing sub-issues
      if (parsed.metadata.breakdown_performed || parsed.metadata.breakdown_timestamp) {
        return true;
      }

      // Check if issue has sub-issues via Sub-issues API
      const subIssues = await this.hierarchyManager.getSubIssues(issueNumber);
      return subIssues.length > 0;
    } catch (error) {
      console.error(`Error checking idempotency for issue #${issueNumber}:`, error);
      return false;
    }
  }

  /**
   * Execute breakdown command on the specified issue
   */
  async executeBreakdown(options: BreakdownCommandOptions): Promise<BreakdownResult> {
    const { issueNumber, depth, threshold, commenter } = options;
    
    console.log(`Executing breakdown command on issue #${issueNumber} with depth=${depth}, threshold=${threshold}`);

    try {
      // Check idempotency first
      const alreadyProcessed = await this.checkIdempotency(issueNumber);
      if (alreadyProcessed) {
        const message = `Issue #${issueNumber} has already been broken down. Skipping to prevent duplicates.`;
        console.log(message);
        return {
          success: true,
          parentIssueNumber: issueNumber,
          subIssuesCreated: [],
          message
        };
      }

      // Fetch parent issue and parse YAML metadata
      const issue = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      const parsed = this.hierarchyManager.parseYAMLFrontMatter(issue.data.body || '');
      
      if (!parsed.metadata.id) {
        throw new Error(`Issue #${issueNumber} does not have required YAML metadata with task ID`);
      }

      // Create temporary task specification for CLI
      const taskSpec = {
        id: parsed.metadata.id,
        title: parsed.metadata.title || issue.data.title,
        description: parsed.body,
        priority: parsed.metadata.priority || 'medium',
        complexity: parsed.metadata.complexity || 5,
        dependencies: parsed.metadata.dependencies || []
      };

      // Execute Taskmaster CLI to break down the task
      const cliResult = await this.executeCLIBreakdown(taskSpec, depth, threshold);
      
      if (!cliResult.subtasks || cliResult.subtasks.length === 0) {
        const message = `No subtasks generated for issue #${issueNumber}. Task may already be at appropriate granularity.`;
        console.log(message);
        return {
          success: true,
          parentIssueNumber: issueNumber,
          subIssuesCreated: [],
          message
        };
      }

      // Create sub-issues from CLI results
      const subIssueNumbers = await this.createSubIssuesFromCLIResult(issueNumber, cliResult);

      // Update parent issue with breakdown metadata
      await this.updateParentIssueAfterBreakdown(issueNumber, parsed, subIssueNumbers, commenter);

      const message = `Successfully broke down issue #${issueNumber} into ${subIssueNumbers.length} sub-issues: ${subIssueNumbers.map(n => `#${n}`).join(', ')}`;
      console.log(message);

      return {
        success: true,
        parentIssueNumber: issueNumber,
        subIssuesCreated: subIssueNumbers,
        message
      };

    } catch (error) {
      const errorMessage = `Failed to execute breakdown command on issue #${issueNumber}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      return {
        success: false,
        parentIssueNumber: issueNumber,
        subIssuesCreated: [],
        message: errorMessage,
        error: errorMessage
      };
    }
  }

  /**
   * Execute CLI breakdown operation
   */
  private async executeCLIBreakdown(taskSpec: any, depth: number, threshold: number): Promise<any> {
    console.log(`Executing CLI breakdown for task ${taskSpec.id} with depth=${depth}, threshold=${threshold}`);
    
    // Download and validate CLI if needed
    await this.cliManager.downloadAndValidate();

    // Prepare CLI options for breakdown
    const cliOptions = {
      complexityThreshold: threshold,
      maxDepth: depth,
      prdPathGlob: '', // Not used for breakdown
      breakdownMaxDepth: depth,
      additionalArgs: [
        '--breakdown-mode',
        '--task-id', taskSpec.id.toString(),
        '--task-title', taskSpec.title,
        '--task-description', taskSpec.description || '',
        '--task-priority', taskSpec.priority || 'medium',
        '--task-complexity', (taskSpec.complexity || 5).toString()
      ]
    };

    // Execute CLI
    const output = await this.cliManager.execute(cliOptions);
    
    // Parse and validate output
    const result = this.cliManager.parseOutput(output);
    
    return result;
  }

  /**
   * Create sub-issues from CLI breakdown result
   */
  private async createSubIssuesFromCLIResult(parentIssueNumber: number, cliResult: any): Promise<number[]> {
    const subIssueNumbers: number[] = [];
    
    if (!cliResult.subtasks || !Array.isArray(cliResult.subtasks)) {
      return subIssueNumbers;
    }

    for (const subtask of cliResult.subtasks) {
      try {
        // Create sub-issue
        const subIssue = await this.octokit.issues.create({
          owner: this.owner,
          repo: this.repo,
          title: subtask.title,
          body: this.buildSubIssueBody(subtask, parentIssueNumber),
          labels: this.buildSubIssueLabels(subtask)
        });

        subIssueNumbers.push(subIssue.data.number);
        
        // Create parent-child relationship via Sub-issues API
        await this.hierarchyManager.createSubIssue(parentIssueNumber, subIssue.data.number);
        
        console.log(`Created sub-issue #${subIssue.data.number} for parent #${parentIssueNumber}`);
        
      } catch (error) {
        console.error(`Error creating sub-issue for ${subtask.title}:`, error);
        // Continue with remaining subtasks
      }
    }

    return subIssueNumbers;
  }

  /**
   * Build sub-issue body with YAML front-matter
   */
  private buildSubIssueBody(subtask: any, parentIssueNumber: number): string {
    const metadata = {
      id: subtask.id,
      title: subtask.title,
      parent: [parentIssueNumber],
      dependencies: subtask.dependencies || [],
      priority: subtask.priority || 'medium',
      complexity: subtask.complexity || 5,
      status: 'pending'
    };

    const yamlFrontMatter = this.hierarchyManager.generateYAMLFrontMatter(metadata);
    
    let body = yamlFrontMatter;
    
    if (subtask.description) {
      body += `## Details\n${subtask.description}\n\n`;
    }
    
    if (subtask.testStrategy) {
      body += `## Test Strategy\n${subtask.testStrategy}\n\n`;
    }
    
    // Add breakdown info
    body += `## Breakdown Info\n`;
    body += `- **Parent Issue**: #${parentIssueNumber}\n`;
    body += `- **Created via**: Manual breakdown command\n`;
    body += `- **Complexity**: ${subtask.complexity || 5}/10\n\n`;
    
    return body;
  }

  /**
   * Build appropriate labels for sub-issues
   */
  private buildSubIssueLabels(subtask: any): string[] {
    const labels: string[] = [];
    
    // Add priority label
    if (subtask.priority) {
      labels.push(`priority:${subtask.priority}`);
    }
    
    // Add complexity label
    if (subtask.complexity) {
      labels.push(`complexity:${subtask.complexity}`);
    }
    
    // Add sub-issue label
    labels.push('sub-issue');
    
    return labels;
  }

  /**
   * Update parent issue after breakdown
   */
  private async updateParentIssueAfterBreakdown(
    issueNumber: number, 
    parsed: ParsedIssue, 
    subIssueNumbers: number[], 
    commenter: string
  ): Promise<void> {
    try {
      // Update metadata with breakdown information
      const updatedMetadata = {
        ...parsed.metadata,
        breakdown_performed: true,
        breakdown_timestamp: new Date().toISOString(),
        breakdown_by: commenter,
        breakdown_sub_issues: subIssueNumbers,
        status: 'breakdown' // Mark as broken down
      };

      // Add comment about breakdown
      let updatedBody = parsed.body;
      updatedBody += `\n\n## Breakdown Results\n`;
      updatedBody += `- **Broken down by**: @${commenter}\n`;
      updatedBody += `- **Breakdown date**: ${new Date().toISOString()}\n`;
      updatedBody += `- **Sub-issues created**: ${subIssueNumbers.map(n => `#${n}`).join(', ')}\n`;
      updatedBody += `- **Total sub-issues**: ${subIssueNumbers.length}\n\n`;

      // Update the issue with new metadata and body
      await this.hierarchyManager.updateIssueWithMetadata(issueNumber, updatedMetadata, updatedBody);
      
      // Close the parent issue as it's now broken down
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed',
        state_reason: 'completed'
      });
      
      console.log(`Updated parent issue #${issueNumber} with breakdown metadata and closed it`);
      
    } catch (error) {
      console.error(`Error updating parent issue #${issueNumber} after breakdown:`, error);
      throw error;
    }
  }

  /**
   * Add comment to issue with breakdown results
   */
  async addBreakdownComment(issueNumber: number, result: BreakdownResult): Promise<void> {
    try {
      let commentBody = `## Breakdown Command Results\n\n`;
      
      if (result.success) {
        commentBody += `✅ **Success**: ${result.message}\n\n`;
        
        if (result.subIssuesCreated.length > 0) {
          commentBody += `### Sub-issues Created:\n`;
          for (const subIssueNumber of result.subIssuesCreated) {
            commentBody += `- #${subIssueNumber}\n`;
          }
          commentBody += `\n`;
        }
      } else {
        commentBody += `❌ **Failed**: ${result.error}\n\n`;
      }
      
      commentBody += `*Command executed at ${new Date().toISOString()}*`;
      
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: commentBody
      });
      
    } catch (error) {
      console.error(`Error adding breakdown comment to issue #${issueNumber}:`, error);
    }
  }
}

// Main execution function for the workflow
async function main() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const issueNumber = parseInt(process.env.ISSUE_NUMBER || '0', 10);
  const commentId = parseInt(process.env.COMMENT_ID || '0', 10);
  const depth = parseInt(process.env.DEPTH || '2', 10);
  const threshold = parseInt(process.env.THRESHOLD || '10', 10);
  const commenter = process.env.COMMENTER || 'unknown';

  if (!token || !owner || !repo || !issueNumber || !commentId) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const handler = new BreakdownCommandHandler(token, owner, repo);
  
  try {
    const options: BreakdownCommandOptions = {
      depth,
      threshold,
      issueNumber,
      commentId,
      commenter
    };

    const result = await handler.executeBreakdown(options);
    
    // Add comment with results
    await handler.addBreakdownComment(issueNumber, result);
    
    if (result.success) {
      console.log(`✅ Breakdown command completed successfully for issue #${issueNumber}`);
      process.exit(0);
    } else {
      console.error(`❌ Breakdown command failed for issue #${issueNumber}: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Fatal error in breakdown command:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}