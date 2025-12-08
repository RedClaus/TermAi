/**
 * @termai/shared-types
 *
 * Shared TypeScript types for the TermAI monorepo.
 * These types are used across Electron, Web, and package code.
 */

// ============================================================================
// PTY Types
// ============================================================================

export interface PTYSpawnOptions {
  /** Shell executable (e.g., '/bin/bash', 'powershell.exe') */
  shell?: string | undefined;
  /** Arguments to pass to the shell */
  args?: string[] | undefined;
  /** Working directory for the PTY process */
  cwd?: string | undefined;
  /** Environment variables */
  env?: Record<string, string> | undefined;
  /** Terminal dimensions */
  cols?: number | undefined;
  rows?: number | undefined;
}

export interface PTYSession {
  /** Unique session identifier */
  id: string;
  /** Process ID of the PTY */
  pid: number;
  /** Current working directory */
  cwd: string;
  /** Whether the session is active */
  active: boolean;
}

export interface PTYResizeOptions {
  cols: number;
  rows: number;
}

// ============================================================================
// Transport Types
// ============================================================================

export type TransportType = 'electron' | 'web';

export interface SystemContext {
  /** Whether running in Electron */
  isElectron: boolean;
  /** Transport type being used */
  transport: TransportType;
  /** Platform (darwin, win32, linux) */
  platform: NodeJS.Platform | 'browser';
  /** App version */
  version: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface TermAIEventMap {
  // PTY Events
  'pty:data': { sessionId: string; data: string };
  'pty:exit': { sessionId: string; exitCode: number };
  'pty:error': { sessionId: string; error: string };

  // Command Events
  'command:started': { sessionId: string; command: string };
  'command:finished': { sessionId: string; exitCode: number };
  'command:output': { sessionId: string; data: string };

  // Session Events
  'session:created': { sessionId: string };
  'session:destroyed': { sessionId: string };

  // Settings Events
  'settings:changed': { key: string; value: unknown };
  'theme:changed': { theme: 'light' | 'dark' };
}

export type TermAIEventName = keyof TermAIEventMap;

// ============================================================================
// API Types
// ============================================================================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T | undefined;
  error?: string | undefined;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number | undefined;
  modified?: Date | undefined;
}
