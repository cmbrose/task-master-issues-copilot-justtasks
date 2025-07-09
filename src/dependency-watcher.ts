#!/usr/bin/env node

import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';
import { IssueHierarchyManager } from './issue-hierarchy';

// Load environment variables
dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;

let octokit: Octokit;
let hierarchyManager: IssueHierarchyManager;

// Initialize only if environment variables are present
if (GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO) {
  octokit = new Octokit({ auth: GITHUB_TOKEN });
  hierarchyManager = new IssueHierarchyManager(octokit, GITHUB_OWNER, GITHUB_REPO);
}

/**
 * Handle individual issue closure - called by webhook trigger
 */
async function handleIssueClosure(issueNumber: number): Promise<void> {
  if (!hierarchyManager) {
    throw new Error('Hierarchy manager not initialized. Check environment variables.');
  }
  
  console.log(`Processing issue closure: #${issueNumber}`);
  
  try {
    // Use the existing dependency resolution logic
    await hierarchyManager.resolveDependencies(issueNumber);
    console.log(`Successfully resolved dependencies for issue #${issueNumber}`);
  } catch (error) {
    console.error(`Error resolving dependencies for issue #${issueNumber}:`, error);
    throw error;
  }
}

/**
 * Scan all issues for blocked status updates - called by cron trigger
 * Implements batch processing for efficiency
 */
async function scanAllIssuesForBlockedStatus(): Promise<void> {
  if (!hierarchyManager) {
    throw new Error('Hierarchy manager not initialized. Check environment variables.');
  }
  
  console.log('Starting batch scan of all issues for blocked status updates...');
  
  try {
    // Get all open issues
    const issues = await hierarchyManager.getAllIssues();
    const openIssues = issues.filter(issue => issue.state === 'open');
    
    console.log(`Found ${openIssues.length} open issues to process`);
    
    // Process issues in batches to optimize API calls
    const batchSize = 10;
    let processedCount = 0;
    let updatedCount = 0;
    
    for (let i = 0; i < openIssues.length; i += batchSize) {
      const batch = openIssues.slice(i, i + batchSize);
      
      // Process batch concurrently but with controlled concurrency
      const batchPromises = batch.map(async (issue) => {
        try {
          // Get current blocked status
          const currentLabels = issue.labels?.map(label => 
            typeof label === 'string' ? label : label.name
          ).filter(Boolean) || [];
          
          const hasBlockedLabel = currentLabels.includes('blocked');
          const shouldBeBlocked = await hierarchyManager.isIssueBlocked(issue.number);
          
          // Update if status changed
          if (hasBlockedLabel !== shouldBeBlocked) {
            await hierarchyManager.updateBlockedStatus(issue.number);
            console.log(`Updated blocked status for issue #${issue.number}: ${hasBlockedLabel ? 'blocked' : 'unblocked'} -> ${shouldBeBlocked ? 'blocked' : 'unblocked'}`);
            return true; // Updated
          }
          
          return false; // No update needed
        } catch (error) {
          console.error(`Error processing issue #${issue.number}:`, error);
          return false;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const batchUpdatedCount = batchResults.filter(updated => updated).length;
      
      processedCount += batch.length;
      updatedCount += batchUpdatedCount;
      
      console.log(`Processed batch ${Math.ceil((i + batchSize) / batchSize)}/${Math.ceil(openIssues.length / batchSize)}: ${batchUpdatedCount} issues updated`);
      
      // Add small delay between batches to respect rate limits
      if (i + batchSize < openIssues.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Batch scan completed: ${processedCount} issues processed, ${updatedCount} issues updated`);
    
  } catch (error) {
    console.error('Error during batch scan:', error);
    throw error;
  }
}

/**
 * Main function to determine execution mode
 */
async function main() {
  // Check for required environment variables
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error('Missing required environment variables: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
    process.exit(1);
  }

  const startTime = Date.now();
  
  try {
    if (ISSUE_NUMBER) {
      // Webhook mode - handle specific issue closure
      const issueNumber = parseInt(ISSUE_NUMBER, 10);
      if (isNaN(issueNumber)) {
        throw new Error(`Invalid issue number: ${ISSUE_NUMBER}`);
      }
      
      await handleIssueClosure(issueNumber);
      
    } else {
      // Cron mode - scan all issues
      await scanAllIssuesForBlockedStatus();
    }
    
    const duration = Date.now() - startTime;
    console.log(`Dependency watcher completed successfully in ${duration}ms`);
    
  } catch (error) {
    console.error('Dependency watcher failed:', error);
    process.exit(1);
  }
}

// Export functions for testing
export { handleIssueClosure, scanAllIssuesForBlockedStatus };

// Run main function if script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}