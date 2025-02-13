import { Octokit } from '@octokit/rest';
import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class GitHubService {
  private octokit!: Octokit;
  private token: string = '';
  private outputChannel: OutputChannel;
  private static readonly DEFAULT_REPO_NAME = 'code-tracking';

  constructor(outputChannel: OutputChannel) {
    this.outputChannel = outputChannel;
  }

  setToken(token: string) {
    this.token = token;
    this.octokit = new Octokit({ auth: this.token });
  }
  public isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  async createRepo(
    repoName: string = GitHubService.DEFAULT_REPO_NAME,
    isPrivate: boolean = true,
    description: string = 'Pathos Code Tracking Repository'
  ): Promise<string | null> {
    try {
      const response = await this.octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description,
        private: isPrivate,
        auto_init: true,
      });

      // Setup tracking folder structure
      await this.setupTrackingFolder();

      return response.data.clone_url;
    } catch (error: any) {
      this.outputChannel.appendLine(`Error creating repository: ${error.message}`);
      vscode.window.showErrorMessage(`Pathos: Failed to create repository "${repoName}".`);
      return null;
    }
  }

  private async setupTrackingFolder(): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace folder found');
      }

      // Create .pathos folder
      const trackingFolder = path.join(workspaceRoot, '.pathos');
      if (!fs.existsSync(trackingFolder)) {
        fs.mkdirSync(trackingFolder);
        
        // Create necessary subfolders
        const logsFolder = path.join(trackingFolder, 'logs');
        const statsFolder = path.join(trackingFolder, 'stats');
        fs.mkdirSync(logsFolder);
        fs.mkdirSync(statsFolder);

        // Create .gitignore in workspace root if it doesn't exist
        const workspaceGitignore = path.join(workspaceRoot, '.gitignore');
        if (!fs.existsSync(workspaceGitignore)) {
          fs.writeFileSync(workspaceGitignore, '.pathos/\n');
        } else {
          const content = fs.readFileSync(workspaceGitignore, 'utf8');
          if (!content.includes('.pathos/')) {
            fs.appendFileSync(workspaceGitignore, '\n.pathos/\n');
          }
        }

        // Initialize git in .pathos folder
        const trackingGitignore = path.join(trackingFolder, '.gitignore');
        const trackingGitignoreContent = `
# Project specific files
node_modules/
.DS_Store

# Keep logs folder but ignore contents
logs/*
!logs/.gitkeep
stats/*
!stats/.gitkeep
`;
        fs.writeFileSync(trackingGitignore, trackingGitignoreContent);

        // Create .gitkeep files
        fs.writeFileSync(path.join(logsFolder, '.gitkeep'), '');
        fs.writeFileSync(path.join(statsFolder, '.gitkeep'), '');
      }

      this.outputChannel.appendLine('Pathos: Tracking folder setup completed');
    } catch (error: any) {
      this.outputChannel.appendLine(`Pathos: Error setting up tracking folder - ${error.message}`);
      throw error;
    }
  }

  async repoExists(repoName: string): Promise<boolean> {
    try {
      const username = await this.getUsername();
      if (!username) {
        vscode.window.showErrorMessage(
          'Pathos: Unable to retrieve GitHub username.'
        );
        return false;
      }
      await this.octokit.repos.get({
        owner: username,
        repo: repoName,
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      vscode.window.showErrorMessage(
        `Pathos: Error checking repository "${repoName}".`
      );
      return false;
    }
  }

  async getUsername(): Promise<string | null> {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      return data.login;
    } catch (error: any) {
      this.outputChannel.appendLine(
        `Error fetching username: ${error.message}`
      );
      vscode.window.showErrorMessage(
        'Pathos: Unable to fetch GitHub username.'
      );
      return null;
    }
  }

  // New method to update repository visibility
  async updateRepoVisibility(): Promise<void> {
    try {
      // Check if authenticated
      const username = await this.getUsername();
      if (!username) {
        throw new Error('Please sign in to GitHub first');
      }

      // Get repository name from config
      const config = vscode.workspace.getConfiguration('pathos');
      const repoName = config.get<string>('repoName') || 'code-tracking';

      // Show visibility selection dialog
      const visibilityChoice = await vscode.window.showQuickPick(
        ['Private', 'Public'],
        {
          placeHolder: 'Select new repository visibility',
          title: 'Update Repository Visibility',
          ignoreFocusOut: true
        }
      );

      if (!visibilityChoice) {
        return; // User cancelled
      }

      const isPrivate = visibilityChoice === 'Private';

      // Make the API call to update visibility
      await this.octokit.repos.update({
        owner: username,
        repo: repoName,
        private: isPrivate
      });

      // Show success message
      this.outputChannel.appendLine(
        `Pathos: Updated repository "${repoName}" visibility to ${visibilityChoice.toLowerCase()}`
      );
      vscode.window.showInformationMessage(
        `Repository visibility updated to ${visibilityChoice.toLowerCase()}`
      );

    } catch (error: any) {
      this.outputChannel.appendLine(
        `Pathos: Error updating repository visibility - ${error.message}`
      );
      vscode.window.showErrorMessage(`Pathos: ${error.message}`);
    }
  }
}
