#!/usr/bin/env node
/**
 * TermAI Local Agent
 * 
 * A lightweight local service that runs on the user's machine to provide:
 *   - File system access to the remote TermAI web interface
 *   - Secure local storage for API keys and settings
 *   - Auto-start capability (when installed as a service)
 * 
 * Usage:
 *   node local-agent.cjs              # Run the agent
 *   node local-agent.cjs --install    # Install as auto-start service
 *   node local-agent.cjs --uninstall  # Remove auto-start service
 *   node local-agent.cjs --status     # Check if agent is running
 * 
 * The agent listens on localhost:3010 and provides:
 *   - GET  /health     - Health check
 *   - GET  /drives     - List local drives/volumes
 *   - POST /list       - List directory contents
 *   - GET  /config     - Get stored configuration/API keys
 *   - POST /config     - Save configuration/API keys
 *   - GET  /settings   - Get all settings
 *   - POST /settings   - Save settings
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, exec, spawn } = require('child_process');

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.TERMAI_AGENT_PORT || 3010;
const VERSION = '1.2.0'; // Bumped version for exec support

// Config directory: ~/.termai/
const CONFIG_DIR = path.join(os.homedir(), '.termai');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ENV_FILE = path.join(CONFIG_DIR, '.env');
const LOG_FILE = path.join(CONFIG_DIR, 'agent.log');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

// Allow all origins by default since the agent only listens on localhost
const ALLOW_ALL_ORIGINS = process.env.TERMAI_AGENT_CORS !== 'strict';

// =============================================================================
// LOGGING
// =============================================================================

const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  
  // Console output (unless running as daemon)
  if (!process.env.TERMAI_DAEMON) {
    process.stdout.write(logLine);
  }
  
  // File output
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch {
    // Ignore log write errors
  }
};

// =============================================================================
// CORS HEADERS
// =============================================================================

const corsHeaders = (origin) => {
  const allowedOrigin = ALLOW_ALL_ORIGINS 
    ? (origin || '*')
    : origin;
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  };
};

// =============================================================================
// JSON RESPONSE HELPER
// =============================================================================

const jsonResponse = (res, data, status = 200, origin = '') => {
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
  };
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
};

// =============================================================================
// CONFIGURATION MANAGEMENT
// =============================================================================

/**
 * Load configuration from file
 */
const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    log(`Error loading config: ${error.message}`, 'ERROR');
  }
  return {};
};

/**
 * Save configuration to file
 */
const saveConfig = (config) => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
    return true;
  } catch (error) {
    log(`Error saving config: ${error.message}`, 'ERROR');
    return false;
  }
};

/**
 * Load .env file as key-value pairs
 */
const loadEnv = () => {
  try {
    if (fs.existsSync(ENV_FILE)) {
      const data = fs.readFileSync(ENV_FILE, 'utf-8');
      const env = {};
      data.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            env[key] = value;
          }
        }
      });
      return env;
    }
  } catch (error) {
    log(`Error loading .env: ${error.message}`, 'ERROR');
  }
  return {};
};

/**
 * Save .env file
 */
