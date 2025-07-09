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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var rest_1 = require("@octokit/rest");
var fs = require("fs");
var path = require("path");
var dotenv = require("dotenv");
// Types for Node.js globals (process, etc.)
// If you see type errors, run: npm install --save-dev @types/node
dotenv.config();
var GITHUB_TOKEN = process.env.GITHUB_TOKEN;
var GITHUB_OWNER = process.env.GITHUB_OWNER;
var GITHUB_REPO = process.env.GITHUB_REPO;
if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO in environment variables.');
    process.exit(1);
}
var octokit = new rest_1.Octokit({ auth: GITHUB_TOKEN });
var TASKS_PATH = path.join('.taskmaster', 'tasks', 'tasks.json');
var COMPLEXITY_PATH = path.join('.taskmaster', 'reports', 'task-complexity-report.json');
var UNIQUE_MARKER = '<!-- created-by-taskmaster-script -->';
// Load complexity report if available
var complexityMap = {};
try {
    var complexityData = JSON.parse(fs.readFileSync(COMPLEXITY_PATH, 'utf-8'));
    for (var _i = 0, _a = complexityData.complexityAnalysis; _i < _a.length; _i++) {
        var entry = _a[_i];
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
    var body = '';
    if ('details' in task && task.details) {
        body += "## Details\n".concat(task.details, "\n\n");
    }
    if ('testStrategy' in task && task.testStrategy) {
        body += "## Test Strategy\n".concat(task.testStrategy, "\n\n");
    }
    if ('subtasks' in task && ((_a = task.subtasks) === null || _a === void 0 ? void 0 : _a.length)) {
        body += "## Subtasks\n".concat(task.subtasks.map(function (subtask) { return "- ".concat(subtask.description); }).join('\n'), "\n\n");
    }
    if ('dependencies' in task && ((_b = task.dependencies) === null || _b === void 0 ? void 0 : _b.length)) {
        // Intentionally empty, filled in later after issues are created
        body += "## Dependencies\n\n\n";
    }
    var meta = '';
    if ('status' in task && task.status) {
        meta += "- Status: `".concat(task.status, "`\n");
    }
    if ('priority' in task && task.priority) {
        meta += "- Priority: `".concat(task.priority, "`\n");
    }
    if (task.id in complexityMap && complexityMap[task.id]) {
        meta += "- Complexity: `".concat(complexityMap[task.id], " / 10`\n");
    }
    if ((_c = task.requiredBy) === null || _c === void 0 ? void 0 : _c.length) {
        // Intentially empty, filled in later after issues are created
        meta += "- Required By:\n\n";
    }
    if (meta) {
        body += "## Meta\n".concat(meta, "\n\n");
    }
    body += UNIQUE_MARKER;
    return body;
}
// Helper to find existing issue by title and marker
var allIssuesCache = [];
function findExistingIssue(title) {
    return __awaiter(this, void 0, void 0, function () {
        var issues, _i, allIssuesCache_1, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!allIssuesCache.length) return [3 /*break*/, 2];
                    return [4 /*yield*/, octokit.issues.listForRepo({
                            owner: GITHUB_OWNER,
                            repo: GITHUB_REPO,
                            state: 'all',
                            per_page: 100,
                        })];
                case 1:
                    issues = _a.sent();
                    allIssuesCache = issues.data;
                    _a.label = 2;
                case 2:
                    for (_i = 0, allIssuesCache_1 = allIssuesCache; _i < allIssuesCache_1.length; _i++) {
                        issue = allIssuesCache_1[_i];
                        if (issue.title === title && issue.body && issue.body.includes(UNIQUE_MARKER)) {
                            return [2 /*return*/, issue];
                        }
                    }
                    return [2 /*return*/, null];
            }
        });
    });
}
// Helper to create or get issue
function createOrGetIssue(task) {
    return __awaiter(this, void 0, void 0, function () {
        var body, existingIssue, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    body = buildIssueBody(task);
                    return [4 /*yield*/, findExistingIssue(task.title)];
                case 1:
                    existingIssue = _a.sent();
                    if (existingIssue) {
                        console.log("Issue already exists for: ".concat(task.title, " (#").concat(existingIssue.number, ")"));
                        return [2 /*return*/, __assign(__assign({}, existingIssue), { expectedBody: body })];
                    }
                    return [4 /*yield*/, octokit.issues.create({
                            owner: GITHUB_OWNER,
                            repo: GITHUB_REPO,
                            title: task.title,
                            body: body,
                            labels: ['taskmaster'],
                        })];
                case 2:
                    res = _a.sent();
                    allIssuesCache.push(res.data);
                    console.log("Created issue: ".concat(task.title, " (#").concat(res.data.number, ")"));
                    return [2 /*return*/, __assign(__assign({}, res.data), { expectedBody: body })];
            }
        });
    });
}
// Helper to update issue with dependency links
function updateIssueWithDependencies(body, dependencyIssues) {
    if (!(dependencyIssues === null || dependencyIssues === void 0 ? void 0 : dependencyIssues.length))
        return body;
    var depSection = "## Dependencies\n".concat(dependencyIssues.map(function (i) { return "- [".concat(i.state === 'closed' ? 'x' : ' ', "] #").concat(i.number); }).join('\n'), "\n\n");
    return body.replace(/## Dependencies[\s\S]+?\n\n/, depSection);
}
// Helper to update issue with dependency links
function updateBodyWithRequiredBy(body, requiredByIssues) {
    if (!(requiredByIssues === null || requiredByIssues === void 0 ? void 0 : requiredByIssues.length))
        return body;
    var requiredBySection = "- Required By:\n".concat(requiredByIssues.map(function (i) { return "   - [".concat(i.state === 'closed' ? 'x' : ' ', "] #").concat(i.number); }).join('\n'), "\n");
    return body.replace(/- Required By:[\s\S]+?\n\n/, requiredBySection);
}
function getSubIssues(issue) {
    return __awaiter(this, void 0, void 0, function () {
        var subIssues;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, octokit.issues.listSubIssues({
                        owner: GITHUB_OWNER,
                        repo: GITHUB_REPO,
                        issue_number: issue.number,
                    })];
                case 1:
                    subIssues = _a.sent();
                    return [2 /*return*/, subIssues.data];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var raw, data, tasks, idToIssue, _loop_1, _i, tasks_1, task, _a, tasks_2, task, issue, depIssues, reqByIssues;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    raw = fs.readFileSync(TASKS_PATH, 'utf-8');
                    data = JSON.parse(raw);
                    tasks = data.master.tasks;
                    idToIssue = {};
                    _loop_1 = function (task) {
                        var issue;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    task.requiredBy = tasks.filter(function (t) { var _a; return (_a = t.dependencies) === null || _a === void 0 ? void 0 : _a.find(function (d) { return d === task.id; }); });
                                    return [4 /*yield*/, createOrGetIssue(task)];
                                case 1:
                                    issue = _e.sent();
                                    idToIssue["".concat(task.id)] = issue;
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, tasks_1 = tasks;
                    _d.label = 1;
                case 1:
                    if (!(_i < tasks_1.length)) return [3 /*break*/, 4];
                    task = tasks_1[_i];
                    return [5 /*yield**/, _loop_1(task)];
                case 2:
                    _d.sent();
                    _d.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    _a = 0, tasks_2 = tasks;
                    _d.label = 5;
                case 5:
                    if (!(_a < tasks_2.length)) return [3 /*break*/, 8];
                    task = tasks_2[_a];
                    issue = idToIssue["".concat(task.id)];
                    depIssues = (_b = task.dependencies) === null || _b === void 0 ? void 0 : _b.map(function (depId) { return idToIssue["".concat(depId)]; }).filter(Boolean);
                    issue.expectedBody = updateIssueWithDependencies(issue.expectedBody, depIssues);
                    reqByIssues = (_c = task.requiredBy) === null || _c === void 0 ? void 0 : _c.map(function (reqBy) { return idToIssue["".concat(reqBy.id)]; }).filter(Boolean);
                    issue.expectedBody = updateBodyWithRequiredBy(issue.expectedBody, reqByIssues);
                    if (!(issue.expectedBody !== issue.body)) return [3 /*break*/, 7];
                    return [4 /*yield*/, octokit.issues.update({
                            owner: GITHUB_OWNER,
                            repo: GITHUB_REPO,
                            issue_number: issue.number,
                            body: issue.expectedBody,
                        })];
                case 6:
                    _d.sent();
                    console.log("Updated issue #".concat(issue.number, " with dependencies/required-bys."));
                    _d.label = 7;
                case 7:
                    _a++;
                    return [3 /*break*/, 5];
                case 8:
                    console.log('All issues created and linked.');
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (e) {
    console.error(e);
    process.exit(1);
});
