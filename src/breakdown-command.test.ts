import { BreakdownCommandHandler, BreakdownCommandOptions, BreakdownResult } from './breakdown-command';
import { IssueHierarchyManager } from './issue-hierarchy';
import { TaskmasterCLIManager } from './cli-manager';
import { Octokit } from '@octokit/rest';

// Mock the dependencies
jest.mock('@octokit/rest');
jest.mock('./issue-hierarchy');
jest.mock('./cli-manager');

describe('BreakdownCommandHandler', () => {
  let handler: BreakdownCommandHandler;
  let mockOctokit: any;
  let mockHierarchyManager: any;
  let mockCLIManager: any;

  beforeEach(() => {
    // Create mock instances
    mockOctokit = {
      issues: {
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        createComment: jest.fn(),
      },
    };

    mockHierarchyManager = {
      parseYAMLFrontMatter: jest.fn(),
      generateYAMLFrontMatter: jest.fn(),
      updateIssueWithMetadata: jest.fn(),
      createSubIssue: jest.fn(),
      getSubIssues: jest.fn(),
    };

    mockCLIManager = {
      downloadAndValidate: jest.fn(),
      execute: jest.fn(),
      parseOutput: jest.fn(),
    };

    // Mock the constructors
    (Octokit as any).mockImplementation(() => mockOctokit);
    (IssueHierarchyManager as any).mockImplementation(() => mockHierarchyManager);
    (TaskmasterCLIManager as any).mockImplementation(() => mockCLIManager);

    handler = new BreakdownCommandHandler('fake-token', 'test-owner', 'test-repo');
  });

  describe('parseBreakdownCommand', () => {
    it('should parse basic breakdown command', () => {
      const result = handler.parseBreakdownCommand('/breakdown');
      
      expect(result).toEqual({
        depth: 2,
        threshold: 10,
        issueNumber: 0,
        commentId: 0,
        commenter: ''
      });
    });

    it('should parse breakdown command with depth parameter', () => {
      const result = handler.parseBreakdownCommand('/breakdown --depth 3');
      
      expect(result).toEqual({
        depth: 2, // Should be capped at max depth of 2
        threshold: 10,
        issueNumber: 0,
        commentId: 0,
        commenter: ''
      });
    });

    it('should parse breakdown command with threshold parameter', () => {
      const result = handler.parseBreakdownCommand('/breakdown --threshold 15');
      
      expect(result).toEqual({
        depth: 2,
        threshold: 15,
        issueNumber: 0,
        commentId: 0,
        commenter: ''
      });
    });

    it('should parse breakdown command with both parameters', () => {
      const result = handler.parseBreakdownCommand('/breakdown --depth 1 --threshold 20');
      
      expect(result).toEqual({
        depth: 1,
        threshold: 20,
        issueNumber: 0,
        commentId: 0,
        commenter: ''
      });
    });

    it('should enforce maximum depth limit', () => {
      const result = handler.parseBreakdownCommand('/breakdown --depth 5');
      
      expect(result).toEqual({
        depth: 2, // Should be capped at max depth of 2
        threshold: 10,
        issueNumber: 0,
        commentId: 0,
        commenter: ''
      });
    });

    it('should return null for non-breakdown comments', () => {
      const result = handler.parseBreakdownCommand('This is just a regular comment');
      
      expect(result).toBeNull();
    });

    it('should return null for commands that are not breakdown', () => {
      const result = handler.parseBreakdownCommand('/close');
      
      expect(result).toBeNull();
    });
  });

  describe('executeBreakdown', () => {
    const mockOptions: BreakdownCommandOptions = {
      depth: 2,
      threshold: 10,
      issueNumber: 123,
      commentId: 456,
      commenter: 'test-user'
    };

    beforeEach(() => {
      // Setup default mocks
      mockHierarchyManager.getSubIssues.mockResolvedValue([]);
      mockOctokit.issues.get.mockResolvedValue({
        data: {
          number: 123,
          title: 'Test Issue',
          body: '---\nid: 1\ntitle: Test Issue\n---\n\nThis is a test issue'
        }
      } as any);

      mockHierarchyManager.parseYAMLFrontMatter.mockReturnValue({
        metadata: {
          id: 1,
          title: 'Test Issue',
          priority: 'medium',
          complexity: 5
        },
        body: 'This is a test issue'
      });

      mockCLIManager.downloadAndValidate.mockResolvedValue();
      mockCLIManager.execute.mockResolvedValue('{"subtasks": []}');
      mockCLIManager.parseOutput.mockReturnValue({
        subtasks: []
      });
    });

    it('should skip breakdown if already performed (idempotency)', async () => {
      // Mock that breakdown has already been performed
      mockHierarchyManager.parseYAMLFrontMatter.mockReturnValue({
        metadata: {
          id: 1,
          title: 'Test Issue',
          breakdown_performed: true
        },
        body: 'This is a test issue'
      });

      const result = await handler.executeBreakdown(mockOptions);

      expect(result).toEqual({
        success: true,
        parentIssueNumber: 123,
        subIssuesCreated: [],
        message: 'Issue #123 has already been broken down. Skipping to prevent duplicates.'
      });
    });

    it('should skip breakdown if sub-issues already exist (idempotency)', async () => {
      // Mock that sub-issues already exist
      mockHierarchyManager.getSubIssues.mockResolvedValue([
        { number: 124, title: 'Sub-issue 1' },
        { number: 125, title: 'Sub-issue 2' }
      ] as any);

      const result = await handler.executeBreakdown(mockOptions);

      expect(result).toEqual({
        success: true,
        parentIssueNumber: 123,
        subIssuesCreated: [],
        message: 'Issue #123 has already been broken down. Skipping to prevent duplicates.'
      });
    });

    it('should handle issue without required YAML metadata', async () => {
      mockHierarchyManager.parseYAMLFrontMatter.mockReturnValue({
        metadata: {}, // No ID
        body: 'This is a test issue'
      });

      const result = await handler.executeBreakdown(mockOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not have required YAML metadata with task ID');
    });

    it('should handle CLI execution that returns no subtasks', async () => {
      mockCLIManager.parseOutput.mockReturnValue({
        subtasks: []
      });

      const result = await handler.executeBreakdown(mockOptions);

      expect(result).toEqual({
        success: true,
        parentIssueNumber: 123,
        subIssuesCreated: [],
        message: 'No subtasks generated for issue #123. Task may already be at appropriate granularity.'
      });
    });

    it('should successfully break down issue with subtasks', async () => {
      // Mock CLI returning subtasks
      mockCLIManager.parseOutput.mockReturnValue({
        subtasks: [
          {
            id: 2,
            title: 'Subtask 1',
            description: 'First subtask',
            priority: 'high',
            complexity: 3
          },
          {
            id: 3,
            title: 'Subtask 2',
            description: 'Second subtask',
            priority: 'medium',
            complexity: 4
          }
        ]
      });

      // Mock issue creation
      mockOctokit.issues.create
        .mockResolvedValueOnce({ data: { number: 124 } } as any)
        .mockResolvedValueOnce({ data: { number: 125 } } as any);

      mockHierarchyManager.generateYAMLFrontMatter.mockReturnValue('---\nid: 2\n---\n');
      mockHierarchyManager.createSubIssue.mockResolvedValue();
      mockHierarchyManager.updateIssueWithMetadata.mockResolvedValue();

      const result = await handler.executeBreakdown(mockOptions);

      expect(result.success).toBe(true);
      expect(result.subIssuesCreated).toEqual([124, 125]);
      expect(result.message).toContain('Successfully broke down issue #123 into 2 sub-issues');

      // Verify sub-issues were created
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(2);
      expect(mockHierarchyManager.createSubIssue).toHaveBeenCalledTimes(2);
      expect(mockHierarchyManager.updateIssueWithMetadata).toHaveBeenCalled();
      expect(mockOctokit.issues.update).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        state: 'closed',
        state_reason: 'completed'
      });
    });

    it('should handle CLI execution errors', async () => {
      mockCLIManager.execute.mockRejectedValue(new Error('CLI execution failed'));

      const result = await handler.executeBreakdown(mockOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('CLI execution failed');
    });

    it('should handle sub-issue creation errors gracefully', async () => {
      mockCLIManager.parseOutput.mockReturnValue({
        subtasks: [
          {
            id: 2,
            title: 'Subtask 1',
            description: 'First subtask',
            priority: 'high',
            complexity: 3
          }
        ]
      });

      // Mock issue creation failure
      mockOctokit.issues.create.mockRejectedValue(new Error('Failed to create issue'));

      const result = await handler.executeBreakdown(mockOptions);

      expect(result.success).toBe(true);
      expect(result.subIssuesCreated).toEqual([]);
      expect(result.message).toContain('Successfully broke down issue #123 into 0 sub-issues');
    });
  });

  describe('addBreakdownComment', () => {
    it('should add success comment with sub-issues', async () => {
      const result: BreakdownResult = {
        success: true,
        parentIssueNumber: 123,
        subIssuesCreated: [124, 125],
        message: 'Success message'
      };

      await handler.addBreakdownComment(123, result);

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('✅ **Success**: Success message')
      });

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('- #124')
      });
    });

    it('should add failure comment', async () => {
      const result: BreakdownResult = {
        success: false,
        parentIssueNumber: 123,
        subIssuesCreated: [],
        message: 'Failure message',
        error: 'Error details'
      };

      await handler.addBreakdownComment(123, result);

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('❌ **Failed**: Error details')
      });
    });

    it('should handle comment creation errors', async () => {
      const result: BreakdownResult = {
        success: true,
        parentIssueNumber: 123,
        subIssuesCreated: [],
        message: 'Success message'
      };

      mockOctokit.issues.createComment.mockRejectedValue(new Error('Comment creation failed'));

      // Should not throw error
      await expect(handler.addBreakdownComment(123, result)).resolves.not.toThrow();
    });
  });
});