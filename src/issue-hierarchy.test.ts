import { IssueHierarchyManager, IssueMetadata, ParsedIssue } from './issue-hierarchy';
import { Octokit } from '@octokit/rest';

// Mock the Octokit instance
const mockOctokit = {
  issues: {
    get: jest.fn(),
    addLabels: jest.fn(),
    removeLabel: jest.fn(),
    createComment: jest.fn(),
    listForRepo: jest.fn(),
    update: jest.fn()
  }
} as any;

describe('IssueHierarchyManager', () => {
  let hierarchyManager: IssueHierarchyManager;
  const owner = 'test-owner';
  const repo = 'test-repo';

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    hierarchyManager = new IssueHierarchyManager(mockOctokit, owner, repo);
  });

  describe('parseYAMLFrontMatter', () => {
    test('should parse YAML front-matter correctly', () => {
      const issueBody = `---
id: 1
title: "Test Issue"
dependencies: [2, 3]
priority: high
status: pending
---

## Details
This is the issue details.`;

      const result = hierarchyManager.parseYAMLFrontMatter(issueBody);
      
      expect(result.metadata.id).toBe(1);
      expect(result.metadata.title).toBe('Test Issue');
      expect(result.metadata.dependencies).toEqual([2, 3]);
      expect(result.metadata.priority).toBe('high');
      expect(result.metadata.status).toBe('pending');
      expect(result.body).toBe('\n## Details\nThis is the issue details.');
    });

    test('should handle issue without YAML front-matter', () => {
      const issueBody = `## Details
This is the issue details without YAML front-matter.`;

      const result = hierarchyManager.parseYAMLFrontMatter(issueBody);
      
      expect(result.metadata).toEqual({});
      expect(result.body).toBe(issueBody);
    });

    test('should handle malformed YAML gracefully', () => {
      const issueBody = `---
id: 1
title: "Test Issue"
dependencies: [2, 3
---

## Details
This is the issue details.`;

      const result = hierarchyManager.parseYAMLFrontMatter(issueBody);
      
      expect(result.metadata).toEqual({});
      expect(result.body).toBe(issueBody);
    });

    test('should handle empty YAML front-matter', () => {
      const issueBody = `---
---

## Details
This is the issue details.`;

      const result = hierarchyManager.parseYAMLFrontMatter(issueBody);
      
      expect(result.metadata).toEqual({});
      expect(result.body).toBe('\n## Details\nThis is the issue details.');
    });
  });

  describe('generateYAMLFrontMatter', () => {
    test('should generate YAML front-matter correctly', () => {
      const metadata: IssueMetadata = {
        id: 1,
        title: 'Test Issue',
        dependencies: [2, 3],
        priority: 'high',
        status: 'pending'
      };

      const result = hierarchyManager.generateYAMLFrontMatter(metadata);
      
      expect(result).toContain('---\n');
      expect(result).toContain('id: 1\n');
      expect(result).toContain('title: Test Issue\n');
      expect(result).toContain('dependencies:\n  - 2\n  - 3\n');
      expect(result).toContain('priority: high\n');
      expect(result).toContain('status: pending\n');
      expect(result).toContain('---\n');
    });

    test('should return empty string for empty metadata', () => {
      const result = hierarchyManager.generateYAMLFrontMatter({});
      expect(result).toBe('');
    });

    test('should return empty string for null metadata', () => {
      const result = hierarchyManager.generateYAMLFrontMatter(null as any);
      expect(result).toBe('');
    });
  });

  describe('isIssueBlocked', () => {
    test('should return true when issue has open dependencies', async () => {
      const issueBody = `---
dependencies: [2, 3]
---

## Details
This issue depends on others.`;

      mockOctokit.issues.get
        .mockResolvedValueOnce({ data: { body: issueBody } })  // For getting the issue itself
        .mockResolvedValueOnce({ data: { state: 'open' } });     // For dependency 2 (stops here since it's open)

      const result = await hierarchyManager.isIssueBlocked(1);
      
      expect(result).toBe(true);
      expect(mockOctokit.issues.get).toHaveBeenCalledTimes(2); // Only calls get for issue 1 and dependency 2
    });

    test('should return false when all dependencies are closed', async () => {
      const issueBody = `---
dependencies: [2, 3]
---

## Details
This issue depends on others.`;

      mockOctokit.issues.get
        .mockResolvedValueOnce({ data: { body: issueBody } })  // For getting the issue itself
        .mockResolvedValueOnce({ data: { state: 'closed' } })  // For dependency 2
        .mockResolvedValueOnce({ data: { state: 'closed' } }); // For dependency 3

      const result = await hierarchyManager.isIssueBlocked(1);
      
      expect(result).toBe(false);
      expect(mockOctokit.issues.get).toHaveBeenCalledTimes(3);
    });

    test('should return false when issue has no dependencies', async () => {
      const issueBody = `---
id: 1
---

## Details
This issue has no dependencies.`;

      mockOctokit.issues.get.mockResolvedValueOnce({ data: { body: issueBody } });

      const result = await hierarchyManager.isIssueBlocked(1);
      
      expect(result).toBe(false);
      expect(mockOctokit.issues.get).toHaveBeenCalledTimes(1);
    });

    test('should handle API errors gracefully', async () => {
      mockOctokit.issues.get.mockRejectedValue(new Error('API Error'));

      const result = await hierarchyManager.isIssueBlocked(1);
      
      expect(result).toBe(false);
    });
  });

  describe('updateBlockedStatus', () => {
    test('should add blocked label when issue is blocked', async () => {
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
        owner,
        repo,
        issue_number: 1,
        labels: ['blocked']
      });
    });

    test('should remove blocked label when issue is not blocked', async () => {
      const issueBody = `---
dependencies: [2]
---

## Details
This issue depends on others.`;

      mockOctokit.issues.get
        .mockResolvedValueOnce({ data: { body: issueBody } })
        .mockResolvedValueOnce({ data: { state: 'closed' } })
        .mockResolvedValueOnce({ data: { labels: [{ name: 'blocked' }] } });

      await hierarchyManager.updateBlockedStatus(1);
      
      expect(mockOctokit.issues.removeLabel).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: 1,
        name: 'blocked'
      });
    });

    test('should handle API errors gracefully', async () => {
      mockOctokit.issues.get.mockRejectedValue(new Error('API Error'));

      await expect(hierarchyManager.updateBlockedStatus(1)).resolves.not.toThrow();
    });
  });

  describe('createSubIssue', () => {
    test('should create sub-issue relationship successfully when API is available', async () => {
      (mockOctokit.issues as any).createSubIssue = jest.fn().mockResolvedValue({});

      await hierarchyManager.createSubIssue(1, 2);
      
      expect((mockOctokit.issues as any).createSubIssue).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: 1,
        sub_issue_number: 2
      });
    });

    test('should fallback to comment when Sub-issues API is unavailable', async () => {
      // Remove the createSubIssue method to simulate API unavailability
      delete (mockOctokit.issues as any).createSubIssue;
      mockOctokit.issues.createComment.mockResolvedValue({});

      await hierarchyManager.createSubIssue(1, 2);
      
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: 1,
        body: 'Sub-issue: #2'
      });
    });

    test('should fallback to comment when Sub-issues API fails', async () => {
      (mockOctokit.issues as any).createSubIssue = jest.fn().mockRejectedValue(new Error('API Error'));
      mockOctokit.issues.createComment.mockResolvedValue({});

      await hierarchyManager.createSubIssue(1, 2);
      
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: 1,
        body: 'Sub-issue: #2'
      });
    });
  });

  describe('getSubIssues', () => {
    test('should return sub-issues successfully when API is available', async () => {
      const mockSubIssues = [
        { number: 2, title: 'Sub-issue 1' },
        { number: 3, title: 'Sub-issue 2' }
      ];

      (mockOctokit.issues as any).listSubIssues = jest.fn().mockResolvedValue({ data: mockSubIssues });

      const result = await hierarchyManager.getSubIssues(1);
      
      expect(result).toEqual(mockSubIssues);
      expect((mockOctokit.issues as any).listSubIssues).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: 1
      });
    });

    test('should return empty array when API is unavailable', async () => {
      // Remove the listSubIssues method to simulate API unavailability
      delete (mockOctokit.issues as any).listSubIssues;

      const result = await hierarchyManager.getSubIssues(1);
      
      expect(result).toEqual([]);
    });

    test('should handle API errors gracefully', async () => {
      (mockOctokit.issues as any).listSubIssues = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await hierarchyManager.getSubIssues(1);
      
      expect(result).toEqual([]);
    });
  });

  describe('resolveDependencies', () => {
    test('should update blocked status for dependent issues', async () => {
      const mockIssues = [
        {
          number: 2,
          body: `---
dependencies: [1]
---

## Details
This depends on issue 1.`
        },
        {
          number: 3,
          body: `---
dependencies: [4]
---

## Details
This depends on issue 4.`
        }
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({ data: mockIssues });
      
      // Mock the calls for updateBlockedStatus: isBlocked check (issue 2)
      mockOctokit.issues.get
        .mockResolvedValueOnce({ data: { body: mockIssues[0].body } })  // For isIssueBlocked on issue 2
        .mockResolvedValueOnce({ data: { labels: [{ name: 'blocked' }] } }); // For getting issue 2 labels

      await hierarchyManager.resolveDependencies(1);
      
      expect(mockOctokit.issues.removeLabel).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: 2,
        name: 'blocked'
      });
    });

    test('should handle API errors gracefully', async () => {
      mockOctokit.issues.listForRepo.mockRejectedValue(new Error('API Error'));

      await expect(hierarchyManager.resolveDependencies(1)).resolves.not.toThrow();
    });
  });

  describe('updateIssueWithMetadata', () => {
    test('should update issue with YAML front-matter', async () => {
      const metadata: IssueMetadata = {
        id: 1,
        dependencies: [2, 3],
        priority: 'high'
      };
      const bodyContent = '## Details\nThis is the issue details.';

      mockOctokit.issues.update.mockResolvedValue({});

      await hierarchyManager.updateIssueWithMetadata(1, metadata, bodyContent);
      
      expect(mockOctokit.issues.update).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: 1,
        body: expect.stringContaining('---\n')
      });
    });

    test('should handle API errors gracefully', async () => {
      mockOctokit.issues.update.mockRejectedValue(new Error('API Error'));

      await expect(hierarchyManager.updateIssueWithMetadata(1, {}, 'content')).resolves.not.toThrow();
    });
  });
});