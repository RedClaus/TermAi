/**
 * LLM Manager - Client-side interface for AI providers
 * All API calls are proxied through the backend server for security
 * API keys are stored server-side only
 */

import { config } from "../config";

// Simple in-memory cache for hasApiKey to prevent request spam
const apiKeyCache: Map<string, { value: boolean; timestamp: number }> = new Map();
const CACHE_TTL = 30000; // 30 seconds
let pendingRequests: Map<string, Promise<boolean>> = new Map();

export interface LLMProvider {
  chat(systemPrompt: string, context?: string, sessionId?: string): Promise<string>;
}

export interface ChatMessage {
  role: "user" | "ai" | "system";
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
}

/**
 * Proxy-based LLM Provider
 * Routes all requests through the backend server
 */
class ProxyLLMProvider implements LLMProvider {
  private provider: string;
  private modelId: string;
  private endpoint?: string | undefined;

  constructor(provider: string, modelId?: string, endpoint?: string) {
    this.provider = provider;
    this.modelId = modelId || "auto";
    this.endpoint = endpoint;
  }

  async chat(systemPrompt: string, context?: string, sessionId?: string): Promise<string> {
    // Build messages array from context
    const messages: ChatMessage[] = [];

    if (context) {
      // Parse context into messages (format: "role: content\n...")
      const lines = context.split("\n");
      let currentRole: "user" | "ai" | "system" | null = null;
      let currentContent: string[] = [];

      for (const line of lines) {
        const roleMatch = line.match(/^(user|ai|system|User|AI|System):\s*/i);
        if (roleMatch) {
          // Save previous message
          if (currentRole && currentContent.length > 0) {
            messages.push({
              role: currentRole,
              content: currentContent.join("\n").trim(),
            });
          }
          currentRole = roleMatch[1].toLowerCase() as "user" | "ai" | "system";
          currentContent = [line.substring(roleMatch[0].length)];
        } else if (currentRole) {
          currentContent.push(line);
        }
      }

      // Don't forget the last message
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join("\n").trim(),
        });
      }
    }

    try {
      const requestBody = {
        provider: this.provider,
        model: this.modelId,
        messages,
        systemPrompt: systemPrompt || "You are a helpful assistant.",
        endpoint: this.endpoint,
        sessionId,
      };
      console.log('[LLMManager.chat] Sending request:', { provider: this.provider, model: this.modelId });
      const response = await fetch(config.getApiUrl(config.api.llm.chat), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Server error: ${response.statusText}`);
      }

      const data: LLMResponse = await response.json();
      return data.content;
    } catch (error) {
      console.error(`Error calling ${this.provider} via proxy:`, error);
      throw error;
    }
  }
}

/**
 * LLM Manager - Factory for creating providers
 */
export class LLMManager {
  /**
   * Get a provider instance
   * All requests are proxied through the server
   */
  static getProvider(
    type: string,
    _apiKey?: string,
    modelId?: string,
  ): LLMProvider {
    // Note: apiKey parameter is kept for backward compatibility but ignored
    // API keys are now managed server-side
    console.log('[LLMManager.getProvider] type:', type, 'modelId:', modelId);
    switch (type) {
      case "gemini":
        return new ProxyLLMProvider("gemini", modelId);
      case "openai":
        return new ProxyLLMProvider("openai", modelId);
      case "anthropic":
        return new ProxyLLMProvider("anthropic", modelId);
      case "xai":
        return new ProxyLLMProvider("xai", modelId);
      case "openrouter":
        return new ProxyLLMProvider("openrouter", modelId);
      case "ollama":
        // For Ollama, pass the endpoint
        const endpoint =
          localStorage.getItem("termai_ollama_endpoint") ||
          config.defaultOllamaEndpoint;
        return new ProxyLLMProvider("ollama", modelId, endpoint);
      default:
        throw new Error(`Unknown provider: ${type}`);
    }
  }

  /**
   * Set API key on the server
   */
  static async setApiKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(config.getApiUrl(config.api.llm.setKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to set API key");
      }

      // Clear cache so next hasApiKey call fetches fresh data
      this.clearApiKeyCache(provider);
      return true;
    } catch (error) {
      console.error("Error setting API key:", error);
      throw error;
    }
  }

  /**
   * Delete/clear API key from the server
   */
  static async deleteApiKey(provider: string): Promise<boolean> {
    try {
      const response = await fetch(config.getApiUrl("/api/llm/delete-key"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete API key");
      }

      // Clear cache so next hasApiKey call fetches fresh data
      this.clearApiKeyCache(provider);
      return true;
    } catch (error) {
      console.error("Error deleting API key:", error);
      throw error;
    }
  }

  /**
   * Check if API key exists on the server
   * Uses caching and request deduplication to prevent spam
   */
  static async hasApiKey(provider: string): Promise<boolean> {
    console.log(`[LLMManager.hasApiKey] Called for provider: ${provider}`);

    // Check cache first
    const cached = apiKeyCache.get(provider);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[LLMManager.hasApiKey] Returning cached value for ${provider}: ${cached.value}`);
      return cached.value;
    }

    // Check if there's already a pending request for this provider
    const pending = pendingRequests.get(provider);
    if (pending) {
      console.log(`[LLMManager.hasApiKey] Returning pending promise for ${provider}`);
      return pending;
    }

    console.log(`[LLMManager.hasApiKey] Making new request for ${provider}`);
    // Make new request and store promise for deduplication
    const requestPromise = (async () => {
      try {
        const url = `${config.getApiUrl(config.api.llm.hasKey)}?provider=${encodeURIComponent(provider)}`;
        console.log(`[LLMManager.hasApiKey] Fetching: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
          console.log(`[LLMManager.hasApiKey] Response NOT OK for ${provider}: ${response.status}`);
          return false;
        }

        const data = await response.json();
        const hasKey = data.hasKey;
        console.log(`[LLMManager.hasApiKey] Response for ${provider}: hasKey=${hasKey}`);

        // Cache the result
        apiKeyCache.set(provider, { value: hasKey, timestamp: Date.now() });
        return hasKey;
      } catch (error) {
        console.error(`[LLMManager.hasApiKey] Error checking API key for ${provider}:`, error);
        return false;
      } finally {
        // Clean up pending request
        pendingRequests.delete(provider);
      }
    })();

    pendingRequests.set(provider, requestPromise);
    return requestPromise;
  }

  /**
   * Clear the API key cache (call after setting a new key)
   */
  static clearApiKeyCache(provider?: string): void {
    if (provider) {
      apiKeyCache.delete(provider);
    } else {
      apiKeyCache.clear();
    }
  }

  /**
   * Check which providers have API keys configured
   */
  static async getConfiguredProviders(): Promise<Record<string, boolean>> {
    try {
      const response = await fetch(config.getApiUrl("/api/llm/has-key/all"));

      if (!response.ok) {
        return { gemini: false, openai: false, anthropic: false, xai: false, openrouter: false };
      }

      return await response.json();
    } catch (error) {
      console.error("Error checking configured providers:", error);
      return { gemini: false, openai: false, anthropic: false, xai: false, openrouter: false };
    }
  }

  /**
   * Fetch available models for a provider
   */
  static async fetchModels(
    provider: string,
    endpoint?: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      provider: string;
      intelligence: number;
      speed: number;
      cost: number;
      contextWindow: string;
      description: string;
    }>
  > {
    try {
      const url = new URL(config.getApiUrl(config.api.llm.models));
      url.searchParams.append("provider", provider);
      if (endpoint) {
        url.searchParams.append("endpoint", endpoint);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error(`Error fetching models for ${provider}:`, error);
      return [];
    }
  }

  /**
   * Fetch available Ollama models
   */
  static async fetchOllamaModels(endpoint?: string): Promise<
    Array<{
      id: string;
      name: string;
      provider: "ollama";
      intelligence: number;
      speed: number;
      cost: number;
      contextWindow: string;
      description: string;
    }>
  > {
    const baseEndpoint = endpoint || config.defaultOllamaEndpoint;

    try {
      const response = await fetch(
        `${config.getApiUrl(config.api.llm.models)}?provider=ollama&endpoint=${encodeURIComponent(baseEndpoint)}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch Ollama models");
      }

      const data = await response.json();
      // Add default values for the UI display properties
      return (data.models as Array<{ id: string; name: string }>).map(
        (model) => ({
          id: model.id,
          name: model.name,
          provider: "ollama" as const,
          intelligence: 80,
          speed: 90,
          cost: 0,
          contextWindow: "8k",
          description: `Local ${model.name} model via Ollama`,
        }),
      );
    } catch (error) {
      console.error("Error fetching Ollama models:", error);
      throw error;
    }
  }
}

// Types are already exported via interface declarations above
