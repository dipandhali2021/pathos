import * as vscode from 'vscode';
import { GitHubService } from './githubService';
import { GitService } from './gitService';
import { Tracker } from './tracker';
import { SummaryGenerator } from './summaryGenerator';
import { Scheduler } from './scheduler';
import { WorkspaceInitializationService } from './workspaceInitializationService';
import { SettingsService } from './settingsService';

interface DevTrackServices {
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
}

export class StatusBarMenuService {
  private statusBarItem: vscode.StatusBarItem;
  private services: DevTrackServices;

  constructor(services: DevTrackServices) {
    this.services = services;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    this.statusBarItem.name = 'DevTrack Menu';
    this.statusBarItem.command = 'devtrack.showMenu';
    this.updateStatusBarItem();
    this.statusBarItem.show();
  }

  private updateStatusBarItem() {
    this.statusBarItem.text = '$(git-commit) DevTrack';
    this.statusBarItem.tooltip = 'Click to show DevTrack commands';
  }

  private getStatusItems(): vscode.QuickPickItem[] {
    const { trackingStatusBar } = this.services;
    let isTracking = false;
    if (trackingStatusBar.text.includes('Tracking')) {
        isTracking = true;
    }
    const isAuthenticated = this.services.githubService.isAuthenticated();
    const config = vscode.workspace.getConfiguration('devtrack');
    const aiEnabled = config.get<boolean>('enableAiInsights', true);
    const hasAiKey = Boolean(config.get('aiApiKey'));

    return [
      {
        label: 'Status',
        kind: vscode.QuickPickItemKind.Separator
      },
      {
        label: isTracking ? '$(check) Tracking Active' : '$(circle-slash) Tracking Inactive',
        description: isTracking ? 'Currently tracking your coding activity' : 'Tracking is paused',
        kind: vscode.QuickPickItemKind.Default,
        buttons: []
      },
      {
        label: isAuthenticated ? '$(pass) GitHub Connected' : '$(error) GitHub Not Connected',
        description: isAuthenticated ? 'Authenticated with GitHub' : 'Please connect your GitHub account',
        kind: vscode.QuickPickItemKind.Default,
        buttons: []
      },
      {
        label: hasAiKey ? (aiEnabled ? '$(pass) AI Insights Enabled' : '$(circle-slash) AI Insights Disabled') : '$(warning) AI Not Configured',
        description: hasAiKey ? (aiEnabled ? 'AI analysis is active' : 'AI analysis is disabled') : 'Configure AI API key to enable insights',
        kind: vscode.QuickPickItemKind.Default,
        buttons: []
      },
      {
        label: 'Commands',
        kind: vscode.QuickPickItemKind.Separator
      }
    ];
  }

  private async configureAiApiKey() {
    const config = vscode.workspace.getConfiguration('devtrack');
    const currentKey = config.get('aiApiKey', '');

    const newKey = await vscode.window.showInputBox({
      prompt: 'Enter your Google AI API Key',
      placeHolder: 'Your API Key',
      password: true,
      value: currentKey,
      ignoreFocusOut: true,
      validateInput: (value) => {
        return value && value.length > 0 ? null : 'API Key cannot be empty';
      }
    });

    if (newKey !== undefined) {
      await config.update('aiApiKey', newKey, true);
      this.services.outputChannel.appendLine('DevTrack: AI API Key updated');
      vscode.window.showInformationMessage('DevTrack: AI API Key has been updated');
    }
  }

  private async toggleAiInsights() {
    const config = vscode.workspace.getConfiguration('devtrack');
    const currentValue = config.get<boolean>('enableAiInsights', true);
    await config.update('enableAiInsights', !currentValue, true);
    
    const status = !currentValue ? 'enabled' : 'disabled';
    this.services.outputChannel.appendLine(`DevTrack: AI insights ${status}`);
    vscode.window.showInformationMessage(`DevTrack: AI insights have been ${status}`);
  }

  async showMenu() {
    const statusItems = this.getStatusItems();
    const config = vscode.workspace.getConfiguration('devtrack');
    const aiEnabled = config.get<boolean>('enableAiInsights', true);
    
    const commandItems: vscode.QuickPickItem[] = [
      {
        label: '$(sync) Start Tracking',
        description: 'Start automatic code tracking',
        detail: 'Begin tracking your coding activity',
      },
      {
        label: '$(stop) Stop Tracking',
        description: 'Stop automatic code tracking',
        detail: 'Pause tracking your coding activity',
      },
      {
        label: '$(clock) Update Commit Frequency',
        description: 'Change how often changes are committed',
        detail: 'Current frequency: ' + 
          (vscode.workspace.getConfiguration('devtrack').get('commitFrequency') || 1) + 
          ' minutes',
      },
      {
        label: '$(check) Toggle Commit Confirmation',
        description: 'Enable/disable commit confirmation dialog',
        detail: 'Current: ' + 
          (vscode.workspace.getConfiguration('devtrack').get('confirmBeforeCommit') 
            ? 'Enabled' 
            : 'Disabled'),
      },
      {
        label: '$(github) Update Repository Visibility',
        description: 'Change repository privacy settings',
        detail: 'Switch between public and private',
      },
      {
        label: '$(settings-gear) Configure AI API Key',
        description: 'Set up Google AI API key for insights',
        detail: config.get('aiApiKey') ? 'Update existing API key' : 'Configure new API key',
      },
      {
        label: aiEnabled ? '$(eye-closed) Disable AI Insights' : '$(eye) Enable AI Insights',
        description: aiEnabled ? 'Turn off AI analysis in reports' : 'Turn on AI analysis in reports',
        detail: aiEnabled ? 'AI insights are currently enabled' : 'AI insights are currently disabled',
      },
      {
        label: '$(sign-in) Login to GitHub',
        description: 'Connect your GitHub account',
      },
      {
        label: '$(sign-out) Logout from GitHub',
        description: 'Disconnect your GitHub account',
      }
    ];

    const allItems = [...statusItems, ...commandItems];

    const selected = await vscode.window.showQuickPick(allItems, {
      placeHolder: 'Select a DevTrack action',
      title: 'DevTrack Menu'
    });

    if (selected) {
      switch (selected.label) {
        case '$(sync) Start Tracking':
          vscode.commands.executeCommand('devtrack.startTracking');
          break;
        case '$(stop) Stop Tracking':
          vscode.commands.executeCommand('devtrack.stopTracking');
          break;
        case '$(clock) Update Commit Frequency':
          await this.services.settingsService.updateCommitFrequency();
          break;
        case '$(check) Toggle Commit Confirmation':
          await this.services.settingsService.toggleConfirmBeforeCommit();
          break;
        case '$(github) Update Repository Visibility':
          vscode.commands.executeCommand('devtrack.updateRepoVisibility');
          break;
        case '$(settings-gear) Configure AI API Key':
          await this.configureAiApiKey();
          break;
        case '$(eye-closed) Disable AI Insights':
        case '$(eye) Enable AI Insights':
          await this.toggleAiInsights();
          break;
        case '$(sign-in) Login to GitHub':
          vscode.commands.executeCommand('devtrack.login');
          break;
        case '$(sign-out) Logout from GitHub':
          vscode.commands.executeCommand('devtrack.logout');
          break;
      }
    }
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}