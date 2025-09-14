## Enhanced Robustness and New Features

This PR significantly improves the robustness and functionality of the terminal MCP server while maintaining backward compatibility.

### New Features

- **Working Directory Management**: Commands can now execute in specified working directories with persistence across sessions
- **Configurable Timeouts**: Custom command timeouts (1-300 seconds) with proper timeout handling
- **Enhanced Error Handling**: Detailed error messages with automatic retry mechanisms for SSH connections
- **Exit Code Reporting**: Commands now return proper exit codes for better error detection
- **Structured Output**: Better formatted output with command, working directory, exit code, stdout, and stderr

### Robustness Improvements

- **Automatic Retry Logic**: Failed SSH connections are automatically retried with exponential backoff (3 attempts)
- **Connection Health Monitoring**: Active connections are monitored and automatically reconnected when needed
- **Improved Session Management**: Better connection pooling, reconnection, and graceful cleanup
- **Enhanced Signal Handling**: Proper handling of SIGINT, SIGTERM, SIGHUP with graceful shutdown
- **Input Validation**: Better parameter validation with meaningful error messages
- **Resource Management**: Improved session lifecycle and cleanup

### Technical Improvements

- **Better SSH Reliability**: Simplified and more reliable SSH shell management
- **Environment Variable Persistence**: Environment variables persist across commands in the same session
- **Connection Timeout Handling**: Configurable connection timeouts with proper error reporting
- **Memory Management**: Better session lifecycle management and cleanup
- **Type Safety**: Improved TypeScript typing throughout the codebase

### Updated Parameters

The `execute_command` tool now supports:
- `workingDirectory` (string, optional): Set working directory for command execution
- `timeout` (number, optional): Command timeout in milliseconds (default: 30000, range: 1000-300000)

### Testing

All new features have been thoroughly tested:
- Local command execution with new features
- Working directory management and persistence
- Timeout handling and validation
- Environment variable persistence
- Session management and isolation
- Error handling and validation
- Graceful shutdown and cleanup

### Documentation

- Updated README.md with comprehensive documentation of all new features
- Added examples for working directory and timeout usage
- Enhanced best practices section with new guidance
- Added output format documentation

### Backward Compatibility

All existing functionality is maintained. The changes are additive and don't break existing integrations.

### Benefits

1. **More Reliable**: Better error handling and automatic recovery
2. **More Robust**: Improved session management and connection pooling  
3. **More Flexible**: Working directory and timeout support
4. **Better Debugging**: Enhanced logging and error messages
5. **More Professional**: Proper signal handling and graceful shutdown
6. **Production Ready**: Enterprise-grade robustness features

This implementation transforms the terminal MCP server into a production-ready tool while maintaining the simplicity of having just one powerful `execute_command` tool that can handle all operations through shell commands.
