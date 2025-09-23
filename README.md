# Terminal MCP Server

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![npm version](https://badge.fury.io/js/terminal-mcp-server.svg)](https://badge.fury.io/js/terminal-mcp-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

Terminal MCP Server is a robust Model Context Protocol (MCP) server designed for executing commands on local and remote hosts via SSH. It provides a simple yet powerful interface for AI models and other applications to execute system commands with enhanced session management, error handling, and reliability features.

> **Note**: This is a maintained fork of the original project with significant robustness improvements and new features.

## Features

- **Local Command Execution**: Execute commands directly on the local machine
- **Remote Command Execution**: Execute commands on remote hosts via SSH with automatic retry and connection health checks
- **Session Persistence**: Support for persistent sessions that reuse the same terminal environment for a specified time (default 20 minutes)
- **Working Directory Management**: Set and persist working directories across commands in sessions
- **Environment Variables**: Set custom environment variables for commands with persistence across session
- **Configurable Timeouts**: Set custom command timeouts (1-300 seconds) with proper timeout handling
- **Enhanced Error Handling**: Detailed error messages with automatic retry mechanisms for SSH connections
- **Robust Session Management**: Automatic connection pooling, reconnection, and graceful cleanup
- **Exit Code Reporting**: Commands return proper exit codes for better error detection
- **Stdio Connection**: Connect via standard input/output for direct integration

## Installation

### Installing via Smithery

To install terminal-mcp-server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@1999AZZAR/terminal-mcp-server):

```bash
npx -y @smithery/cli install @1999AZZAR/terminal-mcp-server --client claude
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/1999AZZAR/terminal-mcp-server.git
cd terminal-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Starting the Server

#### Standard Mode
```bash
# Start the server using stdio (default mode)
npm start

# Or run the built file directly
node build/index.js
```

#### Clean Environment Mode (Recommended)
If you experience shell configuration errors like:
```
--: eval: line 8551: syntax error near unexpected token `('
--: eval: line 8551: `back () '
--: line 1: dump_bash_state: command not found
```

Use the clean environment runner to bypass problematic shell configurations:

```bash
# Use the clean runner script
./run-clean.sh

# Or use npm script
npm run start:clean

# Or manually with clean bash
bash --noprofile --norc -c "node build/index.js"
```

The clean environment mode uses `bash --noprofile --norc` to avoid loading `.bashrc`, `.bash_profile`, and other shell configuration files that might contain malformed functions or aliases.

### Server Configuration

The server runs in stdio mode by default, which is perfect for direct integration with MCP clients. You can enable debug logging by setting the `DEBUG` environment variable:

```bash
# Run with debug logging
DEBUG=true node build/index.js

# Or set it as an environment variable
export DEBUG=true
node build/index.js
```

### Testing with MCP Inspector

```bash
# Start the MCP Inspector tool
npm run inspector
```

### Available NPM Scripts

```bash
# Build the project
npm run build

# Start the server (standard mode)
npm start

# Start the server in clean environment (recommended)
npm run start:clean

# Start with file watching for development
npm run watch

# Run the MCP Inspector for testing
npm run inspector

# Run tests
npm test
```

## The execute_command Tool

The execute_command tool is the core functionality provided by Terminal MCP Server, used to execute commands on local or remote hosts with enhanced robustness and reliability.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| command | string | Yes | The command to execute |
| host | string | No | The remote host to connect to. If not provided, the command will be executed locally |
| username | string | Required when host is specified | The username for SSH connection |
| session | string | No | Session name, defaults to "default". The same session name will reuse the same terminal environment for 20 minutes |
| env | object | No | Environment variables, defaults to an empty object |
| workingDirectory | string | No | Working directory for command execution (optional) |
| timeout | number | No | Command timeout in milliseconds (default: 30000, range: 1000-300000) |

### Examples

#### Executing a Command Locally

```json
{
  "command": "ls -la",
  "session": "my-local-session",
  "env": {
    "NODE_ENV": "development"
  }
}
```

#### Executing a Command with Working Directory

```json
{
  "command": "pwd && ls -la",
  "workingDirectory": "/tmp",
  "session": "my-session",
  "timeout": 10000
}
```

#### Executing a Command on a Remote Host

```json
{
  "host": "example.com",
  "username": "user",
  "command": "ls -la",
  "session": "my-remote-session",
  "env": {
    "NODE_ENV": "production"
  },
  "timeout": 15000
}
```

#### Long-running Command with Custom Timeout

```json
{
  "command": "sleep 10 && echo 'Task completed'",
  "timeout": 15000,
  "session": "long-running-task"
}
```

## Configuring with AI Assistants

### Configuring with Roo Code

1. Open VSCode and install the Roo Code extension
2. Open the Roo Code settings file: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`
3. Add the following configuration:

#### For stdio mode (local connection)

```json
{
  "mcpServers": {
    "terminal-mcp": {
      "command": "node",
      "args": ["/path/to/terminal-mcp-server/build/index.js"],
      "env": {}
    }
  }
}
```


