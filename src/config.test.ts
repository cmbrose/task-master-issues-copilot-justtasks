import { TaskmasterAction } from './main';

describe('Basic Configuration Tests', () => {
  const defaultInputs = {
    complexityThreshold: 40,
    maxDepth: 3,
    prdPathGlob: 'docs/**.prd.md',
    breakdownMaxDepth: 2,
    taskmasterArgs: ''
  };

  describe('Configuration Validation', () => {
    test('should accept valid configuration', () => {
      const validConfigs = [
        { ...defaultInputs, complexityThreshold: 10 },
        { ...defaultInputs, complexityThreshold: 100 },
        { ...defaultInputs, maxDepth: 1 },
        { ...defaultInputs, maxDepth: 10 },
        { ...defaultInputs, prdPathGlob: '**/*.prd.md' },
        { ...defaultInputs, breakdownMaxDepth: 1 },
        { ...defaultInputs, breakdownMaxDepth: 5 },
        { ...defaultInputs, taskmasterArgs: '--verbose --debug' }
      ];

      validConfigs.forEach(config => {
        expect(() => new TaskmasterAction(config)).not.toThrow();
      });
    });

    test('should handle edge case configurations', () => {
      const edgeCases = [
        { ...defaultInputs, complexityThreshold: 1 },
        { ...defaultInputs, maxDepth: 1 },
        { ...defaultInputs, prdPathGlob: '*.md' },
        { ...defaultInputs, breakdownMaxDepth: 0 },
        { ...defaultInputs, taskmasterArgs: '' }
      ];

      edgeCases.forEach(config => {
        expect(() => new TaskmasterAction(config)).not.toThrow();
      });
    });

    test('should validate task graph structure correctly', () => {
      const action = new TaskmasterAction(defaultInputs);
      
      const validGraph = {
        master: {
          tasks: [
            {
              id: 1,
              title: 'Test Task',
              description: 'A test task',
              complexity: 5,
              priority: 'medium',
              dependencies: [],
              status: 'pending'
            }
          ]
        },
        metadata: {
          prdSource: ['test.prd.md'],
          taskCount: 1,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 5, max: 5, average: 5 },
          hierarchyDepth: 1,
          prdVersion: 'test-v1',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      };

      expect(() => action.validateTaskGraphStructure(validGraph)).not.toThrow();
    });

    test('should reject invalid task graph structure', () => {
      const action = new TaskmasterAction(defaultInputs);
      
      const invalidGraphs = [
        // Missing metadata
        {
          master: {
            tasks: [{ id: 1, title: 'Test' }]
          }
        },
        // Missing master
        {
          metadata: {
            prdSource: ['test.prd.md'],
            taskCount: 1,
            generationTimestamp: '2024-01-01T00:00:00Z',
            complexityScores: { min: 5, max: 5, average: 5 },
            hierarchyDepth: 1,
            prdVersion: 'test-v1',
            taskmasterVersion: '1.0.0',
            retentionPolicy: { maxAge: '30d', maxCount: 10 }
          }
        },
        // Tasks not array
        {
          master: {
            tasks: 'not an array'
          },
          metadata: {
            prdSource: ['test.prd.md'],
            taskCount: 1,
            generationTimestamp: '2024-01-01T00:00:00Z',
            complexityScores: { min: 5, max: 5, average: 5 },
            hierarchyDepth: 1,
            prdVersion: 'test-v1',
            taskmasterVersion: '1.0.0',
            retentionPolicy: { maxAge: '30d', maxCount: 10 }
          }
        },
        // Task missing required fields
        {
          master: {
            tasks: [{ id: 1 }] // Missing title
          },
          metadata: {
            prdSource: ['test.prd.md'],
            taskCount: 1,
            generationTimestamp: '2024-01-01T00:00:00Z',
            complexityScores: { min: 5, max: 5, average: 5 },
            hierarchyDepth: 1,
            prdVersion: 'test-v1',
            taskmasterVersion: '1.0.0',
            retentionPolicy: { maxAge: '30d', maxCount: 10 }
          }
        }
      ];

      invalidGraphs.forEach(graph => {
        expect(() => action.validateTaskGraphStructure(graph as any)).toThrow();
      });
    });
  });

  describe('Error Categorization', () => {
    test('should categorize errors correctly', () => {
      const action = new TaskmasterAction(defaultInputs);
      
      // Test rate limit error
      const rateLimitError = { status: 403, message: 'API rate limit exceeded' };
      const rateLimitCategory = (action as any).categorizeError(rateLimitError);
      expect(rateLimitCategory.type).toBe('rate_limit');
      expect(rateLimitCategory.retryable).toBe(true);
      expect(rateLimitCategory.maxRetries).toBe(10);

      // Test network error
      const networkError = { code: 'ECONNRESET', message: 'Connection reset' };
      const networkCategory = (action as any).categorizeError(networkError);
      expect(networkCategory.type).toBe('network');
      expect(networkCategory.retryable).toBe(true);
      expect(networkCategory.maxRetries).toBe(5);

      // Test validation error
      const validationError = { status: 422, message: 'Validation failed' };
      const validationCategory = (action as any).categorizeError(validationError);
      expect(validationCategory.type).toBe('validation');
      expect(validationCategory.retryable).toBe(false);
      expect(validationCategory.maxRetries).toBe(0);

      // Test authentication error
      const authError = { status: 401, message: 'Unauthorized' };
      const authCategory = (action as any).categorizeError(authError);
      expect(authCategory.type).toBe('authentication');
      expect(authCategory.retryable).toBe(false);
      expect(authCategory.maxRetries).toBe(0);

      // Test invalid artifact error
      const artifactError = { message: 'Invalid artifact: abc123' };
      const artifactCategory = (action as any).categorizeError(artifactError);
      expect(artifactCategory.type).toBe('invalid_artifact');
      expect(artifactCategory.retryable).toBe(false);
      expect(artifactCategory.maxRetries).toBe(0);

      // Test unknown error
      const unknownError = { message: 'Something went wrong' };
      const unknownCategory = (action as any).categorizeError(unknownError);
      expect(unknownCategory.type).toBe('unknown');
      expect(unknownCategory.retryable).toBe(true);
      expect(unknownCategory.maxRetries).toBe(3);
    });
  });

  describe('Basic Functionality', () => {
    test('should initialize without errors', () => {
      expect(() => new TaskmasterAction(defaultInputs)).not.toThrow();
    });

    test('should handle empty task graph', () => {
      const action = new TaskmasterAction(defaultInputs);
      
      const emptyGraph = {
        master: {
          tasks: []
        },
        metadata: {
          prdSource: ['test.prd.md'],
          taskCount: 0,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 0, max: 0, average: 0 },
          hierarchyDepth: 0,
          prdVersion: 'test-v1',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      };

      // Should not throw, but should warn about no tasks
      expect(() => action.validateTaskGraphStructure(emptyGraph)).not.toThrow();
    });

    test('should validate configuration parameters', () => {
      const configs = [
        { ...defaultInputs, complexityThreshold: 0 }, // Should work
        { ...defaultInputs, complexityThreshold: -1 }, // Should work (will be handled)
        { ...defaultInputs, maxDepth: 0 }, // Should work
        { ...defaultInputs, breakdownMaxDepth: 0 } // Should work
      ];

      configs.forEach(config => {
        expect(() => new TaskmasterAction(config)).not.toThrow();
      });
    });
  });

  describe('Performance Characteristics', () => {
    test('should initialize quickly', () => {
      const start = Date.now();
      const action = new TaskmasterAction(defaultInputs);
      const end = Date.now();
      
      expect(end - start).toBeLessThan(100); // Should initialize in < 100ms
      expect(action).toBeDefined();
    });

    test('should handle reasonable number of tasks in validation', () => {
      const action = new TaskmasterAction(defaultInputs);
      
      // Create a graph with many tasks
      const tasks = Array(100).fill(null).map((_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`,
        description: `Description for task ${i + 1}`,
        complexity: (i % 10) + 1,
        priority: ['low', 'medium', 'high'][i % 3],
        dependencies: i > 0 ? [Math.floor(i / 2) + 1] : [],
        status: 'pending'
      }));

      const largeGraph = {
        master: { tasks },
        metadata: {
          prdSource: ['test.prd.md'],
          taskCount: 100,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 1, max: 10, average: 5.5 },
          hierarchyDepth: 3,
          prdVersion: 'test-v1',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      };

      const start = Date.now();
      expect(() => action.validateTaskGraphStructure(largeGraph)).not.toThrow();
      const end = Date.now();
      
      expect(end - start).toBeLessThan(1000); // Should validate in < 1 second
    });
  });
});