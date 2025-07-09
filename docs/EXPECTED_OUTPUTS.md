# Expected Outputs Documentation

## Overview

This document outlines the expected outputs when processing different types of PRD files with the Taskmaster Issues Generator. It includes examples of generated task graphs, GitHub Issues, and artifacts.

## Simple Blog Platform Example

### Input PRD
File: `docs/examples/simple-blog.prd.md`

### Expected Task Graph Output

```json
{
  "master": {
    "tasks": [
      {
        "id": 1,
        "title": "Setup Authentication System",
        "description": "Implement user authentication with JWT tokens including registration, login, and logout functionality",
        "complexity": 6,
        "priority": "high",
        "dependencies": [],
        "status": "pending",
        "labels": ["authentication", "backend", "security"]
      },
      {
        "id": 2,
        "title": "Create Database Schema",
        "description": "Design and implement PostgreSQL database schema for users, posts, and comments",
        "complexity": 4,
        "priority": "high",
        "dependencies": [],
        "status": "pending",
        "labels": ["database", "schema", "backend"]
      },
      {
        "id": 3,
        "title": "Implement Posts API",
        "description": "Create REST API endpoints for CRUD operations on blog posts",
        "complexity": 5,
        "priority": "medium",
        "dependencies": [1, 2],
        "status": "pending",
        "labels": ["api", "backend", "posts"]
      },
      {
        "id": 4,
        "title": "Build Comments System",
        "description": "Implement commenting functionality including API endpoints and database operations",
        "complexity": 4,
        "priority": "medium",
        "dependencies": [2, 3],
        "status": "pending",
        "labels": ["comments", "backend", "api"]
      },
      {
        "id": 5,
        "title": "Create Frontend Components",
        "description": "Build React components for blog post listing, creation, editing, and viewing",
        "complexity": 7,
        "priority": "medium",
        "dependencies": [3],
        "status": "pending",
        "labels": ["frontend", "react", "ui"]
      },
      {
        "id": 6,
        "title": "Implement Search Functionality",
        "description": "Add search capabilities for blog posts with filtering and sorting",
        "complexity": 3,
        "priority": "low",
        "dependencies": [3, 5],
        "status": "pending",
        "labels": ["search", "frontend", "backend"]
      },
      {
        "id": 7,
        "title": "Create Responsive Design",
        "description": "Implement responsive design for mobile and desktop compatibility",
        "complexity": 4,
        "priority": "medium",
        "dependencies": [5],
        "status": "pending",
        "labels": ["responsive", "css", "frontend"]
      },
      {
        "id": 8,
        "title": "Setup Testing Suite",
        "description": "Implement comprehensive testing including unit, integration, and e2e tests",
        "complexity": 6,
        "priority": "high",
        "dependencies": [1, 3, 4, 5],
        "status": "pending",
        "labels": ["testing", "quality", "automation"]
      }
    ]
  },
  "metadata": {
    "version": "1.0.0",
    "generated": "2024-01-15T10:30:00.000Z",
    "source": "docs/examples/simple-blog.prd.md",
    "taskCount": 8,
    "complexityScores": {
      "min": 3,
      "max": 7,
      "average": 4.9
    },
    "hierarchyDepth": 3,
    "prdVersion": "prd-simple-blog-v1"
  }
}
```

### Expected GitHub Issues

#### Issue #1: Setup Authentication System
```yaml
---
id: 1
title: "Setup Authentication System"
parent: []
dependents: [3, 8]
complexity: 6
priority: high
status: pending
---

## Details
Implement user authentication with JWT tokens including registration, login, and logout functionality

## Technical Requirements
- JWT token generation and validation
- User registration with email/password
- Secure login/logout endpoints
- Password hashing with bcrypt
- Session management

## API Endpoints
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- POST /api/auth/logout - User logout

## Dependencies
*No dependencies*

## Meta
- Status: `pending`
- Priority: `high`
- Complexity: `6 / 10`
- Required By:
  - [ ] #3 Implement Posts API
  - [ ] #8 Setup Testing Suite
```

**Labels Applied:**
- `task`
- `priority:high`
- `complexity:medium`
- `authentication`
- `backend`
- `security`

