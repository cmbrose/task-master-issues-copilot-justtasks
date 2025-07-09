// create-issues.ts
//
// Usage:
//   1. Install dependencies:
//      npm install @octokit/rest dotenv
//      npm install --save-dev @types/node
//   2. Set env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//   3. Run with ts-node or compile with tsc
//
// Note: Requires Node.js types for process, fs, path, etc.

import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

import { components } from "@octokit/openapi-types";

// Types for Node.js globals (process, etc.)
// If you see type errors, run: npm install --save-dev @types/node

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO in environment variables.');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const TASKS_PATH = path.join('.taskmaster', 'tasks', 'tasks.json');
const COMPLEXITY_PATH  = path.join('.taskmaster', 'reports', 'task-complexity-report.json');
const UNIQUE_MARKER = '<!-- created-by-taskmaster-script -->';

type ApiIssue = components["schemas"]["issue"];
type Issue = ApiIssue & { expectedBody: string };

interface Task {
  id: number;
  title: string;
  description: string;
  details?: string;
  testStrategy?: string;
  priority?: string;
  dependencies?: number[];
  status?: string;
  subtasks?: Task[];

  // Added by app logic, not task-master
  requiredBy?: Task[];
}

interface TaskmasterJson {
  master: {
    tasks: Task[];
    metadata: any;
  };
}

// Load complexity report if available
let complexityMap: Record<string, number> = {};
try {
  const complexityData = JSON.parse(fs.readFileSync(COMPLEXITY_PATH, 'utf-8'));
  for (const entry of complexityData.complexityAnalysis) {
    // Map both parent and subtask IDs as string keys
    complexityMap[String(entry.taskId)] = entry.complexityScore;
  }
} catch (e) {
  // If not found or invalid, skip
  complexityMap = {};
}

// Helper to create issue body
function buildIssueBody(task: Task): string {
  let body = '';

  if ('details' in task && task.details) {
    body += `## Details\n${task.details}\n\n`;
  }
  if ('testStrategy' in task && task.testStrategy) {
    body += `## Test Strategy\n${task.testStrategy}\n\n`;
  }
  if ('subtasks' in task && task.subtasks?.length) {
    body += `## Subtasks\n${task.subtasks.map(subtask => `- ${subtask.description}`).join('\n')}\n\n`;
  }

  if ('dependencies' in task && task.dependencies?.length) {
    // Intentionally empty, filled in later after issues are created
    body += `## Dependencies\n\n\n`;
  }

  let meta = ''

  if ('status' in task && task.status) {
    meta += `- Status: \`${task.status}\`\n`;
  }
  if ('priority' in task && task.priority) {
    meta += `- Priority: \`${task.priority}\`\n`;
  }
  if (task.id in complexityMap && complexityMap[task.id]) {
    meta += `- Complexity: \`${complexityMap[task.id]} / 10\`\n`;
  }
  if (task.requiredBy?.length) {
    // Intentially empty, filled in later after issues are created
    meta += `- Required By:\n\n`;
  }

  if (meta) {
    body += `## Meta\n${meta}\n\n`;
  }

  body += UNIQUE_MARKER;
  
  return body;
}

// Helper to find existing issue by title and marker
let allIssuesCache: ApiIssue[] = [];

async function findExistingIssue(title: string): Promise<ApiIssue | null> {
  if (!allIssuesCache.length) {
    const issues = await octokit.issues.listForRepo({
      owner: GITHUB_OWNER!,
      repo: GITHUB_REPO!,
      state: 'all',
      per_page: 100,
    });
    allIssuesCache = issues.data;
  }

  for (const issue of allIssuesCache) {
    if (issue.title === title && issue.body && issue.body.includes(UNIQUE_MARKER)) {
      return issue;
    }
  }
  return null;
}


// Helper to create or get issue
async function createOrGetIssue(task: Task): Promise<Issue> {
  const body = buildIssueBody(task);

  let existingIssue = await findExistingIssue(task.title);
  if (existingIssue) {
    console.log(`Issue already exists for: ${task.title} (#${existingIssue.number})`);
    return {
      ...existingIssue,
      expectedBody: body,
    };
  }

  const res = await octokit.issues.create({
    owner: GITHUB_OWNER!,
    repo: GITHUB_REPO!,
    title: task.title,
    body,
    labels: ['taskmaster'],
  });

  allIssuesCache.push(res.data);
  console.log(`Created issue: ${task.title} (#${res.data.number})`);

  return {
    ...res.data,
    expectedBody: body,
  };
}

// Helper to update issue with dependency links
function updateIssueWithDependencies(body: string, dependencyIssues: Issue[] | undefined): string {
  if (!dependencyIssues?.length) return body;

  const depSection = `## Dependencies\n${dependencyIssues.map(i => `- [${i.state === 'closed' ? 'x' : ' '}] #${i.number}`).join('\n')}\n\n`;

  return body.replace(/## Dependencies[\s\S]+?\n\n/, depSection);
}

// Helper to update issue with dependency links
function updateBodyWithRequiredBy(body: string, requiredByIssues: Issue[] | undefined): string {
  if (!requiredByIssues?.length) return body;
  
  const requiredBySection = `- Required By:\n${requiredByIssues.map(i => `   - [${i.state === 'closed' ? 'x' : ' '}] #${i.number}`).join('\n')}\n`;

  return body.replace(/- Required By:[\s\S]+?\n\n/, requiredBySection);
}

async function getSubIssues(issue: Issue): Promise<ApiIssue[]> {
  const subIssues = await octokit.issues.listSubIssues({
    owner: GITHUB_OWNER!,
    repo: GITHUB_REPO!,
    issue_number: issue.number,
  });
  return subIssues.data;
}

async function main() {
  // Parse JSON
  const raw = fs.readFileSync(TASKS_PATH, 'utf-8');
  const data: TaskmasterJson = JSON.parse(raw);
  const tasks = data.master.tasks;

  // Create issues for all tasks and subtasks
  const idToIssue: Record<string, Issue> = {};

  for (const task of tasks) {
    task.requiredBy = tasks.filter(t => t.dependencies?.find(d => d === task.id));

    const issue = await createOrGetIssue(task);
    idToIssue[`${task.id}`] = issue;
  }

  // Update issues with dependency links
  // For parent tasks
  for (const task of tasks) {
    const issue = idToIssue[`${task.id}`];

    const depIssues = task.dependencies?.map(depId => idToIssue[`${depId}`]).filter(Boolean);
    issue.expectedBody = updateIssueWithDependencies(issue.expectedBody, depIssues);

    const reqByIssues = task.requiredBy?.map(reqBy => idToIssue[`${reqBy.id}`]).filter(Boolean);
    issue.expectedBody = updateBodyWithRequiredBy(issue.expectedBody, reqByIssues);

    if (issue.expectedBody !== issue.body) {
      await octokit.issues.update({
        owner: GITHUB_OWNER!,
        repo: GITHUB_REPO!,
        issue_number: issue.number,
        body: issue.expectedBody,
      });
      console.log(`Updated issue #${issue.number} with dependencies/required-bys.`);
    }
  }

  console.log('All issues created and linked.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}); 