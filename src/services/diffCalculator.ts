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

export class DiffCalculator {
  constructor(private outputChannel: vscode.OutputChannel) {}

  calculateDiff(oldContent: string, newContent: string): FileDiffResult {
    try {
      // Split content into lines and remove empty lines
      const oldLines = oldContent.split('\n').filter(line => line.trim() !== '');
      const newLines = newContent.split('\n').filter(line => line.trim() !== '');
      
      const changes: LineDiff[] = [];
      let additions = 0;
      let deletions = 0;

      // Use Myers diff algorithm approach
      let i = 0;
      let j = 0;

      while (i < oldLines.length || j < newLines.length) {
        if (i >= oldLines.length) {
          // All remaining new lines are additions
          changes.push({
            type: 'added',
            content: newLines[j],
            lineNumber: j + 1
          });
          additions++;
          j++;
        } else if (j >= newLines.length) {
          // All remaining old lines are deletions
          changes.push({
            type: 'removed',
            content: oldLines[i],
            lineNumber: i + 1
          });
          deletions++;
          i++;
        } else if (oldLines[i] === newLines[j]) {
          // Lines match, move both pointers
          i++;
          j++;
        } else {
          // Lines differ - check next line for better match
          const nextOldMatch = oldLines[i + 1] === newLines[j];
          const nextNewMatch = oldLines[i] === newLines[j + 1];

          if (nextOldMatch) {
            // Current old line was deleted
            changes.push({
              type: 'removed',
              content: oldLines[i],
              lineNumber: i + 1
            });
            deletions++;
            i++;
          } else if (nextNewMatch) {
            // New line was added
            changes.push({
              type: 'added',
              content: newLines[j],
              lineNumber: j + 1
            });
            additions++;
            j++;
          } else {
            // Line was modified - count as both deletion and addition
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
          }
        }
      }

      this.outputChannel.appendLine(
        `DiffCalculator: File changes - Added: ${additions}, Deleted: ${deletions}`
      );

      return { additions, deletions, changes };
    } catch (error) {
      this.outputChannel.appendLine(`DiffCalculator error: ${error}`);
      return { additions: 0, deletions: 0, changes: [] };
    }
  }
}