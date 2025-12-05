#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { 
  CommandExecutor, 
  CommandExecutionError, 
  TimeoutError, 
  SshConnectionError 
} from "./executor.js";
import { log } from "./logger.js";

const commandExecutor = new CommandExecutor();

// Create server
function createServer() {
  const server = new Server(
    {
      name: "remote-ops-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "execute_command",
          description: "Execute commands on remote hosts or locally. Returns a JSON object with 'command', 'exitCode', 'stdout', and 'stderr'.",
          inputSchema: {
            type: "object",
            properties: {
              host: {
                type: "string",
                description: "Host to connect to (optional, if not provided the command will be executed locally)"
              },
              username: {
                type: "string",
                description: "Username for SSH connection (required when host is specified)"
              },
              session: {
                type: "string",
                description: "Session name, defaults to 'default'. Reuse to persist state.",
                default: "default"
              },
              command: {
                type: "string",
                description: "Command to execute."
              },
              env: {
                type: "object",
                description: "Environment variables to set.",
                default: {}
              },
              workingDirectory: {
                type: "string",
                description: "Working directory for command execution."
              },
              timeout: {
                type: "number",
                description: "Command timeout in milliseconds (default: 30000)",
                default: 30000
              }
            },
            required: ["command"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (request.params.name !== "execute_command") {
        throw new McpError(ErrorCode.MethodNotFound, "Unknown tool");
      }
      
      const host = request.params.arguments?.host ? String(request.params.arguments.host) : undefined;
      const username = request.params.arguments?.username ? String(request.params.arguments.username) : undefined;
      const session = String(request.params.arguments?.session || "default");
      const command = String(request.params.arguments?.command);
      const workingDirectory = request.params.arguments?.workingDirectory ? String(request.params.arguments.workingDirectory) : undefined;
      const timeout = request.params.arguments?.timeout ? Number(request.params.arguments.timeout) : 30000;
      
      if (!command) {
        throw new McpError(ErrorCode.InvalidParams, "Command is required");
      }
      
      const env = request.params.arguments?.env || {};

      // Validate parameters
      if (host && !username) {
        throw new McpError(ErrorCode.InvalidParams, "Username is required when host is specified");
      }
      
      if (timeout && (timeout < 1000 || timeout > 300000)) {
        throw new McpError(ErrorCode.InvalidParams, "Timeout must be between 1000 and 300000 milliseconds");
      }

      try {
        const result = await commandExecutor.executeCommand(command, {
          host,
          username,
          session,
          env: env as Record<string, string>,
          workingDirectory,
          timeout
        });
        
        // Strict JSON response format
        const response = {
          command,
          exitCode: result.exitCode || 0,
          stdout: result.stdout,
          stderr: result.stderr,
          workingDirectory: workingDirectory || (host ? undefined : process.cwd())
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error) {
        if (error instanceof CommandExecutionError) {
          // Even if there is an error (like non-zero exit code if caught by exec), return structured data if available
          if (error.stdout || error.stderr) {
             const response = {
              command,
              exitCode: error.exitCode || 1,
              stdout: error.stdout || "",
              stderr: error.stderr || error.message,
              error: error.message
            };
            return {
               content: [{
                type: "text",
                text: JSON.stringify(response, null, 2)
              }]
            };
          }
           throw new McpError(ErrorCode.InternalError, `Command failed: ${error.message}`);
        }
        
        if (error instanceof TimeoutError) {
           throw new McpError(ErrorCode.InternalError, `Timeout: ${error.message}`);
        }
        
        if (error instanceof SshConnectionError) {
           throw new McpError(ErrorCode.InternalError, `SSH Error: ${error.message}`);
        }

        if (error instanceof Error) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  // Resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "terminal://sessions/status",
          name: "Terminal Sessions Status",
          description: "Current status of active terminal sessions including working directories, environment variables, and connection health",
          mimeType: "application/json",
        },
        {
          uri: "terminal://system/info",
          name: "System Information",
          description: "Basic system information including OS, architecture, and available shell environments",
          mimeType: "application/json",
        },
        {
          uri: "terminal://tmux/info",
          name: "Tmux Information",
          description: "Tmux availability, version, and server statistics including active sessions, windows, and panes",
          mimeType: "application/json",
        },
        {
          uri: "terminal://tmux/sessions",
          name: "Tmux Sessions",
          description: "List of all active tmux sessions with window counts, creation dates, and attachment status",
          mimeType: "application/json",
        },
        {
          uri: "terminal://tmux/windows/{session}",
          name: "Tmux Windows",
          description: "List of windows within a specific tmux session with activity indicators and layout information",
          mimeType: "application/json",
        },
        {
          uri: "terminal://tmux/panes/{session}",
          name: "Tmux Panes",
          description: "List of panes within a tmux session or specific window with size, history, and activity status",
          mimeType: "application/json",
        },
        {
          uri: "terminal://tmux/panes/{session}/{window}",
          name: "Tmux Panes in Window",
          description: "List of panes within a specific tmux window with detailed pane information",
          mimeType: "application/json",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    switch (uri) {
      case "terminal://sessions/status":
        try {
          const sessionStatus = await commandExecutor.getSessionStatus();
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(sessionStatus, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to retrieve session status: ${error instanceof Error ? error.message : String(error)}`
          );
        }

      case "terminal://system/info":
        try {
          const systemInfo = {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cwd: process.cwd(),
            env: {
              SHELL: process.env.SHELL,
              USER: process.env.USER || process.env.USERNAME,
              HOME: process.env.HOME || process.env.USERPROFILE,
            },
            timestamp: new Date().toISOString(),
          };
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(systemInfo, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to retrieve system information: ${error instanceof Error ? error.message : String(error)}`
          );
        }

      case "terminal://tmux/info":
        try {
          const tmuxInfo = await commandExecutor.getTmuxInfo();
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(tmuxInfo, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to retrieve tmux information: ${error instanceof Error ? error.message : String(error)}`
          );
        }

      case "terminal://tmux/sessions":
        try {
          const tmuxSessions = await commandExecutor.getTmuxSessions();
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(tmuxSessions, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to retrieve tmux sessions: ${error instanceof Error ? error.message : String(error)}`
          );
        }

      default:
        // Handle parameterized tmux resources
        if (uri.startsWith("terminal://tmux/windows/")) {
          const sessionName = uri.replace("terminal://tmux/windows/", "");
          if (!sessionName) {
            throw new McpError(ErrorCode.InvalidRequest, "Session name is required for tmux windows resource");
          }

          try {
            const tmuxWindows = await commandExecutor.getTmuxWindows(sessionName);
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(tmuxWindows, null, 2),
                },
              ],
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to retrieve tmux windows for session '${sessionName}': ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        if (uri.startsWith("terminal://tmux/panes/")) {
          const pathParts = uri.replace("terminal://tmux/panes/", "").split("/");
          const sessionName = pathParts[0];
          const windowIndex = pathParts[1] ? parseInt(pathParts[1], 10) : undefined;

          if (!sessionName) {
            throw new McpError(ErrorCode.InvalidRequest, "Session name is required for tmux panes resource");
          }

          try {
            const tmuxPanes = await commandExecutor.getTmuxPanes(sessionName, windowIndex);
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(tmuxPanes, null, 2),
                },
              ],
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to retrieve tmux panes for session '${sessionName}'${windowIndex !== undefined ? ` window ${windowIndex}` : ''}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }
  });

  return server;
}

async function main() {
  try {
    // Standard I/O setup
    const server = createServer();
    
    // MCP Error handling
    server.onerror = (error) => {
      log.error(`MCP Error: ${error.message}`);
    };
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log.info("Remote Ops MCP server running on stdio");

    // Handle process signals for graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      log.info(`Received ${signal}, shutting down server gracefully...`);
      try {
        await commandExecutor.disconnect();
        log.info("Server shutdown complete");
        process.exit(0);
      } catch (error) {
        log.error(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log.error(`Uncaught exception: ${error.message}`);
      if (error.stack) {
        log.error(error.stack);
      }
      gracefulShutdown('uncaughtException');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      log.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
      gracefulShutdown('unhandledRejection');
    });
  } catch (error) {
    log.error("Server error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error("Server error:", error);
  process.exit(1);
});
