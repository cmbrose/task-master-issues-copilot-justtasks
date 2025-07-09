import { Octokit } from '@octokit/rest';
import { components } from "@octokit/openapi-types";
import * as yaml from 'yaml';

type ApiIssue = components["schemas"]["issue"];

export interface IssueMetadata {
  id?: number;
  title?: string;
  parent?: number[];
  dependents?: number[];
  dependencies?: number[];
  complexity?: number;
  priority?: string;
  status?: string;
  breakdown_performed?: boolean;
  breakdown_timestamp?: string;
  breakdown_by?: string;
  breakdown_sub_issues?: number[];
}

export interface ParsedIssue {
  metadata: IssueMetadata;
  body: string;
}

export class IssueHierarchyManager {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Parse YAML front-matter from issue description
   */
  parseYAMLFrontMatter(issueBody: string): ParsedIssue {
    // Check if the issue has YAML front-matter
    const yamlMatch = issueBody.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!yamlMatch) {
      return {
        metadata: {},
        body: issueBody
      };
    }

    try {
      const yamlContent = yamlMatch[1];
      const remainingBody = yamlMatch[2];
      
      const metadata = yaml.parse(yamlContent) as IssueMetadata;
      
      return {
        metadata: metadata || {},
        body: remainingBody
      };
    } catch (error) {
      console.warn('Failed to parse YAML front-matter:', error);
      return {
        metadata: {},
        body: issueBody
      };
    }
  }

  /**
   * Generate YAML front-matter for an issue
   */
  generateYAMLFrontMatter(metadata: IssueMetadata): string {
    if (!metadata || Object.keys(metadata).length === 0) {
      return '';
    }

    const yamlContent = yaml.stringify(metadata);
    return `---\n${yamlContent}---\n`;
  }

  /**
   * Check if an issue is blocked based on its dependencies
   */
  async isIssueBlocked(issueNumber: number): Promise<boolean> {
    try {
      const issue = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      const parsed = this.parseYAMLFrontMatter(issue.data.body || '');
      
      if (!parsed.metadata.dependencies || parsed.metadata.dependencies.length === 0) {
        return false;
      }

      // Check if any dependency is still open
      for (const depId of parsed.metadata.dependencies) {
        const depIssue = await this.octokit.issues.get({
          owner: this.owner,
          repo: this.repo,
          issue_number: depId
        });

        if (depIssue.data.state === 'open') {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error(`Error checking blocked status for issue #${issueNumber}:`, error);
      return false;
    }
  }

  /**
   * Update blocked status for an issue
   */
  async updateBlockedStatus(issueNumber: number): Promise<void> {
    try {
      const isBlocked = await this.isIssueBlocked(issueNumber);
      
      const issue = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      const currentLabels = issue.data.labels?.map(label => 
        typeof label === 'string' ? label : label.name
      ).filter(Boolean) || [];

      const hasBlockedLabel = currentLabels.includes('blocked');

      if (isBlocked && !hasBlockedLabel) {
        // Add blocked label
        await this.octokit.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          labels: ['blocked']
        });
        console.log(`Added 'blocked' label to issue #${issueNumber}`);
      } else if (!isBlocked && hasBlockedLabel) {
        // Remove blocked label
        await this.octokit.issues.removeLabel({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          name: 'blocked'
        });
        console.log(`Removed 'blocked' label from issue #${issueNumber}`);
      }
    } catch (error) {
      console.error(`Error updating blocked status for issue #${issueNumber}:`, error);
    }
  }

  /**
   * Create parent-child relationship using Sub-issues API
   * Note: GitHub's Sub-issues API is in beta and may not have all methods available
   */
  async createSubIssue(parentIssueNumber: number, childIssueNumber: number): Promise<void> {
    try {
      // Check if createSubIssue method exists (GitHub's Sub-issues API is in beta)
      if (typeof (this.octokit.issues as any).createSubIssue === 'function') {
        await (this.octokit.issues as any).createSubIssue({
          owner: this.owner,
          repo: this.repo,
          issue_number: parentIssueNumber,
          sub_issue_number: childIssueNumber
        });
        console.log(`Created sub-issue relationship: #${parentIssueNumber} -> #${childIssueNumber}`);
      } else {
        // Fallback: Add comment to indicate relationship
        await this.createFallbackRelationship(parentIssueNumber, childIssueNumber);
      }
    } catch (error) {
      console.error(`Error creating sub-issue relationship: #${parentIssueNumber} -> #${childIssueNumber}:`, error);
      // Fallback: Add comment to indicate relationship
      await this.createFallbackRelationship(parentIssueNumber, childIssueNumber);
    }
  }

  /**
   * Fallback method when Sub-issues API is unavailable
   */
  private async createFallbackRelationship(parentIssueNumber: number, childIssueNumber: number): Promise<void> {
    try {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: parentIssueNumber,
        body: `Sub-issue: #${childIssueNumber}`
      });
      console.log(`Created fallback relationship comment: #${parentIssueNumber} -> #${childIssueNumber}`);
    } catch (error) {
      console.error(`Error creating fallback relationship: #${parentIssueNumber} -> #${childIssueNumber}:`, error);
    }
  }

  /**
   * Get all sub-issues for a parent issue
   */
  async getSubIssues(parentIssueNumber: number): Promise<ApiIssue[]> {
    try {
      // Check if listSubIssues method exists (GitHub's Sub-issues API is in beta)
      if (typeof (this.octokit.issues as any).listSubIssues === 'function') {
        const response = await (this.octokit.issues as any).listSubIssues({
          owner: this.owner,
          repo: this.repo,
          issue_number: parentIssueNumber
        });
        return response.data;
      } else {
        console.warn('Sub-issues API not available, returning empty array');
        return [];
      }
    } catch (error) {
      console.error(`Error fetching sub-issues for #${parentIssueNumber}:`, error);
      return [];
    }
  }

  /**
   * Resolve dependencies when a parent issue is closed
   */
  async resolveDependencies(closedIssueNumber: number): Promise<void> {
    try {
      // Find all issues that depend on this closed issue
      const allIssues = await this.getAllIssues();
      
      for (const issue of allIssues) {
        if (issue.body) {
          const parsed = this.parseYAMLFrontMatter(issue.body);
          
          if (parsed.metadata.dependencies && 
              parsed.metadata.dependencies.includes(closedIssueNumber)) {
            
            // Update the blocked status for this dependent issue
            await this.updateBlockedStatus(issue.number);
          }
        }
      }
    } catch (error) {
      console.error(`Error resolving dependencies for closed issue #${closedIssueNumber}:`, error);
    }
  }

  /**
   * Get all issues from the repository
   */
  async getAllIssues(): Promise<ApiIssue[]> {
    const allIssues: ApiIssue[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'all',
        per_page: 100,
        page
      });

      allIssues.push(...response.data);
      hasMore = response.data.length === 100;
      page++;
    }

    return allIssues;
  }

  /**
   * Update issue with YAML front-matter and dependency information
   */
  async updateIssueWithMetadata(issueNumber: number, metadata: IssueMetadata, bodyContent: string): Promise<void> {
    try {
      const yamlFrontMatter = this.generateYAMLFrontMatter(metadata);
      const newBody = yamlFrontMatter + bodyContent;

      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: newBody
      });

      console.log(`Updated issue #${issueNumber} with YAML front-matter`);
    } catch (error) {
      console.error(`Error updating issue #${issueNumber} with metadata:`, error);
    }
  }
}