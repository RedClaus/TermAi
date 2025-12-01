import { GoogleGenerativeAI } from '@google/generative-ai';

export class LLMService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
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
            return 'Error: Failed to get response from Warp AI. Please check your API key.';
        }
    }
}
