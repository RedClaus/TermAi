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
const { requestLogger, logError } = require("./middleware/logger");
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
// LLM Routes (with strict rate limiting)
// ===========================================
app.use("/api/llm", strictRateLimiter, llmRoutes);

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

// ===========================================
// Command Execution
// ===========================================
app.post("/api/execute", sanitizeCommand, validateCommand, (req, res) => {
  const { command, cwd, commandId } = req.body;

  // Default to home dir if no cwd provided
  let currentDir = cwd ? expandHome(cwd) : os.homedir();

  // Handle "cd" command specifically
  if (command.trim().startsWith("cd ")) {
    const target = command.trim().substring(3).trim();
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
      });
    } else {
      return res.json({
        output: `cd: no such file or directory: ${target}`,
        exitCode: 1,
      });
    }
  }

  // Execute other commands with timeout
  const timeout = 120000; // 2 minutes
  const child = exec(
    command,
    {
      cwd: currentDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    },
    (error, stdout, stderr) => {
      if (commandId) delete activeProcesses[commandId];

      if (error) {
        return res.json({
          output: stderr || error.message,
          exitCode: error.code || 1,
          warning: req.commandWarning,
        });
      }

      return res.json({
        output: stdout,
        exitCode: 0,
        warning: req.commandWarning,
      });
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

io.on("connection", (socket) => {
  let ptyProcess = null;

  console.log(`[WebSocket] Client connected: ${socket.id}`);

  socket.on("spawn", ({ command, cwd, cols, rows }) => {
    const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
    const currentDir = cwd ? expandHome(cwd) : os.homedir();

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

server.listen(config.port, config.host, () => {
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
║                                                           ║
║  Security:                                                ║
║    - CORS: ${config.corsOrigins.join(", ").substring(0, 35)}...
║    - Rate Limit: ${config.rateLimit.maxRequests} req/${config.rateLimit.windowMs / 1000}s              ║
║    - Command validation: Enabled                          ║
║    - Path sandboxing: ${config.sandboxDirectory ? "Enabled" : "Home directory only"}               ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
