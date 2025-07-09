#!/usr/bin/env node

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

// Environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const PR_NUMBER = process.env.PR_NUMBER;
const TASKS_PATH = path.join('.taskmaster', 'tasks', 'tasks.json');

// Initialize Octokit
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

/**
 * Build issue body preview for a task
 */
function buildIssueBodyPreview(task) {
  const lines = [];
  
  lines.push(`## Details`);
  lines.push(task.description || 'No description provided');
  lines.push('');
  
  lines.push(`## Test Strategy`);
  lines.push(task.testStrategy || 'No test strategy provided');
  lines.push('');
  
  if (task.subtasks && task.subtasks.length > 0) {
    lines.push(`## Subtasks`);
    task.subtasks.forEach(subtask => {
      lines.push(`- ${subtask.description || subtask.title}`);
    });
    lines.push('');
  }
  
  if (task.dependencies && task.dependencies.length > 0) {
    lines.push(`## Dependencies`);
    task.dependencies.forEach(depId => {
      lines.push(`- [ ] Task #${depId}`);
    });
    lines.push('');
  }
  
  lines.push(`## Meta`);
  lines.push(`- Status: \`${task.status || 'pending'}\``);
  lines.push(`- Priority: \`${task.priority || 'medium'}\``);
  lines.push(`- Complexity: \`${task.complexity || 'unknown'} / 10\``);
  
  if (task.requiredBy && task.requiredBy.length > 0) {
    lines.push(`- Required By:`);
    task.requiredBy.forEach(reqBy => {
      lines.push(`   - [ ] Task #${reqBy.id}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Generate markdown preview comment for all tasks
 */
function generatePreviewComment(tasks, metadata) {
  const lines = [];
  
  lines.push(`# 🔍 Taskmaster Preview - Dry Run Mode`);
  lines.push('');
  lines.push(`This pull request would create **${tasks.length}** GitHub issues if merged.`);
  lines.push('');
  
  // Metadata section
  lines.push(`## 📊 Generation Summary`);
  lines.push(`- **PRD Files**: ${metadata.prdFiles ? metadata.prdFiles.join(', ') : 'Unknown'}`);
  lines.push(`- **Tasks Total**: ${metadata.tasksTotal || tasks.length}`);
  lines.push(`- **Tasks Filtered**: ${metadata.tasksFiltered || tasks.length}`);
  lines.push(`- **Complexity Threshold**: ${metadata.complexityThreshold || 'Not specified'}`);
  lines.push(`- **Max Depth**: ${metadata.maxDepth || 'Not specified'}`);
  lines.push(`- **Generated**: ${metadata.created || new Date().toISOString()}`);
  lines.push('');
  
  // Task overview
  lines.push(`## 📋 Task Overview`);
  lines.push('');
  
  tasks.forEach((task, index) => {
    const complexity = task.complexity || 'unknown';
    const priority = task.priority || 'medium';
    const status = task.status || 'pending';
    
    lines.push(`### ${index + 1}. ${task.title}`);
    lines.push(`**Priority**: ${priority} | **Complexity**: ${complexity}/10 | **Status**: ${status}`);
    lines.push('');
    
    if (task.description) {
      lines.push(task.description);
      lines.push('');
    }
    
    if (task.dependencies && task.dependencies.length > 0) {
      lines.push(`**Dependencies**: ${task.dependencies.map(dep => `#${dep}`).join(', ')}`);
      lines.push('');
    }
    
    if (task.subtasks && task.subtasks.length > 0) {
      lines.push(`**Subtasks**: ${task.subtasks.length} subtasks`);
      task.subtasks.forEach(subtask => {
        lines.push(`  - ${subtask.description || subtask.title}`);
      });
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  });
  
  lines.push(`## 🚀 Next Steps`);
  lines.push('');
  lines.push('- **To create these issues**: Merge this pull request');
  lines.push('- **To modify tasks**: Update the PRD files and push changes');
  lines.push('- **To skip issue creation**: Close this pull request without merging');
  lines.push('');
  lines.push('*This is a dry-run preview. No issues will be created until this PR is merged.*');
  
  return lines.join('\n');
}

/**
 * Post or update preview comment on pull request
 */
async function postPreviewComment(prNumber, content) {
  try {
    // First, try to find existing preview comment
    const comments = await octokit.issues.listComments({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: prNumber,
    });
    
    const existingComment = comments.data.find(comment => 
      comment.body.includes('🔍 Taskmaster Preview - Dry Run Mode')
    );
    
    if (existingComment) {
      // Update existing comment
      await octokit.issues.updateComment({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        comment_id: existingComment.id,
        body: content,
      });
      console.log(`Updated existing preview comment #${existingComment.id}`);
    } else {
      // Create new comment
      const response = await octokit.issues.createComment({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        issue_number: prNumber,
        body: content,
      });
      console.log(`Created new preview comment #${response.data.id}`);
    }
  } catch (error) {
    console.error('Error posting preview comment:', error);
    throw error;
  }
}

async function main() {
  try {
    // Validate environment variables
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO || !PR_NUMBER) {
      throw new Error('Missing required environment variables');
    }
    
    // Parse JSON
    const raw = fs.readFileSync(TASKS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const tasks = data.master.tasks;
    const metadata = data.master.metadata || {};
    
    console.log(`Generating preview for ${tasks.length} tasks...`);
    
    // Generate preview comment
    const previewComment = generatePreviewComment(tasks, metadata);
    
    // Post comment to PR
    await postPreviewComment(parseInt(PR_NUMBER), previewComment);
    
    console.log('Preview comment posted successfully');
  } catch (error) {
    console.error('Error in main:', error);
    process.exit(1);
  }
}

main();