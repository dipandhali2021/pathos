/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import * as vscode from 'vscode';
import { GitHubService } from './services/githubService';
import { GitService } from './services/gitService';
import { Tracker } from './services/tracker';
import { SummaryGenerator } from './services/summaryGenerator';
import { Scheduler } from './services/scheduler';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceInitializationService } from './services/workspaceInitializationService';
import { SettingsService } from './services/settingsService';
import { StatusBarMenuService } from './services/statusBarMenuService';

const GITHUB_AUTH_PROVIDER = 'github';
const GITHUB_AUTH_SCOPES = ['repo', 'read:user', 'user:email']; 

// Git installation handling
class GitInstallationHandler {
  private static readonly DOWNLOAD_URLS = {
    win32: 'https://git-scm.com/download/win',
    darwin: 'https://git-scm.com/download/mac',
    linux: 'https://git-scm.com/download/linux',
  };

  static async checkGitInstallation(
    outputChannel: vscode.OutputChannel
  ): Promise<boolean> {
    try {
      const gitVersion = execSync('git --version', { encoding: 'utf8' });
      outputChannel.appendLine(`Pathos: Git found - ${gitVersion.trim()}`);
      return true;
    } catch (error) {
      const platform = process.platform;
      const response = await vscode.window.showErrorMessage(
        'Git is required but not found on your system. This might be because Git is not installed or not in your system PATH.',
        {
          modal: true,
          detail:
            'Would you like to view the installation guide or fix PATH issues?',
        },
        ...(platform === 'win32'
          ? ['Show Installation Guide', 'Fix PATH Issue', 'Cancel']
          : ['Show Installation Guide', 'Cancel'])
      );

      if (response === 'Show Installation Guide') {
        this.showInstallationGuide();
      } else if (response === 'Fix PATH Issue') {
        this.showPathFixGuide();
      }
      return false;
    }
  }

