/**
 * Chat-related types shared across hooks and components
 */

// =============================================
// Message Types
// =============================================

export type MessageRole = "user" | "ai" | "system";

export interface Message {
  role: MessageRole;
  content: string;
}

// =============================================
// Provider Types
// =============================================

export type Provider = "gemini" | "openai" | "anthropic" | "ollama" | "openrouter";

export interface ProviderConfig {
  provider: Provider;
  modelId: string;
  endpoint?: string;
}

// =============================================
// Task Types
// =============================================

export interface TaskStep {
  command: string;
  exitCode: number;
  output?: string;
  timestamp: number;
}

export type AppStatus = "running" | "stopped" | "error";

export interface TaskSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  steps: TaskStep[];
  startTime: number;
  endTime: number;
  appStatus: AppStatus;
  appPort?: number;
  finalMessage: string;
  narrative?: string;
}

// =============================================
// Auto-Run Types
// =============================================

export type StopReason = "user" | "complete" | "error" | "limit";

export interface AutoRunState {
  isAutoRun: boolean;
  autoRunCount: number;
  consecutiveStalls: number;
  taskSteps: TaskStep[];
  taskStartTime: number | null;
  taskSummary: TaskSummary | null;
  runningCommandId: string | null;
}

// =============================================
// UI State Types
// =============================================

export interface UIState {
  input: string;
  isLoading: boolean;
  agentStatus: string | null;
  showComplexConfirm: boolean;
  pendingComplexMessage: string;
}

// =============================================
// Settings Types
// =============================================

export interface SettingsState {
  hasKey: boolean;
  isCheckingKey: boolean;
  selectedModelId: string;
  currentCwd: string;
  isLiteMode: boolean;
  liteModeNotified: boolean;
}

// =============================================
// Session Types
// =============================================

export interface SessionInfo {
  id: string;
  name: string;
  timestamp: number;
  preview?: string;
}

// =============================================
// Command Types
// =============================================

export interface CommandResult {
  command: string;
  output: string;
  exitCode: number;
  duration?: number;
}

export interface SafetyImpact {
  level: "low" | "medium" | "high" | "critical";
  description: string;
  requiresConfirmation: boolean;
}
