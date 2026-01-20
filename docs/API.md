# API Documentation

This document describes the internal architecture and APIs of Local Model Provider.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐ │
│  │  Copilot Chat   │◄──►│  Local Model Provider            │ │
│  │                 │    │  ┌────────────────────────────┐  │ │
│  │                 │    │  │   GatewayProvider          │  │ │
│  │                 │    │  │   - Message conversion     │  │ │
│  │                 │    │  │   - Token management       │  │ │
│  │                 │    │  │   - Tool call handling     │  │ │
│  │                 │    │  └────────────┬───────────────┘  │ │
│  │                 │    │               │                  │ │
│  │                 │    │  ┌────────────▼───────────────┐  │ │
│  │                 │    │  │   GatewayClient            │  │ │
│  │                 │    │  │   - HTTP requests          │  │ │
│  │                 │    │  │   - SSE streaming          │  │ │
│  │                 │    │  │   - Retry logic            │  │ │
│  │                 │    │  └────────────┬───────────────┘  │ │
│  └─────────────────┘    └───────────────┼──────────────────┘ │
└─────────────────────────────────────────┼───────────────────┘
                                          │
                                          ▼
                             ┌────────────────────────┐
                             │  Inference Server      │
                             │  (vLLM, Ollama, etc.)  │
                             │  OpenAI-compatible API │
                             └────────────────────────┘
```

## Core Classes

### GatewayProvider

The main provider class that implements VS Code's `LanguageModelChatProvider` interface.

#### Methods

| Method | Description |
|--------|-------------|
| `provideLanguageModelChatInformation()` | Fetches available models from the inference server |
| `provideLanguageModelChatResponse()` | Handles chat completion requests with streaming |
| `provideTokenCount()` | Estimates token count for messages |

#### Key Features

- **Message Conversion**: Converts VS Code chat messages to OpenAI format
- **Token Management**: Estimates tokens and truncates context to fit limits
- **Tool Call Handling**: Supports function calling with JSON repair for malformed responses
- **Model Caching**: Caches model list to reduce API calls

### GatewayClient

HTTP client for communicating with OpenAI-compatible inference servers.

#### Methods

| Method | Description |
|--------|-------------|
| `fetchModels()` | GET /v1/models - Retrieve available models |
| `streamChatCompletion()` | POST /v1/chat/completions - Stream chat responses |

#### Error Handling

The client includes:
- **Retry Logic**: Exponential backoff with jitter for transient failures
- **Retryable Status Codes**: 429, 500, 502, 503, 504
- **GatewayError**: Custom error class with status code and retry information

### SecretManager

Manages secure storage for sensitive configuration.

#### Methods

| Method | Description |
|--------|-------------|
| `getApiKey()` | Retrieve API key from secure storage |
| `setApiKey()` | Store API key securely |
| `deleteApiKey()` | Remove API key |
| `hasApiKey()` | Check if API key exists |

## Configuration

### GatewayConfig Interface

```typescript
interface GatewayConfig {
  serverUrl: string;           // Inference server URL
  apiKey?: string;             // API key (from SecretStorage)
  requestTimeout: number;      // Request timeout in ms
  defaultMaxTokens: number;    // Max input tokens (context window)
  defaultMaxOutputTokens: number; // Max output tokens
  enableToolCalling: boolean;  // Enable function calling
  parallelToolCalling: boolean; // Allow parallel tool calls
  agentTemperature: number;    // Temperature for tool mode
  topP: number;                // Nucleus sampling parameter
  frequencyPenalty: number;    // Reduce token repetition
  presencePenalty: number;     // Encourage new topics
  maxRetries: number;          // Max retry attempts
  retryDelayMs: number;        // Base retry delay
  modelCacheTtlMs: number;     // Model list cache duration
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

## Message Conversion

### VS Code to OpenAI Format

| VS Code Part | OpenAI Format |
|--------------|---------------|
| `LanguageModelTextPart` | `{ role, content }` |
| `LanguageModelToolCallPart` | `{ role: 'assistant', tool_calls: [...] }` |
| `LanguageModelToolResultPart` | `{ role: 'tool', tool_call_id, content }` |

## Tool Calling Flow

```
1. Copilot Chat sends request with tools
           ↓
2. Provider converts tools to OpenAI format
           ↓
3. Client streams response from server
           ↓
4. Provider parses tool_calls from stream
           ↓
5. JSON repair for malformed arguments
           ↓
6. Fill missing required properties
           ↓
7. Report LanguageModelToolCallPart to Copilot
           ↓
8. Copilot executes tool and sends result
           ↓
9. Repeat until complete
```

## Logging

### Log Levels

| Level | Description |
|-------|-------------|
| `debug` | Detailed information for debugging |
| `info` | General operational information |
| `warn` | Potential issues or degraded operation |
| `error` | Errors requiring attention |

### Log Format

```
[2026-01-20T08:15:00.000Z] [INFO ] Message here
```

## Error Codes

### GatewayError

```typescript
class GatewayError extends Error {
  statusCode?: number;      // HTTP status code
  isRetryable: boolean;     // Whether retry might succeed
  originalError?: Error;    // Underlying error
}
```

### Common Error Scenarios

| Scenario | Status Code | Retryable |
|----------|-------------|-----------|
| Server unavailable | - | Yes |
| Rate limited | 429 | Yes |
| Server error | 500-504 | Yes |
| Bad request | 400 | No |
| Unauthorized | 401 | No |
| Not found | 404 | No |

## Extension Points

### Adding New Features

1. **New Configuration Options**
   - Add to `types.ts` → `GatewayConfig`
   - Add to `package.json` → `contributes.configuration`
   - Load in `provider.ts` → `loadConfig()`

2. **New Commands**
   - Register in `extension.ts`
   - Add to `package.json` → `contributes.commands`

3. **New API Endpoints**
   - Add method to `client.ts`
   - Call from `provider.ts` as needed

## Performance Considerations

- **Model Caching**: Reduces `/v1/models` calls (default: 5 min TTL)
- **Token Estimation**: ~4 chars/token approximation (fast but rough)
- **Message Truncation**: Keeps first + recent messages when over limit
- **Streaming**: Responses are streamed for better UX
