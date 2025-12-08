/**
 * Background Terminal Service
 * Manages background/long-running processes and interactive applications
 * Uses WebSocket/PTY for real terminal functionality
 */

import { io, Socket } from 'socket.io-client';
import { config } from '../config';
import { emit } from '../events';

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
  'flask run',
  'uvicorn',
  'gunicorn',
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

export type TerminalType = 'inline' | 'background' | 'interactive';

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
  socket?: Socket;
}

type TerminalEventCallback = (terminal: BackgroundTerminal) => void;

class BackgroundTerminalServiceClass {
  private terminals: Map<string, BackgroundTerminal> = new Map();
  private listeners: Map<string, Set<TerminalEventCallback>> = new Map();
  private outputListeners: Map<string, Set<(output: string) => void>> = new Map();

  /**
   * Detect what type of terminal a command needs
   */
  detectCommandType(command: string): TerminalType {
    const trimmedCmd = command.trim().toLowerCase();

    // Check for interactive apps first
    for (const app of INTERACTIVE_APPS) {
      if (trimmedCmd === app.trim() || trimmedCmd.startsWith(app)) {
        return 'interactive';
      }
    }

    // Check for long-running commands
    for (const pattern of LONG_RUNNING_COMMANDS) {
      if (trimmedCmd.includes(pattern.toLowerCase())) {
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
      // Connect to WebSocket server
      const socket = io(config.getWsUrl(), {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 3,
      });

      terminal.socket = socket;

      socket.on('connect', () => {
        console.log(`[BackgroundTerminal] Connected: ${id}`);
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
        this.emitOutput(id, data);
        
        // Emit event for UI updates
        emit('termai-background-output', { terminalId: id, output: data });
      });

      socket.on('exit', ({ exitCode }: { exitCode: number }) => {
        terminal.status = 'stopped';
        terminal.exitCode = exitCode;
        terminal.stoppedAt = Date.now();
        this.emitEvent('exit', terminal);
        
        emit('termai-background-exit', { 
          terminalId: id, 
          exitCode,
          command,
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
        console.log(`[BackgroundTerminal] Disconnected: ${id}`);
        if (terminal.status === 'running') {
          terminal.status = 'stopped';
          terminal.stoppedAt = Date.now();
          this.emitEvent('status', terminal);
        }
      });

    } catch (error) {
      terminal.status = 'error';
      terminal.output.push(`Error: ${(error as Error).message}`);
      this.emitEvent('error', terminal);
    }

    return terminal;
  }

  /**
   * Send input to a terminal
   */
  sendInput(terminalId: string, input: string): boolean {
    const terminal = this.terminals.get(terminalId);
    if (!terminal?.socket?.connected) {
      return false;
    }
    terminal.socket.emit('input', input);
    return true;
  }

  /**
   * Resize a terminal
   */
  resize(terminalId: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(terminalId);
    if (!terminal?.socket?.connected) {
      return false;
    }
    terminal.socket.emit('resize', { cols, rows });
    return true;
  }

  /**
   * Stop a terminal process
   */
  stop(terminalId: string): boolean {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

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
  kill(terminalId: string): boolean {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

    terminal.socket?.disconnect();
    terminal.status = 'stopped';
    terminal.stoppedAt = Date.now();
    this.emitEvent('status', terminal);
    
    return true;
  }

  /**
   * Remove a terminal from the list
   */
  remove(terminalId: string): boolean {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return false;
    }

    this.kill(terminalId);
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
