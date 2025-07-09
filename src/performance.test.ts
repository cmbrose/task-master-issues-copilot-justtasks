import * as fs from 'fs';
import * as path from 'path';
import { TaskmasterAction } from './main';

describe('Performance Tests', () => {
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

  describe('5-minute Runtime Requirement', () => {
    test('should process 1000-line PRD within 5 minutes', async () => {
      const startTime = Date.now();
      const maxDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      // Create a large PRD file for testing
      const largePRD = createLargePRD(1000);
      const testPRDPath = path.join(process.cwd(), 'test-large.prd.md');
      
      try {
        fs.writeFileSync(testPRDPath, largePRD);
        
        // Mock the CLI manager and other dependencies
        const mockCLIManager = {
          downloadAndValidate: jest.fn().mockResolvedValue(undefined),
          generateTaskGraph: jest.fn().mockResolvedValue({
            master: {
              tasks: generateMockTasks(50) // Simulate 50 tasks from 1000-line PRD
            }
          })
        };
        
        // Mock the GitHub API calls
        jest.spyOn(action as any, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
        jest.spyOn(action, 'saveTaskGraph').mockResolvedValue(undefined);
        jest.spyOn(action, 'setOutputs').mockImplementation();
        
        // Set up action with mocked dependencies
        (action as any).cliManager = mockCLIManager;
        
        // Run the action
        await action.run();
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(maxDuration);
        console.log(`Large PRD processing completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
        
      } finally {
        // Clean up test file
        if (fs.existsSync(testPRDPath)) {
          fs.unlinkSync(testPRDPath);
        }
      }
    }, 6 * 60 * 1000); // 6 minute timeout to allow for 5 minute test
  });

  describe('Load Testing', () => {
    test('should handle multiple PRD files efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple PRD files of varying sizes
      const testFiles = [
        { name: 'small.prd.md', size: 100 },
        { name: 'medium.prd.md', size: 500 },
        { name: 'large.prd.md', size: 1000 }
      ];
      
      try {
        // Create test files
        testFiles.forEach(file => {
          const content = createLargePRD(file.size);
          fs.writeFileSync(path.join(process.cwd(), file.name), content);
        });
        
        // Mock CLI manager to simulate task generation
        const mockCLIManager = {
          downloadAndValidate: jest.fn().mockResolvedValue(undefined),
          generateTaskGraph: jest.fn().mockResolvedValue({
            master: {
              tasks: generateMockTasks(20)
            }
          })
        };
        
        jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
        (action as any).cliManager = mockCLIManager;
        
        await action.run();
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Should complete within reasonable time for multiple files
        expect(duration).toBeLessThan(3 * 60 * 1000); // 3 minutes
        console.log(`Multiple PRD processing completed in ${duration}ms`);
        
      } finally {
        // Clean up test files
        testFiles.forEach(file => {
          const filePath = path.join(process.cwd(), file.name);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
    }, 4 * 60 * 1000); // 4 minute timeout
  });

  describe('Memory Usage', () => {
    test('should maintain reasonable memory usage during processing', async () => {
      const initialMemory = process.memoryUsage();
      
      // Process a large PRD
      const largePRD = createLargePRD(1000);
      const testPRDPath = path.join(process.cwd(), 'test-memory.prd.md');
      
      try {
        fs.writeFileSync(testPRDPath, largePRD);
        
        const mockCLIManager = {
          downloadAndValidate: jest.fn().mockResolvedValue(undefined),
          generateTaskGraph: jest.fn().mockResolvedValue({
            master: {
              tasks: generateMockTasks(100)
            }
          })
        };
        
        jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
        (action as any).cliManager = mockCLIManager;
        
        await action.run();
        
        const finalMemory = process.memoryUsage();
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        
        // Memory increase should be reasonable (less than 100MB)
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        
      } finally {
        if (fs.existsSync(testPRDPath)) {
          fs.unlinkSync(testPRDPath);
        }
      }
    });
  });

  describe('Concurrent Processing', () => {
    test('should handle concurrent requests efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple actions running concurrently
      const actions = Array(3).fill(null).map(() => {
        const testAction = new TaskmasterAction(defaultInputs);
        
        const mockCLIManager = {
          downloadAndValidate: jest.fn().mockResolvedValue(undefined),
          generateTaskGraph: jest.fn().mockResolvedValue({
            master: {
              tasks: generateMockTasks(10)
            }
          })
        };
        
        jest.spyOn(testAction, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
        (testAction as any).cliManager = mockCLIManager;
        
        return testAction;
      });
      
      // Run all actions concurrently
      const promises = actions.map(action => action.run());
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(60 * 1000); // 1 minute
      console.log(`Concurrent processing completed in ${duration}ms`);
    });
  });
});

// Helper functions
function createLargePRD(lines: number): string {
  const header = `# Large PRD for Performance Testing

## Overview
This is a large PRD file generated for performance testing purposes.

## Requirements
`;

  const requirements = Array(Math.floor(lines / 10)).fill(null).map((_, i) => 
    `- Requirement ${i + 1}: This is a detailed requirement that describes functionality that needs to be implemented.`
  ).join('\n');

  const sections = `

## Technical Details
This section contains technical implementation details.

## Architecture
System architecture and design patterns.

## API Specifications
Detailed API documentation and specifications.

## Database Schema
Database design and schema definitions.

## Security Considerations
Security requirements and implementation guidelines.

## Performance Requirements
Performance benchmarks and optimization guidelines.

## Testing Strategy
Comprehensive testing approach and methodology.

## Deployment Process
Deployment procedures and environment setup.

## Monitoring and Logging
Monitoring setup and logging configuration.
`;

  const content = header + requirements + sections;
  
  // Pad with additional content to reach target line count
  const currentLines = content.split('\n').length;
  const additionalLines = lines - currentLines;
  
  if (additionalLines > 0) {
    const padding = Array(additionalLines).fill('// Additional content for line count padding').join('\n');
    return content + '\n' + padding;
  }
  
  return content;
}

function generateMockTasks(count: number): any[] {
  return Array(count).fill(null).map((_, i) => ({
    id: i + 1,
    title: `Task ${i + 1}`,
    description: `Description for task ${i + 1}`,
    complexity: Math.floor(Math.random() * 10) + 1,
    priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
    dependencies: i > 0 ? [Math.floor(Math.random() * i) + 1] : [],
    status: 'pending'
  }));
}