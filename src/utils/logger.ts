/**
 * Logger Utility
 * Structured logging with levels and context
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  timestamp: string;
}

interface LoggerOptions {
  context?: string;
  enabled?: boolean;
  minLevel?: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "#888",
  info: "#4a9eff",
  warn: "#ffb84d",
  error: "#ff4d4d",
};

class Logger {
  private context: string;
  private enabled: boolean;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context || "App";
    this.enabled = options.enabled ?? import.meta.env.DEV;
    this.minLevel = options.minLevel || "debug";
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    data?: unknown,
  ): void {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${this.context}]`;
    const color = LOG_COLORS[level];

    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      data,
      timestamp,
    };

    // Use appropriate console method
    const consoleMethod =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;

    if (data !== undefined) {
      consoleMethod(
        `%c${prefix} %c${level.toUpperCase()} %c${message}`,
        `color: ${color}; font-weight: bold`,
        `color: ${color}`,
        "color: inherit",
        data,
      );
    } else {
      consoleMethod(
        `%c${prefix} %c${level.toUpperCase()} %c${message}`,
        `color: ${color}; font-weight: bold`,
        `color: ${color}`,
        "color: inherit",
      );
    }

    // Store in memory for potential retrieval
    this.storeEntry(entry);
  }

  private entries: LogEntry[] = [];
  private maxEntries = 100;

  private storeEntry(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  debug(message: string, data?: unknown): void {
    this.formatMessage("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.formatMessage("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.formatMessage("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.formatMessage("error", message, data);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger {
    return new Logger({
      context: `${this.context}:${context}`,
      enabled: this.enabled,
      minLevel: this.minLevel,
    });
  }

  /**
   * Get recent log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Clear stored entries
   */
  clearEntries(): void {
    this.entries = [];
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Time a function execution
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.debug(`${label} completed in ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed after ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  }

  /**
   * Time a synchronous function execution
   */
  timeSync<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.debug(`${label} completed in ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed after ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  }

  /**
   * Group related logs together
   */
  group(label: string, fn: () => void): void {
    if (!this.enabled) {
      fn();
      return;
    }
    console.group(`[${this.context}] ${label}`);
    fn();
    console.groupEnd();
  }
}

// Create and export default logger instance
export const logger = new Logger({ context: "TermAI" });

// Export factory for creating scoped loggers
export function createLogger(
  context: string,
  options?: Omit<LoggerOptions, "context">,
): Logger {
  return new Logger({ context, ...options });
}

export type { Logger, LogLevel, LogEntry, LoggerOptions };
