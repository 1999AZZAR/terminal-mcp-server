import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { log } from './logger.js';

// Custom Error Classes
export class CommandExecutionError extends Error {
  constructor(message: string, public exitCode?: number, public stdout?: string, public stderr?: string) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class SshConnectionError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'SshConnectionError';
  }
}

export class CommandExecutor {
  private sessions: Map<string, {
    client: Client | null;
    connection: Promise<void> | null;
    timeout: NodeJS.Timeout | null;
    host?: string;
    username?: string;
    env?: Record<string, string>;
    shell?: any;
    shellReady?: boolean;
    workingDirectory?: string;
    lastActivity?: number;
    retryCount?: number;
    maxRetries?: number;
  }> = new Map();
  
  private sessionTimeout: number = 20 * 60 * 1000; // 20 minutes
  private maxRetries: number = 3;
  private connectionTimeout: number = 30000; // 30 seconds

  constructor() {}

  private getSessionKey(host: string | undefined, sessionName: string): string {
    return `${host || 'local'}-${sessionName}`;
  }

  async connect(host: string, username: string, sessionName: string = 'default'): Promise<void> {
    const sessionKey = this.getSessionKey(host, sessionName);
    let session = this.sessions.get(sessionKey);
    
    // Check if session exists and is still valid
    if (session?.connection && session?.client && await this.isConnectionHealthy(session.client)) {
      log.info(`Reusing existing healthy session: ${sessionKey}`);
      this.updateActivity(sessionKey);
      return session.connection;
    }
    
    // Clean up invalid session
    if (session) {
      log.info(`Session ${sessionKey} is invalid, cleaning up and creating new session`);
      await this.disconnectSession(sessionKey);
    }

    // Attempt connection with retry logic
    return this.connectWithRetry(host, username, sessionName);
  }

  private async isConnectionHealthy(client: Client): Promise<boolean> {
    return new Promise((resolve) => {
      if (!client) {
        resolve(false);
        return;
      }
      
      // Check if client has active listeners (indicating it's still connected)
      const hasActiveListeners = client.listenerCount('ready') > 0 || 
                                client.listenerCount('error') > 0 ||
                                client.listenerCount('data') > 0;
      
      if (!hasActiveListeners) {
        resolve(false);
        return;
      }
      
      // Try to send a keepalive to test the connection
      try {
        client.subsys('echo', (err, stream) => {
          if (err) {
            log.debug(`Connection health check failed: ${err.message}`);
            resolve(false);
            return;
          }
          
          stream.on('data', () => {
            stream.close();
            resolve(true);
          });
          
          stream.on('error', () => {
            resolve(false);
          });
          
          stream.write('health-check');
          stream.end();
        });
      } catch (error) {
        log.debug(`Connection health check error: ${error}`);
        resolve(false);
      }
    });
  }

