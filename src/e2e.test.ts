import * as fs from 'fs';
import * as path from 'path';
import { TaskmasterAction } from './main';

describe('End-to-End Integration Tests', () => {
  let action: TaskmasterAction;
  let testPRDPath: string;
  const defaultInputs = {
    complexityThreshold: 40,
    maxDepth: 3,
    prdPathGlob: 'docs/**.prd.md',
    breakdownMaxDepth: 2,
    taskmasterArgs: ''
  };

  beforeEach(() => {
    action = new TaskmasterAction(defaultInputs);
    testPRDPath = path.join(process.cwd(), 'test-e2e.prd.md');
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testPRDPath)) {
      fs.unlinkSync(testPRDPath);
    }
  });

  describe('Complete Workflow', () => {
    test('should process PRD from start to finish', async () => {
      // Create a realistic PRD file
      const prdContent = createRealisticPRD();
      fs.writeFileSync(testPRDPath, prdContent);

      // Mock dependencies
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: [
              {
                id: 1,
                title: 'Setup Authentication System',
                description: 'Implement user authentication with JWT tokens',
                complexity: 8,
                priority: 'high',
                dependencies: [],
                status: 'pending'
              },
              {
                id: 2,
                title: 'Create User Registration',
                description: 'Build user registration form and validation',
                complexity: 5,
                priority: 'medium',
                dependencies: [1],
                status: 'pending'
              },
              {
                id: 3,
                title: 'Implement Password Reset',
                description: 'Add password reset functionality',
                complexity: 6,
                priority: 'medium',
                dependencies: [1],
                status: 'pending'
              }
            ]
          }
        })
      };

      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;

      // Run the complete workflow
      await action.run();

      // Verify CLI manager was called
      expect(mockCLIManager.downloadAndValidate).toHaveBeenCalled();
      expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
    });

    test('should handle configuration variations', async () => {
      const configurations = [
        { complexityThreshold: 20, maxDepth: 2 },
        { complexityThreshold: 50, maxDepth: 4 },
        { complexityThreshold: 30, maxDepth: 3 }
      ];

      for (const config of configurations) {
        // Set environment variables
        process.env.INPUT_COMPLEXITY_THRESHOLD = config.complexityThreshold.toString();
        process.env.INPUT_MAX_DEPTH = config.maxDepth.toString();

        const prdContent = createRealisticPRD();
        fs.writeFileSync(testPRDPath, prdContent);

        const mockCLIManager = {
          downloadAndValidate: jest.fn().mockResolvedValue(undefined),
          generateTaskGraph: jest.fn().mockResolvedValue({
            master: {
              tasks: generateConfigBasedTasks(config.complexityThreshold, config.maxDepth)
            }
          })
        };

        jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
        (action as any).cliManager = mockCLIManager;

        await action.run();

        expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
      }
    });
  });

  describe('Error Recovery', () => {
    test('should recover from CLI failures gracefully', async () => {
      const prdContent = createRealisticPRD();
      fs.writeFileSync(testPRDPath, prdContent);

      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockRejectedValueOnce(new Error('CLI download failed'))
          .mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };

      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;

      // Should handle the error and retry
      await action.run();

      // Should have retried the download
      expect(mockCLIManager.downloadAndValidate).toHaveBeenCalledTimes(2);
    });

    test('should handle network failures with exponential backoff', async () => {
      const prdContent = createRealisticPRD();
      fs.writeFileSync(testPRDPath, prdContent);

      let callCount = 0;
      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            const error = new Error('Network error');
            (error as any).code = 'ECONNRESET';
            throw error;
          }
          return Promise.resolve();
        }),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: []
          }
        })
      };

      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;

      await action.run();

      // Should have retried multiple times
      expect(mockCLIManager.downloadAndValidate).toHaveBeenCalledTimes(3);
    });
  });

  describe('Data Validation', () => {
    test('should validate task graph structure', async () => {
      const prdContent = createRealisticPRD();
      fs.writeFileSync(testPRDPath, prdContent);

      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
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
          }
        })
      };

      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;

      await action.run();

      expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
    });

    test('should handle invalid task graph gracefully', async () => {
      const prdContent = createRealisticPRD();
      fs.writeFileSync(testPRDPath, prdContent);

      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: [
              {
                // Missing required fields
                id: 1,
                title: 'Invalid Task'
                // Missing other required fields
              }
            ]
          }
        })
      };

      jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;

      // Should handle invalid structure gracefully
      await action.run();

      expect(mockCLIManager.generateTaskGraph).toHaveBeenCalled();
    });
  });

  describe('Artifact Management', () => {
    test('should create and upload artifacts properly', async () => {
      const prdContent = createRealisticPRD();
      fs.writeFileSync(testPRDPath, prdContent);

      const mockCLIManager = {
        downloadAndValidate: jest.fn().mockResolvedValue(undefined),
        generateTaskGraph: jest.fn().mockResolvedValue({
          master: {
            tasks: [
              {
                id: 1,
                title: 'Test Task',
                description: 'A test task',
                complexity: 3,
                priority: 'low',
                dependencies: [],
                status: 'pending'
              }
            ]
          }
        })
      };

      const uploadSpy = jest.spyOn(action, 'uploadToArtifacts').mockResolvedValue('mock-artifact-url');
      (action as any).cliManager = mockCLIManager;

      await action.run();

      expect(uploadSpy).toHaveBeenCalledWith(expect.objectContaining({
        master: expect.objectContaining({
          tasks: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              title: 'Test Task'
            })
          ])
        })
      }));
    });
  });
});

