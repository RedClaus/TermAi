/**
 * Path Validation Middleware
 * Validates file paths to prevent directory traversal and restrict access
 */

const path = require("path");
const os = require("os");
const { config } = require("../config");

/**
 * Expand ~ to home directory
 */
function expandHome(p) {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Check if path is within allowed directory
 */
function isPathAllowed(targetPath) {
  const normalizedPath = path.normalize(path.resolve(targetPath));

  // If sandbox is configured, only allow paths within it
  if (config.sandboxDirectory) {
    const sandboxPath = path.normalize(
      path.resolve(expandHome(config.sandboxDirectory)),
    );
    return normalizedPath.startsWith(sandboxPath);
  }

  // Default: allow home directory and below
  const homePath = os.homedir();
  return normalizedPath.startsWith(homePath);
}

/**
 * List of sensitive paths that should never be accessed
 */
const sensitivePaths = [
  "/etc/passwd",
  "/etc/shadow",
  "/etc/sudoers",
  "/.ssh",
  "/id_rsa",
  "/id_ed25519",
  "/.gnupg",
  "/.aws/credentials",
  "/.config/gcloud",
  "/private/etc",
];

/**
 * Check if path accesses sensitive files
 */
function isSensitivePath(targetPath) {
  const normalizedPath = path.normalize(targetPath).toLowerCase();

  for (const sensitive of sensitivePaths) {
    if (normalizedPath.includes(sensitive.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Middleware to validate file paths
 */
function validatePath(req, res, next) {
  const filePath = req.body.path || req.body.dirPath;

  if (!filePath) {
    return res.status(400).json({ error: "Path is required" });
  }

  const expandedPath = expandHome(filePath);
  const normalizedPath = path.normalize(path.resolve(expandedPath));

  // Check for directory traversal attempts
  if (filePath.includes("..") && !isPathAllowed(normalizedPath)) {
    console.warn(`[Security] Blocked path traversal attempt: ${filePath}`);
    return res.status(403).json({
      error: "Path traversal not allowed",
    });
  }

  // Check if path is within allowed directory
  if (!isPathAllowed(normalizedPath)) {
    console.warn(
      `[Security] Blocked access to restricted path: ${normalizedPath}`,
    );
    return res.status(403).json({
      error: "Access to this path is not allowed",
    });
  }

  // Check for sensitive files
  if (isSensitivePath(normalizedPath)) {
    console.warn(
      `[Security] Blocked access to sensitive path: ${normalizedPath}`,
    );
    return res.status(403).json({
      error: "Access to sensitive files is not allowed",
    });
  }

  // Attach normalized path to request
  req.normalizedPath = normalizedPath;
  req.expandedPath = expandedPath;

  next();
}

/**
 * Middleware specifically for read operations (more restrictive)
 */
function validateReadPath(req, res, next) {
  // Additional checks for read operations can go here
  validatePath(req, res, next);
}

/**
 * Middleware specifically for write operations (more restrictive)
 */
function validateWritePath(req, res, next) {
  const filePath = req.body.path;

  // Prevent writing to certain file types
  const dangerousExtensions = [
    ".sh",
    ".bash",
    ".zsh",
    ".profile",
    ".bashrc",
    ".zshrc",
  ];
  const ext = path.extname(filePath).toLowerCase();

  if (dangerousExtensions.includes(ext)) {
    // Allow but warn
    console.warn(`[Security] Write to shell config file: ${filePath}`);
  }

  validatePath(req, res, next);
}

module.exports = {
  expandHome,
  isPathAllowed,
  isSensitivePath,
  validatePath,
  validateReadPath,
  validateWritePath,
};