  private static showPathFixGuide() {
    const panel = vscode.window.createWebviewPanel(
      'gitPathGuide',
      'Fix Git PATH Issue',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const content = `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                padding: 20px; 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                line-height: 1.6;
            }
            .step {
                margin-bottom: 20px;
                padding: 15px;
                background-color: #f3f3f3;
                border-radius: 5px;
            }
            .warning {
                color: #856404;
                background-color: #fff3cd;
                border: 1px solid #ffeeba;
                padding: 10px;
                border-radius: 5px;
                margin: 10px 0;
            }
            .tip {
                color: #004085;
                background-color: #cce5ff;
                border: 1px solid #b8daff;
                padding: 10px;
                border-radius: 5px;
                margin: 10px 0;
            }
            img {
                max-width: 100%;
                margin: 10px 0;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 5px;
            }
        </style>
    </head>
    <body>
        <h1>Adding Git to System PATH</h1>
        
        <div class="warning">
            ⚠️ Before proceeding, make sure Git is installed on your system. If not, please install it first.
        </div>

        <div class="step">
            <h3>Step 1: Open System Properties</h3>
            <ul>
                <li>Press <strong>Windows + R</strong> to open Run dialog</li>
                <li>Type <strong>sysdm.cpl</strong> and press Enter</li>
                <li>Go to the <strong>Advanced</strong> tab</li>
                <li>Click <strong>Environment Variables</strong> at the bottom</li>
            </ul>
        </div>

        <div class="step">
            <h3>Step 2: Edit PATH Variable</h3>
            <ul>
                <li>Under <strong>System Variables</strong>, find and select <strong>Path</strong></li>
                <li>Click <strong>Edit</strong></li>
                <li>Click <strong>New</strong></li>
                <li>Add the following paths (if they don't already exist):
                    <ul>
                        <li>C:\\Program Files\\Git\\cmd</li>
                        <li>C:\\Program Files\\Git\\bin</li>
                        <li>C:\\Program Files (x86)\\Git\\cmd</li>
                    </ul>
                </li>
                <li>Click <strong>OK</strong> on all windows</li>
            </ul>
        </div>

        <div class="step">
            <h3>Step 3: Verify Installation</h3>
            <ul>
                <li>Open a <strong>new</strong> Command Prompt or PowerShell window</li>
                <li>Type <strong>git --version</strong> and press Enter</li>
                <li>If you see a version number, Git is successfully added to PATH</li>
            </ul>
        </div>

        <div class="tip">
            💡 Tip: If Git is installed in a different location, you'll need to add that path instead. 
            Common alternative locations:
            <ul>
                <li>C:\\Program Files\\Git\\cmd</li>
                <li>C:\\Users\\[YourUsername]\\AppData\\Local\\Programs\\Git\\cmd</li>
            </ul>
        </div>

        <div class="warning">
            Important: After updating the PATH, you need to:
            <ol>
                <li>Close and reopen VS Code</li>
                <li>Close and reopen any open terminal windows</li>
            </ol>
        </div>
    </body>
    </html>`;

    panel.webview.html = content;
  }

  static showInstallationGuide() {
    const platform = process.platform;
    const downloadUrl =
      this.DOWNLOAD_URLS[platform as keyof typeof this.DOWNLOAD_URLS];
    const instructions = this.getInstructions(platform);

    const panel = vscode.window.createWebviewPanel(
      'gitInstallGuide',
      'Git Installation Guide',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = this.getWebviewContent(instructions, downloadUrl);
  }

  private static getInstructions(platform: string): string {
    const instructions = {
      win32: `Windows Git Installation Guide:
1. Download Git from ${this.DOWNLOAD_URLS.win32}
2. Run the installer
3. During installation:
   - Choose "Git from the command line and also from 3rd-party software"
   - Choose "Use Windows' default console window"
   - Choose "Enable Git Credential Manager"
4. Important: On the "Adjusting your PATH environment" step:
   - Select "Git from the command line and also from 3rd-party software"
5. Complete the installation
6. Verify installation:
   - Open a new Command Prompt or PowerShell
   - Type 'git --version'`,
      darwin: `Mac Git Installation Guide:
Option 1 - Using Homebrew (Recommended):
1. Open Terminal
2. Install Homebrew if not installed:
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
3. Install Git:
   brew install git

Option 2 - Direct Download:
1. Download Git from ${this.DOWNLOAD_URLS.darwin}
2. Open the downloaded .dmg file
3. Run the installer package`,
      linux: `Linux Git Installation Guide:
Debian/Ubuntu:
1. Open Terminal
2. Run: sudo apt-get update
3. Run: sudo apt-get install git

Fedora:
1. Open Terminal
2. Run: sudo dnf install git`,
    };

    return (
      instructions[platform as keyof typeof instructions] || instructions.linux
    );
  }

  private static getWebviewContent(
    instructions: string,
    downloadUrl: string
  ): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                padding: 20px; 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                line-height: 1.6;
            }
            pre { 
                white-space: pre-wrap; 
                background-color: #f3f3f3; 
                padding: 15px; 
                border-radius: 5px; 
            }
            .download-btn { 
                padding: 10px 20px; 
                background-color: #007acc; 
                color: white; 
                border: none; 
                border-radius: 5px;
                cursor: pointer;
                margin-top: 20px;
                text-decoration: none;
                display: inline-block;
            }
            .download-btn:hover { 
                background-color: #005999; 
            }
            .tip {
                background-color: #e8f5e9;
                padding: 10px;
                border-radius: 5px;
                margin: 10px 0;
            }
        </style>
    </head>
    <body>
        <h1>Git Installation Guide</h1>
        <pre>${instructions}</pre>
        <div class="tip">
            <strong>Tip:</strong> After installation, if Git is not recognized:
            <ul>
                <li>Make sure to restart VS Code</li>
                <li>Open a new terminal window</li>
                <li>If still not working, you might need to add Git to your PATH</li>
            </ul>
        </div>
        <a href="${downloadUrl}" class="download-btn" target="_blank">Download Git</a>
    </body>
    </html>`;
  }
}

function showWelcomeInfo(outputChannel: vscode.OutputChannel) {
  const message =
    'Welcome to Pathos! Would you like to set up automatic code tracking?';
  const welcomeMessage = `
To get started with Pathos, you'll need:
1. A GitHub account
2. An open workspace/folder
3. Git installed on your system (Download from https://git-scm.com/downloads)

Pathos will:
- Create a private GitHub repository to store your coding activity
- Automatically track and commit your changes
- Generate detailed summaries of your work
  `;

  GitInstallationHandler.checkGitInstallation(outputChannel).then(
    (gitInstalled) => {
      if (!gitInstalled) {
        return;
      }

      vscode.window
        .showInformationMessage(message, 'Get Started', 'Learn More', 'Later')
        .then((selection) => {
          if (selection === 'Get Started') {
            vscode.commands.executeCommand('pathos.login');
          } else if (selection === 'Learn More') {
            vscode.window
              .showInformationMessage(welcomeMessage, 'Set Up Now', 'Later')
              .then((choice) => {
                if (choice === 'Set Up Now') {
                  vscode.commands.executeCommand('pathos.login');
                }
              });
          }
        });
    }
  );
}

async function recoverFromGitIssues(services: PathosServices): Promise<void> {
  try {
    // Clear existing Git state
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder found');
    }

    const gitPath = path.join(workspaceRoot, '.git');
    if (fs.existsSync(gitPath)) {
      await vscode.workspace.fs.delete(vscode.Uri.file(gitPath), {
        recursive: true,
      });
    }

    // Clear the existing session by requesting with createIfNone: false
    try {
      await vscode.authentication.getSession('github', ['repo', 'read:user'], {
        createIfNone: false,
        clearSessionPreference: true,
      });
    } catch (error) {
      // Ignore errors here, just trying to clear the session
    }

    // Reinitialize services
    const githubService = new GitHubService(services.outputChannel);
    services.githubService = new GitHubService(services.outputChannel);
    services.gitService = new GitService(services.outputChannel,githubService);

    // Get fresh GitHub token
    const session = await vscode.authentication.getSession(
      'github',
      ['repo', 'read:user'],
      {
        createIfNone: true,
        clearSessionPreference: true,
      }
    );

    if (!session) {
      throw new Error('Failed to authenticate with GitHub');
    }

    services.githubService.setToken(session.accessToken);

    // Setup repository from scratch
    const username = await services.githubService.getUsername();
    if (!username) {
      throw new Error('Failed to get GitHub username');
    }

    const config = vscode.workspace.getConfiguration('pathos');
    const repoName = config.get<string>('repoName') || 'code-tracking';
    const remoteUrl = `https://github.com/${username}/${repoName}.git`;

    await services.gitService.initializeRepo(remoteUrl);
  } catch (error: any) {
    throw new Error(`Recovery failed: ${error.message}`);
  }
}

// Extension activation handler
export async function activate(context: vscode.ExtensionContext) {
  let testCommand = vscode.commands.registerCommand('pathos.test', () => {
    vscode.window.showInformationMessage(
      'Pathos Debug Version: Test Command Executed'
    );
  });
  context.subscriptions.push(testCommand);

  const services = await initializeServices(context);
  if (!services) {
    return;
  }

  registerCommands(context, services);
  setupConfigurationHandling(services);
  showWelcomeMessage(context, services);
}
interface PersistedAuthState {
  username?: string;
  repoName?: string;
  lastWorkspace?: string;
}
// Interface for services
interface PathosServices {
  outputChannel: vscode.OutputChannel;
  githubService: GitHubService;
  gitService: GitService;
  tracker: Tracker;
  summaryGenerator: SummaryGenerator;
  scheduler: Scheduler | null;
  trackingStatusBar: vscode.StatusBarItem;
  authStatusBar: vscode.StatusBarItem;
  extensionContext: vscode.ExtensionContext;
  workspaceInitService: WorkspaceInitializationService;
  settingsService: SettingsService;
  statusBarMenuService?: StatusBarMenuService;
}

async function restoreAuthenticationState(
  context: vscode.ExtensionContext,
  services: PathosServices
): Promise<boolean> {
  try {
    // First check if we have a session ID stored
    const sessionId = context.globalState.get<string>('githubSessionId');
    
    // Try to get existing session silently
    const session = await vscode.authentication.getSession(
      GITHUB_AUTH_PROVIDER,
      GITHUB_AUTH_SCOPES,
      {
        createIfNone: false,
        silent: true
      }
    );

    if (session) {
      // Store the session ID for future use
      await context.globalState.update('githubSessionId', session.id);
      
      services.githubService.setToken(session.accessToken);
      const username = await services.githubService.getUsername();

      if (username) {
        const persistedState = context.globalState.get<PersistedAuthState>('pathosAuthState');
        const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const config = vscode.workspace.getConfiguration('pathos');
        const repoName = config.get<string>('repoName') || persistedState?.repoName || 'code-tracking';
        const remoteUrl = `https://github.com/${username}/${repoName}.git`;

        const repoExists = await services.githubService.repoExists(repoName);
        let isPrivate = true;

        if (!repoExists) {
          const visibilityChoice = await vscode.window.showQuickPick(
            ['Private', 'Public'],
            {
              placeHolder: 'Select repository visibility',
              title: 'Repository Privacy Setting',
              ignoreFocusOut: true,
            }
          );
          isPrivate = visibilityChoice === 'Private';
        }

        await setupRepository(services, repoName, remoteUrl, isPrivate);
        await initializeTracker(services);

        updateStatusBar(services, 'auth', true);
        updateStatusBar(services, 'tracking', true);

        await context.globalState.update('pathosAuthState', {
          username,
          repoName,
          lastWorkspace: currentWorkspace,
        });

        services.outputChannel.appendLine('Pathos: Successfully restored authentication state');
        return true;
      }
    }
  } catch (error) {
    services.outputChannel.appendLine(`Pathos: Error restoring auth state - ${error}`);
  }
  return false;
}

async function initializeServices(context: vscode.ExtensionContext): Promise<PathosServices | null> {
  const outputChannel = vscode.window.createOutputChannel('Pathos');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('Pathos: Extension activated.');
  const workspaceInitService = new WorkspaceInitializationService(outputChannel);
  const githubService = new GitHubService(outputChannel);
  const services: PathosServices = {
    outputChannel,
    githubService,
    gitService: new GitService(outputChannel, githubService),
    tracker: new Tracker(outputChannel),
    summaryGenerator: new SummaryGenerator(outputChannel),
    scheduler: null,
    trackingStatusBar: createStatusBarItem('tracking'),
    authStatusBar: createStatusBarItem('auth'),
    extensionContext: context,
    workspaceInitService,
    settingsService: new SettingsService(outputChannel),
  };
  
  // Add status bars to subscriptions
  context.subscriptions.push(services.trackingStatusBar, services.authStatusBar);
  await services.workspaceInitService.initializeWorkspace();
  
  // Try to restore authentication state silently
  const authRestored = await restoreAuthenticationState(context, services);

  // Only show auth prompt if restoration failed and user hasn't chosen "Don't Ask Again"
  if (!authRestored) {
    const shouldPrompt = context.globalState.get('pathosShouldPromptAuth', true);
    if (shouldPrompt) {
      const response = await vscode.window.showInformationMessage(
        'Pathos needs to connect to GitHub. Would you like to connect now?',
        'Yes',
        'No',
        "Don't Ask Again"
      );

      if (response === 'Yes') {
        vscode.commands.executeCommand('pathos.login');
      } else if (response === "Don't Ask Again") {
        await context.globalState.update('pathosShouldPromptAuth', false);
      }
    }
  }

  // Load and validate configuration
  if (!(await loadConfiguration(services))) {
    return null;
  }

  return services;
}

function createStatusBarItem(type: 'tracking' | 'auth'): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    type === 'tracking' ? 100 : 101
  );

  if (type === 'tracking') {
    item.text = '$(circle-slash) Pathos: Stopped';
    item.tooltip = 'Pathos: Tracking is stopped';
  } else {
    item.text = '$(mark-github) Pathos: Not Connected';
    item.tooltip = 'Pathos Status';
  }

  item.show();
  return item;
}

