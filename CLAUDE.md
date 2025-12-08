# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TermAI** is an AI-powered terminal assistant with React + TypeScript frontend and Node.js/Express backend. The UI is a vertical split: Terminal (top) for command blocks/output, AI Panel (bottom) for chat/auto-run controls. Panels are resizable.

Key features: Multi-AI provider support, skill learning, auto-run mode, PTY for interactive commands, Visual Flow Editor, RAPID Framework for first-shot accuracy.

## Architecture

### Client-Server Model

```
CLI (bin/termai.cjs)
     │
     │  Captures CWD, sets TERMAI_LAUNCH_CWD env var
     │
     ▼
Frontend (React + Vite)          Backend (Express + Socket.IO)
     Port: 5173                         Port: 3001 (default, configurable)
         │                                   │
         ├── REST API ──────────────────────►├── /api/execute (commands)
         ├── REST API ──────────────────────►├── /api/initial-cwd (CLI launch dir)
         ├── REST API ──────────────────────►├── /api/llm/* (AI proxy)
         ├── REST API ──────────────────────►├── /api/knowledge/* (skills)
         ├── REST API ──────────────────────►├── /api/fs/* (file ops)
         ├── REST API ──────────────────────►├── /api/flows/* (visual workflows)
         ├── REST API ──────────────────────►├── /api/ingestion/* (knowledge import)
         └── WebSocket ─────────────────────►└── Socket.IO (PTY sessions)
```

### Key Components

#### Frontend (`src/`)

| Component | Path | Description |
|-----------|------|-------------|
| **AIPanel** | `components/AI/AIPanel.tsx` | Main AI interface (bottom panel), handles chat, auto-run, command lifecycle |
| **TerminalSession** | `components/Terminal/TerminalSession.tsx` | Terminal output (top panel), command blocks, fetches initial CWD |
| **TerminalTabs** | `components/Terminal/TerminalTabs.tsx` | Multi-tab management, session persistence |
| **Workspace** | `components/Workspace/Workspace.tsx` | Vertical split layout (terminal top, AI bottom), resizable |
| **FlowCanvas** | `components/Flow/FlowCanvas.tsx` | Visual workflow editor using @xyflow/react |
| **ImportWizard** | `components/KnowledgeImport/ImportWizard.tsx` | Multi-step wizard for importing conversations |

Note: `AIInputBox` is deprecated - `AIPanel` is now the single AI interface.

#### Services (`src/services/`)

| Service | Description |
|---------|-------------|
| **LLMManager** | AI provider abstraction with caching to prevent request spam |
| **KnowledgeService** | API client for skill learning storage |
| **SessionManager** | Tab/session persistence to localStorage |
| **FileSystemService** | Client-side file operations API |
| **FlowService** | Visual workflow CRUD operations |
| **IngestionService** | Knowledge import from external conversations |
| **InitialCwdService** | Fetches launch directory from `/api/initial-cwd` |
| **WidgetContextService** | Tracks terminal context (git branch, recent commands) |
| **BackgroundTerminalService** | Manages background terminal processes |
| **GhosttyService** | Ghostty terminal emulator integration |

#### Hooks (`src/hooks/`)

| Hook | Description |
|------|-------------|
| **useAutoRunMachine** | State machine for auto-run lifecycle |
| **useObserver** | Skill learning observer, triggers after successful tasks |
| **useSafetyCheck** | Dangerous command detection and confirmation |
| **useChatHistory** | Message history management |
| **useTermAiEvent** | Typed event subscription helper |
| **useUIState** | Centralized UI state management |
| **useSettingsLoader** | Settings loading and API key caching |
| **useWidgetContext** | Terminal widget context (git, cwd) |
| **useErrorAnalysis** | Error detection and fix suggestions |
| **useSmartContext** | RAPID: Context gathering and intent classification |

#### Backend (`server/`)

