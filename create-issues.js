"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const rest_1 = require("@octokit/rest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
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
const octokit = new rest_1.Octokit({ auth: GITHUB_TOKEN });
const TASKS_PATH = path.join('.taskmaster', 'tasks', 'tasks.json');
const COMPLEXITY_PATH = path.join('.taskmaster', 'reports', 'task-complexity-report.json');
const UNIQUE_MARKER = '<!-- created-by-taskmaster-script -->';
// Load complexity report if available
let complexityMap = {};
try {
    const complexityData = JSON.parse(fs.readFileSync(COMPLEXITY_PATH, 'utf-8'));
    for (const entry of complexityData.complexityAnalysis) {
        // Map both parent and subtask IDs as string keys
        complexityMap[String(entry.taskId)] = entry.complexityScore;
    }
}
catch (e) {
    // If not found or invalid, skip
    complexityMap = {};
}
// Helper to create issue body
function buildIssueBody(task) {
    var _a, _b, _c;
    let body = '';
    if ('details' in task && task.details) {
        body += `## Details\n${task.details}\n\n`;
    }
    if ('testStrategy' in task && task.testStrategy) {
        body += `## Test Strategy\n${task.testStrategy}\n\n`;
    }
    if ('subtasks' in task && ((_a = task.subtasks) === null || _a === void 0 ? void 0 : _a.length)) {
        body += `## Subtasks\n${task.subtasks.map(subtask => `- ${subtask.description}`).join('\n')}\n\n`;
    }
    if ('dependencies' in task && ((_b = task.dependencies) === null || _b === void 0 ? void 0 : _b.length)) {
        // Intentionally empty, filled in later after issues are created
        body += `## Dependencies\n\n\n`;
    }
    let meta = '';
    if ('status' in task && task.status) {
        meta += `- Status: \`${task.status}\`\n`;
    }
    if ('priority' in task && task.priority) {
        meta += `- Priority: \`${task.priority}\`\n`;
    }
    if (task.id in complexityMap && complexityMap[task.id]) {
        meta += `- Complexity: \`${complexityMap[task.id]} / 10\`\n`;
    }
    if ((_c = task.requiredBy) === null || _c === void 0 ? void 0 : _c.length) {
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
let allIssuesCache = [];
function findExistingIssue(title) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!allIssuesCache.length) {
            const issues = yield octokit.issues.listForRepo({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
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
    });
}
// Helper to create or get issue
function createOrGetIssue(task) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = buildIssueBody(task);
        let existingIssue = yield findExistingIssue(task.title);
        if (existingIssue) {
            console.log(`Issue already exists for: ${task.title} (#${existingIssue.number})`);
            return Object.assign(Object.assign({}, existingIssue), { expectedBody: body });
        }
        const res = yield octokit.issues.create({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            title: task.title,
            body,
            labels: ['taskmaster'],
        });
        allIssuesCache.push(res.data);
        console.log(`Created issue: ${task.title} (#${res.data.number})`);
        return Object.assign(Object.assign({}, res.data), { expectedBody: body });
    });
}
// Helper to update issue with dependency links
function updateIssueWithDependencies(body, dependencyIssues) {
    if (!(dependencyIssues === null || dependencyIssues === void 0 ? void 0 : dependencyIssues.length))
        return body;
    const depSection = `## Dependencies\n${dependencyIssues.map(i => `- [${i.state === 'closed' ? 'x' : ' '}] #${i.number}`).join('\n')}\n\n`;
    return body.replace(/## Dependencies[\s\S]+?\n\n/, depSection);
}
// Helper to update issue with dependency links
function updateBodyWithRequiredBy(body, requiredByIssues) {
    if (!(requiredByIssues === null || requiredByIssues === void 0 ? void 0 : requiredByIssues.length))
        return body;
    const requiredBySection = `- Required By:\n${requiredByIssues.map(i => `   - [${i.state === 'closed' ? 'x' : ' '}] #${i.number}`).join('\n')}\n`;
    return body.replace(/- Required By:[\s\S]+?\n\n/, requiredBySection);
}
function getSubIssues(issue) {
    return __awaiter(this, void 0, void 0, function* () {
        const subIssues = yield octokit.issues.listSubIssues({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            issue_number: issue.number,
        });
        return subIssues.data;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        // Parse JSON
        const raw = fs.readFileSync(TASKS_PATH, 'utf-8');
        const data = JSON.parse(raw);
        const tasks = data.master.tasks;
        // Create issues for all tasks and subtasks
        const idToIssue = {};
        for (const task of tasks) {
            task.requiredBy = tasks.filter(t => { var _a; return (_a = t.dependencies) === null || _a === void 0 ? void 0 : _a.find(d => d === task.id); });
            const issue = yield createOrGetIssue(task);
            idToIssue[`${task.id}`] = issue;
        }
        // Update issues with dependency links
        // For parent tasks
        for (const task of tasks) {
            const issue = idToIssue[`${task.id}`];
            const depIssues = (_a = task.dependencies) === null || _a === void 0 ? void 0 : _a.map(depId => idToIssue[`${depId}`]).filter(Boolean);
            issue.expectedBody = updateIssueWithDependencies(issue.expectedBody, depIssues);
            const reqByIssues = (_b = task.requiredBy) === null || _b === void 0 ? void 0 : _b.map(reqBy => idToIssue[`${reqBy.id}`]).filter(Boolean);
            issue.expectedBody = updateBodyWithRequiredBy(issue.expectedBody, reqByIssues);
            if (issue.expectedBody !== issue.body) {
                yield octokit.issues.update({
                    owner: GITHUB_OWNER,
                    repo: GITHUB_REPO,
                    issue_number: issue.number,
                    body: issue.expectedBody,
                });
                console.log(`Updated issue #${issue.number} with dependencies/required-bys.`);
            }
        }
        console.log('All issues created and linked.');
    });
}
main().catch(e => {
    console.error(e);
    process.exit(1);
});
