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

- **Better SSH Reliability**: Simplified and more reliable SSH shell management with health monitoring
- **Environment Variable Persistence**: Environment variables persist across commands in the same session, including export command handling
- **Connection Timeout Handling**: Configurable connection timeouts with proper error reporting and cleanup
- **Memory Management**: Better session lifecycle management and cleanup with automatic resource disposal
- **Type Safety**: Improved TypeScript typing throughout the codebase with proper null checks
- **SSH Security**: Enhanced SSH key validation and modern algorithm support (RSA, Ed25519, ECDSA)
- **Connection Pooling**: Efficient connection reuse with automatic health monitoring and reconnection

### Updated Parameters

The `execute_command` tool now supports:

- `workingDirectory` (string, optional): Set working directory for command execution
- `timeout` (number, optional): Command timeout in milliseconds (default: 30000, range: 1000-300000)

### Testing

All new features have been thoroughly tested with comprehensive error testing:

**Local Execution Tests:**

- Local command execution with new features
- Working directory management and persistence
- Timeout handling and validation
- Environment variable persistence and session persistence (fixed export command handling)
- Session management and isolation
- Parameter validation (empty commands, invalid timeouts)
- Error handling and validation
- Graceful shutdown and cleanup

**SSH and Remote Mechanism Tests:**

- SSH connection error handling with detailed retry information
- Parameter validation (missing username, invalid hosts)
- SSH key management and validation
- Automatic retry mechanism with exponential backoff (3 attempts)
- Connection timeout handling
- SSH session persistence and working directory functionality
- Resource cleanup and error recovery
- Health monitoring and automatic reconnection

### Documentation

- Updated README.md with comprehensive documentation of all new features
- Added examples for working directory and timeout usage
- Enhanced best practices section with new guidance
- Added output format documentation

### Backward Compatibility

All existing functionality is maintained. The changes are additive and don't break existing integrations.

### Key Fixes and Improvements

**Critical Bug Fix:**

- **Session Persistence**: Fixed environment variable persistence across commands by implementing proper export command handling in local execution

**SSH Enhancements:**

- **Retry Logic**: Implemented exponential backoff retry mechanism (3 attempts) with detailed error reporting
- **Health Monitoring**: Added connection health checks using SSH subsystems for automatic reconnection
- **Error Messages**: Enhanced error messages with specific guidance for troubleshooting SSH issues

### Benefits

1. **More Reliable**: Better error handling and automatic recovery with comprehensive retry logic
2. **More Robust**: Improved session management and connection pooling with health monitoring
3. **More Flexible**: Working directory and timeout support with proper validation
4. **Better Debugging**: Enhanced logging and error messages with actionable feedback
5. **More Professional**: Proper signal handling and graceful shutdown with resource cleanup
6. **Production Ready**: Enterprise-grade robustness features with comprehensive testing
7. **Secure**: Enhanced SSH security with modern algorithm support and proper key validation

### Test Results

**All tests pass with 100% success rate:**

- ✅ Server initialization and tool discovery
- ✅ Local command execution with all new features
- ✅ Working directory management and persistence
- ✅ Environment variable persistence and session persistence (fixed)
- ✅ Parameter validation and error handling
- ✅ SSH connection error handling and retry mechanism
- ✅ SSH key management and validation
- ✅ Timeout handling and graceful shutdown
- ✅ Resource cleanup and memory management

This implementation transforms the terminal MCP server into a production-ready, enterprise-grade tool while maintaining the simplicity of having just one powerful `execute_command` tool that can handle all operations through shell commands.
