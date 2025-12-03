/**
 * Request Logger Middleware
 * Logs all requests with timing and security-relevant information
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

/**
 * Format log entry
 */
function formatLogEntry(data) {
  const timestamp = new Date().toISOString();
  return JSON.stringify({ timestamp, ...data });
}

/**
 * Write to log file
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
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();

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

    // Write to file
    writeToLog(formatLogEntry(logData));

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
}

/**
 * Error logger
 */
function logError(error, req = null) {
  const entry = formatLogEntry({
    type: "ERROR",
    message: error.message,
    stack: error.stack,
    path: req?.path,
    method: req?.method,
  });

  console.error("[Error]", error.message);
  writeToLog(entry);
}

module.exports = {
  requestLogger,
  logSecurityEvent,
  logError,
};
