import * as vscode from 'vscode';
import * as path from 'path';
import { Change } from './tracker';
import { FileCache } from './fileCache';
import { ProductivityTracker } from './productivityTracker';
import { AIAnalysisService } from './aiAnalysisService';

export class ReadmeGenerator {
    private fileCache: FileCache;
    private productivityTracker: ProductivityTracker;

    constructor(private outputChannel: vscode.OutputChannel) {
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
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    private formatShortDate(date: Date): string {
        return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}, ${date.getFullYear()}`;
    }

    private generateBadges(projectName: string, timestamp: Date): string {
        const dateStr = this.formatShortDate(timestamp);
        return `![Project Status: Active](https://img.shields.io/badge/Project-Active-green.svg)
![Last Commit](https://img.shields.io/badge/Last%20Commit-${encodeURIComponent(dateStr)}-blue.svg)\n\n`;
    }

    private generateProgressBar(value: number, max: number, length: number = 30): string {
        const filled = Math.round((value / max) * length);
        return '█'.repeat(filled) + '░'.repeat(Math.max(0, length - filled));
    }

    private generateMermaidChart(added: number, modified: number, deleted: number): string {
        return `\`\`\`mermaid
pie
    title File Changes Distribution
    "Modifications" : ${modified}
    "Additions" : ${added}
    "Deletions" : ${deleted}
\`\`\``;
    }

    private async calculateDiff(oldContent: string, newContent: string): Promise<{ additions: number; deletions: number; diffLines: string[] }> {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const diffLines: string[] = [];
        let additions = 0;
        let deletions = 0;

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
                oldIndex++;
                newIndex++;
                lcsIndex++;
            } else if (newIndex < newLines.length &&
                (lcsIndex >= lcs.length || newLines[newIndex] !== lcs[lcsIndex])) {
                diffLines.push(`+ ${newLines[newIndex]}`);
                additions++;
                newIndex++;
            } else if (oldIndex < oldLines.length &&
                (lcsIndex >= lcs.length || oldLines[oldIndex] !== lcs[lcsIndex])) {
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

        for (let i = 1; i <= arr1.length; i++) {
            for (let j = 1; j <= arr2.length; j++) {
                if (arr1[i - 1] === arr2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

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

    private async getDetailedFileChanges(change: Change): Promise<{ content: string; stats: { additions: number; deletions: number } }> {
        const filename = path.basename(change.uri.fsPath);
        let content = '';
        let stats = { additions: 0, deletions: 0 };

        try {
            switch (change.type) {
                case 'added': {
                    const fileContent = await this.getFileContent(change.uri);
                    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
                    stats.additions = lines.length;

                    content = `### ${filename} (Added ✨)\n\n`;
                    if (lines.length > 0) {
                        content += `\`\`\`javascript\n`;
                        const previewLines = lines.slice(0, 10);
                        content += previewLines.join('\n');
                        if (lines.length > 10) {
                            content += '\n// ...\n';
                        }
                        content += '```\n\n';
                    } else {
                        content += `Empty file created\n\n`;
                    }

                    await this.fileCache.updateCache(change.uri);
                    break;
                }

                case 'deleted': {
                    const cachedContent = this.fileCache.getCachedContent(change.uri) || '';
                    const lines = cachedContent.split('\n').filter(line => line.trim() !== '');
                    stats.deletions = lines.length;

                    content = `### ${filename} (Deleted ❌)\n`;
                    content += `- File contained ${lines.length} lines of code\n`;
                    content += `- Last modified: ${this.formatDate(new Date())}\n\n`;
                    break;
                }

                case 'changed': {
                    const oldContent = this.fileCache.getCachedContent(change.uri) || '';
                    const newContent = await this.getFileContent(change.uri);
                    const { additions, deletions, diffLines } = await this.calculateDiff(oldContent, newContent);

                    stats.additions = additions;
                    stats.deletions = deletions;

                    content = `### ${filename} (Modified)\n`;
                    content += `${additions} additions, ${deletions} deletions\n\n`;

                    content += '```\n';

                    // Append the preview lines and ensure a newline after the last line
                    const previewLines = diffLines.slice(0, 10);
                    content += previewLines.join('\n') + '\n'; // Ensure newline at the end

                    // Add truncation message if too many lines
                    if (diffLines.length > 10) {
                        content += '// ...\n';
                    }

                    // Close the diff block
                    content += '```\n\n';


                    await this.fileCache.updateCache(change.uri);
                    break;
                }
            }

            return { content, stats };
        } catch (error) {
            this.outputChannel.appendLine(`Error processing ${filename}: ${error}`);
            return {
                content: `### ${filename} (Error processing changes)\n\n`,
                stats: { additions: 0, deletions: 0 }
            };
        }
    }

    async generateReadme(changes: Change[]): Promise<string> {
        await this.productivityTracker.trackChanges(changes);
        const timestamp = new Date();
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'Project';

        let content = `# 🎮 ${workspaceName} Change Log\n\n`;
        content += this.generateBadges(workspaceName.toLowerCase(), timestamp);
        content += this.productivityTracker.getProductivityMetrics();
        content += '\n\n## 📊 Change Summary\n\n';

        const addedFiles = changes.filter(c => c.type === 'added').length;
        const modifiedFiles = changes.filter(c => c.type === 'changed').length;
        const deletedFiles = changes.filter(c => c.type === 'deleted').length;

        content += `| Metric | Count |\n|--------|--------|\n`;
        content += `| 📝 Files Modified | ${modifiedFiles} |\n`;
        content += `| ➕ Files Added | ${addedFiles} |\n`;
        content += `| 🗑️ Files Deleted | ${deletedFiles} |\n`;

        content += '\n## 🔍 Detailed Changes\n\n';

        let totalAdditions = 0;
        let totalDeletions = 0;

        // Process all changes
        for (const change of changes) {
            const { content: fileContent, stats } = await this.getDetailedFileChanges(change);
            content += fileContent;
            totalAdditions += stats.additions;
            totalDeletions += stats.deletions;
        }

        // Add Visual Representation
        content += '\n## 📈 Visual Representation\n\n';
        content += this.generateMermaidChart(addedFiles, modifiedFiles, deletedFiles);

        // Add Changes Overview
        content += '\n\n## 📊 Changes Overview\n```\n';
        content += `📈 Additions:    ${this.generateProgressBar(totalAdditions, totalAdditions + totalDeletions)} +${totalAdditions}\n`;
        content += `📉 Deletions:    ${this.generateProgressBar(totalDeletions, totalAdditions + totalDeletions)} -${totalDeletions}\n`;
        content += '```\n';

        // Technical Details
        content += '\n## 🛠️ Technical Details\n';
        content += `- **Project**: ${workspaceName}\n`;
        content += `- **Timestamp**: ${this.formatDate(timestamp)}\n`;
        content += `- **Type**: ${this.determineChangeType(totalAdditions, totalDeletions)}\n`;
        content += `- **Impact**: ${this.determineImpact(totalAdditions + totalDeletions)}\n`;

        // AI Insights - Only add if enabled
        const config = vscode.workspace.getConfiguration('pathos');
        const aiEnabled = config.get<boolean>('enableAiInsights', true);

        if (aiEnabled) {
            const aiAnalysis = new AIAnalysisService(this.outputChannel);
            try {
                const analysis = await aiAnalysis.analyzeChanges(changes);
                content += '\n' + aiAnalysis.formatAnalysisForReadme(analysis);
            } catch (error) {
                this.outputChannel.appendLine(`Error generating AI insights: ${error}`);
            }
        }

        // Footer
        content += '\n---\n\n';
        content += '<details>\n<summary>📝 Note</summary>\n';
        content += 'This changelog was automatically generated by Pathos. For more detailed information, please check the commit history.\n';
        content += '</details>\n\n---\n\n';
        content += `*Generated on ${this.formatDate(timestamp)}*\n\n`;
        content += '[![Made with Pathos](https://img.shields.io/badge/Made%20with-Pathos-purple.svg)](https://github.com/dipandhali2021/code-track)\n';

        this.productivityTracker.reset();
        return content;
    }

    private determineChangeType(additions: number, deletions: number): string {
        if (additions > deletions * 2) return 'Feature Addition';
        if (deletions > additions * 2) return 'Code Cleanup';
        return 'Feature Update';
    }

    private determineImpact(totalChanges: number): string {
        if (totalChanges > 500) return 'High';
        if (totalChanges > 100) return 'Medium';
        return 'Low';
    }
}