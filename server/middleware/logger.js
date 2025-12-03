/**
 * Request Logger Middleware
 * Logs all requests with timing and security-relevant information
 * Supports session-based logging with separate log files per session
 */

const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const { sanitizeForLog } = require("../config/blocklist");

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Session logs directory
const sessionLogsDir = path.join(logsDir, "sessions");
if (!fs.existsSync(sessionLogsDir)) {
  fs.mkdirSync(sessionLogsDir, { recursive: true });
}

// Track active sessions
const activeSessions = new Map();

/**
 * Format log entry
 */
function formatLogEntry(data) {
  const timestamp = new Date().toISOString();
  return JSON.stringify({ timestamp, ...data });
}

/**
 * Format human-readable log entry
 */
function formatReadableEntry(data) {
  const timestamp = new Date().toISOString();
  const { type, ...rest } = data;
  return `[${timestamp}] [${type || "INFO"}] ${JSON.stringify(rest)}`;
}

/**
 * Write to main log file
 */
function writeToLog(entry) {
  if (config.logging.level === "none") return;

  try {
    fs.appendFileSync(config.logging.file, entry + "\n");
  } catch (error) {
    console.error("[Logger] Failed to write to log file:", error.message);
  }
}

/**
 * Write to session log file
 */
function writeToSessionLog(sessionId, entry) {
  if (!sessionId || config.logging.level === "none") return;

  const sessionLogFile = path.join(sessionLogsDir, `session_${sessionId}.log`);

  try {
    fs.appendFileSync(sessionLogFile, entry + "\n");
  } catch (error) {
    console.error(
      `[Logger] Failed to write to session log ${sessionId}:`,
      error.message,
    );
  }
}

/**
 * Start a new session log
 */
function startSessionLog(sessionId) {
  if (!sessionId) return;

  const sessionLogFile = path.join(sessionLogsDir, `session_${sessionId}.log`);
  const startTime = new Date().toISOString();

  activeSessions.set(sessionId, {
    startTime,
    logFile: sessionLogFile,
  });

  const header = `
================================================================================
Session: ${sessionId}
Started: ${startTime}
================================================================================
`;

  try {
    fs.appendFileSync(sessionLogFile, header);
  } catch (error) {
    console.error(
      `[Logger] Failed to start session log ${sessionId}:`,
      error.message,
    );
  }

  console.log(`[Logger] Session log started: ${sessionLogFile}`);
  return sessionLogFile;
}

/**
 * End a session log
 */
function endSessionLog(sessionId) {
  if (!sessionId || !activeSessions.has(sessionId)) return;

  const session = activeSessions.get(sessionId);
  const endTime = new Date().toISOString();

  const footer = `
================================================================================
Session Ended: ${endTime}
Duration: ${new Date(endTime) - new Date(session.startTime)}ms
================================================================================
`;

  try {
    fs.appendFileSync(session.logFile, footer);
  } catch (error) {
    console.error(
      `[Logger] Failed to end session log ${sessionId}:`,
      error.message,
    );
  }

  activeSessions.delete(sessionId);
  console.log(`[Logger] Session log ended: ${session.logFile}`);
}

/**
 * Log a session event
 */
function logSessionEvent(sessionId, event, details = {}) {
  if (!sessionId) return;

  // Auto-start session log if not exists
  if (!activeSessions.has(sessionId)) {
    startSessionLog(sessionId);
  }

  const entry = formatReadableEntry({
    type: event,
    sessionId,
    ...details,
  });

  writeToSessionLog(sessionId, entry);

  // Also write to main log
  writeToLog(formatLogEntry({ type: event, sessionId, ...details }));
}

/**
 * Log a command execution
 */
function logCommand(sessionId, command, cwd, result = null) {
  const details = {
    command: sanitizeForLog(command),
    cwd,
  };

  if (result) {
    details.exitCode = result.exitCode;
    details.outputLength = result.output?.length || 0;
  }

  logSessionEvent(sessionId, "COMMAND", details);
}

/**
 * Log an AI interaction
 */
function logAIInteraction(
  sessionId,
  provider,
  model,
  inputLength,
  outputLength,
) {
  logSessionEvent(sessionId, "AI_CHAT", {
    provider,
    model,
    inputLength,
    outputLength,
  });
}

