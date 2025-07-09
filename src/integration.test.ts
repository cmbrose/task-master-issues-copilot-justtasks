import { TaskmasterAction } from './main';
import * as fs from 'fs';
import * as path from 'path';

describe('TaskmasterAction - Integration Tests', () => {
  let testDir: string;
  
  beforeEach(() => {
    testDir = path.join(process.cwd(), 'test-integration');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should create task graph file with proper structure', async () => {
    const inputs = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/**.prd.md',
      breakdownMaxDepth: 2,
      taskmasterArgs: ''
    };

    const action = new TaskmasterAction(inputs);
    
    const mockTaskGraph = {
      master: {
        tasks: [
          {
            id: 1,
            title: 'Integration Test Task',
            description: 'Test task for integration testing',
            complexity: 5,
            priority: 'medium',
            dependencies: [],
            status: 'pending'
          }
        ],
        metadata: {
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
          description: 'Integration test task graph',
          complexityThreshold: 40,
          maxDepth: 3,
          prdFiles: ['docs/test.prd.md'],
          tasksTotal: 1,
          tasksFiltered: 1
        }
      }
    };

    const enhancedTaskGraph = await (action as any).createEnhancedTaskGraph(mockTaskGraph, ['docs/test.prd.md']);
    await action.saveTaskGraph(enhancedTaskGraph);

    // Verify the file was created
    const taskGraphPath = path.join('.taskmaster', 'tasks', 'task-graph.json');
    expect(fs.existsSync(taskGraphPath)).toBe(true);

    // Verify the content
    const savedContent = JSON.parse(fs.readFileSync(taskGraphPath, 'utf8'));
    expect(savedContent).toHaveProperty('master');
    expect(savedContent).toHaveProperty('metadata');
    expect(savedContent.metadata).toHaveProperty('taskCount', 1);
    expect(savedContent.metadata).toHaveProperty('complexityScores');
    expect(savedContent.metadata).toHaveProperty('hierarchyDepth');
    expect(savedContent.metadata).toHaveProperty('prdVersion');
    expect(savedContent.metadata).toHaveProperty('generationTimestamp');
    expect(savedContent.metadata).toHaveProperty('retentionPolicy');

    // Cleanup
    if (fs.existsSync('.taskmaster')) {
      fs.rmSync('.taskmaster', { recursive: true, force: true });
    }
  });

  test('should handle workflow with replay functionality', async () => {
    const inputs = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/**.prd.md',
      breakdownMaxDepth: 2,
      taskmasterArgs: ''
    };

    const action = new TaskmasterAction(inputs);
    
    // Test artifact discovery
    const artifacts = await action.discoverArtifacts();
    expect(artifacts).toBeDefined();
    expect(artifacts.length).toBeGreaterThan(0);

    // Test artifact validation
    const validArtifact = artifacts[0];
    const isValid = await action.validateArtifact(validArtifact);
    expect(isValid).toBe(true);

    // Test artifact restoration
    const restoredGraph = await action.restoreFromArtifact(validArtifact);
    expect(restoredGraph).toBeDefined();
    expect(restoredGraph.master).toBeDefined();
    expect(restoredGraph.metadata).toBeDefined();

    // Test saving restored graph
    await action.saveTaskGraph(restoredGraph);
    const taskGraphPath = path.join('.taskmaster', 'tasks', 'task-graph.json');
    expect(fs.existsSync(taskGraphPath)).toBe(true);

    // Cleanup
    if (fs.existsSync('.taskmaster')) {
      fs.rmSync('.taskmaster', { recursive: true, force: true });
    }
  });

  test('should handle cleanup of expired artifacts', async () => {
    const inputs = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/**.prd.md',
      breakdownMaxDepth: 2,
      taskmasterArgs: ''
    };

    const action = new TaskmasterAction(inputs);
    
    // Mock console.log to capture cleanup logs
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Test cleanup functionality
    await action.cleanupExpiredArtifacts();
    
    // Verify cleanup was attempted
    expect(consoleSpy).toHaveBeenCalledWith('Cleaning up expired artifacts...');
    expect(consoleSpy).toHaveBeenCalledWith('Artifact cleanup completed');
    
    consoleSpy.mockRestore();
  });

  test('should validate artifact metadata structure', async () => {
    const inputs = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/**.prd.md',
      breakdownMaxDepth: 2,
      taskmasterArgs: ''
    };

    const action = new TaskmasterAction(inputs);
    
    const mockTaskGraph = {
      master: {
        tasks: [
          { id: 1, title: 'Test Task 1', complexity: 3, dependencies: [] },
          { id: 2, title: 'Test Task 2', complexity: 7, dependencies: [1] },
          { id: 3, title: 'Test Task 3', complexity: 5, dependencies: [2] }
        ],
        metadata: {
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
          description: 'Test task graph'
        }
      }
    };

    const prdFiles = ['docs/test1.prd.md', 'docs/test2.prd.md'];
    const enhancedTaskGraph = await (action as any).createEnhancedTaskGraph(mockTaskGraph, prdFiles);

    // Validate metadata structure
    expect(enhancedTaskGraph.metadata).toHaveProperty('prdSource', prdFiles);
    expect(enhancedTaskGraph.metadata).toHaveProperty('taskCount', 3);
    expect(enhancedTaskGraph.metadata).toHaveProperty('generationTimestamp');
    expect(enhancedTaskGraph.metadata).toHaveProperty('complexityScores');
    expect(enhancedTaskGraph.metadata.complexityScores).toHaveProperty('min', 3);
    expect(enhancedTaskGraph.metadata.complexityScores).toHaveProperty('max', 7);
    expect(enhancedTaskGraph.metadata.complexityScores).toHaveProperty('average', 5);
    expect(enhancedTaskGraph.metadata).toHaveProperty('hierarchyDepth', 3);
    expect(enhancedTaskGraph.metadata).toHaveProperty('prdVersion');
    expect(enhancedTaskGraph.metadata).toHaveProperty('taskmasterVersion');
    expect(enhancedTaskGraph.metadata).toHaveProperty('retentionPolicy');
    expect(enhancedTaskGraph.metadata.retentionPolicy).toHaveProperty('maxAge');
    expect(enhancedTaskGraph.metadata.retentionPolicy).toHaveProperty('maxCount');
  });
});