async function loadConfiguration(services: PathosServices): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('pathos');
  const repoName = config.get<string>('repoName') || 'code-tracking';

  if (!repoName || repoName.trim() === '') {
    vscode.window.showErrorMessage(
      'Pathos: Repository name is not set correctly in the configuration.'
    );
    services.outputChannel.appendLine(
      'Pathos: Repository name is missing or invalid.'
    );
    return false;
  }

  return true;
}

async function registerCommands(
  context: vscode.ExtensionContext,
  services: PathosServices
) {
  // Start Tracking Command
  const startTracking = vscode.commands.registerCommand(
    'pathos.startTracking',
    async () => {
      try {
        // Check for workspace
        if (!vscode.workspace.workspaceFolders?.length) {
          throw new Error(
            'Please open a folder or workspace before starting tracking.'
          );
        }

        // Check Git installation
        if (
          !(await GitInstallationHandler.checkGitInstallation(
            services.outputChannel
          ))
        ) {
          return;
        }

        // Check GitHub authentication
        if (!(await ensureGitHubAuth(services))) {
          return;
        }

        if (services.scheduler) {
          services.scheduler.start();
          updateStatusBar(services, 'tracking', true);
          vscode.window.showInformationMessage('Pathos: Tracking started.');
          services.outputChannel.appendLine(
            'Pathos: Tracking started manually.'
          );
        } else {
          const response = await vscode.window.showInformationMessage(
            'Pathos needs to be set up before starting. Would you like to set it up now?',
            'Set Up Pathos',
            'Cancel'
          );

          if (response === 'Set Up Pathos') {
            await initializePathos(services);
          }
        }
      } catch (error: any) {
        handleError(services, 'Error starting tracking', error);
      }
    }
  );

  // Stop Tracking Command
  const stopTracking = vscode.commands.registerCommand(
    'pathos.stopTracking',
    () => {
      if (services.scheduler) {
        services.scheduler.stop();
        updateStatusBar(services, 'tracking', false);
        vscode.window.showInformationMessage('Pathos: Tracking stopped.');
        services.outputChannel.appendLine(
          'Pathos: Tracking stopped manually.'
        );
      } else {
        vscode.window.showErrorMessage(
          'Pathos: Please connect to GitHub first.'
        );
        services.outputChannel.appendLine(
          'Pathos: Scheduler is not initialized.'
        );
      }
    }
  );

  // Login Command
  const loginCommand = vscode.commands.registerCommand(
    'pathos.login',
    async () => {
      try {
        services.githubService.setToken('');
        const session = await vscode.authentication.getSession(
          GITHUB_AUTH_PROVIDER,
          GITHUB_AUTH_SCOPES,
          { createIfNone: true }
        );
  
        if (session) {
          // Store the session ID
          await context.globalState.update('githubSessionId', session.id);
          await initializePathos(services);
        } else {
          services.outputChannel.appendLine('Pathos: GitHub connection canceled.');
          vscode.window.showInformationMessage('Pathos: GitHub connection was canceled.');
        }
      } catch (error: any) {
        handleError(services, 'GitHub connection failed', error);
      }
    }
  );

  // Logout Command
  const logoutCommand = vscode.commands.registerCommand('pathos.logout', () =>
    handleLogout(services)
  );

  const updateRepoVisibilityCmd = vscode.commands.registerCommand(
    'pathos.updateRepoVisibility',
    () => services.githubService.updateRepoVisibility()
  );

  const updateCommitFrequency = vscode.commands.registerCommand(
    'pathos.updateCommitFrequency',
    () => services.settingsService.updateCommitFrequency()
  );

  const toggleConfirmBeforeCommit = vscode.commands.registerCommand(
    'pathos.toggleConfirmBeforeCommit',
    () => services.settingsService.toggleConfirmBeforeCommit()
  );
  const statusBarMenu = new StatusBarMenuService(services);
  context.subscriptions.push(statusBarMenu);

   // Add menu command
   const showMenu = vscode.commands.registerCommand(
    'pathos.showMenu',
    () => statusBarMenu.showMenu()
  );


  // Add to subscriptions
  context.subscriptions.push(
    startTracking,
    stopTracking,
    loginCommand,
    logoutCommand,
    updateRepoVisibilityCmd,
    updateCommitFrequency,
    toggleConfirmBeforeCommit,
    showMenu
  );

  services.trackingStatusBar.hide();
  services.authStatusBar.hide();
}

