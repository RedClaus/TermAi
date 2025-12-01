export interface ModelSpec {
    id: string;
    name: string;
    provider: 'openai' | 'anthropic' | 'gemini' | 'meta' | 'ollama';
    intelligence: number; // 0-100
    speed: number; // 0-100
    cost: number; // 0-100
    contextWindow: string;
    description: string;
}

export const AVAILABLE_MODELS: ModelSpec[] = [
    {
        id: 'auto',
        name: 'Auto (Best Available)',
        provider: 'openai',
        intelligence: 90,
        speed: 90,
        cost: 50,
        contextWindow: '128k',
        description: 'Automatically selects the best model for the task.'
    },
    {
        id: 'gpt-5-high',
        name: 'GPT-5 (High Reasoning)',
        provider: 'openai',
        intelligence: 98,
        speed: 60,
        cost: 95,
        contextWindow: '128k',
        description: 'Next-gen reasoning model for complex tasks.'
    },
    {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        intelligence: 90,
        speed: 95,
        cost: 60,
        contextWindow: '128k',
        description: 'Flagship model with multimodal capabilities.'
    },
    {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        intelligence: 95,
        speed: 50,
        cost: 90,
        contextWindow: '200k',
        description: 'Most powerful model for highly complex tasks.'
    },
    {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        intelligence: 92,
        speed: 85,
        cost: 40,
        contextWindow: '200k',
        description: 'Ideal balance of intelligence and speed.'
    },
    {
        id: 'claude-4-5-sonnet-thinking',
        name: 'Claude 4.5 Sonnet (Thinking)',
        provider: 'anthropic',
        intelligence: 96,
        speed: 70,
        cost: 75,
        contextWindow: '200k',
        description: 'Enhanced reasoning capabilities for coding.'
    },
    {
        id: 'gemini-1-5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'gemini',
        intelligence: 91,
        speed: 80,
        cost: 30,
        contextWindow: '1M',
        description: 'Massive context window for large codebases.'
    },
    {
        id: 'gemini-1-5-flash',
        name: 'Gemini 1.5 Flash',
        provider: 'gemini',
        intelligence: 85,
        speed: 100,
        cost: 10,
        contextWindow: '1M',
        description: 'Extremely fast and cost-effective.'
    },
    {
        id: 'ollama-llama3',
        name: 'Llama 3 (Ollama)',
        provider: 'ollama',
        intelligence: 88,
        speed: 95,
        cost: 0,
        contextWindow: '8k',
        description: 'Local Llama 3 model via Ollama.'
    },
    {
        id: 'ollama-mistral',
        name: 'Mistral (Ollama)',
        provider: 'ollama',
        intelligence: 85,
        speed: 98,
        cost: 0,
        contextWindow: '8k',
        description: 'Local Mistral model via Ollama.'
    },
    {
        id: 'ollama-codellama',
        name: 'CodeLlama (Ollama)',
        provider: 'ollama',
        intelligence: 80,
        speed: 90,
        cost: 0,
        contextWindow: '16k',
        description: 'Local CodeLlama model via Ollama.'
    }
];
