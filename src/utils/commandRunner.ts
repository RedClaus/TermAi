/**
 * Command Runner
 * Executes shell commands via the backend server
 */

import { config } from "../config";
import type { CommandResult } from "../types";

export interface ExecuteResult extends CommandResult {
  newCwd?: string;
  warning?: {
    risk: string;
    description: string;
  };
}

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
