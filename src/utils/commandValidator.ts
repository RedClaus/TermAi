/**
 * Command Validation Utilities
 * 
 * Pure functions for validating and extracting shell commands from AI responses.
 * Used by AIInputBox and AIPanel to determine if text is an executable command.
 */

/**
 * Known shell commands and utilities - commands must start with one of these
 */
export const KNOWN_COMMANDS = new Set([
  // Core shell commands
  "cd", "ls", "ll", "la", "pwd", "echo", "printf", "cat", "head", "tail", "less", "more",
  "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown", "chgrp", "ln",
  "find", "locate", "which", "whereis", "type", "file", "stat",
  // Text processing
  "grep", "egrep", "fgrep", "rg", "ag", "awk", "sed", "cut", "sort", "uniq", "wc", "tr", "diff", "patch",
  "tee", "xargs", "column",
  // Network
  "curl", "wget", "ssh", "scp", "rsync", "ping", "netstat", "ss", "lsof", "nc", "nmap",
  "ifconfig", "ip", "nslookup", "dig", "host", "traceroute",
  // Process management
  "ps", "top", "htop", "kill", "killall", "pkill", "pgrep", "nice", "nohup", "bg", "fg", "jobs",
  // System
  "sudo", "su", "whoami", "id", "groups", "uname", "hostname", "uptime", "date", "cal",
  "df", "du", "free", "vmstat", "dmesg", "journalctl", "systemctl", "service",
  // Package managers
  "apt", "apt-get", "dpkg", "yum", "dnf", "pacman", "brew", "snap", "flatpak",
  "pip", "pip3", "pipx", "npm", "npx", "yarn", "pnpm", "bun", "deno",
  "cargo", "go", "gem", "bundle", "composer", "maven", "mvn", "gradle",
  // Development
  "git", "gh", "docker", "docker-compose", "podman", "kubectl", "helm", "terraform",
  "make", "cmake", "gcc", "g++", "clang", "javac", "java", "python", "python3", "node", "ruby", "perl", "php",
  "tsc", "esbuild", "vite", "webpack", "rollup", "jest", "vitest", "pytest", "mocha",
  // Misc
  "man", "info", "help", "clear", "reset", "history", "alias", "export", "source", "env", "set", "unset",
  "sleep", "watch", "time", "timeout", "yes", "true", "false", "test", "expr", "bc",
  "jq", "yq", "base64", "md5sum", "sha256sum", "openssl",
  // Editors
  "nano", "vim", "vi", "nvim", "emacs", "code", "subl",
  // Archive
  "tar", "zip", "unzip", "gzip", "gunzip", "bzip2", "xz", "7z",
  // macOS specific
  "open", "pbcopy", "pbpaste", "defaults", "launchctl", "sw_vers", "diskutil",
]);

/**
 * Patterns that indicate explanatory text, not a command
 */
const EXPLANATORY_TEXT_PATTERNS: RegExp[] = [
  /^the\s+/i, /^this\s+/i, /^that\s+/i, /^here\s+/i, /^now\s+/i,
  /^next\s+/i, /^first\s+/i, /^then\s+/i, /^after\s+/i, /^before\s+/i,
  /^you\s+(can|should|need|must|will|may)/i,
  /^we\s+(can|should|need|must|will|may)/i,
  /^it\s+(will|should|can|is|was)/i,
  /^let\s+me/i, /^let's\s+/i,
  /^i\s+(will|would|can|am|have|need)/i,
  /^please\s+/i, /^note:/i, /^note\s+that/i, /^remember/i,
  /^important:/i, /^warning:/i, /^error:/i, /^example:/i, /^output:/i, /^result:/i,
  /^expected/i, /^actually/i, /^however/i, /^although/i, /^because/i,
  /^since\s+/i, /^when\s+/i, /^if\s+you/i, /^if\s+the/i, /^if\s+this/i, /^once\s+/i,
  /^to\s+(do|fix|solve|run|start|install|create|make|build|test|check|verify)/i,
  /^in\s+order\s+to/i, /^make\s+sure/i, /^be\s+sure/i,
  /^don't\s+/i, /^do\s+not/i, /^try\s+to/i, /^trying\s+to/i, /^attempt/i,
  /^failed/i, /^success/i, /^looks\s+like/i, /^seems\s+like/i, /^appears\s+/i,
  /^based\s+on/i, /^according\s+to/i, /^\d+\.\s+/, /^-\s+[A-Z]/, /^\*\s+[A-Z]/,
  /^step\s+\d/i, /^option\s+\d/i, /previous/i, /following/i, /above/i, /below/i,
];

