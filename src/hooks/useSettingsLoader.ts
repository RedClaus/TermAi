/**
 * useSettingsLoader Hook
 * 
 * Consolidates settings loading and initialization logic shared between
 * AIInputBox and AIPanel components. Handles:
 * - API key checking and validation
 * - Ollama model fetching
 * - Provider switching
 * - Settings change events
 */

import { useState, useCallback, useEffect } from "react";
import { LLMManager } from "../services/LLMManager";
import { config } from "../config";
import { AVAILABLE_MODELS, isSmallModel, getModelSize } from "../data/models";
import { useTermAiEvent } from "./useTermAiEvent";
import type { ModelSpec } from "../data/models";
import type { FetchModelsPayload, CwdChangedPayload } from "../events/types";

// =============================================
// Types
// =============================================

export interface Message {
  role: "user" | "ai" | "system";
  content: string;
}

export interface SettingsLoaderOptions {
  sessionId?: string | undefined;
  initialCwd?: string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setAgentStatus: (status: string | null) => void;
  /** If true, only load settings when this becomes true (for inactive tabs) */
  isActive?: boolean | undefined;
}

export interface SettingsLoaderResult {
  // State
  hasKey: boolean;
  isCheckingKey: boolean;
  models: ModelSpec[];
  selectedModelId: string;
  currentCwd: string;
  isLiteMode: boolean;
  liteModeNotified: boolean;
  