  private async connectWithRetry(host: string, username: string, sessionName: string): Promise<void> {
    const sessionKey = this.getSessionKey(host, sessionName);
    let retryCount = 0;
    const maxRetries = this.maxRetries;

    while (retryCount < maxRetries) {
      try {
        log.info(`Attempting connection to ${host} (attempt ${retryCount + 1}/${maxRetries})`);
        await this.establishConnection(host, username, sessionName);
        log.info(`Successfully connected to ${host}`);
        return;
      } catch (error: any) {
        retryCount++;
        const isLastAttempt = retryCount >= maxRetries;
        
        log.error(`Connection attempt ${retryCount} failed: ${error.message}`);
          
        if (isLastAttempt) {
          throw new SshConnectionError(`Failed to connect to ${host} after ${maxRetries} attempts. Last error: ${error.message}`, error);
        }
        
        if (!isLastAttempt) {
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000); // Exponential backoff, max 10s
          log.info(`Retrying connection in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  private async establishConnection(host: string, username: string, sessionName: string): Promise<void> {
    const sessionKey = this.getSessionKey(host, sessionName);
    
    try {
      const privateKeyPath = process.env.SSH_KEY_PATH || path.join(os.homedir(), '.ssh', 'id_rsa');
      
      // Check if SSH key exists
      if (!fs.existsSync(privateKeyPath)) {
        throw new SshConnectionError(`SSH key not found at ${privateKeyPath}. Please ensure SSH key-based authentication is set up or set SSH_KEY_PATH environment variable.`);
      }
      
      const privateKey = fs.readFileSync(privateKeyPath);

      const client = new Client();
      const connection = new Promise<void>((resolve, reject) => {
        const connectionTimer = setTimeout(() => {
          reject(new TimeoutError(`Connection timeout after ${this.connectionTimeout}ms`));
          client.destroy();
        }, this.connectionTimeout);

        client
          .on('ready', () => {
            clearTimeout(connectionTimer);
            log.info(`SSH connection established for session: ${sessionKey}`);
            this.resetTimeout(sessionKey);
            
            // Create interactive shell
            client.shell({ term: 'xterm-256color' }, (err, stream) => {
              if (err) {
                log.error(`Failed to create interactive shell: ${err.message}`);
                reject(new SshConnectionError(`Failed to create shell: ${err.message}`));
                return;
              }
              
              log.info(`Interactive shell created for session ${sessionKey}`);
              
              // Update session with shell information
              const sessionData = this.sessions.get(sessionKey);
              if (sessionData) {
                sessionData.shell = stream;
                sessionData.shellReady = true;
                sessionData.workingDirectory = '/';
                this.sessions.set(sessionKey, sessionData);
              }
              
              // Handle shell events
              stream.on('close', () => {
                log.info(`Interactive shell closed for session ${sessionKey}`);
                const sessionData = this.sessions.get(sessionKey);
                if (sessionData) {
                  sessionData.shellReady = false;
                  this.sessions.set(sessionKey, sessionData);
                }
              });
              
              stream.on('error', (err: Error) => {
                log.error(`Shell error for session ${sessionKey}: ${err.message}`);
                const sessionData = this.sessions.get(sessionKey);
                if (sessionData) {
                  sessionData.shellReady = false;
                  this.sessions.set(sessionKey, sessionData);
                }
              });
              
              // Initialize shell
              stream.write('export PS1="$ "' + '\n');
              stream.write('echo "Shell ready"' + '\n');
              
              resolve();
            });
          })
          .on('error', (err) => {
            clearTimeout(connectionTimer);
            log.error(`SSH connection error for session ${sessionKey}: ${err.message}`);
            
            // Provide more specific error messages
            let errorMessage = err.message;
            if (err.message.includes('ECONNREFUSED')) {
              errorMessage = `Connection refused to ${host}. Check if SSH service is running and host is reachable.`;
            } else if (err.message.includes('ETIMEDOUT')) {
              errorMessage = `Connection timeout to ${host}. Check network connectivity and firewall settings.`;
            } else if (err.message.includes('ENOTFOUND')) {
              errorMessage = `Host ${host} not found. Check hostname or DNS resolution.`;
            } else if (err.message.includes('authentication')) {
              errorMessage = `Authentication failed for user ${username} on ${host}. Check SSH key permissions and user credentials.`;
            }
            
            reject(new SshConnectionError(errorMessage, err));
          })
          .connect({
            host: host,
            username: username,
            privateKey: privateKey,
            keepaliveInterval: 60000,
            readyTimeout: this.connectionTimeout,
            algorithms: {
              serverHostKey: ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256']
            }
          });
      });

      // Store session information
      this.sessions.set(sessionKey, {
        client,
        connection,
        timeout: null,
        host,
        username,
        shell: null,
        shellReady: false,
        workingDirectory: '/',
        lastActivity: Date.now(),
        retryCount: 0,
        maxRetries: this.maxRetries
      });

      return connection;
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new SshConnectionError(`SSH key file does not exist. Please ensure SSH key-based authentication is set up.`);
      }
      throw error;
    }
  }

  private updateActivity(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.lastActivity = Date.now();
      this.sessions.set(sessionKey, session);
      this.resetTimeout(sessionKey);
    }
  }

  /**
   * Safely removes matching quotes from the beginning and end of a string.
   */
  private removeMatchingQuotes(value: string): string {
    if (value.length < 2) {
      return value;
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];

    if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
      const quoteType = firstChar;
      const middle = value.slice(1, -1);
      if (!middle.includes(quoteType)) {
        return middle;
      }
    }

    return value;
  }

  private resetTimeout(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;

    if (session.timeout) {
      clearTimeout(session.timeout);
    }

    session.timeout = setTimeout(async () => {
      log.info(`Session ${sessionKey} timeout, disconnecting`);
      await this.disconnectSession(sessionKey);
    }, this.sessionTimeout);

    this.sessions.set(sessionKey, session);
  }

  async executeCommand(
    command: string,
    options: {
      host?: string;
      username?: string;
      session?: string;
      env?: Record<string, string>;
      workingDirectory?: string;
      timeout?: number;
    } = {}
  ): Promise<{stdout: string; stderr: string; exitCode?: number}> {
    const { 
      host, 
      username, 
      session = 'default', 
      env = {}, 
      workingDirectory,
      timeout = 30000 
    } = options;
    const sessionKey = this.getSessionKey(host, session);

    // Validate input
    if (!command || command.trim().length === 0) {
      throw new CommandExecutionError('Command cannot be empty');
    }

    // If host is specified, use SSH execution
    if (host) {
      if (!username) {
        throw new CommandExecutionError('Username is required when using SSH');
      }
      
      try {
        // Ensure we have a valid connection
        await this.connect(host, username, session);
        const sessionData = this.sessions.get(sessionKey);
        
        if (!sessionData || !sessionData.client) {
          throw new SshConnectionError(`Failed to establish SSH connection to ${host}`);
        }
        
        this.updateActivity(sessionKey);
        
        // Update working directory if specified
        if (workingDirectory && sessionData.workingDirectory !== workingDirectory) {
          await this.changeWorkingDirectory(sessionKey, workingDirectory);
        }

        // Execute command using the most appropriate method
        if (sessionData.shellReady && sessionData.shell) {
          log.info(`Executing command using interactive shell: ${command}`);
          return await this.executeWithShell(sessionKey, command, env, timeout);
        } else {
          log.info(`Executing command using exec: ${command}`);
          return await this.executeWithExec(sessionKey, command, env, timeout);
        }
      } catch (error: any) {
        log.error(`Command execution failed: ${error.message}`);
        throw error;
      }
    } 
    // Execute command locally
    else {
      log.info(`Executing command locally: ${command}`);
      return await this.executeLocally(sessionKey, command, env, workingDirectory, timeout);
    }
  }

  private async changeWorkingDirectory(sessionKey: string, newWorkingDirectory: string): Promise<void> {
    const sessionData = this.sessions.get(sessionKey);
    if (!sessionData || !sessionData.shellReady || !sessionData.shell) {
      return;
    }

    return new Promise((resolve, reject) => {
      const uniqueMarker = `CD_END_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      let output = '';
      let commandFinished = false;

      const dataHandler = (data: Buffer) => {
        const str = data.toString();
        output += str;
        
        if (str.includes(uniqueMarker)) {
          commandFinished = true;
          sessionData.shell.removeListener('data', dataHandler);
          sessionData.shell.removeListener('error', errorHandler);
          clearTimeout(timeout);
          
          // Update working directory in session
          sessionData.workingDirectory = newWorkingDirectory;
          this.sessions.set(sessionKey, sessionData);
          
          resolve();
        }
      };

      const errorHandler = (err: Error) => {
        sessionData.shell.removeListener('data', dataHandler);
        sessionData.shell.removeListener('error', errorHandler);
        clearTimeout(timeout);
        reject(err);
      };

      sessionData.shell.on('data', dataHandler);
      sessionData.shell.on('error', errorHandler);

      sessionData.shell.write(`cd "${newWorkingDirectory}" && pwd && echo "${uniqueMarker}"\n`);

      const timeout = setTimeout(() => {
        if (!commandFinished) {
          sessionData.shell.removeListener('data', dataHandler);
          sessionData.shell.removeListener('error', errorHandler);
          reject(new TimeoutError(`Working directory change timed out`));
        }
      }, 5000);
    });
  }

  private async executeWithShell(
    sessionKey: string, 
    command: string, 
    env: Record<string, string>, 
    timeout: number
  ): Promise<{stdout: string; stderr: string; exitCode?: number}> {
    const sessionData = this.sessions.get(sessionKey);
    if (!sessionData || !sessionData.shell) {
      throw new CommandExecutionError('Shell session not available');
    }

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let commandFinished = false;
      const uniqueMarker = `CMD_END_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Build environment variable setup
      const envSetup = Object.entries(env)
        .map(([key, value]) => `export ${key}="${String(value).replace(/"/g, '\\"')}"`)
        .join(' && ');
      
