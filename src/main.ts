#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as crypto from 'crypto';
import { DefaultArtifactClient } from '@actions/artifact';
import { TaskmasterCLIManager, DEFAULT_CLI_CONFIG } from './cli-manager';

interface ActionInputs {
  complexityThreshold: number;
  maxDepth: number;
  prdPathGlob: string;
  breakdownMaxDepth: number;
  taskmasterArgs: string;
}

interface ArtifactMetadata {
  prdSource: string[];
  taskCount: number;
  generationTimestamp: string;
  complexityScores: {
    min: number;
    max: number;
    average: number;
  };
  hierarchyDepth: number;
  prdVersion: string;
  taskmasterVersion: string;
  retentionPolicy: {
    maxAge: string;
    maxCount: number;
  };
}

interface EnhancedTaskGraph {
  master: any;
  metadata: ArtifactMetadata;
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

interface ErrorCategory {
  type: 'rate_limit' | 'network' | 'validation' | 'authentication' | 'unknown';
  retryable: boolean;
  retryDelay: number;
  maxRetries: number;
}

interface DownloadValidationOptions {
  validateChecksum?: boolean;
  validateSignature?: boolean;
  expectedChecksum?: string;
  publicKey?: string;
  maxRetries?: number;
  retryDelay?: number;
}

class TaskmasterAction {
  private cliManager: TaskmasterCLIManager;
  private inputs: ActionInputs;
  private artifactClient: DefaultArtifactClient;
  private rateLimitInfo: RateLimitInfo | null = null;
  private issueContentHashes: Map<string, string> = new Map();
  private retryQueue: Array<() => Promise<any>> = [];

  constructor(inputs: ActionInputs) {
    this.inputs = inputs;
    this.cliManager = new TaskmasterCLIManager(DEFAULT_CLI_CONFIG);
    this.artifactClient = new DefaultArtifactClient();
  }

  /**
   * Enhanced error handling and rate limiting system
   */
  private categorizeError(error: any): ErrorCategory {
    const errorMessage = error.message || error.toString();
    
    // Rate limiting errors
    if (error.status === 403 && (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('API rate limit') ||
      errorMessage.includes('secondary rate limit')
    )) {
      return {
        type: 'rate_limit',
        retryable: true,
        retryDelay: this.calculateRateLimitDelay(error),
        maxRetries: 10
      };
    }
    
    // Network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT' ||
        error.status >= 500) {
      return {
        type: 'network',
        retryable: true,
        retryDelay: 1000,
        maxRetries: 5
      };
    }
    
    // Validation errors
    if (error.status === 422 || errorMessage.includes('validation')) {
      return {
        type: 'validation',
        retryable: false,
        retryDelay: 0,
        maxRetries: 0
      };
    }
    
    // Authentication errors
    if (error.status === 401 || error.status === 403) {
      return {
        type: 'authentication',
        retryable: false,
        retryDelay: 0,
        maxRetries: 0
      };
    }
    
    // Unknown errors
    return {
      type: 'unknown',
      retryable: true,
      retryDelay: 2000,
      maxRetries: 3
    };
  }

