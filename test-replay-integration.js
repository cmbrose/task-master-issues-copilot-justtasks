#!/usr/bin/env node
/**
 * Integration test script for the Recovery and Replay Workflow
 * This script demonstrates the key features of the replay system
 */

const { TaskmasterAction } = require('./src/main.js');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  inputs: {
    complexityThreshold: 40,
    maxDepth: 3,
    prdPathGlob: 'docs/**.prd.md',
    breakdownMaxDepth: 2,
    taskmasterArgs: ''
  },
  testArtifactUrl: 'https://example.com/test-artifact.json',
  testArtifactId: 'taskmaster-task-graph-2024-01-15T10-30-00'
};

// Mock artifact data
const MOCK_ARTIFACT_DATA = {
  master: {
    tasks: [
      {
        id: 1,
        title: 'Implement User Authentication',
        description: 'Create a comprehensive user authentication system with OAuth2 support',
        complexity: 8,
        priority: 'high',
        dependencies: [],
        status: 'pending'
      },
      {
        id: 2,
        title: 'Setup Database Schema',
        description: 'Design and implement the database schema for user management',
        complexity: 6,
        priority: 'high',
        dependencies: [1],
        status: 'pending'
      },
      {
        id: 3,
        title: 'Create API Endpoints',
        description: 'Develop RESTful API endpoints for authentication',
        complexity: 7,
        priority: 'medium',
        dependencies: [1, 2],
        status: 'pending'
      }
    ],
    metadata: {
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      description: 'Authentication system tasks',
      complexityThreshold: 40,
      maxDepth: 3,
      prdFiles: ['docs/auth-system.prd.md'],
      tasksTotal: 3,
      tasksFiltered: 3
    }
  },
  metadata: {
    prdSource: ['docs/auth-system.prd.md'],
    taskCount: 3,
    generationTimestamp: '2024-01-01T00:00:00Z',
    complexityScores: { min: 6, max: 8, average: 7 },
    hierarchyDepth: 3,
    prdVersion: 'v1.0.0',
    taskmasterVersion: '1.0.0',
    retentionPolicy: {
      maxAge: '30d',
      maxCount: 10
    }
  }
};

