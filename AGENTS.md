# TermAI Agent Guidelines

## Build/Test Commands

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install frontend + server dependencies |
| `npm run dev:all` | Run frontend (5173) + backend (3001) concurrently |
| `npm run dev` | Frontend only |
| `npm run dev:server` | Backend only |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | ESLint with typescript-eslint |

**No test suite** - manual testing required.

## Code Style

### Frontend
- React 19 + TypeScript + Vite
- CSS Modules (`.module.css`)
- Strict TypeScript: `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `verbatimModuleSyntax`

### Backend
- Node.js/Express (plain JS in `server/`)
- Socket.IO + node-pty for interactive sessions
- CommonJS modules

### Conventions
- **Imports**: Named imports preferred; use `import type { X }` for type-only imports
- **Naming**: camelCase (vars/functions), PascalCase (components/interfaces/types)
- **Types**: Define interfaces in `src/types.ts`
- **Events**: Custom browser events prefixed `termai-*`
- **Error handling**: Type guards (`isDefined`, `isApiError`) over try/catch

## Architecture Overview

```
src/
├── components/
│   ├── AI/           # AIPanel, ChatMessage, ModelSelector, FileBrowser
│   ├── Terminal/     # AIInputBox, TerminalSession, Block, TerminalTabs
│   ├── Settings/     # SettingsModal, LearnedSkillsModal, SessionLogsModal
│   ├── Shell/        # AppShell, Sidebar
│   └── Workspace/    # Workspace, SystemOverseer
├── services/         # LLMManager, KnowledgeService, SessionManager
├── hooks/            # useAutoRun, useObserver, useSafetyCheck, useChatHistory
├── data/             # advancedSystemPrompt.ts, models.ts, prompts/
├── events/           # Event types and emitter
└── types.ts          # Shared interfaces

server/
├── routes/           # llm.js, knowledge.js
├── middleware/       # rateLimiter, commandValidator, logger
├── config/           # Server configuration
├── data/             # skills.json, tasks.json (learned data)
└── index.js          # Main server entry
```

## Key Patterns

### Event Communication
```typescript
// Emit event
import { emit } from '../events';
emit('termai-run-command', { command: 'ls -la', sessionId });

// Subscribe to event
import { useTermAiEvent } from '../hooks/useTermAiEvent';
useTermAiEvent('termai-command-finished', (payload) => {
  console.log('Exit code:', payload.exitCode);
}, []);
```

### API Key Caching (LLMManager)
```typescript
// hasApiKey() uses 30s cache + request deduplication
const hasKey = await LLMManager.hasApiKey('anthropic');

// Clear cache after setting new key
LLMManager.clearApiKeyCache('anthropic');
```

### Skill Learning
```typescript
// Trigger via useObserver hook
const { triggerLearning } = useObserver(messages, sessionId);

// Manual trigger
triggerLearning();
```

## Common Modifications

### Adding a New AI Model
1. `src/data/models.ts` - Add model definition
2. `src/services/LLMManager.ts` - Add provider case if new provider
3. `server/routes/llm.js` - Add API handler if new provider

### Adding a New Event
1. `src/events/types.ts` - Add event type to `TermAiEventMap`
2. `src/events/emitter.ts` - No changes needed (generic)
3. Components - Use `emit()` and `useTermAiEvent()`

### Adding a New API Endpoint
1. `server/routes/` - Create or modify route file
2. `server/index.js` - Mount route if new file
3. `src/services/` - Add client method

## Debugging Tips

1. **Console logs**: Look for `[Observer]`, `[AIInputBox]`, `[AIPanel]` prefixes
2. **Network tab**: Filter by `/api/` to see backend calls
3. **Events**: Use `monitorEvents(window)` in DevTools
4. **Backend logs**: Check terminal running `npm run dev:server`

## Files to Know

| File | Purpose |
|------|---------|
| `src/components/Terminal/AIInputBox.tsx` | Main AI chat interface |
| `src/services/LLMManager.ts` | AI provider abstraction + caching |
| `src/hooks/useObserver.ts` | Skill learning trigger |
| `src/data/advancedSystemPrompt.ts` | System prompt for AI |
| `server/routes/llm.js` | AI API proxy (keys stored here) |
| `server/routes/knowledge.js` | Skill storage API |

See `CLAUDE.md` for detailed architecture documentation.