| Route | Description |
|-------|-------------|
| `/api/execute` | Command execution with cwd tracking |
| `/api/initial-cwd` | Returns CLI launch directory |
| `/api/llm/chat` | Proxied AI chat (keys stored server-side) |
| `/api/llm/has-key` | Check if API key configured |
| `/api/llm/set-key` | Store API key on server |
| `/api/llm/models` | Fetch available models for provider |
| `/api/knowledge/skills` | CRUD for learned skills |
| `/api/fs/*` | File system operations |
| `/api/flows/*` | Visual workflow CRUD |
| `/api/ingestion/*` | Knowledge import processing |
| `/api/context/*` | RAPID: Context gathering and intent classification |
| Socket.IO | Interactive PTY sessions |

#### Backend Services (`server/services/`)

| Service | Description |
|---------|-------------|
| **FlowEngine.js** | Executes visual workflows |
| **IngestionService.js** | Processes imported conversations |
| **ExtractionEngine.js** | Extracts patterns from conversations |
| **KnowledgeEngine.js** | RAG-based knowledge retrieval |
| **SessionManager.js** | Server-side session management |
| **ContextInferenceEngine.js** | RAPID: Automatic context gathering (env, project, errors) |
| **IntentClassifier.js** | RAPID: Classifies user intent into problem categories |
| **SmartResponseGenerator.js** | RAPID: Determines response strategy (direct/assumed/ask) |
| **RAPIDPrompt.js** | RAPID: Builds context-aware system prompts |

### Event System

Components communicate via typed custom browser events prefixed with `termai-`. All event types are defined in `src/events/types.ts`.

**Core event categories:**
- **Command events**: `run-command`, `command-started`, `command-output`, `command-finished`, `cancel-command`
- **Session events**: `new-tab`, `restore-session`, `sessions-updated`, `cwd-changed`
- **AI events**: `ai-thinking`, `ai-needs-input`, `auto-continue`
- **Settings events**: `settings-changed`, `fetch-models`, `theme-changed`, `toast`
- **Widget context**: `git-info`, `context-updated`
- **Background terminals**: `background-started`, `background-output`, `background-exit`

Events are scoped by `sessionId` to support multiple terminal tabs. Use `useTermAiEvent` hook for typed subscriptions.

### Skill Learning System

1. User completes a multi-step task with AI assistance
2. `useObserver` hook detects task completion (reason="complete" or successfulSteps > 0)
3. Observer sends conversation to LLM for analysis
4. LLM extracts: task description, command pattern, success criteria
5. Skill saved via `/api/knowledge/skills` endpoint
6. Future similar requests can reference learned skills

Manual trigger: GraduationCap button in AIPanel toolbar.

### RAPID Framework (Reduce AI Prompt Iteration Depth)

RAPID is an intelligent context-gathering system that enables "first-shot accuracy" - solving problems in one response without back-and-forth questioning.

**How it works:**

1. **Context Inference** (`ContextInferenceEngine.js`): Automatically gathers environment, project type, runtime versions, git status, recent commands, and errors BEFORE the AI responds.

2. **Intent Classification** (`IntentClassifier.js`): Classifies user requests into problem categories (installation, build, runtime, network, permissions, git, docker, deployment, how-to, etc.) using pattern matching and context signals.

3. **Gap Analysis**: Determines what information is missing for each problem type and generates compound questions if needed.

4. **Smart Response Strategy** (`SmartResponseGenerator.js`):
   - **Direct** (>70% confidence): Provide solution immediately
   - **Assumed** (50-70%): Provide solution with stated assumptions and fallbacks
   - **Ask** (<50%): Ask ONE compound question covering all gaps + preliminary analysis

**API Endpoints** (`/api/context/*`):
- `POST /gather` - Gather full context for a session
- `POST /record-command` - Record command execution for error tracking
- `POST /classify` - Classify user intent
- `POST /strategy` - Get full response strategy with enhanced system prompt

**Frontend Integration**:
- `useSmartContext` hook - Context gathering and intent classification
- `ContextIndicator` component - Visual display of gathered context
- `IntentBadge` / `StrategyIndicator` - Show classification results

### API Key Management

API keys are stored **server-side only** for security:

