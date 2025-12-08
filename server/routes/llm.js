/**
 * LLM Proxy Routes
 * Handles all AI provider requests server-side to protect API keys
 */

const express = require("express");
const { getApiKey, setApiKey, hasApiKey, clearApiKey } = require("../config");
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
  console.log(`[LLM] /has-key endpoint called with provider: ${provider}`);

  if (!provider) {
    console.log(`[LLM] /has-key - ERROR: Provider is required`);
    return res.status(400).json({ error: "Provider is required" });
  }

  const keyExists = hasApiKey(provider);
  console.log(`[LLM] /has-key - Provider: ${provider}, hasKey: ${keyExists}`);

  res.json({
    provider,
    hasKey: keyExists,
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
    xai: hasApiKey("xai"),
    openrouter: hasApiKey("openrouter"),
  });
});

/**
 * DELETE /api/llm/delete-key
 * Delete/clear API key for a provider
 */
router.delete("/delete-key", strictRateLimiter, (req, res) => {
  const { provider } = req.body;

  if (!provider) {
    return res.status(400).json({ error: "Provider is required" });
  }

  try {
    clearApiKey(provider);
    res.json({ success: true, message: `API key cleared for ${provider}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
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
      case "xai":
        response = await handleXAIChat(
          apiKey,
          model,
          messages,
          systemPrompt,
        );
        break;
      case "openrouter":
        // OpenRouter uses OpenAI-compatible API
        response = await handleOpenAIChat(
          apiKey,
          model,
          messages,
          systemPrompt,
          "https://openrouter.ai/api/v1"
        );
        // Correct provider in response
        response.provider = "openrouter";
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

  // Map model IDs (frontend format -> Google API format)
  const modelMap = {
    "gemini-1-5-pro": "gemini-1.5-pro",
    "gemini-1-5-pro-002": "gemini-1.5-pro-002",
    "gemini-1-5-flash": "gemini-1.5-flash",
    "gemini-1-5-flash-002": "gemini-1.5-flash-002",
    "gemini-1-5-flash-8b": "gemini-1.5-flash-8b",
    "gemini-2.0-flash-exp": "gemini-2.0-flash-exp",
    "gemini-exp-1206": "gemini-exp-1206",
    "gemini-exp-1121": "gemini-exp-1121",
    "gemini-exp-1114": "gemini-exp-1114",
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
 * Handle OpenAI chat (and compatible APIs like xAI, OpenRouter)
 */
async function handleOpenAIChat(apiKey, model, messages, systemPrompt, baseURL) {
  const OpenAI = require("openai");

  const client = new OpenAI({ 
    apiKey,
    baseURL: baseURL || undefined
  });

  // Map model IDs
  const modelMap = {
    "gpt-5-high": "gpt-4o",
    "gpt-4o": "gpt-4o",
    auto: "gpt-4o",
  };
  // Don't map if using custom baseURL (like xAI or OpenRouter) unless necessary
  const realModel = (!baseURL && modelMap[model]) || model || "gpt-4o";

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
 * Handle xAI (Grok) chat
 */
async function handleXAIChat(apiKey, model, messages, systemPrompt) {
  // xAI is OpenAI compatible
  const response = await handleOpenAIChat(
    apiKey,
    model,
    messages,
    systemPrompt,
    "https://api.x.ai/v1"
  );
  response.provider = "xai";
  return response;
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
  } else if (provider === "openai") {
    const apiKey = getApiKey("openai");
    if (!apiKey) {
      return res.json({ models: [] });
    }

    try {
      const models = await handleOpenAIModels(apiKey);
      res.json({ models });
    } catch (error) {
      console.error("Error fetching OpenAI models:", error);
      res.status(500).json({ error: error.message });
    }
  } else if (provider === "anthropic") {
    const apiKey = getApiKey("anthropic");
    if (!apiKey) {
      return res.json({ models: [] });
    }

    try {
      const models = await handleAnthropicModels(apiKey);
      res.json({ models });
    } catch (error) {
      console.error("Error fetching Anthropic models:", error);
      res.status(500).json({ error: error.message });
    }
  } else if (provider === "openrouter") {
    const apiKey = getApiKey("openrouter");
    if (!apiKey) {
      return res.json({ models: [] });
    }

    try {
      const models = await handleOpenRouterModels(apiKey);
      res.json({ models });
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);
      res.status(500).json({ error: error.message });
    }
  } else if (provider === "xai") {
    const apiKey = getApiKey("xai");
    if (!apiKey) {
      return res.json({ models: [] });
    }

    try {
      const models = await handleXAIModels(apiKey);
      res.json({ models });
    } catch (error) {
      console.error("Error fetching xAI models:", error);
      res.status(500).json({ error: error.message });
    }
  } else {
    // Return empty list for unknown providers
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
    .filter(m => m.name.includes("gemini") && m.supportedGenerationMethods?.includes("generateContent")) // Filter for Gemini models that support content generation
    .map(m => {
      const id = m.name.replace("models/", "");
      const isPro = id.includes("pro");
      const isFlash = id.includes("flash");
      const isExp = id.includes("exp");
      const is2_0 = id.includes("2.0") || id.includes("2-0");
      
      // Better intelligence scoring based on model type
      let intelligence = 90; // default
      if (isExp) intelligence = 95; // experimental models are usually highest tier
      else if (is2_0) intelligence = 92; // 2.0 models
      else if (isPro) intelligence = 91; // pro models
      else if (isFlash) intelligence = 85; // flash models
      
      return {
        id,
        name: m.displayName || id,
        provider: "gemini",
        intelligence,
        speed: isFlash ? 100 : (isPro ? 80 : 90),
        cost: isFlash ? 10 : (isPro ? 30 : 20),
        contextWindow: m.inputTokenLimit ? `${Math.round(m.inputTokenLimit/1000)}k` : "Unknown",
        description: m.description || "Google Gemini Model"
      };
    })
    .sort((a, b) => {
      // Sort: experimental first, then 2.0, then by version descending
      if (a.id.includes("exp") && !b.id.includes("exp")) return -1;
      if (!a.id.includes("exp") && b.id.includes("exp")) return 1;
      if (a.id.includes("2.0") && !b.id.includes("2.0")) return -1;
      if (!a.id.includes("2.0") && b.id.includes("2.0")) return 1;
      return b.id.localeCompare(a.id);
    });
}

/**
 * Fetch OpenAI models via API
 */
async function handleOpenAIModels(apiKey) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey });

  try {
    const response = await client.models.list();
    
    // Start with API models
    let models = response.data
      .filter(m => m.id.includes("gpt") || m.id.includes("o1") || m.id.includes("o3") || m.id.includes("o4"))
      .map(m => {
        const isGPT5 = m.id.includes("gpt-5");
        const isGPT4 = m.id.includes("gpt-4");
        const isGPT4o = m.id.includes("gpt-4o");
        const isO1 = m.id.includes("o1");
        const isO3 = m.id.includes("o3");
        const isO4 = m.id.includes("o4");
        const isTurbo = m.id.includes("turbo");
        
        let intelligence = 85;
        let speed = 80;
        let cost = 50;
        
        if (isGPT5) {
            intelligence = 98;
            speed = 85;
            cost = 90;
        } else if (isO3 || isO4) {
            intelligence = 99;
            speed = 60;
            cost = 95;
        } else if (isO1) {
          intelligence = 98;
          speed = 60;
          cost = 95;
        } else if (isGPT4o) {
          intelligence = 90;
          speed = 95;
          cost = 60;
        } else if (isGPT4) {
          intelligence = 89;
          speed = isTurbo ? 85 : 70;
          cost = isTurbo ? 50 : 80;
        }
        
        return {
          id: m.id,
          name: m.id,
          provider: "openai",
          intelligence,
          speed,
          cost,
          contextWindow: (isGPT5 || isO3 || isO4) ? "200k" : (isO1 ? "200k" : (isGPT4 ? "128k" : "16k")),
          description: `OpenAI ${m.id}`
        };
      });

    // Explicitly check if new models are missing and add them if API didn't return them yet
    // (e.g. if user has not yet been granted access, or for fallback)
    const expectedModels = ["gpt-5.1", "gpt-5", "o3", "o4-mini"];
    const existingIds = new Set(models.map(m => m.id));

    for (const id of expectedModels) {
        if (!existingIds.has(id)) {
            let intelligence = 98;
            if (id.includes("5.1")) intelligence = 99;
            models.push({
                id,
                name: id.toUpperCase(),
                provider: "openai",
                intelligence,
                speed: 85,
                cost: 90,
                contextWindow: "200k",
                description: `OpenAI ${id} (Fallback)`
            });
        }
    }

    return models.sort((a, b) => b.intelligence - a.intelligence);

  } catch (error) {
    console.error("OpenAI API error:", error);
    // Return static list if API fails
    return [
        { id: "gpt-5.1", name: "GPT-5.1", provider: "openai", intelligence: 99, speed: 85, cost: 90, contextWindow: "200k" },
        { id: "gpt-5", name: "GPT-5", provider: "openai", intelligence: 98, speed: 85, cost: 90, contextWindow: "200k" },
        { id: "o3", name: "o3", provider: "openai", intelligence: 98, speed: 60, cost: 95, contextWindow: "200k" },
        { id: "o4-mini", name: "o4-mini", provider: "openai", intelligence: 98, speed: 95, cost: 30, contextWindow: "200k" },
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", intelligence: 90, speed: 95, cost: 60, contextWindow: "128k" }
    ];
  }
}

/**
 * Fetch Anthropic models (static list - Anthropic doesn't have a models API)
 */
async function handleAnthropicModels(apiKey) {
  // Anthropic doesn't provide a models listing API
  // Return known models
  return [
    {
      id: "claude-opus-4.5",
      name: "Claude Opus 4.5",
      provider: "anthropic",
      intelligence: 98,
      speed: 60,
      cost: 95,
      contextWindow: "500k",
      description: "Latest, most intelligent Claude model (Nov 2025)"
    },
    {
      id: "claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      provider: "anthropic",
      intelligence: 95,
      speed: 85,
      cost: 45,
      contextWindow: "500k",
      description: "Balanced intelligence and speed, part of 4.5 family"
    },
    {
      id: "claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      provider: "anthropic",
      intelligence: 88,
      speed: 100,
      cost: 15,
      contextWindow: "500k",
      description: "Fastest 4.5 model"
    },
    {
      id: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet (New)",
      provider: "anthropic",
      intelligence: 95,
      speed: 85,
      cost: 40,
      contextWindow: "200k",
      description: "Latest Claude 3.5 Sonnet with improved coding and analysis"
    },
    {
      id: "claude-3-5-sonnet-20240620",
      name: "Claude 3.5 Sonnet",
      provider: "anthropic",
      intelligence: 92,
      speed: 85,
      cost: 35,
      contextWindow: "200k",
      description: "Ideal balance of intelligence and speed"
    },
    {
      id: "claude-3-opus-20240229",
      name: "Claude 3 Opus",
      provider: "anthropic",
      intelligence: 93,
      speed: 50,
      cost: 90,
      contextWindow: "200k",
      description: "Most powerful Claude model"
    },
    {
      id: "claude-3-sonnet-20240229",
      name: "Claude 3 Sonnet",
      provider: "anthropic",
      intelligence: 88,
      speed: 80,
      cost: 30,
      contextWindow: "200k",
      description: "Balanced performance"
    },
    {
      id: "claude-3-haiku-20240307",
      name: "Claude 3 Haiku",
      provider: "anthropic",
      intelligence: 80,
      speed: 100,
      cost: 10,
      contextWindow: "200k",
      description: "Fastest Claude model"
    }
  ];
}

/**
 * Fetch OpenRouter models via API
 */
async function handleOpenRouterModels(apiKey) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/yourusername/termai",
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return data.data
      .filter(m => !m.id.includes(":free")) // Filter out free tier duplicates
      .slice(0, 50) // Limit to top 50 models
      .map(m => {
        // Parse pricing
        const promptCost = parseFloat(m.pricing?.prompt || 0);
        const completionCost = parseFloat(m.pricing?.completion || 0);
        const avgCost = (promptCost + completionCost) / 2;
        
        // Estimate intelligence and speed based on model name
        let intelligence = 85;
        let speed = 80;
        
        if (m.id.includes("gpt-4") || m.id.includes("claude-3") || m.id.includes("opus")) {
          intelligence = 92;
          speed = 70;
        } else if (m.id.includes("flash") || m.id.includes("haiku")) {
          intelligence = 85;
          speed = 100;
        }
        
        // Normalize cost to 0-100 scale (based on typical ranges)
        const normalizedCost = Math.min(100, avgCost * 1000000); // Convert to cost per 1M tokens
        
        return {
          id: m.id,
          name: m.name || m.id,
          provider: "openrouter",
          intelligence,
          speed,
          cost: Math.round(normalizedCost),
          contextWindow: m.context_length ? `${Math.round(m.context_length/1000)}k` : "Unknown",
          description: m.description || `${m.name} via OpenRouter`
        };
      })
      .sort((a, b) => b.intelligence - a.intelligence);
  } catch (error) {
    console.error("OpenRouter API error:", error);
    throw error;
  }
}

/**
 * Fetch xAI models
 */
async function handleXAIModels(apiKey) {
    // xAI API is OpenAI compatible for models list
    // If the API call fails or doesn't return expected models yet, use static list
    const OpenAI = require("openai");
    const client = new OpenAI({ 
        apiKey,
        baseURL: "https://api.x.ai/v1"
    });

    try {
        const response = await client.models.list();
        let models = response.data.map(m => ({
            id: m.id,
            name: m.id.toUpperCase(),
            provider: "xai",
            intelligence: m.id.includes("grok-3") ? 95 : (m.id.includes("grok-2") ? 90 : 85),
            speed: m.id.includes("fast") ? 95 : 80,
            cost: 20,
            contextWindow: "128k",
            description: `xAI ${m.id}`
        }));

        // Explicitly check for requested models if missing
        const required = [
            { id: "grok-4.1", name: "Grok 4.1", intelligence: 96, speed: 90 },
            { id: "grok-4", name: "Grok 4", intelligence: 95, speed: 85 },
            { id: "grok-4-heavy", name: "Grok 4 Heavy", intelligence: 97, speed: 70 },
            { id: "grok-code-fast-1", name: "Grok Code Fast 1", intelligence: 92, speed: 100 },
        ];
        
        const existingIds = new Set(models.map(m => m.id));
        for (const req of required) {
            if (!existingIds.has(req.id)) {
                models.push({
                    id: req.id,
                    name: req.name,
                    provider: "xai",
                    intelligence: req.intelligence,
                    speed: req.speed,
                    cost: 30,
                    contextWindow: "1M",
                    description: `${req.name} (Fallback)`
                });
            }
        }
        return models.sort((a, b) => b.intelligence - a.intelligence);
    } catch (e) {
        console.warn("xAI API model fetch failed, using static list", e.message);
        return [
            { id: "grok-4.1", name: "Grok 4.1", provider: "xai", intelligence: 96, speed: 90, cost: 30, contextWindow: "1M" },
            { id: "grok-4", name: "Grok 4", provider: "xai", intelligence: 95, speed: 85, cost: 30, contextWindow: "1M" },
            { id: "grok-4-heavy", name: "Grok 4 Heavy", provider: "xai", intelligence: 97, speed: 70, cost: 50, contextWindow: "1M" },
            { id: "grok-code-fast-1", name: "Grok Code Fast 1", provider: "xai", intelligence: 92, speed: 100, cost: 15, contextWindow: "128k" },
            { id: "grok-2-1212", name: "Grok 2", provider: "xai", intelligence: 90, speed: 85, cost: 20, contextWindow: "128k" },
            { id: "grok-2-vision-1212", name: "Grok 2 Vision", provider: "xai", intelligence: 90, speed: 80, cost: 20, contextWindow: "128k" },
            { id: "grok-beta", name: "Grok Beta", provider: "xai", intelligence: 88, speed: 80, cost: 15, contextWindow: "128k" }
        ];
    }
}

/**
 * Shared LLM chat function for use by other modules (e.g., FlowEngine)
 * @param {string} provider - Provider name (gemini, openai, anthropic, ollama)
 * @param {string} model - Model ID
 * @param {Array} messages - Chat messages
 * @param {string} systemPrompt - Optional system prompt
 * @returns {Promise<{content: string, provider: string, model: string}>}
 */
async function llmChat(provider, model, messages, systemPrompt) {
  const apiKey = getApiKey(provider);
  
  // For Ollama, no API key needed
  if (provider !== "ollama" && !apiKey) {
    throw new Error(`No API key configured for ${provider}. Please set it in settings.`);
  }

  switch (provider) {
    case "gemini":
      return await handleGeminiChat(apiKey, model, messages, systemPrompt);
    case "openai":
      return await handleOpenAIChat(apiKey, model, messages, systemPrompt);
    case "anthropic":
      return await handleAnthropicChat(apiKey, model, messages, systemPrompt);
    case "xai":
      return await handleXAIChat(apiKey, model, messages, systemPrompt);
    case "ollama":
      return await handleOllamaChat(undefined, model, messages, systemPrompt);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

module.exports = router;
module.exports.llmChat = llmChat;
