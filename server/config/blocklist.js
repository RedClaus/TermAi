/**
 * Command blocklist for dangerous operations
 * These patterns will be blocked or require confirmation
 */

const blockedPatterns = [
  // Critical - System destruction
  {
    pattern: /(?:^|\s|;|&&|\|)\s*rm\s+(-[a-zA-Z]*)?(\s+-[a-zA-Z]*)?\s*\/(?!\w)/,
    risk: "critical",
    description: "Recursive deletion from root filesystem",
    action: "block",
  },
  {
    pattern:
      /(?:^|\s|;|&&|\|)\s*rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*R[a-zA-Z]*)\s+~/,
    risk: "critical",
    description: "Recursive deletion of home directory",
    action: "block",
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    risk: "critical",
    description: "Fork bomb - system resource exhaustion",
    action: "block",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*mkfs/,
    risk: "critical",
    description: "Filesystem format - data destruction",
    action: "block",
  },
  {
    pattern:
      /(?:^|\s|;|&&|\|)\s*dd\s+.*if=\/dev\/(zero|random|urandom).*of=\/dev\//,
    risk: "critical",
    description: "Disk overwrite - data destruction",
    action: "block",
  },
  {
    pattern: />\s*\/dev\/sd[a-z]/,
    risk: "critical",
    description: "Direct write to disk device",
    action: "block",
  },

  // High risk - Require warning
  {
    pattern:
      /(?:^|\s|;|&&|\|)\s*rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*R[a-zA-Z]*)/,
    risk: "high",
    description: "Recursive file deletion",
    action: "warn",
  },
  {
    pattern:
      /(?:^|\s|;|&&|\|)\s*chmod\s+(-[a-zA-Z]*R[a-zA-Z]*|-[a-zA-Z]*r[a-zA-Z]*)\s+777/,
    risk: "high",
    description: "Insecure recursive permissions",
    action: "warn",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*sudo\s+/,
    risk: "high",
    description: "Superuser privileges required",
    action: "warn",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*curl\s+.*\|\s*(ba)?sh/,
    risk: "high",
    description: "Remote script execution",
    action: "warn",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*wget\s+.*-O\s*-\s*\|\s*(ba)?sh/,
    risk: "high",
    description: "Remote script execution",
    action: "warn",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*eval\s+/,
    risk: "high",
    description: "Dynamic code evaluation",
    action: "warn",
  },

  // Medium risk - Log and allow
  {
    pattern: /(?:^|\s|;|&&|\|)\s*rm\s+/,
    risk: "medium",
    description: "File deletion",
    action: "log",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*mv\s+/,
    risk: "medium",
    description: "File move/rename",
    action: "log",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*kill\s+(-9\s+)?/,
    risk: "medium",
    description: "Process termination",
    action: "log",
  },

  // Potential hangs - Warn about resource usage
  {
    pattern: /(?:^|\s|;|&&|\|)\s*find\s+\/(?!\w)\s/,
    risk: "medium",
    description: "Find from root - may be slow",
    action: "warn",
  },
  {
    pattern: /(?:^|\s|;|&&|\|)\s*du\s+.*~\/?\s*$/,
    risk: "medium",
    description: "Disk usage on home - may be slow",
    action: "warn",
  },
  {
    pattern:
      /(?:^|\s|;|&&|\|)\s*grep\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*R[a-zA-Z]*)\s+.*\/(?!\w)/,
    risk: "medium",
    description: "Recursive grep from root - may be slow",
    action: "warn",
  },
];

/**
 * Check a command against the blocklist
 * @param {string} command - The command to check
 * @returns {{ allowed: boolean, risk?: string, description?: string, action?: string }}
 */
function checkCommand(command) {
  for (const rule of blockedPatterns) {
    if (rule.pattern.test(command)) {
      return {
        allowed: rule.action !== "block",
        risk: rule.risk,
        description: rule.description,
        action: rule.action,
      };
    }
  }
  return { allowed: true };
}

/**
 * Sanitize command for logging (remove sensitive data)
 */
function sanitizeForLog(command) {
  // Remove potential API keys, passwords, tokens
  return command
    .replace(/([A-Za-z_]+_KEY|PASSWORD|TOKEN|SECRET)=\S+/gi, "$1=***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=***");
}

module.exports = {
  blockedPatterns,
  checkCommand,
  sanitizeForLog,
};
