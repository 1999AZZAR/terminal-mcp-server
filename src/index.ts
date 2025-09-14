#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { CommandExecutor } from "./executor.js";

// 全局日志函数，确保所有日志都通过stderr输出
export const log = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG === 'true') {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    console.error(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.error(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};

const commandExecutor = new CommandExecutor();

// 创建服务器
function createServer() {
  const server = new Server(
    {
      name: "remote-ops-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "execute_command",
          description: "Execute commands on remote hosts or locally with enhanced error handling, session management, and working directory support",
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
                description: "Session name, defaults to 'default'. The same session name will reuse the same terminal environment for 20 minutes, which is useful for operations requiring specific environments like conda.",
                default: "default"
              },
              command: {
                type: "string",
                description: "Command to execute. Before running commands, it's best to determine the system type (Mac, Linux, etc.)"
              },
              env: {
                type: "object",
                description: "Environment variables to set for the command execution",
                default: {}
              },
              workingDirectory: {
                type: "string",
                description: "Working directory for command execution (optional)"
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
        
        // Format output with exit code information
        let outputText = `Command: ${command}\n`;
        if (workingDirectory) {
          outputText += `Working Directory: ${workingDirectory}\n`;
        }
        outputText += `Exit Code: ${result.exitCode || 0}\n\n`;
        outputText += `STDOUT:\n${result.stdout}\n\n`;
        if (result.stderr) {
          outputText += `STDERR:\n${result.stderr}\n`;
        }
        
        return {
          content: [{
            type: "text",
            text: outputText
          }]
        };
      } catch (error) {
        if (error instanceof Error) {
          let errorMessage = error.message;
          
          // Provide more specific error messages
          if (error.message.includes('SSH')) {
            errorMessage = `SSH connection error: ${error.message}. Please ensure SSH key-based authentication is set up.`;
          } else if (error.message.includes('timeout')) {
            errorMessage = `Command execution timed out after ${timeout}ms. The command may still be running on the remote host.`;
          } else if (error.message.includes('ENOENT')) {
            errorMessage = `SSH key not found. Please ensure SSH key-based authentication is set up at ~/.ssh/id_rsa.`;
          }
          
          throw new McpError(ErrorCode.InternalError, errorMessage);
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

  return server;
}

async function main() {
  try {
    // 使用标准输入输出
    const server = createServer();
    
    // 设置MCP错误处理程序
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