#### Issue #3: Implement Posts API
```yaml
---
id: 3
title: "Implement Posts API"
parent: [1, 2]
dependents: [4, 5, 6, 8]
complexity: 5
priority: medium
status: pending
---

## Details
Create REST API endpoints for CRUD operations on blog posts

## Technical Requirements
- RESTful API design
- Request validation
- Error handling
- Authentication middleware
- Database integration

## API Endpoints
- GET /api/posts - List all posts
- POST /api/posts - Create new post
- GET /api/posts/:id - Get specific post
- PUT /api/posts/:id - Update post
- DELETE /api/posts/:id - Delete post

## Dependencies
- [ ] #1 Setup Authentication System
- [ ] #2 Create Database Schema

## Meta
- Status: `pending`
- Priority: `medium`
- Complexity: `5 / 10`
- Required By:
  - [ ] #4 Build Comments System
  - [ ] #5 Create Frontend Components
  - [ ] #6 Implement Search Functionality
  - [ ] #8 Setup Testing Suite
```

**Labels Applied:**
- `task`
- `blocked` (dependencies not complete)
- `priority:medium`
- `complexity:medium`
- `api`
- `backend`
- `posts`

## E-commerce Platform Example

### Input PRD
File: `docs/examples/ecommerce-platform.prd.md`

### Expected Task Count
Given the complexity, this would generate approximately 25-30 tasks with varying complexity levels.

### Sample High-Level Tasks

```json
{
  "master": {
    "tasks": [
      {
        "id": 1,
        "title": "Setup Microservices Architecture",
        "description": "Design and implement microservices architecture with API Gateway",
        "complexity": 9,
        "priority": "high",
        "dependencies": [],
        "status": "pending"
      },
      {
        "id": 2,
        "title": "Implement User Authentication Service",
        "description": "Create comprehensive authentication service with JWT, OAuth2, and social login",
        "complexity": 8,
        "priority": "high",
        "dependencies": [1],
        "status": "pending"
      },
      {
        "id": 3,
        "title": "Build Product Catalog Service",
        "description": "Develop product catalog with search, filtering, and categorization",
        "complexity": 7,
        "priority": "high",
        "dependencies": [1],
        "status": "pending"
      },
      {
        "id": 4,
        "title": "Implement Shopping Cart Service",
        "description": "Create shopping cart functionality with persistence and user sessions",
        "complexity": 6,
        "priority": "medium",
        "dependencies": [2, 3],
        "status": "pending"
      },
      {
        "id": 5,
        "title": "Setup Payment Processing",
        "description": "Integrate payment gateways (Stripe, PayPal) with PCI DSS compliance",
        "complexity": 9,
        "priority": "high",
        "dependencies": [2, 4],
        "status": "pending"
      }
    ]
  }
}
```

### Complexity Filtering Examples

With `complexity-threshold: 30`:
- Would include tasks with complexity ≤ 30
- Most tasks would be included
- Very complex tasks (complexity 35+) would be excluded

With `complexity-threshold: 50`:
- Would include all tasks
- No filtering applied

With `complexity-threshold: 20`:
- Would exclude high-complexity tasks
- Only simpler, more granular tasks included

## Artifact Structure

### Task Graph Artifact
```
artifacts/
├── taskmaster/
│   ├── task-graph.json           # Main task graph
│   ├── metadata.json            # Enhanced metadata
│   └── prd-checksums.json       # PRD version tracking
└── logs/
    └── artifact-operations.log   # Operation logs
```

### Metadata Example
```json
{
  "version": "1.0.0",
  "generated": "2024-01-15T10:30:00.000Z",
  "source": "docs/examples/simple-blog.prd.md",
  "taskCount": 8,
  "complexityScores": {
    "min": 3,
    "max": 7,
    "average": 4.9
  },
  "hierarchyDepth": 3,
  "prdVersion": "prd-simple-blog-v1",
  "retention": {
    "retentionDays": 30,
    "retentionCount": 10
  },
  "configuration": {
    "complexityThreshold": 40,
    "maxDepth": 3,
    "breakdownMaxDepth": 2
  },
  "performance": {
    "processingTime": 45.6,
    "memoryUsage": 124.8,
    "prdFileSize": 2152
  }
}
```

## Dry-Run Output

When running in dry-run mode, the action posts a preview comment to the pull request:

### Sample Preview Comment