const saveEnv = (env) => {
  try {
    const lines = [
      '# TermAI Local Configuration',
      '# This file is managed by the TermAI Local Agent',
      '# Do not edit manually unless you know what you are doing',
      '',
    ];
    
    Object.entries(env).forEach(([key, value]) => {
      // Quote values that contain spaces or special characters
      const needsQuotes = /[\s#=]/.test(value);
      lines.push(`${key}=${needsQuotes ? `"${value}"` : value}`);
    });
    
    fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
    return true;
  } catch (error) {
    log(`Error saving .env: ${error.message}`, 'ERROR');
    return false;
  }
};

/**
 * Get specific API key
 */
const getApiKey = (provider) => {
  const env = loadEnv();
  const keyMap = {
    'gemini': 'GEMINI_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY',
    'openrouter': 'OPENROUTER_API_KEY',
    'ollama': 'OLLAMA_ENDPOINT',
  };
  const envKey = keyMap[provider] || `${provider.toUpperCase()}_API_KEY`;
  return env[envKey] || null;
};

/**
 * Set specific API key
 */
const setApiKey = (provider, key) => {
  const env = loadEnv();
  const keyMap = {
    'gemini': 'GEMINI_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY',
    'openrouter': 'OPENROUTER_API_KEY',
    'ollama': 'OLLAMA_ENDPOINT',
  };
  const envKey = keyMap[provider] || `${provider.toUpperCase()}_API_KEY`;
  
  if (key) {
    env[envKey] = key;
  } else {
    delete env[envKey];
  }
  
  return saveEnv(env);
};

// =============================================================================
// FILE SYSTEM OPERATIONS
// =============================================================================

/**
 * Get drives/volumes based on platform
 */
const getDrives = () => {
  const platform = os.platform();
  const drives = [];

  if (platform === 'win32') {
    try {
      const output = execSync('wmic logicaldisk get name,volumename,drivetype', { encoding: 'utf-8' });
      const lines = output.split('\n').slice(1).filter(line => line.trim());
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s{2,}/);
        if (parts[0] && /^[A-Z]:$/.test(parts[0])) {
          const driveLetter = parts[0];
          const driveType = parts[1] || '3';
          const volumeName = parts[2] || '';
          
          let type = 'drive';
          if (driveType === '2') type = 'removable';
          else if (driveType === '4') type = 'network';
          else if (driveType === '5') type = 'cdrom';
          
          drives.push({
            name: volumeName ? `${driveLetter} (${volumeName})` : driveLetter,
            path: driveLetter + '\\',
            type,
          });
        }
      });
    } catch {
      // Fallback: Check common drive letters
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const drivePath = `${letter}:\\`;
        try {
          fs.accessSync(drivePath, fs.constants.R_OK);
          drives.push({
            name: `${letter}:`,
            path: drivePath,
            type: 'drive',
          });
        } catch {
          // Drive doesn't exist
        }
      }
    }
  } else {
    // macOS / Linux
    drives.push({ name: '/', path: '/', type: 'root' });
    drives.push({ name: 'Home', path: os.homedir(), type: 'home' });

    // macOS Volumes
    if (platform === 'darwin') {
      try {
        const entries = fs.readdirSync('/Volumes', { withFileTypes: true });
        entries.forEach(entry => {
          if ((entry.isDirectory() || entry.isSymbolicLink()) && entry.name !== 'Macintosh HD') {
            drives.push({
              name: entry.name,
              path: path.join('/Volumes', entry.name),
              type: 'volume',
            });
          }
        });
      } catch { /* ignore */ }
    }

    // Linux mount points
    if (platform === 'linux') {
      const mountPoints = ['/mnt', `/media/${os.userInfo().username}`, '/media'];
      mountPoints.forEach(mountBase => {
        try {
          if (fs.existsSync(mountBase)) {
            fs.readdirSync(mountBase, { withFileTypes: true }).forEach(entry => {
              if (entry.isDirectory() || entry.isSymbolicLink()) {
                drives.push({
                  name: entry.name,
                  path: path.join(mountBase, entry.name),
                  type: 'mount',
                });
              }
            });
          }
        } catch { /* ignore */ }
      });
    }

    // Current working directory
    const cwd = process.cwd();
    if (cwd !== os.homedir() && cwd !== '/') {
      drives.push({ name: 'Current Directory', path: cwd, type: 'project' });
    }
  }

  return drives;
};

/**
 * List directory contents
 */
const listDirectory = (dirPath, showHidden = false) => {
  const expandedPath = dirPath.startsWith('~') 
    ? path.join(os.homedir(), dirPath.slice(1))
    : dirPath;
  const resolvedPath = path.resolve(expandedPath);
  
  const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
  const files = entries
    .filter(entry => showHidden || !entry.name.startsWith('.'))
    .map(entry => ({
      name: entry.name,
      path: path.join(resolvedPath, entry.name),
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink(),
    }))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

  return { path: resolvedPath, files, parent: path.dirname(resolvedPath) };
};

// =============================================================================
// SERVICE INSTALLATION
// =============================================================================

/**
 * Get the path to this script
 */
const getScriptPath = () => {
  return path.resolve(__filename);
};

/**
 * Install as auto-start service
 */
