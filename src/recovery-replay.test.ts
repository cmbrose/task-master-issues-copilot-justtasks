import * as fs from 'fs';
import * as path from 'path';

// Mock external dependencies before importing
jest.mock('@actions/core', () => ({
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}));

jest.mock('@actions/artifact', () => ({
  DefaultArtifactClient: jest.fn().mockImplementation(() => ({
    uploadArtifact: jest.fn(),
    downloadArtifact: jest.fn()
  }))
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn()
}));

jest.mock('path', () => ({
  join: jest.fn(),
  dirname: jest.fn()
}));

jest.mock('./cli-manager', () => ({
  TaskmasterCLIManager: jest.fn(),
  DEFAULT_CLI_CONFIG: {}
}));

// Now import the module under test
import { TaskmasterAction } from './main';

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('Recovery and Replay Functionality', () => {
  let action: TaskmasterAction;
  let mockInputs: any;

  beforeEach(() => {
    mockInputs = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/**.prd.md',
      breakdownMaxDepth: 2,
      taskmasterArgs: ''
    };

    action = new TaskmasterAction(mockInputs);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Enhanced Artifact Download', () => {
    test('should download and validate artifact from URL', async () => {
      const mockArtifactUrl = 'https://example.com/artifact.json';
      const mockArtifactData = JSON.stringify({
        master: {
          tasks: [
            {
              id: 1,
              title: 'Test Task',
              description: 'Test description',
              complexity: 5,
              priority: 'medium',
              dependencies: [],
              status: 'pending'
            }
          ],
          metadata: {
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            description: 'Test task graph'
          }
        },
        metadata: {
          prdSource: ['docs/test.prd.md'],
          taskCount: 1,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 5, max: 5, average: 5 },
          hierarchyDepth: 1,
          prdVersion: 'test-version',
          taskmasterVersion: '1.0.0',
          retentionPolicy: {
            maxAge: '30d',
            maxCount: 10
          }
        }
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(mockArtifactData),
        status: 200,
        statusText: 'OK'
      } as any);

      const result = await action.downloadFromArtifactUrl(mockArtifactUrl);

      expect(result).toBeDefined();
      expect(result.master.tasks).toHaveLength(1);
      expect(result.master.tasks[0].title).toBe('Test Task');
      expect(result.metadata.taskCount).toBe(1);
    });

    test('should handle download failures with retries', async () => {
      const mockArtifactUrl = 'https://example.com/artifact.json';

      // Mock fetch to fail twice then succeed
      global.fetch = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(JSON.stringify({
            master: {
              tasks: [{ id: 1, title: 'Test Task' }],
              metadata: {}
            },
            metadata: {
              prdSource: [],
              taskCount: 1,
              generationTimestamp: '2024-01-01T00:00:00Z',
              complexityScores: { min: 1, max: 1, average: 1 },
              hierarchyDepth: 1,
              prdVersion: 'test',
              taskmasterVersion: '1.0.0',
              retentionPolicy: { maxAge: '30d', maxCount: 10 }
            }
          }))
        } as any);

      const result = await action.downloadFromArtifactUrl(mockArtifactUrl, { maxRetries: 3 });

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('should validate checksum when provided', async () => {
      const mockArtifactUrl = 'https://example.com/artifact.json';
      const mockArtifactData = JSON.stringify({
        master: { tasks: [], metadata: {} },
        metadata: {
          prdSource: [],
          taskCount: 0,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 0, max: 0, average: 0 },
          hierarchyDepth: 0,
          prdVersion: 'test',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      });

      // Calculate expected checksum
      const crypto = require('crypto');
      const expectedChecksum = crypto.createHash('sha256').update(mockArtifactData).digest('hex');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(mockArtifactData)
      } as any);

      const result = await action.downloadFromArtifactUrl(mockArtifactUrl, {
        validateChecksum: true,
        expectedChecksum: expectedChecksum
      });

      expect(result).toBeDefined();
    });

    test('should fail checksum validation with wrong checksum', async () => {
      const mockArtifactUrl = 'https://example.com/artifact.json';
      const mockArtifactData = JSON.stringify({
        master: { tasks: [], metadata: {} },
        metadata: {
          prdSource: [],
          taskCount: 0,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 0, max: 0, average: 0 },
          hierarchyDepth: 0,
          prdVersion: 'test',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(mockArtifactData)
      } as any);

      await expect(action.downloadFromArtifactUrl(mockArtifactUrl, {
        validateChecksum: true,
        expectedChecksum: 'wrong-checksum'
      })).rejects.toThrow('Checksum validation failed');
    });
  });

  describe('Error Handling and Rate Limiting', () => {
    test('should categorize rate limit errors correctly', async () => {
      const rateLimitError = {
        status: 403,
        message: 'API rate limit exceeded',
        headers: {
          'retry-after': '60'
        }
      };

      // Access private method for testing
      const categorizeError = (action as any).categorizeError;
      const category = categorizeError(rateLimitError);

      expect(category.type).toBe('rate_limit');
      expect(category.retryable).toBe(true);
      expect(category.retryDelay).toBeGreaterThan(0);
    });

    test('should categorize network errors correctly', async () => {
      const networkError = {
        code: 'ECONNRESET',
        message: 'Connection reset'
      };

      const categorizeError = (action as any).categorizeError;
      const category = categorizeError(networkError);

      expect(category.type).toBe('network');
      expect(category.retryable).toBe(true);
      expect(category.maxRetries).toBe(5);
    });

    test('should categorize validation errors correctly', async () => {
      const validationError = {
        status: 422,
        message: 'Validation failed'
      };

      const categorizeError = (action as any).categorizeError;
      const category = categorizeError(validationError);

      expect(category.type).toBe('validation');
      expect(category.retryable).toBe(false);
      expect(category.maxRetries).toBe(0);
    });

    test('should retry operations with exponential backoff', async () => {
      let attemptCount = 0;
      const mockOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve('success');
      });

      const executeWithRetry = (action as any).executeWithRetry.bind(action);
      const result = await executeWithRetry(mockOperation, 'Test operation', 3);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Idempotency System', () => {
    test('should detect content changes', async () => {
      const title = 'Test Issue';
      const body1 = 'Original content';
      const body2 = 'Updated content';

      const isContentChanged = (action as any).isIssueContentChanged.bind(action);

      // First call should return true (new content)
      const changed1 = await isContentChanged(title, body1);
      expect(changed1).toBe(true);

      // Second call with same content should return false
      const changed2 = await isContentChanged(title, body1);
      expect(changed2).toBe(false);

      // Third call with different content should return true
      const changed3 = await isContentChanged(title, body2);
      expect(changed3).toBe(true);
    });

    test('should generate consistent content hashes', async () => {
      const generateContentHash = (action as any).generateContentHash.bind(action);

      const hash1 = generateContentHash('same content');
      const hash2 = generateContentHash('same content');
      const hash3 = generateContentHash('different content');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    test('should load and save content hashes', async () => {
      const mockHashData = {
        'Test Issue 1': 'hash1',
        'Test Issue 2': 'hash2'
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockHashData));
      mockFs.writeFileSync.mockImplementation();
      mockFs.mkdirSync.mockImplementation();
      mockPath.dirname.mockReturnValue('/test/state');

      const loadExistingContentHashes = (action as any).loadExistingContentHashes.bind(action);
      const saveContentHashes = (action as any).saveContentHashes.bind(action);

      await loadExistingContentHashes();
      
      // Verify hashes were loaded
      const issueContentHashes = (action as any).issueContentHashes;
      expect(issueContentHashes.get('Test Issue 1')).toBe('hash1');
      expect(issueContentHashes.get('Test Issue 2')).toBe('hash2');

      await saveContentHashes();

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('Task Graph Validation', () => {
    test('should validate task graph structure', async () => {
      const validTaskGraph = {
        master: {
          tasks: [
            { id: 1, title: 'Task 1', description: 'Description' },
            { id: 2, title: 'Task 2', description: 'Description' }
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

      const validateTaskGraphStructure = (action as any).validateTaskGraphStructure.bind(action);
      
      // Should not throw for valid structure
      expect(() => validateTaskGraphStructure(validTaskGraph)).not.toThrow();
    });

    test('should reject invalid task graph structure', async () => {
      const invalidTaskGraph1 = {
        master: {
          tasks: [
            { id: 1 }, // Missing title
            { title: 'Task 2' } // Missing id
          ],
          metadata: {}
        },
        metadata: {}
      };

      const invalidTaskGraph2 = {
        // Missing master
        metadata: {}
      };

      const validateTaskGraphStructure = (action as any).validateTaskGraphStructure.bind(action);
      
      expect(() => validateTaskGraphStructure(invalidTaskGraph1)).toThrow();
      expect(() => validateTaskGraphStructure(invalidTaskGraph2)).toThrow();
    });

    test('should transform legacy format to enhanced format', async () => {
      const legacyFormat = {
        tasks: [
          { id: 1, title: 'Task 1' },
          { id: 2, title: 'Task 2' }
        ],
        metadata: {
          created: '2024-01-01T00:00:00Z',
          prdFiles: ['docs/test.prd.md']
        }
      };

      const transformToEnhancedTaskGraph = (action as any).transformToEnhancedTaskGraph.bind(action);
      const result = transformToEnhancedTaskGraph(legacyFormat);

      expect(result.master.tasks).toHaveLength(2);
      expect(result.metadata.taskCount).toBe(2);
      expect(result.metadata.prdSource).toEqual(['docs/test.prd.md']);
    });
  });

  describe('Replay Functionality', () => {
    test('should restore task graph from artifact with retries', async () => {
      const mockArtifactId = 'taskmaster-task-graph-2024-01-15T10-30-00';

      // Mock validateArtifact to return true
      jest.spyOn(action, 'validateArtifact').mockResolvedValue(true);

      const result = await action.restoreFromArtifact(mockArtifactId);

      expect(result).toBeDefined();
      expect(result.master.tasks).toHaveLength(1);
      expect(result.metadata.taskCount).toBe(1);
    });

    test('should handle invalid artifact during restore', async () => {
      const mockArtifactId = 'invalid-artifact-id';

      // Mock validateArtifact to return false
      jest.spyOn(action, 'validateArtifact').mockResolvedValue(false);

      try {
        await action.restoreFromArtifact(mockArtifactId);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Invalid artifact: invalid-artifact-id');
      }
    });
  });

  describe('Integration with Enhanced Features', () => {
    test('should use enhanced run method with error handling', async () => {
      // Mock dependencies
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({ tasks: [], metadata: {} })
      };

      (action as any).cliManager = mockCLIManager;

      // Mock file system operations
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue('{}');
      mockFs.writeFileSync.mockImplementation();
      mockFs.mkdirSync.mockImplementation();

      // Mock other methods
      jest.spyOn(action as any, 'findPRDFiles').mockResolvedValue(['docs/test.prd.md']);
      jest.spyOn(action as any, 'createEnhancedTaskGraph').mockResolvedValue({
        master: { tasks: [], metadata: {} },
        metadata: {
          prdSource: [],
          taskCount: 0,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 0, max: 0, average: 0 },
          hierarchyDepth: 0,
          prdVersion: 'test',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      });
      jest.spyOn(action, 'saveTaskGraph').mockResolvedValue(undefined);
      jest.spyOn(action as any, 'uploadToArtifacts').mockResolvedValue('http://artifact-url');
      jest.spyOn(action, 'setOutputs').mockImplementation();

      // Should complete without throwing
      await expect(action.run()).resolves.not.toThrow();

      // Verify enhanced features were used
      expect(mockCLIManager.downloadAndValidate).toHaveBeenCalled();
      expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
    });
  });
});