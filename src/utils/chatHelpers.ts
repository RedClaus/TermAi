/**
 * Chat Helper Utilities
 * 
 * Pure functions extracted from handleSend and handleModelSelect
 * for better testability and reusability.
 */

import { LLMManager } from "../services/LLMManager";
import { SessionManager } from "../services/SessionManager";
import { buildSystemPrompt } from "./promptBuilder";
import { isSmallModel, getModelSize } from "../data/models";
import type { ModelSpec } from "../data/models";

// =============================================
// Types
// =============================================

export interface Message {
  role: "user" | "ai" | "system";
  content: string;
}

export interface SendMessageOptions {
  message: string;
  sessionId?: string;
  selectedModelId: string;
  currentCwd: string;
  isAutoRun: boolean;
  isLiteMode: boolean;
  models: ModelSpec[];
  existingMessages: Message[];
}

export interface SendMessageResult {
  success: boolean;
  response?: string;
  error?: string;
}

export interface ModelSelectResult {
  needsLiteMode: boolean;
  modelSize: string | null;
  hasApiKey: boolean;
  liteModeMessage: string | undefined;
  apiKeyMessage: string | undefined;
}

// =============================================
// Validation Functions
// =============================================

/**
 * Check if a message can be sent
 */
export function canSendMessage(message: string, hasKey: boolean): boolean {
  return message.trim().length > 0 && hasKey;
}

/**
 * Check if the complex request dialog should be shown
 */
export function shouldShowComplexRequestDialog(
  message: string,
  messagesCount: number,
  isOverride: boolean,
  alreadyShowing: boolean
): boolean {
  return (
    !isOverride &&
    messagesCount > 2 &&
    message.length > 50 &&
    !alreadyShowing
  );
}

// =============================================
// Context Building Functions
// =============================================

/**
 * Build the context string from messages for the LLM
 */
export function buildMessageContext(messages: Message[], newMessage?: string): string {
  const context = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  if (newMessage) {
    return `${context}\nUser: ${newMessage}`;
  }
  return context;
}

/**
 * Build the context string including system output (for auto-run)
 */
export function buildContextWithOutput(messages: Message[], outputMsg: string): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n") + `\nSystem Output:\n${outputMsg}`;
}

/**
 * Get the current provider from localStorage
 */
export function getCurrentProvider(): string {
  return localStorage.getItem("termai_provider") || "gemini";
}

/**
 * Determine if lite mode should be used for a model
 */
export function shouldUseLiteMode(
  selectedModelId: string,
  models: ModelSpec[],
  fallbackLiteMode: boolean
): boolean {
  const selectedModel = models.find((m) => m.id === selectedModelId);
  return selectedModel ? isSmallModel(selectedModel) : fallbackLiteMode;
}

// =============================================
// Session Management Functions
// =============================================

/**
 * Save session info after sending a message
 */
export function saveSessionInfo(sessionId: string, message: string): void {
  SessionManager.saveSession({
    id: sessionId,
    name: `Session ${sessionId.substring(0, 6)}`,
    timestamp: Date.now(),
    preview: message.substring(0, 50),
  });
}

/**
 * Save model selection for a session
 */
export function saveModelSelection(sessionId: string | undefined, modelId: string, provider: string): void {
  localStorage.setItem("termai_provider", provider);
  if (sessionId) {
    localStorage.setItem(`termai_model_${sessionId}`, modelId);
  }
}

// =============================================
// LLM Interaction Functions
// =============================================

/**
 * Send a message to the LLM and get a response
 */
export async function sendToLLM(options: SendMessageOptions): Promise<SendMessageResult> {
  const {
    message,
    sessionId,
    selectedModelId,
    currentCwd,
    isAutoRun,
    isLiteMode,
    models,
    existingMessages,
  } = options;

  try {
    const providerType = getCurrentProvider();
    const llm = LLMManager.getProvider(providerType, "", selectedModelId);
    const context = buildMessageContext(existingMessages, message);
    const useLiteMode = shouldUseLiteMode(selectedModelId, models, isLiteMode);

    const systemPrompt = buildSystemPrompt({
      cwd: currentCwd,
      isAutoRun,
      isLiteMode: useLiteMode,
    });

    const response = await llm.chat(systemPrompt, context, sessionId);
    return { success: true, response };
  } catch (error) {
    const errorMsg = formatLLMError(error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Format an LLM error into a user-friendly message
 */
export function formatLLMError(error: unknown): string {
  let errorMsg = "Sorry, something went wrong.";
  
  if (error instanceof Error) {
    errorMsg += ` Error: ${error.message}`;
  }
  
  const provider = getCurrentProvider();
  if (provider !== "ollama") {
    errorMsg += " Please check your API key in Settings.";
  } else {
    errorMsg += " Please check your Ollama endpoint and ensure the model is installed.";
  }
  
  return errorMsg;
}

// =============================================
// Model Selection Functions
// =============================================

/**
 * Process model selection and determine required state changes
 */
export async function processModelSelection(
  model: ModelSpec,
  _currentLiteMode: boolean,
  liteModeNotified: boolean
): Promise<ModelSelectResult> {
  const needsLiteMode = isSmallModel(model);
  const modelSize = getModelSize(model);
  
  let liteModeMessage: string | undefined;
  let apiKeyMessage: string | undefined;
  let hasApiKey = true;

  // Generate lite mode message if needed
  if (needsLiteMode && !liteModeNotified) {
    const sizeInfo = modelSize ? ` (${modelSize})` : "";
    liteModeMessage = `⚡ **Lite Mode** enabled for ${model.name}${sizeInfo}. Using simplified prompts for better results with this smaller model. For complex tasks, consider using a larger model like qwen2.5-coder:14b.`;
  }

  // Check API key for non-Ollama providers
  if (model.provider !== "ollama") {
    hasApiKey = await LLMManager.hasApiKey(model.provider);
    if (!hasApiKey) {
      apiKeyMessage = `Switched to ${model.name}. Please enter your ${model.provider} API key in Settings.`;
    }
  }

  return {
    needsLiteMode,
    modelSize,
    hasApiKey,
    liteModeMessage,
    apiKeyMessage,
  };
}

/**
 * Notify other components about settings change
 */
export function emitSettingsChanged(): void {
  window.dispatchEvent(new Event("termai-settings-changed"));
}

// =============================================
// Message Formatting Functions
// =============================================

/**
 * Create a welcome message for missing API key
 */
export function createApiKeyMissingMessage(provider: string): Message {
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
  return {
    role: "ai",
    content: `Hi! I'm TermAI. Please configure your ${providerName} API key in Settings to get started.`,
  };
}

/**
 * Create a server connection error message
 */
export function createServerErrorMessage(): Message {
  return {
    role: "ai",
    content: "Unable to connect to the server. Make sure the TermAI backend is running.",
  };
}

/**
 * Create a new conversation message
 */
export function createNewConversationMessage(): Message {
  return {
    role: "ai",
    content: "Starting new conversation...",
  };
}

/**
 * Create a user message
 */
export function createUserMessage(content: string): Message {
  return {
    role: "user",
    content,
  };
}

/**
 * Create an AI response message
 */
export function createAIMessage(content: string): Message {
  return {
    role: "ai",
    content,
  };
}

/**
 * Create a system message
 */
export function createSystemMessage(content: string): Message {
  return {
    role: "system",
    content,
  };
}