const installService = () => {
  const platform = os.platform();
  const scriptPath = getScriptPath();
  
  console.log('Installing TermAI Local Agent as auto-start service...\n');
  
  if (platform === 'darwin') {
    // macOS: Create LaunchAgent plist
    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.termai.localagent.plist');
    const plistDir = path.dirname(plistPath);
    
    if (!fs.existsSync(plistDir)) {
      fs.mkdirSync(plistDir, { recursive: true });
    }
    
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.termai.localagent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${scriptPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_FILE}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TERMAI_DAEMON</key>
        <string>1</string>
    </dict>
</dict>
</plist>`;
    
    fs.writeFileSync(plistPath, plist);
    execSync(`launchctl load "${plistPath}"`);
    console.log('Installed as macOS LaunchAgent');
    console.log(`  Plist: ${plistPath}`);
    
  } else if (platform === 'linux') {
    // Linux: Create systemd user service
    const serviceDir = path.join(os.homedir(), '.config/systemd/user');
    const servicePath = path.join(serviceDir, 'termai-agent.service');
    
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }
    
    const service = `[Unit]
Description=TermAI Local Agent
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${scriptPath}
Restart=always
RestartSec=10
Environment=TERMAI_DAEMON=1

[Install]
WantedBy=default.target
`;
    
    fs.writeFileSync(servicePath, service);
    execSync('systemctl --user daemon-reload');
    execSync('systemctl --user enable termai-agent');
    execSync('systemctl --user start termai-agent');
    console.log('Installed as systemd user service');
    console.log(`  Service file: ${servicePath}`);
    console.log('  Commands:');
    console.log('    systemctl --user status termai-agent');
    console.log('    systemctl --user restart termai-agent');
    
  } else if (platform === 'win32') {
    // Windows: Create scheduled task to run at login
    const taskName = 'TermAI Local Agent';
    const vbsPath = path.join(CONFIG_DIR, 'start-agent.vbs');
    
    // Create VBS wrapper to run without visible console
    const vbs = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${process.execPath}"" ""${scriptPath}""", 0, False
`;
    fs.writeFileSync(vbsPath, vbs);
    
    try {
      execSync(`schtasks /create /tn "${taskName}" /tr "wscript.exe ""${vbsPath}""" /sc onlogon /rl highest /f`, { stdio: 'pipe' });
      console.log('Installed as Windows scheduled task');
      console.log(`  Task name: ${taskName}`);
      console.log(`  Script: ${vbsPath}`);
    } catch (error) {
      console.error('Failed to create scheduled task. Try running as Administrator.');
      console.error(error.message);
      process.exit(1);
    }
  }
  
  console.log(`\nConfiguration directory: ${CONFIG_DIR}`);
  console.log('The agent will now start automatically when you log in.');
};

/**
 * Uninstall auto-start service
 */
const uninstallService = () => {
  const platform = os.platform();
  
  console.log('Uninstalling TermAI Local Agent service...\n');
  
  if (platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.termai.localagent.plist');
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
    } catch { /* ignore */ }
    if (fs.existsSync(plistPath)) {
      fs.unlinkSync(plistPath);
    }
    console.log('Removed macOS LaunchAgent');
    
  } else if (platform === 'linux') {
    const servicePath = path.join(os.homedir(), '.config/systemd/user/termai-agent.service');
    try {
      execSync('systemctl --user stop termai-agent', { stdio: 'pipe' });
      execSync('systemctl --user disable termai-agent', { stdio: 'pipe' });
    } catch { /* ignore */ }
    if (fs.existsSync(servicePath)) {
      fs.unlinkSync(servicePath);
    }
    execSync('systemctl --user daemon-reload');
    console.log('Removed systemd user service');
    
  } else if (platform === 'win32') {
    const taskName = 'TermAI Local Agent';
    try {
      execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: 'pipe' });
    } catch { /* ignore */ }
    const vbsPath = path.join(CONFIG_DIR, 'start-agent.vbs');
    if (fs.existsSync(vbsPath)) {
      fs.unlinkSync(vbsPath);
    }
    console.log('Removed Windows scheduled task');
  }
  
  console.log('\nThe agent will no longer start automatically.');
  console.log(`Note: Configuration in ${CONFIG_DIR} was NOT deleted.`);
};

/**
 * Check agent status
 */
