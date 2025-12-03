/**
 * Shared API Client Utility
 * Centralized HTTP client with error handling and type safety
 */
import { config } from "../config";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ApiError extends Error {
  status?: number | undefined;
  code?: string | undefined;
}

/**
 * Create a standardized API error
 */
function createApiError(
  message: string,
  status?: number | undefined,
  code?: string | undefined,
): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Base fetch wrapper with error handling
 */
async function baseFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.error || errorBody.message || errorMessage;
    } catch {
      // Ignore JSON parse errors for error responses
    }
    throw createApiError(errorMessage, response.status);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw createApiError("Invalid JSON response", response.status);
  }
}

/**
 * API Client class with methods for each endpoint
 */
export const api = {
  /**
   * Make a GET request
   */
  async get<T>(path: string): Promise<T> {
    return baseFetch<T>(config.getApiUrl(path), { method: "GET" });
  },

  /**
   * Make a POST request
   */
  async post<T, D = unknown>(path: string, data?: D): Promise<T> {
    const options: RequestInit = { method: "POST" };
    if (data !== undefined) {
      options.body = JSON.stringify(data);
    }
    return baseFetch<T>(config.getApiUrl(path), options);
  },

  /**
   * Make a PUT request
   */
  async put<T, D = unknown>(path: string, data?: D): Promise<T> {
    const options: RequestInit = { method: "PUT" };
    if (data !== undefined) {
      options.body = JSON.stringify(data);
    }
    return baseFetch<T>(config.getApiUrl(path), options);
  },

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string): Promise<T> {
    return baseFetch<T>(config.getApiUrl(path), { method: "DELETE" });
  },

  // =========================================
  // LLM API Methods
  // =========================================

  llm: {
    async chat(
      provider: string,
      model: string,
      systemPrompt: string,
      userMessage: string,
    ): Promise<{ response: string }> {
      return api.post(config.api.llm.chat, {
        provider,
        model,
        systemPrompt,
        userMessage,
      });
    },

    async setKey(
      provider: string,
      apiKey: string,
    ): Promise<{ success: boolean }> {
      return api.post(config.api.llm.setKey, { provider, apiKey });
    },

    async hasKey(provider: string): Promise<{ hasKey: boolean }> {
      return api.post(config.api.llm.hasKey, { provider });
    },

    async getModels(provider: string): Promise<{ models: string[] }> {
      return api.post(config.api.llm.models, { provider });
    },
  },

  // =========================================
  // File System API Methods
  // =========================================

  fs: {
    async read(path: string): Promise<{ content: string }> {
      return api.post(config.api.fs.read, { path });
    },

    async write(path: string, content: string): Promise<{ success: boolean }> {
      return api.post(config.api.fs.write, { path, content });
    },

    async list(path: string): Promise<{
      files: Array<{ name: string; isDirectory: boolean }>;
    }> {
      return api.post(config.api.fs.list, { path });
    },

    async mkdir(path: string): Promise<{ success: boolean }> {
      return api.post(config.api.fs.mkdir, { path });
    },
  },

  // =========================================
  // Command Execution API Methods
  // =========================================

  execute: {
    async run(
      command: string,
      cwd: string,
    ): Promise<{ output: string; exitCode: number; newCwd?: string }> {
      return api.post(config.api.execute, { command, cwd });
    },

    async cancel(commandId: string): Promise<{ success: boolean }> {
      return api.post(config.api.cancel, { commandId });
    },
  },

  // =========================================
  // Ollama API Methods
  // =========================================

  ollama: {
    async getTags(endpoint: string): Promise<{
      models: Array<{ name: string; model: string }>;
    }> {
      // Ollama uses a different endpoint structure
      const ollamaUrl = `${endpoint}/api/tags`;
      return baseFetch(ollamaUrl, { method: "GET" });
    },

    async chat(
      endpoint: string,
      model: string,
      systemPrompt: string,
      userMessage: string,
    ): Promise<{ response: string }> {
      const ollamaUrl = `${endpoint}/api/chat`;
      return baseFetch(ollamaUrl, {
        method: "POST",
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: false,
        }),
      });
    },
  },
};

export type Api = typeof api;
