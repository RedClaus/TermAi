#!/usr/bin/env node

/**
 * TermAI CLI Entry Point
 * 
 * This script allows running TermAI from any directory on the system.
 * When invoked, it:
 * 1. Captures the current working directory
 * 2. Starts the backend server with the CWD context
 * 3. Starts the frontend dev server
 * 4. Opens the browser to the app
 * 
 * Usage:
 *   termai              # Run in current directory
 *   termai --help       # Show help
 *   termai --version    # Show version
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Get the directory where TermAI is installed
const TERMAI_ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(TERMAI_ROOT, 'server');

// Get the directory where the CLI was invoked
const LAUNCH_CWD = process.cwd();

// Configuration
const FRONTEND_PORT = process.env.TERMAI_FRONTEND_PORT || 5173;
const BACKEND_PORT = process.env.TERMAI_BACKEND_PORT || 3001;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function logSection(title) {
  log(`\n${colors.bright}${colors.cyan}▶ ${title}${colors.reset}`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${colors.bright}${colors.cyan}TermAI${colors.reset} - AI-Powered Terminal Assistant

${colors.bright}USAGE:${colors.reset}
  termai [options]

${colors.bright}OPTIONS:${colors.reset}
  -h, --help       Show this help message
  -v, --version    Show version number
  --port <port>    Set frontend port (default: 5173)
  --api-port <p>   Set backend API port (default: 3001)

${colors.bright}EXAMPLES:${colors.reset}
  cd ~/my-project && termai    # Start TermAI in your project directory
  termai --port 8080           # Run on a custom port

${colors.bright}ENVIRONMENT:${colors.reset}
  TERMAI_FRONTEND_PORT    Frontend port (default: 5173)
  TERMAI_BACKEND_PORT     Backend API port (default: 3001)
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require(path.join(TERMAI_ROOT, 'package.json'));
  console.log(`TermAI v${pkg.version}`);
  process.exit(0);
}

// Banner
console.log(`
${colors.bright}${colors.cyan}
╔════════════════════════════════════════╗
║           ${colors.magenta}🚀 TermAI${colors.cyan}                    ║
║      AI-Powered Terminal Assistant     ║
╚════════════════════════════════════════╝
${colors.reset}`);

log(`Working directory: ${colors.green}${LAUNCH_CWD}${colors.reset}`);
log(`TermAI location:   ${colors.dim}${TERMAI_ROOT}${colors.reset}`);

// Check if ports are available
function checkPort(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, '127.0.0.1');
    server.on('listening', () => {
      server.close();
      resolve(true);
    });
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Kill process on port (Linux/Mac)
function killPort(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors
  }
}

// Check Node.js version
function checkNodeVersion() {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major < 18) {
    log(`${colors.red}Error: Node.js 18+ required. Current: ${nodeVersion}${colors.reset}`);
    process.exit(1);
  }
}

// Install dependencies if needed
function checkDependencies() {
  const frontendModules = path.join(TERMAI_ROOT, 'node_modules');
  const serverModules = path.join(SERVER_DIR, 'node_modules');
  
  if (!fs.existsSync(frontendModules) || !fs.existsSync(serverModules)) {
    logSection('Installing dependencies...');
    execSync('npm run install:all', { cwd: TERMAI_ROOT, stdio: 'inherit' });
  }
}

// Main startup function
async function start() {
  checkNodeVersion();
  
  logSection('Checking dependencies...');
  checkDependencies();
  
  // Check and free ports if needed
  logSection('Checking ports...');
  
  const frontendAvailable = await checkPort(FRONTEND_PORT);
  const backendAvailable = await checkPort(BACKEND_PORT);
  
  if (!frontendAvailable) {
    log(`Port ${FRONTEND_PORT} in use, attempting to free...`, colors.yellow);
    killPort(FRONTEND_PORT);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  if (!backendAvailable) {
    log(`Port ${BACKEND_PORT} in use, attempting to free...`, colors.yellow);
    killPort(BACKEND_PORT);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Set environment variable for the launch CWD
  process.env.TERMAI_LAUNCH_CWD = LAUNCH_CWD;
  
  logSection('Starting TermAI...');
  
  // Start backend server
  const serverEnv = {
    ...process.env,
    TERMAI_LAUNCH_CWD: LAUNCH_CWD,
    PORT: BACKEND_PORT.toString(),
  };
  
  const server = spawn('node', ['index.js'], {
    cwd: SERVER_DIR,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  
  server.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) log(`${colors.dim}[server]${colors.reset} ${msg}`);
  });
  
  server.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) log(`${colors.red}[server]${colors.reset} ${msg}`);
  });
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Start frontend
  const frontendEnv = {
    ...process.env,
    VITE_LAUNCH_CWD: LAUNCH_CWD,
  };
  
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: TERMAI_ROOT,
    env: frontendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  
  frontend.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      log(`${colors.dim}[vite]${colors.reset} ${msg}`);
      
      // Open browser when ready
      if (msg.includes('Local:') || msg.includes('ready')) {
        setTimeout(() => {
          const url = `http://localhost:${FRONTEND_PORT}`;
          log(`\n${colors.green}${colors.bright}✓ TermAI is ready!${colors.reset}`);
          log(`  ${colors.cyan}${url}${colors.reset}\n`);
          
          // Try to open browser
          try {
            const opener = process.platform === 'darwin' ? 'open' :
                          process.platform === 'win32' ? 'start' : 'xdg-open';
            spawn(opener, [url], { detached: true, stdio: 'ignore' });
          } catch (e) {
            log(`Open ${url} in your browser`, colors.yellow);
          }
        }, 500);
      }
    }
  });
  
  frontend.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    // Filter out noise
    if (msg && !msg.includes('deprecated') && !msg.includes('ExperimentalWarning')) {
      log(`${colors.yellow}[vite]${colors.reset} ${msg}`);
    }
  });
  
  // Handle cleanup on exit
  const cleanup = () => {
    log('\n\nShutting down TermAI...', colors.yellow);
    server.kill();
    frontend.kill();
    killPort(FRONTEND_PORT);
    killPort(BACKEND_PORT);
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
  
  // Keep process running
  await new Promise(() => {});
}

start().catch((err) => {
  log(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
