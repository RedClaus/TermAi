/**
 * LLM Proxy Routes
 * Handles all AI provider requests server-side to protect API keys
 */

const express = require("express");
const { getApiKey, setApiKey, hasApiKey } = require("../config");
const { logAIInteraction } = require("../middleware/logger");
const { strictRateLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// ===========================================
// API Key Management
// ===========================================

/**
 * POST /api/llm/set-key
 * Set API key for a provider (stored in memory only)
 */
router.post("/set-key", strictRateLimiter, (req, res) => {
  const { provider, apiKey } = req.body;

  if (!provider || !apiKey) {
    return res.status(400).json({ error: "Provider and apiKey are required" });
  }

  try {
    setApiKey(provider, apiKey);
    res.json({ success: true, message: `API key set for ${provider}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/llm/has-key
 * Check if API key exists for a provider
 */
router.get("/has-key", (req, res) => {
  const { provider } = req.query;

  if (!provider) {
    return res.status(400).json({ error: "Provider is required" });
  }

  res.json({
    provider,
    hasKey: hasApiKey(provider),
  });
});

/**
 * GET /api/llm/has-key/all
 * Check which providers have keys configured
 */
router.get("/has-key/all", (req, res) => {
  res.json({
    gemini: hasApiKey("gemini"),
    openai: hasApiKey("openai"),
    anthropic: hasApiKey("anthropic"),
  });
});

// ===========================================
// Chat Endpoint
// ===========================================

/**
 * POST /api/llm/chat
 * Unified chat endpoint for all providers
 */
router.post("/chat", strictRateLimiter, async (req, res) => {
  const { provider, model, messages, systemPrompt } = req.body;

  if (!provider) {
    return res.status(400).json({ error: "Provider is required" });
  }

  const apiKey = getApiKey(provider);

  console.log(
    `[LLM Chat] Provider: ${provider}, Model: ${model}, Has API Key: ${!!apiKey}, Key length: ${apiKey?.length || 0}`,
  );

  // For Ollama, no API key needed
  if (provider !== "ollama" && !apiKey) {
    return res.status(401).json({
      error: `No API key configured for ${provider}. Please set it in settings.`,
    });
  }

  try {
    let response;

    switch (provider) {
      case "gemini":
        response = await handleGeminiChat(
          apiKey,
          model,
          messages,
          systemPrompt,
        );
        break;
      case "openai":
        response = await handleOpenAIChat(
          apiKey,
          model,
          messages,
          systemPrompt,
        );
        break;
      case "anthropic":
        response = await handleAnthropicChat(
          apiKey,
          model,
          messages,
          systemPrompt,
        );
        break;
      case "ollama":
        response = await handleOllamaChat(
          req.body.endpoint,
          model,
          messages,
          systemPrompt,
        );
        break;
      default:
        return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    // Log AI interaction
    const sessionId = req.body.sessionId;
    const inputLength =
      messages?.reduce((sum, m) => sum + (m.content?.length || 0), 0) || 0;
    logAIInteraction(
      sessionId,
      provider,
      model,
      inputLength,
      response.content?.length || 0,
    );

    res.json(response);
  } catch (error) {
    console.error(`[LLM Proxy] Error with ${provider}:`, error.message);
    res.status(500).json({
      error: error.message,
      provider,
    });
  }
});

// ===========================================
// Provider-Specific Handlers
// ===========================================

/**
 * Handle Google Gemini chat
 */
async function handleGeminiChat(apiKey, model, messages, systemPrompt) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");

  const genAI = new GoogleGenerativeAI(apiKey);

  // Map model IDs
  const modelMap = {
    "gemini-1-5-pro": "gemini-1.5-pro",
    "gemini-1-5-flash": "gemini-1.5-flash",
    auto: "gemini-1.5-pro",
  };
  const realModel = modelMap[model] || model || "gemini-1.5-pro";

  const geminiModel = genAI.getGenerativeModel({ model: realModel });

  // Build prompt from messages
  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  const context = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  const prompt = systemPrompt
    ? `${systemPrompt}\n\nConversation:\n${context}`
    : context;

  const result = await geminiModel.generateContent(prompt);
  const response = await result.response;

  return {
    content: response.text(),
    provider: "gemini",
    model: realModel,
  };
}

/**
 * Handle OpenAI chat
 */
async function handleOpenAIChat(apiKey, model, messages, systemPrompt) {
  const OpenAI = require("openai");

  const client = new OpenAI({ apiKey });

  // Map model IDs
  const modelMap = {
    "gpt-5-high": "gpt-4o",
    "gpt-4o": "gpt-4o",
    auto: "gpt-4o",
  };
  const realModel = modelMap[model] || model || "gpt-4o";

  // Build messages array
  const openaiMessages = [];

  if (systemPrompt) {
    openaiMessages.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "assistant") {
      openaiMessages.push({
        role: msg.role === "ai" ? "assistant" : msg.role,
        content: msg.content,
      });
    } else if (msg.role === "system") {
      openaiMessages.push({
        role: "user",
        content: `[System]: ${msg.content}`,
      });
    }
  }

  const completion = await client.chat.completions.create({
    model: realModel,
    messages: openaiMessages,
  });

  return {
    content: completion.choices[0]?.message?.content || "No response",
    provider: "openai",
    model: realModel,
    usage: completion.usage,
  };
}

/**
 * Handle Anthropic chat
 */
async function handleAnthropicChat(apiKey, model, messages, systemPrompt) {
  const Anthropic = require("@anthropic-ai/sdk");

  // Trim whitespace from API key
  const cleanApiKey = apiKey?.trim();
  console.log(
    `[Anthropic] API Key starts with: ${cleanApiKey?.substring(0, 10)}..., length: ${cleanApiKey?.length}`,
  );

  const client = new Anthropic({ apiKey: cleanApiKey });

  // Map model IDs - using correct Anthropic model names
  const modelMap = {
    "claude-sonnet-4": "claude-sonnet-4-20250514",
    "claude-3-5-sonnet": "claude-3-5-sonnet-latest",
    "claude-3-opus": "claude-3-opus-latest",
    auto: "claude-sonnet-4-20250514",
  };

  // Normalize model ID and apply mapping
  const normalizedModel = model?.trim()?.toLowerCase() || "auto";
  let realModel = modelMap[normalizedModel];

  // If not in map, check if it's already a valid full model name
  if (!realModel) {
    if (
      normalizedModel.includes("sonnet-4") ||
      normalizedModel.includes("sonnet4")
    ) {
      realModel = "claude-sonnet-4-20250514";
    } else if (
      normalizedModel.includes("3-5-sonnet") ||
      normalizedModel.includes("3.5")
    ) {
      realModel = "claude-3-5-sonnet-latest";
    } else if (normalizedModel.includes("opus")) {
      realModel = "claude-3-opus-latest";
    } else {
      // Default to claude-sonnet-4
      realModel = "claude-sonnet-4-20250514";
    }
  }

  console.log(
    `[Anthropic] Model requested: "${model}" -> Using: "${realModel}"`,
  );

  // Build messages array (Anthropic format)
  const anthropicMessages = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      anthropicMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "ai" || msg.role === "assistant") {
      anthropicMessages.push({ role: "assistant", content: msg.content });
    } else if (msg.role === "system") {
      // Anthropic doesn't support system role in messages, prepend to user
      anthropicMessages.push({
        role: "user",
        content: `[System Output]: ${msg.content}`,
      });
    }
  }

  const response = await client.messages.create({
    model: realModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  const textContent = response.content.find((block) => block.type === "text");

  return {
    content: textContent?.text || "No response",
    provider: "anthropic",
    model: realModel,
    usage: response.usage,
  };
}

/**
 * Handle Ollama chat
 */
async function handleOllamaChat(endpoint, model, messages, systemPrompt) {
  const baseUrl =
    endpoint || process.env.OLLAMA_ENDPOINT || "http://localhost:11434";

  // Handle dynamic model IDs
  let realModel = model;
  if (model?.startsWith("ollama-")) {
    realModel = model.replace("ollama-", "");
  }
  realModel = realModel || "llama3";

  // Build messages array
  const ollamaMessages = [];

  if (systemPrompt) {
    ollamaMessages.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      ollamaMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "ai" || msg.role === "assistant") {
      ollamaMessages.push({ role: "assistant", content: msg.content });
    } else if (msg.role === "system") {
      ollamaMessages.push({
        role: "user",
        content: `[System]: ${msg.content}`,
      });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: realModel,
        messages: ollamaMessages,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error: ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || "No response",
      provider: "ollama",
      model: realModel,
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("Request timeout - Ollama took too long to respond");
    }
    throw error;
  }
}

// ===========================================
// Models Endpoint
// ===========================================

/**
 * GET /api/llm/models
 * Get available models for a provider
 */
router.get("/models", async (req, res) => {
  const { provider, endpoint } = req.query;

  if (provider === "ollama") {
    try {
      const baseUrl =
        endpoint || process.env.OLLAMA_ENDPOINT || "http://localhost:11434";
      const response = await fetch(`${baseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models.map((m) => ({
        id: `ollama-${m.name}`,
        name: `${m.name} (Ollama)`,
        provider: "ollama",
        intelligence: 80,
        speed: 90,
        cost: 0,
        contextWindow: "Unknown",
        description: `Local model: ${m.name}`,
      }));

      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (provider === "gemini") {
    const apiKey = getApiKey("gemini");
    if (!apiKey) {
      return res.json({ models: [] });
    }

    try {
      const models = await handleGeminiModels(apiKey);
      res.json({ models });
    } catch (error) {
      console.error("Error fetching Gemini models:", error);
      res.status(500).json({ error: error.message });
    }
  } else {
    // Return static model list for other cloud providers
    res.json({ models: [] });
  }
});

// ===========================================
// Helper Functions
// ===========================================

/**
 * Fetch Gemini models via REST API
 */
async function handleGeminiModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  
  return (data.models || [])
    .filter(m => m.name.includes("gemini")) // Filter for Gemini models
    .map(m => {
      const id = m.name.replace("models/", "");
      const isPro = id.includes("pro");
      const isFlash = id.includes("flash");
      
      return {
        id,
        name: m.displayName || id,
        provider: "gemini",
        intelligence: isPro ? 95 : (isFlash ? 85 : 90),
        speed: isFlash ? 100 : (isPro ? 80 : 90),
        cost: isFlash ? 10 : (isPro ? 30 : 20), // Rough estimates relative to UI scale
        contextWindow: m.inputTokenLimit ? `${Math.round(m.inputTokenLimit/1000)}k` : "Unknown",
        description: m.description || "Google Gemini Model"
      };
    })
    .sort((a, b) => b.id.localeCompare(a.id)); // Sort by ID descending (usually newer first)
}

module.exports = router;
