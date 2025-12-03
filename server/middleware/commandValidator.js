/**
 * Command Validation Middleware
 * Validates commands before execution to prevent dangerous operations
 */

const { checkCommand, sanitizeForLog } = require("../config/blocklist");

/**
 * Patterns that indicate the "command" is actually output from a previous command
 */
const OUTPUT_PATTERNS = [
  /^up to date/i,
  /^found \d+ vulnerabilities/i,
  /^npm warn/i,
  /^npm notice/i,
  /^added \d+ packages/i,
  /^removed \d+ packages/i,
  /^audited \d+ packages/i,
  /^total \d+/i,
  /^drwx/, // ls -la output
  /^-rw/, // ls -la output
  /^├──/, // tree output
  /^└──/, // tree output
  /^│/, // tree output
  /^\s*\d+\s+\w+\s+\w+/, // ps aux output
  /^LISTEN\s/i,
  /^tcp\s/i,
  /^udp\s/i,
  /^Python version:/i,
  /^✅/,
  /^❌/,
  /^Traceback/i,
  /^File "/i,
  /^src\/.*\/$/, // Directory structure output
  /^\s{4,}/, // Lines starting with 4+ spaces (indented output)
];

/**
 * Patterns that indicate error messages being re-executed
 */
const ERROR_PATTERNS = [
  /no such file or directory:/i,
  /command not found/i,
  /Permission denied/i,
  /cannot access/i,
  /not a directory/i,
  /is a directory/i,
  /syntax error/i,
];

/**
 * Check if text looks like command output rather than a command
 */
function looksLikeOutput(text) {
  return OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if text contains error messages
 */
function containsErrorMessage(text) {
  return ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if text is a valid command structure
 */
function hasValidCommandStructure(text) {
  // Must start with something that looks like a command
  const validStartPatterns = [
    /^[a-z_][a-z0-9_.-]*(\s|$)/i, // command name (ls, git, npm, etc.)
    /^\.\//, // ./script
    /^~\//, // ~/path
    /^\//, // /absolute/path
    /^\$\(/, // $(subshell)
    /^if\s/i, // if statement
    /^for\s/i, // for loop
    /^while\s/i, // while loop
    /^export\s/i, // export VAR=
    /^[A-Z_]+=.*/, // VAR=value command
  ];

  return validStartPatterns.some((pattern) => pattern.test(text.trim()));
}

/**
 * Middleware to validate commands
 */
function validateCommand(req, res, next) {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  // Check if the "command" is actually output from a previous command
  if (looksLikeOutput(command)) {
    console.warn(
      `[Validation] Rejected output-as-command: ${sanitizeForLog(command.substring(0, 100))}`,
    );
    return res.status(400).json({
      error: "Invalid command: appears to be command output, not a command",
      hint: "The AI may have confused output with a command. Please try again.",
    });
  }

  // Check if the "command" contains error messages
  if (containsErrorMessage(command)) {
    console.warn(
      `[Validation] Rejected error-as-command: ${sanitizeForLog(command.substring(0, 100))}`,
    );
    return res.status(400).json({
      error: "Invalid command: contains error message text",
      hint: "The AI may have included error output in the command. Please try again.",
    });
  }

  // Check if it has valid command structure
  if (!hasValidCommandStructure(command)) {
    console.warn(
      `[Validation] Rejected invalid structure: ${sanitizeForLog(command.substring(0, 100))}`,
    );
    return res.status(400).json({
      error: "Invalid command structure",
      hint: "The command doesn't appear to be a valid shell command.",
    });
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