// // Update the interface to include extensionContext
// interface PathosServices {
//   outputChannel: vscode.OutputChannel;
//   githubService: GitHubService;
//   gitService: GitService;
//   tracker: Tracker;
//   summaryGenerator: SummaryGenerator;
//   scheduler: Scheduler | null;
//   trackingStatusBar: vscode.StatusBarItem;
//   authStatusBar: vscode.StatusBarItem;
//   extensionContext: vscode.ExtensionContext;
//   statusBarMenuService: StatusBarMenuService;
// }


async function initializePathos(services: PathosServices) {
  try {
    services.outputChannel.appendLine('Pathos: Starting initialization...');

    // Verify Git installation with improved error handling
    if (!(await GitInstallationHandler.checkGitInstallation(services.outputChannel))) {
      const response = await vscode.window.showErrorMessage(
        'Pathos requires Git to be installed and properly configured. Would you like to see the installation guide?',
        'Show Guide',
        'Cancel'
      );

      if (response === 'Show Guide') {
        await vscode.commands.executeCommand('pathos.showGitGuide');
      }
      throw new Error('Git must be installed before Pathos can be initialized.');
    }

    // Get GitHub authentication
    const session = await vscode.authentication.getSession('github', ['repo', 'read:user', 'user:email'], {
      createIfNone: true,
      clearSessionPreference: true
    });

    if (!session) {
      throw new Error('GitHub authentication is required to use Pathos.');
    }

    // Initialize GitHub service
    try {
      services.githubService.setToken(session.accessToken);
      const username = await services.githubService.getUsername();

      if (!username) {
        throw new Error('Unable to retrieve GitHub username. Please try logging in again.');
      }

      // Get repository configuration
      const config = vscode.workspace.getConfiguration('pathos');
      const repoName = config.get<string>('repoName') || 'code-tracking';
      const remoteUrl = `https://github.com/${username}/${repoName}.git`;

      // Check if repository exists
      const repoExists = await services.githubService.repoExists(repoName);
      let isPrivate = true; // Default to private

      if (!repoExists) {
        // Only show visibility choice for new repositories
        const visibilityChoice = await vscode.window.showQuickPick(['Private', 'Public'], {
          placeHolder: 'Select repository visibility',
          title: 'Repository Privacy Setting',
          ignoreFocusOut: true,
        });

        if (!visibilityChoice) {
          throw new Error('Repository visibility selection is required.');
        }

        isPrivate = visibilityChoice === 'Private';
      }

      await setupRepository(services, repoName, remoteUrl, isPrivate);
      await initializeTracker(services);

      // Persist authentication state using the context from services
      await services.extensionContext.globalState.update('pathosAuthState', {
        username,
        repoName,
        lastWorkspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      });

      updateStatusBar(services, 'auth', true);
      updateStatusBar(services, 'tracking', true);

      services.outputChannel.appendLine('Pathos: Initialization completed successfully.');
      vscode.window.showInformationMessage('Pathos has been set up successfully and tracking has started.');
    } catch (error: any) {
      if (error.message.includes('git')) {
        throw new Error('There was an issue with Git configuration. Please ensure Git is properly installed and try again.');
      }
      throw error;
    }
  } catch (error: any) {
    handleError(services, 'Initialization failed', error);
    throw error;
  }
}

