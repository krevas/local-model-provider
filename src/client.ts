import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import {
  OpenAIChatCompletionRequest,
  OpenAIModelsResponse,
  GatewayConfig
} from './types';

/**
 * Retry configuration for failed requests
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Error class for Gateway-specific errors
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Accumulated tool call during streaming
 */
interface StreamingToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * State for tracking tool calls during streaming
 */
interface ToolCallState {
  toolCallsByIndex: Map<number, StreamingToolCall>;
  finalizedIndices: Set<number>;
  requestId: string;
  toolCallCounter: number;

  // Add error handling for SSE events
  handleSSEError(error: Error): void;
}

/**
 * Parsed SSE chunk data
 */
interface ParsedChunk {
  delta?: {
    content?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
    function_call?: { name?: string; arguments?: string };
  };
  message?: {
    content?: string;
    text?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
    function_call?: { name?: string; arguments?: string };
  };
  finishReason?: string;
  id?: string;
}

/**
 * HTTP client for OpenAI-compatible inference servers
 */
export class GatewayClient {
  private config: GatewayConfig;
  private retryConfig: RetryConfig;

  constructor(config: GatewayConfig, retryConfig?: Partial<RetryConfig>) {
    this.config = config;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Update client configuration
   */
  public updateConfig(config: GatewayConfig): void {
    this.config = config;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs);
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown, statusCode?: number): boolean {
    if (statusCode && this.retryConfig.retryableStatusCodes.includes(statusCode)) {
      return true;
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('timeout') ||
             message.includes('econnreset') ||
             message.includes('econnrefused') ||
             message.includes('network') ||
             message.includes('abort');
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    operation: string
  ): Promise<Response> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.fetch(url, options);
        
        if (!response.ok && this.isRetryableError(null, response.status)) {
          if (attempt < this.retryConfig.maxRetries) {
            const delay = this.calculateBackoffDelay(attempt);
            console.log(`[LLM Gateway] ${operation} failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
            await this.sleep(delay);
            continue;
          }
        }
        
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (this.isRetryableError(error) && attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`[LLM Gateway] ${operation} failed with error: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
          await this.sleep(delay);
          continue;
        }
        
        throw new GatewayError(
          `${operation} failed after ${attempt + 1} attempts: ${lastError.message}`,
          undefined,
          false,
          lastError
        );
      }
    }
    
    throw new GatewayError(
      `${operation} failed after ${this.retryConfig.maxRetries + 1} attempts`,
      undefined,
      false,
      lastError
    );
  }

