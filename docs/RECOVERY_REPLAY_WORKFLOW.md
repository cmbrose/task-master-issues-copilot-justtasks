# Task Graph Recovery and Replay Workflow

This document describes the Recovery and Replay Workflow that enables replaying task graphs from stored artifacts with comprehensive error handling, rate limiting, and idempotency features.

## Overview

The Recovery and Replay Workflow (`taskgraph-replay.yml`) provides a robust mechanism to:

1. **Download and validate artifacts** from URLs or artifact IDs
2. **Recreate GitHub issues** from task graphs with idempotency
3. **Handle failures gracefully** with comprehensive error recovery
4. **Manage rate limits** intelligently with exponential backoff
5. **Prevent duplicates** using content-based hashing

## Features

### 1. Robust Artifact Download

- **URL-based download**: Download artifacts from any HTTPS URL
- **ID-based download**: Download artifacts by GitHub Actions artifact ID
- **Checksum validation**: Verify artifact integrity using SHA-256 checksums
- **Signature verification**: Optional cryptographic signature validation
- **Retry logic**: Automatic retries with exponential backoff
- **Format transformation**: Support for legacy and enhanced task graph formats

### 2. Comprehensive Error Handling

The system categorizes errors into different types with appropriate recovery strategies:

#### Error Categories

| Type | Description | Retryable | Max Retries | Strategy |
|------|-------------|-----------|-------------|----------|
| `rate_limit` | GitHub API rate limiting | Yes | 10 | Exponential backoff with retry-after headers |
| `network` | Network connectivity issues | Yes | 5 | Fixed delay with exponential backoff |
| `validation` | Data validation failures | No | 0 | Immediate failure with detailed logging |
| `authentication` | Authentication/authorization issues | No | 0 | Immediate failure |
| `unknown` | Unclassified errors | Yes | 3 | Conservative retry with logging |

#### Rate Limit Handling

- **Intelligent detection**: Recognizes primary and secondary rate limits
- **Retry-after headers**: Respects GitHub's retry-after suggestions
- **Exponential backoff**: Implements exponential backoff for unknown rate limits
- **Queue management**: Maintains operation queue for batch processing

### 3. Idempotency System

- **Content hashing**: MD5 hashing of issue title + body for duplicate detection
- **State persistence**: Stores content hashes in `.taskmaster/state/content-hashes.json`
- **Change detection**: Only creates/updates issues when content changes
- **Rollback protection**: Prevents duplicate issues during recovery operations

### 4. Multi-layered Validation

#### Artifact Validation
- **URL format validation**: Ensures proper HTTPS URLs
- **JSON structure validation**: Validates task graph structure
- **Task validation**: Ensures required fields (id, title) are present
- **Metadata validation**: Verifies artifact metadata integrity

#### Input Validation
- **Parameter validation**: Validates all workflow inputs
- **Range checking**: Ensures numeric parameters are within valid ranges
- **Mutual exclusivity**: Validates that either artifact-url or artifact-id is provided

## Usage

### Manual Trigger

The workflow can be triggered manually through GitHub Actions UI:

```yaml
workflow_dispatch:
  inputs:
    artifact-url:
      description: 'URL of the task-graph.json artifact to replay'
      required: true
      type: string
    artifact-id:
      description: 'ID of the artifact to replay (alternative to URL)'
      required: false
      type: string
    force-replay:
      description: 'Force replay even if issues already exist'
      required: false
      default: false
      type: boolean
    dry-run:
      description: 'Enable dry-run mode (preview only, no issues created)'
      required: false
      default: false
      type: boolean
```

### Configuration Options

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| `artifact-url` | HTTPS URL to artifact | Required | Valid HTTPS URL |
| `artifact-id` | GitHub Actions artifact ID | Optional | Valid artifact ID |
| `force-replay` | Force recreation of existing issues | `false` | boolean |
| `dry-run` | Preview mode, no issues created | `false` | boolean |
| `max-retries` | Maximum retry attempts | `3` | 1-10 |
| `batch-size` | Issues per batch | `10` | 1-50 |

### Example Usage

#### Replay from URL
```bash
# Trigger workflow with artifact URL
gh workflow run taskgraph-replay.yml \
  -f artifact-url="https://example.com/artifacts/task-graph.json" \
  -f dry-run=false
```

#### Replay from Artifact ID
```bash
# Trigger workflow with artifact ID
gh workflow run taskgraph-replay.yml \
  -f artifact-id="taskmaster-task-graph-12345" \
  -f force-replay=true
```

#### Dry Run Mode
```bash
# Preview mode - no issues created
gh workflow run taskgraph-replay.yml \
  -f artifact-url="https://example.com/artifacts/task-graph.json" \
  -f dry-run=true
```

## Implementation Details

### Enhanced TaskmasterAction Class

The main implementation extends the `TaskmasterAction` class with:

#### New Methods

- `downloadFromArtifactUrl()`: Download and validate artifacts from URLs
- `validateSignature()`: Cryptographic signature validation
- `categorizeError()`: Intelligent error categorization
- `executeWithRetry()`: Retry wrapper with exponential backoff
- `isIssueContentChanged()`: Content-based change detection
- `loadExistingContentHashes()` / `saveContentHashes()`: State persistence

#### Enhanced Methods

- `run()`: Updated with retry logic and idempotency
- `restoreFromArtifact()`: Enhanced with comprehensive error handling
- `validateTaskGraphStructure()`: Improved validation logic

### File Structure

```
.github/workflows/
├── taskgraph-replay.yml          # Main workflow file
src/
├── main.ts                       # Enhanced TaskmasterAction class
├── recovery-replay.test.ts       # Comprehensive test suite
.taskmaster/
├── state/
│   └── content-hashes.json      # Idempotency state file
├── tasks/
│   └── task-graph.json          # Downloaded task graph
```

