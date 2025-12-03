# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TermAI** is an AI-powered terminal assistant built with React + TypeScript frontend and Node.js/Express backend. It bridges natural language and command-line operations with features including:

- Multi-AI provider support (Gemini, OpenAI, Claude, Ollama, OpenRouter)
- Skill learning system that remembers successful command patterns
- Auto-run mode for autonomous command execution
- Block-based terminal output with modern UI
- Interactive PTY support for SSH and other real-time commands
- Docker deployment support

## Architecture

### Client-Server Model

```
Frontend (React + Vite)          Backend (Express + Socket.IO)
     Port: 5173                         Port: 3001
         │                                   │
         ├── REST API ──────────────────────►├── /api/execute (commands)
         ├── REST API ──────────────────────►├── /api/llm/* (AI proxy)
         ├── REST API ──────────────────────►├── /api/knowledge/* (skills)
         ├── REST API ──────────────────────►├── /api/fs/* (file ops)
         └── WebSocket ─────────────────────►└── Socket.IO (PTY sessions)
```

### Key Components

#### Frontend (`src/`)

| Component | Path | Description |
|-----------|------|-------------|
| **AIInputBox** | `components/Terminal/AIInputBox.tsx` | Embedded AI chat in terminal view, handles auto-run, skill learning triggers |
| **AIPanel** | `components/AI/AIPanel.tsx` | Standalone AI panel (alternative to AIInputBox) |
| **TerminalSession** | `components/Terminal/TerminalSession.tsx` | Terminal state, command blocks, working directory |
| **TerminalTabs** | `components/Terminal/TerminalTabs.tsx` | Multi-tab management, session persistence |
| **Workspace** | `components/Workspace/Workspace.tsx` | Layout container, resizable panels |
| **SystemOverseer** | `components/Workspace/SystemOverseer.tsx` | Watchdog for stalled commands/AI |

#### Services (`src/services/`)

| Service | Description |
|---------|-------------|
| **LLMManager** | AI provider abstraction with caching to prevent request spam |
| **KnowledgeService** | API client for skill learning storage |
| **SessionManager** | Tab/session persistence to localStorage |
| **FileSystemService** | Client-side file operations API |
| **SessionLogService** | Conversation logging |

#### Hooks (`src/hooks/`)

| Hook | Description |
|------|-------------|
| **useAutoRun** | Auto-run mode logic, command execution |
| **useObserver** | Skill learning observer, triggers after successful tasks |
| **useSafetyCheck** | Dangerous command detection and confirmation |
| **useChatHistory** | Message history management |
| **useTermAiEvent** | Typed event subscription helper |

#### Backend (`server/`)

| Route | Description |
|-------|-------------|
| `/api/execute` | Command execution with cwd tracking |
| `/api/llm/chat` | Proxied AI chat (keys stored server-side) |
| `/api/llm/has-key` | Check if API key configured (cached) |
| `/api/llm/set-key` | Store API key on server |
| `/api/knowledge/skills` | CRUD for learned skills |
| `/api/fs/*` | File system operations |
| Socket.IO | Interactive PTY sessions |

### Event System

Components communicate via custom browser events prefixed with `termai-`:

```typescript
// Defined in src/events/types.ts
interface TermAiEvents {
  'termai-run-command': { command: string; sessionId?: string };
  'termai-command-started': { command: string; blockId: string; sessionId?: string };
  'termai-command-output': { output: string; blockId: string; sessionId?: string };
  'termai-command-finished': { exitCode: number; blockId: string; output: string; sessionId?: string };
  'termai-ai-thinking': { isThinking: boolean; sessionId?: string };
  'termai-cwd-changed': { cwd: string; sessionId?: string };
  'termai-settings-changed': {};
  'termai-cancel-command': { sessionId?: string };
}
```

Events are scoped by `sessionId` to support multiple terminal tabs.

### Skill Learning System

