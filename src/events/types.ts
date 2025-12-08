/**
 * Typed Event Definitions
 * Central registry of all custom events used in TermAI
 */

// ===========================================
// Event Payload Definitions
// ===========================================

export interface CommandStartedPayload {
  commandId: string;
  command: string;
  sessionId?: string | undefined;
}

export interface CommandOutputPayload {
  commandId: string;
  output: string;
  sessionId?: string | undefined;
}

export interface CommandFinishedPayload {
  command: string;
  output: string;
  exitCode: number;
  sessionId?: string | undefined;
}

export interface RunCommandPayload {
  command: string;
  sessionId?: string | undefined;
}

export interface CancelCommandPayload {
  commandId: string;
  sessionId?: string | undefined;
}

export interface CwdChangedPayload {
  cwd: string;
  sessionId?: string | undefined;
}

export interface AiThinkingPayload {
  isThinking: boolean;
  sessionId?: string | undefined;
}

export interface AiNeedsInputPayload {
  needsInput: boolean;
  reason?: string | undefined;
  sessionId?: string | undefined;
}

export interface RestoreSessionPayload {
  sessionId: string;
}

export interface FetchModelsPayload {
  endpoint: string;
}

export interface ThemeChangedPayload {
  theme: "dark" | "light";
}

export interface ToastPayload {
  message: string;
  type?: "success" | "error" | "info" | "warning";
}

export interface GitInfoPayload {
  branch: string | null;
  status?: string | null;
  sessionId?: string | undefined;
}

export interface WidgetContextUpdatedPayload {
  sessionId: string;
}

// Background Terminal Events
export interface BackgroundStartedPayload {
  terminalId: string;
  command: string;
  type: string;
  sessionId?: string | undefined;
}

export interface BackgroundOutputPayload {
  terminalId: string;
  output: string;
}

export interface BackgroundExitPayload {
  terminalId: string;
  exitCode: number;
  command: string;
  duration: number;
}

// ===========================================
// Event Map
// =========================================== 

export interface TermAiEvents {
  // Command Events
  "termai-run-command": RunCommandPayload;
  "termai-command-started": CommandStartedPayload;
  "termai-command-output": CommandOutputPayload;
  "termai-command-finished": CommandFinishedPayload;
  "termai-cancel-command": CancelCommandPayload;

  // Session Events
  "termai-new-tab": void;
  "termai-restore-session": RestoreSessionPayload;
  "termai-sessions-updated": void;
  "termai-cwd-changed": CwdChangedPayload;

  // AI Events
  "termai-ai-thinking": AiThinkingPayload;
  "termai-ai-needs-input": AiNeedsInputPayload;
  "termai-auto-continue": void;

  // Settings Events
  "termai-settings-changed": void;
  "termai-fetch-models": FetchModelsPayload;
  "termai-theme-changed": ThemeChangedPayload;
  "termai-toast": ToastPayload;

  // Widget Context Events
  "termai-git-info": GitInfoPayload;
  "termai-context-updated": WidgetContextUpdatedPayload;

  // Background Terminal Events
  "termai-background-started": BackgroundStartedPayload;
  "termai-background-output": BackgroundOutputPayload;
  "termai-background-exit": BackgroundExitPayload;
}

// ===========================================
// Type Utilities
// ===========================================

export type TermAiEventName = keyof TermAiEvents;

export type TermAiEventPayload<T extends TermAiEventName> = TermAiEvents[T];

/**
 * Typed CustomEvent for TermAI events
 */
export type TermAiCustomEvent<T extends TermAiEventName> = CustomEvent<
  TermAiEventPayload<T>
>;

/**
 * Event handler type for events with payloads
 */
export type TermAiEventHandler<T extends TermAiEventName> =
  TermAiEventPayload<T> extends void
    ? () => void
    : (payload: TermAiEventPayload<T>) => void;

// ===========================================
// Global Type Augmentation
// ===========================================

declare global {
  interface WindowEventMap {
    "termai-run-command": CustomEvent<RunCommandPayload>;
    "termai-command-started": CustomEvent<CommandStartedPayload>;
    "termai-command-output": CustomEvent<CommandOutputPayload>;
    "termai-command-finished": CustomEvent<CommandFinishedPayload>;
    "termai-cancel-command": CustomEvent<CancelCommandPayload>;
    "termai-new-tab": CustomEvent<void>;
    "termai-restore-session": CustomEvent<RestoreSessionPayload>;
    "termai-sessions-updated": CustomEvent<void>;
    "termai-cwd-changed": CustomEvent<CwdChangedPayload>;
    "termai-ai-thinking": CustomEvent<AiThinkingPayload>;
    "termai-ai-needs-input": CustomEvent<AiNeedsInputPayload>;
    "termai-auto-continue": CustomEvent<void>;
    "termai-settings-changed": CustomEvent<void>;
    "termai-fetch-models": CustomEvent<FetchModelsPayload>;
    "termai-theme-changed": CustomEvent<ThemeChangedPayload>;
    "termai-toast": CustomEvent<ToastPayload>;
    "termai-git-info": CustomEvent<GitInfoPayload>;
    "termai-context-updated": CustomEvent<WidgetContextUpdatedPayload>;
    "termai-background-started": CustomEvent<BackgroundStartedPayload>;
    "termai-background-output": CustomEvent<BackgroundOutputPayload>;
    "termai-background-exit": CustomEvent<BackgroundExitPayload>;
  }
}
