import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectManager } from './projectManager';

export class WorkspaceInitializationService {
  private projectManager: ProjectManager;

  constructor(private outputChannel: vscode.OutputChannel) {
    this.projectManager = new ProjectManager(outputChannel);
  }

  public async initializeWorkspace(): Promise<void> {
    try {
      const workspaceRoot = this.getWorkspaceRoot();
      await this.ensureGitignore(workspaceRoot);
      await this.ensurePathosStructure(workspaceRoot);
      await this.initializeProjectStructure();
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
    const pathosEntry = '.pathos/';

    try {
      let content = '';
      if (fs.existsSync(gitignorePath)) {
        content = fs.readFileSync(gitignorePath, 'utf8');
        if (!content.includes(pathosEntry)) {
          content += `\n${pathosEntry}\n`;
          fs.writeFileSync(gitignorePath, content);
          this.outputChannel.appendLine('WorkspaceInitialization: Updated .gitignore');
        }
      } else {
        content = `${pathosEntry}\n`;
        fs.writeFileSync(gitignorePath, content);
        this.outputChannel.appendLine('WorkspaceInitialization: Created .gitignore');
      }
    } catch (error: any) {
      throw new Error(`Failed to update .gitignore: ${error.message}`);
    }
  }

  private async ensurePathosStructure(workspaceRoot: string): Promise<void> {
    const pathosPath = path.join(workspaceRoot, '.pathos');
    const baseStructure = ['projects'];

    try {
      // Create base .pathos folder if it doesn't exist
      if (!fs.existsSync(pathosPath)) {
        fs.mkdirSync(pathosPath, { recursive: true });
      }

      // Create only the projects folder
      baseStructure.forEach(folder => {
        const folderPath = path.join(pathosPath, folder);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
      });

      this.outputChannel.appendLine('WorkspaceInitialization: Created .pathos base structure');
    } catch (error: any) {
      throw new Error(`Failed to create .pathos structure: ${error.message}`);
    }
  }

  private async initializeProjectStructure(): Promise<void> {
    try {
      const projectId = this.projectManager.getProjectIdentifier();
      const projectFolder = this.projectManager.getProjectFolder();
      
      // Create only the cache folder
      const projectFolders = ['cache','logs'];
      
      projectFolders.forEach(folder => {
        const folderPath = path.join(projectFolder, folder);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
      });

      // Create project metadata file
      const metadataPath = path.join(projectFolder, 'project.json');
      if (!fs.existsSync(metadataPath)) {
        const metadata = {
          id: projectId,
          name: this.projectManager.getProjectIdentifier(),
          created: new Date().toISOString(),
          lastAccessed: new Date().toISOString()
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      }

      this.outputChannel.appendLine(`WorkspaceInitialization: Initialized project structure for ${projectId}`);
    } catch (error: any) {
      throw new Error(`Failed to initialize project structure: ${error.message}`);
    }
  }
}