1. User completes a multi-step task with AI assistance
2. `useObserver` hook detects task completion (reason="complete" or successfulSteps > 0)
3. Observer sends conversation to LLM for analysis
4. LLM extracts: task description, command pattern, success criteria
5. Skill saved via `/api/knowledge/skills` endpoint
6. Future similar requests can reference learned skills

Manual trigger: Sparkles button in AIInputBox toolbar.

### API Key Management

API keys are stored **server-side only** for security:

1. User enters key in Settings modal
2. Key sent to `/api/llm/set-key` → stored in server memory/env
3. Frontend calls `LLMManager.hasApiKey()` → checks via `/api/llm/has-key`
4. All AI requests proxied through backend with stored key

Caching in `LLMManager` prevents request spam:
- 30-second TTL cache for `hasApiKey()` results
- Request deduplication for concurrent calls

## Development Commands

```bash
# Install all dependencies
npm run install:all

# Run frontend + backend together
npm run dev:all

# Frontend only (port 5173)
npm run dev

# Backend only (port 3001)
npm run dev:server

# Build for production
npm run build

# Lint
npm run lint
```

## Code Patterns

### State Management

- React hooks for local state
- Custom events for cross-component communication
- localStorage for session persistence

### TypeScript Conventions

```typescript
// Type-only imports (required by verbatimModuleSyntax)
import type { SomeType } from './types';

// Named imports preferred
import { useState, useEffect } from 'react';

// Interfaces in src/types.ts
interface CommandBlock {
  id: string;
  command: string;
  output: string;
  exitCode?: number;
}
```

### Adding New AI Providers

1. Add model definitions to `src/data/models.ts`:
   ```typescript
   { id: 'provider/model-name', name: 'Display Name', provider: 'provider', ... }
   ```

2. Add provider case in `LLMManager.getProvider()`:
   ```typescript
   case 'newprovider':
     return new ProxyLLMProvider('newprovider', modelId);
   ```

3. Add backend handler in `server/routes/llm.js`:
   ```javascript
   if (provider === 'newprovider') {
     // Call provider API with stored key
   }
   ```

### Adding Agentic Tools

1. Define tool in `ADVANCED_SYSTEM_PROMPT` (`src/data/advancedSystemPrompt.ts`)
2. Add parsing logic in AIInputBox/AIPanel (search for `[READ_FILE:` pattern)
3. Implement backend endpoint if needed (`server/index.js`)
4. Add client method to `FileSystemService.ts`

## Common Tasks

### Debugging Command Execution

1. Check browser console for frontend errors
2. Check server terminal for backend logs
3. Inspect events: `monitorEvents(window)` in DevTools
4. Test backend: `curl http://localhost:3001/api/fs/list -X POST -H "Content-Type: application/json" -d '{"path":"."}'`

### Debugging Skill Learning

1. Check console for `[Observer]` log messages
2. Verify `/api/knowledge/skills` endpoint responds
3. Check `server/data/skills.json` for stored skills
4. Use manual Sparkles button to trigger learning

### Fixing Rate Limit Issues

If seeing 429 errors or browser crashes:

1. Check `LLMManager` cache is working (30s TTL)
2. Verify `isActive` prop prevents inactive tabs from calling APIs
3. Look for component re-render loops in React DevTools
4. Check `pendingRequests` deduplication in `hasApiKey()`

## Project-Specific Notes

### Environment Files

```bash
# Frontend: .env (git-ignored)
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001

# Backend: server/.env (git-ignored)
PORT=3001
HOST=0.0.0.0
CORS_ORIGINS=http://localhost:5173
```

### Session Persistence

- Tabs stored in localStorage: `termai_tabs`
- Active tab: `termai_active_tab`
- Sessions: `termai_sessions`
- Per-session CWD: `termai_cwd_${sessionId}`

### Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild after changes
docker-compose up -d --build
```

### Testing Workflow

No automated tests; manual testing:

1. Start both servers: `npm run dev:all`
2. Test command execution: `ls`, `pwd`, `cd ~`
3. Test AI generation: describe a task
4. Test error recovery: run invalid command
5. Test SSH/interactive mode
6. Test skill learning: complete multi-step task, check Skills modal
