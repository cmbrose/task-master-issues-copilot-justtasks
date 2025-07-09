# API Documentation

## Overview

The Taskmaster Issues Generator provides a comprehensive API for processing PRD files and generating GitHub Issues with proper task hierarchies and dependencies.

## Core Classes

### TaskmasterAction

The main class that orchestrates the entire workflow.

#### Constructor

```typescript
constructor()
```

Creates a new TaskmasterAction instance with environment-based configuration.

#### Methods

##### `run(): Promise<void>`

Executes the complete workflow:
1. Processes PRD files
2. Generates task graphs
3. Uploads artifacts
4. Returns execution results

**Example:**
```typescript
const action = new TaskmasterAction();
await action.run();
```

##### `uploadTaskGraph(taskGraph: EnhancedTaskGraph): Promise<string>`

Uploads a task graph as an artifact to GitHub Actions.

**Parameters:**
- `taskGraph`: Enhanced task graph with metadata

**Returns:**
- `Promise<string>`: URL to the uploaded artifact

**Example:**
```typescript
const artifactUrl = await action.uploadTaskGraph(taskGraph);
```

##### `restoreFromArtifact(artifactId: string): Promise<EnhancedTaskGraph>`

Restores a task graph from a previously uploaded artifact.

**Parameters:**
- `artifactId`: ID of the artifact to restore

**Returns:**
- `Promise<EnhancedTaskGraph>`: Restored task graph

**Example:**
```typescript
const restoredGraph = await action.restoreFromArtifact('artifact-id');
```

##### `validateTaskGraphStructure(taskGraph: any): Promise<boolean>`

Validates the structure of a task graph.

**Parameters:**
- `taskGraph`: Task graph object to validate

**Returns:**
- `Promise<boolean>`: True if valid, false otherwise

**Example:**
```typescript
const isValid = await action.validateTaskGraphStructure(taskGraph);
```

## Data Types

### EnhancedTaskGraph

```typescript
interface EnhancedTaskGraph {
  master: {
    tasks: Task[];
  };
  metadata: {
    version: string;
    generated: string;
    source: string;
    taskCount: number;
    complexityScores: {
      min: number;
      max: number;
      average: number;
    };
    hierarchyDepth: number;
    prdVersion: string;
  };
  retention: {
    retentionDays: number;
    retentionCount: number;
  };
}
```

### Task

```typescript
interface Task {
  id: number;
  title: string;
  description: string;
  complexity: number;
  priority: 'low' | 'medium' | 'high';
  dependencies: number[];
  status: 'pending' | 'in_progress' | 'completed';
  labels?: string[];
  metadata?: Record<string, any>;
}
```

### ErrorCategory

```typescript
interface ErrorCategory {
  type: 'rate_limit' | 'network' | 'validation' | 'authentication' | 'invalid_artifact' | 'unknown';
  retryable: boolean;
  retryDelay: number;
  maxRetries: number;
}
```

### DownloadValidationOptions

```typescript
interface DownloadValidationOptions {
  validateChecksum?: boolean;
  validateSignature?: boolean;
  expectedChecksum?: string;
  publicKey?: string;
  maxRetries?: number;
  retryDelay?: number;
}
```

## Configuration

### Environment Variables

| Variable | Description | Default | Type |
|----------|-------------|---------|------|
| `INPUT_COMPLEXITY_THRESHOLD` | Maximum complexity threshold for tasks | `40` | number |
| `INPUT_MAX_DEPTH` | Maximum depth for task hierarchy | `3` | number |
| `INPUT_PRD_PATH_GLOB` | Glob pattern for PRD files | `docs/**.prd.md` | string |
| `INPUT_BREAKDOWN_MAX_DEPTH` | Maximum depth for task breakdown | `2` | number |
| `INPUT_TASKMASTER_ARGS` | Additional arguments for Taskmaster CLI | `''` | string |
| `INPUT_REPLAY_ARTIFACT_ID` | ID of artifact to replay | `''` | string |
| `INPUT_CLEANUP_ARTIFACTS` | Whether to cleanup expired artifacts | `false` | boolean |
| `INPUT_DRY_RUN` | Enable dry-run mode | `false` | boolean |

### Configuration Examples

#### Basic Configuration

```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    complexity-threshold: 40
    max-depth: 3
```

#### Advanced Configuration

```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    complexity-threshold: 30
    max-depth: 4
    prd-path-glob: 'specifications/**.prd.md'
    breakdown-max-depth: 3
    taskmaster-args: '--verbose --debug'
    cleanup-artifacts: true
```

## Error Handling

### Error Categories

The API categorizes errors for appropriate handling:

#### Rate Limit Errors
- **Type:** `rate_limit`
- **Retryable:** Yes
- **Max Retries:** 10
- **Retry Delay:** Calculated based on rate limit headers

#### Network Errors
- **Type:** `network`
- **Retryable:** Yes
- **Max Retries:** 5
- **Retry Delay:** 1000ms

#### Validation Errors
- **Type:** `validation`
- **Retryable:** No
- **Max Retries:** 0

#### Authentication Errors
- **Type:** `authentication`
- **Retryable:** No
- **Max Retries:** 0

#### Invalid Artifact Errors
- **Type:** `invalid_artifact`
- **Retryable:** No
- **Max Retries:** 0

#### Unknown Errors
- **Type:** `unknown`
- **Retryable:** Yes
- **Max Retries:** 3
- **Retry Delay:** 2000ms

### Error Handling Examples