async function setupRepository(
  services: PathosServices,
  repoName: string,
  remoteUrl: string,
  isPrivate: boolean
) {
  const repoExists = await services.githubService.repoExists(repoName);

  if (!repoExists) {
    const createdRepoUrl = await services.githubService.createRepo(repoName, isPrivate);
    if (!createdRepoUrl) {
      throw new Error(
        'Failed to create GitHub repository. Please check your permissions.'
      );
    }
    services.outputChannel.appendLine(
      `Pathos: Created new ${isPrivate ? 'private' : 'public'} repository at ${remoteUrl}`
    );
  }

  await services.gitService.initializeRepo(remoteUrl);
}


async function initializeTracker(services: PathosServices) {
  const config = vscode.workspace.getConfiguration('pathos');
  const commitFrequency = config.get<number>('commitFrequency') || 30;

  services.scheduler = new Scheduler(
    commitFrequency,
    services.tracker,
    services.summaryGenerator,
    services.gitService,
    services.outputChannel
  );
  services.scheduler.start();
}


async function handleLogout(services: PathosServices) {
  const confirm = await vscode.window.showWarningMessage(
    'Are you sure you want to logout from Pathos?',
    { modal: true },
    'Yes',
    'No'
  );

  if (confirm !== 'Yes') {
    services.outputChannel.appendLine('Pathos: Logout cancelled by user.');
    return;
  }

  // Clear stored session ID
  await services.extensionContext.globalState.update('githubSessionId', undefined);
  
  cleanup(services);

  const loginChoice = await vscode.window.showInformationMessage(
    'Pathos: Successfully logged out. Would you like to log in with a different account?',
    'Yes',
    'No'
  );

  if (loginChoice === 'Yes') {
    vscode.commands.executeCommand('pathos.login');
  }
}

