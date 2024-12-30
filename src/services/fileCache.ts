import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EncryptionService } from './encryption';
import { ProjectManager } from './projectManager';

export class FileCache {
  private cache: Map<string, string> = new Map();
  private initialized: Set<string> = new Set();
  private encryption: EncryptionService;
  private projectManager: ProjectManager;

  constructor(private outputChannel: vscode.OutputChannel) {
    this.encryption = new EncryptionService();
    this.projectManager = new ProjectManager(outputChannel);
    this.loadPersistedCache();
  }

  private get persistPath(): string {
    return path.join(this.projectManager.getProjectCacheFolder(), 'cache.json');
  }

  private async loadPersistedCache() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const rawData = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
        
        // Decrypt cached content
        Object.entries(rawData.cache).forEach(([filePath, encryptedContent]) => {
          try {
            const decryptedContent = this.encryption.decrypt(encryptedContent as string);
            this.cache.set(filePath, decryptedContent);
          } catch (error) {
            this.outputChannel.appendLine(`Failed to decrypt cache for ${filePath}`);
          }
        });
        
        this.initialized = new Set(rawData.initialized);
        this.outputChannel.appendLine(`DevTrack: Loaded and decrypted persisted file cache for project: ${this.projectManager.getProjectIdentifier()}`);
      }
    } catch (error) {
      this.outputChannel.appendLine(`DevTrack: Error loading persisted cache: ${error}`);
    }
  }

  private persistCache() {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Encrypt cache content before persisting
      const encryptedCache = new Map<string, string>();
      this.cache.forEach((content, filePath) => {
        encryptedCache.set(filePath, this.encryption.encrypt(content));
      });
      
      const data = {
        cache: Object.fromEntries(encryptedCache),
        initialized: Array.from(this.initialized)
      };
      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.outputChannel.appendLine(`DevTrack: Error persisting cache: ${error}`);
    }
  }

  async updateCache(uri: vscode.Uri): Promise<void> {
    try {
      const content = await this.readFile(uri);
      this.cache.set(uri.fsPath, content);
      this.initialized.add(uri.fsPath);
      this.persistCache();
    } catch (error) {
      this.outputChannel.appendLine(`Cache update failed for ${uri.fsPath}: ${error}`);
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
    this.persistCache();
  }
}