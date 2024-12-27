import * as vscode from 'vscode';

export interface LineDiff {
  type: 'added' | 'removed' | 'modified';
  content: string;
  lineNumber: number;
}

export interface FileDiffResult {
  additions: number;
  deletions: number;
  changes: LineDiff[];
}

// Handles the actual diff calculation
export class DiffCalculator {
  constructor(private outputChannel: vscode.OutputChannel) {}

  calculateDiff(oldContent: string, newContent: string): FileDiffResult {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const changes: LineDiff[] = [];
    let additions = 0;
    let deletions = 0;

    try {
      let i = 0, j = 0;
      while (i < oldLines.length || j < newLines.length) {
        if (i >= oldLines.length) {
          // Rest are additions
          changes.push({
            type: 'added',
            content: newLines[j],
            lineNumber: j + 1
          });
          additions++;
          j++;
        } else if (j >= newLines.length) {
          // Rest are deletions
          changes.push({
            type: 'removed',
            content: oldLines[i],
            lineNumber: i + 1
          });
          deletions++;
          i++;
        } else if (oldLines[i] !== newLines[j]) {
          // Line changed
          changes.push({
            type: 'removed',
            content: oldLines[i],
            lineNumber: i + 1
          });
          changes.push({
            type: 'added',
            content: newLines[j],
            lineNumber: j + 1
          });
          deletions++;
          additions++;
          i++;
          j++;
        } else {
          // Lines match
          i++;
          j++;
        }
      }

      return { additions, deletions, changes };
    } catch (error) {
      this.outputChannel.appendLine(`Diff calculation error: ${error}`);
      return { additions: 0, deletions: 0, changes: [] };
    }
  }
}