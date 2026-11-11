# Changelog

## 1.1.4

### New Features
- Added **See Running Models** command to the status bar menu that calls the Ollama `/api/ps` endpoint
- Shows currently loaded models so you can avoid selecting a model that is not loaded and wasting a long timeout on model teardown and rebuild
- Per-server `supportsRunningModels` flag (defaults to true). A failed `/api/ps` check hides the menu item for that server
- Debug logging of the check and response in the output channel and console

### Bug Fixes
- Treat only 404/405 responses as "/api/ps not supported" so auth or transient errors do not permanently hide the menu item
- Treat "fetch failed" as a retryable error so transient network issues get more than one attempt

## 1.1.3

### New Features
- Added opt-in Qwen tool-loop compatibility for local reasoning models (e.g. `unsloth/Qwen3.5-9B-GGUF` via llama.cpp)
- `qwenToolLoopCompat`: parses Qwen's raw XML-style tool calls (`<tool_call>` / `<function=...>`) into structured tool calls, and preserves reasoning across tool steps
- `qwenFinalAnswerRetry`: when enabled alongside `qwenToolLoopCompat`, runs one no-tools retry to get a final assistant message if Qwen returns only reasoning after a tool result

### Bug Fixes
- Fixed trailing text after a Qwen XML tool call being silently dropped by resetting the XML buffering state per tool-call block instead of once per response

## 1.1.2

### Improvements
- Fixed "terminated" / "request failed" errors when connecting to LM Studio and similar servers
- Replaced `TextDecoderStream` + `pipeThrough` with plain `TextDecoder` to avoid stream termination in certain runtimes
- Gracefully handle stream disconnection when data has already been received (some servers close without sending `[DONE]`)
- Added `\r\n` line ending support in SSE stream parsing
- Only send `top_p`, `frequency_penalty`, `presence_penalty` when non-default to avoid rejection by servers that don't accept unknown parameters
- Only send `parallel_tool_calls` when enabled (LM Studio rejects this field)
- Improved "terminated" error messages with actionable troubleshooting steps
- Added LM Studio to compatible servers list, keywords, and README setup guide

## 1.1.1

### Bug Fixes
- Prevented premature message truncation caused by an overly conservative token estimate. We now compute a real input-token estimate for the full conversation first and only truncate when it truly exceeds the available context window. This resolves cases where input was truncated despite ample room.
- Clearer token budgeting: context is now calculated as `model_context - desired_output - tools_overhead - buffer` and truncation is gated on the real estimate against this value.

## 1.1.0

- Fixed UTF-8 decoding issues causing garbled characters (e.g. arrows) by implementing `TextDecoderStream`
- Improved stream processing stability and ensured all data is flushed at the end of the response
- Fixed missing property error in tool call state creation

## 1.0.9

- Ensure model list refresh after server switch
- Apply latest config immediately on serverUrl update to avoid stale models
- Minor UX tweaks in server preset picker

## 1.0.8

### Bug Fixes
- Fixed server switching not immediately reflecting in "Manage Language Models" menu
- Fixed new preset creation not loading models from the new server

### Improvements
- Server switching now fetches models immediately with progress notification
- New preset creation now validates server connection and displays model count
- Enhanced user feedback when switching servers (shows model count or error)

## 1.0.7

### New Features
- **Delete Server Presets**: Remove saved server presets with confirmation dialog

### Improvements
- Server preset menu now shows delete option when presets exist
- Better model selection responsiveness with immediate cache refresh

## 1.0.6

### New Features
- **Model Viewer & Default Selection**: View available models and quickly set a default model
- **Server Presets**: Save and switch between multiple server configurations (vLLM, Ollama, OpenAI, etc.)
- **Token Usage Statistics**: Track input/output tokens and view per-model statistics
- **Response Time Monitoring**: Display last response time in status bar, track average response times
- **Manual Model Refresh**: Refresh model cache on demand via command

### Improvements
- Enhanced status bar with session statistics in tooltip
- New quick actions menu with all features accessible
- Added 4 new commands: View Models, Switch Server, View Statistics, Refresh Models
- Removed redundant "Test Connection" command (consolidated into Refresh Models)
- Enhanced "Refresh Models" to display model names in the success message

## 1.0.5

- Lowered minimum VS Code engine version to 1.100.0 for Antigravity compatibility

## 1.0.4

- Added reasoning/thinking content output support for models like o1, o3, Claude, etc.

## 1.0.3

- Fixed error when using API Key

## 1.0.2

- Bug fixes

## 1.0.1

- Bug fixes