/**
 * Patterns that indicate command output rather than a command itself
 */
const OUTPUT_PATTERNS: RegExp[] = [
  /^up to date/i, /^found \d+ vulnerabilities/i, /^npm warn/i, /^npm notice/i,
  /^npm err!/i, /^added \d+ packages/i, /^removed \d+ packages/i, /^audited \d+ packages/i,
  /^total \d+/i, /^drwx/, /^-rw/, /^├──/, /^└──/, /^│/,
  /^\s*\d+\s+\w+\s+\w+/, /^LISTEN\s/i, /^tcp\s/i, /^udp\s/i,
  /^Python version:/i, /^PySide6/i, /^✅/, /^❌/,
  /^Error:/i, /^Warning:/i, /^Traceback/i, /^File "/i,
  /^\s{4,}/, /^=+$/, /^-+$/, /^\[.*\]$/,
  /^Loading/i, /^Downloading/i, /^Installing/i, /^Compiling/i,
  /^Building/i, /^Running/i, /^Starting/i, /^Stopping/i, /^Waiting/i,
  /^Done\.?$/i, /^Finished/i, /^Complete/i, /^\d+%/,
];

/**
 * Patterns that indicate error messages in output
 */
const ERROR_INDICATORS = [
  "no such file or directory:",
  "command not found",
  "Permission denied",
];

/**
 * Check if text looks like command output rather than a command
 */
