/**
 * PTYAdapter - Unified PTY interface for TermAI
 *
 * Provides abstraction over node-pty that can optionally use @termai/pty-service.
 * This allows the same code to work in both web server and Electron contexts.
 *
 * Design Goals:
 * - Backward compatible: Falls back to direct node-pty by default
 * - Forward compatible: Can use @termai/pty-service when available
 * - Transparent API: Same interface regardless of underlying implementation
 * - Session management: Tracks multiple PTY sessions
 *
 * Usage:
 * ```javascript
 * const { PTYAdapter } = require('./services/PTYAdapter');
 *
 * // Create adapter (auto-detects if pty-service is available)
 * const ptyAdapter = new PTYAdapter({ usePtyService: false });
 *
 * // Spawn a PTY session
 * const ptyProcess = ptyAdapter.spawn('session-1', {
 *   shell: '/bin/zsh',
 *   cwd: '/home/user',
 *   cols: 80,
 *   rows: 24
 * });
 *
 * // Attach handlers
 * ptyProcess.onData((data) => console.log(data));
 * ptyProcess.onExit(({ exitCode }) => console.log('Exit:', exitCode));
 *
 * // Write data
 * ptyAdapter.write('session-1', 'ls -la\r');
 *
 * // Resize
 * ptyAdapter.resize('session-1', 100, 30);
 *
 * // Kill session
 * ptyAdapter.kill('session-1');
 * ```
 */

const pty = require('node-pty');
const os = require('os');

/**
 * PTYAdapter class - manages PTY sessions with pluggable backends
 */
class PTYAdapter {
  /**
   * Create a new PTY adapter
   * @param {Object} options - Configuration options
   * @param {boolean} options.usePtyService - Whether to use @termai/pty-service (if available)
   * @param {string} options.defaultShell - Default shell to use
   * @param {string} options.defaultCwd - Default working directory
   */
  constructor(options = {}) {
    this.sessions = new Map();
    this.usePtyService = options.usePtyService || false;
    this.defaultShell = options.defaultShell || null;
    this.defaultCwd = options.defaultCwd || null;
    this.ptyService = null;

    // Try to load pty-service if requested
    if (this.usePtyService) {
      try {
        this.ptyService = require('@termai/pty-service');
        console.log('[PTYAdapter] Using @termai/pty-service');
      } catch (e) {
        console.warn('[PTYAdapter] @termai/pty-service not available, using direct node-pty');
        this.usePtyService = false;
      }
    } else {
      console.log('[PTYAdapter] Using direct node-pty (default)');
    }
  }

  /**
   * Get default shell for the current platform
   * @returns {string} Path to default shell
   */
  getDefaultShell() {
    if (this.defaultShell) {
      return this.defaultShell;
    }

    // Windows
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }

    // Unix-like systems - prefer $SHELL env var
    if (process.env.SHELL) {
      return process.env.SHELL;
    }

    // Fallback: Try common shell paths
    const fs = require('fs');
    const shellPaths = [
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
      '/usr/bin/zsh',
      '/usr/bin/bash',
      '/usr/bin/sh',
      '/usr/local/bin/zsh',
      '/usr/local/bin/bash',
    ];

    for (const shell of shellPaths) {
      if (fs.existsSync(shell)) {
        return shell;
      }
    }