/**
 * Log a file operation
 */
function logFileOperation(sessionId, operation, filePath, success = true) {
  logSessionEvent(sessionId, "FILE_OP", {
    operation,
    path: filePath,
    success,
  });
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Extract session ID from request
  const sessionId =
    req.body?.sessionId || req.query?.sessionId || req.headers["x-session-id"];

  // Capture original end function
  const originalEnd = res.end;

  res.end = function (...args) {
    const duration = Date.now() - startTime;

    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("user-agent"),
      sessionId,
    };

    // Add command info for execute endpoints
    if (req.path === "/api/execute" && req.body?.command) {
      logData.command = sanitizeForLog(req.body.command);
      logData.cwd = req.body.cwd;
    }

    // Add warning info if present
    if (req.commandWarning) {
      logData.warning = req.commandWarning;
    }

    // Log to console
    const logLevel =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    if (config.logging.level === "debug" || logLevel !== "info") {
      console[logLevel](
        `[${req.method}] ${req.path} ${res.statusCode} ${duration}ms`,
      );
    }

    // Write to main log file
    writeToLog(formatLogEntry(logData));

    // Write to session log if session ID present
    if (sessionId) {
      writeToSessionLog(
        sessionId,
        formatReadableEntry({ type: "REQUEST", ...logData }),
      );
    }

    // Call original end
    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Security event logger
 */
function logSecurityEvent(event, details) {
  const entry = formatLogEntry({
    type: "SECURITY",
    event,
    ...details,
  });

  console.warn(`[Security] ${event}:`, details);
  writeToLog(entry);

  // Also log to session if available
  if (details.sessionId) {
    logSessionEvent(details.sessionId, "SECURITY", { event, ...details });
  }
}

/**
 * Error logger
 */
function logError(error, req = null) {
  const sessionId =
    req?.body?.sessionId ||
    req?.query?.sessionId ||
    req?.headers["x-session-id"];

  const entry = formatLogEntry({
    type: "ERROR",
    message: error.message,
    stack: error.stack,
    path: req?.path,
    method: req?.method,
    sessionId,
  });

  console.error("[Error]", error.message);
  writeToLog(entry);

  // Also log to session if available
  if (sessionId) {
    logSessionEvent(sessionId, "ERROR", {
      message: error.message,
      path: req?.path,
    });
  }
}

/**
 * Get list of session log files
 */
function getSessionLogs() {
  try {
    const files = fs.readdirSync(sessionLogsDir);
    return files
      .filter((f) => f.startsWith("session_") && f.endsWith(".log"))
      .map((f) => {
        const stats = fs.statSync(path.join(sessionLogsDir, f));
        return {
          filename: f,
          sessionId: f.replace("session_", "").replace(".log", ""),
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        };
      })
      .sort((a, b) => b.modified - a.modified);
  } catch (error) {
    console.error("[Logger] Failed to list session logs:", error.message);
    return [];
  }
}

/**
 * Read a session log file
 */
function readSessionLog(sessionId) {
  const sessionLogFile = path.join(sessionLogsDir, `session_${sessionId}.log`);

  try {
    if (fs.existsSync(sessionLogFile)) {
      return fs.readFileSync(sessionLogFile, "utf-8");
    }
    return null;
  } catch (error) {
    console.error(
      `[Logger] Failed to read session log ${sessionId}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Delete a session log file
 */
function deleteSessionLog(sessionId) {
  const sessionLogFile = path.join(sessionLogsDir, `session_${sessionId}.log`);

  try {
    if (fs.existsSync(sessionLogFile)) {
      fs.unlinkSync(sessionLogFile);
      // Also remove from active sessions if present
      activeSessions.delete(sessionId);
      console.log(`[Logger] Deleted session log: ${sessionId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(
      `[Logger] Failed to delete session log ${sessionId}:`,
      error.message,
    );
    return false;
  }
}

module.exports = {
  requestLogger,
  logSecurityEvent,
  logError,
  startSessionLog,
  endSessionLog,
  logSessionEvent,
  logCommand,
  logAIInteraction,
  logFileOperation,
  getSessionLogs,
  readSessionLog,
  deleteSessionLog,
};