```markdown
## 🔍 Taskmaster PRD Analysis Preview

### Files Processed
- `docs/examples/simple-blog.prd.md`

### Task Summary
- **Total Tasks**: 8
- **Complexity Range**: 3-7 (Average: 4.9)
- **Hierarchy Depth**: 3 levels
- **High Priority**: 3 tasks
- **Medium Priority**: 4 tasks
- **Low Priority**: 1 task

### Generated Tasks

#### 📋 High Priority Tasks
1. **Setup Authentication System** (Complexity: 6)
   - Dependencies: None
   - Required by: Implement Posts API, Setup Testing Suite

2. **Create Database Schema** (Complexity: 4)
   - Dependencies: None
   - Required by: Implement Posts API, Build Comments System

3. **Setup Testing Suite** (Complexity: 6)
   - Dependencies: Authentication System, Posts API, Comments System, Frontend Components
   - Required by: None

#### 📋 Medium Priority Tasks
4. **Implement Posts API** (Complexity: 5)
   - Dependencies: Authentication System, Database Schema
   - Required by: Comments System, Frontend Components, Search Functionality

5. **Build Comments System** (Complexity: 4)
   - Dependencies: Database Schema, Posts API
   - Required by: Testing Suite

6. **Create Frontend Components** (Complexity: 7)
   - Dependencies: Posts API
   - Required by: Search Functionality, Responsive Design, Testing Suite

7. **Create Responsive Design** (Complexity: 4)
   - Dependencies: Frontend Components
   - Required by: None

#### 📋 Low Priority Tasks
8. **Implement Search Functionality** (Complexity: 3)
   - Dependencies: Posts API, Frontend Components
   - Required by: Testing Suite

### Configuration Used
- **Complexity Threshold**: 40
- **Max Depth**: 3
- **Breakdown Max Depth**: 2

### 🎯 Next Steps
If this looks correct, merge this PR to create the GitHub Issues automatically.
```

## Error Scenarios

### Invalid PRD Format
```markdown
## ❌ PRD Processing Error

### Error Details
- **File**: `docs/invalid.prd.md`
- **Error**: Invalid markdown structure
- **Details**: Missing required sections: Overview, Requirements

### Recommendations
1. Ensure PRD follows the standard format
2. Include required sections: Overview, Requirements, Technical Details
3. Use proper markdown syntax
4. Review existing examples in `docs/examples/`
```

### Complexity Threshold Exceeded
```markdown
## ⚠️ Tasks Filtered by Complexity

### Summary
- **Total Tasks Generated**: 15
- **Tasks Above Threshold**: 8
- **Tasks Included**: 7
- **Complexity Threshold**: 30

### Filtered Tasks
The following tasks were excluded due to high complexity:
1. **Setup Microservices Architecture** (Complexity: 45)
2. **Implement Payment Processing** (Complexity: 42)
3. **Create Admin Dashboard** (Complexity: 38)

### Recommendations
- Consider increasing complexity threshold to include more tasks
- Break down complex tasks into smaller, manageable pieces
- Review task breakdown configuration
```

## Performance Metrics

### Sample Performance Report
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "prdFile": "docs/examples/simple-blog.prd.md",
  "metrics": {
    "processingTime": 45.6,
    "memoryUsage": 124.8,
    "taskCount": 8,
    "complexityAnalysis": {
      "min": 3,
      "max": 7,
      "average": 4.9
    },
    "apiCalls": {
      "total": 12,
      "successful": 12,
      "failed": 0
    },
    "artifactSize": 15.2
  },
  "performance": {
    "meetsRequirements": true,
    "processingTimeTarget": 300,
    "memoryUsageTarget": 512
  }
}
```

## Workflow Outputs

### Action Outputs
```yaml
outputs:
  task-count: "8"
  artifact-url: "https://github.com/owner/repo/actions/runs/123456789/artifacts/987654321"
  processing-time: "45.6"
  complexity-average: "4.9"
  hierarchy-depth: "3"
  prd-version: "prd-simple-blog-v1"
```

### Step Summary
```
✅ PRD Processing Complete
📁 Files Processed: 1
📋 Tasks Generated: 8
⏱️ Processing Time: 45.6s
🎯 Complexity Average: 4.9
📊 Hierarchy Depth: 3
🔗 Artifact URL: https://github.com/owner/repo/actions/runs/123456789/artifacts/987654321
```

## Integration with GitHub Features

### Sub-issue Relationships
Tasks are linked using GitHub's Sub-issues API:
- Parent tasks show child tasks in the issue sidebar
- Child tasks display parent task references
- Hierarchy is maintained through GitHub's native features

### Automated Labels
- `task`: Applied to all generated issues
- `blocked`: Applied when dependencies are not complete
- `priority:high/medium/low`: Based on task priority analysis
- `complexity:high/medium/low`: Based on complexity scores
- Custom labels: Based on task content and categories

### Issue Templates
Generated issues follow a consistent template:
- YAML front-matter with metadata
- Structured description with technical details
- Dependency tracking with checkboxes
- Meta information section
- Consistent formatting and organization

This documentation provides a comprehensive view of what users can expect when using the Taskmaster Issues Generator with different types of PRD files and configurations.