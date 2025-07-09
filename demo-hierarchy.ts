#!/usr/bin/env node

import { IssueHierarchyManager } from './src/issue-hierarchy';
import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

dotenv.config();

async function demonstrateHierarchyFeatures() {
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
  } as any;

  const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');

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
}

// Run the demonstration
demonstrateHierarchyFeatures().catch(console.error);