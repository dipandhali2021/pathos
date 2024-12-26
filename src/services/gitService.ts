/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import * as vscode from 'vscode';
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as path from 'path';
import { EventEmitter } from 'events';
import { OutputChannel } from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';
import { execSync } from 'child_process';
const execAsync = promisify(exec);
import * as fs from 'fs';

interface GitServiceEvents {
  commit: (message: string) => void;
  error: (error: Error) => void;
  'operation:start': (operation: string) => void;
  'operation:end': (operation: string) => void;
  retry: (operation: string, attempt: number) => void;
  push: (branch: string) => void;
}
export class GitService extends EventEmitter {
  private git!: SimpleGit;
  private repoPath!: string;
  private outputChannel: OutputChannel;
  private operationQueue: Promise<any> = Promise.resolve();
  private static MAX_RETRIES = 3;
  private static RETRY_DELAY = 1000;
  private readonly isWindows: boolean = process.platform === 'win32';
  private static readonly MAX_LISTENERS = 10;
  private trackingFolder: string;
  private boundListeners: Set<{
    event: keyof GitServiceEvents;
    listener: Function;
  }> = new Set();
  private projectGit!: SimpleGit; // For Project A's git

  constructor(outputChannel: OutputChannel) {
    super();
    this.setMaxListeners(GitService.MAX_LISTENERS);
    this.outputChannel = outputChannel;
    this.trackingFolder = '';
    this.initializeWorkspace();
    this.setupDefaultErrorHandler();
  }
  private setupDefaultErrorHandler(): void {
    if (this.listenerCount('error') === 0) {
      this.on('error', (error: Error) => {
        this.outputChannel.appendLine(
          `DevTrack: Unhandled Git error - ${error.message}`
        );
      });
    }
  }


  private initGit(trackingFolder: string) {
    this.trackingFolder = trackingFolder;
    this.git = simpleGit({
      baseDir: trackingFolder,
      binary: 'git',
      config: [
        'core.autocrlf=true',
        'core.safecrlf=false'
      ]
    });
    this.outputChannel.appendLine(`DevTrack: Git initialized in ${trackingFolder}`);
  }

  private ensureGitInitialized(trackingFolder: string): void {
    if (!this.git || this.trackingFolder !== trackingFolder) {
      this.initGit(trackingFolder);
    }
  }

  // Type-safe event emitter methods
  public on<E extends keyof GitServiceEvents>(
    event: E,
    listener: GitServiceEvents[E]
  ): this {
    if (
      event === 'error' &&
      this.listenerCount('error') >= GitService.MAX_LISTENERS - 1
    ) {
      this.outputChannel.appendLine(
        'DevTrack: Warning - Too many error listeners'
      );
      return this;
    }

    this.boundListeners.add({ event, listener });
    return super.on(event, listener);
  }

  public once<E extends keyof GitServiceEvents>(
    event: E,
    listener: GitServiceEvents[E]
  ): this {
    const onceListener = ((...args: Parameters<GitServiceEvents[E]>) => {
      this.boundListeners.delete({ event, listener });
      return (listener as Function).apply(this, args);
    }) as unknown as GitServiceEvents[E];

    this.boundListeners.add({ event, listener: onceListener });
    return super.once(event, onceListener);
  }

  public removeListener<E extends keyof GitServiceEvents>(
    event: E,
    listener: GitServiceEvents[E]
  ): this {
    this.boundListeners.delete({ event, listener });
    return super.removeListener(event, listener);
  }

  public removeAllListeners(event?: keyof GitServiceEvents): this {
    if (event) {
      this.boundListeners.forEach((listener) => {
        if (listener.event === event) {
          this.boundListeners.delete(listener);
        }
      });
    } else {
      this.boundListeners.clear();
    }
    return super.removeAllListeners(event);
  }