  /**
   * Fetch available models from /v1/models endpoint
   */
  public async fetchModels(): Promise<OpenAIModelsResponse> {
    const url = `${this.config.serverUrl}/v1/models`;

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers: this.getHeaders(),
      }, 'Fetch models');

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new GatewayError(
          `Failed to fetch models: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
          response.status,
          this.isRetryableError(null, response.status)
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof GatewayError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new GatewayError(
          `Failed to connect to inference server: ${error.message}`,
          undefined,
          this.isRetryableError(error),
          error
        );
      }
      throw error;
    }
  }

  /**
   * Create initial tool call tracking state
   */
  private createToolCallState(): ToolCallState {
    return {
      toolCallsByIndex: new Map<number, StreamingToolCall>(),
      finalizedIndices: new Set<number>(),
      requestId: `req_${Date.now()}_${randomBytes(4).toString('hex')}`,
      toolCallCounter: 0,
    };
  }

  /**
   * Process a single streamed tool call delta
   */
  private processToolCallDelta(
    tc: { index?: number; id?: string; function?: { name?: string; arguments?: string } },
    state: ToolCallState
  ): void {
    const index = tc.index ?? state.toolCallCounter++;
    const existing = state.toolCallsByIndex.get(index);

    if (existing) {
      if (tc.id) { existing.id = tc.id; }
      if (tc.function?.name) { existing.name = tc.function.name; }
      if (tc.function?.arguments) { existing.arguments += tc.function.arguments; }
    } else {
      state.toolCallsByIndex.set(index, {
        id: tc.id || '',
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '',
      });
    }
  }

  /**
   * Process legacy function_call format
   */
  private processLegacyFunctionCall(
    functionCall: { name?: string; arguments?: string },
    parsedId: string,
    state: ToolCallState
  ): void {
    const index = 0;
    const existing = state.toolCallsByIndex.get(index);

    if (existing) {
      if (functionCall.name) { existing.name = functionCall.name; }
      if (functionCall.arguments) { existing.arguments += functionCall.arguments; }
    } else {
      state.toolCallsByIndex.set(index, {
        id: parsedId || '',
        name: functionCall.name || '',
        arguments: functionCall.arguments || '',
      });
    }
  }

  /**
   * Finalize all pending tool calls
   */
  private finalizeToolCalls(state: ToolCallState): StreamingToolCall[] {
    const finishedToolCalls: StreamingToolCall[] = [];

    for (const [index, tc] of state.toolCallsByIndex.entries()) {
      if (!state.finalizedIndices.has(index)) {
        state.finalizedIndices.add(index);
        if (!tc.id) {
          tc.id = `call_${state.requestId}_${index}`;
        }
        finishedToolCalls.push({ ...tc });
      }
    }

    return finishedToolCalls;
  }

  /**
   * Process delta format from streaming response
   */
  private processDeltaFormat(
    parsed: ParsedChunk,
    state: ToolCallState
  ): { content: string; finishedToolCalls: StreamingToolCall[] } {
    const delta = parsed.delta!;
    const finishedToolCalls: StreamingToolCall[] = [];

    // Handle streamed tool_calls
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        this.processToolCallDelta(tc, state);
      }
    }

    // Handle legacy function_call format
    if (delta.function_call) {
      this.processLegacyFunctionCall(delta.function_call, parsed.id || '', state);
    }

    // Check if tool calls are complete
    if (parsed.finishReason === 'tool_calls' || parsed.finishReason === 'function_call') {
      finishedToolCalls.push(...this.finalizeToolCalls(state));
    }

    return { content: delta.content || '', finishedToolCalls };
  }

  /**
   * Process non-delta (final) message format
   */
  private processMessageFormat(
    parsed: ParsedChunk,
    state: ToolCallState
  ): { content: string; finishedToolCalls: StreamingToolCall[] } {
    const message = parsed.message!;
    const finishedToolCalls: StreamingToolCall[] = [];

    // Handle complete tool_calls array
    if (Array.isArray(message.tool_calls)) {
      for (let i = 0; i < message.tool_calls.length; i++) {
        const tc = message.tool_calls[i];
        const index = tc.index ?? i;
        if (!state.finalizedIndices.has(index)) {
          state.finalizedIndices.add(index);
          finishedToolCalls.push({
            id: tc.id || `call_${state.requestId}_${index}`,
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '',
          });
        }
      }
    }

    // Handle legacy function_call format
    if (message.function_call && !state.finalizedIndices.has(0)) {
      state.finalizedIndices.add(0);
      finishedToolCalls.push({
        id: parsed.id || `call_${state.requestId}_0`,
        name: message.function_call.name || '',
        arguments: message.function_call.arguments || '',
      });
    }

    return { content: message.content || message.text || '', finishedToolCalls };
  }

  /**
   * Parse a raw SSE data string into structured chunk data
   */
  private parseSSEData(data: string): ParsedChunk | null {
    try {
      const parsed = JSON.parse(data);
      return {
        delta: parsed.choices?.[0]?.delta,
        message: parsed.choices?.[0]?.message,
        finishReason: parsed.choices?.[0]?.finish_reason,
        id: parsed.id,
      };
    } catch {
      console.error('Failed to parse SSE chunk:', data);
      return null;
    }
  }

  /**
   * Process a single SSE line and return yield data if applicable
   */
  private processSSELine(
    line: string,
    state: ToolCallState
  ): { content: string; tool_calls: StreamingToolCall[]; finished_tool_calls: StreamingToolCall[] } | null {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed === 'data: [DONE]') {
      return null;
    }

    if (!trimmed.startsWith('data: ')) {
      return null;
    }

    const data = trimmed.slice(6);
    const parsed = this.parseSSEData(data);
    if (!parsed) { return null; }

    if (parsed.delta) {
      const { content, finishedToolCalls } = this.processDeltaFormat(parsed, state);
      return { content, tool_calls: [], finished_tool_calls: finishedToolCalls };
    }

    if (parsed.message) {
      const { content, finishedToolCalls } = this.processMessageFormat(parsed, state);
      return { content, tool_calls: [], finished_tool_calls: finishedToolCalls };
    }

    return null;
  }

  /**
   * Get remaining unfinalised tool calls
   */
  private getRemainingToolCalls(state: ToolCallState): StreamingToolCall[] {
    const remaining: StreamingToolCall[] = [];

    for (const [index, tc] of state.toolCallsByIndex.entries()) {
      if (!state.finalizedIndices.has(index) && (tc.name || tc.arguments)) {
        state.finalizedIndices.add(index);
        if (!tc.id) {
          tc.id = `call_${state.requestId}_${index}`;
        }
        remaining.push({ ...tc });
      }
    }

    return remaining;
  }

  /**
   * Stream chat completions from /v1/chat/completions endpoint
   *
   * IMPORTANT: Tool calls are tracked by INDEX during streaming, not by ID.
   * OpenAI streaming format sends tool calls incrementally with an `index` field
   * to identify which tool call is being updated. The `id` may arrive in a later chunk.
   */
  public async *streamChatCompletion(
    request: OpenAIChatCompletionRequest,
    cancellationToken: vscode.CancellationToken
  ): AsyncGenerator<{ content: string; tool_calls: StreamingToolCall[]; finished_tool_calls: StreamingToolCall[] }, void, unknown> {
    const url = `${this.config.serverUrl}/v1/chat/completions`;
    const state = this.createToolCallState();

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, stream: true }),
      }, 'Chat completion');

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new GatewayError(
          `Chat completion failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
          response.status,
          this.isRetryableError(null, response.status)
        );
      }

      if (!response.body) {
        throw new GatewayError('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (cancellationToken.isCancellationRequested) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) { break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const result = this.processSSELine(line, state);
          if (result) { yield result; }
        }
      }

      // Finalize any remaining tool calls
      const remaining = this.getRemainingToolCalls(state);
      if (remaining.length > 0) {
        yield { content: '', tool_calls: [], finished_tool_calls: remaining };
      }
    } catch (error) {
      if (error instanceof GatewayError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new GatewayError(
          `Chat completion request failed: ${error.message}`,
          undefined,
          this.isRetryableError(error),
          error
        );
      }
      throw error;
    }
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      const raw = String(this.config.apiKey).trim();
      const bearer = raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
      // Standard OpenAI-compatible header
      headers['Authorization'] = bearer;
      // Common alternative used by some gateways
      headers['x-api-key'] = raw;
    }

    headers['Accept'] = 'application/json';

    return headers;
  }

  /**
   * Fetch wrapper with timeout support
   */
  private async fetch(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
