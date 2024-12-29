
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
  private isTracking: boolean = false;
  private disposables: vscode.Disposable[] = [];

  constructor(services: DevTrackServices) {
    this.services = services;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    this.statusBarItem.name = 'DevTrack Menu';
    this.statusBarItem.command = 'devtrack.showMenu';
    this.isTracking = this.services.scheduler !== null;
    this.updateStatusBarItem();
    this.statusBarItem.show();

    // Register command listeners
    this.disposables.push(
      vscode.commands.registerCommand('devtrack.startTracking', () => {
        this.isTracking = true;
        this.updateStatusBarItem();
      }),
      vscode.commands.registerCommand('devtrack.stopTracking', () => {
        this.isTracking = false;
        this.updateStatusBarItem();
      })
    );
  }

  private updateStatusBarItem() {
    this.statusBarItem.text = '$(git-commit) DevTrack';
    this.statusBarItem.tooltip = 'Click to show DevTrack commands';
  }

  private getStatusItems(): vscode.QuickPickItem[] {
    const isAuthenticated = this.services.githubService.isAuthenticated();

    return [
      {
        label: 'Status',
        kind: vscode.QuickPickItemKind.Separator,
      },
      {
        label: this.isTracking
          ? '$(check) Tracking Active'
          : '$(circle-slash) Tracking Inactive',
        description: this.isTracking
          ? 'Currently tracking your coding activity'
          : 'Tracking is paused',
        kind: vscode.QuickPickItemKind.Default,
        buttons: [],
      },
      {
        label: isAuthenticated
          ? '$(pass) GitHub Connected'
          : '$(error) GitHub Not Connected',
        description: isAuthenticated
          ? 'Authenticated with GitHub'
          : 'Please connect your GitHub account',
        kind: vscode.QuickPickItemKind.Default,
        buttons: [],
      },
      {
        label: 'Commands',
        kind: vscode.QuickPickItemKind.Separator,
      },
    ];
  }

  async showMenu() {
    const statusItems = this.getStatusItems();

    const commandItems: vscode.QuickPickItem[] = [
      {
        label: this.isTracking ? '$(stop) Stop Tracking' : '$(sync) Start Tracking',
        description: this.isTracking ? 'Stop automatic code tracking' : 'Start automatic code tracking',
        detail: this.isTracking ? 'Pause tracking your coding activity' : 'Begin tracking your coding activity',
      },
      {
        label: '$(clock) Update Commit Frequency',
        description: 'Change how often changes are committed',
        detail:
          'Current frequency: ' +
          (vscode.workspace
            .getConfiguration('devtrack')
            .get('commitFrequency') || 1) +
          ' minutes',
      },
      {
        label: '$(check) Toggle Commit Confirmation',
        description: 'Enable/disable commit confirmation dialog',
        detail:
          'Current: ' +
          (vscode.workspace
            .getConfiguration('devtrack')
            .get('confirmBeforeCommit')
            ? 'Enabled'
            : 'Disabled'),
      },
      {
        label: '$(github) Update Repository Visibility',
        description: 'Change repository privacy settings',
        detail: 'Switch between public and private',
      },
      {
        label: '$(sign-in) Login to GitHub',
        description: 'Connect your GitHub account',
      },
      {
        label: '$(sign-out) Logout from GitHub',
        description: 'Disconnect your GitHub account',
      },
    ];

    const allItems = [...statusItems, ...commandItems];

    const selected = await vscode.window.showQuickPick(allItems, {
      placeHolder: 'Select a DevTrack action',
      title: 'DevTrack Menu',
    });

    if (selected) {
      if (selected.label.includes('Start Tracking')) {
        await vscode.commands.executeCommand('devtrack.startTracking');
      } else if (selected.label.includes('Stop Tracking')) {
        await vscode.commands.executeCommand('devtrack.stopTracking');
      } else if (selected.label === '$(clock) Update Commit Frequency') {
        await this.services.settingsService.updateCommitFrequency();
      } else if (selected.label === '$(check) Toggle Commit Confirmation') {
        await this.services.settingsService.toggleConfirmBeforeCommit();
      } else if (selected.label === '$(github) Update Repository Visibility') {
        await vscode.commands.executeCommand('devtrack.updateRepoVisibility');
      } else if (selected.label === '$(sign-in) Login to GitHub') {
        await vscode.commands.executeCommand('devtrack.login');
      } else if (selected.label === '$(sign-out) Logout from GitHub') {
        await vscode.commands.executeCommand('devtrack.logout');
      }
    }
  }

  dispose() {
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}