/**
 * Background Terminal Service
 * Manages background/long-running processes and interactive applications
 *
 * Architecture:
 * - Universal Bridge Pattern: Uses transport abstraction for cross-platform support
 * - Web mode: Uses Socket.IO (legacy) or REST + SSE (new)
 * - Electron mode: Uses IPC transport via useSystem hook
 * - Backward compatible: Falls back to Socket.IO if no transport provided
 */

import { io, type Socket } from 'socket.io-client';
import { config } from '../config';
import { emit } from '../events';
import type { PTYSpawnOptions, PTYResizeOptions } from '@termai/shared-types';

// Commands that should run in background (dev servers, builds, etc.)
const LONG_RUNNING_COMMANDS = [
  'npm run dev',
  'npm start',
  'npm run serve',
  'npm run watch',
  'yarn dev',
  'yarn start',
  'bun run dev',
  'bun dev',
  'pnpm dev',
  'node ',
  'python -m http.server',
  'python manage.py runserver',
  'python3 -m http.server',
  'python3 manage.py runserver',
  'python src/main.py',  // Common pattern for Python scripts
  'python3 src/main.py',
  'python main.py',
  'python3 main.py',
  'python app.py',
  'python3 app.py',
  'python server.py',
  'python3 server.py',
  'flask run',
  'uvicorn',
  'gunicorn',
  'hypercorn',
  'daphne',
  'cargo run',
  'cargo watch',
  'go run',
  'make watch',
  'docker compose up',
  'docker-compose up',
  'kubectl port-forward',
  'tail -f',
  'watch ',
  'nodemon',
  'ts-node-dev',
  'vite',
  'next dev',
  'gatsby develop',
  'hugo server',
  'jekyll serve',
  'php artisan serve',
  'rails server',
  'rails s',
  'mix phx.server',
];

// Interactive applications that need dedicated terminal
const INTERACTIVE_APPS = [
  'opencode',
  'vim',
  'nvim',
  'nano',
  'emacs',
  'htop',
  'top',
  'btop',
  'less',
  'more',
  'man ',
  'ssh ',
  'mysql',
  'psql',
  'mongo',
  'redis-cli',
  'python', // bare python starts REPL
  'node', // bare node starts REPL
  'irb',
  'rails console',
  'rails c',
  'iex',
  'ghci',
  'scala',
  'lein repl',
  'clj',
];

// Commands that may prompt for passwords or confirmations
// These need TTY to accept user input
const PASSWORD_PROMPTING_COMMANDS = [
  'sudo ',           // Privilege escalation
  'su ',             // Switch user
  'su',              // Switch user (to root)
  'passwd',          // Change password
  'ssh-keygen',      // Generate SSH keys (prompts for passphrase)
  'gpg --gen-key',   // Generate GPG key
  'gpg --full-gen',  // Generate GPG key
  'openssl ',        // May prompt for passphrases
  'cryptsetup',      // Disk encryption
  'mount ',          // May require password for certain mounts
  'kinit',           // Kerberos auth
  'docker login',    // Docker registry auth
  'npm login',       // NPM registry auth
  'gh auth login',   // GitHub CLI auth
  'gcloud auth',     // Google Cloud auth
  'aws configure',   // AWS CLI config
  'az login',        // Azure CLI login
  'git credential',  // Git credential helpers
  'read -s',         // Bash read with silent mode (password input)
  'expect',          // Expect scripts for automation
  'sshpass',         // SSH with password
  'apt install',     // May prompt for confirmation
  'apt upgrade',     // May prompt for confirmation
  'apt-get install', // May prompt for confirmation
  'dnf install',     // May prompt for confirmation
  'yum install',     // May prompt for confirmation
  'pacman -S',       // May prompt for confirmation
  'brew install',    // Homebrew (may ask for sudo password on Linux)
  'systemctl ',      // May require password for system services
  'useradd',         // User management
  'usermod',         // User management
  'userdel',         // User management
  'groupadd',        // Group management
  'chown ',          // May need sudo
  'chmod ',          // May need sudo for system files
];

export type TerminalType = 'inline' | 'background' | 'interactive';

/**
 * PTY Transport Interface - matches useSystem.pty API
 */
export interface PTYTransportInterface {
  spawn(options: PTYSpawnOptions): Promise<{ id: string; pid: number }>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, options: PTYResizeOptions): Promise<void>;
  kill(sessionId: string): Promise<void>;
  onData(sessionId: string, callback: (data: string) => void): () => void;
  onExit(sessionId: string, callback: (exitCode: number) => void): () => void;
}

