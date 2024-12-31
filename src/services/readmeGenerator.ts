import * as vscode from 'vscode';
import { Change } from './tracker';
import { DiffCalculator } from './diffCalculator';
import { FileCache } from './fileCache';
import { ProductivityTracker } from './productivityTracker';
import * as path from 'path';

export class ReadmeGenerator {
  private diffCalculator: DiffCalculator;
  private fileCache: FileCache;
  private productivityTracker: ProductivityTracker;

  constructor(private outputChannel: vscode.OutputChannel) {
    this.diffCalculator = new DiffCalculator(outputChannel);
    this.fileCache = new FileCache(outputChannel);
    this.productivityTracker = new ProductivityTracker(outputChannel);
  }

  private async getFileContent(uri: vscode.Uri): Promise<string> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      return '';
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
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
        diffLines.push(`+ ${newLines[newIndex]}`);
        additions++;
        newIndex++;
      } else if (oldIndex < oldLines.length &&
        (lcsIndex >= lcs.length || oldLines[oldIndex] !== lcs[lcsIndex])) {
        // Line deleted
        diffLines.push(`- ${oldLines[oldIndex]}`);
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

  async generateReadme(changes: Change[]): Promise<string> {
    // Track changes for productivity metrics
    await this.productivityTracker.trackChanges(changes);

    const timestamp = new Date();
    let content = `# DevTrack Changes\n\n`;
    content += `## ${this.formatDate(timestamp)}\n\n`;

    // Add Productivity Metrics Section
    content += `## Productivity Metrics\n\n`;
    content += this.productivityTracker.getProductivityMetrics();
    content += '\n\n';

    // Group changes by type
    const addedFiles: Change[] = [];
    const modifiedFiles: Change[] = [];
    const deletedFiles: Change[] = [];

    changes.forEach(change => {
      switch (change.type) {
        case 'added':
          addedFiles.push(change);
          break;
        case 'changed':
          modifiedFiles.push(change);
          break;
        case 'deleted':
          deletedFiles.push(change);
          break;
      }
    });

    // Added Files Section
    if (addedFiles.length > 0) {
      content += `## Added Files\n\n`;
      for (const change of addedFiles) {
        const fileName = path.basename(change.uri.fsPath);
        const fileContent = await this.getFileContent(change.uri);
        const lines = fileContent.split('\n').length;
        content += `### \`${fileName}\`\n\n`;
        content += `- **Lines**: ${lines}\n`;
        content += `- **Path**: \`${vscode.workspace.asRelativePath(change.uri)}\`\n`;
        content += `- **Preview**:\n\`\`\`diff\n`;
        fileContent.split('\n').slice(0, 5).forEach(line => {
          content += `+ ${line}\n`;
        });
        if (fileContent.split('\n').length > 5) {
          content += '...\n';
        }
        content += '```\n\n';
      }
    }

    // Modified Files Section
    if (modifiedFiles.length > 0) {
      content += `## Modified Files\n\n`;
      for (const change of modifiedFiles) {
        const fileName = path.basename(change.uri.fsPath);
        const oldContent = this.fileCache.getCachedContent(change.uri) || '';
        const newContent = await this.getFileContent(change.uri);
        const { additions, deletions, diffLines } = await this.calculateDiff(oldContent, newContent);

        content += `### \`${fileName}\`\n\n`;
        content += `- **Changes**: +${additions} -${deletions}\n`;
        content += `- **Path**: \`${vscode.workspace.asRelativePath(change.uri)}\`\n`;
        
        if (diffLines.length > 0) {
          content += `- **Details**:\n\`\`\`diff\n`;
          diffLines.slice(0, 5).forEach(line => {
            content += `${line}\n`;
          });
          if (diffLines.length > 5) {
            content += `... ${diffLines.length - 5} more changes\n`;
          }
          content += '```\n\n';
        }
      }
    }

    // Deleted Files Section
    if (deletedFiles.length > 0) {
      content += `## Deleted Files\n\n`;
      for (const change of deletedFiles) {
        const fileName = path.basename(change.uri.fsPath);
        const cachedContent = this.fileCache.getCachedContent(change.uri) || '';
        const lines = cachedContent.split('\n').length;
        content += `### \`${fileName}\`\n\n`;
        content += `- **Lines Removed**: ${lines}\n`;
        content += `- **Path**: \`${vscode.workspace.asRelativePath(change.uri)}\`\n`;
        if (cachedContent) {
          content += `- **Last Known Content**:\n\`\`\`diff\n`;
          cachedContent.split('\n').slice(0, 5).forEach(line => {
            content += `- ${line}\n`;
          });
          if (cachedContent.split('\n').length > 5) {
            content += '...\n';
          }
          content += '```\n\n';
        }
      }
    }

    // Summary Section
    content += `## Summary\n\n`;
    content += `- **Added Files**: ${addedFiles.length}\n`;
    content += `- **Modified Files**: ${modifiedFiles.length}\n`;
    content += `- **Deleted Files**: ${deletedFiles.length}\n`;

    // Reset productivity tracker
    this.productivityTracker.reset();

    return content;
  }
}