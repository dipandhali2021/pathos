import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { minimatch } from 'minimatch';
import { OutputChannel } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Change {
  uri: vscode.Uri;
  timestamp: Date;
  type: 'added' | 'changed' | 'deleted';
}

export class Tracker extends EventEmitter {
  private changes: Map<string, Change> = new Map();
  private watcher!: vscode.FileSystemWatcher;
  private excludePatterns: string[] = [];
  private outputChannel: OutputChannel;
  private persistPath: string;
  private lastKnownState: Map<string, { hash: string, timestamp: number }> = new Map();

  constructor(outputChannel: OutputChannel) {
    super();
    this.outputChannel = outputChannel;
    
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder found');
    }
    this.persistPath = path.join(workspaceRoot, '.devtrack', 'tracker-state.json');
    
    this.loadPersistedState();
    this.initializeWatcher();
  }

  private shouldTrackFile(filePath: string): boolean {
    // Always exclude .devtrack folder and its contents
    if (filePath.includes('.devtrack')) {
      return false;
    }

    // Exclude common patterns
    const defaultExcludes = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.DS_Store',
      '**/package-lock.json',
      '**/yarn.lock'
    ];

    // Combine default excludes with user-configured excludes
    const allExcludes = [...defaultExcludes, ...this.excludePatterns];

    // Check if file matches any exclude pattern
    return !allExcludes.some(pattern => minimatch(filePath, pattern, { dot: true }));
  }

  private async loadPersistedState() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
        
        // Filter out .devtrack files from existing state
        const filteredState = new Map();
        Object.entries(data.lastKnownState).forEach(([filePath, state]) => {
          if (this.shouldTrackFile(filePath)) {
            filteredState.set(filePath, state);
          }
        });
        
        this.lastKnownState = filteredState;
        this.outputChannel.appendLine('DevTrack: Loaded and filtered persisted tracker state');
      }
    } catch (error) {
      this.outputChannel.appendLine(`DevTrack: Error loading persisted state: ${error}`);
    }
  }

  private persistState() {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Only persist files that should be tracked
      const filteredState = new Map();
      this.lastKnownState.forEach((state, filePath) => {
        if (this.shouldTrackFile(filePath)) {
          filteredState.set(filePath, state);
        }
      });
      
      const data = {
        lastKnownState: Object.fromEntries(filteredState)
      };
      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.outputChannel.appendLine(`DevTrack: Error persisting state: ${error}`);
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return Buffer.from(content).toString('base64');
    } catch {
      return '';
    }
  }

  private initializeWatcher() {
    const config = vscode.workspace.getConfiguration('devtrack');
    this.excludePatterns = config.get<string[]>('exclude') || [];

    this.watcher = vscode.workspace.createFileSystemWatcher(
      '**/*',
      false,
      false,
      false
    );

    this.watcher.onDidChange(async (uri) => {
      if (!this.shouldTrackFile(uri.fsPath)) {
        return;
      }

      const hash = await this.calculateFileHash(uri.fsPath);
      const lastState = this.lastKnownState.get(uri.fsPath);
      
      if (!lastState || lastState.hash !== hash) {
        this.handleChange(uri, 'changed');
        this.lastKnownState.set(uri.fsPath, {
          hash,
          timestamp: Date.now()
        });
        this.persistState();
      }
    });

    this.watcher.onDidCreate(async (uri) => {
      if (!this.shouldTrackFile(uri.fsPath)) {
        return;
      }

      const hash = await this.calculateFileHash(uri.fsPath);
      this.handleChange(uri, 'added');
      this.lastKnownState.set(uri.fsPath, {
        hash,
        timestamp: Date.now()
      });
      this.persistState();
    });

    this.watcher.onDidDelete((uri) => {
      if (!this.shouldTrackFile(uri.fsPath)) {
        return;
      }

      this.handleChange(uri, 'deleted');
      this.lastKnownState.delete(uri.fsPath);
      this.persistState();
    });

    this.outputChannel.appendLine('DevTrack: File system watcher initialized.');
  }

  public handleChange(uri: vscode.Uri, type: 'added' | 'changed' | 'deleted'): void {
    if (!this.shouldTrackFile(uri.fsPath)) {
      return;
    }

    this.changes.set(uri.fsPath, {
      uri,
      timestamp: new Date(),
      type
    });
  }

  public getChangedFiles(): Change[] {
    return Array.from(this.changes.values());
  }

  public clearChanges(): void {
    this.changes.clear();
  }

  public updateExcludePatterns(patterns: string[]): void {
    this.excludePatterns = patterns;
  }
}