import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface LLMProvider {
    chat(message: string, context?: string): Promise<string>;
}

export class GeminiProvider implements LLMProvider {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string, modelId: string = 'gemini-pro') {
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Map custom IDs to real Gemini models
        const modelMap: Record<string, string> = {
            'gemini-1-5-pro': 'gemini-1.5-pro',
            'gemini-1-5-flash': 'gemini-1.5-flash',
            'auto': 'gemini-1.5-pro'
        };
        const realModel = modelMap[modelId] || 'gemini-pro';
        this.model = this.genAI.getGenerativeModel({ model: realModel });
    }

    async chat(message: string, context?: string): Promise<string> {
        try {
            const prompt = context
                ? `Context: ${context}\n\nUser: ${message}`
                : message;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            throw error;
        }
    }
}

export class OpenAIProvider implements LLMProvider {
    private client: OpenAI;
    private modelId: string;

    constructor(apiKey: string, modelId: string = 'gpt-4o') {
        this.client = new OpenAI({
            apiKey: apiKey,
            dangerouslyAllowBrowser: true // Required for client-side usage
        });
        // Map custom IDs to real OpenAI models
        const modelMap: Record<string, string> = {
            'gpt-5-high': 'gpt-4o', // Fallback for now
            'gpt-4o': 'gpt-4o',
            'auto': 'gpt-4o'
        };
        this.modelId = modelMap[modelId] || 'gpt-4o';
    }

    async chat(message: string, context?: string): Promise<string> {
        try {
            const completion = await this.client.chat.completions.create({
                messages: [
                    { role: 'system', content: context || 'You are a helpful assistant.' },
                    { role: 'user', content: message }
                ],
                model: this.modelId,
            });

            return completion.choices[0]?.message?.content || 'No response from OpenAI.';
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            throw error;
        }
    }
}

export class AnthropicProvider implements LLMProvider {
    private client: Anthropic;
    private modelId: string;

    constructor(apiKey: string, modelId: string = 'claude-3-opus-20240229') {
        this.client = new Anthropic({
            apiKey: apiKey,
            dangerouslyAllowBrowser: true // Required for client-side usage
        });
        // Map custom IDs to real Anthropic models
        const modelMap: Record<string, string> = {
            'claude-3-opus': 'claude-3-opus-20240229',
            'claude-3-5-sonnet': 'claude-3-5-sonnet-20240620',
            'claude-4-5-sonnet-thinking': 'claude-3-5-sonnet-20240620', // Fallback
            'auto': 'claude-3-5-sonnet-20240620'
        };
        this.modelId = modelMap[modelId] || 'claude-3-opus-20240229';
    }

    async chat(message: string, context?: string): Promise<string> {
        try {
            const msg = await this.client.messages.create({
                model: this.modelId,
                max_tokens: 1024,
                system: context,
                messages: [
                    { role: "user", content: message }
                ],
            });

            // Handle the response content safely
            const textContent = msg.content.find(block => block.type === 'text');
            return textContent ? textContent.text : 'No text response from Anthropic.';
        } catch (error) {
            console.error('Error calling Anthropic API:', error);
            throw error;
        }
    }
}

export class LLMManager {
    static getProvider(type: string, apiKey: string, modelId?: string): LLMProvider {
        switch (type) {
            case 'gemini':
                return new GeminiProvider(apiKey, modelId);
            case 'openai':
                return new OpenAIProvider(apiKey, modelId);
            case 'anthropic':
                return new AnthropicProvider(apiKey, modelId);
            default:
                throw new Error(`Unknown provider: ${type}`);
        }
    }
}
