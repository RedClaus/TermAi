/**
 * TermAi Backend Server
 * Handles command execution, file system operations, and LLM proxying
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const pty = require("node-pty");

// Import configuration and middleware
const { config } = require("./config");
const {
  requestLogger,
  logError,
  logCommand,
  getSessionLogs,
  readSessionLog,
  startSessionLog,
  endSessionLog,
} = require("./middleware/logger");
const { rateLimiter, strictRateLimiter } = require("./middleware/rateLimiter");
const {
  validateCommand,
  sanitizeCommand,
} = require("./middleware/commandValidator");
const {
  validatePath,
  validateReadPath,
  validateWritePath,
  expandHome,
} = require("./middleware/pathValidator");

// Import routes
const llmRoutes = require("./routes/llm");
const knowledgeRoutes = require("./routes/knowledge");
const promptsRoutes = require("./routes/prompts");
const flowsRoutes = require("./routes/flows");
const ingestionRoutes = require("./routes/ingestion");
const contextRoutes = require("./routes/context");
const frameworksRoutes = require("./routes/frameworks");
const ptyRoutes = require("./routes/pty");

// Import Knowledge Engine
const { startWatcher, getKnowledgeEngine } = require("./services/KnowledgeEngine");

// Import Ingestion Service
const { getIngestionService } = require("./services/IngestionService");

// Import Hybrid Socket Handlers (optional - for PTY + AI integration)
const { setupSocketHandlers } = require("./socket");

const app = express();
const server = http.createServer(app);

// ===========================================
// CORS Configuration
// ===========================================
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (
      config.corsOrigins.includes("*") ||
      config.corsOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// Socket.io with CORS
const io = new Server(server, {
  cors: corsOptions,
});

// ===========================================
// Middleware Stack
// ===========================================
app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(requestLogger);
app.use(rateLimiter);

// Trust proxy for correct IP detection
app.set("trust proxy", 1);

// ===========================================
// Health Check
// ===========================================
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ===========================================
// Initial CWD - Returns the directory where TermAI CLI was launched
// ===========================================
app.get("/api/initial-cwd", (req, res) => {
  // TERMAI_LAUNCH_CWD is set by the CLI when starting the server
  // Falls back to HOME directory if not launched via CLI
  const launchCwd = process.env.TERMAI_LAUNCH_CWD || os.homedir();
  
  // Verify the directory exists
  const resolvedPath = expandHome(launchCwd);
  if (fs.existsSync(resolvedPath)) {
    res.json({
      cwd: resolvedPath,
      isCliLaunch: !!process.env.TERMAI_LAUNCH_CWD,
    });
  } else {
    // Fall back to home if the launch directory doesn't exist anymore
    res.json({
      cwd: os.homedir(),
      isCliLaunch: false,
    });
  }
});

// ===========================================
// Client Info (for system detection)
// ===========================================
app.get("/api/client-info", (req, res) => {
  // Get client IP from various headers (handles proxies)
  const clientIP =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    req.ip ||
    "Unknown";

  // Get server's local IP addresses
  const networkInterfaces = os.networkInterfaces();
  const serverIPs = [];
  for (const iface of Object.values(networkInterfaces)) {
    for (const addr of iface || []) {
      if (addr.family === "IPv4" && !addr.internal) {
        serverIPs.push(addr.address);
      }
    }
  }

  // Get server OS info
  const serverOS = {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
  };

  res.json({
    clientIP: clientIP.replace("::ffff:", ""), // Clean IPv6-mapped IPv4
    serverIP: serverIPs[0] || "127.0.0.1",
    serverIPs,
    serverOS,
    timestamp: new Date().toISOString(),
  });
});

// ===========================================
// Session Logging API
// ===========================================

// Start a new session log
app.post("/api/session/start", (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  const logFile = startSessionLog(sessionId);
  res.json({ success: true, logFile });
});

// End a session log
app.post("/api/session/end", (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  endSessionLog(sessionId);
  res.json({ success: true });
});

// List all session logs
app.get("/api/session/logs", (req, res) => {
  const logs = getSessionLogs();
  res.json({ logs });
});

// Get a specific session log
app.get("/api/session/logs/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const content = readSessionLog(sessionId);
  if (content === null) {
    return res.status(404).json({ error: "Session log not found" });
  }
  res.json({ sessionId, content });
});

// Delete a session log
app.delete("/api/session/logs/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const { deleteSessionLog } = require("./middleware/logger");
  
  const success = deleteSessionLog(sessionId);
  if (!success) {
    return res.status(404).json({ error: "Session log not found or could not be deleted" });
  }
  res.json({ success: true, message: `Session log ${sessionId} deleted` });
});

// ===========================================
// LLM Routes (Rate limiting handled per-route)
// ===========================================
app.use("/api/llm", llmRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/prompts", promptsRoutes);
app.use("/api/flows", flowsRoutes);
app.use("/api/ingestion", ingestionRoutes);
app.use("/api/context", contextRoutes);
app.use("/api/frameworks", frameworksRoutes);
app.use("/api/pty", ptyRoutes);

// ===========================================
// Process Management
// ===========================================
const activeProcesses = {};

app.post("/api/cancel", (req, res) => {
  const { commandId } = req.body;

  if (!commandId) {
    return res.status(400).json({ error: "commandId is required" });
  }

  if (activeProcesses[commandId]) {
    try {
      process.kill(activeProcesses[commandId].pid);
      delete activeProcesses[commandId];
      res.json({ success: true, message: "Process cancelled" });
    } catch (e) {
      logError(e, req);
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(404).json({ error: "Process not found" });
  }
});

// Helper to find a valid shell
const getValidShell = () => {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }

  // 1. Trust the environment variable if set
  if (process.env.SHELL) {
    console.log(`[Shell Detection] Trusting process.env.SHELL: ${process.env.SHELL}`);
    return process.env.SHELL;
  }

  // 2. Platform specific defaults (blind trust)
  if (os.platform() === 'darwin') {
    console.log('[Shell Detection] macOS detected, defaulting to /bin/zsh');
    return '/bin/zsh';
  }

  // 3. Linux/Unix candidates
  const candidates = [
    '/bin/bash',
    '/usr/bin/bash',
    '/bin/sh',
    '/bin/ash'
  ];

  for (const shell of candidates) {
    try {
      if (fs.existsSync(shell)) {
        console.log(`[Shell Detection] Found shell: ${shell}`);
        return shell;
      }
    } catch (e) {
      // Ignore
    }
  }

  console.log('[Shell Detection] Fallback to /bin/sh');
  return '/bin/sh';
};

// ===========================================
// Debug Endpoint for Shell
// ===========================================
app.get("/api/debug/shell", (req, res) => {
  const shell = getValidShell();
  const env = process.env.SHELL;
  const platform = os.platform();
  
  res.json({
    selectedShell: shell,
    envShell: env,
    platform,
    path: process.env.PATH,
    candidatesChecked: true
  });
});

// ===========================================
// Command Execution
// ===========================================
app.post("/api/execute", sanitizeCommand, validateCommand, (req, res) => {
  const { command, cwd, commandId, sessionId } = req.body;

  // Default to home dir if no cwd provided
  let currentDir = cwd ? expandHome(cwd) : os.homedir();
  let cwdCorrected = false;
  const originalCwd = currentDir;
  
  // Validate cwd exists on this server - fall back to home if not
  // This handles cases where client (Mac browser) sends a path that doesn't exist on server (Ubuntu)
  if (!fs.existsSync(currentDir) || !fs.lstatSync(currentDir).isDirectory()) {
    console.warn(`[Execute] CWD VALIDATION FAILED: "${currentDir}" does not exist on this server`);
    console.warn(`[Execute] Falling back to home directory: ${os.homedir()}`);
    
    // Check if this looks like a path from another OS (e.g. /Users on Linux)
    let reason = "Directory does not exist.";
    if (os.platform() === 'linux' && currentDir.startsWith('/Users')) {
      reason = "Path looks like a macOS directory, but this server is running Linux.";
    } else if (os.platform() === 'win32' && currentDir.startsWith('/')) {
      reason = "Path looks like a Unix directory, but this server is running Windows.";
    }

    currentDir = os.homedir();
    cwdCorrected = true;
    
    // Attach specific fallback info for frontend
    req.cwdFallback = {
      originalPath: originalCwd,
      serverPath: currentDir,
      reason
    };
  } else {
    console.log(`[Execute] CWD validated OK: "${currentDir}"`);
  }

  // Handle standalone "cd" command specifically (not compound commands like "cd x && y")
  const trimmedCmd = command.trim();
  const isCompoundCommand = /[;&|]/.test(trimmedCmd);

  if (trimmedCmd.startsWith("cd ") && !isCompoundCommand) {
    const target = trimmedCmd.substring(3).trim();
    let newDir = target;

    if (target === "~") {
      newDir = os.homedir();
    } else if (target === "..") {
      newDir = path.resolve(currentDir, "..");
    } else if (target.startsWith("~")) {
      newDir = expandHome(target);
    } else {
      newDir = path.resolve(currentDir, target);
    }

    // Verify directory exists
    if (fs.existsSync(newDir) && fs.lstatSync(newDir).isDirectory()) {
      return res.json({
        output: "",
        exitCode: 0,
        newCwd: newDir,
        warning: req.commandWarning,
        cwdFallback: req.cwdFallback // Pass fallback info if present
      });
    } else {
      const errorResponse = {
        output: `cd: no such file or directory: ${target}`,
        exitCode: 1,
        cwdFallback: req.cwdFallback // Pass fallback info if present
      };
      if (cwdCorrected) {
        errorResponse.newCwd = currentDir;
      }
      return res.json(errorResponse);
    }
  }

  // Execute other commands with timeout
  const timeout = 120000; // 2 minutes
  const shell = getValidShell();
  console.log(`[Execute] Running command: "${command}" using shell: ${shell}`);
  
  const child = exec(
    command,
    {
      cwd: currentDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      shell,
    },
    (error, stdout, stderr) => {
      if (commandId) delete activeProcesses[commandId];

      if (error) {
        // Log command execution
        logCommand(sessionId, command, currentDir, {
          exitCode: error.code || 1,
          output: stderr || error.message,
        });
        const errorResponse = {
          output: stderr || error.message,
          exitCode: error.code || 1,
          warning: req.commandWarning,
          cwdFallback: req.cwdFallback
        };
        // Also notify client of corrected cwd even on error
        if (cwdCorrected) {
          errorResponse.newCwd = currentDir;
        }
        return res.json(errorResponse);
      }

      // Log successful command execution
      logCommand(sessionId, command, currentDir, {
        exitCode: 0,
        output: stdout,
        cwdFallback: req.cwdFallback // Pass fallback info if present
      });
      const response = {
        output: stdout,
        exitCode: 0,
        warning: req.commandWarning,
        cwdFallback: req.cwdFallback // Pass fallback info if present
      };
      // Notify client if cwd was corrected (e.g., invalid path from another machine)
      if (cwdCorrected) {
        response.newCwd = currentDir;
      }
      return res.json(response);
    },
  );

  if (commandId) {
    activeProcesses[commandId] = child;
  }
});

// ===========================================
// File System API
// ===========================================

app.post("/api/fs/read", validateReadPath, (req, res) => {
  try {
    if (!fs.existsSync(req.normalizedPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const stats = fs.statSync(req.normalizedPath);

    // Limit file size for reading
    if (stats.size > 5 * 1024 * 1024) {
      // 5MB
      return res.status(413).json({ error: "File too large to read" });
    }

    const content = fs.readFileSync(req.normalizedPath, "utf-8");
    res.json({ content });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/fs/write", validateWritePath, (req, res) => {
  const { content } = req.body;

  if (content === undefined) {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    // Ensure parent directory exists
    const dir = path.dirname(req.normalizedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(req.normalizedPath, content, "utf-8");
    res.json({ success: true });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/fs/list", validatePath, (req, res) => {
  try {
    if (!fs.existsSync(req.normalizedPath)) {
      return res.status(404).json({ error: "Directory not found" });
    }

    const stats = fs.statSync(req.normalizedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: "Path is not a directory" });
    }

    const files = fs
      .readdirSync(req.normalizedPath, { withFileTypes: true })
      .map((dirent) => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        path: path.join(req.normalizedPath, dirent.name),
      }));

    res.json({ files });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/fs/mkdir", validatePath, (req, res) => {
  try {
    fs.mkdirSync(req.normalizedPath, { recursive: true });
    res.json({ success: true });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fs/drives
 * List mounted drives/volumes on the system
 * - Windows: Returns drive letters (C:, D:, etc.)
 * - Linux/Mac: Returns mount points from /proc/mounts or common paths
 */
