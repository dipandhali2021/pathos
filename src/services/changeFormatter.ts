import { LineDiff } from './diffCalculator';

// Handles formatting of changes for display
export class ChangeFormatter {
  formatChanges(changes: LineDiff[]): string {
    return changes
      .slice(0, 10) // Show first 10 changes
      .map(change => {
        const prefix = change.type === 'added' ? '+' : '-';
        return `    ${prefix} ${change.content}`;
      })
      .join('\n');
  }

  formatSummary(filename: string, type: string, additions: number, deletions: number): string {
    let summary = `${filename} (${type})`;
    if (additions > 0 || deletions > 0) {
      summary += `\n    ${additions} additions, ${deletions} deletions`;
    }
    return summary;
  }
}