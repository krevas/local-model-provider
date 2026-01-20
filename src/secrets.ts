import * as vscode from 'vscode';

/**
 * Secret key constants
 */
const API_KEY_SECRET = 'local.model.provider.apiKey';

/**
 * Manages secure storage for sensitive configuration like API keys
 */
export class SecretManager {
  private readonly secretStorage: vscode.SecretStorage;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.secretStorage = context.secrets;
    this.outputChannel = outputChannel;
  }

  /**
   * Get the API key from secure storage
   * Falls back to settings if not found in secrets (for migration)
   */
  async getApiKey(): Promise<string> {
    try {
      const secretKey = await this.secretStorage.get(API_KEY_SECRET);
      if (secretKey) {
        return secretKey;
      }

      // Fallback: Check if there's a key in settings (legacy)
      const config = vscode.workspace.getConfiguration('local.model.provider');
      const settingsKey = config.get<string>('apiKey', '');
      
      if (settingsKey) {
        // Migrate to secure storage
        await this.setApiKey(settingsKey);
        this.outputChannel.appendLine('[SECURITY] Migrated API key from settings to secure storage');
        
        // Clear from settings
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
        this.outputChannel.appendLine('[SECURITY] Cleared API key from settings');
        
        return settingsKey;
      }

      return '';
    } catch (error) {
      this.outputChannel.appendLine(`[ERROR] Failed to retrieve API key: ${error}`);
      return '';
    }
  }

  /**
   * Store the API key in secure storage
   */
  async setApiKey(apiKey: string): Promise<void> {
    try {
      if (apiKey) {
        await this.secretStorage.store(API_KEY_SECRET, apiKey);
        this.outputChannel.appendLine('[SECURITY] API key stored securely');
      } else {
        await this.secretStorage.delete(API_KEY_SECRET);
        this.outputChannel.appendLine('[SECURITY] API key removed from secure storage');
      }
    } catch (error) {
      this.outputChannel.appendLine(`[ERROR] Failed to store API key: ${error}`);
      throw error;
    }
  }

  /**
   * Delete the API key from secure storage
   */
  async deleteApiKey(): Promise<void> {
    try {
      await this.secretStorage.delete(API_KEY_SECRET);
      this.outputChannel.appendLine('[SECURITY] API key deleted from secure storage');
    } catch (error) {
      this.outputChannel.appendLine(`[ERROR] Failed to delete API key: ${error}`);
      throw error;
    }
  }

  /**
   * Check if an API key is configured
   */
  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return key.length > 0;
  }
}
