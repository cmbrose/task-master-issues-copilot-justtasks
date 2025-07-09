#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { TaskmasterCLIManager, DEFAULT_CLI_CONFIG } from './cli-manager';

interface ActionInputs {
  complexityThreshold: number;
  maxDepth: number;
  prdPathGlob: string;
  breakdownMaxDepth: number;
  taskmasterArgs: string;
}

class TaskmasterAction {
  private cliManager: TaskmasterCLIManager;
  private inputs: ActionInputs;

  constructor(inputs: ActionInputs) {
    this.inputs = inputs;
    this.cliManager = new TaskmasterCLIManager(DEFAULT_CLI_CONFIG);
  }

  async run(): Promise<void> {
    try {
      console.log('Starting Taskmaster CLI integration...');
      
      // Download and validate CLI binary
      await this.cliManager.downloadAndValidate();
      
      // Find PRD files
      const prdFiles = await this.findPRDFiles();
      if (prdFiles.length === 0) {
        console.log('No PRD files found matching pattern:', this.inputs.prdPathGlob);
        return;
      }
      
      console.log(`Found ${prdFiles.length} PRD files:`, prdFiles);
      
      // Generate task graph
      const taskGraph = await this.generateTaskGraph(prdFiles);
      
      // Save task graph
      await this.saveTaskGraph(taskGraph);
      
      console.log('Task graph generated successfully');
      
      // Set outputs for GitHub Actions
      this.setOutputs(taskGraph);
      
    } catch (error) {
      console.error('Error running Taskmaster Action:', error);
      process.exit(1);
    }
  }

  private async findPRDFiles(): Promise<string[]> {
    const { glob } = await import('glob');
    return await glob(this.inputs.prdPathGlob);
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

  private async saveTaskGraph(taskGraph: any): Promise<void> {
    const outputDir = path.join('.taskmaster', 'tasks');
    const outputPath = path.join(outputDir, 'tasks.json');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write task graph
    fs.writeFileSync(outputPath, JSON.stringify(taskGraph, null, 2));
    console.log(`Task graph saved to: ${outputPath}`);
  }

  private setOutputs(taskGraph: any): void {
    const taskCount = taskGraph.master.tasks.length;
    
    // Set GitHub Actions outputs
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `task-count=${taskCount}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `artifact-url=\n`);
    }
    
    console.log(`Generated ${taskCount} tasks`);
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
  await action.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { TaskmasterAction };