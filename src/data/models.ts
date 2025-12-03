export interface ModelSpec {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "gemini" | "meta" | "ollama" | "openrouter";
  intelligence: number; // 0-100
  speed: number; // 0-100
  cost: number; // 0-100
  contextWindow: string;
  description: string;
  parameterSize?: number; // Size in billions (e.g., 8 for 8B, 70 for 70B)
}

/**
 * Threshold for "small" models that need lite prompts
 * Models below this size (in billions) will use simplified prompts
 */
export const SMALL_MODEL_THRESHOLD = 12; // 12B and below = lite mode

/**
 * Check if a model should use lite prompt mode
 */
export const isSmallModel = (model: ModelSpec): boolean => {
  // If parameterSize is specified, use it
  if (model.parameterSize !== undefined) {
    return model.parameterSize < SMALL_MODEL_THRESHOLD;
  }
  
  // For Ollama models, try to parse size from the name/id
  if (model.provider === "ollama") {
    const sizeMatch = model.id.match(/(\d+)b/i) || model.name.match(/(\d+)b/i);
    if (sizeMatch) {
      return parseInt(sizeMatch[1], 10) < SMALL_MODEL_THRESHOLD;
    }
    // Default Ollama models without size info to small (safer assumption)
    return true;
  }
  
  // Cloud models are generally large enough
  return false;
};

/**
 * Get parameter size from model (for display)
 */
export const getModelSize = (model: ModelSpec): string | null => {
  if (model.parameterSize) {
    return `${model.parameterSize}B`;
  }
  
  // Try to parse from name/id
  const sizeMatch = model.id.match(/(\d+)b/i) || model.name.match(/(\d+)b/i);
  if (sizeMatch) {
    return `${sizeMatch[1]}B`;
  }
  
  return null;
};

export const AVAILABLE_MODELS: ModelSpec[] = [
  {
    id: "auto",
    name: "Auto (Best Available)",
    provider: "openai",
    intelligence: 90,
    speed: 90,
    cost: 50,
    contextWindow: "128k",
    description: "Automatically selects the best model for the task.",
  },
  {
    id: "gpt-5-high",
    name: "GPT-5 (High Reasoning)",
    provider: "openai",
    intelligence: 98,
    speed: 60,
    cost: 95,
    contextWindow: "128k",
    description: "Next-gen reasoning model for complex tasks.",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    intelligence: 90,
    speed: 95,
    cost: 60,
    contextWindow: "128k",
    description: "Flagship model with multimodal capabilities.",
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    intelligence: 95,
    speed: 85,
    cost: 40,
    contextWindow: "200k",
    description: "Latest Claude Sonnet model with excellent coding abilities.",
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    intelligence: 92,
    speed: 85,
    cost: 35,
    contextWindow: "200k",
    description: "Ideal balance of intelligence and speed.",
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "anthropic",
    intelligence: 93,
    speed: 50,
    cost: 90,
    contextWindow: "200k",
    description: "Powerful model for complex tasks.",
  },
  {
    id: "gemini-1-5-pro",
    name: "Gemini 1.5 Pro",
    provider: "gemini",
    intelligence: 91,
    speed: 80,
    cost: 30,
    contextWindow: "1M",
    description: "Massive context window for large codebases.",
  },
  {
    id: "gemini-1-5-flash",
    name: "Gemini 1.5 Flash",
    provider: "gemini",
    intelligence: 85,
    speed: 100,
    cost: 10,
    contextWindow: "1M",
    description: "Extremely fast and cost-effective.",
  },
  {
    id: "ollama-llama3",
    name: "Llama 3 (Ollama)",
    provider: "ollama",
    intelligence: 88,
    speed: 95,
    cost: 0,
    contextWindow: "8k",
    description: "Local Llama 3 model via Ollama.",
  },
  {
    id: "ollama-mistral",
    name: "Mistral (Ollama)",
    provider: "ollama",
    intelligence: 85,
    speed: 98,
    cost: 0,
    contextWindow: "8k",
    description: "Local Mistral model via Ollama.",
  },
  {
    id: "ollama-codellama",
    name: "CodeLlama (Ollama)",
    provider: "ollama",
    intelligence: 80,
    speed: 90,
    cost: 0,
    contextWindow: "16k",
    description: "Local CodeLlama model via Ollama.",
  },
  // OpenRouter Models - Access to many models through one API
  {
    id: "openrouter/auto",
    name: "Auto (OpenRouter)",
    provider: "openrouter",
    intelligence: 90,
    speed: 85,
    cost: 30,
    contextWindow: "128k",
    description: "OpenRouter auto-selects the best model for your task.",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet (OpenRouter)",
    provider: "openrouter",
    intelligence: 92,
    speed: 85,
    cost: 35,
    contextWindow: "200k",
    description: "Claude 3.5 Sonnet via OpenRouter.",
  },
  {
    id: "anthropic/claude-3-opus",
    name: "Claude 3 Opus (OpenRouter)",
    provider: "openrouter",
    intelligence: 93,
    speed: 50,
    cost: 90,
    contextWindow: "200k",
    description: "Claude 3 Opus via OpenRouter.",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o (OpenRouter)",
    provider: "openrouter",
    intelligence: 90,
    speed: 95,
    cost: 60,
    contextWindow: "128k",
    description: "GPT-4o via OpenRouter.",
  },
  {
    id: "openai/gpt-4-turbo",
    name: "GPT-4 Turbo (OpenRouter)",
    provider: "openrouter",
    intelligence: 89,
    speed: 80,
    cost: 50,
    contextWindow: "128k",
    description: "GPT-4 Turbo via OpenRouter.",
  },
  {
    id: "google/gemini-pro-1.5",
    name: "Gemini Pro 1.5 (OpenRouter)",
    provider: "openrouter",
    intelligence: 91,
    speed: 80,
    cost: 30,
    contextWindow: "1M",
    description: "Gemini Pro 1.5 via OpenRouter.",
  },
  {
    id: "meta-llama/llama-3.1-405b-instruct",
    name: "Llama 3.1 405B (OpenRouter)",
    provider: "openrouter",
    intelligence: 94,
    speed: 60,
    cost: 45,
    contextWindow: "128k",
    parameterSize: 405,
    description: "Meta's largest Llama model via OpenRouter.",
  },
  {
    id: "meta-llama/llama-3.1-70b-instruct",
    name: "Llama 3.1 70B (OpenRouter)",
    provider: "openrouter",
    intelligence: 88,
    speed: 75,
    cost: 20,
    contextWindow: "128k",
    parameterSize: 70,
    description: "Llama 3.1 70B via OpenRouter.",
  },
  {
    id: "deepseek/deepseek-coder",
    name: "DeepSeek Coder (OpenRouter)",
    provider: "openrouter",
    intelligence: 85,
    speed: 90,
    cost: 10,
    contextWindow: "64k",
    description: "Specialized coding model via OpenRouter.",
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct",
    name: "Qwen 2.5 Coder 32B (OpenRouter)",
    provider: "openrouter",
    intelligence: 87,
    speed: 80,
    cost: 15,
    contextWindow: "128k",
    parameterSize: 32,
    description: "Qwen's coding-optimized model via OpenRouter.",
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large (OpenRouter)",
    provider: "openrouter",
    intelligence: 88,
    speed: 85,
    cost: 25,
    contextWindow: "128k",
    description: "Mistral's flagship model via OpenRouter.",
  },
];