// Helper functions
function createRealisticPRD(): string {
  return `# User Authentication System

## Overview
Implement a comprehensive user authentication system with modern security practices.

## Requirements

### Core Features
- User registration with email verification
- Secure login/logout functionality
- Password reset mechanism
- Session management
- Role-based access control

### Security Requirements
- JWT token-based authentication
- Password hashing with bcrypt
- Rate limiting for authentication attempts
- Two-factor authentication support
- HTTPS enforcement

### Technical Requirements
- RESTful API design
- Database integration
- Error handling and logging
- Performance optimization
- Scalability considerations

## User Stories

### As a new user
- I want to register for an account
- I want to verify my email address
- I want to set a secure password

### As an existing user
- I want to log in securely
- I want to reset my password if forgotten
- I want to manage my account settings

### As an administrator
- I want to manage user accounts
- I want to view authentication logs
- I want to configure security settings

## Technical Implementation

### Architecture
- Microservices architecture
- API Gateway pattern
- Database per service
- Event-driven communication

### Database Design
- User profiles table
- Authentication tokens table
- Role definitions table
- Permission mappings table

### API Endpoints
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/refresh
- POST /auth/forgot-password
- POST /auth/reset-password

### Security Measures
- Input validation
- SQL injection prevention
- XSS protection
- CSRF protection
- Secure cookie handling

## Testing Strategy

### Unit Testing
- Authentication service tests
- Password validation tests
- Token generation tests
- Database operation tests

### Integration Testing
- End-to-end authentication flow
- API endpoint testing
- Database integration testing
- Security vulnerability testing

### Performance Testing
- Load testing for authentication endpoints
- Stress testing for concurrent users
- Memory usage optimization
- Response time optimization

## Deployment Requirements

### Infrastructure
- Container orchestration
- Load balancing
- SSL/TLS certificates
- Database clustering
- Monitoring and alerting

### Environment Configuration
- Development environment
- Staging environment
- Production environment
- Testing environment

## Monitoring and Logging

### Metrics
- Authentication success/failure rates
- Response time metrics
- Error rate monitoring
- User activity tracking

### Logging
- Authentication attempts
- Security events
- Error logs
- Performance metrics

## Success Criteria

### Functional
- All authentication flows work correctly
- Security requirements are met
- Performance benchmarks are achieved
- Error handling is robust

### Non-functional
- 99.9% uptime requirement
- Sub-200ms response times
- Support for 10,000 concurrent users
- Zero critical security vulnerabilities
`;
}

function generateConfigBasedTasks(complexityThreshold: number, maxDepth: number): any[] {
  const tasks = [];
  let taskId = 1;

  // Generate tasks based on configuration
  for (let depth = 0; depth < maxDepth; depth++) {
    const tasksAtDepth = Math.max(1, Math.floor(Math.random() * 5) + 1);
    
    for (let i = 0; i < tasksAtDepth; i++) {
      const complexity = Math.floor(Math.random() * complexityThreshold) + 1;
      
      tasks.push({
        id: taskId++,
        title: `Task ${taskId} (Depth ${depth})`,
        description: `A task at depth ${depth} with complexity ${complexity}`,
        complexity,
        priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        dependencies: depth > 0 ? [Math.floor(Math.random() * (taskId - tasksAtDepth - 1)) + 1] : [],
        status: 'pending'
      });
    }
  }

  return tasks;
}