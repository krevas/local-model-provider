import * as vscode from 'vscode';
import { GatewayProvider } from './provider';
import { StatusBarManager, ServerStatus, ServerPreset } from './statusBar';
import { StatisticsManager } from './statistics';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Local Model Provider extension is now active');

  // Create statistics manager
  const statsManager = new StatisticsManager();
  context.subscriptions.push(statsManager);

  // Create status bar manager
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  // Link stats to status bar
  statsManager.onStatsUpdate((stats) => {
    statusBar.updateStats(stats);
  });

  // Create and register the language model provider
  const provider = new GatewayProvider(context, statsManager);

  const disposable = vscode.lm.registerLanguageModelChatProvider(
    'local-model-provider',
    provider
  );

  context.subscriptions.push(disposable);

  // Get server URL for status bar
  const config = vscode.workspace.getConfiguration('local.model.provider');
  const serverUrl = config.get<string>('serverUrl', 'http://localhost:8000');
  statusBar.setStatus(ServerStatus.Unknown, { serverUrl });



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

  // Register command to view and select models
  const selectModelCommand = vscode.commands.registerCommand(
    'local-model-provider.selectModel',
    async () => {
      try {
        const models = await provider.provideLanguageModelChatInformation(
          { silent: false },
          new vscode.CancellationTokenSource().token
        );

        if (models.length === 0) {
          vscode.window.showWarningMessage('No models available.');
          return;
        }

        const currentDefault = vscode.workspace.getConfiguration('local.model.provider')
          .get<string>('defaultModel', '');

        const items: vscode.QuickPickItem[] = models.map((model) => ({
          label: model.id === currentDefault ? `$(star-full) ${model.name}` : `$(symbol-method) ${model.name}`,
          description: model.id === currentDefault ? 'Default' : '',
          detail: `Max Input: ${model.maxInputTokens} | Max Output: ${model.maxOutputTokens} | Tool Calling: ${model.capabilities?.toolCalling ? 'Yes' : 'No'}`,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a model (selecting sets as default)',
          title: `Available Models (${models.length})`,
        });

        if (selected) {
          const modelName = selected.label.replace(/^\$\([^)]+\)\s*/, '');
          await vscode.workspace.getConfiguration('local.model.provider')
            .update('defaultModel', modelName, vscode.ConfigurationTarget.Global);
          
          // Immediately update status bar to reflect the change
          statusBar.setStatus(ServerStatus.Connected, { modelCount: models.length });
          
          vscode.window.showInformationMessage(`Default model set to: ${modelName}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to fetch models: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Register command to switch server presets
  const switchServerCommand = vscode.commands.registerCommand(
    'local-model-provider.switchServer',
    async () => {
      const presets = vscode.workspace.getConfiguration('local.model.provider')
        .get<ServerPreset[]>('serverPresets', []);

      const currentUrl = vscode.workspace.getConfiguration('local.model.provider')
        .get<string>('serverUrl', 'http://localhost:8000');

      const items: vscode.QuickPickItem[] = [
        {
          label: '$(add) Add New Preset',
          description: 'Create a new server preset',
          alwaysShow: true,
        },
      ];

      // Add delete option if there are presets
      if (presets.length > 0) {
        items.push({
          label: '$(trash) Delete Preset',
          description: 'Remove a saved preset',
          alwaysShow: true,
        });
      }

      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

      // Add current server if not in presets
      const currentInPresets = presets.some(p => p.url === currentUrl);
      if (!currentInPresets) {
        items.push({
          label: `$(check) Current: ${currentUrl}`,
          description: 'Active',
          detail: currentUrl,
        });
      }

      // Add presets
      for (const preset of presets) {
        items.push({
          label: preset.url === currentUrl ? `$(check) ${preset.name}` : `$(server) ${preset.name}`,
          description: preset.url === currentUrl ? 'Active' : '',
          detail: preset.url,
        });
      }

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a server preset',
        title: 'Server Presets',
      });

      if (!selected) {
        return;
      }

      if (selected.label.includes('Add New Preset')) {
        // Create new preset
        const name = await vscode.window.showInputBox({
          prompt: 'Enter preset name',
          placeHolder: 'e.g., Local vLLM, Ollama, Production',
        });

        if (!name) return;

        const url = await vscode.window.showInputBox({
          prompt: 'Enter server URL',
          placeHolder: 'http://localhost:8000',
          value: 'http://localhost:8000',
        });

        if (!url) return;

        const newPreset: ServerPreset = { name, url };
        const updatedPresets = [...presets, newPreset];

        await vscode.workspace.getConfiguration('local.model.provider')
          .update('serverPresets', updatedPresets, vscode.ConfigurationTarget.Global);

        // Switch to new preset
        await vscode.workspace.getConfiguration('local.model.provider')
          .update('serverUrl', url, vscode.ConfigurationTarget.Global);

        statusBar.setStatus(ServerStatus.Unknown, { serverUrl: url });
        provider.clearModelCache();
        vscode.window.showInformationMessage(`Created and switched to: ${name}`);
      } else if (selected.label.includes('Delete Preset')) {
        // Delete preset
        const deleteItems: vscode.QuickPickItem[] = presets.map(preset => ({
          label: `$(server) ${preset.name}`,
          description: preset.url === currentUrl ? 'Currently active' : '',
          detail: preset.url,
        }));

        const toDelete = await vscode.window.showQuickPick(deleteItems, {
          placeHolder: 'Select preset to delete',
          title: 'Delete Server Preset',
        });

        if (!toDelete) return;

        const presetName = toDelete.label.replace(/^\$\([^)]+\)\s*/, '');
        const confirmed = await vscode.window.showWarningMessage(
          `Delete preset "${presetName}"?`,
          { modal: true },
          'Delete'
        );

        if (confirmed === 'Delete') {
          const updatedPresets = presets.filter(p => p.name !== presetName);
          await vscode.workspace.getConfiguration('local.model.provider')
            .update('serverPresets', updatedPresets, vscode.ConfigurationTarget.Global);
          
          vscode.window.showInformationMessage(`Deleted preset: ${presetName}`);
        }
      } else if (selected.detail) {
        // Switch to selected preset
        await vscode.workspace.getConfiguration('local.model.provider')
          .update('serverUrl', selected.detail, vscode.ConfigurationTarget.Global);

        statusBar.setStatus(ServerStatus.Unknown, { serverUrl: selected.detail });
        provider.clearModelCache();
        vscode.window.showInformationMessage(`Switched to: ${selected.detail}`);
      }
    }
  );

  // Register command to show statistics
  const showStatsCommand = vscode.commands.registerCommand(
    'local-model-provider.showStats',
    async () => {
      const stats = statsManager.getSessionStats();
      const modelStats = statsManager.getModelStats();

      let message = `📊 Session Statistics\n\n`;
      message += `• Total Requests: ${stats.totalRequests}\n`;
      message += `• Input Tokens: ${StatisticsManager.formatTokens(stats.totalInputTokens)}\n`;
      message += `• Output Tokens: ${StatisticsManager.formatTokens(stats.totalOutputTokens)}\n`;
      message += `• Average Response: ${StatisticsManager.formatDuration(stats.averageResponseTimeMs)}\n`;
      message += `• Last Response: ${StatisticsManager.formatDuration(stats.lastResponseTimeMs)}\n`;
      message += `• Session Started: ${stats.sessionStartTime.toLocaleTimeString()}\n`;

      if (modelStats.size > 0) {
        message += `\n📈 Per-Model Stats:\n`;
        for (const [modelId, mStats] of modelStats) {
          message += `\n${modelId}:\n`;
          message += `  • Requests: ${mStats.requests}\n`;
          message += `  • Input: ${StatisticsManager.formatTokens(mStats.inputTokens)}\n`;
          message += `  • Output: ${StatisticsManager.formatTokens(mStats.outputTokens)}\n`;
        }
      }

      const action = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'Reset Statistics'
      );

      if (action === 'Reset Statistics') {
        statsManager.resetStats();
        vscode.window.showInformationMessage('Statistics reset.');
      }
    }
  );

  // Register command to refresh model cache
  const refreshModelsCommand = vscode.commands.registerCommand(
    'local-model-provider.refreshModels',
    async () => {
      provider.clearModelCache();
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Refreshing models...',
          cancellable: false,
        },
        async () => {
          try {
            const models = await provider.provideLanguageModelChatInformation(
              { silent: false },
              new vscode.CancellationTokenSource().token
            );
            statusBar.setStatus(ServerStatus.Connected, { modelCount: models.length });
            if (models.length > 0) {
              vscode.window.showInformationMessage(
                `Model cache refreshed. Found ${models.length} model(s): ${models.map(m => m.name).join(', ')}`
              );
            } else {
              vscode.window.showWarningMessage(
                'Model cache refreshed. No models found.'
              );
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            statusBar.setStatus(ServerStatus.Error, { errorMessage });
            vscode.window.showErrorMessage(`Failed to refresh models: ${errorMessage}`);
          }
        }
      );
    }
  );

  // Register command to show output channel
  const showOutputCommand = vscode.commands.registerCommand(
    'local-model-provider.showOutput',
    () => {
      provider.getOutputChannel().show();
    }
  );

  context.subscriptions.push(setApiKeyCommand);
  context.subscriptions.push(showStatusCommand);
  context.subscriptions.push(selectModelCommand);
  context.subscriptions.push(switchServerCommand);
  context.subscriptions.push(showStatsCommand);
  context.subscriptions.push(refreshModelsCommand);
  context.subscriptions.push(showOutputCommand);

  // Watch for config changes to update status bar
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('local.model.provider.serverUrl')) {
        const newConfig = vscode.workspace.getConfiguration('local.model.provider');
        const newServerUrl = newConfig.get<string>('serverUrl', 'http://localhost:8000');
        statusBar.setStatus(ServerStatus.Unknown, { serverUrl: newServerUrl });
      }
      
      // Clear model cache when defaultModel changes to force VS Code to refresh
      if (e.affectsConfiguration('local.model.provider.defaultModel')) {
        provider.clearModelCache();
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
