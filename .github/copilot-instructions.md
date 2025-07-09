# GitHub Copilot Instructions for `task-master-issues` Repository

Welcome to the `task-master-issues` repository! This document provides guidance for using GitHub Copilot effectively within this project.

## General Guidance

- **Scope Your Work:**  
  Always scope your code suggestions, completions, and pull requests strictly to the issue or task at hand. Avoid making unrelated or speculative changes.

- **Leverage Project Context:**  
  Copilot can and should reference the following key files to inform its suggestions:
  - **`.taskmaster/tasks/tasks.json`:**  
    This file contains the list of Taskmaster tasks, their metadata, and configuration. You may use this to understand task structure, requirements, and dependencies.
  - **`docs/initial-release.prd.md`:**  
    The PRD outlines feature requirements, user stories, and high-level goals. You may consult this for broader context or clarification on task intent.
  - **Issues:**
    All issues created for a PRD will contain their immediate dependencies issues (which should be closed before working on an issue) and issues which require the issue in question (which
    cannot be started until at least the issue in question is closed). This next-neighbor dependency structure can help guide work to understand what tasks the issue is building off of in
    addition to what work will immediately depend on it.
    
- **Code Standards:**
  This repo will host public GitHub Actions. Ensure that all best practices for hosting multiple actions within the repo are considered and followed. Especially consider the needs
  of users of the actions being built, users who are not familiar with the inner workings, when desiging interfaces for them to use.
  When code is needed, prefer using TypeScript, ensure all code suggestions follow TypeScript best practices, type definitions, and style conventions as seen in the existing codebase.

## Specific Instructions

- **Stay Focused:**  
  Do not modify files, functions, or logic unrelated to the specific issue you are addressing.
- **Use Context Files Wisely:**  
  Reference `tasks.json` and the PRD for understanding requirements, but only extract the information relevant to your current task.
- **Documentation:**  
  When adding or modifying features, update relevant documentation and comments for clarity.
- **Testing:**  
  If tests exist or are affected by your changes, update or add tests to maintain coverage and reliability.

## Example Workflow

1. **Read the Issue:**  
   Fully understand the problem or feature request.
2. **Consult `tasks.json` and PRD:**  
   Use these files to clarify requirements or dependencies.
3. **Implement the Solution:**  
   Write clear, maintainable TypeScript code scoped to the issue.
4. **Test and Document:**  
   Ensure your changes are covered by tests and documented as necessary.
5. **Submit a Focused Pull Request:**  
   Your PR should only resolve the current issue, with a clear summary.
