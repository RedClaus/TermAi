/**
 * Core Type Definitions for TermAI
 */

// ===========================================
// Block/Command Types
// ===========================================

export interface BlockData {
  id: string;
  command: string;
  output: string;
  cwd: string;
  timestamp: number;
  exitCode: number;
  isLoading: boolean;
  isInteractive?: boolean;
}

export interface CommandResult {
  output: string;
  exitCode: number;
}

export interface ExecuteResult extends CommandResult {
  newCwd?: string;
  warning?: {
    risk: string;
    description: string;
  };
}

// ===========================================
// Message Types
// ===========================================

export type MessageRole = "user" | "ai" | "system";

export interface Message {
  role: MessageRole;
  content: string;
  timestamp?: number;
}

// ===========================================
// Safety Types
// ===========================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface SafetyRule {
  pattern: RegExp;
  risk: RiskLevel;
  description: string;
}

export interface SafetyCheckResult {
  isDangerous: boolean;
  impact: string | null;
  risk?: RiskLevel;
}

export interface PendingSafetyCommand {
  command: string;
  sessionId?: string | undefined;
  impact?: string | undefined;
}

// ===========================================
// Provider Types
// ===========================================

export type ProviderType =
  | "gemini"
  | "openai"
  | "anthropic"
  | "ollama"
  | "openrouter"
  | "meta";

export interface ProviderConfig {
  provider: ProviderType;
  modelId: string;
  endpoint?: string;
}

// ===========================================
// Session Types
// ===========================================

export interface SavedSession {
  id: string;
  name: string;
  timestamp: number;
  preview: string;
}

export interface SessionState {
  messages: Message[];
  cwd: string;
  modelId: string;
  provider: ProviderType;
}

// ===========================================
// Model Types
// ===========================================

export interface ModelSpec {
  id: string;
  name: string;
  provider: ProviderType;
  intelligence: number;
  speed: number;
  cost: number;
  contextWindow: string;
  description: string;
}

// ===========================================
// UI State Types
// ===========================================

export type LayoutType = "side-right" | "side-left" | "bottom" | "top";

export type ThemeType = "dark" | "light";

export type SystemState = "healthy" | "busy" | "stalled" | "error";

// ===========================================
// API Response Types
// ===========================================

/**
 * Base API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * LLM API Responses
 */
export interface LLMChatResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface LLMModelsResponse {
  models: Array<{
    id: string;
    name: string;
    provider: ProviderType;
  }>;
}

export interface LLMHasKeyResponse {
  hasKey: boolean;
}

export interface LLMSetKeyResponse {
  success: boolean;
}

/**
 * File System API Responses
 */
export interface FSReadResponse {
  content: string;
}

export interface FSWriteResponse {
  success: boolean;
}

export interface FSListResponse {
  files: Array<{
    name: string;
    isDirectory: boolean;
    path: string;
  }>;
}

export interface FSMkdirResponse {
  success: boolean;
}

/**
 * Command Execution API Responses
 */
export interface ExecuteCommandResponse {
  output: string;
  exitCode: number;
  newCwd?: string;
}

export interface CancelCommandResponse {
  success: boolean;
}

// ===========================================
// Error Types
// ===========================================

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as ApiError).message === "string"
  );
}

// ===========================================
// Utility Types
// ===========================================

/**
 * Make specific keys of T optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys of T required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>;

/**
 * Extract the element type from an array type
 */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Type guard helper for narrowing types
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for checking if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Exhaustive check for switch statements
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
