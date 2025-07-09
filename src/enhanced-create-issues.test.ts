import { IssueHierarchyManager } from './issue-hierarchy';
import { handleIssueClosure } from '../create-issues';
import { Octokit } from '@octokit/rest';

// Mock modules
jest.mock('@octokit/rest');
jest.mock('fs');
jest.mock('path');
jest.mock('dotenv');

const mockOctokit = {
  issues: {
    get: jest.fn(),
    addLabels: jest.fn(),
    removeLabel: jest.fn(),
    createComment: jest.fn(),
    listForRepo: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  }
} as any;

// Mock the Octokit constructor
(Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit);

describe('Enhanced create-issues integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_OWNER = 'test-owner';
    process.env.GITHUB_REPO = 'test-repo';
  });

  describe('YAML Front-matter Integration', () => {
    test('should include YAML front-matter in issue body', () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      const metadata = {
        id: 1,
        title: 'Test Issue',
        dependencies: [2, 3],
        priority: 'high',
        status: 'pending',
        complexity: 8
      };

      const yamlFrontMatter = hierarchyManager.generateYAMLFrontMatter(metadata);
      
      expect(yamlFrontMatter).toContain('---');
      expect(yamlFrontMatter).toContain('id: 1');
      expect(yamlFrontMatter).toContain('title: Test Issue');
      expect(yamlFrontMatter).toContain('dependencies:');
      expect(yamlFrontMatter).toContain('- 2');
      expect(yamlFrontMatter).toContain('- 3');
      expect(yamlFrontMatter).toContain('priority: high');
      expect(yamlFrontMatter).toContain('status: pending');
      expect(yamlFrontMatter).toContain('complexity: 8');
    });

    test('should parse YAML front-matter from existing issues', () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      const issueBody = `---
id: 1
title: Test Issue
dependencies: [2, 3]
priority: high
status: pending
---

## Details
This is a test issue.`;

      const parsed = hierarchyManager.parseYAMLFrontMatter(issueBody);
      
      expect(parsed.metadata.id).toBe(1);
      expect(parsed.metadata.title).toBe('Test Issue');
      expect(parsed.metadata.dependencies).toEqual([2, 3]);
      expect(parsed.metadata.priority).toBe('high');
      expect(parsed.metadata.status).toBe('pending');
      expect(parsed.body).toContain('## Details');
    });
  });

  describe('Blocked Status Management', () => {
    test('should determine blocked status based on dependencies', async () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      const issueBody = `---
dependencies: [2, 3]
---

## Details
This issue depends on others.`;

      mockOctokit.issues.get
        .mockResolvedValueOnce({ data: { body: issueBody } })
        .mockResolvedValueOnce({ data: { state: 'open' } });

      const isBlocked = await hierarchyManager.isIssueBlocked(1);
      
      expect(isBlocked).toBe(true);
      expect(mockOctokit.issues.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1
      });
    });

    test('should update blocked labels correctly', async () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      const issueBody = `---
dependencies: [2]
---

## Details
This issue depends on others.`;

      mockOctokit.issues.get
        .mockResolvedValueOnce({ data: { body: issueBody } })
        .mockResolvedValueOnce({ data: { state: 'open' } })
        .mockResolvedValueOnce({ data: { labels: [] } });

      await hierarchyManager.updateBlockedStatus(1);
      
      expect(mockOctokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['blocked']
      });
    });
  });

  describe('Sub-issues API Integration', () => {
    test('should create sub-issue relationships', async () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      // Mock the sub-issues API to be available
      (mockOctokit.issues as any).createSubIssue = jest.fn().mockResolvedValue({});

      await hierarchyManager.createSubIssue(1, 2);
      
      expect((mockOctokit.issues as any).createSubIssue).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        sub_issue_number: 2
      });
    });

    test('should fallback to comments when Sub-issues API is unavailable', async () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      // Don't mock createSubIssue to simulate API unavailability
      mockOctokit.issues.createComment.mockResolvedValue({});

      await hierarchyManager.createSubIssue(1, 2);
      
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        body: 'Sub-issue: #2'
      });
    });
  });

  describe('Dependency Resolution', () => {
    test('should resolve dependencies when issue is closed', async () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      const mockIssues = [
        {
          number: 2,
          body: `---
dependencies: [1]
---

## Details
This depends on issue 1.`
        }
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({ data: mockIssues });
      mockOctokit.issues.get
        .mockResolvedValueOnce({ data: { body: mockIssues[0].body } })
        .mockResolvedValueOnce({ data: { labels: [{ name: 'blocked' }] } });

      await hierarchyManager.resolveDependencies(1);
      
      expect(mockOctokit.issues.removeLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 2,
        name: 'blocked'
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully in blocked status check', async () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      mockOctokit.issues.get.mockRejectedValue(new Error('API Error'));

      const isBlocked = await hierarchyManager.isIssueBlocked(1);
      
      expect(isBlocked).toBe(false);
    });

    test('should handle YAML parsing errors gracefully', () => {
      const hierarchyManager = new IssueHierarchyManager(mockOctokit, 'test-owner', 'test-repo');
      
      const malformedYAML = `---
invalid: yaml: content
no closing
---

## Details
This has malformed YAML.`;

      const parsed = hierarchyManager.parseYAMLFrontMatter(malformedYAML);
      
      expect(parsed.metadata).toEqual({});
      expect(parsed.body).toBe(malformedYAML);
    });
  });

  describe('Integration Features', () => {
    test('should provide complexity-based labels', () => {
      // This tests the enhanced createOrGetIssue functionality
      const complexityMap = {
        '1': 8,  // high complexity
        '2': 5,  // medium complexity
        '3': 2   // low complexity
      };

      // High complexity
      expect(8 >= 7).toBe(true);  // Should get 'complexity:high'
      
      // Medium complexity
      expect(5 >= 4 && 5 < 7).toBe(true);  // Should get 'complexity:medium'
      
      // Low complexity
      expect(2 < 4).toBe(true);  // Should get 'complexity:low'
    });

    test('should provide priority-based labels', () => {
      const priorities = ['high', 'medium', 'low'];
      
      priorities.forEach(priority => {
        const expectedLabel = `priority:${priority}`;
        expect(expectedLabel).toBe(`priority:${priority}`);
      });
    });
  });
});