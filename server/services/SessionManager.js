/**
 * SessionManager ("The Arbiter")
 * 
 * Manages the raw PTY process with intelligent features:
 * 1. Enforces Mutex: Only User OR AI can type at once
 * 2. Tracks CWD by parsing OSC 7 sequences (Shell Integration)
 * 3. AI typing simulation with interrupt support
 * 4. Command output capture for AI context
 * 
 * OSC 7 Protocol:
 * Modern shells can emit: \x1b]7;file://hostname/path/to/cwd\x07
 * This allows us to track CWD changes without parsing `cd` commands.
 */

const pty = require('node-pty');
const os = require('os');
const EventEmitter = require('events');

class SessionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Shell configuration
    this.shell = options.shell || process.env.SHELL || this._getDefaultShell();
    this._currentCwd = options.cwd || process.env.TERMAI_LAUNCH_CWD || os.homedir();
    this.cols = options.cols || 80;
    this.rows = options.rows || 30;
    
    // State tracking
    this.ptyProcess = null;
    this.isAiTyping = false;
    this.outputBuffer = '';
    this.commandStartTime = null;
    this.currentCommand = null;
    this.lastPromptTime = null;
    
    // OSC 7 regex to detect Shell Integration sequences
    // Format: \x1b]7;file://hostname/path/to/cwd\x07
    this.osc7Regex = /\x1b\]7;file:\/\/[^/]*(\/[^\x07]*)\x07/;
    
    // Prompt detection patterns (for command completion detection)
    this.promptPatterns = [
      /\$\s*$/,           // bash/zsh $
      />\s*$/,            // Windows/PowerShell >
      /#\s*$/,            // root #
      /❯\s*$/,            // oh-my-zsh arrow
      /➜\s*$/,            // oh-my-zsh arrow variant
      /λ\s*$/,            // lambda prompt
      /⚡\s*$/,           // custom prompt
      /%\s*$/,            // zsh default
      /\]\$\s*$/,         // complex prompt ending
      /\)\s*\$\s*$/,      // git prompt ending
    ];
    
    // Initialize PTY
    this._spawnPty();
  }

  // ===========================================
  // PUBLIC API
  // ===========================================

  /**
   * User Input - "God Mode"
   * Immediate priority. Interrupts AI if active.
   */
  writeUser(data) {
    if (!this.ptyProcess) return;

    // User always wins - interrupt AI if typing
    if (this.isAiTyping) {
      console.log('[SessionManager] ⛔ User interrupted AI execution');
      this.interruptAi();
    }

    // Forward user input to PTY
    this.ptyProcess.write(data);
  }

  /**
   * AI Input - "Agent Mode"
   * Types with delay to feel natural and allow interruption.
   * Returns result with output and status.
   */
  async writeAi(command, options = {}) {
    if (!this.ptyProcess) {
      throw new Error('PTY not initialized');
    }

    if (this.isAiTyping) {
      console.warn('[SessionManager] AI already typing, command queued or rejected');
      return { interrupted: true, output: '', reason: 'busy' };
    }

    const typingDelay = options.typingDelay || 10; // ms between characters
    const executeOnComplete = options.execute !== false;
    const waitForCompletion = options.waitForCompletion !== false;
    
    this.isAiTyping = true;
    this.currentCommand = command;
    this.outputBuffer = '';
    this.commandStartTime = Date.now();
    
    this.emit('ai-status', 'typing');

    try {
      // Type each character with delay (allows interruption)
      for (const char of command) {
        if (!this.isAiTyping) {
          return this._buildResult(true, 'interrupted');
        }

        this.ptyProcess.write(char);
        await this._delay(typingDelay);
      }

      // Execute command by pressing Enter
      if (this.isAiTyping && executeOnComplete) {
        this.ptyProcess.write('\r');
        this.emit('ai-status', 'executing');
        
        // Wait for command to complete (if requested)
        if (waitForCompletion) {
          await this._waitForPrompt(options.timeout || 30000);
        }
      }

      return this._buildResult(false, 'completed');

    } catch (error) {
      console.error('[SessionManager] AI write error:', error);
      this.emit('ai-status', 'error');
      throw error;
    } finally {
      this.isAiTyping = false;
      this.currentCommand = null;
      this.emit('ai-status', 'idle');
    }
  }

  /**
   * Emergency Brake - Interrupt AI
   * Sends Ctrl+C to the running process
   */
  interruptAi() {
    if (!this.isAiTyping && !this.currentCommand) return;
    
    console.log('[SessionManager] AI interrupted');
    this.isAiTyping = false;
    this.emit('ai-status', 'interrupted');
    
    // \x03 is ASCII for Ctrl+C (ETX)
    this.ptyProcess.write('\x03');
  }

  /**
   * Resize terminal
   */
  resize(cols, rows) {
    try {
      if (this.ptyProcess) {
        this.ptyProcess.resize(cols, rows);
        this.cols = cols;
        this.rows = rows;
      }
    } catch (e) {
      // Handle resize race conditions on exit
      console.warn('[SessionManager] Resize failed:', e.message);
    }
  }

  /**
   * Get current working directory (tracked via OSC 7)
   */
  get currentCwd() {
    return this._currentCwd;
  }

  /**
   * Get recent output buffer for AI context
   */
  getOutputBuffer(maxLines = 100) {
    const lines = this.outputBuffer.split('\n');
    return lines.slice(-maxLines).join('\n');
  }

  /**
   * Clear output buffer
   */
  clearOutputBuffer() {
    this.outputBuffer = '';
  }

  /**
   * Get session state
   */
  getState() {
    return {
      isAiTyping: this.isAiTyping,
      currentCommand: this.currentCommand,
      cwd: this._currentCwd,
      cols: this.cols,
      rows: this.rows,
      pid: this.ptyProcess?.pid,
      shell: this.shell,
    };
  }

  /**
   * Kill the session
   */
  kill() {
    if (this.ptyProcess) {
      this.isAiTyping = false;
      this.ptyProcess.kill();
      this.ptyProcess = null;
      console.log('[SessionManager] Session killed');
    }
  }

  // ===========================================
  // INTERNAL HELPERS
  // ===========================================

  /**
   * Spawn the PTY process
   */
  _spawnPty() {
    try {
      this.ptyProcess = pty.spawn(this.shell, [], {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this._currentCwd,
        env: this._getShellEnv(),
      });

      // Attach data handler
      this.ptyProcess.onData((data) => this._handleData(data));
      
      // Attach exit handler
      this.ptyProcess.onExit(({ exitCode, signal }) => {
        this.emit('exit', { exitCode, signal });
      });

      console.log(`[SessionManager] PTY spawned: ${this.shell} (pid: ${this.ptyProcess.pid})`);
      console.log(`[SessionManager] Initial CWD: ${this._currentCwd}`);

      // Inject shell integration for CWD tracking
      this._injectShellIntegration();

    } catch (error) {
      console.error('[SessionManager] Failed to spawn PTY:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle PTY output data
   * - Streams to frontend
   * - Parses OSC 7 for CWD tracking
   * - Buffers for AI context
   */
  _handleData(data) {
    // 1. Stream to frontend
    this.emit('output', data);

    // 2. Buffer output for AI context
    this.outputBuffer += data;
    
    // Keep buffer from growing too large (max ~500KB)
    if (this.outputBuffer.length > 500000) {
      this.outputBuffer = this.outputBuffer.slice(-250000);
    }

    // 3. Parse OSC 7 sequences for CWD tracking
    const match = data.match(this.osc7Regex);
    if (match && match[1]) {
      try {
        // Decode URI-encoded paths (spaces, special chars)
        const newCwd = decodeURIComponent(match[1]);
        if (newCwd !== this._currentCwd) {
          this._currentCwd = newCwd;
          this.emit('cwd-changed', this._currentCwd);
          console.log(`[SessionManager] 📍 CWD changed: ${this._currentCwd}`);
        }
      } catch (e) {
        console.warn('[SessionManager] Failed to parse OSC 7 path:', e);
      }
    }

    // 4. Detect prompt (for command completion)
    const lastChunk = data.slice(-100);
    if (this.promptPatterns.some(p => p.test(lastChunk))) {
      this.lastPromptTime = Date.now();
    }
  }

  /**
   * Inject shell integration to force CWD reporting via OSC 7
   * This is a "Senior Dev Trick" - we assume user hasn't configured
   * their shell to emit OSC 7, so we inject it automatically.
   */
  _injectShellIntegration() {
    // Wait for shell to be ready
    setTimeout(() => {
      const shellName = this.shell.toLowerCase();
      
      if (shellName.includes('zsh')) {
        // Zsh: Use precmd hook to emit OSC 7 before each prompt
        const zshHook = `
          autoload -Uz add-zsh-hook 2>/dev/null
          __termai_osc7() { printf "\\033]7;file://%s%s\\033\\\\" "$HOST" "$PWD" }
          add-zsh-hook precmd __termai_osc7 2>/dev/null
        `.replace(/\n\s+/g, ' ').trim();
        
        this.ptyProcess.write(zshHook + '\r');
        // Trigger initial CWD report
        this.ptyProcess.write('__termai_osc7 2>/dev/null\r');
        // Clear the setup commands from view
        this.ptyProcess.write('clear\r');
        
      } else if (shellName.includes('bash')) {
        // Bash: Use PROMPT_COMMAND to emit OSC 7
        const bashHook = `
          __termai_osc7() { printf "\\033]7;file://%s%s\\033\\\\" "$HOSTNAME" "$PWD"; }
          PROMPT_COMMAND="__termai_osc7;\${PROMPT_COMMAND}"
        `.replace(/\n\s+/g, ' ').trim();
        
        this.ptyProcess.write(bashHook + '\r');
        this.ptyProcess.write('__termai_osc7\r');
        this.ptyProcess.write('clear\r');
        
      } else if (shellName.includes('fish')) {
        // Fish: Use fish_prompt function
        const fishHook = `
          function __termai_osc7 --on-event fish_prompt
            printf "\\033]7;file://%s%s\\033\\\\" (hostname) (pwd)
          end
        `.replace(/\n\s+/g, '; ').trim();
        
        this.ptyProcess.write(fishHook + '\r');
        this.ptyProcess.write('clear\r');
        
      } else if (shellName.includes('powershell') || shellName.includes('pwsh')) {
        // PowerShell: Use prompt function
        const psHook = `
          function prompt { 
            $e = [char]27
            "$e]7;file://$env:COMPUTERNAME$($PWD.Path -replace '\\\\','/')$e\\"
            "PS $PWD> "
          }
        `.replace(/\n\s+/g, ' ').trim();
        
        this.ptyProcess.write(psHook + '\r');
        this.ptyProcess.write('cls\r');
      }
      
      console.log(`[SessionManager] Shell integration injected for: ${shellName}`);
    }, 500);
  }

  /**
   * Wait for shell prompt to appear (command finished)
   */
  _waitForPrompt(timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = 100;
      const initialPromptTime = this.lastPromptTime;

      const check = () => {
        // Check if interrupted
        if (!this.isAiTyping) {
          resolve();
          return;
        }

        // Check if new prompt appeared
        if (this.lastPromptTime && this.lastPromptTime > initialPromptTime) {
          // Give a small delay for final output
          setTimeout(resolve, 50);
          return;
        }

        // Fallback: Check buffer for prompt patterns
        const lastOutput = this.outputBuffer.slice(-200);
        const hasPrompt = this.promptPatterns.some(p => p.test(lastOutput));
        
        if (hasPrompt && Date.now() - startTime > 500) {
          // Prompt detected and at least 500ms passed
          setTimeout(resolve, 50);
          return;
        }

        // Timeout check
        if (Date.now() - startTime > timeout) {
          console.warn('[SessionManager] Timeout waiting for command completion');
          resolve(); // Don't reject, just continue
          return;
        }

        setTimeout(check, checkInterval);
      };

      // Initial delay for command to start executing
      setTimeout(check, 200);
    });
  }

  /**
   * Build result object
   */
  _buildResult(interrupted, reason) {
    return {
      interrupted,
      reason,
      output: this.outputBuffer,
      duration: Date.now() - (this.commandStartTime || Date.now()),
      command: this.currentCommand,
      cwd: this._currentCwd,
    };
  }

  /**
   * Get default shell for current platform
   */
  _getDefaultShell() {
    if (os.platform() === 'win32') {
      return 'powershell.exe';
    }
    
    const fs = require('fs');
    const { execSync } = require('child_process');
    
    // Try common shell paths (macOS moved shells in recent versions)
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
    
    // Fallback: try to resolve via 'which' command
    try {
      const resolvedShell = execSync('which zsh || which bash || which sh', { 
        encoding: 'utf-8',
        timeout: 2000 
      }).trim().split('\n')[0];
      if (resolvedShell && fs.existsSync(resolvedShell)) {
        return resolvedShell;
      }
    } catch (e) {
      // Ignore - 'which' may not be available
    }
    
    // Last resort fallback
    return '/bin/sh';
  }

  /**
   * Get shell environment
   */
  _getShellEnv() {
    return {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      // Ensure proper locale for unicode
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
    };
  }

  /**
   * Helper: delay promise
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { SessionManager };
