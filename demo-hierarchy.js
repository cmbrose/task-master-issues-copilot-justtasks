#!/usr/bin/env node
"use strict";
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
const issue_hierarchy_1 = require("./src/issue-hierarchy");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function demonstrateHierarchyFeatures() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('=== Issue Hierarchy and Dependency Management Demo ===\n');
        // Create a mock Octokit instance for demonstration
        const mockOctokit = {
            issues: {
                get: jest.fn(),
                addLabels: jest.fn(),
                removeLabel: jest.fn(),
                createComment: jest.fn(),
                listForRepo: jest.fn(),
                update: jest.fn()
            }
        };
        const hierarchyManager = new issue_hierarchy_1.IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
        // 1. Demonstrate YAML front-matter parsing
        console.log('1. YAML Front-matter Parsing:');
        const issueBodyWithYAML = `---
id: 1
title: "Implement User Authentication"
dependencies: [2, 3]
priority: high
status: pending
complexity: 8
---

## Details
Implement a comprehensive user authentication system with JWT tokens.

## Test Strategy
- Unit tests for authentication functions
- Integration tests for login flow
- Security testing for token validation`;
        const parsed = hierarchyManager.parseYAMLFrontMatter(issueBodyWithYAML);
        console.log('Parsed metadata:', JSON.stringify(parsed.metadata, null, 2));
        console.log('Parsed body preview:', parsed.body.substring(0, 100) + '...\n');
        // 2. Demonstrate YAML front-matter generation
        console.log('2. YAML Front-matter Generation:');
        const metadata = {
            id: 5,
            title: 'Database Schema Design',
            dependencies: [1, 2],
            priority: 'medium',
            status: 'pending',
            complexity: 6
        };
        const generatedYAML = hierarchyManager.generateYAMLFrontMatter(metadata);
        console.log('Generated YAML front-matter:');
        console.log(generatedYAML);
        // 3. Demonstrate dependency analysis
        console.log('3. Dependency Analysis:');
        console.log('Example workflow:');
        console.log('- Issue #1 depends on Issues #2 and #3');
        console.log('- If Issues #2 and #3 are open → Issue #1 is blocked');
        console.log('- If Issues #2 and #3 are closed → Issue #1 is unblocked');
        console.log('- When Issue #1 is closed → All issues depending on #1 are checked\n');
        // 4. Demonstrate error handling
        console.log('4. Error Handling:');
        console.log('- YAML parsing errors are caught and logged');
        console.log('- Sub-issues API failures fallback to comments');
        console.log('- All GitHub API calls have comprehensive error handling\n');
        // 5. Demonstrate integration points
        console.log('5. Integration Points:');
        console.log('- create-issues.ts: Enhanced with YAML front-matter and blocked status');
        console.log('- handleIssueClosure(): New function for webhook integration');
        console.log('- Sub-issues API: Creates proper parent-child relationships');
        console.log('- Fallback mechanisms: Graceful degradation when APIs are unavailable\n');
        console.log('=== Demo Complete ===');
    });
}
// Run the demonstration
demonstrateHierarchyFeatures().catch(console.error);