## Error Recovery Scenarios

### 1. Rate Limit Recovery

```typescript
// Automatic rate limit handling
if (error.status === 403 && error.message.includes('rate limit')) {
  const retryAfter = error.headers['retry-after'] || calculateBackoff();
  await sleep(retryAfter * 1000);
  // Retry operation
}
```

### 2. Network Failure Recovery

```typescript
// Network error with exponential backoff
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    return await operation();
  } catch (error) {
    if (isNetworkError(error) && attempt < maxRetries) {
      await sleep(1000 * Math.pow(2, attempt));
      continue;
    }
    throw error;
  }
}
```

### 3. Partial Failure Recovery

- **Batch processing**: Issues are processed in configurable batches
- **Individual error handling**: Failures in one issue don't stop the batch
- **Resume capability**: Can resume from where it left off using state files
- **Cleanup on failure**: Automatic cleanup of partially created resources

## Monitoring and Logging

### Artifact Operation Logging

All artifact operations are logged with structured data:

```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "operation": "download_url",
  "location": "https://example.com/artifact.json",
  "taskCount": 42,
  "complexityScores": { "min": 1, "max": 10, "average": 5.5 },
  "hierarchyDepth": 3,
  "prdVersion": "v1.0.0",
  "error": null
}
```

### Error Logging

Errors are logged with categorization and context:

```typescript
console.error(`Operation failed (attempt ${attempt}/${maxRetries}):`, error);
console.error('Error category:', { type: 'rate_limit', retryable: true });
```

### GitHub Actions Integration

- **Step summaries**: Detailed summaries in GitHub Actions UI
- **Artifact uploads**: All generated files uploaded as artifacts
- **Status reporting**: Clear success/failure reporting
- **Debug information**: Comprehensive logs for troubleshooting

## Security Considerations

### Input Validation

- **URL validation**: Only HTTPS URLs accepted
- **Parameter sanitization**: All inputs validated and sanitized
- **Path traversal protection**: Prevents directory traversal attacks

### Authentication

- **GitHub token**: Uses standard GitHub Actions token
- **Minimal permissions**: Only requires `contents:read` and `issues:write`
- **No credential exposure**: No sensitive data in logs

### Rate Limiting

- **Respectful API usage**: Implements proper rate limiting
- **Batch processing**: Limits concurrent operations
- **Backoff strategies**: Prevents API abuse

## Testing

### Test Coverage

The implementation includes comprehensive tests:

- **Artifact download tests**: URL and ID-based downloads
- **Error handling tests**: All error categories and recovery
- **Idempotency tests**: Content hashing and state persistence
- **Validation tests**: Task graph and input validation
- **Integration tests**: End-to-end workflow testing

### Running Tests

```bash
# Run all recovery and replay tests
npm test -- --testNamePattern="Recovery and Replay"

# Run specific test categories
npm test -- --testNamePattern="Error Handling"
npm test -- --testNamePattern="Idempotency"
npm test -- --testNamePattern="Enhanced Artifact"
```

## Performance Considerations

### Batch Processing

- **Configurable batch size**: Default 10 issues per batch
- **Controlled concurrency**: Prevents overwhelming GitHub API
- **Memory management**: Efficient processing of large task graphs

### Caching and State

- **Content hash caching**: Prevents redundant hash calculations
- **State persistence**: Reduces duplicate work across runs
- **Lazy loading**: Only loads state when needed

### Network Optimization

- **Connection reuse**: Efficient HTTP connection management
- **Compression**: Supports gzip compression for large artifacts
- **Timeout handling**: Appropriate timeouts for different operations

## Migration Guide

### From Legacy Formats

The system automatically transforms legacy task graph formats:

```typescript
// Legacy format
{
  "tasks": [...],
  "metadata": {...}
}

// Enhanced format
{
  "master": {
    "tasks": [...],
    "metadata": {...}
  },
  "metadata": {
    "prdSource": [...],
    "taskCount": 42,
    "generationTimestamp": "...",
    // ...
  }
}
```

### Existing Workflows

The replay workflow is designed to be additive and doesn't interfere with existing workflows:

- **Separate namespace**: Uses distinct artifact naming
- **Independent state**: Maintains separate state files
- **Compatible outputs**: Produces standard task graph outputs

## Troubleshooting

### Common Issues

1. **Checksum validation failed**
   - Verify artifact integrity
   - Check for network corruption
   - Validate expected checksum

2. **Rate limit exceeded**
   - Automatic retry with backoff
   - Check GitHub API rate limits
   - Consider batch size reduction

3. **Invalid task graph structure**
   - Validate JSON format
   - Check required fields
   - Review task structure

### Debug Mode

Enable debug logging by setting environment variables:

```bash
export DEBUG=taskmaster:*
export GITHUB_ACTIONS_STEP_DEBUG=true
```

## Future Enhancements

### Planned Features

1. **Parallel processing**: Concurrent issue creation
2. **Advanced signatures**: Support for more signature algorithms
3. **Webhook integration**: Automatic replay on artifact updates
4. **Metrics collection**: Performance and usage metrics
5. **Advanced filtering**: Selective task replay based on criteria

### Extensibility

The system is designed for extension:

- **Plugin architecture**: Support for custom validators
- **Hook system**: Pre/post processing hooks
- **Custom error handlers**: Pluggable error handling
- **Format adapters**: Support for different artifact formats

## Support

For issues and questions:

1. Check the [troubleshooting guide](#troubleshooting)
2. Review the [test suite](src/recovery-replay.test.ts)
3. Examine the [implementation](src/main.ts)
4. Open an issue in the repository

---

*This workflow implements the requirements specified in issue #8 for robust task graph recovery and replay functionality.*