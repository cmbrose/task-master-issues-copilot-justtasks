import { TaskmasterCLIManager, DEFAULT_CLI_CONFIG } from '../src/cli-manager';
import * as fs from 'fs';
import * as path from 'path';

describe('TaskmasterCLIManager', () => {
  let cliManager: TaskmasterCLIManager;
  const testDir = path.join(__dirname, 'test-output');

  beforeEach(() => {
    cliManager = new TaskmasterCLIManager(DEFAULT_CLI_CONFIG);
    
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should download and validate CLI binary', async () => {
    await expect(cliManager.downloadAndValidate()).resolves.not.toThrow();
  });

  test('should parse CLI output correctly', () => {
    const mockOutput = JSON.stringify({
      tasks: [
        {
          id: 1,
          title: 'Test Task',
          description: 'Test task description',
          complexity: 5
        }
      ]
    });

    const result = cliManager.parseOutput(mockOutput);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe(1);
    expect(result.tasks[0].title).toBe('Test Task');
  });

  test('should throw error for invalid CLI output', () => {
    const invalidOutput = '{"invalid": "structure"}';
    
    expect(() => {
      cliManager.parseOutput(invalidOutput);
    }).toThrow('Invalid output format: missing tasks array');
  });

  test('should throw error for empty CLI output', () => {
    expect(() => {
      cliManager.parseOutput('');
    }).toThrow('CLI output is empty');
  });

  test('should throw error for malformed JSON', () => {
    const malformedOutput = '{"tasks": [{"id": 1, "title": "Test"}'; // Missing closing brackets
    
    expect(() => {
      cliManager.parseOutput(malformedOutput);
    }).toThrow('Failed to parse CLI output');
  });

  test('should validate task structure', () => {
    const invalidTaskOutput = JSON.stringify({
      tasks: [
        {
          id: 1,
          title: 'Test Task'
          // Missing description
        }
      ]
    });
    
    expect(() => {
      cliManager.parseOutput(invalidTaskOutput);
    }).toThrow('Invalid task structure: missing required fields in task 1');
  });

  test('should validate task ID types', () => {
    const invalidTaskOutput = JSON.stringify({
      tasks: [
        {
          id: 'not-a-number',
          title: 'Test Task',
          description: 'Test description'
        }
      ]
    });
    
    expect(() => {
      cliManager.parseOutput(invalidTaskOutput);
    }).toThrow('Invalid task ID: not-a-number must be a number');
  });

  test('should validate dependency types', () => {
    const invalidTaskOutput = JSON.stringify({
      tasks: [
        {
          id: 1,
          title: 'Test Task',
          description: 'Test description',
          dependencies: ['not-a-number']
        }
      ]
    });
    
    expect(() => {
      cliManager.parseOutput(invalidTaskOutput);
    }).toThrow('Invalid dependency ID: not-a-number must be a number');
  });

  test('should filter tasks by complexity threshold', async () => {
    await cliManager.downloadAndValidate();
    
    const options = {
      complexityThreshold: 10,
      maxDepth: 3,
      prdPathGlob: 'docs/*.prd.md',
      breakdownMaxDepth: 2,
      additionalArgs: []
    };

    const taskGraph = await cliManager.generateTaskGraph(['docs/sample.prd.md'], options);
    
    expect(taskGraph.master.tasks).toBeDefined();
    expect(taskGraph.master.metadata.complexityThreshold).toBe(10);
    
    // All tasks should have complexity <= 10
    taskGraph.master.tasks.forEach((task: any) => {
      expect(task.complexity || 0).toBeLessThanOrEqual(10);
    });
  });

  test('should include metadata in task graph', async () => {
    await cliManager.downloadAndValidate();
    
    const options = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/*.prd.md',
      breakdownMaxDepth: 2,
      additionalArgs: []
    };

    const taskGraph = await cliManager.generateTaskGraph(['docs/sample.prd.md'], options);
    
    expect(taskGraph.master.metadata).toBeDefined();
    expect(taskGraph.master.metadata.complexityThreshold).toBe(40);
    expect(taskGraph.master.metadata.maxDepth).toBe(3);
    expect(taskGraph.master.metadata.prdFiles).toContain('docs/sample.prd.md');
    expect(taskGraph.master.metadata.created).toBeDefined();
    expect(taskGraph.master.metadata.updated).toBeDefined();
    expect(taskGraph.master.metadata.tasksTotal).toBeDefined();
    expect(taskGraph.master.metadata.tasksFiltered).toBeDefined();
  });

  test('should handle empty PRD files array', async () => {
    await cliManager.downloadAndValidate();
    
    const options = {
      complexityThreshold: 40,
      maxDepth: 3,
      prdPathGlob: 'docs/*.prd.md',
      breakdownMaxDepth: 2,
      additionalArgs: []
    };

    await expect(cliManager.generateTaskGraph([], options)).rejects.toThrow('No PRD files provided');
  });

  test('should validate options', async () => {
    await cliManager.downloadAndValidate();
    
    const invalidOptions = {
      complexityThreshold: -1,
      maxDepth: 3,
      prdPathGlob: 'docs/*.prd.md',
      breakdownMaxDepth: 2,
      additionalArgs: []
    };

    await expect(cliManager.generateTaskGraph(['docs/sample.prd.md'], invalidOptions)).rejects.toThrow('Complexity threshold must be non-negative');
  });

  test('should validate max depth', async () => {
    await cliManager.downloadAndValidate();
    
    const invalidOptions = {
      complexityThreshold: 40,
      maxDepth: 0,
      prdPathGlob: 'docs/*.prd.md',
      breakdownMaxDepth: 2,
      additionalArgs: []
    };

    await expect(cliManager.generateTaskGraph(['docs/sample.prd.md'], invalidOptions)).rejects.toThrow('Max depth must be at least 1');
  });
});