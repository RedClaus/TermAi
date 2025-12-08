# Gemini Models Reference

## Added Models (Dec 2024)

### Static Models (always available)
- `gemini-2.0-flash-exp` - Gemini 2.0 Flash (Experimental)
- `gemini-exp-1206` - Gemini Exp 1206 (December 2024)
- `gemini-exp-1121` - Gemini Exp 1121 (November 2024)
- `gemini-1-5-pro-002` - Latest stable Gemini 1.5 Pro
- `gemini-1-5-flash-002` - Updated Gemini 1.5 Flash
- `gemini-1-5-pro` - Gemini 1.5 Pro
- `gemini-1-5-flash` - Gemini 1.5 Flash

### Dynamic Models (fetched from Google API)
The `/api/llm/models?provider=gemini` endpoint now:
- Fetches all available Gemini models from Google's API
- Sorts experimental models first, then 2.0, then by version
- Filters for models that support content generation
- Better intelligence scoring (exp: 95, 2.0: 92, pro: 91, flash: 85)

## Note on "Gemini 3"
Google hasn't released "Gemini 3" yet. The latest models are:
- **Gemini 2.0** series (2.0-flash-exp)
- **Experimental builds** (exp-1206, exp-1121)

If you're looking for "Gemini 3 Preview", it may be:
1. `gemini-exp-1206` - Latest experimental (Dec 2024)
2. `gemini-2.0-flash-exp` - Gemini 2.0 experimental

## Testing
To see all available models:
1. Open Settings in TermAI
2. Enter your Gemini API key
3. Click the model dropdown
4. Models will be fetched dynamically from Google

