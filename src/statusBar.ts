import * as vscode from 'vscode';
import { SessionStats, StatisticsManager } from './statistics';

/**
 * Server connection status
 */
export enum ServerStatus {
  Unknown = 'unknown',
  Connected = 'connected',
  Error = 'error',
}

/**
 * Server preset configuration
 */
export interface ServerPreset {
  name: string;
  url: string;
  apiKey?: string;
}

/**
 * Status bar item configuration
 */
interface StatusInfo {
  icon: string;
  text: string;
  tooltip: string;
  color?: vscode.ThemeColor;
}

/**
 * Status configurations for each state
 */
const STATUS_CONFIG: Record<ServerStatus, StatusInfo> = {
  [ServerStatus.Unknown]: {
    icon: '$(plug)',
    text: 'Local LLM',
    tooltip: 'Local Model Provider: Click for options',
  },
  [ServerStatus.Connected]: {
    icon: '$(check)',
    text: 'Local LLM',
    tooltip: 'Local Model Provider: Connected',
    color: new vscode.ThemeColor('statusBarItem.prominentForeground'),
  },
  [ServerStatus.Error]: {
    icon: '$(error)',
    text: 'Local LLM',
    tooltip: 'Local Model Provider: Error',
    color: new vscode.ThemeColor('statusBarItem.errorForeground'),
  },
};

/**
 * Manages the status bar UI for Local Model Provider
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private status: ServerStatus = ServerStatus.Unknown;
  private modelCount: number = 0;
  private serverUrl: string = '';
  private lastResponseTime: number = 0;
  private sessionStats: SessionStats | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'local-model-provider.showStatus';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  /**
   * Update the server status
   */
  public setStatus(
    status: ServerStatus,
    options?: {
      modelCount?: number;
      serverUrl?: string;
      errorMessage?: string;
    }
  ): void {
    this.status = status;

    if (options?.modelCount !== undefined) {
      this.modelCount = options.modelCount;
    }
    if (options?.serverUrl !== undefined) {
      this.serverUrl = options.serverUrl;
    }

    this.updateDisplay(options?.errorMessage);
  }

  /**
   * Update statistics from StatisticsManager
   */
  public updateStats(stats: SessionStats): void {
    this.sessionStats = stats;
    this.lastResponseTime = stats.lastResponseTimeMs;
    this.updateDisplay();
  }

  /**
   * Update the status bar display
   */
  private updateDisplay(errorMessage?: string): void {
    const config = STATUS_CONFIG[this.status];
    
    // Show response time if available
    let text = `${config.icon} ${config.text}`;
    if (this.status === ServerStatus.Connected && this.lastResponseTime > 0) {
      text += ` (${StatisticsManager.formatDuration(this.lastResponseTime)})`;
    }
    this.statusBarItem.text = text;
    
    let tooltip = config.tooltip;
    if (this.serverUrl) {
      tooltip += `\n\nServer: ${this.serverUrl}`;
    }
    if (this.status === ServerStatus.Connected && this.modelCount > 0) {
      tooltip += `\nModels: ${this.modelCount}`;
    }
    if (this.sessionStats && this.sessionStats.totalRequests > 0) {
      tooltip += `\n\n📊 Session Stats:`;
      tooltip += `\n• Requests: ${this.sessionStats.totalRequests}`;
      tooltip += `\n• Input: ${StatisticsManager.formatTokens(this.sessionStats.totalInputTokens)} tokens`;
      tooltip += `\n• Output: ${StatisticsManager.formatTokens(this.sessionStats.totalOutputTokens)} tokens`;
      tooltip += `\n• Avg Response: ${StatisticsManager.formatDuration(this.sessionStats.averageResponseTimeMs)}`;
    }
    if (errorMessage) {
      tooltip += `\n\n⚠️ Error: ${errorMessage}`;
    }
    tooltip += '\n\nClick for options';
    
    this.statusBarItem.tooltip = new vscode.MarkdownString(tooltip);
    this.statusBarItem.color = config.color;
  }

  /**
   * Get current status information
   */
  public getStatusInfo(): {
    status: ServerStatus;
    modelCount: number;
    serverUrl: string;
  } {
    return {
      status: this.status,
      modelCount: this.modelCount,
      serverUrl: this.serverUrl,
    };
  }

  /**
   * Show status quick pick menu
   */
  public async showStatusMenu(): Promise<void> {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(list-unordered) View Models',
        description: 'View available models and set default',
      },
      {
        label: '$(server) Switch Server',
        description: 'Switch between server presets',
      },
      {
        label: '$(graph) View Statistics',
        description: 'View token usage and response times',
      },
      {
        label: '$(sync) Refresh Models',
        description: 'Refresh the model list cache',
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(gear) Open Settings',
        description: 'Configure Local Model Provider settings',
      },
      {
        label: '$(key) Set API Key',
        description: 'Securely store your API key',
      },
      {
        label: '$(output) Show Output',
        description: 'View extension logs',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Local Model Provider (${this.getStatusLabel()})`,
    });

    if (!selected) {
      return;
    }

    if (selected.label.includes('View Models')) {
      vscode.commands.executeCommand('local-model-provider.selectModel');
    } else if (selected.label.includes('Switch Server')) {
      vscode.commands.executeCommand('local-model-provider.switchServer');
    } else if (selected.label.includes('View Statistics')) {
      vscode.commands.executeCommand('local-model-provider.showStats');
    } else if (selected.label.includes('Refresh Models')) {
      vscode.commands.executeCommand('local-model-provider.refreshModels');
    } else if (selected.label.includes('Open Settings')) {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'local.model.provider'
      );
    } else if (selected.label.includes('Set API Key')) {
      vscode.commands.executeCommand('local-model-provider.setApiKey');
    } else if (selected.label.includes('Show Output')) {
      vscode.commands.executeCommand('local-model-provider.showOutput');
    }
  }

  /**
   * Get human-readable status label
   */
  private getStatusLabel(): string {
    switch (this.status) {
      case ServerStatus.Connected:
        return `${this.modelCount} model(s)`;
      case ServerStatus.Error:
        return 'Error';
      default:
        return 'Ready';
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

