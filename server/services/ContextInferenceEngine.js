/**
 * Context Inference Engine
 *
 * Part of the RAPID Framework (Reduce AI Prompt Iteration Depth)
 *
 * Gathers context AUTOMATICALLY before AI responds, enabling first-shot accuracy.
 * This eliminates the need for back-and-forth questioning by inferring:
 * - Environment (OS, shell, CWD)
 * - Project type (Node, Python, Rust, etc.)
 * - Recent commands and errors
 * - Git context
 * - Relevant config files
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Problem categories for intent classification
const PROBLEM_CATEGORIES = [
  'installation',    // Package/dependency install issues
  'configuration',   // Config file problems
  'build',           // Build/compile errors
  'runtime',         // Runtime errors during execution
  'network',         // Connectivity, DNS, ports
  'permissions',     // Access denied, sudo needed
  'git',             // Version control operations
  'docker',          // Container issues
  'deployment',      // Deploy/release problems
  'how-to',          // Learning how to do something
  'optimization',    // Performance improvements
  'debugging',       // General troubleshooting
  'unknown'          // Unclassified
];

// Project type detectors
const PROJECT_DETECTORS = [
  { file: 'package.json', type: 'node', pm: 'npm' },
  { file: 'yarn.lock', type: 'node', pm: 'yarn' },
  { file: 'pnpm-lock.yaml', type: 'node', pm: 'pnpm' },
  { file: 'requirements.txt', type: 'python', pm: 'pip' },
  { file: 'pyproject.toml', type: 'python', pm: 'pip' },
  { file: 'Pipfile', type: 'python', pm: 'pipenv' },
  { file: 'Cargo.toml', type: 'rust', pm: 'cargo' },
  { file: 'go.mod', type: 'go', pm: 'go' },
  { file: 'Gemfile', type: 'ruby', pm: 'bundler' },
  { file: 'build.gradle', type: 'java', pm: 'gradle' },
  { file: 'pom.xml', type: 'java', pm: 'maven' },
  { file: 'Dockerfile', type: 'docker', pm: null },
  { file: 'docker-compose.yml', type: 'docker', pm: null },
  { file: 'docker-compose.yaml', type: 'docker', pm: null },
  { file: 'terraform.tf', type: 'terraform', pm: 'terraform' },
  { file: 'main.tf', type: 'terraform', pm: 'terraform' },
  { file: 'Makefile', type: 'make', pm: 'make' },
];

// Framework detectors (from package.json dependencies)
const FRAMEWORK_DETECTORS = {
  'next': 'nextjs',
  'react': 'react',
  'vue': 'vue',
  '@angular/core': 'angular',
  'express': 'express',
  'fastify': 'fastify',
  'koa': 'koa',
  'nest': 'nestjs',
  '@nestjs/core': 'nestjs',
  'svelte': 'svelte',
  'astro': 'astro',
  'nuxt': 'nuxt',
  'gatsby': 'gatsby',
  'electron': 'electron',
  'tauri': 'tauri',
};

// Error patterns for detection
const ERROR_PATTERNS = [
  { pattern: /Error: (.+)/g, type: 'generic' },
  { pattern: /error\[E\d+\]: (.+)/g, type: 'rust' },
  { pattern: /npm ERR! (.+)/g, type: 'npm' },
  { pattern: /yarn error (.+)/gi, type: 'yarn' },
  { pattern: /ModuleNotFoundError: (.+)/g, type: 'python' },
  { pattern: /ImportError: (.+)/g, type: 'python' },
  { pattern: /SyntaxError: (.+)/g, type: 'syntax' },
  { pattern: /TypeError: (.+)/g, type: 'type' },
  { pattern: /ReferenceError: (.+)/g, type: 'reference' },
  { pattern: /ENOENT: (.+)/g, type: 'file_not_found' },
  { pattern: /EACCES: (.+)/g, type: 'permission' },
  { pattern: /ECONNREFUSED (.+)/g, type: 'connection' },
  { pattern: /ETIMEDOUT (.+)/g, type: 'timeout' },
  { pattern: /permission denied/gi, type: 'permission' },
  { pattern: /command not found/gi, type: 'command_not_found' },
  { pattern: /No such file or directory/gi, type: 'file_not_found' },
  { pattern: /Cannot find module/gi, type: 'module_not_found' },
  { pattern: /fatal:/gi, type: 'git' },
  { pattern: /FATAL:/gi, type: 'fatal' },
  { pattern: /Traceback \(most recent call last\)/g, type: 'python_traceback' },
  { pattern: /panic:/gi, type: 'go_panic' },
  { pattern: /thread '.*' panicked/gi, type: 'rust_panic' },
];

class ContextInferenceEngine {
  constructor(options = {}) {
    this.sessionStore = options.sessionStore || new Map();
    this.maxCommandHistory = options.maxCommandHistory || 20;
    this.maxErrorHistory = options.maxErrorHistory || 10;
    this.configFileSizeLimit = options.configFileSizeLimit || 10000; // 10KB
  }

  /**
   * Main method: Gather all context for a session
   * Returns a comprehensive context object
   */
  async gatherContext(sessionId, cwd = null) {
    const startTime = Date.now();
    const currentDir = cwd || process.env.TERMAI_LAUNCH_CWD || os.homedir();

    try {
      // Gather all context in parallel for speed
      const [
        envContext,
        projectContext,
        stateContext,
        gitContext,
        fileContext
      ] = await Promise.all([
        this._gatherEnvironment(),
        this._gatherProjectContext(currentDir),
        this._gatherStateContext(sessionId),
        this._gatherGitContext(currentDir),
        this._gatherFileContext(currentDir)
      ]);

      const context = {
        // Environment
        os: envContext.os,
        shell: envContext.shell,
        cwd: currentDir,
        user: envContext.user,
        hostname: envContext.hostname,

        // Project
        projectType: projectContext.projectType,
        packageManager: projectContext.packageManager,
        framework: projectContext.framework,
        language: projectContext.language,
        runtimeVersions: envContext.runtimeVersions,

        // State
        recentCommands: stateContext.recentCommands,
        recentErrors: stateContext.recentErrors,
        lastCommand: stateContext.lastCommand,
        lastError: stateContext.lastError,

        // Git
        gitContext: gitContext,

        // Files
        relevantFiles: fileContext.relevantFiles,
        configFiles: fileContext.configFiles,

        // Metadata
        gatherTime: Date.now() - startTime,
        contextCompleteness: 0,
        sessionId
      };

      // Calculate completeness score
      context.contextCompleteness = this._calculateCompleteness(context);

      return context;
    } catch (error) {
      console.error('[ContextInferenceEngine] Error gathering context:', error);
      return this._getMinimalContext(currentDir, sessionId);
    }
  }

  /**
   * Record a command execution for context
   */
  recordCommand(sessionId, command, cwd, result) {
    const session = this._getSession(sessionId);

    const entry = {
      command,
      cwd,
      exitCode: result.exitCode,
      output: result.output?.slice(0, 5000) || '', // Limit output size
      timestamp: Date.now(),
      duration: result.duration || 0
    };

    session.commands.push(entry);
    if (session.commands.length > this.maxCommandHistory) {
      session.commands.shift();
    }

    // Extract errors from output
    if (result.exitCode !== 0 || this._containsError(result.output)) {
      const errors = this._extractErrorPatterns(result.output || '');
      if (errors.length > 0) {
        session.errors.push({
          command,
          output: result.output?.slice(0, 2000) || '',
          patterns: errors,
          timestamp: Date.now()
        });
        if (session.errors.length > this.maxErrorHistory) {
          session.errors.shift();
        }
      }
    }
  }

  /**
   * Get the last error for quick reference
   */
  getLastError(sessionId) {
    const session = this._getSession(sessionId);
    return session.errors[session.errors.length - 1] || null;
  }

  /**
   * Clear session context
   */
  clearSession(sessionId) {
    this.sessionStore.delete(sessionId);
  }

  // ===========================================
  // PRIVATE: Context Gathering Methods
  // ===========================================

  async _gatherEnvironment() {
    const platform = os.platform();
    const osType = platform === 'darwin' ? 'macos' :
                   platform === 'win32' ? 'windows' : 'linux';

    const runtimeVersions = {};

    // Check versions in parallel
    const versionChecks = [
      { name: 'node', cmd: 'node --version' },
      { name: 'npm', cmd: 'npm --version' },
      { name: 'python', cmd: 'python3 --version 2>&1 || python --version 2>&1' },
      { name: 'pip', cmd: 'pip3 --version 2>&1 || pip --version 2>&1' },
      { name: 'docker', cmd: 'docker --version 2>&1' },
      { name: 'git', cmd: 'git --version' },
      { name: 'go', cmd: 'go version 2>&1' },
      { name: 'rustc', cmd: 'rustc --version 2>&1' },
      { name: 'cargo', cmd: 'cargo --version 2>&1' },
      { name: 'java', cmd: 'java -version 2>&1' },
    ];

    await Promise.all(versionChecks.map(async ({ name, cmd }) => {
      try {
        const result = await execAsync(cmd, { timeout: 3000 });
        const output = result.stdout || result.stderr || '';
        const version = output.match(/[\d.]+/)?.[0];
        if (version) {
          runtimeVersions[name] = version;
        }
      } catch {
        // Tool not available, skip
      }
    }));

    return {
      os: osType,
      platform,
      shell: process.env.SHELL || (platform === 'win32' ? 'powershell' : 'bash'),
      user: process.env.USER || process.env.USERNAME || 'unknown',
      hostname: os.hostname(),
      runtimeVersions
    };
  }

  async _gatherProjectContext(cwd) {
    let projectType = null;
    let packageManager = null;
    let framework = null;
    let language = null;

    // Check for project markers
    for (const detector of PROJECT_DETECTORS) {
      const filePath = path.join(cwd, detector.file);
      if (fs.existsSync(filePath)) {
        projectType = detector.type;
        packageManager = detector.pm;
        break;
      }
    }

    // Detect framework from package.json
    if (projectType === 'node') {
      language = 'typescript'; // Default assumption
      try {
        const pkgPath = path.join(cwd, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          for (const [dep, fw] of Object.entries(FRAMEWORK_DETECTORS)) {
            if (deps[dep]) {
              framework = fw;
              break;
            }
          }

          // Check if TypeScript is used
          if (!deps['typescript']) {
            language = 'javascript';
          }
        }
      } catch {
        // Ignore parsing errors
      }
    } else if (projectType === 'python') {
      language = 'python';
    } else if (projectType === 'rust') {
      language = 'rust';
    } else if (projectType === 'go') {
      language = 'go';
    } else if (projectType === 'ruby') {
      language = 'ruby';
    } else if (projectType === 'java') {
      language = 'java';
    }

    return { projectType, packageManager, framework, language };
  }

  _gatherStateContext(sessionId) {
    const session = this._getSession(sessionId);

    return {
      recentCommands: session.commands.slice(-10),
      recentErrors: session.errors.slice(-5),
      lastCommand: session.commands[session.commands.length - 1] || null,
      lastError: session.errors[session.errors.length - 1] || null
    };
  }

  async _gatherGitContext(cwd) {
    try {
      // Check if in a git repo
      const isGitRepo = fs.existsSync(path.join(cwd, '.git'));
      if (!isGitRepo) {
        // Check parent directories
        let checkDir = cwd;
        let found = false;
        for (let i = 0; i < 5; i++) {
          if (fs.existsSync(path.join(checkDir, '.git'))) {
            found = true;
            break;
          }
          const parent = path.dirname(checkDir);
          if (parent === checkDir) break;
          checkDir = parent;
        }
        if (!found) return null;
      }

      const [branchResult, statusResult, remoteResult] = await Promise.all([
        execAsync('git branch --show-current', { cwd, timeout: 3000 }).catch(() => ({ stdout: '' })),
        execAsync('git status --porcelain', { cwd, timeout: 3000 }).catch(() => ({ stdout: '' })),
        execAsync('git remote -v', { cwd, timeout: 3000 }).catch(() => ({ stdout: '' }))
      ]);

      const status = statusResult.stdout.trim();
      const changedFiles = status.split('\n').filter(Boolean);

      // Parse changed files into categories
      const staged = changedFiles.filter(f => /^[MADRC]/.test(f)).length;
      const unstaged = changedFiles.filter(f => /^.[MADRC]/.test(f)).length;
      const untracked = changedFiles.filter(f => f.startsWith('??')).length;

      return {
        branch: branchResult.stdout.trim() || 'unknown',
        hasChanges: changedFiles.length > 0,
        changedFilesCount: changedFiles.length,
        staged,
        unstaged,
        untracked,
        hasRemote: remoteResult.stdout.trim().length > 0
      };
    } catch {
      return null;
    }
  }

  async _gatherFileContext(cwd) {
    const configFiles = [];
    const relevantFiles = [];

    // Config file patterns to look for
    const configPatterns = [
      'package.json',
      'tsconfig.json',
      'vite.config.*',
      'webpack.config.*',
      'rollup.config.*',
      'next.config.*',
      'nuxt.config.*',
      '.eslintrc*',
      '.prettierrc*',
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      '.env.example',
      'Makefile',
      'requirements.txt',
      'setup.py',
      'pyproject.toml',
      'Cargo.toml',
      'go.mod',
      'Gemfile'
    ];

    for (const pattern of configPatterns) {
      try {
        // Simple glob implementation
        const files = fs.readdirSync(cwd).filter(f => {
          if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            return regex.test(f);
          }
          return f === pattern;
        });

        for (const file of files.slice(0, 2)) { // Limit per pattern
          const filePath = path.join(cwd, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile() && stats.size < this.configFileSizeLimit) {
              const content = fs.readFileSync(filePath, 'utf-8');
              configFiles.push({
                name: file,
                path: filePath,
                content: content.slice(0, 3000), // Truncate
                truncated: content.length > 3000,
                size: stats.size
              });
            }
          } catch {
            // Skip files we can't read
          }
        }
      } catch {
        // Skip on directory read errors
      }
    }

    return { configFiles, relevantFiles };
  }

  // ===========================================
  // PRIVATE: Helper Methods
  // ===========================================

  _getSession(sessionId) {
    if (!this.sessionStore.has(sessionId)) {
      this.sessionStore.set(sessionId, {
        commands: [],
        errors: [],
        createdAt: Date.now()
      });
    }
    return this.sessionStore.get(sessionId);
  }

  _containsError(output) {
    if (!output) return false;

    const errorIndicators = [
      /error/i,
      /exception/i,
      /failed/i,
      /cannot find/i,
      /not found/i,
      /permission denied/i,
      /ENOENT/,
      /EACCES/,
      /ECONNREFUSED/,
      /traceback/i,
      /panic:/i,
      /fatal:/i
    ];

    return errorIndicators.some(p => p.test(output));
  }

  _extractErrorPatterns(output) {
    const patterns = [];

    for (const { pattern, type } of ERROR_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(output)) !== null) {
        patterns.push({
          type,
          message: match[1] || match[0],
          fullMatch: match[0]
        });
        if (patterns.length >= 10) break; // Limit patterns
      }
      if (patterns.length >= 10) break;
    }

    return patterns;
  }

  _calculateCompleteness(context) {
    let score = 0;
    const weights = {
      os: 0.05,
      cwd: 0.05,
      projectType: 0.15,
      packageManager: 0.05,
      framework: 0.05,
      recentCommands: 0.15,
      recentErrors: 0.25, // Errors are critical for problem-solving
      gitContext: 0.05,
      configFiles: 0.1,
      runtimeVersions: 0.1
    };

    if (context.os) score += weights.os;
    if (context.cwd) score += weights.cwd;
    if (context.projectType) score += weights.projectType;
    if (context.packageManager) score += weights.packageManager;
    if (context.framework) score += weights.framework;
    if (context.recentCommands?.length > 0) score += weights.recentCommands;
    if (context.recentErrors?.length > 0) score += weights.recentErrors;
    if (context.gitContext) score += weights.gitContext;
    if (context.configFiles?.length > 0) score += weights.configFiles;
    if (Object.keys(context.runtimeVersions || {}).length > 0) score += weights.runtimeVersions;

    return Math.round(score * 100) / 100;
  }

  _getMinimalContext(cwd, sessionId) {
    return {
      os: os.platform() === 'darwin' ? 'macos' :
          os.platform() === 'win32' ? 'windows' : 'linux',
      shell: process.env.SHELL || 'bash',
      cwd,
      user: process.env.USER || 'unknown',
      hostname: os.hostname(),
      projectType: null,
      packageManager: null,
      framework: null,
      language: null,
      runtimeVersions: {},
      recentCommands: [],
      recentErrors: [],
      lastCommand: null,
      lastError: null,
      gitContext: null,
      relevantFiles: [],
      configFiles: [],
      gatherTime: 0,
      contextCompleteness: 0.1,
      sessionId
    };
  }
}

// Singleton instance
let contextEngineInstance = null;

function getContextInferenceEngine(options = {}) {
  if (!contextEngineInstance) {
    contextEngineInstance = new ContextInferenceEngine(options);
  }
  return contextEngineInstance;
}

module.exports = {
  ContextInferenceEngine,
  getContextInferenceEngine,
  PROBLEM_CATEGORIES
};