app.get("/api/fs/drives", (req, res) => {
  try {
    const platform = os.platform();
    const drives = [];

    if (platform === "win32") {
      // Windows: Check for drive letters A-Z
      const { execSync } = require("child_process");
      try {
        // Use wmic to get logical disks
        const output = execSync("wmic logicaldisk get name", { encoding: "utf-8" });
        const lines = output.split("\n").filter(line => line.trim() && line.trim() !== "Name");
        lines.forEach(line => {
          const driveLetter = line.trim();
          if (driveLetter && /^[A-Z]:$/.test(driveLetter)) {
            drives.push({
              name: driveLetter,
              path: driveLetter + "\\",
              type: "drive",
            });
          }
        });
      } catch {
        // Fallback: Check common drive letters
        for (let i = 65; i <= 90; i++) {
          const letter = String.fromCharCode(i);
          const drivePath = `${letter}:\\`;
          if (fs.existsSync(drivePath)) {
            drives.push({
              name: `${letter}:`,
              path: drivePath,
              type: "drive",
            });
          }
        }
      }
    } else {
      // Linux/Mac: Common mount points and root
      drives.push({
        name: "/",
        path: "/",
        type: "root",
      });

      // Home directory
      const homeDir = os.homedir();
      drives.push({
        name: "Home",
        path: homeDir,
        type: "home",
      });

      // Check for common mount points
      const mountPoints = ["/mnt", "/media", "/Volumes"];
      
      mountPoints.forEach(mountBase => {
        if (fs.existsSync(mountBase)) {
          try {
            const entries = fs.readdirSync(mountBase, { withFileTypes: true });
            entries.forEach(entry => {
              if (entry.isDirectory()) {
                const mountPath = path.join(mountBase, entry.name);
                drives.push({
                  name: entry.name,
                  path: mountPath,
                  type: "mount",
                });
              }
            });
          } catch {
            // Skip if can't read mount point
          }
        }
      });

      // Current working directory (where TermAI was launched)
      const launchDir = process.env.TERMAI_LAUNCH_CWD || process.cwd();
      if (launchDir !== homeDir && launchDir !== "/") {
        drives.push({
          name: "Current Project",
          path: launchDir,
          type: "project",
        });
      }
    }

    res.json({ drives });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// Fix Script Download
// ===========================================
app.get("/fix.sh", (req, res) => {
  const scriptPath = path.join(__dirname, "fix.sh");
  if (fs.existsSync(scriptPath)) {
    res.setHeader("Content-Type", "text/x-shellscript");
    res.setHeader("Content-Disposition", 'attachment; filename="fix.sh"');
    const content = fs.readFileSync(scriptPath, "utf-8");
    res.send(content);
  } else {
    res.status(404).send("Script not found");
  }
});

// ===========================================
// Local Agent Download
// ===========================================

/**
 * GET /bin/local-agent.cjs
 * Serve the local agent script for download
 */
app.get("/bin/local-agent.cjs", (req, res) => {
  // Try multiple possible paths
  const possiblePaths = [
    path.resolve(__dirname, "..", "bin", "local-agent.cjs"),
    path.resolve(process.cwd(), "..", "bin", "local-agent.cjs"),
    path.resolve(process.cwd(), "bin", "local-agent.cjs"),
    "/home/normanking/github/TermAi/bin/local-agent.cjs", // Fallback absolute path
  ];
  
  let agentPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      agentPath = p;
      break;
    }
  }
  
  console.log(`[Download] Looking for local agent, found at: ${agentPath}`);
  
  if (!agentPath) {
    console.error(`[Download] Local agent not found. Tried paths:`, possiblePaths);
    return res.status(404).json({ error: "Local agent script not found" });
  }
  
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="local-agent.cjs"');
  
  // Read and send the file content directly
  const content = fs.readFileSync(agentPath, 'utf-8');
  res.send(content);
});

// ===========================================
// Ollama Proxy (for direct Ollama access)
// ===========================================

app.get("/api/proxy/ollama/tags", async (req, res) => {
  const { endpoint } = req.query;
  const baseUrl = endpoint || config.ollamaEndpoint;

  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok)
      throw new Error(`Failed to fetch: ${response.statusText}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/proxy/ollama/chat", async (req, res) => {
  const { endpoint, ...body } = req.body;
  const baseUrl = endpoint || config.ollamaEndpoint;

  console.log(
    `[Ollama Proxy] Request to ${baseUrl}/api/chat with model:`,
    body.model,
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Ollama Proxy] Error response:", errorText);
      return res.status(response.status).send(errorText);
    }

    const data = await response.text();
    console.log("[Ollama Proxy] Response received, length:", data.length);
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("[Ollama Proxy] Timeout after 2 minutes");
      res
        .status(504)
        .json({ error: "Request timeout - Ollama took too long to respond" });
    } else {
      logError(error, req);
      res.status(500).json({ error: error.message });
    }
  }
});

// ===========================================
// WebSocket / PTY (Interactive Sessions)
// ===========================================

/**
 * Get default shell for current platform
 */
function getDefaultShell() {
  const shellPaths = [
    '/bin/zsh', '/bin/bash', '/bin/sh',
    '/usr/bin/zsh', '/usr/bin/bash', '/usr/bin/sh',
    '/usr/local/bin/zsh', '/usr/local/bin/bash',
  ];
  for (const shell of shellPaths) {
    if (fs.existsSync(shell)) return shell;
  }
  return '/bin/sh';
}

// Store knowledge engine reference for socket handlers
let knowledgeEngineRef = null;

io.on("connection", (socket) => {
  let ptyProcess = null;

  console.log(`[WebSocket] Client connected: ${socket.id}`);

  // Legacy spawn handler (for background terminals)
  socket.on("spawn", ({ command, cwd, cols, rows }) => {
    const shell = os.platform() === "win32" ? "powershell.exe" : getDefaultShell();
    let currentDir = cwd ? expandHome(cwd) : os.homedir();

    // Validate cwd exists - fall back to home directory if not
    // This handles cases where client (Mac) sends a path that doesn't exist on server (Ubuntu)
    if (!fs.existsSync(currentDir)) {
      console.warn(`[WebSocket/spawn] Invalid cwd "${currentDir}", falling back to home directory`);
      currentDir = os.homedir();
    }

    console.log(`[WebSocket/spawn] Starting: "${command}" in "${currentDir}"`);

    try {
      ptyProcess = pty.spawn(shell, ["-c", command], {
        name: "xterm-color",
        cols: cols || 80,
        rows: rows || 24,
        cwd: currentDir,
        env: process.env,
      });

      ptyProcess.onData((data) => {
        socket.emit("output", data);
      });

      ptyProcess.onExit(({ exitCode }) => {
        socket.emit("exit", { exitCode });
        ptyProcess = null;
      });
    } catch (error) {
      logError(error);
      socket.emit("output", `\r\nError spawning PTY: ${error.message}\r\n`);
      socket.emit("exit", { exitCode: 1 });
    }
  });

  socket.on("input", (data) => {
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  });

  socket.on("resize", ({ cols, rows }) => {
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
  });

  socket.on("disconnect", () => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    if (ptyProcess) {
      ptyProcess.kill();
    }
  });
});

// Setup hybrid AI socket handlers (for ai:prompt, terminal:input, etc.)
// This runs in a separate namespace to avoid conflicts with legacy handlers
const hybridNamespace = io.of('/hybrid');
setupSocketHandlers(hybridNamespace, { getEngine: () => knowledgeEngineRef });

// ===========================================
// Error Handling
// ===========================================

app.use((err, req, res, next) => {
  logError(err, req);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS error: Origin not allowed" });
  }

  res.status(500).json({ error: "Internal server error" });
});

// ===========================================
// Start Server
// ===========================================

server.listen(config.port, config.host, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    TermAI Backend                         ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://${config.host}:${config.port}                    ║
║                                                           ║
║  Endpoints:                                               ║
║    POST /api/execute      - Execute commands              ║
║    POST /api/cancel       - Cancel running command        ║
║    POST /api/fs/*         - File system operations        ║
║    POST /api/llm/chat     - LLM chat (proxied)           ║
║    GET  /api/llm/has-key  - Check API key status         ║
║    POST /api/llm/set-key  - Set API key                  ║
║    GET  /api/health       - Health check                 ║
║    POST /api/knowledge/*  - Knowledge base & RAG         ║
║    POST /api/ingestion/*  - Conversation import          ║
║    POST /api/pty/*        - PTY management (REST+SSE)    ║
║                                                           ║
║  Security:                                                ║
║    - CORS: ${config.corsOrigins.join(", ").substring(0, 35)}...
║    - Rate Limit: ${config.rateLimit.maxRequests} req/${config.rateLimit.windowMs / 1000}s              ║
║    - Command validation: Enabled                          ║
║    - Path sandboxing: ${config.sandboxDirectory ? "Enabled" : "Home directory only"}               ║
╚═══════════════════════════════════════════════════════════╝
    `);

  // Initialize Knowledge Engine (non-blocking)
  try {
    const launchDir = process.env.TERMAI_LAUNCH_CWD || process.cwd();
    console.log('[KnowledgeEngine] Initializing...');
    
    const engine = await getKnowledgeEngine();
    
    if (engine && engine.isInitialized) {
      // Pass engine to routes
      knowledgeRoutes.setKnowledgeEngine(engine);
      
      // Store reference for socket handlers
      knowledgeEngineRef = engine;
      
      // Start file watcher for automatic indexing
      console.log(`[KnowledgeEngine] Starting watcher on: ${launchDir}`);
      await startWatcher(launchDir, engine);
      
      console.log('[KnowledgeEngine] ✓ Ready for semantic search');
    } else {
      console.log('[KnowledgeEngine] Not available (optional dependencies missing)');
    }
  } catch (error) {
    console.warn('[KnowledgeEngine] Failed to initialize:', error.message);
    console.warn('[KnowledgeEngine] Vector search will be disabled');
  }

  // Initialize Ingestion Service with LLM support
  try {
    const ingestionService = getIngestionService();

    // Create LLM chat function that uses our configured providers
    const llmChat = async (messages) => {
      const { getApiKey } = require('./config');

      // Try providers in order of preference
      const providers = ['openai', 'anthropic', 'gemini'];

      for (const provider of providers) {
        const apiKey = getApiKey(provider);
        if (!apiKey) continue;

        try {
          if (provider === 'openai') {
            const OpenAI = require('openai');
            const client = new OpenAI({ apiKey });
            const response = await client.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: messages.map(m => ({ role: m.role, content: m.content })),
              temperature: 0.3,
            });
            return response.choices[0].message.content;
          }

          if (provider === 'anthropic') {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey });
            const response = await client.messages.create({
              model: 'claude-3-haiku-20240307',
              max_tokens: 4096,
              messages: messages.map(m => ({ role: m.role, content: m.content })),
            });
            return response.content[0].text;
          }

          if (provider === 'gemini') {
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
            const result = await model.generateContent(prompt);
            return result.response.text();
          }
        } catch (e) {
          console.warn(`[IngestionService] LLM call failed with ${provider}:`, e.message);
          continue;
        }
      }

      throw new Error('No LLM provider available for extraction');
    };

    ingestionService.setLLMChat(llmChat);
    console.log('[IngestionService] ✓ Ready for conversation import');
  } catch (error) {
    console.warn('[IngestionService] Failed to initialize:', error.message);
  }
});

// ===========================================
// Graceful Shutdown
// ===========================================

function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  // Close HTTP server
  server.close(() => {
    console.log('[Server] HTTP server closed');

    // Cleanup PTY sessions
    try {
      const { cleanup } = require('./routes/pty');
      cleanup();
    } catch (e) {
      console.warn('[Server] PTY cleanup error:', e.message);
    }

    console.log('[Server] Shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
