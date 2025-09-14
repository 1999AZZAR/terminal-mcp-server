# Terminal MCP Server
[![smithery badge](https://smithery.ai/badge/@weidwonder/terminal-mcp-server)](https://smithery.ai/server/@weidwonder/terminal-mcp-server)

*[中文文档](README_CN.md)*

Terminal MCP Server is a Model Context Protocol (MCP) server that allows executing commands on local or remote hosts. It provides a simple yet powerful interface for AI models and other applications to execute system commands, either on the local machine or on remote hosts via SSH.

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
- **Multiple Connection Methods**: Connect via stdio or SSE (Server-Sent Events)

## Installation

### Installing via Smithery

To install terminal-mcp-server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@weidwonder/terminal-mcp-server):

```bash
npx -y @smithery/cli install @weidwonder/terminal-mcp-server --client claude
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/weidwonder/terminal-mcp-server.git
cd terminal-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Starting the Server

```bash
# Start the server using stdio (default mode)
npm start

# Or run the built file directly
node build/index.js
```

### Starting the Server in SSE Mode

The SSE (Server-Sent Events) mode allows you to connect to the server remotely via HTTP.

```bash
# Start the server in SSE mode
npm run start:sse

# Or run the built file directly with SSE flag
node build/index.js --sse
```

You can customize the SSE server with the following command-line options:

| Option | Description | Default |
|--------|-------------|---------|
| `--port` or `-p` | The port to listen on | 8080 |
| `--endpoint` or `-e` | The endpoint path | /sse |
| `--host` or `-h` | The host to bind to | localhost |

Example with custom options:

```bash
# Start SSE server on port 3000, endpoint /mcp, and bind to all interfaces
node build/index.js --sse --port 3000 --endpoint /mcp --host 0.0.0.0
```

This will start the server and listen for SSE connections at `http://0.0.0.0:3000/mcp`.

### Testing with MCP Inspector

```bash
# Start the MCP Inspector tool
npm run inspector
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

#### For SSE mode (remote connection)

```json
{
  "mcpServers": {
    "terminal-mcp-sse": {
      "url": "http://localhost:8080/sse",
      "headers": {}
    }
  }
}
```

Replace `localhost:8080/sse` with your actual server address, port, and endpoint if you've customized them.

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

#### For SSE mode (remote connection)

```json
{
  "mcpServers": {
    "terminal-mcp-sse": {
      "url": "http://localhost:8080/sse",
      "headers": {}
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

#### For SSE mode (remote connection)

```json
{
  "mcpServers": {
    "terminal-mcp-sse": {
      "url": "http://localhost:8080/sse",
      "headers": {}
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