export interface BackgroundTerminal {
  id: string;
  name: string;
  command: string;
  cwd: string;
  type: TerminalType;
  status: 'starting' | 'running' | 'stopped' | 'error';
  exitCode?: number;
  output: string[];
  startedAt: number;
  stoppedAt?: number;
  socket?: Socket; // Only used in legacy Socket.IO mode
  ptySessionId?: string; // Used when transport is provided
  unsubscribeData?: () => void; // Cleanup for data listener
  unsubscribeExit?: () => void; // Cleanup for exit listener
}

type TerminalEventCallback = (terminal: BackgroundTerminal) => void;

class BackgroundTerminalServiceClass {
  private terminals: Map<string, BackgroundTerminal> = new Map();
  private listeners: Map<string, Set<TerminalEventCallback>> = new Map();
  private outputListeners: Map<string, Set<(output: string) => void>> = new Map();
  private ptyTransport?: PTYTransportInterface;

  /**
   * Set the PTY transport (for dependency injection from React context)
   */
  setTransport(transport: PTYTransportInterface): void {
    this.ptyTransport = transport;
    console.log('[BackgroundTerminal] PTY transport configured');
  }

  /**
   * Strip environment variable assignments from command to get the actual command
   * e.g., "HOST=127.0.0.1 PORT=8000 python3 main.py" -> "python3 main.py"
   */
  private stripEnvVars(command: string): string {
    // Match env vars like VAR=value at the start
    const envVarPattern = /^(\s*[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s*)+/;
    return command.replace(envVarPattern, '').trim();
  }

  /**
   * Detect what type of terminal a command needs
   */
  detectCommandType(command: string): TerminalType {
    const trimmedCmd = command.trim().toLowerCase();
    // Also check without env var prefixes for commands like "PORT=3000 npm run dev"
    const cmdWithoutEnvVars = this.stripEnvVars(trimmedCmd);

    // Check for interactive apps first
    for (const app of INTERACTIVE_APPS) {
      const pattern = app.trim();
      if (trimmedCmd === pattern || trimmedCmd.startsWith(pattern) ||
          cmdWithoutEnvVars === pattern || cmdWithoutEnvVars.startsWith(pattern)) {
        return 'interactive';
      }
    }

    // Check for password-prompting commands (need TTY for input)
    for (const pattern of PASSWORD_PROMPTING_COMMANDS) {
      const pat = pattern.trim();
      if (trimmedCmd === pat || trimmedCmd.startsWith(pat) ||
          cmdWithoutEnvVars === pat || cmdWithoutEnvVars.startsWith(pat)) {
        return 'interactive';
      }
    }

    // Check for long-running commands (also check without env vars)
    for (const pattern of LONG_RUNNING_COMMANDS) {
      const pat = pattern.toLowerCase();
      if (trimmedCmd.includes(pat) || cmdWithoutEnvVars.includes(pat)) {
        return 'background';
      }
    }

    // Default to inline execution
    return 'inline';
  }

  /**
   * Spawn a new background/interactive terminal
   */
  async spawn(
    command: string,
    cwd: string,
    options: {
      name?: string;
      type?: TerminalType;
      sessionId?: string;
    } = {}
  ): Promise<BackgroundTerminal> {
    const id = `bg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const type = options.type || this.detectCommandType(command);
    const name = options.name || this.generateTerminalName(command);

    const terminal: BackgroundTerminal = {
      id,
      name,
      command,
      cwd,
      type,
      status: 'starting',
      output: [],
      startedAt: Date.now(),
    };

    this.terminals.set(id, terminal);
    this.emitEvent('spawn', terminal);

    try {
      // Use transport if available, otherwise fall back to Socket.IO
      if (this.ptyTransport) {
        await this.spawnWithTransport(terminal, command, cwd);
      } else {
        await this.spawnWithSocketIO(terminal, command, cwd);
      }
    } catch (error) {
      terminal.status = 'error';
      terminal.output.push(`Error: ${(error as Error).message}`);
      this.emitEvent('error', terminal);
    }

    return terminal;
  }

  /**
   * Spawn using PTY transport (new Universal Bridge pattern)
   */
  private async spawnWithTransport(
    terminal: BackgroundTerminal,
    command: string,
    cwd: string
  ): Promise<void> {
    if (!this.ptyTransport) {
      throw new Error('PTY transport not available');
    }

    console.log(`[BackgroundTerminal] Spawning via transport: ${terminal.id}`);

    // Spawn PTY session
    const result = await this.ptyTransport.spawn({
      shell: undefined, // Use default shell
      args: ['-c', command], // Run command via shell -c
      cwd,
      cols: 120,
      rows: 30,
    });

    terminal.ptySessionId = result.id;
    terminal.status = 'running';
    this.emitEvent('status', terminal);

    console.log(`[BackgroundTerminal] Spawned ${terminal.id} (PTY session: ${result.id}, PID: ${result.pid})`);

    // Subscribe to data events
    terminal.unsubscribeData = this.ptyTransport.onData(result.id, (data: string) => {
      terminal.output.push(data);
      // Keep last 10000 lines
      if (terminal.output.length > 10000) {
        terminal.output = terminal.output.slice(-10000);
      }
      this.emitOutput(terminal.id, data);

      // Emit event for UI updates
      emit('termai-background-output', { terminalId: terminal.id, output: data });
    });

    // Subscribe to exit events
    terminal.unsubscribeExit = this.ptyTransport.onExit(result.id, (exitCode: number) => {
      terminal.status = 'stopped';
      terminal.exitCode = exitCode;
      terminal.stoppedAt = Date.now();
      this.emitEvent('exit', terminal);

      emit('termai-background-exit', {
        terminalId: terminal.id,
        exitCode,
        command: terminal.command,
        duration: terminal.stoppedAt - terminal.startedAt,
      });

      // Cleanup subscriptions
      terminal.unsubscribeData?.();
      terminal.unsubscribeExit?.();
    });
  }

  /**
   * Spawn using Socket.IO (legacy fallback)
   */
  private async spawnWithSocketIO(
    terminal: BackgroundTerminal,
    command: string,
    cwd: string
  ): Promise<void> {
    console.log(`[BackgroundTerminal] Spawning via Socket.IO (legacy): ${terminal.id}`);

    // Connect to WebSocket server
    const socket = io(config.getWsUrl(), {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 3,
    });

    terminal.socket = socket;

    socket.on('connect', () => {
      console.log(`[BackgroundTerminal] Connected: ${terminal.id}`);
      terminal.status = 'running';
      this.emitEvent('status', terminal);

      // Spawn the PTY process
      socket.emit('spawn', {
        command,
        cwd,
        cols: 120,
        rows: 30,
      });
    });

    socket.on('output', (data: string) => {
      terminal.output.push(data);
      // Keep last 10000 lines
      if (terminal.output.length > 10000) {
        terminal.output = terminal.output.slice(-10000);
      }
      this.emitOutput(terminal.id, data);

      // Emit event for UI updates
      emit('termai-background-output', { terminalId: terminal.id, output: data });
    });

    socket.on('exit', ({ exitCode }: { exitCode: number }) => {
      terminal.status = 'stopped';
      terminal.exitCode = exitCode;
      terminal.stoppedAt = Date.now();
      this.emitEvent('exit', terminal);

      emit('termai-background-exit', {
        terminalId: terminal.id,
        exitCode,
        command: terminal.command,
        duration: terminal.stoppedAt - terminal.startedAt,
      });

      socket.disconnect();
    });

    socket.on('connect_error', (error: Error) => {
      console.error(`[BackgroundTerminal] Connection error: ${error.message}`);
      terminal.status = 'error';
      terminal.output.push(`\r\nConnection error: ${error.message}\r\n`);
      this.emitEvent('error', terminal);
    });

    socket.on('disconnect', () => {
      console.log(`[BackgroundTerminal] Disconnected: ${terminal.id}`);
      if (terminal.status === 'running') {
        terminal.status = 'stopped';
        terminal.stoppedAt = Date.now();
        this.emitEvent('status', terminal);
      }
    });
  }

  /**
   * Send input to a terminal
   */
  async sendInput(terminalId: string, input: string): Promise<boolean> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

    // Use transport if available
    if (this.ptyTransport && terminal.ptySessionId) {
      try {
        await this.ptyTransport.write(terminal.ptySessionId, input);
        return true;
      } catch (error) {
        console.error(`[BackgroundTerminal] Write error: ${(error as Error).message}`);
        return false;
      }
    }

    // Fall back to Socket.IO
    if (terminal.socket?.connected) {
      terminal.socket.emit('input', input);
      return true;
    }

    return false;
  }

  /**
   * Resize a terminal
   */
  async resize(terminalId: string, cols: number, rows: number): Promise<boolean> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

    // Use transport if available
    if (this.ptyTransport && terminal.ptySessionId) {
      try {
        await this.ptyTransport.resize(terminal.ptySessionId, { cols, rows });
        return true;
      } catch (error) {
        console.error(`[BackgroundTerminal] Resize error: ${(error as Error).message}`);
        return false;
      }
    }

    // Fall back to Socket.IO
    if (terminal.socket?.connected) {
      terminal.socket.emit('resize', { cols, rows });
      return true;
    }

    return false;
  }

  /**
   * Stop a terminal process
   */
  async stop(terminalId: string): Promise<boolean> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

    // Use transport if available
    if (this.ptyTransport && terminal.ptySessionId) {
      try {
        // Send Ctrl+C via input
        await this.sendInput(terminalId, '\x03');

        // Give it a moment, then kill
        setTimeout(async () => {
          if (terminal.ptySessionId && this.ptyTransport) {
            try {
              await this.ptyTransport.kill(terminal.ptySessionId);
            } catch (error) {
              console.warn(`[BackgroundTerminal] Kill error: ${(error as Error).message}`);
            }
          }
        }, 500);

        terminal.status = 'stopped';
        terminal.stoppedAt = Date.now();
        this.emitEvent('status', terminal);
        return true;
      } catch (error) {
        console.error(`[BackgroundTerminal] Stop error: ${(error as Error).message}`);
        return false;
      }
    }

    // Fall back to Socket.IO
    if (terminal.socket?.connected) {
      // Send SIGTERM via input (Ctrl+C)
      terminal.socket.emit('input', '\x03');

      // Give it a moment, then disconnect
      setTimeout(() => {
        terminal.socket?.disconnect();
      }, 500);
    }

    terminal.status = 'stopped';
    terminal.stoppedAt = Date.now();
    this.emitEvent('status', terminal);

    return true;
  }

  /**
   * Kill a terminal process forcefully
   */
  async kill(terminalId: string): Promise<boolean> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

    // Use transport if available
    if (this.ptyTransport && terminal.ptySessionId) {
      try {
        await this.ptyTransport.kill(terminal.ptySessionId);
        terminal.unsubscribeData?.();
        terminal.unsubscribeExit?.();
        terminal.status = 'stopped';
        terminal.stoppedAt = Date.now();
        this.emitEvent('status', terminal);
        return true;
      } catch (error) {
        console.error(`[BackgroundTerminal] Kill error: ${(error as Error).message}`);
        return false;
      }
    }

    // Fall back to Socket.IO
    terminal.socket?.disconnect();
    terminal.status = 'stopped';
    terminal.stoppedAt = Date.now();
    this.emitEvent('status', terminal);

    return true;
  }

  /**
   * Remove a terminal from the list
   */
  async remove(terminalId: string): Promise<boolean> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

    await this.kill(terminalId);
    this.terminals.delete(terminalId);
    this.emitEvent('remove', terminal);

    return true;
  }

  /**
   * Get all terminals
   */
  getAll(): BackgroundTerminal[] {
    return Array.from(this.terminals.values());
  }

  /**
   * Get a specific terminal
   */
  get(terminalId: string): BackgroundTerminal | undefined {
    return this.terminals.get(terminalId);
  }

  /**
   * Get running terminals
   */
  getRunning(): BackgroundTerminal[] {
    return this.getAll().filter(t => t.status === 'running');
  }

  /**
   * Subscribe to terminal events
   */
  on(event: string, callback: TerminalEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Subscribe to terminal output
   */
  onOutput(terminalId: string, callback: (output: string) => void): () => void {
    if (!this.outputListeners.has(terminalId)) {
      this.outputListeners.set(terminalId, new Set());
    }
    this.outputListeners.get(terminalId)!.add(callback);

    return () => {
      this.outputListeners.get(terminalId)?.delete(callback);
    };
  }

  /**
   * Get full output for a terminal
   */
  getOutput(terminalId: string): string {
    const terminal = this.terminals.get(terminalId);
    return terminal?.output.join('') || '';
  }

  /**
   * Clear output for a terminal
   */
  clearOutput(terminalId: string): void {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.output = [];
    }
  }

  private emitEvent(event: string, terminal: BackgroundTerminal): void {
    this.listeners.get(event)?.forEach(cb => cb(terminal));
  }

  private emitOutput(terminalId: string, output: string): void {
    this.outputListeners.get(terminalId)?.forEach(cb => cb(output));
  }

  private generateTerminalName(command: string): string {
    // Extract meaningful name from command
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'npm' || cmd === 'yarn' || cmd === 'bun' || cmd === 'pnpm') {
      return `${cmd} ${parts[1] || 'run'}`;
    }

    if (cmd === 'docker' || cmd === 'docker-compose') {
      return `Docker: ${parts.slice(1, 3).join(' ')}`;
    }

    // For other commands, use first two words
    return parts.slice(0, 2).join(' ');
  }
}

export const BackgroundTerminalService = new BackgroundTerminalServiceClass();
