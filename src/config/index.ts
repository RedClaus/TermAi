/**
 * Client-side configuration
 * All sensitive data (API keys) should be handled server-side only
 */

export const config = {
  // API endpoints - Dynamic detection for local network access
  // Allows manual override via localStorage 'termai_api_url'
  apiUrl: (typeof window !== 'undefined' && localStorage.getItem('termai_api_url')) ||
    import.meta.env.VITE_API_URL || 
    (typeof window !== 'undefined' 
      ? `${window.location.protocol}//${window.location.hostname}:3004` 
      : "http://localhost:3004"),

  wsUrl: (typeof window !== 'undefined' && localStorage.getItem('termai_api_url')) ||
    import.meta.env.VITE_WS_URL || 
    (typeof window !== 'undefined' 
      ? `${window.location.protocol}//${window.location.hostname}:3004` 
      : "http://localhost:3004"),

  // Default settings
  defaultProvider: import.meta.env.VITE_DEFAULT_PROVIDER || "gemini",
  defaultOllamaEndpoint:
    import.meta.env.VITE_DEFAULT_OLLAMA_ENDPOINT || "http://localhost:11434",

  // API paths
  api: {
    execute: "/api/execute",
    cancel: "/api/cancel",
    fs: {
      read: "/api/fs/read",
      write: "/api/fs/write",
      list: "/api/fs/list",
      mkdir: "/api/fs/mkdir",
    },
    llm: {
      chat: "/api/llm/chat",
      models: "/api/llm/models",
      setKey: "/api/llm/set-key",
      hasKey: "/api/llm/has-key",
    },
    ollama: {
      tags: "/api/proxy/ollama/tags",
      chat: "/api/proxy/ollama/chat",
    },
    session: {
      start: "/api/session/start",
      end: "/api/session/end",
      logs: "/api/session/logs",
    },
  },

  // Build full URL helper
  getApiUrl(path: string): string {
    return `${this.apiUrl}${path}`;
  },

  // Build WebSocket URL helper
  getWsUrl(): string {
    return this.wsUrl;
  },
} as const;

export type Config = typeof config;