  // Actions
  loadSettings: () => Promise<void>;
  fetchOllamaModels: (endpoint: string) => Promise<void>;
  handleModelSelect: (model: ModelSpec) => Promise<void>;
  setSelectedModelId: (id: string) => void;
  setModels: React.Dispatch<React.SetStateAction<ModelSpec[]>>;
  setCurrentCwd: (cwd: string) => void;
  setHasKey: (hasKey: boolean) => void;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Get initial model ID from session or global settings
 */
function getInitialModelId(sessionId?: string): string {
  if (sessionId) {
    const sessionModel = localStorage.getItem(`termai_model_${sessionId}`);
    if (sessionModel) return sessionModel;
  }
  const globalProvider = localStorage.getItem("termai_provider") || "gemini";
  const providerModel = AVAILABLE_MODELS.find(m => m.provider === globalProvider);
  return providerModel?.id || AVAILABLE_MODELS[0].id;
}

/**
 * Format provider name for display (capitalize first letter)
 */
function formatProviderName(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

// =============================================
// Main Hook
// =============================================

export function useSettingsLoader({
  sessionId,
  initialCwd = "~",
  setMessages,
  setAgentStatus,
  isActive = true,
}: SettingsLoaderOptions): SettingsLoaderResult {
  // =============================================
  // State
  // =============================================
  const [hasKey, setHasKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [models, setModels] = useState<ModelSpec[]>(AVAILABLE_MODELS);
  const [selectedModelId, setSelectedModelId] = useState(() => getInitialModelId(sessionId));
  const [currentCwd, setCurrentCwd] = useState(initialCwd);
  const [isLiteMode, setIsLiteMode] = useState(false);
  const [liteModeNotified, setLiteModeNotified] = useState(false);

  // =============================================
  // Ollama Model Fetching
  // =============================================
  const fetchOllamaModels = useCallback(
    async (endpoint: string) => {
      try {
        const ollamaModels = await LLMManager.fetchOllamaModels(endpoint);
        setModels((prev) => {
          const nonOllama = prev.filter((p) => p.provider !== "ollama");
          return [...nonOllama, ...ollamaModels];
        });
        localStorage.setItem("termai_ollama_endpoint", endpoint);
        setHasKey(true);
        setAgentStatus(`Found ${ollamaModels.length} local models`);
        
        setMessages((prev) => {
          const isWelcome = prev.length === 0 || (prev.length === 1 && prev[0].role === "ai");
          if (isWelcome) {
            return [{
              role: "ai",
              content: `Connected to Ollama at ${endpoint}. Found ${ollamaModels.length} models. How can I help?`,
            }];
          }
          return prev;
        });
        
        setTimeout(() => setAgentStatus(null), 3000);
      } catch (error) {
        console.error("Error fetching Ollama models:", error);
        setAgentStatus("Error fetching models. Check endpoint.");
        setTimeout(() => setAgentStatus(null), 3000);
      }
    },
    [setMessages, setAgentStatus]
  );

  // =============================================
  // Load Settings
  // =============================================
  const loadSettings = useCallback(async () => {
    const storedProvider = localStorage.getItem("termai_provider") || "gemini";

    // Handle Ollama specially (no API key needed)
    if (storedProvider === "ollama") {
      const endpoint = localStorage.getItem("termai_ollama_endpoint") || config.defaultOllamaEndpoint;
      setHasKey(true);
      setIsCheckingKey(false);
      fetchOllamaModels(endpoint);
      return;
    }

    setIsCheckingKey(true);
    try {
      const hasServerKey = await LLMManager.hasApiKey(storedProvider);
      setHasKey(hasServerKey);
      
      if (hasServerKey) {
        // Fetch dynamic models for the provider
        const dynamicModels = await LLMManager.fetchModels(storedProvider);
        if (dynamicModels.length > 0) {
          setModels((prev) => {
            const others = prev.filter((p) => p.provider !== storedProvider);
            return [...others, ...dynamicModels] as ModelSpec[];
          });
        }
      } else {
        setMessages([{
          role: "ai",
          content: `Hi! I'm TermAI. Please configure your ${formatProviderName(storedProvider)} API key in Settings to get started.`,
        }]);
      }
    } catch (error) {
      console.error("Error checking API key:", error);
      setMessages([{
        role: "ai",
        content: "Unable to connect to the server. Make sure the TermAI backend is running.",
      }]);
      setHasKey(false);
    } finally {
      setIsCheckingKey(false);
    }
  }, [fetchOllamaModels, setMessages]);

  // =============================================
  // Model Selection Handler
  // =============================================
  const handleModelSelect = useCallback(
    async (model: ModelSpec) => {
      setSelectedModelId(model.id);
      localStorage.setItem("termai_provider", model.provider);

      // Save model selection per session
      if (sessionId) {
        localStorage.setItem(`termai_model_${sessionId}`, model.id);
      }

      // Check if this is a small model that needs lite mode
      const needsLiteMode = isSmallModel(model);
      const modelSize = getModelSize(model);

      if (needsLiteMode !== isLiteMode) {
        setIsLiteMode(needsLiteMode);
        setLiteModeNotified(false);
      }

      // Notify user about lite mode
      if (needsLiteMode && !liteModeNotified) {
        setLiteModeNotified(true);
        const sizeInfo = modelSize ? ` (${modelSize})` : "";
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `⚡ **Lite Mode** enabled for ${model.name}${sizeInfo}. Using simplified prompts for better results with this smaller model. For complex tasks, consider using a larger model like qwen2.5-coder:14b.`,
          },
        ]);
      }

      // Check API key for non-Ollama providers
      if (model.provider === "ollama") {
        setHasKey(true);
      } else {
        const hasServerKey = await LLMManager.hasApiKey(model.provider);
        setHasKey(hasServerKey);
        if (!hasServerKey) {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `Switched to ${model.name}. Please enter your ${model.provider} API key in Settings.`,
            },
          ]);
        }
      }

      // Notify other components
      window.dispatchEvent(new Event("termai-settings-changed"));
    },
    [sessionId, isLiteMode, liteModeNotified, setMessages]
  );

  // =============================================
  // Effects
  // =============================================

  // Load settings on mount (respecting isActive for inactive tabs)
  useEffect(() => {
    if (isActive) {
      loadSettings();
    }
  }, [isActive, loadSettings]);

  // =============================================
  // Event Handlers
  // =============================================

  // Reload settings when they change
  useTermAiEvent("termai-settings-changed", loadSettings, [loadSettings]);

  // Handle CWD changes
  useTermAiEvent(
    "termai-cwd-changed",
    (payload: CwdChangedPayload) => {
      if (payload.sessionId === sessionId || !payload.sessionId) {
        setCurrentCwd(payload.cwd);
      }
    },
    [sessionId]
  );

  // Handle fetch models requests
  useTermAiEvent(
    "termai-fetch-models",
    (payload: FetchModelsPayload) => {
      fetchOllamaModels(payload.endpoint);
    },
    [fetchOllamaModels]
  );

  // =============================================
  // Return
  // =============================================
  return {
    // State
    hasKey,
    isCheckingKey,
    models,
    selectedModelId,
    currentCwd,
    isLiteMode,
    liteModeNotified,

    // Actions
    loadSettings,
    fetchOllamaModels,
    handleModelSelect,
    setSelectedModelId,
    setModels,
    setCurrentCwd,
    setHasKey,
  };
}
