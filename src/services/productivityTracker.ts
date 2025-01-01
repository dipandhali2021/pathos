import * as vscode from 'vscode';
import { Change } from './tracker';
import { DiffCalculator } from './diffCalculator';
import { FileCache } from './fileCache';

interface FileActivity {
  startTime: number;
  lastEditTime: number;
  editCount: number;
  linesAdded: number;
  linesDeleted: number;
  timeSpentMs: number;
}

export class ProductivityTracker {
  private fileActivities: Map<string, FileActivity> = new Map();
  private diffCalculator: DiffCalculator;
  private fileCache: FileCache;
  private static readonly IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  private totalLinesAdded: number = 0;
  private totalLinesDeleted: number = 0;

  constructor(private outputChannel: vscode.OutputChannel) {
    this.diffCalculator = new DiffCalculator(outputChannel);
    this.fileCache = new FileCache(outputChannel);
    this.setupListeners();
  }

  private setupListeners() {
    vscode.workspace.onDidChangeTextDocument(event => {
      const filePath = event.document.uri.fsPath;
      this.trackEdit(filePath, event.contentChanges.length);
    });
  }

  private trackEdit(filePath: string, changeCount: number) {
    const now = Date.now();
    let activity = this.fileActivities.get(filePath);

    if (!activity) {
      activity = {
        startTime: now,
        lastEditTime: now,
        editCount: 0,
        linesAdded: 0,
        linesDeleted: 0,
        timeSpentMs: 0
      };
    } else {
      const timeSinceLastEdit = now - activity.lastEditTime;
      if (timeSinceLastEdit < ProductivityTracker.IDLE_THRESHOLD) {
        activity.timeSpentMs += timeSinceLastEdit;
      }
    }

    activity.lastEditTime = now;
    activity.editCount += changeCount;
    this.fileActivities.set(filePath, activity);
  }

  public async trackChanges(changes: Change[]): Promise<void> {
    this.totalLinesAdded = 0;
    this.totalLinesDeleted = 0;

    for (const change of changes) {
      try {
        switch (change.type) {
          case 'added': {
            const content = await this.getFileContent(change.uri);
            const lines = content.split('\n').filter(line => line.trim() !== '').length;
            this.totalLinesAdded += lines;
            
            const activity = this.getActivity(change.uri.fsPath);
            activity.linesAdded += lines;
            break;
          }
          case 'deleted': {
            const oldContent = this.fileCache.getCachedContent(change.uri) || '';
            const lines = oldContent.split('\n').filter(line => line.trim() !== '').length;
            this.totalLinesDeleted += lines;
            
            const activity = this.getActivity(change.uri.fsPath);
            activity.linesDeleted += lines;
            break;
          }
          case 'changed': {
            const oldContent = this.fileCache.getCachedContent(change.uri) || '';
            const newContent = await this.getFileContent(change.uri);
            const diff = this.diffCalculator.calculateDiff(oldContent, newContent);
            
            this.totalLinesAdded += diff.additions;
            this.totalLinesDeleted += diff.deletions;
            
            const activity = this.getActivity(change.uri.fsPath);
            activity.linesAdded += diff.additions;
            activity.linesDeleted += diff.deletions;
            break;
          }
        }

        // Update cache for future comparisons
        if (change.type !== 'deleted') {
          await this.fileCache.updateCache(change.uri);
        }
      } catch (error) {
        this.outputChannel.appendLine(`Error tracking changes for ${change.uri.fsPath}: ${error}`);
      }
    }

    this.outputChannel.appendLine(
      `Pathos: Total changes - Added: ${this.totalLinesAdded}, Deleted: ${this.totalLinesDeleted}`
    );
  }

  private async getFileContent(uri: vscode.Uri): Promise<string> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      return '';
    }
  }

  private getActivity(filePath: string): FileActivity {
    let activity = this.fileActivities.get(filePath);
    if (!activity) {
      activity = {
        startTime: Date.now(),
        lastEditTime: Date.now(),
        editCount: 0,
        linesAdded: 0,
        linesDeleted: 0,
        timeSpentMs: 0
      };
      this.fileActivities.set(filePath, activity);
    }
    return activity;
  }

  public getProductivityMetrics(): string {
    let totalTimeMs = 0;
    let totalEdits = 0;
    const intervals: number[] = [];

    this.fileActivities.forEach(activity => {
      totalTimeMs += activity.timeSpentMs;
      totalEdits += activity.editCount;

      if (activity.editCount > 1) {
        intervals.push(activity.timeSpentMs / (activity.editCount - 1));
      }
    });

    const timeSpentMinutes = Math.round(totalTimeMs / (60 * 1000));
    const netLines = this.totalLinesAdded - this.totalLinesDeleted;
    const codeVelocity = totalTimeMs > 0 ? Math.round((Math.abs(netLines) / totalTimeMs) * 3600000) : 0;
    const avgInterval = intervals.length > 0 ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length / 1000) : 0;

    return `
Productivity Metrics:
-------------------
Time Spent: ${timeSpentMinutes} minutes
Lines Added: ${this.totalLinesAdded}
Lines Deleted: ${this.totalLinesDeleted}
Net Lines Changed: ${netLines}
Code Velocity: ${codeVelocity} lines/hour
Coding Consistency: Average ${avgInterval} seconds between edits
Total Edits: ${totalEdits}`;
  }

  public reset(): void {
    this.fileActivities.clear();
    this.totalLinesAdded = 0;
    this.totalLinesDeleted = 0;
  }
}