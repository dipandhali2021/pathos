import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class WorkspaceInitializationService {
  constructor(private outputChannel: vscode.OutputChannel) {}

  public async initializeWorkspace(): Promise<void> {
    try {
      const workspaceRoot = this.getWorkspaceRoot();
      await this.ensureGitignore(workspaceRoot);
      await this.ensureDevTrackFolder(workspaceRoot);
    } catch (error: any) {
      this.outputChannel.appendLine(`WorkspaceInitialization: Error - ${error.message}`);
      throw error;
    }
  }

  private getWorkspaceRoot(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder found');
    }
    return workspaceRoot;
  }

  private async ensureGitignore(workspaceRoot: string): Promise<void> {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const devtrackEntry = '.devtrack/';

    try {
      let content = '';
      if (fs.existsSync(gitignorePath)) {
        content = fs.readFileSync(gitignorePath, 'utf8');
        if (!content.includes(devtrackEntry)) {
          content += `\n${devtrackEntry}\n`;
          fs.writeFileSync(gitignorePath, content);
          this.outputChannel.appendLine('WorkspaceInitialization: Updated .gitignore');
        }
      } else {
        content = `${devtrackEntry}\n`;
        fs.writeFileSync(gitignorePath, content);
        this.outputChannel.appendLine('WorkspaceInitialization: Created .gitignore');
      }
    } catch (error: any) {
      throw new Error(`Failed to update .gitignore: ${error.message}`);
    }
  }

  private async ensureDevTrackFolder(workspaceRoot: string): Promise<void> {
    const devtrackPath = path.join(workspaceRoot, '.devtrack');
    const folders = ['logs', 'stats'];

    try {
      if (!fs.existsSync(devtrackPath)) {
        fs.mkdirSync(devtrackPath, { recursive: true });
        
        // Create subfolders
        folders.forEach(folder => {
          const folderPath = path.join(devtrackPath, folder);
          fs.mkdirSync(folderPath, { recursive: true });
          fs.writeFileSync(path.join(folderPath, '.gitkeep'), '');
        });

        this.outputChannel.appendLine('WorkspaceInitialization: Created .devtrack folder structure');
      }
    } catch (error: any) {
      throw new Error(`Failed to create .devtrack folder: ${error.message}`);
    }
  }
}