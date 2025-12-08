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
    id: "grok-2-1212",
    name: "Grok 2 (xAI)",
    provider: "openrouter",
    intelligence: 93,
    speed: 85,
    cost: 25,
    contextWindow: "128k",
    description: "xAI's Grok 2 model - helpful and maximally truthful AI.",
  },
  {
    id: "grok-2-vision-1212",
    name: "Grok 2 Vision (xAI)",
    provider: "openrouter",
    intelligence: 93,
    speed: 80,
    cost: 25,
    contextWindow: "128k",
    description: "xAI's Grok 2 with vision capabilities.",
  },
  {
    id: "o1-preview",
    name: "o1 Preview",
    provider: "openai",
    intelligence: 97,
    speed: 65,
    cost: 90,
    contextWindow: "128k",
    description: "Preview of o1 reasoning capabilities.",
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
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    intelligence: 85,
    speed: 100,
    cost: 20,
    contextWindow: "128k",
    description: "Smaller, faster version of GPT-4o.",
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    intelligence: 89,
    speed: 85,
    cost: 50,
    contextWindow: "128k",
    description: "Optimized GPT-4 for speed and cost.",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet (New)",
    provider: "anthropic",
    intelligence: 95,
    speed: 85,
    cost: 40,
    contextWindow: "200k",
    description: "Latest Claude 3.5 Sonnet with improved coding and analysis.",
  },
  {
    id: "claude-3-5-sonnet-20240620",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    intelligence: 92,
    speed: 85,
    cost: 35,
    contextWindow: "200k",
    description: "Ideal balance of intelligence and speed.",
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "anthropic",
    intelligence: 93,
    speed: 50,
    cost: 90,
    contextWindow: "200k",
    description: "Most powerful Claude model.",
  },
  {
    id: "claude-3-sonnet-20240229",
    name: "Claude 3 Sonnet",
    provider: "anthropic",
    intelligence: 88,
    speed: 80,
    cost: 30,
    contextWindow: "200k",
    description: "Balanced performance.",
  },
  {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    intelligence: 80,
    speed: 100,
    cost: 10,
    contextWindow: "200k",
    description: "Fastest Claude model.",
  },
  {
    id: "gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash (Experimental)",
    provider: "gemini",
    intelligence: 92,
    speed: 100,
    cost: 5,
    contextWindow: "1M",
    description: "Latest experimental Gemini 2.0 model with enhanced multimodal capabilities.",
  },
  {
    id: "gemini-exp-1206",
    name: "Gemini Exp 1206",
    provider: "gemini",
    intelligence: 95,
    speed: 75,
    cost: 30,
    contextWindow: "2M",
    description: "Latest experimental Gemini model (December 2024 release).",
  },
  {
    id: "gemini-exp-1121",
    name: "Gemini Exp 1121",
    provider: "gemini",
    intelligence: 94,
    speed: 75,
    cost: 30,
    contextWindow: "2M",
    description: "Experimental Gemini model (November 2024 release).",
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
    id: "gemini-1-5-pro-002",
    name: "Gemini 1.5 Pro 002",
    provider: "gemini",
    intelligence: 91,
    speed: 85,
    cost: 30,
    contextWindow: "2M",
    description: "Latest stable Gemini 1.5 Pro with improved performance.",
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
    id: "gemini-1-5-flash-002",
    name: "Gemini 1.5 Flash 002",
    provider: "gemini",
    intelligence: 87,
    speed: 100,
    cost: 10,
    contextWindow: "1M",
    description: "Updated Gemini 1.5 Flash with better accuracy.",
  },
  {
    id: "gemini-1-5-flash-8b",
    name: "Gemini 1.5 Flash 8B",
    provider: "gemini",
    intelligence: 80,
    speed: 100,
    cost: 5,
    contextWindow: "1M",
    description: "Smallest and fastest Gemini model (8B parameters).",
    parameterSize: 8,
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
