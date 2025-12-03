/**
 * Command Validation Middleware
 * Validates commands before execution to prevent dangerous operations
 */

const { checkCommand, sanitizeForLog } = require("../config/blocklist");

/**
 * Middleware to validate commands
 */
function validateCommand(req, res, next) {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  const result = checkCommand(command);

  if (!result.allowed) {
    console.warn(
      `[Security] Blocked dangerous command: ${sanitizeForLog(command)}`,
    );
    return res.status(403).json({
      error: "Command blocked for security reasons",
      risk: result.risk,
      description: result.description,
    });
  }

  if (result.action === "warn") {
    // Attach warning info to request for logging
    req.commandWarning = {
      risk: result.risk,
      description: result.description,
    };
    console.warn(
      `[Security] Warning for command: ${sanitizeForLog(command)} - ${result.description}`,
    );
  }

  if (result.action === "log") {
    console.info(`[Command] ${sanitizeForLog(command)}`);
  }

  next();
}

/**
 * Middleware to sanitize command input
 */
function sanitizeCommand(req, res, next) {
  if (req.body.command) {
    // Remove null bytes and other potentially dangerous characters
    req.body.command = req.body.command.replace(/\0/g, "").trim();

    // Limit command length
    if (req.body.command.length > 10000) {
      return res.status(400).json({ error: "Command too long" });
    }
  }

  next();
}

module.exports = {
  validateCommand,
  sanitizeCommand,
};