class ReplayIntegrationTest {
  constructor() {
    this.action = new TaskmasterAction(TEST_CONFIG.inputs);
    this.testResults = [];
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 Running test: ${testName}`);
    console.log('='.repeat(50));
    
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      
      console.log(`✅ Test passed in ${duration}ms`);
      this.testResults.push({ name: testName, status: 'PASSED', duration });
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
    }
  }

  async testArtifactDownload() {
    // Mock fetch for testing
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(MOCK_ARTIFACT_DATA))
      })
    );

    const result = await this.action.downloadFromArtifactUrl(
      TEST_CONFIG.testArtifactUrl,
      { validateChecksum: false }
    );

    console.log(`Downloaded artifact with ${result.metadata.taskCount} tasks`);
    console.log(`PRD Version: ${result.metadata.prdVersion}`);
    console.log(`Complexity range: ${result.metadata.complexityScores.min}-${result.metadata.complexityScores.max}`);
    
    if (result.metadata.taskCount !== 3) {
      throw new Error(`Expected 3 tasks, got ${result.metadata.taskCount}`);
    }
  }

  async testChecksumValidation() {
    const crypto = require('crypto');
    const artifactData = JSON.stringify(MOCK_ARTIFACT_DATA);
    const expectedChecksum = crypto.createHash('sha256').update(artifactData).digest('hex');

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(artifactData)
      })
    );

    const result = await this.action.downloadFromArtifactUrl(
      TEST_CONFIG.testArtifactUrl,
      { 
        validateChecksum: true,
        expectedChecksum: expectedChecksum
      }
    );

    console.log(`Checksum validation passed: ${expectedChecksum.substring(0, 16)}...`);
    
    if (!result || result.metadata.taskCount !== 3) {
      throw new Error('Checksum validation failed');
    }
  }

  async testErrorHandling() {
    const testErrors = [
      { status: 403, message: 'API rate limit exceeded' },
      { code: 'ECONNRESET', message: 'Connection reset' },
      { status: 422, message: 'Validation failed' }
    ];

    for (const error of testErrors) {
      const categorizeError = this.action.categorizeError.bind(this.action);
      const category = categorizeError(error);
      
      console.log(`Error ${error.status || error.code}: ${category.type} (retryable: ${category.retryable})`);
      
      if (error.status === 403 && category.type !== 'rate_limit') {
        throw new Error('Rate limit error not categorized correctly');
      }
    }
  }

  async testIdempotency() {
    const testTitle = 'Test Issue';
    const testBody1 = 'Original content';
    const testBody2 = 'Updated content';

    const isContentChanged = this.action.isIssueContentChanged.bind(this.action);

    // First call should return true (new content)
    const changed1 = await isContentChanged(testTitle, testBody1);
    console.log(`New content detected: ${changed1}`);

    // Second call with same content should return false
    const changed2 = await isContentChanged(testTitle, testBody1);
    console.log(`Unchanged content detected: ${changed2}`);

    // Third call with different content should return true
    const changed3 = await isContentChanged(testTitle, testBody2);
    console.log(`Changed content detected: ${changed3}`);

    if (!changed1 || changed2 || !changed3) {
      throw new Error('Idempotency system not working correctly');
    }
  }

  async testRetryMechanism() {
    let attemptCount = 0;
    const maxRetries = 3;

    const testOperation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      return 'success';
    };

    const executeWithRetry = this.action.executeWithRetry.bind(this.action);
    const result = await executeWithRetry(testOperation, 'Test operation', maxRetries);

    console.log(`Operation succeeded after ${attemptCount} attempts`);
    console.log(`Result: ${result}`);

    if (result !== 'success' || attemptCount !== 3) {
      throw new Error('Retry mechanism not working correctly');
    }
  }

  async testTaskGraphValidation() {
    const validTaskGraph = {
      master: {
        tasks: [
          { id: 1, title: 'Task 1', description: 'Valid task' },
          { id: 2, title: 'Task 2', description: 'Another valid task' }
        ],
        metadata: {}
      },
      metadata: {
        prdSource: [],
        taskCount: 2,
        generationTimestamp: '2024-01-01T00:00:00Z',
        complexityScores: { min: 1, max: 5, average: 3 },
        hierarchyDepth: 1,
        prdVersion: 'test',
        taskmasterVersion: '1.0.0',
        retentionPolicy: { maxAge: '30d', maxCount: 10 }
      }
    };

    const invalidTaskGraph = {
      master: {
        tasks: [
          { id: 1 }, // Missing title
          { title: 'Task 2' } // Missing id
        ],
        metadata: {}
      },
      metadata: {}
    };

    const validateTaskGraphStructure = this.action.validateTaskGraphStructure.bind(this.action);

    // Valid task graph should pass
    validateTaskGraphStructure(validTaskGraph);
    console.log('Valid task graph passed validation');

    // Invalid task graph should fail
    try {
      validateTaskGraphStructure(invalidTaskGraph);
      throw new Error('Invalid task graph should have failed validation');
    } catch (error) {
      console.log('Invalid task graph correctly rejected');
    }
  }

  async testArtifactRestore() {
    const testArtifactId = TEST_CONFIG.testArtifactId;
    
    // Mock validateArtifact to return true for our test
    const originalValidateArtifact = this.action.validateArtifact;
    this.action.validateArtifact = async () => true;

    const result = await this.action.restoreFromArtifact(testArtifactId);

    console.log(`Restored artifact: ${testArtifactId}`);
    console.log(`Task count: ${result.metadata.taskCount}`);
    console.log(`PRD version: ${result.metadata.prdVersion}`);

    // Restore original method
    this.action.validateArtifact = originalValidateArtifact;

    if (!result || !result.master || !result.metadata) {
      throw new Error('Artifact restore failed');
    }
  }

  async testContentHashing() {
    const generateContentHash = this.action.generateContentHash.bind(this.action);

    const content1 = 'Test content';
    const content2 = 'Test content'; // Same content
    const content3 = 'Different content';

    const hash1 = generateContentHash(content1);
    const hash2 = generateContentHash(content2);
    const hash3 = generateContentHash(content3);

    console.log(`Hash 1: ${hash1}`);
    console.log(`Hash 2: ${hash2}`);
    console.log(`Hash 3: ${hash3}`);

    if (hash1 !== hash2) {
      throw new Error('Same content should produce same hash');
    }

    if (hash1 === hash3) {
      throw new Error('Different content should produce different hash');
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Recovery and Replay Integration Tests');
    console.log('=' .repeat(70));

    // Mock Jest functions for testing
    global.jest = {
      fn: (impl) => {
        const mockFn = impl || (() => {});
        mockFn.mockResolvedValue = (value) => {
          mockFn.mockImplementation = () => Promise.resolve(value);
          return mockFn;
        };
        return mockFn;
      }
    };

    await this.runTest('Artifact Download', () => this.testArtifactDownload());
    await this.runTest('Checksum Validation', () => this.testChecksumValidation());
    await this.runTest('Error Handling', () => this.testErrorHandling());
    await this.runTest('Idempotency System', () => this.testIdempotency());
    await this.runTest('Retry Mechanism', () => this.testRetryMechanism());
    await this.runTest('Task Graph Validation', () => this.testTaskGraphValidation());
    await this.runTest('Artifact Restore', () => this.testArtifactRestore());
    await this.runTest('Content Hashing', () => this.testContentHashing());

    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('=' .repeat(50));

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    const total = this.testResults.length;

    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.status === 'FAILED')
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }

    console.log('\n📋 All Test Results:');
    this.testResults.forEach(r => {
      const status = r.status === 'PASSED' ? '✅' : '❌';
      const duration = r.duration ? ` (${r.duration}ms)` : '';
      console.log(`  ${status} ${r.name}${duration}`);
    });

    if (failed === 0) {
      console.log('\n🎉 All tests passed! Recovery and Replay Workflow is working correctly.');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Please review the errors above.`);
      process.exit(1);
    }
  }
}

// Run the integration tests
if (require.main === module) {
  const test = new ReplayIntegrationTest();
  test.runAllTests().catch(error => {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  });
}

module.exports = { ReplayIntegrationTest };