/**
 * Server configuration module
 * Loads environment variables and provides typed access
 */

require("dotenv").config();

const config = {
  // Server settings
  port: parseInt(process.env.PORT || "3001", 10),
  host: process.env.HOST || "0.0.0.0",

  // CORS settings
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
    : ["http://localhost:5173", "http://localhost:3000"],

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "1000", 10),
  },

  // File system sandbox
  sandboxDirectory: process.env.SANDBOX_DIRECTORY || null,

  // API Keys (server-side only)
  apiKeys: {
    gemini: process.env.GEMINI_API_KEY || null,
    openai: process.env.OPENAI_API_KEY || null,
    anthropic: process.env.ANTHROPIC_API_KEY || null,
  },

  // Ollama endpoint
  ollamaEndpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434",

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || "logs/termai.log",
  },
};

// Runtime API key storage (for keys set via API, not persisted)
const runtimeKeys = {
  gemini: null,
  openai: null,
  anthropic: null,
};

/**
 * Get API key for a provider (checks runtime first, then env)
 */
function getApiKey(provider) {
  return runtimeKeys[provider] || config.apiKeys[provider] || null;
}

/**
 * Set API key at runtime (not persisted)
 */
function setApiKey(provider, key) {
  if (!["gemini", "openai", "anthropic"].includes(provider)) {
    throw new Error(`Invalid provider: ${provider}`);
  }
  runtimeKeys[provider] = key;
}

/**
 * Check if API key exists for a provider
 */
function hasApiKey(provider) {
  return !!getApiKey(provider);
}

/**
 * Clear runtime API key
 */
function clearApiKey(provider) {
  runtimeKeys[provider] = null;
}

module.exports = {
  config,
  getApiKey,
  setApiKey,
  hasApiKey,
  clearApiKey,
};