    // Last resort
    return '/bin/sh';
  }

  /**
   * Get default working directory
   * @returns {string} Path to default cwd
   */
  getDefaultCwd() {
    if (this.defaultCwd) {
      return this.defaultCwd;
    }
    return process.env.HOME || os.homedir();
  }

  /**
   * Spawn a new PTY session
   * @param {string} sessionId - Unique identifier for this session
   * @param {Object} options - PTY spawn options
   * @param {string} [options.shell] - Shell to use (defaults to platform shell)
   * @param {string} [options.cwd] - Working directory
   * @param {number} [options.cols=80] - Terminal columns
   * @param {number} [options.rows=24] - Terminal rows
   * @param {Object} [options.env] - Environment variables
   * @returns {Object} PTY process object with onData, onExit, write, resize, kill methods
   */
  spawn(sessionId, options = {}) {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const shell = options.shell || this.getDefaultShell();
    const cwd = options.cwd || this.getDefaultCwd();
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const env = {
      ...process.env,
      ...options.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    let ptyProcess;

    if (this.usePtyService && this.ptyService) {
      // Use @termai/pty-service (future implementation)
      // This is a placeholder for when pty-service is implemented
      ptyProcess = this.ptyService.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });
    } else {
      // Use direct node-pty (current implementation)
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });
    }

    // Store session metadata
    this.sessions.set(sessionId, {
      pty: ptyProcess,
      cwd,
      shell,
      cols,
      rows,
      pid: ptyProcess.pid,
      createdAt: Date.now(),
    });

    console.log(`[PTYAdapter] Spawned session ${sessionId}: ${shell} (pid: ${ptyProcess.pid})`);

    return ptyProcess;
  }

  /**
   * Write data to a PTY session
   * @param {string} sessionId - Session identifier
   * @param {string} data - Data to write
   * @returns {boolean} True if write succeeded, false if session not found
   */
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session?.pty) {
      session.pty.write(data);
      return true;
    }
    console.warn(`[PTYAdapter] Cannot write to session ${sessionId}: not found`);
    return false;
  }

  /**
   * Resize a PTY session
   * @param {string} sessionId - Session identifier
   * @param {number} cols - New column count
   * @param {number} rows - New row count
   * @returns {boolean} True if resize succeeded, false if session not found
   */
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (session?.pty) {
      try {
        session.pty.resize(cols, rows);
        session.cols = cols;
        session.rows = rows;
        return true;
      } catch (e) {
        console.warn(`[PTYAdapter] Resize failed for session ${sessionId}:`, e.message);
        return false;
      }
    }
    console.warn(`[PTYAdapter] Cannot resize session ${sessionId}: not found`);
    return false;
  }

  /**
   * Kill a PTY session
   * @param {string} sessionId - Session identifier
   * @param {string} [signal='SIGHUP'] - Signal to send
   * @returns {boolean} True if kill succeeded, false if session not found
   */
  kill(sessionId, signal = 'SIGHUP') {
    const session = this.sessions.get(sessionId);
    if (session?.pty) {
      try {
        session.pty.kill(signal);
        this.sessions.delete(sessionId);
        console.log(`[PTYAdapter] Killed session ${sessionId}`);
        return true;
      } catch (e) {
        console.warn(`[PTYAdapter] Kill failed for session ${sessionId}:`, e.message);
        this.sessions.delete(sessionId); // Clean up anyway
        return false;
      }
    }
    console.warn(`[PTYAdapter] Cannot kill session ${sessionId}: not found`);
    return false;
  }

  /**
   * Get a PTY session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session object or null if not found
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get the PTY process for a session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} PTY process or null if not found
   */
  getPtyProcess(sessionId) {
    const session = this.sessions.get(sessionId);
    return session?.pty || null;
  }

  /**
   * Check if a session exists
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if session exists
   */
  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active session IDs
   * @returns {string[]} Array of session IDs
   */
  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session metadata
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session metadata or null if not found
   */
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      pid: session.pid,
      createdAt: session.createdAt,
      uptime: Date.now() - session.createdAt,
    };
  }

  /**
   * Get all sessions metadata
   * @returns {Object[]} Array of session info objects
   */
  getAllSessionsInfo() {
    return this.getActiveSessions().map(id => this.getSessionInfo(id));
  }

  /**
   * Destroy all sessions (cleanup on shutdown)
   */
  destroyAll() {
    console.log(`[PTYAdapter] Destroying all sessions (${this.sessions.size} active)`);
    for (const [id, session] of this.sessions) {
      if (session.pty) {
        try {
          session.pty.kill();
        } catch (e) {
          console.warn(`[PTYAdapter] Error killing session ${id}:`, e.message);
        }
      }
    }
    this.sessions.clear();
    console.log('[PTYAdapter] All sessions destroyed');
  }

  /**
   * Check if using pty-service backend
   * @returns {boolean} True if using pty-service
   */
  isUsingPtyService() {
    return this.usePtyService && this.ptyService !== null;
  }

  /**
   * Get adapter statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      backend: this.isUsingPtyService() ? '@termai/pty-service' : 'node-pty',
      sessions: this.getAllSessionsInfo(),
    };
  }
}

/**
 * Create a singleton PTYAdapter instance (optional convenience export)
 * Use this if you want a shared adapter across your application
 */
let defaultAdapter = null;

function getDefaultAdapter(options = {}) {
  if (!defaultAdapter) {
    defaultAdapter = new PTYAdapter(options);
  }
  return defaultAdapter;
}

module.exports = {
  PTYAdapter,
  getDefaultAdapter,
};