function cleanup(services: PathosServices) {
  services.githubService.setToken('');
  updateStatusBar(services, 'auth', false);
  updateStatusBar(services, 'tracking', false);

  if (services.scheduler) {
    services.scheduler.stop();
    services.scheduler = null;
  }

  services.outputChannel.appendLine('Pathos: Cleaned up services.');
}

function updateStatusBar(
  services: PathosServices,
  type: 'tracking' | 'auth',
  active: boolean
) {
  const { trackingStatusBar, authStatusBar } = services;

  if (type === 'tracking') {
    trackingStatusBar.text = active
      ? '$(clock) Pathos: Tracking'
      : '$(circle-slash) Pathos: Stopped';
    trackingStatusBar.tooltip = active
      ? 'Pathos: Tracking your coding activity is active'
      : 'Pathos: Tracking is stopped';
  } else {
    authStatusBar.text = active
      ? '$(check) Pathos: Connected'
      : '$(mark-github) Pathos: Not Connected';
    authStatusBar.tooltip = active
      ? 'Pathos is connected to GitHub'
      : 'Pathos Status';
  }
}

function handleError(
  services: PathosServices,
  context: string,
  error: Error
) {
  const message = error.message || 'An unknown error occurred';
  services.outputChannel.appendLine(`Pathos: ${context} - ${message}`);
  vscode.window.showErrorMessage(`Pathos: ${message}`);
}

