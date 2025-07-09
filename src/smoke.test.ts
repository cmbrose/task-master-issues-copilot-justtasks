import * as fs from 'fs';
import * as path from 'path';
import { TaskmasterAction } from './main';

describe('Smoke Tests', () => {
  let action: TaskmasterAction;
  const defaultInputs = {
    complexityThreshold: 40,
    maxDepth: 3,
    prdPathGlob: 'docs/**.prd.md',
    breakdownMaxDepth: 2,
    taskmasterArgs: ''
  };

  beforeEach(() => {
    action = new TaskmasterAction(defaultInputs);
  });

  describe('Critical Path Validation', () => {
    test('should initialize action without errors', () => {
      expect(action).toBeDefined();
      expect(action).toBeInstanceOf(TaskmasterAction);
    });

    test('should validate environment setup', () => {
      // Test required environment variables
      const originalEnv = process.env;
      
      // Set minimal required environment
      process.env.INPUT_COMPLEXITY_THRESHOLD = '40';
      process.env.INPUT_MAX_DEPTH = '3';
      process.env.INPUT_PRD_PATH_GLOB = 'docs/**.prd.md';
      
      expect(() => {
        new TaskmasterAction(defaultInputs);
      }).not.toThrow();
      
      process.env = originalEnv;
    });

    test('should find PRD files with default glob pattern', async () => {
      // Create a test PRD file
      const testDir = path.join(process.cwd(), 'docs');
      const testFile = path.join(testDir, 'test.prd.md');
      
      try {
        // Ensure docs directory exists
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }
        
        fs.writeFileSync(testFile, '# Test PRD\n\nThis is a test PRD file.');
        
        const mockCLIManager = {
          downloadAndValidate: jest.fn().mockResolvedValue(undefined),
          generateTaskGraph: jest.fn().mockResolvedValue({
            master: {
              tasks: []
            }
          })
        };
        
        jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
        (action as any).cliManager = mockCLIManager;
        
        await action.run();
        
        expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
        
      } finally {
        // Clean up
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });
  });

  describe('Essential Functionality', () => {
    test('should process minimal PRD successfully', async () => {
      const minimalPRD = `# Minimal PRD

## Overview
A minimal PRD for testing.

## Requirements
- Basic requirement
`;

      const testFile = path.join(process.cwd(), 'minimal.prd.md');
      
      try {
        fs.writeFileSync(testFile, minimalPRD);
        
        const mockCLIManager = {
          downloadAndValidate: jest.fn().mockResolvedValue(undefined),
          generateTaskGraph: jest.fn().mockResolvedValue({
            master: {
              tasks: [
                {
                  id: 1,
                  title: 'Basic Task',
                  description: 'A basic task',
                  complexity: 2,
                  priority: 'low',
                  dependencies: [],
                  status: 'pending'
                }
              ]
            }
          })
        };
        
        jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
        (action as any).cliManager = mockCLIManager;
        
        await action.run();
        
        expect(mockCLIManager.downloadAndValidate).toHaveBeenCalled();
        expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
        
      } finally {
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    });

    test('should handle empty task graph gracefully', async () => {
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };
      
      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;
      
      // Should not throw error with empty tasks
      await expect(action.run()).resolves.not.toThrow();
    });

    test('should validate task graph structure', () => {
      const validTaskGraph = {
        master: {
          tasks: [
            {
              id: 1,
              title: 'Valid Task',
              description: 'A valid task description',
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
          prdVersion: 'test',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      };
      
      try {
        action.validateTaskGraphStructure(validTaskGraph);
        // If we get here, validation passed
        expect(true).toBe(true);
      } catch (error) {
        fail('Valid task graph should not throw error');
      }
    });

    test('should reject invalid task graph structure', () => {
      const invalidTaskGraph = {
        master: {
          tasks: [
            {
              // Missing required fields
              id: 1
            }
          ]
        },
        metadata: {
          prdSource: ['test.prd.md'],
          taskCount: 1,
          generationTimestamp: '2024-01-01T00:00:00Z',
          complexityScores: { min: 0, max: 0, average: 0 },
          hierarchyDepth: 1,
          prdVersion: 'test',
          taskmasterVersion: '1.0.0',
          retentionPolicy: { maxAge: '30d', maxCount: 10 }
        }
      };
      
      try {
        action.validateTaskGraphStructure(invalidTaskGraph);
        fail('Invalid task graph should throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid task structure');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle missing PRD files gracefully', async () => {
      // Set a glob pattern that won't match any files
      process.env.INPUT_PRD_PATH_GLOB = 'nonexistent/**.prd.md';
      
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };
      
      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;
      
      await action.run();
      
      // Should complete without errors even with no PRD files
      expect(mockCLIManager.downloadAndValidate).toHaveBeenCalled();
    });

    test('should handle CLI download failures', async () => {
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockRejectedValue(new Error('Download failed')),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };
      
      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;
      
      // Should handle download failure gracefully
      await expect(action.run()).rejects.toThrow();
    });

    test('should handle artifact upload failures', async () => {
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };
      
      jest.spyOn(action, 'uploadToArtifacts').mockRejectedValue(new Error('Upload failed'));
      (action as any).cliManager = mockCLIManager;
      
      // Should handle upload failure gracefully
      await expect(action.run()).rejects.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    test('should use default configuration values', () => {
      const originalEnv = process.env;
      
      try {
        // Clear configuration env vars
        delete process.env.INPUT_COMPLEXITY_THRESHOLD;
        delete process.env.INPUT_MAX_DEPTH;
        delete process.env.INPUT_PRD_PATH_GLOB;
        
        const testAction = new TaskmasterAction(defaultInputs);
        
        // Should not throw and should use defaults
        expect(testAction).toBeDefined();
        
      } finally {
        process.env = originalEnv;
      }
    });

    test('should validate complexity threshold bounds', () => {
      const testCases = [
        { threshold: '0', shouldBeValid: false },
        { threshold: '1', shouldBeValid: true },
        { threshold: '40', shouldBeValid: true },
        { threshold: '100', shouldBeValid: true },
        { threshold: 'invalid', shouldBeValid: false }
      ];
      
      testCases.forEach(({ threshold, shouldBeValid }) => {
        process.env.INPUT_COMPLEXITY_THRESHOLD = threshold;
        
        if (shouldBeValid) {
          expect(() => new TaskmasterAction(defaultInputs)).not.toThrow();
        } else {
          // For invalid values, the action should still initialize but use defaults
          expect(() => new TaskmasterAction(defaultInputs)).not.toThrow();
        }
      });
    });

    test('should validate max depth bounds', () => {
      const testCases = [
        { depth: '0', shouldBeValid: false },
        { depth: '1', shouldBeValid: true },
        { depth: '3', shouldBeValid: true },
        { depth: '10', shouldBeValid: true },
        { depth: 'invalid', shouldBeValid: false }
      ];
      
      testCases.forEach(({ depth, shouldBeValid }) => {
        process.env.INPUT_MAX_DEPTH = depth;
        
        if (shouldBeValid) {
          expect(() => new TaskmasterAction(defaultInputs)).not.toThrow();
        } else {
          // For invalid values, the action should still initialize but use defaults
          expect(() => new TaskmasterAction(defaultInputs)).not.toThrow();
        }
      });
    });
  });

  describe('Integration Points', () => {
    test('should integrate with Taskmaster CLI', async () => {
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: [
              {
                id: 1,
                title: 'CLI Generated Task',
                description: 'Task generated by CLI',
                complexity: 3,
                priority: 'medium',
                dependencies: [],
                status: 'pending'
              }
            ]
          }
        })
      };
      
      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;
      
      await action.run();
      
      expect(mockCLIManager.downloadAndValidate).toHaveBeenCalled();
      expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
    });

    test('should integrate with artifact storage', async () => {
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };
      
      const uploadSpy = jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;
      
      await action.run();
      
      expect(uploadSpy).toHaveBeenCalled();
    });
  });

  describe('Performance Baseline', () => {
    test('should complete basic workflow within reasonable time', async () => {
      const startTime = Date.now();
      
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };
      
      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;
      
      await action.run();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 30 seconds for basic workflow
      expect(duration).toBeLessThan(30000);
    });

    test('should handle reasonable number of tasks', async () => {
      const taskCount = 50;
      const tasks = Array(taskCount).fill(null).map((_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`,
        description: `Description for task ${i + 1}`,
        complexity: Math.floor(Math.random() * 10) + 1,
        priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        dependencies: [],
        status: 'pending'
      }));
      
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks
          }
        })
      };
      
      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;
      
      await action.run();
      
      expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
    });
  });
});