# Taskmaster Issues Generator

This GitHub Action automatically generates GitHub Issues from PRD (Product Requirements Document) files using the Taskmaster CLI. It processes PRD files, creates task hierarchies, and generates corresponding GitHub Issues with proper dependency tracking and labeling.

## Features

- 🔄 Automatic issue generation from PRD files
- 📊 Task complexity analysis and filtering
- 🔒 Secure CLI binary management with checksum validation
- 🏗️ Hierarchical task structure with dependencies
- 🏷️ Automatic labeling and blocking status management
- 📦 Artifact storage for task graphs with enhanced metadata
- 🔁 Replay and recovery capabilities from stored artifacts
- 🗂️ Configurable retention policies for artifact cleanup
- 📝 Structured logging for all artifact operations
- ⚙️ Configurable complexity thresholds and depth limits

## Usage

### Basic Usage

```yaml
name: Generate Tasks from PRDs
on:
  push:
    paths:
      - 'docs/**.prd.md'

jobs:
  generate-tasks:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      contents: read
    steps:
      - uses: cmbrose/task-master-issues-justtasks@v1
```

### Advanced Configuration

```yaml
name: Generate Tasks from PRDs
on:
  push:
    paths:
      - 'docs/**.prd.md'
  workflow_dispatch:
    inputs:
      complexity-threshold:
        description: 'Maximum complexity threshold'
        default: '40'
      max-depth:
        description: 'Maximum task hierarchy depth'
        default: '3'

jobs:
  generate-tasks:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      contents: read
    steps:
      - uses: cmbrose/task-master-issues-justtasks@v1
        with:
          complexity-threshold: ${{ inputs.complexity-threshold || '40' }}
          max-depth: ${{ inputs.max-depth || '3' }}
          prd-path-glob: 'docs/**.prd.md'
          breakdown-max-depth: '2'
          taskmaster-args: '--verbose'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `complexity-threshold` | Maximum complexity threshold for tasks | No | `40` |
| `max-depth` | Maximum depth for task hierarchy | No | `3` |
| `prd-path-glob` | Glob pattern for PRD files to process | No | `docs/**.prd.md` |
| `breakdown-max-depth` | Maximum depth for task breakdown | No | `2` |
| `taskmaster-args` | Additional arguments to pass to Taskmaster CLI | No | `''` |
| `replay-artifact-id` | ID of artifact to replay (for recovery workflows) | No | `''` |
| `cleanup-artifacts` | Whether to cleanup expired artifacts | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `task-count` | Number of tasks generated |
| `artifact-url` | URL to the generated task graph artifact |

## Permissions

This action requires the following permissions:

```yaml
permissions:
  issues: write    # Required to create and manage GitHub Issues
  contents: read   # Required to read PRD files from the repository
```

## How It Works

1. **PRD Processing**: The action scans for PRD files matching the specified glob pattern
2. **CLI Integration**: Downloads and validates the pinned Taskmaster CLI binary with checksum verification
3. **Task Analysis**: Uses Taskmaster CLI to analyze PRD content and generate task hierarchies
4. **Complexity Filtering**: Filters tasks based on the complexity threshold (≤40 default)
5. **Issue Creation**: Creates GitHub Issues with proper metadata and dependencies
6. **Labeling**: Applies appropriate labels including 'task' and 'blocked' status
7. **Artifact Storage**: Stores enhanced task graphs as GitHub Actions artifacts with comprehensive metadata
8. **Retention Management**: Automatically manages artifact retention based on configurable policies

## Artifact Management

The action now provides comprehensive artifact management capabilities:

### Enhanced Metadata
Each artifact includes:
- **Task Complexity Scores**: Min, max, and average complexity values
- **Hierarchy Depth**: Maximum dependency depth in the task graph
- **PRD Version**: Hash-based versioning of source PRD files
- **Generation Timestamp**: ISO timestamp of artifact creation
- **Retention Policy**: Configurable retention settings

### Replay Functionality
Restore previous task graphs using stored artifacts:
```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    replay-artifact-id: 'taskmaster-task-graph-2024-01-15T10-30-00'
```

### Retention Policies
Configure automatic cleanup of expired artifacts:
```yaml
- uses: cmbrose/task-master-issues-justtasks@v1
  with:
    cleanup-artifacts: 'true'
  env:
    ARTIFACT_RETENTION_DAYS: '30d'
    ARTIFACT_RETENTION_COUNT: '10'
```

### Structured Logging
All artifact operations are logged with structured data:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "operation": "upload",
  "location": "artifacts/taskmaster/task-graph.json",
  "taskCount": 25,
  "complexityScores": {"min": 2, "max": 8, "average": 5.2},
  "hierarchyDepth": 4,
  "prdVersion": "prd-abc123"
}
```

## Task Issue Format

Generated issues include:

- **YAML Front-matter**: Contains task metadata including ID, dependencies, and complexity
- **Task Description**: Detailed task description from the PRD
- **Labels**: Automatic labeling with 'task' and dependency status
- **Hierarchy**: Parent-child relationships using GitHub's Sub-issues API

## Workflows

This action supports multiple workflows:

- **Main Generation**: Triggered on PRD file changes
- **Dependency Watching**: Monitors issue closures and updates blocked status
- **Manual Breakdown**: Supports `/breakdown` commands for on-demand task creation
- **Replay/Recovery**: Recovers from failures using stored artifacts

## Example PRD Structure

```markdown
# Feature: User Authentication

## Overview
Implement user authentication system...

## Requirements
- User registration
- Login/logout functionality
- Password reset
- Session management

## Technical Details
- Use JWT tokens
- Implement OAuth2
- Database schema design
```

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure the workflow has `issues: write` permission
2. **PRD Not Found**: Check the `prd-path-glob` pattern matches your file structure
3. **Complexity Too High**: Adjust `complexity-threshold` if tasks are being filtered out
4. **Rate Limiting**: The action includes automatic retry logic for GitHub API rate limits
5. **CLI Binary Issues**: Check network connectivity and platform support for binary downloads
6. **Checksum Validation**: Ensure binary integrity by verifying checksums match expected values

### Debug Mode

Enable debug logging by setting the `taskmaster-args` input:

```yaml
with:
  taskmaster-args: '--verbose --debug'
```

### CLI Integration

For detailed information about the Taskmaster CLI integration, see [CLI_INTEGRATION.md](docs/CLI_INTEGRATION.md).

## Contributing

This action is part of the Taskmaster ecosystem. For bugs and feature requests, please create an issue in the repository.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.