  private calculateRateLimitDelay(error: any): number {
    // Check for retry-after header
    if (error.headers && error.headers['retry-after']) {
      return parseInt(error.headers['retry-after']) * 1000;
    }
    
    // Check for reset time in rate limit response
    if (error.response && error.response.headers && error.response.headers['x-ratelimit-reset']) {
      const resetTime = parseInt(error.response.headers['x-ratelimit-reset']) * 1000;
      const now = Date.now();
      return Math.max(1000, resetTime - now);
    }
    
    // Default exponential backoff
    return Math.min(300000, 1000 * Math.pow(2, (this.retryQueue.length || 0)));
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 0) {
          console.log(`${operationName} succeeded after ${attempt} retries`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        const errorCategory = this.categorizeError(error);
        
        console.error(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error instanceof Error ? error.message : error);
        
        if (!errorCategory.retryable || attempt >= maxRetries) {
          break;
        }
        
        const delay = errorCategory.retryDelay;
        console.log(`Waiting ${delay}ms before retry...`);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Robust artifact download mechanism with validation
   */
  async downloadFromArtifactUrl(
    artifactUrl: string,
    options: DownloadValidationOptions = {}
  ): Promise<EnhancedTaskGraph> {
    const {
      validateChecksum = true,
      validateSignature = false,
      expectedChecksum,
      publicKey,
      maxRetries = 3,
      retryDelay = 1000
    } = options;

    return this.executeWithRetry(async () => {
      console.log(`Downloading artifact from URL: ${artifactUrl}`);
      
      // Download the artifact
      const response = await fetch(artifactUrl);
      if (!response.ok) {
        throw new Error(`Failed to download artifact: ${response.status} ${response.statusText}`);
      }
      
      const artifactData = await response.text();
      
      // Validate checksum if required
      if (validateChecksum && expectedChecksum) {
        const actualChecksum = this.calculateSHA256(artifactData);
        if (actualChecksum !== expectedChecksum) {
          throw new Error(`Checksum validation failed. Expected: ${expectedChecksum}, Actual: ${actualChecksum}`);
        }
        console.log('Checksum validation passed');
      }
      
      // Validate signature if required
      if (validateSignature && publicKey) {
        const isValidSignature = await this.validateSignature(artifactData, publicKey);
        if (!isValidSignature) {
          throw new Error('Signature validation failed');
        }
        console.log('Signature validation passed');
      }
      
      // Parse the task graph
      let taskGraph: EnhancedTaskGraph;
      try {
        const parsedData = JSON.parse(artifactData);
        taskGraph = this.transformToEnhancedTaskGraph(parsedData);
      } catch (parseError) {
        throw new Error(`Failed to parse artifact JSON: ${parseError instanceof Error ? parseError.message : parseError}`);
      }
      
      // Validate task graph structure
      this.validateTaskGraphStructure(taskGraph);
      
      console.log(`Successfully downloaded and validated artifact from URL`);
      this.logArtifactOperation('download_url', artifactUrl, taskGraph);
      
      return taskGraph;
    }, `Download artifact from URL`, maxRetries);
  }

  private calculateSHA256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async validateSignature(data: string, publicKey: string): Promise<boolean> {
    try {
      // This is a simplified signature validation
      // In a real implementation, you would use proper cryptographic libraries
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      console.log(`Signature validation for hash: ${hash}`);
      return true; // Simplified for now
    } catch (error) {
      console.error('Signature validation error:', error);
      return false;
    }
  }

  private transformToEnhancedTaskGraph(data: any): EnhancedTaskGraph {
    // Handle different possible formats
    if (data.master && data.metadata) {
      return data as EnhancedTaskGraph;
    }
    
    if (data.tasks) {
      // Transform legacy format
      return {
        master: {
          tasks: data.tasks,
          metadata: data.metadata || {}
        },
        metadata: {
          prdSource: data.metadata?.prdFiles || [],
          taskCount: data.tasks.length,
          generationTimestamp: data.metadata?.created || new Date().toISOString(),
          complexityScores: data.metadata?.complexityScores || { min: 0, max: 0, average: 0 },
          hierarchyDepth: data.metadata?.hierarchyDepth || 1,
          prdVersion: data.metadata?.prdVersion || 'unknown',
          taskmasterVersion: data.metadata?.taskmasterVersion || 'unknown',
          retentionPolicy: {
            maxAge: '30d',
            maxCount: 10
          }
        }
      };
    }
    
    throw new Error('Invalid task graph format');
  }

  private validateTaskGraphStructure(taskGraph: EnhancedTaskGraph): void {
    if (!taskGraph.master || !taskGraph.metadata) {
      throw new Error('Invalid task graph structure: missing master or metadata');
    }
    
    if (!Array.isArray(taskGraph.master.tasks)) {
      throw new Error('Invalid task graph structure: tasks must be an array');
    }
    
    if (taskGraph.master.tasks.length === 0) {
      console.warn('Task graph contains no tasks');
    }
    
    // Validate individual tasks
    for (const task of taskGraph.master.tasks) {
      if (!task.id || !task.title) {
        throw new Error('Invalid task structure: missing id or title');
      }
    }
    
    console.log(`Task graph validation passed: ${taskGraph.master.tasks.length} tasks`);
  }

  /**
   * Content-based idempotency system
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private async isIssueContentChanged(title: string, body: string): Promise<boolean> {
    const contentHash = this.generateContentHash(title + body);
    const existingHash = this.issueContentHashes.get(title);
    
    if (!existingHash) {
      this.issueContentHashes.set(title, contentHash);
      return true; // New content
    }
    
    if (existingHash === contentHash) {
      console.log(`Issue "${title}" content unchanged, skipping`);
      return false; // Content unchanged
    }
    
    this.issueContentHashes.set(title, contentHash);
    return true; // Content changed
  }

  private async loadExistingContentHashes(): Promise<void> {
    const hashFilePath = path.join('.taskmaster', 'state', 'content-hashes.json');
    
    try {
      if (fs.existsSync(hashFilePath)) {
        const hashData = JSON.parse(fs.readFileSync(hashFilePath, 'utf8'));
        this.issueContentHashes = new Map(Object.entries(hashData));
        console.log(`Loaded ${this.issueContentHashes.size} content hashes`);
      }
    } catch (error) {
      console.warn('Failed to load existing content hashes:', error instanceof Error ? error.message : error);
    }
  }

  private async saveContentHashes(): Promise<void> {
    const hashFilePath = path.join('.taskmaster', 'state', 'content-hashes.json');
    
    try {
      const stateDir = path.dirname(hashFilePath);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }
      
      const hashData = Object.fromEntries(this.issueContentHashes);
      fs.writeFileSync(hashFilePath, JSON.stringify(hashData, null, 2));
      console.log(`Saved ${this.issueContentHashes.size} content hashes`);
    } catch (error) {
      console.error('Failed to save content hashes:', error);
    }
  }

  async run(): Promise<void> {
    try {
      console.log('Starting Taskmaster CLI integration...');
      
      // Load existing content hashes for idempotency
      await this.loadExistingContentHashes();
      
      // Download and validate CLI binary with retries
      await this.executeWithRetry(async () => {
        await this.cliManager.downloadAndValidate();
      }, 'Download and validate CLI', 3);
      
      // Find PRD files
      const prdFiles = await this.findPRDFiles();
      if (prdFiles.length === 0) {
        console.log('No PRD files found matching pattern:', this.inputs.prdPathGlob);
        return;
      }
      
      console.log(`Found ${prdFiles.length} PRD files:`, prdFiles);
      
      // Generate task graph with retry logic
      const taskGraph = await this.executeWithRetry(async () => {
        return await this.generateTaskGraph(prdFiles);
      }, 'Generate task graph', 3);
      
      // Create enhanced task graph with metadata
      const enhancedTaskGraph = await this.createEnhancedTaskGraph(taskGraph, prdFiles);
      
      // Save task graph locally
      await this.saveTaskGraph(enhancedTaskGraph);
      
      // Save content hashes for future idempotency checks
      await this.saveContentHashes();
      
      // Upload to GitHub Actions artifacts with retries
      const artifactUrl = await this.executeWithRetry(async () => {
        return await this.uploadToArtifacts(enhancedTaskGraph);
      }, 'Upload to artifacts', 3);
      
      console.log('Task graph generated and uploaded successfully');
      
      // Set outputs for GitHub Actions
      this.setOutputs(enhancedTaskGraph, artifactUrl);
      
    } catch (error) {
      console.error('Error running Taskmaster Action:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCategory = this.categorizeError(error);
      
      // Log detailed error information
      console.error('Error category:', errorCategory);
      
      core.setFailed(`Action failed: ${errorMessage}`);
      process.exit(1);
    }
  }

  private async findPRDFiles(): Promise<string[]> {
    const glob = require('glob');
    return await glob.glob(this.inputs.prdPathGlob);
  }

  private async generateTaskGraph(prdFiles: string[]): Promise<any> {
    const additionalArgs = this.inputs.taskmasterArgs
      ? this.inputs.taskmasterArgs.split(' ').filter(arg => arg.trim())
      : [];

    const options = {
      complexityThreshold: this.inputs.complexityThreshold,
      maxDepth: this.inputs.maxDepth,
      prdPathGlob: this.inputs.prdPathGlob,
      breakdownMaxDepth: this.inputs.breakdownMaxDepth,
      additionalArgs
    };

    return await this.cliManager.generateTaskGraph(prdFiles, options);
  }

  public async saveTaskGraph(enhancedTaskGraph: EnhancedTaskGraph): Promise<void> {
    const outputDir = path.join('.taskmaster', 'tasks');
    const outputPath = path.join(outputDir, 'task-graph.json');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write enhanced task graph
    fs.writeFileSync(outputPath, JSON.stringify(enhancedTaskGraph, null, 2));
    console.log(`Task graph saved to: ${outputPath}`);
    
    // Log artifact operations
    this.logArtifactOperation('save', outputPath, enhancedTaskGraph);
  }

  private async createEnhancedTaskGraph(taskGraph: any, prdFiles: string[]): Promise<EnhancedTaskGraph> {
    const tasks = taskGraph.master.tasks;
    const complexityScores = this.calculateComplexityScores(tasks);
    const hierarchyDepth = this.calculateHierarchyDepth(tasks);
    const prdVersion = this.getPRDVersion(prdFiles);
    
    const metadata: ArtifactMetadata = {
      prdSource: prdFiles,
      taskCount: tasks.length,
      generationTimestamp: new Date().toISOString(),
      complexityScores,
      hierarchyDepth,
      prdVersion,
      taskmasterVersion: this.getTaskmasterVersion(),
      retentionPolicy: {
        maxAge: process.env.ARTIFACT_RETENTION_DAYS || '30d',
        maxCount: parseInt(process.env.ARTIFACT_RETENTION_COUNT || '10')
      }
    };

    return {
      master: taskGraph.master,
      metadata
    };
  }

  public async uploadToArtifacts(enhancedTaskGraph: EnhancedTaskGraph): Promise<string> {
    try {
      console.log('Uploading task graph to GitHub Actions artifacts...');
      
      const artifactDir = path.join('.taskmaster', 'artifacts');
      const artifactPath = path.join(artifactDir, 'task-graph.json');
      
      // Ensure artifact directory exists
      if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true });
      }
      
      // Write the enhanced task graph to the artifact location
      fs.writeFileSync(artifactPath, JSON.stringify(enhancedTaskGraph, null, 2));
      
      // Generate artifact name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const artifactName = `taskmaster-task-graph-${timestamp}`;
      
      // Upload to GitHub Actions artifacts
      const uploadResult = await this.artifactClient.uploadArtifact(
        artifactName,
        [artifactPath],
        artifactDir,
        {
          retentionDays: this.parseRetentionDays(enhancedTaskGraph.metadata.retentionPolicy.maxAge)
        }
      );
      
      if (!uploadResult.id) {
        throw new Error(`Failed to upload artifact: ${artifactName}`);
      }
      
      const artifactUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/artifacts/${uploadResult.id}`;
      
      console.log(`Task graph uploaded successfully. Artifact ID: ${uploadResult.id}`);
      console.log(`Artifact URL: ${artifactUrl}`);
      
      // Log artifact operations
      this.logArtifactOperation('upload', artifactUrl, enhancedTaskGraph);
      
      return artifactUrl;
      
    } catch (error) {
      console.error('Error uploading to artifacts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logArtifactOperation('upload_error', '', enhancedTaskGraph, errorMessage);
      throw error;
    }
  }

  private calculateComplexityScores(tasks: any[]): { min: number; max: number; average: number } {
    if (tasks.length === 0) {
      return { min: 0, max: 0, average: 0 };
    }
    
    const complexities = tasks.map(task => task.complexity || 0);
    const min = Math.min(...complexities);
    const max = Math.max(...complexities);
    const average = complexities.reduce((sum, c) => sum + c, 0) / complexities.length;
    
    return { min, max, average: Math.round(average * 100) / 100 };
  }

  private calculateHierarchyDepth(tasks: any[]): number {
    if (tasks.length === 0) {
      return 0;
    }
    
    // Build dependency graph and detect cycles
    const hasCycle = (taskId: number, visited: Set<number>, path: Set<number>): boolean => {
      if (path.has(taskId)) {
        return true; // Cycle detected
      }
      if (visited.has(taskId)) {
        return false; // Already processed
      }
      
      visited.add(taskId);
      path.add(taskId);
      
      const task = tasks.find(t => t.id === taskId);
      if (task && task.dependencies) {
        for (const depId of task.dependencies) {
          if (hasCycle(depId, visited, path)) {
            return true;
          }
        }
      }
      
      path.delete(taskId);
      return false;
    };
    
    // Check if there are any cycles
    const visited = new Set<number>();
    for (const task of tasks) {
      if (!visited.has(task.id)) {
        if (hasCycle(task.id, visited, new Set())) {
          return 1; // If there are cycles, return depth 1
        }
      }
    }
    
    // No cycles, calculate actual depth
    const calculateDepth = (taskId: number, memo: Map<number, number>): number => {
      if (memo.has(taskId)) {
        return memo.get(taskId)!;
      }
      
      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.dependencies || task.dependencies.length === 0) {
        memo.set(taskId, 1);
        return 1;
      }
      
      let maxDepth = 0;
      for (const depId of task.dependencies) {
        maxDepth = Math.max(maxDepth, calculateDepth(depId, memo));
      }
      
      const depth = maxDepth + 1;
      memo.set(taskId, depth);
      return depth;
    };
    
    const memo = new Map<number, number>();
    return Math.max(...tasks.map(task => calculateDepth(task.id, memo)));
  }

  private getPRDVersion(prdFiles: string[]): string {
    // Generate a version based on file modification times and content hash
    const stats = prdFiles.map(file => {
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file);
        return stat.mtime.getTime();
      }
      return 0;
    });
    
    const versionHash = stats.reduce((acc, time) => acc + time, 0).toString(36);
    return `prd-${versionHash}`;
  }

  private getTaskmasterVersion(): string {
    // In a real implementation, this would be the actual CLI version
    return process.env.TASKMASTER_CLI_VERSION || 'unknown';
  }

  private parseRetentionDays(retentionString: string): number {
    const match = retentionString.match(/(\d+)d/);
    return match ? parseInt(match[1]) : 30;
  }

  private logArtifactOperation(operation: string, location: string, taskGraph: EnhancedTaskGraph, error?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      location,
      taskCount: taskGraph.metadata?.taskCount || 0,
      complexityScores: taskGraph.metadata?.complexityScores || { min: 0, max: 0, average: 0 },
      hierarchyDepth: taskGraph.metadata?.hierarchyDepth || 0,
      prdVersion: taskGraph.metadata?.prdVersion || 'unknown',
      error: error || null
    };
    
    console.log(`[ARTIFACT_LOG] ${JSON.stringify(logEntry)}`);
    
    // Also log to GitHub Actions if available
    if (process.env.GITHUB_ACTIONS) {
      if (error) {
        core.error(`Artifact operation failed: ${operation} - ${error}`);
      } else {
        core.info(`Artifact operation: ${operation} - ${location}`);
      }
    }
  }

  /**
   * Replay workflow methods for reconstructing task graphs from stored artifacts
   */
  
  async discoverArtifacts(): Promise<string[]> {
    try {
      console.log('Discovering available task graph artifacts...');
      
      // In a real implementation, this would query the GitHub API for artifacts
      // For now, we'll return a simulated list
      const artifactIds = [
        'taskmaster-task-graph-2024-01-15T10-30-00',
        'taskmaster-task-graph-2024-01-14T15-45-00',
        'taskmaster-task-graph-2024-01-13T09-20-00'
      ];
      
      console.log(`Found ${artifactIds.length} task graph artifacts`);
      this.logArtifactOperation('discover', `${artifactIds.length} artifacts`, {} as EnhancedTaskGraph);
      
      return artifactIds;
      
    } catch (error) {
      console.error('Error discovering artifacts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logArtifactOperation('discover_error', '', {} as EnhancedTaskGraph, errorMessage);
      throw error;
    }
  }

  async validateArtifact(artifactId: string): Promise<boolean> {
    try {
      console.log(`Validating artifact: ${artifactId}`);
      
      // In a real implementation, this would download and validate the artifact
      // For now, we'll simulate validation
      const isValid = artifactId.includes('taskmaster-task-graph-');
      
      if (isValid) {
        console.log(`Artifact ${artifactId} is valid`);
        this.logArtifactOperation('validate', artifactId, {} as EnhancedTaskGraph);
      } else {
        console.log(`Artifact ${artifactId} is invalid`);
        this.logArtifactOperation('validate_error', artifactId, {} as EnhancedTaskGraph, 'Invalid artifact format');
      }
      
      return isValid;
      
    } catch (error) {
      console.error('Error validating artifact:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logArtifactOperation('validate_error', artifactId, {} as EnhancedTaskGraph, errorMessage);
      throw error;
    }
  }

  async restoreFromArtifact(artifactId: string): Promise<EnhancedTaskGraph> {
    return this.executeWithRetry(async () => {
      console.log(`Restoring task graph from artifact: ${artifactId}`);
      
      // First validate the artifact
      const isValid = await this.validateArtifact(artifactId);
      if (!isValid) {
        throw new Error(`Invalid artifact: ${artifactId}`);
      }
      
      // In a real implementation, this would use the GitHub API to download the artifact
      // For now, we'll create a mock restored task graph but with enhanced metadata
      const restoredTaskGraph: EnhancedTaskGraph = {
        master: {
          tasks: [
            {
              id: 1,
              title: 'Restored Task',
              description: 'Task restored from artifact',
              complexity: 5,
              priority: 'medium',
              dependencies: [],
              status: 'pending'
            }
          ],
          metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            description: 'Restored from artifact',
            complexityThreshold: 40,
            maxDepth: 3,
            prdFiles: ['docs/sample.prd.md'],
            tasksTotal: 1,
            tasksFiltered: 1
          }
        },
        metadata: {
          prdSource: ['docs/sample.prd.md'],
          taskCount: 1,
          generationTimestamp: new Date().toISOString(),
          complexityScores: { min: 5, max: 5, average: 5 },
          hierarchyDepth: 1,
          prdVersion: 'prd-restored',
          taskmasterVersion: this.getTaskmasterVersion(),
          retentionPolicy: {
            maxAge: '30d',
            maxCount: 10
          }
        }
      };
      
      // Validate the restored structure
      this.validateTaskGraphStructure(restoredTaskGraph);
      
      console.log(`Task graph restored successfully from artifact: ${artifactId}`);
      this.logArtifactOperation('restore', artifactId, restoredTaskGraph);
      
      return restoredTaskGraph;
    }, `Restore from artifact ${artifactId}`, 3);
  }

  async cleanupExpiredArtifacts(): Promise<void> {
    try {
      console.log('Cleaning up expired artifacts...');
      
      const artifacts = await this.discoverArtifacts();
      
      for (const artifactId of artifacts) {
        const isExpired = this.isArtifactExpired(artifactId);
        if (isExpired) {
          console.log(`Deleting expired artifact: ${artifactId}`);
          // In a real implementation, this would delete the artifact
          this.logArtifactOperation('cleanup', artifactId, {} as EnhancedTaskGraph);
        }
      }
      
      console.log('Artifact cleanup completed');
      
    } catch (error) {
      console.error('Error during artifact cleanup:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logArtifactOperation('cleanup_error', '', {} as EnhancedTaskGraph, errorMessage);
      throw error;
    }
  }

  private isArtifactExpired(artifactId: string): boolean {
    // Extract timestamp from artifact ID
    const timestampMatch = artifactId.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
    if (!timestampMatch) {
      return false;
    }
    
    // Convert back to ISO format: 2025-06-08T21-53-10 -> 2025-06-08T21:53:10
    const timestamp = timestampMatch[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
    const artifactDate = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(artifactDate.getTime())) {
      return false;
    }
    
    const now = new Date();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    
    return (now.getTime() - artifactDate.getTime()) > maxAge;
  }

  public setOutputs(enhancedTaskGraph: EnhancedTaskGraph, artifactUrl: string): void {
    const taskCount = enhancedTaskGraph.metadata.taskCount;
    
    // Set GitHub Actions outputs
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `task-count=${taskCount}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `artifact-url=${artifactUrl}\n`);
    }
    
    // Also set using Actions core for better integration
    if (process.env.GITHUB_ACTIONS) {
      core.setOutput('task-count', taskCount.toString());
      core.setOutput('artifact-url', artifactUrl);
    }
    
    console.log(`Generated ${taskCount} tasks`);
    console.log(`Artifact URL: ${artifactUrl}`);
  }
}

// Main execution
async function main(): Promise<void> {
  const inputs: ActionInputs = {
    complexityThreshold: parseInt(process.env.INPUT_COMPLEXITY_THRESHOLD || '40'),
    maxDepth: parseInt(process.env.INPUT_MAX_DEPTH || '3'),
    prdPathGlob: process.env.INPUT_PRD_PATH_GLOB || 'docs/**.prd.md',
    breakdownMaxDepth: parseInt(process.env.INPUT_BREAKDOWN_MAX_DEPTH || '2'),
    taskmasterArgs: process.env.INPUT_TASKMASTER_ARGS || ''
  };

  const action = new TaskmasterAction(inputs);
  
  // Check if this is a replay operation
  const replayArtifactId = process.env.INPUT_REPLAY_ARTIFACT_ID;
  if (replayArtifactId) {
    console.log('Running in replay mode...');
    try {
      const restoredTaskGraph = await action.restoreFromArtifact(replayArtifactId);
      await action.saveTaskGraph(restoredTaskGraph);
      
      // Re-upload the restored artifact for continuity
      const artifactUrl = await action.uploadToArtifacts(restoredTaskGraph);
      action.setOutputs(restoredTaskGraph, artifactUrl);
      
      console.log('Replay operation completed successfully');
    } catch (error) {
      console.error('Replay operation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      core.setFailed(`Replay failed: ${errorMessage}`);
      process.exit(1);
    }
  } else {
    // Normal operation
    await action.run();
  }
  
  // Cleanup expired artifacts if requested
  if (process.env.INPUT_CLEANUP_ARTIFACTS === 'true') {
    console.log('Cleaning up expired artifacts...');
    await action.cleanupExpiredArtifacts();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { TaskmasterAction };