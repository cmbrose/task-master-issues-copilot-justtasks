import { TaskmasterAction } from './main';
import * as fs from 'fs';
import * as path from 'path';

describe('TaskmasterAction - Artifact Management', () => {
  let action: TaskmasterAction;
  let testTempDir: string;

  beforeEach(() => {
    const inputs = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/**.prd.md',
      breakdownMaxDepth: 2,
      taskmasterArgs: ''
    };
    
    action = new TaskmasterAction(inputs);
    testTempDir = path.join(process.cwd(), 'test-artifacts');
    
    // Create test directory
    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  describe('Enhanced Task Graph Creation', () => {
    test('should create enhanced task graph with metadata', async () => {
      const mockTaskGraph = {
        master: {
          tasks: [
            { id: 1, title: 'Task 1', complexity: 5, dependencies: [] },
            { id: 2, title: 'Task 2', complexity: 8, dependencies: [1] }
          ],
          metadata: {
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
            description: 'Test task graph'
          }
        }
      };

      const prdFiles = ['docs/test.prd.md'];
      
      // Mock the private method by calling it through a public interface
      // We would normally test this through the public run() method, but for unit testing
      // we'll test the functionality indirectly through the artifact metadata
      const result = await (action as any).createEnhancedTaskGraph(mockTaskGraph, prdFiles);

      expect(result).toBeDefined();
      expect(result.master).toEqual(mockTaskGraph.master);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.taskCount).toBe(2);
      expect(result.metadata.prdSource).toEqual(prdFiles);
      expect(result.metadata.complexityScores).toEqual({
        min: 5,
        max: 8,
        average: 6.5
      });
      expect(result.metadata.hierarchyDepth).toBe(2);
      expect(result.metadata.generationTimestamp).toBeDefined();
      expect(result.metadata.prdVersion).toBeDefined();
    });

    test('should handle empty task array', async () => {
      const mockTaskGraph = {
        master: {
          tasks: [],
          metadata: {
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
            description: 'Empty task graph'
          }
        }
      };

      const result = await (action as any).createEnhancedTaskGraph(mockTaskGraph, []);

      expect(result.metadata.taskCount).toBe(0);
      expect(result.metadata.complexityScores).toEqual({
        min: 0,
        max: 0,
        average: 0
      });
      expect(result.metadata.hierarchyDepth).toBe(0);
    });
  });

  describe('Complexity Score Calculation', () => {
    test('should calculate complexity scores correctly', () => {
      const tasks = [
        { id: 1, complexity: 3 },
        { id: 2, complexity: 7 },
        { id: 3, complexity: 5 },
        { id: 4, complexity: 9 }
      ];

      const result = (action as any).calculateComplexityScores(tasks);

      expect(result.min).toBe(3);
      expect(result.max).toBe(9);
      expect(result.average).toBe(6);
    });

    test('should handle tasks without complexity scores', () => {
      const tasks = [
        { id: 1 },
        { id: 2, complexity: 5 },
        { id: 3 }
      ];

      const result = (action as any).calculateComplexityScores(tasks);

      expect(result.min).toBe(0);
      expect(result.max).toBe(5);
      expect(result.average).toBe(1.67);
    });
  });

  describe('Hierarchy Depth Calculation', () => {
    test('should calculate hierarchy depth correctly', () => {
      const tasks = [
        { id: 1, dependencies: [] },
        { id: 2, dependencies: [1] },
        { id: 3, dependencies: [2] },
        { id: 4, dependencies: [1] }
      ];

      const result = (action as any).calculateHierarchyDepth(tasks);

      expect(result).toBe(3);
    });

    test('should handle circular dependencies', () => {
      const tasks = [
        { id: 1, dependencies: [2] },
        { id: 2, dependencies: [1] }
      ];

      const result = (action as any).calculateHierarchyDepth(tasks);

      // With circular dependencies, the algorithm should handle it gracefully
      // and return the depth without getting stuck in infinite loops
      expect(result).toBe(1);
    });

    test('should handle tasks with no dependencies', () => {
      const tasks = [
        { id: 1, dependencies: [] },
        { id: 2, dependencies: [] }
      ];

      const result = (action as any).calculateHierarchyDepth(tasks);

      expect(result).toBe(1);
    });
  });

  describe('Artifact Discovery and Validation', () => {
    test('should discover artifacts', async () => {
      const artifacts = await action.discoverArtifacts();

      expect(artifacts).toBeDefined();
      expect(Array.isArray(artifacts)).toBe(true);
      expect(artifacts.length).toBeGreaterThan(0);
      expect(artifacts[0]).toContain('taskmaster-task-graph-');
    });

    test('should validate artifact IDs', async () => {
      const validArtifactId = 'taskmaster-task-graph-2024-01-15T10-30-00';
      const invalidArtifactId = 'invalid-artifact-id';

      const validResult = await action.validateArtifact(validArtifactId);
      const invalidResult = await action.validateArtifact(invalidArtifactId);

      expect(validResult).toBe(true);
      expect(invalidResult).toBe(false);
    });
  });

  describe('Artifact Restoration', () => {
    test('should restore task graph from artifact', async () => {
      const artifactId = 'taskmaster-task-graph-2024-01-15T10-30-00';

      const restoredGraph = await action.restoreFromArtifact(artifactId);

      expect(restoredGraph).toBeDefined();
      expect(restoredGraph.master).toBeDefined();
      expect(restoredGraph.metadata).toBeDefined();
      expect(restoredGraph.metadata.taskCount).toBe(1);
      expect(restoredGraph.metadata.prdVersion).toBe('prd-restored');
    });

    test('should throw error for invalid artifact', async () => {
      const invalidArtifactId = 'invalid-artifact-id';

      await expect(action.restoreFromArtifact(invalidArtifactId)).rejects.toThrow('Invalid artifact');
    });
  });

  describe('Retention Policy', () => {
    test('should parse retention days correctly', () => {
      const parseMethod = (action as any).parseRetentionDays;

      expect(parseMethod('30d')).toBe(30);
      expect(parseMethod('7d')).toBe(7);
      expect(parseMethod('invalid')).toBe(30);
    });

    test('should identify expired artifacts', () => {
      const isExpiredMethod = (action as any).isArtifactExpired;

      // Recent artifact (should not be expired)
      const recentArtifact = `taskmaster-task-graph-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      expect(isExpiredMethod(recentArtifact)).toBe(false);

      // Old artifact (should be expired)
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      const oldArtifact = `taskmaster-task-graph-${oldDate.toISOString().replace(/[:.]/g, '-')}`;
      expect(isExpiredMethod(oldArtifact)).toBe(true);

      // Invalid artifact format
      const invalidArtifact = 'invalid-format';
      expect(isExpiredMethod(invalidArtifact)).toBe(false);
    });
  });

  describe('Artifact Operations Logging', () => {
    test('should log artifact operations', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockTaskGraph = {
        master: {},
        metadata: {
          taskCount: 5,
          complexityScores: { min: 1, max: 8, average: 4.5 },
          hierarchyDepth: 3,
          prdVersion: 'prd-test',
          prdSource: ['test.prd.md'],
          generationTimestamp: '2024-01-01T00:00:00.000Z',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      };

      (action as any).logArtifactOperation('test', 'test-location', mockTaskGraph);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ARTIFACT_LOG]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('test')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-location')
      );

      consoleSpy.mockRestore();
    });
  });
});