  // Safe emit method with type checking
  protected emitSafe<E extends keyof GitServiceEvents>(
    event: E,
    ...args: Parameters<GitServiceEvents[E]>
  ): boolean {
    try {
      if (this.listenerCount(event) === 0 && event !== 'error') {
        // If no listeners for non-error events, log it
        this.outputChannel.appendLine(
          `DevTrack: No listeners for event - ${String(event)}`
        );
        return false;
      }
      return super.emit(event, ...args);
    } catch (error) {
      this.outputChannel.appendLine(
        `DevTrack: Error emitting event ${String(event)} - ${error}`
      );
      this.emit('error', new Error(`Event emission failed: ${error}`));
      return false;
    }
  }

  private async initializeWorkspace(): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace folder found');
      }

      this.trackingFolder = path.join(workspaceRoot, '.devtrack');

      // Initialize git in tracking folder
      this.git = simpleGit({
        baseDir: this.trackingFolder,
        config: [
          'core.autocrlf=true',
          'core.safecrlf=false'
        ]
      });

      await this.git.init();
      this.outputChannel.appendLine('DevTrack: Git initialized in tracking folder');
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Workspace initialization error - ${error.message}`);
      throw error;
    }
  }

  private findGitExecutable(): string {
    try {
      if (this.isWindows) {
        // Try to get Git path from environment variables first
        const pathEnv = process.env.PATH || '';
        const paths = pathEnv.split(path.delimiter);

        // Always use forward slashes for Windows paths
        for (const basePath of paths) {
          const gitExePath = path.join(basePath, 'git.exe').replace(/\\/g, '/');
          if (fs.existsSync(gitExePath)) {
            this.outputChannel.appendLine(
              `DevTrack: Found Git in PATH at ${gitExePath}`
            );
            return gitExePath;
          }
        }

        // Check common installation paths with forward slashes
        const commonPaths = [
          'C:/Program Files/Git/cmd/git.exe',
          'C:/Program Files (x86)/Git/cmd/git.exe',
        ];

        for (const gitPath of commonPaths) {
          if (fs.existsSync(gitPath)) {
            this.outputChannel.appendLine(`DevTrack: Found Git at ${gitPath}`);
            return gitPath;
          }
        }

        // Last resort: try where command
        try {
          const gitPathFromWhere = execSync('where git', { encoding: 'utf8' })
            .split('\n')[0]
            .trim()
            .replace(/\\/g, '/');
          if (gitPathFromWhere && fs.existsSync(gitPathFromWhere)) {
            this.outputChannel.appendLine(
              `DevTrack: Found Git using 'where' command at ${gitPathFromWhere}`
            );
            return gitPathFromWhere;
          }
        } catch (error) {
          this.outputChannel.appendLine('DevTrack: Git not found in PATH');
        }

        // Final fallback
        return 'git';
      } else {
        // Unix-like systems
        try {
          return execSync('which git', { encoding: 'utf8' }).trim();
        } catch {
          return 'git';
        }
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `DevTrack: Error finding Git executable - ${error}`
      );
      return 'git';
    }
  }

  private async cleanupGitLocks(): Promise<void> {
    try {
      const gitDir = path.join(this.repoPath, '.git');

      const lockFiles = ['index.lock', 'HEAD.lock'];

      for (const lockFile of lockFiles) {
        const lockPath = path.join(gitDir, lockFile);
        if (fs.existsSync(lockPath)) {
          try {
            fs.unlinkSync(lockPath);
          } catch (error) {
            this.outputChannel.appendLine(
              `DevTrack: Could not remove lock file ${lockPath}: ${error}`
            );
          }
        }
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `DevTrack: Error cleaning up Git locks: ${error}`
      );
    }
  }

  private async initGitConfig() {
    try {
      if (!this.git) {
        throw new Error('Git not initialized');
      }

      await this.git.addConfig('core.autocrlf', 'true');
      await this.git.addConfig('core.safecrlf', 'false');
      await this.git.addConfig('core.longpaths', 'true');

      if (this.isWindows) {
        await this.git.addConfig('core.quotepath', 'false');
        await this.git.addConfig('core.ignorecase', 'true');
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `DevTrack: Error initializing Git config: ${error}`
      );
      throw error;
    }
  }

  private async verifyGitConfig(): Promise<void> {
    try {
      // Get Git executable path with proper escaping for Windows
      const gitPath = this.findGitExecutable();
      const normalizedGitPath = this.isWindows
        ? gitPath.replace(/\\/g, '/')
        : gitPath;

      // Basic Git version check
      try {
        const versionCmd = this.isWindows
          ? `"${normalizedGitPath}"`
          : normalizedGitPath;
        execSync(`${versionCmd} --version`, { encoding: 'utf8' });
        this.outputChannel.appendLine(
          `DevTrack: Successfully verified Git at: ${normalizedGitPath}`
        );
      } catch (error: any) {
        throw new Error(`Git executable validation failed: ${error.message}`);
      }

      // Test Git configuration with normalized paths
      const testGit = simpleGit({
        baseDir: this.repoPath,
        binary: normalizedGitPath,
        maxConcurrentProcesses: 1,
        unsafe: {
          allowUnsafeCustomBinary: true,
        },
        ...(this.isWindows && {
          config: [
            'core.quotePath=false',
            'core.preloadIndex=true',
            'core.fscache=true',
            'core.ignorecase=true',
          ],
        }),
      });

      // Verify basic Git configuration
      await testGit.raw(['config', '--list']);
      this.outputChannel.appendLine('DevTrack: Git configuration verified');


      // Check repository state
      const isRepo = await testGit.checkIsRepo();
      if (isRepo) {
        const remotes = await testGit.getRemotes(true);
        if (remotes.length === 0) {
          this.outputChannel.appendLine('DevTrack: No remote configured');
        }
      }



      // Windows-specific checks
      if (this.isWindows) {
        try {
          await testGit.raw(['config', '--system', '--list']);
          this.outputChannel.appendLine(
            'DevTrack: Windows Git system configuration verified'
          );

        } catch (error) {
          // Don't throw on system config access issues
          this.outputChannel.appendLine(
            'DevTrack: System Git config check skipped (normal on some Windows setups)'
          );
        }
      }
    } catch (error: any) {
      this.outputChannel.appendLine(
        `DevTrack: Git config verification failed - ${error.message}`
      );
      throw new Error(`Git configuration error: ${error.message}`);
    }
  }
  catch(error: any) {
    this.outputChannel.appendLine(
      `DevTrack: Git config verification failed - ${error.message}`
    );
    throw new Error(`Git configuration error: ${error.message}`);
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= GitService.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        this.outputChannel.appendLine(
          `DevTrack: Operation failed (attempt ${attempt}/${GitService.MAX_RETRIES}): ${error.message}`
        );

        if (attempt < GitService.MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, GitService.RETRY_DELAY * attempt)
          );
          await this.cleanupGitLocks();
        }
      }
    }

    throw lastError;
  }

  private async hasProjectFiles(): Promise<boolean> {
    try {
      const files = await vscode.workspace.findFiles(
        '**/*',
        '**/node_modules/**'
      );
      return files.length > 0;
    } catch (error) {
      this.outputChannel.appendLine(
        `DevTrack: Error checking project files - ${error}`
      );
      return false;
    }
  }

  private async backupProjectFiles(): Promise<void> {
    try {
      const backupDir = path.join(this.repoPath, '.devtrack-backup');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
      }

      // Create a timestamp for the backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup-${timestamp}`);
      fs.mkdirSync(backupPath);

      // Copy all project files except node_modules and .git
      const files = await vscode.workspace.findFiles(
        '**/*',
        '{**/node_modules/**,**/.git/**}'
      );
      for (const file of files) {
        const relativePath = vscode.workspace.asRelativePath(file);
        const targetPath = path.join(backupPath, relativePath);

        // Create directory structure if needed
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Copy the file
        fs.copyFileSync(file.fsPath, targetPath);
      }

      this.outputChannel.appendLine(
        `DevTrack: Created backup at ${backupPath}`
      );
    } catch (error) {
      this.outputChannel.appendLine(
        `DevTrack: Error creating backup - ${error}`
      );
      throw error;
    }
  }


  //   private ensureDirectoryStructure(trackingFolder: string): void {
  //     try {
  //       // Create .devtrack folder if it doesn't exist
  //       if (!fs.existsSync(trackingFolder)) {
  //         fs.mkdirSync(trackingFolder);
  //       }

  //       // Create necessary subfolders
  //       const logsFolder = path.join(trackingFolder, 'logs');
  //       const statsFolder = path.join(trackingFolder, 'stats');

  //       if (!fs.existsSync(logsFolder)) {
  //         fs.mkdirSync(logsFolder);
  //       }
  //       if (!fs.existsSync(statsFolder)) {
  //         fs.mkdirSync(statsFolder);
  //       }

  //       // Create .gitkeep files to preserve empty directories
  //       const logsGitKeep = path.join(logsFolder, '.gitkeep');
  //       const statsGitKeep = path.join(statsFolder, '.gitkeep');

  //       if (!fs.existsSync(logsGitKeep)) {
  //         fs.writeFileSync(logsGitKeep, '');
  //       }
  //       if (!fs.existsSync(statsGitKeep)) {
  //         fs.writeFileSync(statsGitKeep, '');
  //       }

  //       // Create or update .gitignore
  //       const gitignorePath = path.join(trackingFolder, '.gitignore');
  //       const gitignoreContent = `
  // # Project specific files
  // node_modules/
  // .DS_Store
  // `;
  //       fs.writeFileSync(gitignorePath, gitignoreContent);

  //       this.outputChannel.appendLine('DevTrack: Directory structure ensured');
  //     } catch (error: any) {
  //       this.outputChannel.appendLine(`DevTrack: Error ensuring directory structure - ${error.message}`);
  //       throw error;
  //     }
  //   }

  //   public async initializeRepo(remoteUrl: string): Promise<void> {
  //     return this.enqueueOperation(async () => {
  //       try {
  //         const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  //         if (!workspaceRoot) {
  //           throw new Error('No workspace folder found');
  //         }

  //         const trackingFolder = path.join(workspaceRoot, '.devtrack');

  //         // Ensure directory structure before git operations
  //         this.ensureDirectoryStructure(trackingFolder);

  //         await this.withRetry(async () => {
  //           // Initialize git in .devtrack folder
  //           if (!fs.existsSync(path.join(trackingFolder, '.git'))) {
  //             this.execGitCommand('git init', trackingFolder);
  //             this.outputChannel.appendLine('DevTrack: Initialized git in tracking folder');
  //           }

  //           // Configure git
  //           this.execGitCommand('git config user.name "DevTrack"', trackingFolder);
  //           this.execGitCommand('git config user.email "devtrack@stackblitz.com"', trackingFolder);

  //           // Add remote
  //           try {
  //             this.execGitCommand('git remote remove origin', trackingFolder);
  //           } catch (error) {
  //             // Ignore error if remote doesn't exist
  //           }
  //           this.execGitCommand(`git remote add origin ${remoteUrl}`, trackingFolder);
  //         });

  //         await this.withRetry(async () => {
  //           // Initial commit if needed
  //           try {
  //             this.execGitCommand('git add .', trackingFolder);
  //             this.execGitCommand('git commit -m "Initial DevTrack setup"', trackingFolder);
  //           } catch (error) {
  //             // Ignore if nothing to commit
  //           }
  //         });

  //         await this.withRetry(async () => {
  //           try {
  //             // Try to create and checkout main branch
  //             this.execGitCommand('git checkout -b main', trackingFolder);
  //           } catch (error) {
  //             try {
  //               // If main branch exists, just checkout
  //               this.execGitCommand('git checkout main', trackingFolder);
  //             } catch (error) {
  //               // If main fails, try master
  //               this.execGitCommand('git checkout master', trackingFolder);
  //             }
  //           }

  //           // Push to remote with force-with-lease to handle existing branches safely
  //           try {
  //             this.execGitCommand('git push -u origin main --force-with-lease', trackingFolder);
  //           } catch (error: any) {
  //             if (error.message.includes('rejected')) {
  //               // Handle case where remote exists but we can't push
  //               this.execGitCommand('git fetch origin', trackingFolder);
  //               this.execGitCommand('git reset --hard origin/main', trackingFolder);
  //               this.execGitCommand('git pull --rebase origin main', trackingFolder);

  //               // Re-ensure directory structure after pull
  //               this.ensureDirectoryStructure(trackingFolder);

  //               // Add and commit the directory structure
  //               this.execGitCommand('git add .', trackingFolder);
  //               this.execGitCommand('git commit -m "Restore DevTrack directory structure"', trackingFolder);
  //               this.execGitCommand('git push -u origin main', trackingFolder);
  //             } else {
  //               throw error;
  //             }
  //           }
  //         });

  //         this.outputChannel.appendLine('DevTrack: Repository initialized successfully');
  //       } catch (error: any) {
  //         this.handleGitError(error);
  //         throw error;
  //       }
  //     });
  //   }


  public async initializeRepo(remoteUrl: string): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace folder found');
      }

      const trackingFolder = path.join(workspaceRoot, '.devtrack');

      // Create tracking folder if it doesn't exist
      fs.mkdirSync(trackingFolder, { recursive: true });

      // Initialize git instance
      this.ensureGitInitialized(trackingFolder);

      if (!this.git) {
        throw new Error('Failed to initialize git');
      }

      // Initialize git repository
      await this.git.init();

      // Configure git
      await this.git.addConfig('user.name', 'DevTrack');
      await this.git.addConfig('user.email', 'devtrack@stackblitz.com');

      // Setup remote
      const remotes = await this.git.getRemotes();
      if (remotes.find(remote => remote.name === 'origin')) {
        await this.git.removeRemote('origin');
      }
      await this.git.addRemote('origin', remoteUrl);

      // Ensure directory structure
      await this.ensureDirectoryStructure();

      // Setup main branch
      try {
        await this.git.checkoutLocalBranch('main');
      } catch {
        await this.git.checkout('main');
      }

      // Initial push
      try {
        await this.git.push('origin', 'main', ['--force-with-lease']);
      } catch (error: any) {
        if (error.message.includes('rejected')) {
          await this.git.fetch('origin');
          await this.git.reset(['--hard', 'origin/main']);
          await this.git.pull('origin', 'main', ['--rebase']);
          await this.ensureDirectoryStructure();
          await this.git.push('origin', 'main');
        } else {
          throw error;
        }
      }

      this.outputChannel.appendLine('DevTrack: Repository initialized successfully');
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Initialization failed - ${error.message}`);
      throw error;
    }
  }

  private async ensureDirectoryStructure(): Promise<void> {
    try {
      if (!this.trackingFolder || !this.git) {
        throw new Error('Git not properly initialized');
      }

      // Create necessary folders
      const logsFolder = path.join(this.trackingFolder, 'logs');
      const statsFolder = path.join(this.trackingFolder, 'stats');

      fs.mkdirSync(logsFolder, { recursive: true });
      fs.mkdirSync(statsFolder, { recursive: true });

      // Create .gitkeep files
      fs.writeFileSync(path.join(logsFolder, '.gitkeep'), '');
      fs.writeFileSync(path.join(statsFolder, '.gitkeep'), '');

      // Update .gitignore
      const gitignorePath = path.join(this.trackingFolder, '.gitignore');
      const gitignoreContent = `