      // Build full command with environment variables
      const fullCommand = envSetup ? `${envSetup} && ${command}` : command;
      
      const dataHandler = (data: Buffer) => {
        const str = data.toString();
        log.debug(`Shell output: ${str}`);
        
        if (str.includes(uniqueMarker)) {
          commandFinished = true;
          
          // Extract command output more reliably
          const lines = stdout.split('\n');
          let commandOutput = '';
          let foundCommand = false;
          let exitCode = 0;
          
          for (const line of lines) {
            if (line.includes(`echo "Exit code: $?"`)) {
              const match = line.match(/Exit code: (\d+)/);
              if (match) {
                exitCode = parseInt(match[1], 10);
              }
              continue;
            }
            
            if (foundCommand) {
              if (line.includes(uniqueMarker)) {
                break;
              }
              commandOutput += line + '\n';
            } else if (line.includes(fullCommand) || line.includes(command)) {
              foundCommand = true;
            }
          }
          
          resolve({ 
            stdout: commandOutput.trim(), 
            stderr: stderr.trim(),
            exitCode: exitCode
          });
          
          sessionData.shell.removeListener('data', dataHandler);
          sessionData.shell.removeListener('error', errorHandler);
          clearTimeout(timeoutId);
        } else if (!commandFinished) {
          stdout += str;
        }
      };
      
