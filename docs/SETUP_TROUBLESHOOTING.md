# Setup and Troubleshooting Guide

## Quick Start

### Prerequisites

- GitHub repository with Issues enabled
- GitHub Actions enabled in repository settings
- Node.js 20 or later (for development)
- PRD files in markdown format

### Basic Setup

1. **Create Workflow File**

Create `.github/workflows/taskmaster.yml`:

```yaml
name: Generate Tasks from PRDs
on:
  push:
    paths:
      - 'docs/**.prd.md'
  pull_request:
    paths:
      - 'docs/**.prd.md'

jobs:
  generate-tasks:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      contents: read
      pull-requests: write
    steps:
      - uses: cmbrose/task-master-issues-justtasks@v1
```

2. **Create PRD File**

Create `docs/example.prd.md`:

```markdown
# Example Feature

## Overview
This is an example feature for testing.

## Requirements
- Requirement 1: Basic functionality
- Requirement 2: Advanced features
- Requirement 3: Error handling

## Technical Details
Implementation details go here.
```

3. **Commit and Push**

```bash
git add .
git commit -m "Add Taskmaster workflow and example PRD"
git push
```

The workflow will automatically run and generate GitHub Issues based on your PRD.

## Detailed Setup

### Repository Configuration

#### 1. Permissions Setup

Ensure your repository has the following permissions configured:

```yaml
permissions:
  issues: write         # Required to create and manage issues
  contents: read        # Required to read PRD files
  pull-requests: write  # Required for dry-run comments
```

#### 2. Branch Protection

For production use, consider setting up branch protection:

```yaml
# .github/workflows/taskmaster.yml
on:
  push:
    branches: [main, develop]
    paths:
      - 'docs/**.prd.md'
```

#### 3. Environment Variables

Configure these in your repository settings → Secrets and Variables → Actions:

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | Automatically provided by GitHub | Yes |
| `ARTIFACT_RETENTION_DAYS` | Days to retain artifacts | No |
| `ARTIFACT_RETENTION_COUNT` | Number of artifacts to keep | No |

### Advanced Configuration

#### 1. Custom PRD Location

```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    prd-path-glob: 'specifications/**.prd.md'
```

#### 2. Complexity Filtering

```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    complexity-threshold: 30  # Only create issues for tasks ≤ 30 complexity
```

#### 3. Depth Limiting

```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    max-depth: 4  # Maximum 4 levels of task hierarchy
```

#### 4. Multiple Workflows

You can set up different workflows for different scenarios:

**Development Workflow:**
```yaml
name: PRD Preview
on:
  pull_request:
    paths:
      - 'docs/**.prd.md'
jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: cmbrose/task-master-issues-justtasks@v1
        with:
          dry-run: true
```

**Production Workflow:**
```yaml
name: Generate Production Tasks
on:
  push:
    branches: [main]
    paths:
      - 'docs/**.prd.md'
jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      contents: read
    steps:
      - uses: cmbrose/task-master-issues-justtasks@v1
        with:
          complexity-threshold: 40
          max-depth: 3
```

### Development Setup

#### 1. Local Development

```bash
# Clone the repository
git clone https://github.com/your-org/your-repo.git
cd your-repo

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

#### 2. Testing Configuration

Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

#### 3. Local Testing

```bash
# Run specific test suites
npm test -- --testNamePattern="performance"
npm test -- --testNamePattern="smoke"

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

## Troubleshooting

### Common Issues

#### 1. Permission Denied

**Error:**
```
Error: Resource not accessible by integration
```

**Solution:**
```yaml
permissions:
  issues: write
  contents: read
  pull-requests: write
```

#### 2. PRD Files Not Found

**Error:**
```
No PRD files found matching pattern: docs/**.prd.md
```

**Solutions:**
- Check file location: `docs/example.prd.md`
- Verify file extension: Must be `.prd.md`
- Update glob pattern:
  ```yaml
  with:
    prd-path-glob: 'specifications/**.prd.md'
  ```

#### 3. Workflow Not Triggering

**Possible Causes:**
- File not in monitored path
- Workflow file syntax error
- Branch protection rules

**Solutions:**
```yaml
on:
  push:
    paths:
      - 'docs/**.prd.md'
    branches: [main, develop]  # Specify branches
```

#### 4. Rate Limiting

**Error:**
```
API rate limit exceeded
```

**Solutions:**
- The action includes automatic retry with exponential backoff
- Consider reducing complexity threshold to generate fewer issues
- Split large PRDs into smaller files

#### 5. Large PRD Processing

**Error:**
```
Timeout: Process exceeded 5 minutes
```

**Solutions:**
- Reduce complexity threshold
- Decrease max depth
- Split PRD into multiple files
- Enable breakdown mode:
  ```yaml
  with:
    breakdown-max-depth: 2
  ```

### Debug Mode

Enable detailed logging:

```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    taskmaster-args: '--verbose --debug'
```

### Performance Issues

#### 1. Slow Processing

**Symptoms:**
- Workflow taking >5 minutes
- Memory usage warnings
- Timeout errors

**Solutions:**
```yaml
with:
  complexity-threshold: 30    # Reduce from default 40
  max-depth: 2               # Reduce from default 3
  breakdown-max-depth: 1     # Reduce from default 2
```

#### 2. Memory Issues

**Symptoms:**
- Out of memory errors
- Slow performance
- Workflow failures

**Solutions:**
- Process PRDs in smaller batches
- Reduce concurrent operations
- Use cleanup artifacts:
  ```yaml
  with:
    cleanup-artifacts: true
  ```