const checkStatus = async () => {
  console.log('Checking TermAI Local Agent status...\n');
  
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`);
    if (response.ok) {
      const data = await response.json();
      console.log('Status: RUNNING');
      console.log(`Version: ${data.version}`);
      console.log(`Platform: ${data.platform}`);
      console.log(`Hostname: ${data.hostname}`);
      console.log(`Port: ${PORT}`);
    } else {
      console.log('Status: ERROR (unhealthy response)');
    }
  } catch {
    console.log('Status: NOT RUNNING');
    console.log(`\nTo start the agent, run: node ${path.basename(__filename)}`);
  }
  
  console.log(`\nConfiguration directory: ${CONFIG_DIR}`);
  console.log(`Config file exists: ${fs.existsSync(CONFIG_FILE)}`);
  console.log(`Env file exists: ${fs.existsSync(ENV_FILE)}`);
};

// =============================================================================
// COMMAND EXECUTION (Ported from engine-core shellStrategy)
// =============================================================================

/**
 * Execute a shell command
 */
const shellExec = (command, cwd = os.homedir(), timeout = 60000) => {
  return new Promise((resolve, reject) => {
    log(`Executing command: ${command} in ${cwd}`);
    
    // Explicitly set shell to avoid ENOENT issues
    const shell = process.env.SHELL || (os.platform() === 'win32' ? process.env.COMSPEC || 'cmd.exe' : '/bin/bash');
    
    exec(command, { cwd, timeout, shell }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          log(`Command timed out: ${command}`, 'ERROR');
          reject(new Error(`Command timed out after ${timeout}ms`));
          return;
        }
        log(`Command failed: ${error.message}`, 'ERROR');
        // Return stderr as error message if available
        reject(new Error(stderr || error.message));
        return;
      }
      
      log(`Command completed successfully`);
      if (stderr) {
        log(`Command stderr: ${stderr}`, 'WARN');
      }
      
      resolve({ 
        stdout: stdout || '', 
        stderr: stderr || '' 
      });
    });
  });
};

// =============================================================================
// REQUEST HANDLER
// =============================================================================

const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
};

const requestHandler = async (req, res) => {
  const origin = req.headers.origin || '';
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // Health check
    if (pathname === '/health' && req.method === 'GET') {
      return jsonResponse(res, { 
        status: 'ok', 
        version: VERSION,
        platform: os.platform(),
        hostname: os.hostname(),
        configDir: CONFIG_DIR,
      }, 200, origin);
    }

    // Get drives
    if (pathname === '/drives' && req.method === 'GET') {
      const drives = getDrives();
      return jsonResponse(res, { drives }, 200, origin);
    }

    // List directory
    if (pathname === '/list' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.path) {
        return jsonResponse(res, { error: 'Path is required' }, 400, origin);
      }
      const result = listDirectory(body.path, body.showHidden);
      return jsonResponse(res, result, 200, origin);
    }

    // Execute command
    if (pathname === '/exec' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.command) {
        return jsonResponse(res, { error: 'Command is required' }, 400, origin);
      }
      
      try {
        const result = await shellExec(body.command, body.cwd, body.timeout);
        return jsonResponse(res, { success: true, ...result }, 200, origin);
      } catch (error) {
        return jsonResponse(res, { success: false, error: error.message }, 500, origin);
      }
    }

    // Get all API keys (masked for security)
    if (pathname === '/config' && req.method === 'GET') {
      const env = loadEnv();
      const config = loadConfig();
      
      // Mask API keys for security (only show last 4 chars)
      const maskedEnv = {};
      Object.entries(env).forEach(([key, value]) => {
        if (key.includes('KEY') || key.includes('SECRET')) {
          maskedEnv[key] = value.length > 4 ? `****${value.slice(-4)}` : '****';
        } else {
          maskedEnv[key] = value;
        }
      });
      
      return jsonResponse(res, { 
        env: maskedEnv,
        config,
        hasKeys: {
          gemini: !!env.GEMINI_API_KEY,
          openai: !!env.OPENAI_API_KEY,
          anthropic: !!env.ANTHROPIC_API_KEY,
          openrouter: !!env.OPENROUTER_API_KEY,
          ollama: !!env.OLLAMA_ENDPOINT,
        }
      }, 200, origin);
    }

    // Get specific API key (full value)
    if (pathname === '/config/key' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.provider) {
        return jsonResponse(res, { error: 'Provider is required' }, 400, origin);
      }
      const key = getApiKey(body.provider);
      return jsonResponse(res, { 
        provider: body.provider,
        key,
        hasKey: !!key,
      }, 200, origin);
    }

    // Set API key
    if (pathname === '/config/key' && req.method === 'PUT') {
      const body = await parseBody(req);
      if (!body.provider) {
        return jsonResponse(res, { error: 'Provider is required' }, 400, origin);
      }
      const success = setApiKey(body.provider, body.key);
      if (success) {
        log(`API key ${body.key ? 'set' : 'removed'} for provider: ${body.provider}`);
        return jsonResponse(res, { success: true }, 200, origin);
      } else {
        return jsonResponse(res, { error: 'Failed to save API key' }, 500, origin);
      }
    }

    // Get settings
    if (pathname === '/settings' && req.method === 'GET') {
      const config = loadConfig();
      return jsonResponse(res, { settings: config }, 200, origin);
    }

    // Save settings
    if (pathname === '/settings' && req.method === 'POST') {
      const body = await parseBody(req);
      const config = loadConfig();
      const updated = { ...config, ...body };
      const success = saveConfig(updated);
      if (success) {
        return jsonResponse(res, { success: true, settings: updated }, 200, origin);
      } else {
        return jsonResponse(res, { error: 'Failed to save settings' }, 500, origin);
      }
    }

    // 404
    jsonResponse(res, { error: 'Not found' }, 404, origin);
    
  } catch (error) {
    log(`Request error: ${error.message}`, 'ERROR');
    jsonResponse(res, { error: error.message }, 500, origin);
  }
};

// =============================================================================
// MAIN
// =============================================================================

const args = process.argv.slice(2);

if (args.includes('--install')) {
  installService();
  process.exit(0);
}

if (args.includes('--uninstall')) {
  uninstallService();
  process.exit(0);
}

if (args.includes('--status')) {
  checkStatus();
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
TermAI Local Agent v${VERSION}

Usage:
  node local-agent.cjs              Run the agent
  node local-agent.cjs --install    Install as auto-start service
  node local-agent.cjs --uninstall  Remove auto-start service
  node local-agent.cjs --status     Check if agent is running
  node local-agent.cjs --help       Show this help

Environment Variables:
  TERMAI_AGENT_PORT    Port to listen on (default: 3010)
  TERMAI_AGENT_CORS    Set to 'strict' to limit CORS origins

Configuration:
  Config directory: ${CONFIG_DIR}
  Config file: ${CONFIG_FILE}
  Env file: ${ENV_FILE}
  Log file: ${LOG_FILE}
`);
  process.exit(0);
}

