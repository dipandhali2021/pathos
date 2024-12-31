import * as vscode from 'vscode';
import * as path from 'path';
import { Change } from './tracker';
import { FileCache } from './fileCache';
import { ProductivityTracker } from './productivityTracker';
import { ReadmeGenerator } from './readmeGenerator';

export class SummaryGenerator {
  private fileCache: FileCache;
  private outputChannel: vscode.OutputChannel;
  private productivityTracker: ProductivityTracker;
  private readmeGenerator: ReadmeGenerator;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.fileCache = new FileCache(outputChannel);
    this.productivityTracker = new ProductivityTracker(outputChannel);
    this.readmeGenerator= new ReadmeGenerator(outputChannel);
  }


  private async getFileContent(uri: vscode.Uri): Promise<string> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      return '';
    }
  }

  private async calculateDiff(oldContent: string, newContent: string): Promise<{ additions: number; deletions: number; diffLines: string[] }> {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines: string[] = [];
    let additions = 0;
    let deletions = 0;

    // Use longest common subsequence to find actual changes
    const lcs = this.getLCS(oldLines, newLines);
    let oldIndex = 0;
    let newIndex = 0;
    let lcsIndex = 0;

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (lcsIndex < lcs.length &&
        oldIndex < oldLines.length &&
        newIndex < newLines.length &&
        oldLines[oldIndex] === lcs[lcsIndex] &&
        newLines[newIndex] === lcs[lcsIndex]) {
        // Line unchanged
        oldIndex++;
        newIndex++;
        lcsIndex++;
      } else if (newIndex < newLines.length &&
        (lcsIndex >= lcs.length || newLines[newIndex] !== lcs[lcsIndex])) {
        // Line added
        diffLines.push(`    + ${newLines[newIndex]}`);
        additions++;
        newIndex++;
      } else if (oldIndex < oldLines.length &&
        (lcsIndex >= lcs.length || oldLines[oldIndex] !== lcs[lcsIndex])) {
        // Line deleted
        diffLines.push(`    - ${oldLines[oldIndex]}`);
        deletions++;
        oldIndex++;
      }
    }

    return { additions, deletions, diffLines };
  }

  private getLCS(arr1: string[], arr2: string[]): string[] {
    const dp: number[][] = Array(arr1.length + 1).fill(0)
      .map(() => Array(arr2.length + 1).fill(0));

    // Fill the dp table
    for (let i = 1; i <= arr1.length; i++) {
      for (let j = 1; j <= arr2.length; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Reconstruct the LCS
    const lcs: string[] = [];
    let i = arr1.length;
    let j = arr2.length;

    while (i > 0 && j > 0) {
      if (arr1[i - 1] === arr2[j - 1]) {
        lcs.unshift(arr1[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  private async getDetailedFileChanges(change: Change): Promise<string> {
    const filename = path.basename(change.uri.fsPath);
    let summary = '';

    try {
      switch (change.type) {
        case 'added': {
          const content = await this.getFileContent(change.uri);
          const lines = content.split('\n');
          summary = `${filename} (Added)\n    ${lines.length} additions, 0 deletions\n`;
          // Show first few lines of new file
          const previewLines = lines.slice(0, 5).map(line => `    + ${line}`);
          if (previewLines.length > 0) {
            summary += previewLines.join('\n');
            if (lines.length > 5) {
              summary += '\n    ... more lines';
            }
          }
          // Cache the new file content
          await this.fileCache.updateCache(change.uri);
          break;
        }

        case 'deleted': {
          const cachedContent = this.fileCache.getCachedContent(change.uri) || '';
          const lines = cachedContent.split('\n');
          summary = `${filename} (Deleted)\n    0 additions, ${lines.length} deletions`;
          break;
        }

        case 'changed': {
          const oldContent = this.fileCache.getCachedContent(change.uri) || '';
          const newContent = await this.getFileContent(change.uri);
          const { additions, deletions, diffLines } = await this.calculateDiff(oldContent, newContent);

          summary = `${filename} (Modified)\n    ${additions} additions, ${deletions} deletions\n`;
          if (diffLines.length > 0) {
            const previewLines = diffLines.slice(0, 5);
            summary += previewLines.join('\n');
            if (diffLines.length > 5) {
              summary += '\n    ... more changes';
            }
          }
          // Update cache with new content
          await this.fileCache.updateCache(change.uri);
          break;
        }
      }

      return summary;
    } catch (error) {
      this.outputChannel.appendLine(`Error processing ${filename}: ${error}`);
      return `${filename} (Error processing changes)`;
    }
  }

  async generateSummary(changedFiles: Change[]): Promise<string[]> {
    try {
      // Track changes for productivity metrics
      this.productivityTracker.trackChanges(changedFiles);

      const fileChanges = await Promise.all(
        changedFiles.map(change => this.getDetailedFileChanges(change))
      );

      const stats = changedFiles.reduce(
        (acc, change) => {
          acc[change.type] = (acc[change.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      let summary = 'DevTrack: Changes detected\n\n';

      // Add productivity metrics
      summary += this.productivityTracker.getProductivityMetrics();

      summary += '\n\nChanges:\n';
      summary += fileChanges.join('\n\n');
      summary += `\n\nSummary: ${stats.added || 0} files added, ${stats.changed || 0
        } files modified, ${stats.deleted || 0} files deleted`;
      // Generate detailed README content
      const readmeContent = await this.readmeGenerator.generateReadme(changedFiles);
      // Reset productivity tracker after generating summary
      this.productivityTracker.reset();

      const detail= [summary,readmeContent]

      return detail;
    } catch (error) {
      this.outputChannel.appendLine(`Summary generation error: ${error}`);
      return ['DevTrack: Error generating change summary'];
    }
  }
}


//FA4