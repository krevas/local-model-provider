# Contributing to Local Model Provider

Thank you for your interest in contributing to Local Model Provider! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18.x or later
- npm 9.x or later
- VS Code 1.106.0 or later
- Git

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/krevas/local-model-provider.git
   cd local-model-provider
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run esbuild
   ```

4. **Run in development mode**
   - Press `F5` in VS Code to launch the Extension Development Host
   - Or run `npm run esbuild-watch` for continuous builds

### Project Structure

```
local-model-provider/
├── src/
│   ├── extension.ts    # Extension entry point
│   ├── provider.ts     # Language model provider implementation
│   ├── client.ts       # HTTP client for inference servers
│   ├── types.ts        # TypeScript type definitions
│   ├── secrets.ts      # Secure storage management
│   ├── statusBar.ts    # Status bar UI manager
│   └── statistics.ts   # Usage statistics tracking
├── docs/               # Documentation
│   └── API.md          # API documentation
├── assets/             # Icons and screenshots
├── package.json        # Extension manifest
├── tsconfig.json       # TypeScript configuration
└── CONTRIBUTING.md     # This file
```

## Code Guidelines

### TypeScript Style

- Use strict TypeScript mode
- Prefer `const` over `let` when possible
- Use explicit type annotations for function parameters and return types
- Follow the existing code style (enforced by ESLint)

### Error Handling

- Always use the `GatewayError` class for custom errors
- Log errors with appropriate levels (`debug`, `info`, `warn`, `error`)
- Provide user-friendly error messages via VS Code notifications

### Security

- Never log sensitive information (API keys, tokens)
- Use `SecretStorage` for storing credentials
- Validate all external input

### Documentation

- Add JSDoc comments to all public methods
- Update README.md for user-facing changes
- Include inline comments for complex logic
- Add screenshots to assets/ folder for new UI features
- Update docs/API.md when changing internal APIs

## Testing

### Manual Testing

1. Start an inference server (e.g., vLLM, Ollama)
2. Launch the extension in debug mode (`F5`)
3. Open Copilot Chat and select a model from Local Model Provider
4. Test various scenarios:
   - Basic chat completion
   - Tool calling
   - Error handling (stop the server, invalid config)

### Test Checklist

- [ ] Extension activates without errors
- [ ] Models are fetched from inference server
- [ ] Chat completions stream correctly
- [ ] Tool calls work with compatible models
- [ ] Configuration changes apply without restart
- [ ] API key is stored securely
- [ ] Error messages are user-friendly
- [ ] Status bar menu displays correct server status
- [ ] Server preset configuration works correctly
- [ ] All commands in feature menu execute properly

## Submitting Changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting: `npm run lint` (if configured)
5. Test your changes thoroughly
6. Commit with descriptive messages
7. Push to your fork
8. Open a Pull Request

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(provider): add support for vision models`
- `fix(client): handle timeout errors gracefully`
- `docs(readme): update configuration section`

### Pull Request Guidelines

- Keep PRs focused and reasonably sized
- Include a clear description of changes
- Reference related issues
- Update documentation as needed
- Respond to review feedback promptly

## Reporting Issues

### Bug Reports

Please include:
- VS Code version
- Extension version
- Inference server type and version
- Model being used
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs from Output panel

### Feature Requests

Please describe:
- The problem you're trying to solve
- Your proposed solution
- Alternative solutions considered
- Any additional context

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow Microsoft's Code of Conduct

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open an issue for questions
- Check existing issues before creating new ones
- Join discussions in the Discussions tab

Thank you for contributing! 🎉