// Check if already running
const checkIfRunning = async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`, { 
      signal: AbortSignal.timeout(1000) 
    });
    if (response.ok) {
      console.log(`TermAI Local Agent is already running on port ${PORT}`);
      console.log('Use --status to check status or kill the existing process first.');
      process.exit(1);
    }
  } catch {
    // Not running, good to start
  }
};

// Start server
const startServer = async () => {
  await checkIfRunning();
  
  const server = http.createServer(requestHandler);
  
  server.listen(PORT, '127.0.0.1', () => {
    if (!process.env.TERMAI_DAEMON) {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    TermAI Local Agent v${VERSION.padEnd(23)}║
╠═══════════════════════════════════════════════════════════════╣
║  Status:      Running                                         ║
║  Address:     http://127.0.0.1:${PORT.toString().padEnd(32)}║
║  Platform:    ${os.platform().padEnd(44)}║
║  Config Dir:  ~/.termai/                                      ║
╚═══════════════════════════════════════════════════════════════╝

Endpoints:
  GET  /health      - Health check
  GET  /drives      - List local drives
  POST /list        - List directory contents
  GET  /config      - Get stored API keys (masked)
  POST /config/key  - Get specific API key
  PUT  /config/key  - Set API key
  GET  /settings    - Get settings
  POST /settings    - Save settings

To install as auto-start service: node local-agent.cjs --install

Press Ctrl+C to stop.
`);
    }
    log(`Agent started on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    log('Shutting down...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startServer();
