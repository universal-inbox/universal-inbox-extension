# Universal Inbox Browser Extension

A cross-browser extension that integrates with Universal Inbox, allowing users to quickly send web pages from their browser to their Universal Inbox for centralized task and notification management.

## Configuration

### For Users

1. Install the extension
2. Right-click extension icon → "Options" (or access via browser's extension management)
3. Configure:
   - **API Base URL**: Your Universal Inbox server (default: `https://app.universal-inbox.com`)

## Development Setup

### Prerequisites

- [Devbox](https://www.jetpack.io/devbox/) for environment management
- [direnv](https://direnv.net/) for automatic environment loading

### Getting Started

1. **Clone and setup environment:**
   ```bash
   git clone https://github.com/universal-inbox/universal-inbox-extension
   cd universal-inbox-extension
   direnv allow  # Automatically installs pre-commit hooks
   ```

2. **Install dependencies:**
   ```bash
   just install
   ```

### Development Commands

The project uses [Just](https://just.systems/) as a command runner for consistency:

#### Development
- `just run` - Start development server with hot reload
- `just start` - Start production preview mode

#### Building
- `just build` - Build for Chrome/Chromium browsers
  Extension archive is `universal-inbox-extension-chrome.zip`
- `just build-firefox` - Build for Firefox
  Extension archive is `universal-inbox-extension-firefox.zip`

#### Code Quality
- `just format` - Format code with Prettier
- `just lint` - Run ESLint
- `just type-check` - Run TypeScript type checking
- `just check` - Run both type-check and lint

### Browser Loading

#### Chrome/Edge
1. `just run`

#### Firefox  
1. `just run-firefox`

## Contributing

1. Ensure direnv is installed and working (`direnv allow`)
2. Make changes following the existing code style
3. Pre-commit hooks will automatically validate your changes
4. Test on both Chrome and Firefox builds
5. Submit pull request

## License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.
