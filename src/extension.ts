import * as vscode from 'vscode';
import { GatewayProvider } from './provider';
import { StatusBarManager, ServerStatus } from './statusBar';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Local Model Provider extension is now active');

  // Create status bar manager
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  // Create and register the language model provider
  const provider = new GatewayProvider(context);

  const disposable = vscode.lm.registerLanguageModelChatProvider(
    'local-model-provider',
    provider
  );

  context.subscriptions.push(disposable);

  // Get server URL for status bar
  const config = vscode.workspace.getConfiguration('local.model.provider');
  const serverUrl = config.get<string>('serverUrl', 'http://localhost:8000');
  statusBar.setStatus(ServerStatus.Unknown, { serverUrl });

  // Register a command to test the connection
  const testCommand = vscode.commands.registerCommand(
    'local-model-provider.testConnection',
    async () => {
      statusBar.setStatus(ServerStatus.Connecting);
      
      try {
        const models = await provider.provideLanguageModelChatInformation(
          { silent: false },
          new vscode.CancellationTokenSource().token
        );

        if (models.length > 0) {
          statusBar.setStatus(ServerStatus.Connected, { modelCount: models.length });
          vscode.window.showInformationMessage(
            `Local Model Provider: Successfully connected! Found ${models.length} model(s): ${models.map(m => m.name).join(', ')}`
          );
        } else {
          statusBar.setStatus(ServerStatus.Disconnected, { 
            errorMessage: 'No models found' 
          });
          vscode.window.showWarningMessage(
            'Local Model Provider: Connected but no models found.'
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        statusBar.setStatus(ServerStatus.Error, { errorMessage });
        vscode.window.showErrorMessage(
          `Local Model Provider: Connection test failed. ${errorMessage}`
        );
      }
    }
  );

  // Register command to set API key securely
  const setApiKeyCommand = vscode.commands.registerCommand(
    'local-model-provider.setApiKey',
    async () => {
      const secretManager = provider.getSecretManager();
      const hasExisting = await secretManager.hasApiKey();
      
      const placeholder = hasExisting 
        ? 'Enter new API key (leave empty to remove current key)'
        : 'Enter your API key for the inference server';

      const apiKey = await vscode.window.showInputBox({
        prompt: placeholder,
        password: true,
        placeHolder: 'sk-...',
        ignoreFocusOut: true,
      });

      if (apiKey === undefined) {
        return; // User cancelled
      }

      try {
        await secretManager.setApiKey(apiKey);
        // Apply the updated key to the running client immediately
        await provider.refreshApiKey();
        if (apiKey) {
          vscode.window.showInformationMessage(
            'Local Model Provider: API key stored securely.'
          );
        } else {
          vscode.window.showInformationMessage(
            'Local Model Provider: API key removed.'
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Local Model Provider: Failed to store API key. ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Register command to show status menu
  const showStatusCommand = vscode.commands.registerCommand(
    'local-model-provider.showStatus',
    () => statusBar.showStatusMenu()
  );

  context.subscriptions.push(testCommand);
  context.subscriptions.push(setApiKeyCommand);
  context.subscriptions.push(showStatusCommand);

  // Start health check (every 60 seconds)
  const healthCheckInterval = config.get<number>('modelCacheTtlMs', 300000);
  statusBar.startHealthCheck(async () => {
    try {
      const models = await provider.provideLanguageModelChatInformation(
        { silent: true },
        new vscode.CancellationTokenSource().token
      );
      return {
        connected: models.length > 0,
        modelCount: models.length,
      };
    } catch (error) {
      return {
        connected: false,
        modelCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, Math.max(healthCheckInterval, 30000)); // At least 30 seconds

  // Watch for config changes to update status bar
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('local.model.provider.serverUrl')) {
        const newConfig = vscode.workspace.getConfiguration('local.model.provider');
        const newServerUrl = newConfig.get<string>('serverUrl', 'http://localhost:8000');
        statusBar.setStatus(ServerStatus.Unknown, { serverUrl: newServerUrl });
      }
    })
  );

  console.log('Local Model Provider registered with vendor ID: local-model-provider');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('Local Model Provider extension is now deactivated');
}