### Configuring with Cline

1. Open the Cline settings file: `~/.cline/config.json`
2. Add the following configuration:

#### For stdio mode (local connection)

```json
{
  "mcpServers": {
    "terminal-mcp": {
      "command": "node",
      "args": ["/path/to/terminal-mcp-server/build/index.js"],
      "env": {}
    }
  }
}
```


### Configuring with Claude Desktop

1. Open the Claude Desktop settings file: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add the following configuration:

#### For stdio mode (local connection)

```json
{
  "mcpServers": {
    "terminal-mcp": {
      "command": "node",
      "args": ["/path/to/terminal-mcp-server/build/index.js"],
      "env": {}
    }
  }
}
```


## Best Practices

### Command Execution

- Before running commands, it's best to determine the system type (Mac, Linux, etc.)
- Use full paths to avoid path-related issues
- For command sequences that need to maintain environment, use `&&` to connect multiple commands
- For long-running commands, use the `timeout` parameter to set appropriate limits
- Check exit codes in the response to verify command success

### SSH Connection

- Ensure SSH key-based authentication is set up
- If connection fails, check if the key file exists (default path: `~/.ssh/id_rsa`)
- Make sure the SSH service is running on the remote host
- The server automatically retries failed connections with exponential backoff
- Connection health is monitored and sessions are automatically reconnected when needed

### Session Management

- Use the session parameter to maintain environment and working directory between related commands
- For operations requiring specific environments, use the same session name
- Working directories persist across commands in the same session
- Environment variables set in one command persist for subsequent commands in the same session
- Sessions automatically close after 20 minutes of inactivity

### Error Handling

- Command execution results include structured output with command, working directory, exit code, stdout, and stderr
- Check the exit code to determine if the command executed successfully (0 = success, non-zero = error)
- The server provides detailed error messages for connection issues, timeouts, and validation errors
- For complex operations, add verification steps to ensure success
- Use appropriate timeout values for long-running commands

### Working Directory Management

- Use the `workingDirectory` parameter to execute commands in specific directories
- Working directories are remembered across commands in the same session
- Paths are automatically validated and errors are reported clearly

### Timeout Management

- Set appropriate timeout values based on your command's expected duration
- Default timeout is 30 seconds, configurable from 1 to 300 seconds
- Commands that exceed the timeout will return exit code 124
- Use longer timeouts for operations like package installation or compilation

## Output Format

The `execute_command` tool returns structured output in the following format:

```
Command: <command that was executed>
Working Directory: <working directory if specified>
Exit Code: <exit code of the command>

STDOUT:
<standard output of the command>

STDERR:
<standard error output of the command, if any>
```

### Exit Codes

- **0**: Command executed successfully
- **Non-zero**: Command failed or encountered an error
- **124**: Command timed out (when using timeout parameter)

## Troubleshooting

### Shell Configuration Errors

If you encounter errors like:
```
--: eval: line 8551: syntax error near unexpected token `('
--: eval: line 8551: `back () '
--: line 1: dump_bash_state: command not found
```

These errors are caused by problematic shell configurations (oh-my-bash, alias-hub, or custom functions). Use the clean environment mode:

```bash
# Recommended solution
./run-clean.sh

# Alternative solutions
npm run start:clean
bash --noprofile --norc -c "node build/index.js"
```

### SSH Connection Issues

For SSH connection problems:

1. **Check SSH key permissions**:
   ```bash
   chmod 600 ~/.ssh/id_rsa
   chmod 644 ~/.ssh/id_rsa.pub
   ```

2. **Test SSH connection manually**:
   ```bash
   ssh -i ~/.ssh/id_rsa username@hostname
   ```

3. **Enable debug logging**:
   ```bash
   DEBUG=true npm run start:clean
   ```

### Environment Variable Issues

If environment variables aren't persisting:

1. **Check export command syntax**:
   ```bash
   # Correct
   export VAR=value
   
   # Incorrect (will be intercepted)
   export VAR=value; ls
   ```

2. **Use proper quoting**:
   ```bash
   export VAR="value with spaces"
   ```

## Important Notes

- For remote command execution, SSH key-based authentication must be set up in advance
- For local command execution, commands will run in the context of the user who started the server
- Session timeout is 20 minutes, after which the connection will be automatically closed
- The server automatically handles connection failures and retries with exponential backoff
- All sessions are properly cleaned up on server shutdown
- Working directories and environment variables persist within the same session
- Timeout values must be between 1 and 300 seconds (1000-300000 milliseconds)

## Robustness Features

This implementation includes several enterprise-grade robustness features:

- **Automatic Retry Logic**: Failed SSH connections are automatically retried with exponential backoff
- **Connection Health Monitoring**: Active connections are monitored and automatically reconnected when needed
- **Graceful Shutdown**: Proper signal handling ensures all sessions are cleaned up on server termination
- **Input Validation**: All parameters are validated with clear error messages
- **Resource Management**: Sessions are properly managed with automatic cleanup of inactive connections
- **Error Recovery**: The server continues operating even after individual command failures
