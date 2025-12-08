/**
 * @termai/pty-service
 *
 * Shared PTY management service for TermAI.
 * Provides a unified interface for managing pseudo-terminal sessions.
 *
 * This package is used by both the Electron main process and the web server.
 */

import type {
  PTYSession,
  PTYSpawnOptions,
  PTYResizeOptions,
} from '@termai/shared-types';

// Re-export types for convenience
export type { PTYSession, PTYSpawnOptions, PTYResizeOptions };

/**
 * PTYManager - Manages multiple PTY sessions
 *
 * Usage:
 * ```typescript
 * import { PTYManager } from '@termai/pty-service';
 * import * as pty from 'node-pty';
 *
 * const manager = new PTYManager(pty);
 * const session = manager.spawn({ cwd: '/home/user' });
 * ```
 */
export class PTYManager {
  private sessions: Map<string, PTYSession> = new Map();
  private ptyModule: typeof import('node-pty') | null = null;
  private ptyProcesses: Map<string, import('node-pty').IPty> = new Map();

  constructor(ptyModule?: typeof import('node-pty')) {
    this.ptyModule = ptyModule ?? null;
  }

  /**
   * Set the node-pty module (for lazy loading)
   */
  setPtyModule(ptyModule: typeof import('node-pty')): void {
    this.ptyModule = ptyModule;
  }

  /**
   * Spawn a new PTY session
   */
  spawn(options: PTYSpawnOptions = {}): PTYSession {
    if (!this.ptyModule) {
      throw new Error('PTY module not initialized. Call setPtyModule() first.');
    }

    const id = crypto.randomUUID();
    const shell = options.shell ?? this.getDefaultShell();
    const args = options.args ?? [];
    const cwd = options.cwd ?? process.cwd();
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;

    const ptyProcess = this.ptyModule.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: options.env ?? (process.env as Record<string, string>),
    });

    const session: PTYSession = {
      id,
      pid: ptyProcess.pid,
      cwd,
      active: true,
    };

    this.sessions.set(id, session);
    this.ptyProcesses.set(id, ptyProcess);

    return session;
  }

  /**
   * Write data to a PTY session
   */
  write(sessionId: string, data: string): void {
    const ptyProcess = this.ptyProcesses.get(sessionId);
    if (!ptyProcess) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    ptyProcess.write(data);
  }

  /**
   * Resize a PTY session
   */
  resize(sessionId: string, options: PTYResizeOptions): void {
    const ptyProcess = this.ptyProcesses.get(sessionId);
    if (!ptyProcess) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    ptyProcess.resize(options.cols, options.rows);
  }

  /**
   * Kill a PTY session
   */
  kill(sessionId: string): void {
    const ptyProcess = this.ptyProcesses.get(sessionId);
    if (ptyProcess) {
      ptyProcess.kill();
    }
    this.sessions.delete(sessionId);
    this.ptyProcesses.delete(sessionId);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): PTYSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Register event handlers for a PTY session
   */
  onData(sessionId: string, callback: (data: string) => void): void {
    const ptyProcess = this.ptyProcesses.get(sessionId);
    if (!ptyProcess) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    ptyProcess.onData(callback);
  }

  /**
   * Register exit handler for a PTY session
   */
  onExit(sessionId: string, callback: (exitCode: number) => void): void {
    const ptyProcess = this.ptyProcesses.get(sessionId);
    if (!ptyProcess) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    ptyProcess.onExit(({ exitCode }) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.active = false;
      }
      callback(exitCode);
    });
  }

  /**
   * Destroy all sessions (cleanup)
   */
  destroyAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.kill(sessionId);
    }
  }

  /**
   * Get default shell for the current platform
   */
  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC ?? 'cmd.exe';
    }
    return process.env.SHELL ?? '/bin/bash';
  }
}

// Default export for convenience
export default PTYManager;
