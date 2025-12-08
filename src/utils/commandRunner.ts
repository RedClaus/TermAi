/**
 * Command Runner
 * Executes shell commands via the backend server
 * Handles routing to background terminals for long-running processes
 */

import { config } from "../config";
import type { CommandResult } from "../types";
import { BackgroundTerminalService, type TerminalType } from "../services/BackgroundTerminalService";

export interface ExecuteResult extends CommandResult {
  newCwd?: string;
  warning?: {
    risk: string;
    description: string;
  };
  cwdFallback?: {
    originalPath: string;
    serverPath: string;
    reason: string;
  };
  backgroundTerminalId?: string;
  terminalType?: TerminalType;
}

/**
 * Detect if a command should run in background or interactive terminal
 */
export const detectCommandType = (command: string): TerminalType => {
  return BackgroundTerminalService.detectCommandType(command);
};

/**
 * Execute a command in a background terminal
 * Returns immediately with the terminal ID
 */
export const executeInBackground = async (
  command: string,
  cwd: string,
  options: { name?: string | undefined; sessionId?: string | undefined } = {}
): Promise<{ terminalId: string; type: TerminalType }> => {
  const spawnOptions: { name?: string; sessionId?: string } = {};
  if (options.name !== undefined) spawnOptions.name = options.name;
  if (options.sessionId !== undefined) spawnOptions.sessionId = options.sessionId;
  
  const terminal = await BackgroundTerminalService.spawn(command, cwd, spawnOptions);
  
  return {
    terminalId: terminal.id,
    type: terminal.type,
  };
};

/**
 * Execute a shell command
 */
export const executeCommand = async (
  command: string,
  cwd: string,
  commandId?: string,
  sessionId?: string,
): Promise<ExecuteResult> => {
  try {
    const response = await fetch(config.getApiUrl(config.api.execute), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command, cwd, commandId, sessionId }),
    });

    if (!response.ok) {
      // Handle specific error cases
      if (response.status === 403) {
        const error = await response.json();
        return {
          output: `Command blocked: ${error.description || error.error}\nRisk level: ${error.risk || "unknown"}`,
          exitCode: 1,
        };
      }

      if (response.status === 429) {
        const error = await response.json();
        return {
          output: `Rate limited. Please wait ${error.retryAfter || 60} seconds before trying again.`,
          exitCode: 1,
        };
      }

      throw new Error(`Server error: ${response.statusText}`);
    }

    const result = await response.json();

    // Log warning if present (but still allow execution)
    if (result.warning) {
      console.warn(
        `[Security Warning] ${result.warning.description} (Risk: ${result.warning.risk})`,
      );
    }

    return result;
  } catch (error) {
    console.error("Command execution failed:", error);
    return {
      output: `Error connecting to local terminal: ${(error as Error).message}. Make sure the backend server is running.`,
      exitCode: 1,
    };
  }
};

/**
 * Cancel a running command
 */
export const cancelCommand = async (commandId: string): Promise<boolean> => {
  try {
    const response = await fetch(config.getApiUrl(config.api.cancel), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commandId }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to cancel command:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to cancel command:", error);
    return false;
  }
};

/**
 * Check server health
 */
export const checkServerHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(config.getApiUrl("/api/health"));
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Smart execute - automatically routes to background terminal if needed
 * Returns inline result for simple commands, or background terminal info for long-running ones
 */
export const smartExecute = async (
  command: string,
  cwd: string,
  options: {
    commandId?: string;
    sessionId?: string;
    forceBackground?: boolean;
    forceInline?: boolean;
  } = {}
): Promise<ExecuteResult> => {
  const { commandId, sessionId, forceBackground, forceInline } = options;
  
  // Detect command type unless forced
  const commandType = forceInline ? 'inline' : 
                      forceBackground ? 'background' : 
                      detectCommandType(command);
  
  // For inline commands, use traditional execution
  if (commandType === 'inline') {
    return executeCommand(command, cwd, commandId, sessionId);
  }
  
  // For background/interactive commands, spawn in background terminal
  const bgOptions: { sessionId?: string } = {};
  if (sessionId !== undefined) bgOptions.sessionId = sessionId;
  
  const { terminalId, type } = await executeInBackground(command, cwd, bgOptions);
  
  return {
    output: `Started ${type} terminal: ${terminalId}\nCommand: ${command}\nUse the Background Terminals panel to monitor progress.`,
    exitCode: 0,
    backgroundTerminalId: terminalId,
    terminalType: type,
  };
};