# System files
.DS_Store
node_modules/


`;
      fs.writeFileSync(gitignorePath, gitignoreContent);

      // Add and commit the structure
      await this.git.add(['.gitignore', 'logs/.gitkeep', 'stats/.gitkeep']);
      try {
        await this.git.commit('Initialize DevTrack directory structure');
      } catch (error) {
        // Ignore if nothing to commit
      }

      this.outputChannel.appendLine('DevTrack: Directory structure initialized');
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Directory structure error - ${error.message}`);
      throw error;
    }
  }

  public async commitAndPush(message: string): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace folder found');
      }

      const trackingFolder = path.join(workspaceRoot, '.devtrack');
      this.ensureGitInitialized(trackingFolder);

      if (!this.git) {
        throw new Error('Git not initialized');
      }

      // Create timestamp for log file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(trackingFolder, 'logs', `${timestamp}.log`);

      // Ensure logs directory exists
      const logsDir = path.dirname(logFile);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // Write changes to log file
      fs.writeFileSync(logFile, message);

      // Add and commit changes
      await this.git.add('.');
      await this.git.commit(message);

      // Push changes
      try {
        await this.git.push('origin', 'main');
      } catch (pushError: any) {
        if (pushError.message.includes('rejected')) {
          await this.git.pull('origin', 'main', ['--rebase']);
          await this.git.push('origin', 'main');
        } else {
          throw pushError;
        }
      }

      this.outputChannel.appendLine('DevTrack: Changes committed and pushed successfully');
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Error in commit and push - ${error.message}`);
      throw error;
    }
  }

  public async setRemote(remoteUrl: string): Promise<void> {
    try {
      await this.git.removeRemote('origin').catch(() => { });
      await this.git.addRemote('origin', remoteUrl);
      this.outputChannel.appendLine('DevTrack: Remote URL set successfully');
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Error setting remote - ${error.message}`);
      throw error;
    }
  }


  private async reinitializeGit(trackingFolder: string): Promise<void> {
    try {
      // Backup existing .git folder if it exists
      const gitFolder = path.join(trackingFolder, '.git');
      if (fs.existsSync(gitFolder)) {
        const backupFolder = path.join(trackingFolder, '.git-backup');
        fs.renameSync(gitFolder, backupFolder);
      }

      // Reinitialize git
      this.execGitCommand('git init', trackingFolder);
      this.execGitCommand('git config user.name "DevTrack"', trackingFolder);
      this.execGitCommand('git config user.email "devtrack@stackblitz.com"', trackingFolder);

      this.outputChannel.appendLine('DevTrack: Git reinitialized in tracking folder');
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Error reinitializing git - ${error.message}`);
      throw error;
    }
  }


  private execGitCommand(command: string, cwd: string): string {
    try {
      return execSync(command, { cwd, encoding: 'utf8' });
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Git command error - ${error.message}`);
      throw error;
    }
  }

  private handleGitError(error: any): void {
    let errorMessage = 'Git operation failed';

    if (error.message?.includes('ENOENT')) {
      errorMessage =
        process.platform === 'win32'
          ? 'Git not found. Please install Git for Windows from https://git-scm.com/download/win'
          : 'Git is not accessible. Please ensure Git is installed.';
    } else if (error.message?.includes('spawn git ENOENT')) {
      errorMessage =
        process.platform === 'win32'
          ? 'Git not found in PATH. Please restart VS Code after installing Git.'
          : 'Failed to spawn Git process. Please verify your Git installation.';
    } else if (error.message?.includes('not a git repository')) {
      errorMessage =
        'Not a Git repository. Please initialize the repository first.';
    }

    this.outputChannel.appendLine(
      `DevTrack: ${errorMessage} - ${error.message}`
    );
    vscode.window.showErrorMessage(`DevTrack: ${errorMessage}`);
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.operationQueue = this.operationQueue
      .then(() => operation())
      .catch((error) => {
        this.outputChannel.appendLine(`DevTrack: Operation failed: ${error}`);
        throw error;
      });
    return this.operationQueue;
  }



  // Helper method to check if we have any listeners for an event
  public hasListeners(event: keyof GitServiceEvents): boolean {
    return this.listenerCount(event) > 0;
  }

  // Add cleanup method
  public dispose(): void {
    this.removeAllListeners();
    if (this.git) {
      // Cleanup any ongoing git operations
      this.operationQueue = Promise.resolve();
    }
    this.outputChannel.appendLine('DevTrack: GitService disposed');
  }
}
