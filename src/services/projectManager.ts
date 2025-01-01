import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ProjectManager {
  constructor(private outputChannel: vscode.OutputChannel) {}

  public getProjectIdentifier(): string {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      throw new Error('No workspace folder found');
    }

    // Try to get project name from package.json first
    try {
      const packageJsonPath = path.join(workspace.uri.fsPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.name) {
          return this.sanitizeProjectName(packageJson.name);
        }
      }
    } catch (error) {
      this.outputChannel.appendLine(`Warning: Could not read package.json: ${error}`);
    }

    // If no package.json or no name field, use workspace folder name
    return this.sanitizeProjectName(workspace.name);
  }

  private sanitizeProjectName(name: string): string {
    // Remove special characters and convert to lowercase
    return name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  }

  public getProjectFolder(): string {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      throw new Error('No workspace folder found');
    }

    const projectId = this.getProjectIdentifier();
    const pathosPath = path.join(workspace.uri.fsPath, '.pathos');
    const projectPath = path.join(pathosPath, 'projects', projectId);

    // Create project directory structure
    const dirs = ['logs', 'cache'];
    dirs.forEach(dir => {
      const dirPath = path.join(projectPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    return projectPath;
  }

  public getProjectLogFolder(): string {
    return path.join(this.getProjectFolder(), 'logs');
  }

  public getProjectCacheFolder(): string {
    return path.join(this.getProjectFolder(), 'cache');
  }
}