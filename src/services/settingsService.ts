import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';

export class SettingsService {
  constructor(private outputChannel: OutputChannel) {}

  async updateCommitFrequency(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('devtrack');
      const currentFrequency = config.get<number>('commitFrequency') || 1;

      const result = await vscode.window.showQuickPick(
        ['1', '5', '10', '15', '30', '60', 'Custom'],
        {
          placeHolder: `Current frequency: ${currentFrequency} minutes`,
          title: 'Select commit frequency in minutes'
        }
      );

      if (!result) {
        return;
      }

      let newFrequency: number;
      if (result === 'Custom') {
        const customValue = await vscode.window.showInputBox({
          prompt: 'Enter commit frequency in minutes (1-120)',
          validateInput: (value) => {
            const num = parseInt(value);
            return (!num || num < 1 || num > 120) 
              ? 'Please enter a number between 1 and 120' 
              : null;
          }
        });

        if (!customValue) {
          return;
        }
        newFrequency = parseInt(customValue);
      } else {
        newFrequency = parseInt(result);
      }

      await config.update('commitFrequency', newFrequency, true);
      this.outputChannel.appendLine(
        `DevTrack: Commit frequency updated to ${newFrequency} minutes`
      );
      vscode.window.showInformationMessage(
        `DevTrack: Commit frequency updated to ${newFrequency} minutes`
      );
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Settings update error - ${error.message}`);
      throw error;
    }
  }

  async toggleConfirmBeforeCommit(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('devtrack');
      const currentValue = config.get<boolean>('confirmBeforeCommit') ?? true;
      
      await config.update('confirmBeforeCommit', !currentValue, true);
      
      const status = !currentValue ? 'enabled' : 'disabled';
      this.outputChannel.appendLine(
        `DevTrack: Commit confirmation ${status}`
      );
      vscode.window.showInformationMessage(
        `DevTrack: Commit confirmation ${status}`
      );
    } catch (error: any) {
      this.outputChannel.appendLine(`DevTrack: Settings update error - ${error.message}`);
      throw error;
    }
  }
}