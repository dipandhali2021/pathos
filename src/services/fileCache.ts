import * as vscode from 'vscode';
import * as fs from 'fs';

export class FileCache {
  private cache: Map<string, string> = new Map();
  private initialized: Set<string> = new Set();

  constructor(private outputChannel: vscode.OutputChannel) {}

  async updateCache(uri: vscode.Uri): Promise<void> {
    try {
      const content = await this.readFile(uri);
      this.cache.set(uri.fsPath, content);
      this.initialized.add(uri.fsPath);
    } catch (error) {
      this.outputChannel.appendLine(
        `Cache update failed for ${uri.fsPath}: ${error}`
      );
    }
  }

  async readFile(uri: vscode.Uri): Promise<string> {
    try {
      return fs.readFileSync(uri.fsPath, 'utf8');
    } catch {
      return '';
    }
  }

  getCachedContent(uri: vscode.Uri): string | undefined {
    return this.cache.get(uri.fsPath);
  }

  isInitialized(uri: vscode.Uri): boolean {
    return this.initialized.has(uri.fsPath);
  }

  deleteFromCache(uri: vscode.Uri): void {
    this.cache.delete(uri.fsPath);
    this.initialized.delete(uri.fsPath);
  }
}