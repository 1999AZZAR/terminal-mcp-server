# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-XX

### Added
- **Working Directory Management**: Commands can now execute in specified working directories with persistence across sessions
- **Configurable Timeouts**: Custom command timeouts (1-300 seconds) with proper timeout handling
- **Enhanced Error Handling**: Detailed error messages with automatic retry mechanisms for SSH connections
- **Exit Code Reporting**: Commands now return proper exit codes for better error detection
- **Structured Output**: Better formatted output with command, working directory, exit code, stdout, and stderr
- **MIT License**: Added proper MIT license for open source distribution
- **Comprehensive .gitignore**: Added proper gitignore file for Node.js projects
- **Enhanced package.json**: Updated with proper metadata, keywords, and repository information

### Changed
- **Version**: Bumped from 0.1.0 to 1.0.0 to reflect major robustness improvements
- **Description**: Updated package description to reflect enhanced capabilities
- **Repository**: Updated to new maintainer's repository
- **Documentation**: Removed unnecessary Chinese documentation and AI project info files

### Fixed
- **Export Command Parsing**: Fixed critical bug where export commands with chained commands (e.g., `export FOO=bar; ls`) were incorrectly handled, preventing subsequent commands from executing. Now properly detects chained commands and allows shell to handle them normally while still intercepting standalone export commands for session persistence.
- **Quote Removal Logic**: Fixed unsafe quote removal that could corrupt environment variable values. Now only removes quotes when they form proper matching pairs at the beginning and end of values, preventing corruption of values like `"foo'` or `hello"`.
- **Session Persistence**: Fixed environment variable persistence across commands by implementing proper export command handling in local execution
- **SSH Connection Health**: Improved connection health monitoring and automatic reconnection
- **Memory Management**: Better session lifecycle management and cleanup
- **Type Safety**: Improved TypeScript typing throughout the codebase with proper null checks

### Security
- **SSH Security**: Enhanced SSH key validation and modern algorithm support (RSA, Ed25519, ECDSA)
- **Input Validation**: Better parameter validation with meaningful error messages

### Removed
- **Unnecessary Files**: Removed PROJ_INFO_4AI.md, README_CN.md, and PR_DESCRIPTION.md
- **Old References**: Removed references to original maintainer and updated repository URLs

## [0.1.0] - Original Release

### Added
- Basic MCP server functionality
- SSH connection support
- Session persistence
- Local and remote command execution
- Environment variable support