#### 3. API Limits

**Symptoms:**
- Rate limiting errors
- Request failures
- Partial issue creation

**Solutions:**
- Implement backoff strategies (built-in)
- Reduce batch sizes
- Monitor API usage

### Artifact Issues

#### 1. Artifact Upload Failures

**Error:**
```
Failed to upload artifact: Network error
```

**Solutions:**
- Check network connectivity
- Verify repository permissions
- Enable artifact cleanup:
  ```yaml
  with:
    cleanup-artifacts: true
  ```

#### 2. Artifact Restoration Failures

**Error:**
```
Invalid artifact: artifact-id-123
```

**Solutions:**
- Verify artifact ID exists
- Check artifact retention settings
- Use valid artifact ID:
  ```yaml
  with:
    replay-artifact-id: 'valid-artifact-id'
  ```

### CLI Integration Issues

#### 1. CLI Download Failures

**Error:**
```
Failed to download Taskmaster CLI
```

**Solutions:**
- Check network connectivity
- Verify CLI binary availability
- Check platform compatibility

#### 2. CLI Execution Failures

**Error:**
```
Taskmaster CLI execution failed
```

**Solutions:**
- Check CLI arguments:
  ```yaml
  with:
    taskmaster-args: '--help'  # Test with help flag
  ```
- Verify PRD file format
- Check CLI version compatibility

### Testing Issues

#### 1. Test Failures

**Common test failures and solutions:**

```bash
# Run specific failing test
npm test -- --testNamePattern="failing-test-name"

# Run tests with detailed output
npm test -- --verbose

# Run tests with coverage
npm test -- --coverage --collectCoverageFrom="src/**/*.ts"
```

#### 2. Performance Test Failures

**Timeout issues:**
```bash
# Increase timeout for performance tests
npm test -- --testTimeout=600000  # 10 minutes
```

**Memory issues:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

### Monitoring and Observability

#### 1. Workflow Monitoring

Check workflow status:
- GitHub Actions tab
- Workflow run logs
- Artifact uploads

#### 2. Performance Monitoring

Monitor these metrics:
- Processing time per PRD
- Memory usage
- API call frequency
- Error rates

#### 3. Log Analysis

Key log patterns to monitor:
```
[ARTIFACT_LOG] - Artifact operations
Task graph generated - Successful processing
ERROR - Critical failures
WARN - Non-critical issues
```

### Recovery Procedures

#### 1. Workflow Recovery

If a workflow fails:
1. Check logs for error details
2. Verify PRD file format
3. Check permissions
4. Re-run workflow
5. Use replay if available:
   ```yaml
   with:
     replay-artifact-id: 'last-successful-run'
   ```

#### 2. Issue Recovery

If issues are created incorrectly:
1. Use dry-run mode to preview changes
2. Close incorrect issues manually
3. Re-run with corrected configuration
4. Use issue templates for consistency

#### 3. Artifact Recovery

If artifacts are corrupted:
1. Check artifact retention settings
2. Use backup artifacts
3. Regenerate from PRD files
4. Enable cleanup to prevent accumulation

## Best Practices

### 1. PRD Structure

```markdown
# Clear, Descriptive Title

## Overview
Brief description of the feature or requirement.

## Requirements
- Specific, measurable requirements
- Organized by priority
- Clear acceptance criteria

## Technical Details
Implementation-specific information.

## Dependencies
External dependencies and constraints.

## Success Criteria
Measurable success indicators.
```

### 2. Workflow Organization

```yaml
# Separate workflows for different environments
name: PRD Processing (Production)
on:
  push:
    branches: [main]
    paths: ['docs/**.prd.md']

---
name: PRD Preview (Development)
on:
  pull_request:
    paths: ['docs/**.prd.md']
```

### 3. Configuration Management

```yaml
# Use environment-specific configurations
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    complexity-threshold: ${{ vars.COMPLEXITY_THRESHOLD }}
    max-depth: ${{ vars.MAX_DEPTH }}
```

### 4. Error Handling

```yaml
# Add error handling steps
- uses: cmbrose/task-master-issues-justtasks@v1
  continue-on-error: true
  id: generate-tasks

- name: Handle Failure
  if: steps.generate-tasks.outcome == 'failure'
  run: |
    echo "Task generation failed, sending notification"
    # Add notification logic
```

### 5. Testing Strategy

```bash
# Regular testing schedule
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:e2e           # End-to-end tests
npm run test:performance   # Performance tests
```

## Security Considerations

### 1. Token Management

- Use repository secrets for sensitive data
- Rotate tokens regularly
- Use minimal required permissions
- Monitor token usage

### 2. PRD Content Security

- Avoid sensitive information in PRDs
- Review PRD content before commit
- Use private repositories for sensitive projects
- Implement content scanning

### 3. Artifact Security

- Configure appropriate retention policies
- Monitor artifact access
- Use encryption for sensitive artifacts
- Regular cleanup of expired artifacts

## Support and Resources

### 1. Documentation

- [API Documentation](API.md)
- [CLI Integration Guide](CLI_INTEGRATION.md)
- [Recovery and Replay Workflow](RECOVERY_REPLAY_WORKFLOW.md)

### 2. Community Resources

- GitHub Issues for bug reports
- Discussions for feature requests
- Wiki for additional examples

### 3. Monitoring Tools

- GitHub Actions logs
- Performance dashboards
- Error tracking systems
- Artifact management tools

### 4. Professional Support

For enterprise support:
- Priority issue resolution
- Custom integration assistance
- Performance optimization
- Security audits