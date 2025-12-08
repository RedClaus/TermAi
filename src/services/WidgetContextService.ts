/**
 * WidgetContextService
 * Manages terminal context that can be shared with the AI
 * Inspired by WaveTerm's widget context awareness
 */

export interface TerminalContext {
  sessionId: string;
  cwd: string;
  gitBranch: string | null;
  gitStatus: string | null;
  recentOutput: string[];  // Last N command outputs
  recentCommands: string[]; // Last N commands
  lastExitCode: number | null;
  activeProcess: string | null;
  envHints: Record<string, string>; // Detected env variables like NODE_ENV
}

// Store context per session
const contextStore = new Map<string, TerminalContext>();

// Max items to keep in history
const MAX_RECENT_OUTPUT = 5;
const MAX_RECENT_COMMANDS = 10;
const MAX_OUTPUT_LENGTH = 2000; // Truncate long outputs

/**
 * WidgetContextService
 * Central service for managing terminal context that AI can access
 */
export class WidgetContextService {
  /**
   * Get or create context for a session
   */
  static getContext(sessionId: string): TerminalContext {
    if (!contextStore.has(sessionId)) {
      contextStore.set(sessionId, {
        sessionId,
        cwd: "~",
        gitBranch: null,
        gitStatus: null,
        recentOutput: [],
        recentCommands: [],
        lastExitCode: null,
        activeProcess: null,
        envHints: {},
      });
    }
    return contextStore.get(sessionId)!;
  }

  /**
   * Update CWD for a session
   */
  static updateCwd(sessionId: string, cwd: string): void {
    const ctx = this.getContext(sessionId);
    ctx.cwd = cwd;
    // Clear git info when directory changes - will be refreshed
    ctx.gitBranch = null;
    ctx.gitStatus = null;
  }

  /**
   * Update git information
   */
  static updateGitInfo(sessionId: string, branch: string | null, status?: string | null): void {
    const ctx = this.getContext(sessionId);
    ctx.gitBranch = branch;
    if (status !== undefined) {
      ctx.gitStatus = status;
    }
  }

  /**
   * Add command output to recent history
   */
  static addCommandOutput(
    sessionId: string, 
    command: string, 
    output: string, 
    exitCode: number
  ): void {
    const ctx = this.getContext(sessionId);
    
    // Truncate long outputs
    const truncatedOutput = output.length > MAX_OUTPUT_LENGTH 
      ? output.substring(0, MAX_OUTPUT_LENGTH) + "\n... [truncated]"
      : output;
    
    // Add to recent commands
    ctx.recentCommands.push(command);
    if (ctx.recentCommands.length > MAX_RECENT_COMMANDS) {
      ctx.recentCommands.shift();
    }
    
    // Add to recent output (store as formatted string)
    const outputEntry = `$ ${command}\n${truncatedOutput}\n[Exit: ${exitCode}]`;
    ctx.recentOutput.push(outputEntry);
    if (ctx.recentOutput.length > MAX_RECENT_OUTPUT) {
      ctx.recentOutput.shift();
    }
    
    ctx.lastExitCode = exitCode;
    
    // Detect env hints from output
    this.detectEnvHints(ctx, command, output);
  }

  /**
   * Set active process (for long-running commands)
   */
  static setActiveProcess(sessionId: string, process: string | null): void {
    const ctx = this.getContext(sessionId);
    ctx.activeProcess = process;
  }

  /**
   * Detect environment hints from command output
   */
  private static detectEnvHints(ctx: TerminalContext, command: string, output: string): void {
    // Detect Node.js projects
    if (command.includes("npm") || command.includes("node") || command.includes("yarn")) {
      ctx.envHints["runtime"] = "node";
    }
    
    // Detect Python projects
    if (command.includes("python") || command.includes("pip") || command.includes("venv")) {
      ctx.envHints["runtime"] = "python";
    }
    
    // Detect package managers from output
    if (output.includes("package.json")) {
      ctx.envHints["packageManager"] = "npm/yarn";
    }
    if (output.includes("requirements.txt") || output.includes("setup.py")) {
      ctx.envHints["packageManager"] = "pip";
    }
    
    // Detect git repos
    if (output.includes(".git") || command.startsWith("git ")) {
      ctx.envHints["vcs"] = "git";
    }
    
    // Detect Docker
    if (command.includes("docker") || output.includes("Dockerfile")) {
      ctx.envHints["container"] = "docker";
    }
  }

  /**
   * Build context string for AI prompt
   */
  static buildContextString(sessionId: string): string {
    const ctx = this.getContext(sessionId);
    const parts: string[] = [];
    
    parts.push(`## Terminal Context`);
    parts.push(`**Working Directory**: ${ctx.cwd}`);
    
    if (ctx.gitBranch) {
      parts.push(`**Git Branch**: ${ctx.gitBranch}`);
      if (ctx.gitStatus) {
        parts.push(`**Git Status**: ${ctx.gitStatus}`);
      }
    }
    
    if (ctx.activeProcess) {
      parts.push(`**Active Process**: ${ctx.activeProcess}`);
    }
    
    if (ctx.lastExitCode !== null) {
      parts.push(`**Last Exit Code**: ${ctx.lastExitCode}`);
    }
    
    // Add environment hints
    const hints = Object.entries(ctx.envHints);
    if (hints.length > 0) {
      parts.push(`**Detected Environment**: ${hints.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
    
    // Add recent terminal output (most recent last)
    if (ctx.recentOutput.length > 0) {
      parts.push(`\n### Recent Terminal Output (last ${ctx.recentOutput.length} commands):`);
      parts.push("```");
      parts.push(ctx.recentOutput.join("\n\n"));
      parts.push("```");
    }
    
    return parts.join("\n");
  }

  /**
   * Get summary for UI display
   */
  static getContextSummary(sessionId: string): {
    cwd: string;
    gitBranch: string | null;
    hasRecentOutput: boolean;
    commandCount: number;
  } {
    const ctx = this.getContext(sessionId);
    return {
      cwd: ctx.cwd,
      gitBranch: ctx.gitBranch,
      hasRecentOutput: ctx.recentOutput.length > 0,
      commandCount: ctx.recentCommands.length,
    };
  }

  /**
   * Clear context for a session
   */
  static clearContext(sessionId: string): void {
    contextStore.delete(sessionId);
  }

  /**
   * Clear all contexts
   */
  static clearAll(): void {
    contextStore.clear();
  }
}