1. User enters key in Settings modal
2. Key sent to `/api/llm/set-key` → stored in server memory (not persisted to disk)
3. Frontend calls `LLMManager.hasApiKey()` → checks via `/api/llm/has-key`
4. All AI requests proxied through backend with stored key

Caching in `LLMManager` prevents request spam:
- 30-second TTL cache for `hasApiKey()` results
- Request deduplication for concurrent calls

## Development Commands

```bash
npm run install:all      # Install frontend + server dependencies
npm run dev:all          # Run frontend (5173) + backend (3001) together
npm run dev              # Frontend only
npm run dev:server       # Backend only
npm run build            # tsc + vite build
npm run lint             # ESLint
npx tsc --noEmit         # Type check (no build)
```

**Testing:** No automated test suite. Verify via UI or curl:
```bash
curl http://localhost:3001/api/fs/list -X POST -H "Content-Type: application/json" -d '{"path":"."}'
```

## Code Patterns

### State & Styling

- React hooks for local state, custom events (`termai-*`) for cross-component communication
- localStorage for session persistence
- **Styling:** Tailwind CSS v4 + CSS Modules (`.module.css`), dark theme (Warp-style)

### TypeScript Conventions

Frontend uses strict TypeScript with `verbatimModuleSyntax` and `exactOptionalPropertyTypes`:

```typescript
import type { SomeType } from './types';  // Required: type-only imports
import { useState, useEffect } from 'react';  // Named imports preferred
```

### Backend (CommonJS)

Server uses CommonJS JavaScript (no TypeScript):
```javascript
const express = require('express');  // Use require(), not import
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
   case 'newprovider':
     response = await handleNewProviderChat(apiKey, model, messages, systemPrompt);
     break;
   ```

4. Add to valid providers list in `server/config/index.js`

### Adding Agentic Tools

1. Define tool in system prompt (`src/data/advancedSystemPrompt.ts`)
2. Add parsing logic in AIPanel (search for `[READ_FILE:` pattern)
3. Implement backend endpoint if needed (`server/routes/`)
4. Add client method to appropriate service

## Debugging

### Log Prefixes
- `[Observer]` - Skill learning observer
- `[LLMManager.hasApiKey]` - API key cache
- `[useSettingsLoader]` - Settings loading
- `[LLM] /has-key` - Server-side key checks

### Rate Limit (429) Issues
Check `LLMManager` cache (30s TTL), `isActive` prop on inactive tabs, and `pendingRequests` deduplication.

### Skill Learning
Check `server/data/skills.json` or use GraduationCap button in AIPanel to trigger manually.

## Configuration

### Environment Files
- Frontend: `.env` - `VITE_API_URL`, `VITE_WS_URL`
- Backend: `server/.env` - `PORT`, `HOST`, `CORS_ORIGINS`, `*_API_KEY`

### localStorage Keys
`termai_tabs`, `termai_active_tab`, `termai_sessions`, `termai_cwd_${sessionId}`, `termai_model_${sessionId}`, `termai_provider`

### Data Storage
`server/data/`: `skills.json`, `flows/`, `executions/`

### Vite Notes
- Server data (`server/**`) excluded from HMR watching to prevent reload loops
- Ghostty WASM excluded from pre-bundling

---

## UI Engineering Standards

**Objective:** Eliminate race conditions, rendering artifacts, and UI freezes.
**Philosophy:** Reactive, Retained-Mode Architecture over Event-Driven UI Updates.

### 1. State Management Rules

#### A. Global State (Zustand - Target Architecture)
**Rule:** Custom Events (`window.dispatchEvent`) are for **Backend ↔ Frontend** signaling ONLY.

- **Zustand Store:** Use for shared UI state (`activeSessionId`, `terminalDimensions`, `aiPanelState`)
- **Custom Events:** Use ONLY for backend notifications (`termai-command-finished`, etc.)
- **Current Hooks:** `useUIState`, `useSettingsLoader` manage local state - migrate critical shared state to Zustand

#### B. Immutable Data Updates
**Rule:** NEVER mutate state objects directly.

```typescript
// ❌ BAD - Breaks React's change detection
session.blocks.push(newBlock);

// ✅ GOOD - Immutable update
set(state => ({ blocks: [...state.blocks, newBlock] }));
```

