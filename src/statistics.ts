import * as vscode from 'vscode';

/**
 * Statistics for a single request
 */
export interface RequestStats {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  responseTimeMs: number;
  timestamp: Date;
}

/**
 * Session statistics summary
 */
export interface SessionStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  averageResponseTimeMs: number;
  lastResponseTimeMs: number;
  sessionStartTime: Date;
}

/**
 * Manages usage statistics for the extension
 */
export class StatisticsManager implements vscode.Disposable {
  private requests: RequestStats[] = [];
  private sessionStartTime: Date = new Date();
  private onStatsUpdateEmitter = new vscode.EventEmitter<SessionStats>();

  /**
   * Event fired when statistics are updated
   */
  public readonly onStatsUpdate = this.onStatsUpdateEmitter.event;

  /**
   * Record a completed request
   */
  public recordRequest(stats: Omit<RequestStats, 'timestamp'>): void {
    this.requests.push({
      ...stats,
      timestamp: new Date(),
    });
    this.onStatsUpdateEmitter.fire(this.getSessionStats());
  }

  /**
   * Get session statistics summary
   */
  public getSessionStats(): SessionStats {
    const totalRequests = this.requests.length;
    const totalInputTokens = this.requests.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = this.requests.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalResponseTime = this.requests.reduce((sum, r) => sum + r.responseTimeMs, 0);
    const lastRequest = this.requests[this.requests.length - 1];

    return {
      totalRequests,
      totalInputTokens,
      totalOutputTokens,
      averageResponseTimeMs: totalRequests > 0 ? Math.round(totalResponseTime / totalRequests) : 0,
      lastResponseTimeMs: lastRequest?.responseTimeMs ?? 0,
      sessionStartTime: this.sessionStartTime,
    };
  }

  /**
   * Get statistics per model
   */
  public getModelStats(): Map<string, { requests: number; inputTokens: number; outputTokens: number }> {
    const modelStats = new Map<string, { requests: number; inputTokens: number; outputTokens: number }>();

    for (const request of this.requests) {
      const existing = modelStats.get(request.modelId) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
      modelStats.set(request.modelId, {
        requests: existing.requests + 1,
        inputTokens: existing.inputTokens + request.inputTokens,
        outputTokens: existing.outputTokens + request.outputTokens,
      });
    }

    return modelStats;
  }

  /**
   * Reset session statistics
   */
  public resetStats(): void {
    this.requests = [];
    this.sessionStartTime = new Date();
    this.onStatsUpdateEmitter.fire(this.getSessionStats());
  }

  /**
   * Format token count for display
   */
  public static formatTokens(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  /**
   * Format duration for display
   */
  public static formatDuration(ms: number): string {
    if (ms >= 60000) {
      return `${(ms / 60000).toFixed(1)}m`;
    }
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${ms}ms`;
  }

  public dispose(): void {
    this.onStatsUpdateEmitter.dispose();
  }
}
