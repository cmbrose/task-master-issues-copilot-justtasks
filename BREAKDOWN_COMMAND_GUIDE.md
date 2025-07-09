# Manual Breakdown Command System

## Overview

The Manual Breakdown Command System allows users to break down complex GitHub issues into smaller, manageable sub-issues using a simple slash command interface. This system integrates with the existing Taskmaster issue hierarchy and provides automated sub-issue creation, linking, and parent issue management.

## Usage

### Basic Command

To break down an issue, simply comment on the issue with:

```
/breakdown
```

This will use default parameters:
- **Depth**: 2 levels
- **Threshold**: 10 complexity points

### Advanced Parameters

You can customize the breakdown behavior using optional parameters:

```
/breakdown --depth 1 --threshold 15
```

#### Parameters

- `--depth N`: Maximum depth for breakdown (default: 2, max: 2)
- `--threshold X`: Complexity threshold for breakdown (default: 10)

### Examples

```bash
# Basic breakdown with defaults
/breakdown

# Breakdown with custom depth
/breakdown --depth 1

# Breakdown with custom threshold
/breakdown --threshold 20

# Breakdown with both parameters
/breakdown --depth 2 --threshold 15
```

## How It Works

### 1. Command Detection

The system monitors all issue comments for the `/breakdown` command using GitHub Actions workflow triggers.

### 2. Parameter Parsing

When a breakdown command is detected, the system:
- Extracts depth and threshold parameters
- Validates parameters against limits
- Enforces maximum depth limit (2 levels)

### 3. Issue Analysis

The system:
- Fetches the parent issue
- Parses YAML front-matter metadata
- Extracts task information (ID, title, description, complexity, etc.)

### 4. Breakdown Execution

The system:
- Executes the Taskmaster CLI with breakdown parameters
- Generates sub-tasks based on the parent task
- Validates CLI output for proper structure

### 5. Sub-Issue Creation

For each generated sub-task:
- Creates a new GitHub issue
- Adds YAML front-matter with metadata
- Applies appropriate labels (priority, complexity, sub-issue)
- Links to parent issue via Sub-issues API

### 6. Parent Issue Management

After successful breakdown:
- Updates parent issue with breakdown metadata
- Adds breakdown summary to issue body
- Closes the parent issue (marked as completed)

### 7. Completion

The system:
- Adds a thumbs-up reaction to the command comment
- Posts a summary comment with breakdown results
- Provides links to all created sub-issues

## Features

### ✅ Idempotency Protection

The system prevents duplicate breakdowns by:
- Checking for existing breakdown metadata
- Verifying no sub-issues already exist
- Skipping execution if breakdown already performed

### ✅ Error Handling

Comprehensive error handling for:
- Invalid YAML metadata
- CLI execution failures
- Sub-issue creation errors
- API rate limiting
- Network issues

### ✅ Validation

The system validates:
- Command syntax and parameters
- Depth limits (max 2 levels)
- Issue metadata requirements
- CLI output structure

### ✅ Reaction Feedback

Visual feedback through reactions:
- 👀 Eyes: Processing started
- 👍 Thumbs up: Success
- 👎 Thumbs down: Failure

## Requirements

### Issue Prerequisites

For an issue to be eligible for breakdown:

1. **YAML Front-matter**: Issue must have proper YAML metadata
2. **Task ID**: Must include a valid task ID in metadata
3. **No existing breakdown**: Must not have been broken down already
4. **No sub-issues**: Must not have existing sub-issues

### Example Issue Format

```markdown
---
id: 1
title: "Implement User Authentication"
dependencies: [2, 3]
priority: high
status: pending
complexity: 8
---

## Details
Implement a comprehensive user authentication system...

## Test Strategy
Test login, logout, and session management...
```

## Workflow Integration

The breakdown command system integrates seamlessly with existing workflows:

### 1. Issue Hierarchy
- Leverages existing `IssueHierarchyManager`
- Uses Sub-issues API for parent-child relationships
- Maintains YAML front-matter consistency

### 2. Dependency Management
- Works with existing dependency tracking
- Updates blocked status automatically
- Integrates with dependency watcher

### 3. CLI Integration
- Uses existing `TaskmasterCLIManager`
- Supports mock CLI for testing
- Handles CLI execution and output parsing

## Security & Permissions

### Required Permissions

The workflow requires:
- `issues: write` - Create and modify issues
- `contents: read` - Access repository content

### Security Features

- Input validation and sanitization
- Parameter limits enforcement
- Error handling without sensitive data exposure
- Rate limiting protection

## Monitoring & Debugging

### Workflow Logs

The GitHub Actions workflow provides detailed logging:
- Command parsing results
- CLI execution output
- Sub-issue creation status
- Error details and stack traces

### Summary Reports

Each execution generates a summary including:
- Issue number and command details
- Parameters used
- Success/failure status
- Sub-issues created
- Execution timestamp

## Error Scenarios

### Common Issues

1. **Missing YAML Metadata**
   - Error: "Issue does not have required YAML metadata"
   - Solution: Add proper YAML front-matter to issue

2. **Already Broken Down**
   - Message: "Issue has already been broken down"
   - Behavior: Skips execution (idempotency)

3. **CLI Execution Failure**
   - Error: CLI-specific error message
   - Behavior: Adds failure reaction and comment

4. **No Subtasks Generated**
   - Message: "No subtasks generated, task may be appropriate granularity"
   - Behavior: Successful completion with no sub-issues

## Testing

### Unit Tests

Comprehensive test suite covering:
- Command parsing logic
- Parameter validation
- Error handling
- Idempotency checks
- Sub-issue creation
- Parent issue management

### Integration Tests

Integration testing validates:
- Workflow file configuration
- Module loading and execution
- Mock CLI functionality
- End-to-end command flow

### Manual Testing

To manually test the system:

1. Create a test issue with proper YAML metadata
2. Comment with `/breakdown` command
3. Monitor workflow execution in Actions tab
4. Verify sub-issues are created and linked
5. Check parent issue is updated and closed

## Limitations

### Current Limitations

1. **Maximum Depth**: Limited to 2 levels to prevent excessive nesting
2. **CLI Dependency**: Requires Taskmaster CLI for breakdown logic
3. **Single Command**: Only supports `/breakdown` command format
4. **GitHub Issues**: Only works with GitHub Issues, not other platforms

### Future Enhancements

Potential improvements:
- Support for additional breakdown strategies
- Integration with project boards
- Custom breakdown templates
- Bulk breakdown operations
- Advanced filtering and sorting

## Troubleshooting

### Common Solutions

1. **Check YAML Format**: Ensure valid YAML front-matter
2. **Verify Permissions**: Confirm workflow has required permissions
3. **Review Logs**: Check GitHub Actions workflow logs
4. **Test CLI**: Verify mock CLI is available and functional
5. **Validate Issue**: Ensure issue meets breakdown requirements

### Support

For issues or questions:
1. Check workflow execution logs
2. Review issue YAML metadata
3. Verify command syntax
4. Test with simpler parameters
5. Create a new issue with details

---

*This breakdown command system is part of the Taskmaster GitHub Issues automation suite, designed to streamline task management and issue hierarchy.*