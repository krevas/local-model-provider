import * as vscode from 'vscode';

/**
 * Server connection status
 */
export enum ServerStatus {
  Unknown = 'unknown',
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Error = 'error',
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
    icon: '$(question)',
    text: 'Local Model Provider',
    tooltip: 'Local Model Provider: Status unknown',
  },
  [ServerStatus.Connecting]: {
    icon: '$(sync~spin)',
    text: 'Local Model Provider',
    tooltip: 'Local Model Provider: Connecting...',
  },
  [ServerStatus.Connected]: {
    icon: '$(check)',
    text: 'Local Model Provider',
    tooltip: 'Local Model Provider: Connected',
    color: new vscode.ThemeColor('statusBarItem.prominentForeground'),
  },
  [ServerStatus.Disconnected]: {
    icon: '$(debug-disconnect)',
    text: 'Local Model Provider',
    tooltip: 'Local Model Provider: Disconnected',
    color: new vscode.ThemeColor('statusBarItem.warningForeground'),
  },
  [ServerStatus.Error]: {
    icon: '$(error)',
    text: 'Local Model Provider',
    tooltip: 'Local Model Provider: Error',
    color: new vscode.ThemeColor('statusBarItem.errorForeground'),
  },
};

/**
 * Manages the status bar UI for server monitoring
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private status: ServerStatus = ServerStatus.Unknown;
  private modelCount: number = 0;
  private serverUrl: string = '';
  private lastCheckTime: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

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
    this.lastCheckTime = new Date();

    if (options?.modelCount !== undefined) {
      this.modelCount = options.modelCount;
    }
    if (options?.serverUrl !== undefined) {
      this.serverUrl = options.serverUrl;
    }

    this.updateDisplay(options?.errorMessage);
  }

  /**
   * Update the status bar display
   */
  private updateDisplay(errorMessage?: string): void {
    const config = STATUS_CONFIG[this.status];
    
    this.statusBarItem.text = `${config.icon} ${config.text}`;
    
    let tooltip = config.tooltip;
    if (this.serverUrl) {
      tooltip += `\n\nServer: ${this.serverUrl}`;
    }
    if (this.status === ServerStatus.Connected && this.modelCount > 0) {
      tooltip += `\nModels: ${this.modelCount}`;
    }
    if (errorMessage) {
      tooltip += `\n\nError: ${errorMessage}`;
    }
    if (this.lastCheckTime) {
      tooltip += `\n\nLast checked: ${this.lastCheckTime.toLocaleTimeString()}`;
    }
    tooltip += '\n\nClick for more options';
    
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
    lastCheckTime: Date | null;
  } {
    return {
      status: this.status,
      modelCount: this.modelCount,
      serverUrl: this.serverUrl,
      lastCheckTime: this.lastCheckTime,
    };
  }

  /**
   * Start periodic health checks
   */
  public startHealthCheck(
    checkFn: () => Promise<{ connected: boolean; modelCount: number; error?: string }>,
    intervalMs: number = 60000
  ): void {
    this.stopHealthCheck();
    
    // Run immediately
    this.runHealthCheck(checkFn);
    
    // Schedule periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck(checkFn);
    }, intervalMs);
  }

  /**
   * Run a single health check
   */
  private async runHealthCheck(
    checkFn: () => Promise<{ connected: boolean; modelCount: number; error?: string }>
  ): Promise<void> {
    try {
      this.setStatus(ServerStatus.Connecting);
      const result = await checkFn();
      
      if (result.connected) {
        this.setStatus(ServerStatus.Connected, {
          modelCount: result.modelCount,
        });
      } else {
        this.setStatus(ServerStatus.Disconnected, {
          errorMessage: result.error,
        });
      }
    } catch (error) {
      this.setStatus(ServerStatus.Error, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Stop periodic health checks
   */
  public stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Show status quick pick menu
   */
  public async showStatusMenu(): Promise<void> {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(refresh) Refresh Connection',
        description: 'Test connection to inference server',
      },
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

    const statusLabel = this.getStatusLabel();
    items.unshift({
      label: `$(info) Status: ${statusLabel}`,
      description: this.serverUrl || 'No server configured',
      kind: vscode.QuickPickItemKind.Separator,
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Local Model Provider Status',
    });

    if (!selected) {
      return;
    }

    if (selected.label.includes('Refresh Connection')) {
      vscode.commands.executeCommand('local-model-provider.testConnection');
    } else if (selected.label.includes('Open Settings')) {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'local.model.provider'
      );
    } else if (selected.label.includes('Set API Key')) {
      vscode.commands.executeCommand('local-model-provider.setApiKey');
    } else if (selected.label.includes('Show Output')) {
      vscode.commands.executeCommand(
        'workbench.action.output.show',
        'Local Model Provider'
      );
    }
  }

  /**
   * Get human-readable status label
   */
  private getStatusLabel(): string {
    switch (this.status) {
      case ServerStatus.Connected:
        return `Connected (${this.modelCount} models)`;
      case ServerStatus.Connecting:
        return 'Connecting...';
      case ServerStatus.Disconnected:
        return 'Disconnected';
      case ServerStatus.Error:
        return 'Error';
      default:
        return 'Unknown';
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.stopHealthCheck();
    this.statusBarItem.dispose();
  }
}
