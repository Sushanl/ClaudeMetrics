# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Development
- `npm run compile` - Compile TypeScript and run lint checks
- `npm run watch` - Run development watcher (both esbuild and TypeScript)
- `npm run package` - Build production package with minification
- `npm run vscode:prepublish` - Prepare for VS Code publishing

### Code Quality
- `npm run lint` - Run ESLint on source files
- `npm run check-types` - Run TypeScript type checking without emitting files

### Testing
- `npm run test` - Run VS Code extension tests
- `npm run pretest` - Prepare for testing (compile tests, compile source, lint)
- `npm run compile-tests` - Compile test files to `out/` directory

## Architecture Overview

This is a VS Code extension called "ClaudeMetrics" that monitors and exports Claude Code usage metrics.

### Key Components

**Main Extension (`src/extension.ts`)**
- Entry point with `activate()` and `deactivate()` functions
- Watches Claude log files in `~/.config/claude/logs/` directory
- Collects user configuration (email and GitHub username) via VS Code settings
- Handles new log file events and processes JSONL files

**Configuration Management**
- Uses VS Code's configuration API to store user email and GitHub username
- Prompts users for configuration if not set via input boxes
- Stores configuration globally in VS Code settings

**File Watching System**
- Monitors `~/.config/claude/logs/` for new `.jsonl` files
- Uses Node.js `fs.watch()` with delayed processing (500ms timeout)
- Processes log files when they are created/renamed

### Dependencies

**Runtime Dependencies**
- `@opentelemetry/*` - Telemetry and metrics collection
- `diff` - File diff utilities
- Standard Node.js modules (`fs`, `path`)

**Development Dependencies**
- TypeScript with ES2022 target
- ESLint with TypeScript plugin
- esbuild for bundling
- VS Code extension testing framework
- Mocha for unit testing

### Build System
- Uses esbuild for fast bundling and development
- Custom esbuild configuration in `esbuild.js`
- Supports both development (with sourcemaps) and production builds
- External dependency: `vscode` module (provided by VS Code runtime)

### Extension Configuration
The extension contributes VS Code settings:
- `claudeMetrics.email` - User's email address
- `claudeMetrics.githubUsername` - User's GitHub username

These settings are used for metrics tracking and user identification.