### 2. Rendering Performance

#### A. Virtualization Requirements
**Rule:** Lists with >100 items MUST use virtualization.

- **Use:** `VirtualList` component (`src/components/common/VirtualList.tsx`) or `@tanstack/react-virtual`
- **Apply to:** Terminal blocks in `TerminalSession.tsx`, long chat histories
- **Structure:**
```typescript
// Data structure for virtualized rendering
interface Block {
  id: string;
  type: 'command' | 'output' | 'ai-response';
  content: string[]; // Array of lines
}
// VirtualList only renders ~20 visible blocks
```

#### B. ResizeObserver + Debouncing
**Rule:** React is too slow for 60fps drag resizing. Use ResizeObserver with debounce.

```typescript
// ✅ CORRECT - Debounced resize handling
useEffect(() => {
  const observer = new ResizeObserver(
    debounce(() => {
      term.fit(); // Adjust terminal dimensions
    }, 16) // 60fps = 16ms
  );
  observer.observe(containerRef.current);
  return () => observer.disconnect();
}, []);
```

**Apply to:** `Workspace.tsx` split-pane resizing, `TerminalSession.tsx` container

### 3. Component Resilience

#### A. Error Boundaries
**Rule:** Wrap critical sections in Error Boundaries.

```typescript
// ✅ REQUIRED - Isolate failures
<ErrorBoundary fallback={<ErrorFallback />}>
  <AIPanel />
</ErrorBoundary>
<ErrorBoundary fallback={<ErrorFallback />}>
  <TerminalSession />
</ErrorBoundary>
```

**Location:** Use `src/components/common/ErrorBoundary.tsx`

#### B. useEffect Cleanup (MANDATORY)
**Rule:** Every side-effect creating listeners/instances MUST have cleanup.

```typescript
// ✅ CORRECT - Cleanup prevents zombie listeners
useEffect(() => {
  const listener = (e) => handleEvent(e);
  window.addEventListener('termai-output', listener);

  // MANDATORY CLEANUP
  return () => window.removeEventListener('termai-output', listener);
}, []);
```

### 4. Code Review Checklist

**NO PR touching UI merges without checking ALL boxes:**

- [ ] **State:** Is Zustand used for shared state? (No props drilled >2 levels)
- [ ] **Virtualization:** Are lists >100 items virtualized?
- [ ] **Resizing:** Is ResizeObserver used with debounce (16ms)?
- [ ] **Cleanup:** Do ALL useEffect hooks return a cleanup function?
- [ ] **Types:** Are all Props defined with strict TypeScript interfaces (No `any`)?
- [ ] **Error Boundaries:** Are AIPanel and TerminalSession wrapped?

### 5. Testing Protocol

#### A. Resize Stress Test
Before merging UI changes, run:
1. Start a long-running AI stream
2. Rapidly resize window AND split-pane divider
3. **Pass Criteria:** No text artifacts, no cursor desync, no white screen

#### B. Performance Baseline
- Terminal should handle 10,000+ lines without freezing
- AI panel streaming should maintain 60fps scroll
- Tab switching should be <100ms

### 6. Current Compliance Status

| Standard | Status | Action Required |
|----------|--------|-----------------|
| Global State (Zustand) | ❌ Not Implemented | Migrate shared state |
| Virtualization | ⚠️ Partial | Apply to terminal blocks |
| ResizeObserver + Debounce | ⚠️ Partial | Add to Workspace.tsx |
| useEffect Cleanup | ✅ Excellent | Maintain |
| Error Boundaries | ⚠️ Exists, Not Used | Wrap critical components |

### 7. File-Specific Guidelines

| File | Requirements |
|------|--------------|
| `Workspace.tsx` | Add debounced ResizeObserver for split-pane |
| `TerminalSession.tsx` | Virtualize block rendering |
| `AIPanel.tsx` | Wrap in ErrorBoundary, virtualize long chats |
| `App.tsx` | Add ErrorBoundary wrappers around main sections |
| All hooks | Verify cleanup function in every useEffect |
