# Dynamic Model Fetching

All AI providers now support **dynamic model fetching** using your API keys.

## How It Works

When you:
1. Enter an API key in Settings
2. Select a provider from the dropdown
3. The app automatically fetches ALL available models from that provider's API

## Supported Providers

### ✓ Gemini (Google AI)
- **API**: `https://generativelanguage.googleapis.com/v1beta/models`
- **Fetches**: All Gemini models (1.5, 2.0, experimental)
- **Filters**: Only models that support `generateContent`
- **Sorting**: Experimental first, then 2.0, then by version

### ✓ OpenAI
- **API**: OpenAI's `/models` endpoint
- **Fetches**: GPT-4, GPT-4o, o1, and all variants
- **Filters**: Only GPT and o1 models
- **Sorting**: By intelligence score (highest first)

### ✓ Anthropic (Claude)
- **API**: Static list (Anthropic doesn't provide a models API)
- **Models**: Claude 3.5 Sonnet (new & old), Claude 3 Opus, Sonnet, Haiku
- **Note**: List updated manually when new models release

### ✓ OpenRouter
- **API**: `https://openrouter.ai/api/v1/models`
- **Fetches**: ALL models available through OpenRouter (50+ models)
- **Includes**: Claude, GPT, Llama, Mistral, DeepSeek, Qwen, and more
- **Filters**: Excludes free-tier duplicates
- **Sorting**: By intelligence score

### ✓ Ollama
- **API**: `http://localhost:11434/api/tags`
- **Fetches**: All locally installed models
- **Requires**: Ollama running locally

## Benefits

1. **Always Up-to-Date**: Get new models as soon as providers release them
2. **No Manual Updates**: Don't need to update the app when new models come out
3. **Accurate Pricing**: Real-time pricing data (OpenRouter)
4. **Model Metadata**: Context window, capabilities, descriptions

## Static Fallback

The app still includes static models in `src/data/models.ts` for:
- **Initial display** before API key is entered
- **Fallback** if dynamic fetch fails
- **Offline mode** (though providers need API calls anyway)

## Implementation Details

### Backend Handlers

Each provider has a handler function in `server/routes/llm.js`:

```javascript
// Gemini
async function handleGeminiModels(apiKey)

// OpenAI  
async function handleOpenAIModels(apiKey)

// Anthropic
async function handleAnthropicModels(apiKey)

// OpenRouter
async function handleOpenRouterModels(apiKey)

// Ollama
// Handled inline in /models endpoint
```

### Frontend Integration

The frontend calls: `GET /api/llm/models?provider=<provider>`

The backend:
1. Checks if API key exists
2. Calls the provider's API
3. Transforms response to common format
4. Returns unified model list

### Model Format

All models are normalized to this format:

```typescript
{
  id: string,              // Unique model identifier
  name: string,            // Display name
  provider: string,        // "gemini" | "openai" | "anthropic" | etc
  intelligence: number,    // 0-100 scale
  speed: number,           // 0-100 scale  
  cost: number,            // 0-100 scale (relative)
  contextWindow: string,   // e.g., "128k", "1M"
  description: string      // Model description
}
```

## Testing

To test dynamic fetching:

1. **Clear all API keys** in Settings
2. **Open model dropdown** → Should show static models only
3. **Enter API key** for a provider
4. **Refresh or change provider** → Should fetch dynamic models
5. **Check console** for `[LLM] Fetching models for <provider>` logs

## Troubleshooting

### Models not loading
- Check API key is valid
- Check browser console for errors
- Verify provider endpoint is accessible

### Old models showing
- Hard refresh browser (Ctrl+Shift+R)
- Clear localStorage
- Check backend logs for fetch errors

### OpenRouter showing too many models
- Limit is set to top 50 models
- Adjust in `server/routes/llm.js` line ~709

## Future Enhancements

- [ ] Cache models locally (localStorage)
- [ ] Add model capabilities metadata
- [ ] Support custom model endpoints
- [ ] Add pricing estimates per request
