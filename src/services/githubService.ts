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

  async createRepo(
    repoName: string = GitHubService.DEFAULT_REPO_NAME,
    isPrivate: boolean = true,
    description: string = 'DevTrack Code Tracking Repository'
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
      vscode.window.showErrorMessage(`DevTrack: Failed to create repository "${repoName}".`);
      return null;
    }
  }

  private async setupTrackingFolder(): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace folder found');
      }

      // Create .devtrack folder
      const trackingFolder = path.join(workspaceRoot, '.devtrack');
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
          fs.writeFileSync(workspaceGitignore, '.devtrack/\n');
        } else {
          const content = fs.readFileSync(workspaceGitignore, 'utf8');
          if (!content.includes('.devtrack/')) {
            fs.appendFileSync(workspaceGitignore, '\n.devtrack/\n');
          }
        }

        // Initialize git in .devtrack folder
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

      this.outputChannel.appendLine('DevTrack: Tracking folder setup completed');
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Error setting up tracking folder - ${error.message}`);
      throw error;
    }
  }

  async repoExists(repoName: string): Promise<boolean> {
    try {
      const username = await this.getUsername();
      if (!username) {
        vscode.window.showErrorMessage(
          'DevTrack: Unable to retrieve GitHub username.'
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
        `DevTrack: Error checking repository "${repoName}".`
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
        'DevTrack: Unable to fetch GitHub username.'
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
      const config = vscode.workspace.getConfiguration('devtrack');
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
        `DevTrack: Updated repository "${repoName}" visibility to ${visibilityChoice.toLowerCase()}`
      );
      vscode.window.showInformationMessage(
        `Repository visibility updated to ${visibilityChoice.toLowerCase()}`
      );

    } catch (error: any) {
      this.outputChannel.appendLine(
        `DevTrack: Error updating repository visibility - ${error.message}`
      );
      vscode.window.showErrorMessage(`DevTrack: ${error.message}`);
    }
  }
}