export function looksLikeOutput(text: string): boolean {
  return OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if text looks like explanatory prose rather than a command
 */
export function looksLikeExplanatoryText(text: string): boolean {
  const trimmed = text.trim();
  
  // Check against known explanatory patterns
  if (EXPLANATORY_TEXT_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }
  
  // Multiple sentences (period followed by capital letter)
  if (/\.\s+[A-Z]/.test(trimmed)) return true;
  
  // Questions
  if (trimmed.includes("?")) return true;
  
  // Long text without shell metacharacters
  if (trimmed.length > 100 && !/[|><;&]/.test(trimmed)) return true;
  
  // Markdown formatting
  if (/\*\*[^*]+\*\*/.test(trimmed) || /`[^`]+`/.test(trimmed)) return true;
  
  return false;
}

/**
 * Extract the command name from a command string
 * Handles sudo prefix and path prefixes
 */
export function extractCommandName(text: string): string {
  const trimmed = text.trim();
  
  // Extract the first word (the command name), handling sudo
  const firstWord = trimmed.split(/[\s;&|]/)[0].replace(/^sudo\s+/, "");
  
  // Remove path prefixes (./, ~/, /) and get the executable name
  const commandName = firstWord
    .replace(/^\.\//, "")
    .replace(/^~\//, "")
    .split("/")
    .pop() || "";
  
  return commandName.toLowerCase();
}

/**
 * Validate if a string is a valid shell command
 * 
 * @param text - The text to validate
 * @param logRejections - Whether to log rejected commands (for debugging)
 * @returns true if the text appears to be a valid command
 */
export function isValidCommand(text: string, logRejections = true): boolean {
  if (!text || !text.trim()) return false;
  
  const trimmed = text.trim();
  
  // Guard clauses for obvious non-commands
  if (trimmed.length > 500) return false;
  if (looksLikeOutput(trimmed)) return false;
  if (looksLikeExplanatoryText(trimmed)) return false;
  
  // Check for error message indicators
  for (const indicator of ERROR_INDICATORS) {
    if (trimmed.includes(indicator)) return false;
  }
  
  // Check for placeholder patterns
  if (/\/path\/to\//.test(trimmed)) return false;
  if (/<[^>]+>/.test(trimmed) && !trimmed.startsWith("cat")) return false;

  // Extract and validate command name
  const commandName = extractCommandName(trimmed);
  
  // Check if it starts with a known command
  if (KNOWN_COMMANDS.has(commandName)) return true;
  
  // Allow paths to executables
  if (/^\.\//.test(trimmed) || /^~\//.test(trimmed) || /^\//.test(trimmed)) {
    return true;
  }
  
  // Allow subshell execution
  if (/^\$\(/.test(trimmed)) return true;
  
  // Allow environment variable assignment followed by command
  if (/^[A-Z_][A-Z0-9_]*=/.test(trimmed)) return true;

  if (logRejections) {
    console.log(`[CommandValidator] Rejecting: "${trimmed.substring(0, 50)}..."`);
  }
  
  return false;
}

/**
 * Extract a single executable command from a code block content
 * Handles multi-line blocks, line continuations, and finds the first valid command
 * 
 * @param blockContent - The content of a code block (without the ``` markers)
 * @returns The extracted command string, or null if no valid command found
 */
export function extractSingleCommand(blockContent: string): string | null {
  const lines = blockContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);
  
  if (lines.length === 0) return null;
  
  // Single line - simple case
  if (lines.length === 1) {
    const cmd = lines[0];
    return isValidCommand(cmd, false) ? cmd : null;
  }
  
  // Shebang indicates a script file, not a single command
  if (lines[0].startsWith("#!")) return null;
  
  // Handle line continuations (backslash at end of line)
  if (blockContent.includes("\\\n")) {
    const joined = blockContent.replace(/\\\n\s*/g, " ").trim();
    return isValidCommand(joined, false) ? joined : null;
  }
  
  // If all lines are valid commands and there are 3 or fewer, join with &&
  const allValid = lines.every((l) => isValidCommand(l, false));
  if (allValid && lines.length <= 3) {
    return lines.join(" && ");
  }
  
  // Otherwise, find and return the first valid command
  const firstValid = lines.find((l) => isValidCommand(l, false));
  return firstValid || null;
}

/**
 * Extract all code blocks from an AI response
 * 
 * @param response - The full AI response text
 * @returns Array of code block contents (without ``` markers)
 */
export function extractCodeBlocks(response: string): string[] {
  const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\n([\s\S]*?)\n```/g;
  const blocks: string[] = [];
  let match;
  
  while ((match = codeBlockRegex.exec(response)) !== null) {
    blocks.push(match[1]);
  }
  
  return blocks;
}

/**
 * Check if a code block is preceded by a WRITE_FILE directive
 * (These blocks contain file content, not commands)
 * 
 * @param response - The full AI response text
 * @param blockIndex - The character index where the code block starts
 * @returns true if this block is file content for WRITE_FILE
 */
export function isWriteFileBlock(response: string, blockIndex: number): boolean {
  const beforeBlock = response.substring(0, blockIndex).trim();
  if (!beforeBlock.endsWith("]")) return false;
  
  const lastBracket = beforeBlock.lastIndexOf("[");
  if (lastBracket === -1) return false;
  
  return beforeBlock.substring(lastBracket).includes("WRITE_FILE");
}

/**
 * Extract the first executable command from an AI response
 * Skips WRITE_FILE blocks and returns null if no valid command found
 * 
 * @param response - The full AI response text
 * @returns The first valid command, or null if none found
 */
export function extractFirstCommand(response: string): string | null {
  const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\n([\s\S]*?)\n```/g;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    // Skip WRITE_FILE blocks
    if (isWriteFileBlock(response, match.index)) {
      continue;
    }

    const command = extractSingleCommand(match[1]);
    if (command) {
      return command;
    }
  }

  return null;
}
