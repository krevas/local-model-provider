# Changelog

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