      const errorHandler = (err: Error) => {
        stderr += err.message;
        sessionData.shell.removeListener('data', dataHandler);
        sessionData.shell.removeListener('error', errorHandler);
        clearTimeout(timeoutId);
        reject(new CommandExecutionError(err.message, undefined, stdout, stderr));
      };
      
      sessionData.shell.on('data', dataHandler);
      sessionData.shell.on('error', errorHandler);
      
      // Execute command with proper output capture
      sessionData.shell.write(`${fullCommand}; echo "Exit code: $?"\n`);
      sessionData.shell.write(`echo "${uniqueMarker}"\n`);
      
      const timeoutId = setTimeout(() => {
        if (!commandFinished) {
          stderr += "Command execution timed out";
          sessionData.shell.removeListener('data', dataHandler);
          sessionData.shell.removeListener('error', errorHandler);
          resolve({ stdout, stderr, exitCode: 124 }); // 124 is timeout exit code
        }
      }, timeout);
    });
  }

  private async executeWithExec(
    sessionKey: string, 
    command: string, 
    env: Record<string, string>, 
    timeout: number
  ): Promise<{stdout: string; stderr: string; exitCode?: number}> {
    const sessionData = this.sessions.get(sessionKey);
    if (!sessionData || !sessionData.client) {
      throw new CommandExecutionError('SSH client not available');
    }

    return new Promise((resolve, reject) => {
      // Build environment variable setup
      const envSetup = Object.entries(env)
        .map(([key, value]) => `export ${key}="${String(value).replace(/"/g, '\\"')}"`)
        .join(' && ');
      
      // Build full command with environment variables
      const fullCommand = envSetup ? `${envSetup} && ${command}` : command;
      
      if (!sessionData.client) {
        reject(new CommandExecutionError('SSH client not available'));
        return;
      }

      sessionData.client.exec(`/bin/bash --login -c "${fullCommand.replace(/"/g, '\\"')}"`, (err, stream) => {
        if (err) {
          reject(new CommandExecutionError(err.message));
          return;
        }

        let stdout = "";
        let stderr = '';
        let exitCode = 0;

        stream
          .on("data", (data: Buffer) => {
            this.updateActivity(sessionKey);
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          })
          .on('close', (code: number) => {
            exitCode = code;
            resolve({ stdout, stderr, exitCode });
          })
          .on('error', (err) => {
            reject(new CommandExecutionError(err.message, undefined, stdout, stderr));
          });

        // Set timeout for the entire operation
        setTimeout(() => {
          stream.close();
          resolve({ 
            stdout, 
            stderr: stderr + "Command execution timed out", 
            exitCode: 124 
          });
        }, timeout);
      });
    });
  }

  private async executeLocally(
    sessionKey: string, 
    command: string, 
    env: Record<string, string>, 
    workingDirectory?: string,
    timeout: number = 30000
  ): Promise<{stdout: string; stderr: string; exitCode?: number}> {
    // Get or create local session
    let sessionData = this.sessions.get(sessionKey);
    
    if (!sessionData) {
      sessionData = {
        client: null,
        connection: null,
        timeout: null,
        env: { ...env },
        workingDirectory: workingDirectory || process.cwd()
      };
      this.sessions.set(sessionKey, sessionData);
      log.info(`Creating new local session: ${sessionKey}`);
    } else {
      // Merge environment variables
      if (!sessionData.env) {
        sessionData.env = {};
      }
      sessionData.env = { ...sessionData.env, ...env };
      
      // Update working directory if specified
      if (workingDirectory) {
        sessionData.workingDirectory = workingDirectory;
      }
      
      this.sessions.set(sessionKey, sessionData);
    }
    
    this.resetTimeout(sessionKey);
    
    // Check if command is trying to set environment variables
    const exportMatch = command.match(/^\s*export\s+([^=;|&]+)=([^;|&]*)(?:\s*$|\s*;|\s*&&|\s*\|\|)/);
    if (exportMatch) {
      const [, varName, varValue] = exportMatch;
      
      // Check if there are additional commands after the export
      const hasChainedCommands = /^\s*export\s+[^=;|&]+=[^;|&]*\s*[;|&]/.test(command);
      
      if (hasChainedCommands) {
        log.info(`Export command with chained commands detected, executing normally: ${command}`);
      } else {
        const cleanValue = this.removeMatchingQuotes(varValue.trim());
        if (!sessionData.env) sessionData.env = {};
        sessionData.env[varName.trim()] = cleanValue;
        this.sessions.set(sessionKey, sessionData);
        log.info(`Set environment variable ${varName.trim()}=${cleanValue} in session ${sessionKey}`);
        
        return Promise.resolve({ 
          stdout: `Environment variable ${varName.trim()} set to ${cleanValue}`, 
          stderr: '', 
          exitCode: 0 
        });
      }
    }
    
    return new Promise((resolve, reject) => {
      const envVars = { ...process.env, ...sessionData.env };
      
      log.info(`Executing local command: ${command}`);
      const childProcess = exec(command, { 
        env: envVars,
        cwd: sessionData.workingDirectory,
        timeout: timeout
      }, (error, stdout, stderr) => {
        let exitCode = 0;
        if (error) {
           exitCode = typeof error.code === 'number' ? error.code : 1;
        }
        
        // Check for timeout: error.killed is true if process was killed by signal
        if (error && (error.killed || (error as any).code === 'ETIMEDOUT')) {
          resolve({ 
            stdout, 
            stderr: stderr + `\nCommand timed out after ${timeout}ms`, 
            exitCode: 124 
          });
        } else {
          resolve({ stdout, stderr, exitCode });
        }
      });

      childProcess.on('error', (error) => {
        reject(new CommandExecutionError(`Process error: ${error.message}`));
      });
    });
  }

  private async disconnectSession(sessionKey: string): Promise<void> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return;
    }

    try {
      log.info(`Disconnecting session: ${sessionKey}`);
      
      if (session.shell) {
        try {
          session.shell.end();
          session.shellReady = false;
        } catch (error) {
          log.warn(`Error closing shell: ${error}`);
        }
      }
      
      if (session.client) {
        try {
          session.client.end();
        } catch (error) {
          log.warn(`Error closing SSH client: ${error}`);
        }
      }
      
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      
      this.sessions.delete(sessionKey);
      log.info(`Successfully disconnected session: ${sessionKey}`);
    } catch (error) {
      log.error(`Error during session disconnection ${sessionKey}: ${error}`);
      this.sessions.delete(sessionKey);
    }
  }

  async disconnect(): Promise<void> {
    log.info(`Disconnecting all sessions...`);
    const sessionKeys = Array.from(this.sessions.keys());
    if (sessionKeys.length === 0) return;

    await Promise.allSettled(sessionKeys.map(k => this.disconnectSession(k)));
    this.sessions.clear();
    log.info(`All sessions disconnected`);
  }

  async getSessionStatus(): Promise<any> {
    const sessions = await Promise.all(Array.from(this.sessions.entries()).map(async ([sessionKey, session]) => {
      const isActive = session.client && session.connection;
      const isHealthy = isActive ? await this.isConnectionHealthy(session.client!) : false;
      const lastActivity = session.lastActivity ? new Date(session.lastActivity).toISOString() : null;

      return {
        sessionKey,
        host: session.host || 'local',
        username: session.username,
        isActive,
        isHealthy,
        workingDirectory: session.workingDirectory,
        environmentVariables: session.env ? Object.keys(session.env) : [],
        lastActivity,
        shellReady: session.shellReady || false,
      };
    }));

    const localSessions = sessions.filter(s => s.host === 'local');
    const remoteSessions = sessions.filter(s => s.host !== 'local');

    return {
      summary: {
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => s.isActive).length,
        localSessions: localSessions.length,
        remoteSessions: remoteSessions.length,
      },
      sessions: {
        local: localSessions,
        remote: remoteSessions,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Tmux-related methods
  async getTmuxSessions(options: { host?: string; username?: string; session?: string } = {}): Promise<any> {
    try {
      // Use -F for machine readable output
      // Format: session_name,windows_count,created_time,flags,attached
      const cmd = `tmux list-sessions -F "#{session_name},#{session_windows},#{session_created},#{session_flags},#{?session_attached,attached,detached}" 2>/dev/null || echo "No tmux sessions"`;
      const result = await this.executeCommand(cmd, options);
      const lines = result.stdout.trim().split('\n').filter(line => line && line !== 'No tmux sessions');

      const sessions = lines.map(line => {
        const parts = line.split(',');
        if (parts.length >= 5) {
          return {
            name: parts[0],
            windows: parseInt(parts[1], 10),
            created: new Date(parseInt(parts[2], 10) * 1000).toISOString(),
            flags: parts[3],
            attached: parts[4] === 'attached',
          };
        }
        return { raw: line };
      });

      return {
        sessions,
        count: sessions.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        sessions: [],
        count: 0,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getTmuxWindows(sessionName: string, options: { host?: string; username?: string; session?: string } = {}): Promise<any> {
    try {
      // Format: index,name,flags,active,last,zoomed
      const cmd = `tmux list-windows -t "${sessionName}" -F "#{window_index},#{window_name},#{window_flags},#{?window_active,true,false},#{?window_last,true,false},#{?window_zoomed_flag,true,false}" 2>/dev/null || echo "Session not found"`;
      const result = await this.executeCommand(cmd, options);

      if (result.stdout.includes('Session not found') || result.stdout.trim() === '') {
        return {
          session: sessionName,
          windows: [],
          count: 0,
          error: 'Session not found or no windows',
          timestamp: new Date().toISOString(),
        };
      }

      const lines = result.stdout.trim().split('\n').filter(line => line);
      const windows = lines.map(line => {
        const parts = line.split(',');
        if (parts.length >= 6) {
          return {
            index: parseInt(parts[0], 10),
            name: parts[1],
            flags: parts[2],
            active: parts[3] === 'true',
            last: parts[4] === 'true',
            zoomed: parts[5] === 'true',
          };
        }
        return { raw: line };
      });

      return {
        session: sessionName,
        windows,
        count: windows.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        session: sessionName,
        windows: [],
        count: 0,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getTmuxPanes(sessionName: string, windowIndex?: number, options: { host?: string; username?: string; session?: string } = {}): Promise<any> {
    try {
      const target = windowIndex !== undefined ? `${sessionName}:${windowIndex}` : sessionName;
      // Format: index,width,height,history_size,active
      const cmd = `tmux list-panes -t "${target}" -F "#{pane_index},#{pane_width},#{pane_height},#{history_size},#{?pane_active,true,false}" 2>/dev/null || echo "Window not found"`;
      const result = await this.executeCommand(cmd, options);

      if (result.stdout.includes('Window not found') || result.stdout.trim() === '') {
        return {
          session: sessionName,
          window: windowIndex,
          panes: [],
          count: 0,
          error: 'Window not found or no panes',
          timestamp: new Date().toISOString(),
        };
      }

      const lines = result.stdout.trim().split('\n').filter(line => line);
      const panes = lines.map(line => {
        const parts = line.split(',');
        if (parts.length >= 5) {
          return {
            index: parseInt(parts[0], 10),
            size: `${parts[1]}x${parts[2]}`,
            history: parseInt(parts[3], 10),
            active: parts[4] === 'true',
          };
        }
        return { raw: line };
      });

      return {
        session: sessionName,
        window: windowIndex,
        panes,
        count: panes.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        session: sessionName,
        window: windowIndex,
        panes: [],
        count: 0,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getTmuxInfo(options: { host?: string; username?: string; session?: string } = {}): Promise<any> {
    try {
      const tmuxCheck = await this.executeCommand('which tmux && tmux -V 2>/dev/null || echo "tmux not found"', options);
      let tmuxAvailable = false;
      let version = null;

      if (!tmuxCheck.stdout.includes('tmux not found') && tmuxCheck.stdout.trim()) {
        tmuxAvailable = true;
        const versionMatch = tmuxCheck.stdout.match(/tmux\s+(\d+\.\d+)/);
        if (versionMatch) {
          version = versionMatch[1];
        }
      }

      let serverInfo = null;
      if (tmuxAvailable) {
        try {
          const serverResult = await this.executeCommand('tmux display-message -p "#{version},#{server_sessions},#{server_windows},#{server_panes}" 2>/dev/null || echo "no server"', options);
          if (!serverResult.stdout.includes('no server')) {
            const parts = serverResult.stdout.trim().split(',');
            serverInfo = {
              version: parts[0],
              sessions: parseInt(parts[1], 10) || 0,
              windows: parseInt(parts[2], 10) || 0,
              panes: parseInt(parts[3], 10) || 0,
            };
          }
        } catch (e) {
          // Server info not available
        }
      }

      return {
        available: tmuxAvailable,
        version: version,
        serverInfo: serverInfo,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        available: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}