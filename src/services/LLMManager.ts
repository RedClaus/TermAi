/**
 * LLM Manager - Client-side interface for AI providers
 * All API calls are proxied through the backend server for security
 * API keys are stored server-side only
 */

import { config } from "../config";

export interface LLMProvider {
  chat(message: string, context?: string): Promise<string>;
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
  private endpoint?: string;

  constructor(provider: string, modelId?: string, endpoint?: string) {
    this.provider = provider;
    this.modelId = modelId || "auto";
    this.endpoint = endpoint;
  }

  async chat(message: string, context?: string): Promise<string> {
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

    // Add the current message
    messages.push({ role: "user", content: message });

    try {
      const response = await fetch(config.getApiUrl(config.api.llm.chat), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: this.provider,
          model: this.modelId,
          messages,
          systemPrompt: context ? undefined : "You are a helpful assistant.",
          endpoint: this.endpoint,
        }),
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
    switch (type) {
      case "gemini":
        return new ProxyLLMProvider("gemini", modelId);
      case "openai":
        return new ProxyLLMProvider("openai", modelId);
      case "anthropic":
        return new ProxyLLMProvider("anthropic", modelId);
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

      return true;
    } catch (error) {
      console.error("Error setting API key:", error);
      throw error;
    }
  }

  /**
   * Check if API key exists on the server
   */
  static async hasApiKey(provider: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${config.getApiUrl(config.api.llm.hasKey)}?provider=${encodeURIComponent(provider)}`,
      );

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.hasKey;
    } catch (error) {
      console.error("Error checking API key:", error);
      return false;
    }
  }

  /**
   * Check which providers have API keys configured
   */
  static async getConfiguredProviders(): Promise<Record<string, boolean>> {
    try {
      const response = await fetch(config.getApiUrl("/api/llm/has-key/all"));

      if (!response.ok) {
        return { gemini: false, openai: false, anthropic: false };
      }

      return await response.json();
    } catch (error) {
      console.error("Error checking configured providers:", error);
      return { gemini: false, openai: false, anthropic: false };
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
      return data.models;
    } catch (error) {
      console.error("Error fetching Ollama models:", error);
      throw error;
    }
  }
}

// Re-export types for backward compatibility
export type { LLMResponse, ChatMessage };
