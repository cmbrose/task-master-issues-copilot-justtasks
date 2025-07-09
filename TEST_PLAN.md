# Test Plan for Taskmaster Generate Workflow

## Test Scenarios

### 1. Workflow Triggers
- [x] Push to `docs/**.prd.md` files
- [x] Manual dispatch with custom parameters
- [x] Scheduled runs (daily at 6 AM UTC)

### 2. Task Graph Generation
- [x] Validates PRD files exist
- [x] Generates task graph with proper structure
- [x] Validates JSON output
- [x] Filters tasks by complexity threshold
- [x] Respects max depth limitations

### 3. Issue Creation
- [x] Creates GitHub issues with YAML front-matter
- [x] Applies proper labels ('task', 'blocked', priority, complexity)
- [x] Implements rate limiting with exponential backoff
- [x] Handles idempotency (no duplicates)
- [x] Updates existing issues when needed

### 4. Dependency Management
- [x] Creates sub-issue relationships via Sub-issues API
- [x] Updates dependency links in issue bodies
- [x] Manages 'blocked' status based on open dependencies
- [x] Handles required-by relationships

### 5. Error Handling
- [x] Graceful handling of API failures
- [x] Validation of task graph structure
- [x] Proper error messages and logging
- [x] Fallback for sub-issue API failures

### 6. Performance & Reliability
- [x] Rate limiting with exponential backoff
- [x] Batch processing with delays
- [x] Artifact storage for debugging
- [x] Comprehensive logging and summaries

## Key Features Implemented

1. **YAML Front-matter**: Issues include structured metadata
2. **Proper Labeling**: 'task', 'blocked', priority, and complexity labels
3. **Sub-issues API**: Hierarchy relationships using GitHub's Sub-issues API
4. **Rate Limiting**: Exponential backoff for API calls
5. **Idempotency**: Prevents duplicate issues, updates existing ones
6. **Error Handling**: Graceful degradation and comprehensive logging
7. **Artifact Storage**: Task graphs stored for debugging and replay

## Expected Behavior

### Issue Structure
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
Task description and details...

## Dependencies
- [ ] #123
- [x] #124

## Meta
- Status: `pending`
- Priority: `high`
- Complexity: `8 / 10`
- Required By:
   - [ ] #125
   - [ ] #126
```

### Labels Applied
- `task` (all issues)
- `blocked` (if dependencies are open)
- `priority:high/medium/low` (based on task priority)
- `complexity:high/medium/low` (based on complexity score)

### Workflow Outputs
- Task graph artifact
- Comprehensive step summary
- Issue creation logs
- Dependency relationship logs