```typescript
try {
  await action.run();
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Handle rate limiting
    console.log('Rate limited, waiting...');
  } else if (error.message.includes('Invalid artifact')) {
    // Handle invalid artifact
    console.log('Artifact not found or invalid');
  } else {
    // Handle other errors
    console.error('Unexpected error:', error);
  }
}
```

## Artifact Management

### Artifact Structure

Artifacts are stored with the following structure:

```
artifacts/
├── taskmaster/
│   ├── task-graph.json
│   └── metadata.json
└── logs/
    └── artifact-operations.log
```

### Artifact Operations

#### Upload Artifact

```typescript
const artifactUrl = await action.uploadTaskGraph(taskGraph);
```

#### Download Artifact

```typescript
const restoredGraph = await action.restoreFromArtifact(artifactId);
```

#### Validate Artifact

```typescript
const isValid = await action.validateArtifact(artifactId);
```

### Artifact Metadata

```typescript
interface ArtifactMetadata {
  timestamp: string;
  operation: 'upload' | 'download' | 'restore';
  location: string;
  taskCount: number;
  complexityScores: {
    min: number;
    max: number;
    average: number;
  };
  hierarchyDepth: number;
  prdVersion: string;
  error?: string;
}
```

## CLI Integration

### CLI Manager

The `CLIManager` class handles interaction with the Taskmaster CLI:

```typescript
interface CLIManager {
  downloadAndValidate(): Promise<void>;
  generateTaskGraph(prdPaths: string[]): Promise<TaskGraph>;
  validateBinary(): Promise<boolean>;
  getVersion(): Promise<string>;
}
```

### CLI Operations

#### Download CLI Binary

```typescript
await cliManager.downloadAndValidate();
```

#### Generate Task Graph

```typescript
const taskGraph = await cliManager.generateTaskGraph(['path/to/prd.md']);
```

#### Validate Binary

```typescript
const isValid = await cliManager.validateBinary();
```

## GitHub Integration

### Issue Creation

The system creates GitHub Issues with structured metadata:

```yaml
---
id: 1
title: "Task Title"
parent: [2, 3]
dependents: [4, 5]
complexity: 8
priority: high
status: pending
---

## Details
Task description and implementation details.

## Dependencies
- [ ] #123 Setup Authentication
- [x] #124 Database Schema

## Meta
- Status: `pending`
- Priority: `high`
- Complexity: `8 / 10`
- Required By:
  - [ ] #125 User Interface
  - [ ] #126 API Integration
```

### Labels

The system automatically applies labels:
- `task`: Applied to all generated issues
- `blocked`: Applied when dependencies are open
- `priority:high/medium/low`: Based on task priority
- `complexity:high/medium/low`: Based on complexity score

### Sub-issue Relationships

Issues are linked using GitHub's Sub-issues API to create proper hierarchical relationships.

## Performance Considerations

### Optimization Strategies

1. **Batch Processing**: Tasks are processed in batches to avoid overwhelming the API
2. **Rate Limiting**: Automatic retry with exponential backoff
3. **Caching**: CLI binaries and task graphs are cached
4. **Parallel Processing**: Independent operations run concurrently

### Performance Metrics

- **Processing Time**: Target 5-minute runtime for 1000-line PRDs
- **Memory Usage**: Optimized for minimal memory footprint
- **API Calls**: Efficient batching to minimize GitHub API usage
- **Artifact Size**: Compressed artifacts for faster uploads/downloads

## Security

### Authentication

The system uses GitHub tokens for authentication:
- Repository access permissions
- Issue creation permissions
- Artifact upload permissions

### Data Protection

- Sensitive data is not logged
- Temporary files are cleaned up
- Artifacts are stored with appropriate access controls

### Binary Validation

CLI binaries are validated using:
- Checksum verification
- Signature validation (when available)
- Version compatibility checks

## Logging

### Log Levels

- **INFO**: General operation information
- **WARN**: Non-critical issues
- **ERROR**: Critical errors requiring attention
- **DEBUG**: Detailed debugging information

### Log Format

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "operation": "upload_artifact",
  "details": {
    "location": "artifacts/taskmaster/task-graph.json",
    "taskCount": 25,
    "complexityScores": {"min": 2, "max": 8, "average": 5.2}
  }
}
```

## Testing

### Test Categories

1. **Unit Tests**: Individual component testing
2. **Integration Tests**: Component interaction testing
3. **End-to-End Tests**: Complete workflow testing
4. **Performance Tests**: Load and stress testing
5. **Smoke Tests**: Critical functionality validation

### Test Utilities

```typescript
// Mock CLI Manager
const mockCLIManager = {
  downloadAndValidate: jest.fn().mockResolvedValue(undefined),
  generateTaskGraph: jest.fn().mockResolvedValue(mockTaskGraph)
};

// Mock Task Graph
const mockTaskGraph = {
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
  }
};
```

## Migration Guide

### From Version 1.x to 2.x

1. Update action reference in workflows
2. Update environment variable names
3. Update artifact structure references
4. Review error handling changes

### Backward Compatibility

The API maintains backward compatibility for:
- Core workflow operations
- Environment variable names
- Artifact formats
- Error structures

## Support

### Common Issues

1. **Rate Limiting**: Implement exponential backoff
2. **Authentication**: Verify token permissions
3. **Artifact Failures**: Check network connectivity
4. **CLI Issues**: Verify binary compatibility

### Debug Mode

Enable debug logging with:
```yaml
with:
  taskmaster-args: '--verbose --debug'
```

### Performance Monitoring

Monitor key metrics:
- Processing time
- Memory usage
- API call frequency
- Error rates