async function ensureGitHubAuth(services: PathosServices): Promise<boolean> {
  try {
    const session = await vscode.authentication.getSession('github', [
      'repo',
      'read:user',
      'user:email',
    ]);
    return !!session;
  } catch {
    const response = await vscode.window.showErrorMessage(
      'Pathos requires GitHub authentication. Would you like to sign in now?',
      'Sign in to GitHub',
      'Cancel'
    );

    if (response === 'Sign in to GitHub') {
      await vscode.commands.executeCommand('pathos.login');
    }
    return false;
  }
}

function setupConfigurationHandling(services: PathosServices) {
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('pathos')) {
      handleConfigurationChange(services);
    }
  });
}

async function handleConfigurationChange(services: PathosServices) {
  const config = vscode.workspace.getConfiguration('pathos');

  if (services.scheduler) {
    const newFrequency = config.get<number>('commitFrequency') || 30;
    services.scheduler.updateFrequency(newFrequency);
    services.outputChannel.appendLine(
      `Pathos: Commit frequency updated to ${newFrequency} minutes.`
    );
  }

  const newExcludePatterns = config.get<string[]>('exclude') || [];
  services.tracker.updateExcludePatterns(newExcludePatterns);
  services.outputChannel.appendLine('Pathos: Configuration updated.');
}

function showWelcomeMessage(
  context: vscode.ExtensionContext,
  services: PathosServices
) {
  if (!context.globalState.get('pathosWelcomeShown')) {
    showWelcomeInfo(services.outputChannel);
    context.globalState.update('pathosWelcomeShown', true);
  }
}

export function deactivate() { }
