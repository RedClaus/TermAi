# TermAI Electron Migration Plan

## Executive Summary

This document outlines a comprehensive phased approach to migrate TermAI from a web-based React + Express architecture to a hybrid Electron desktop application while maintaining web compatibility.

**Migration Type:** Zero-Stall Pivot (wrap existing app in native shell)
**Estimated Duration:** 4-6 weeks
**Risk Level:** Medium-High
**Key Challenge:** Event system and Socket.IO abstraction

---

## Current Architecture Analysis

### Codebase Overview

| Layer | Technology | Files | Migration Impact |
|-------|-----------|-------|------------------|
| Frontend | React 19 + TypeScript | ~50 components | Medium |
| Backend | Express 5 + Node.js | 8 route files | High |
| Terminal | Socket.IO + node-pty | 3 services | Critical |
| AI | Multi-provider proxy | LLMManager + routes | Medium |
| Storage | localStorage + JSON files | Scattered | Low |
| Events | Custom browser events | 27 event types | Critical |

### Critical Dependencies

```
Frontend:
├── socket.io-client (Terminal communication)
├── ghostty-web (Terminal rendering)
├── @xyflow/react (Flow editor)
└── localStorage (Settings, sessions)

Backend:
├── node-pty (PTY management)
├── socket.io (Real-time communication)
├── express (REST API)
└── multer (File uploads)
```

---

## Phase 0: Foundation Setup (Days 1-2)

### Goal
Set up monorepo structure and prepare the codebase for modularization.

### Todo List

- [ ] **0.1** Install pnpm globally (`npm install -g pnpm`)
- [ ] **0.2** Create new `termai-hybrid/` directory structure
- [ ] **0.3** Create `pnpm-workspace.yaml` with packages and apps
- [ ] **0.4** Create root `package.json` with workspace scripts
- [ ] **0.5** Create `tsconfig.base.json` with shared compiler options
- [ ] **0.6** Set up path aliases for packages
- [ ] **0.7** Verify pnpm install works correctly

### Directory Structure

```
termai-hybrid/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── packages/
│   ├── pty-service/          # PTY management (shared)
│   ├── ui-core/              # React components + hooks
│   ├── transport/            # Event/API abstraction layer
│   └── learning-service/     # Knowledge + skills (future)
└── apps/
    ├── web-server/           # Express server (existing)
    └── electron-app/         # Electron shell (new)
```

### Files to Create

1. `pnpm-workspace.yaml`
2. `package.json` (root)
3. `tsconfig.base.json`
4. `scripts/setup.sh`
5. `scripts/validate.sh`

---

## Phase 1: Transport Abstraction Layer (Days 3-6)

### Goal
Create abstraction layer that allows code to work with both Socket.IO (web) and IPC (Electron).

### Todo List

- [ ] **1.1** Create `packages/transport/` package structure
- [ ] **1.2** Define `EventTransport` interface
- [ ] **1.3** Implement `BrowserEventTransport` (CustomEvents)
- [ ] **1.4** Implement `ElectronEventTransport` (IPC)
- [ ] **1.5** Define `ApiTransport` interface
- [ ] **1.6** Implement `BrowserApiTransport` (fetch)
- [ ] **1.7** Implement `ElectronApiTransport` (ipcRenderer.invoke)
- [ ] **1.8** Define `StorageTransport` interface
- [ ] **1.9** Implement both storage transports
- [ ] **1.10** Create `useTransport()` hook for context injection
- [ ] **1.11** Write unit tests for all transports

### Transport Interfaces

```typescript
// packages/transport/src/types.ts

export interface EventTransport {
  emit<T extends EventName>(event: T, payload: EventPayload<T>): void;
  on<T extends EventName>(event: T, handler: (payload: EventPayload<T>) => void): () => void;
  once<T extends EventName>(event: T, handler: (payload: EventPayload<T>) => void): void;
}

export interface ApiTransport {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
  stream(path: string, body: unknown, callbacks: StreamCallbacks): AbortController;
}

export interface StorageTransport {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export interface SystemAdapter {
  events: EventTransport;
  api: ApiTransport;
  storage: StorageTransport;
  capabilities: SystemCapabilities;
}
```

### Event Types to Migrate (27 total)

| Category | Events | Priority |
|----------|--------|----------|
| Command | run, start, output, finish, cancel | Critical |
| Session | new-tab, restore, cwd-changed | High |
| AI | thinking, needs-input, auto-continue | High |
| Settings | changed, fetch-models, theme, toast | Medium |
| Widget | git-info, context-updated | Medium |
| Background | started, output, exit | High |
| Thinking | started, step, phase, complete, error, paused, resumed | Low |

---

## Phase 2: PTY Service Package (Days 7-9)

### Goal
Extract PTY management into a shared package usable by both web server and Electron main process.

### Todo List

- [ ] **2.1** Create `packages/pty-service/` structure
- [ ] **2.2** Implement `ShellDetector` class (cross-platform)
- [ ] **2.3** Implement `PTYManager` class
- [ ] **2.4** Define PTY event types and interfaces
- [ ] **2.5** Add session tracking and cleanup
- [ ] **2.6** Export public API
- [ ] **2.7** Write integration tests
- [ ] **2.8** Test on Linux, macOS, Windows

### Files to Create

```
packages/pty-service/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types.ts
    ├── ShellDetector.ts
    ├── PTYManager.ts
    └── __tests__/
        └── PTYManager.test.ts
```

### PTYManager API

```typescript
class PTYManager extends EventEmitter {
  create(options: PTYOptions): PTYSession;
  write(sessionId: string, data: string): boolean;
  resize(sessionId: string, cols: number, rows: number): boolean;
  destroy(sessionId: string): boolean;
  getSession(sessionId: string): PTYSession | undefined;
  getAllSessions(): PTYSession[];
  destroyAll(): void;
}
```

---

## Phase 3: UI Core Package (Days 10-14)

### Goal
Extract React components and hooks into a shared package with transport abstraction.

### Todo List

- [ ] **3.1** Create `packages/ui-core/` structure
- [ ] **3.2** Move/refactor `useTermAiEvent` hook with transport injection
- [ ] **3.3** Create `useSystem()` hook (universal bridge)
- [ ] **3.4** Refactor `useTerminal` hook for abstraction
- [ ] **3.5** Refactor `useAutoRunMachine` for transport
- [ ] **3.6** Refactor `useSettingsLoader` for transport
- [ ] **3.7** Create `Terminal` component wrapper
- [ ] **3.8** Create `TitleBar` component (native-aware)
- [ ] **3.9** Add Electron-specific CSS styles
- [ ] **3.10** Update type declarations for Electron API
- [ ] **3.11** Export public API

### Hooks Migration Priority

| Hook | Transport Needs | Complexity | Priority |
|------|----------------|------------|----------|
| useTermAiEvent | Events | High | P0 |
| useAutoRunMachine | Events, Storage | Medium | P0 |
| useSettingsLoader | API, Events, Storage | Medium | P1 |
| useChatHistory | Storage only | Zero | P2 |
| useUIState | Events | Medium | P1 |
| useErrorAnalysis | API | Low | P2 |

### useSystem Hook Design

```typescript
// packages/ui-core/src/hooks/useSystem.ts

export function useSystem(): SystemAdapter {
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  return {
    type: isElectron ? 'ipc' : 'websocket',
    capabilities: {
      isElectron,
      platform: isElectron ? window.electronAPI.platform : 'web',
      supportsTransparency: isElectron && platform === 'darwin',
      supportsNativeMenu: isElectron,
    },
    // Terminal operations
    createSession,
    writeToSession,
    resizeSession,
    destroySession,
    // Events
    onSessionData,
    onSessionExit,
    // File operations
    readFile,
    writeFile,
    listDirectory,
    // Learning
    consultKnowledge,
    recordEpisode,
  };
}
```

---

## Phase 4: Electron App Shell (Days 15-19)

### Goal
Create the Electron application that hosts the React frontend with native integration.

### Todo List

- [ ] **4.1** Create `apps/electron-app/` structure
- [ ] **4.2** Set up electron-vite configuration
- [ ] **4.3** Create `main.ts` (main process entry)
- [ ] **4.4** Create `preload.ts` (secure bridge)
- [ ] **4.5** Set up IPC handlers for PTY operations
- [ ] **4.6** Set up IPC handlers for file system
- [ ] **4.7** Set up IPC handlers for API proxy (optional)
- [ ] **4.8** Create renderer entry point
- [ ] **4.9** Configure window options (transparency, titlebar)
- [ ] **4.10** Set up electron-builder configuration
- [ ] **4.11** Test on macOS (native features)
- [ ] **4.12** Test on Windows
- [ ] **4.13** Test on Linux

### IPC Channel Design

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `terminal:create` | invoke | Create PTY session |
| `terminal:write` | send | Send input to PTY |
| `terminal:resize` | send | Resize PTY |
| `terminal:destroy` | send | Kill PTY session |
| `terminal:data:${id}` | on | Receive PTY output |
| `terminal:exit:${id}` | on | PTY exit notification |
| `fs:read` | invoke | Read file |
| `fs:write` | invoke | Write file |
| `fs:list` | invoke | List directory |
| `window:minimize` | send | Window control |
| `window:maximize` | send | Window control |
| `window:close` | send | Window control |

### Preload Security

```typescript
// apps/electron-app/src/preload.ts

const validSendChannels = [
  'terminal:write',
  'terminal:resize',
  'terminal:destroy',
  'window:minimize',
  'window:maximize',
  'window:close',
];

const validInvokeChannels = [
  'terminal:create',
  'fs:read',
  'fs:write',
  'fs:list',
];

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  invoke: async (channel, data) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    throw new Error(`Invalid invoke channel: ${channel}`);
  },
  on: (channel, callback) => {
    // Validate and subscribe
  },
  platform: process.platform,
  version: process.env.npm_package_version,
});
```

---

## Phase 5: Web Server Refactor (Days 20-22)

### Goal
Update the web server to use shared packages and maintain backward compatibility.

### Todo List

- [ ] **5.1** Create `apps/web-server/` structure
- [ ] **5.2** Migrate existing server code
- [ ] **5.3** Replace direct node-pty usage with `@termai/pty-service`
- [ ] **5.4** Update Socket.IO handlers to use PTYManager
- [ ] **5.5** Verify all API endpoints work
- [ ] **5.6** Test web client compatibility
- [ ] **5.7** Update build scripts

### Server Route Migration Map

| Current Route | Backend Function | Electron Equivalent |
|--------------|------------------|---------------------|
| POST /api/execute | Command execution | IPC terminal:create + write |
| GET /api/initial-cwd | Launch directory | Direct process.cwd() |
| POST /api/llm/chat | AI proxy | IPC or direct API call |
| POST /api/fs/read | File read | IPC fs:read |
| POST /api/fs/write | File write | IPC fs:write |
| Socket spawn | PTY creation | IPC terminal:create |
| Socket input | PTY input | IPC terminal:write |

---

## Phase 6: Frontend Integration (Days 23-26)

### Goal
Update all React components to use the abstraction layer.

### Todo List

- [ ] **6.1** Update `InteractiveBlock.tsx` to use `useSystem()`
- [ ] **6.2** Update `BackgroundTerminalService` to use transport
- [ ] **6.3** Update `LLMManager` to use `ApiTransport`
- [ ] **6.4** Update `TerminalSession` to use abstraction
- [ ] **6.5** Update `AIPanel` localStorage usage
- [ ] **6.6** Update `Workspace` localStorage usage
- [ ] **6.7** Update `commandRunner.ts` utilities
- [ ] **6.8** Update config for Electron detection
- [ ] **6.9** Full integration testing (web mode)
- [ ] **6.10** Full integration testing (Electron mode)

### Component Migration Checklist

| Component | Socket.IO | fetch | localStorage | Events | Status |
|-----------|----------|-------|-------------|--------|--------|
| InteractiveBlock | ✓ | - | - | - | Pending |
| BackgroundTerminalService | ✓ | - | - | - | Pending |
| TerminalSession | - | ✓ | ✓ | ✓ | Pending |
| AIPanel | - | ✓ | ✓ | ✓ | Pending |
| Workspace | - | - | ✓ | ✓ | Pending |
| LLMManager | - | ✓ | - | - | Pending |
| KnowledgeService | - | ✓ | - | - | Pending |
| FileSystemService | - | ✓ | - | - | Pending |

---

## Phase 7: Testing & Polish (Days 27-30)

### Goal
Comprehensive testing, bug fixes, and production readiness.

### Todo List

- [ ] **7.1** Write E2E tests for web mode
- [ ] **7.2** Write E2E tests for Electron mode
- [ ] **7.3** Performance testing (IPC overhead)
- [ ] **7.4** Memory leak testing
- [ ] **7.5** Cross-platform testing matrix
- [ ] **7.6** Fix identified bugs
- [ ] **7.7** Update documentation
- [ ] **7.8** Update CLAUDE.md with new architecture
- [ ] **7.9** Create migration guide for existing users
- [ ] **7.10** Set up CI/CD for Electron builds

### Test Matrix

| Platform | Web Mode | Electron Mode | Notes |
|----------|----------|---------------|-------|
| macOS (ARM) | ✓ | ✓ | Test transparency |
| macOS (Intel) | ✓ | ✓ | - |
| Windows 10/11 | ✓ | ✓ | Test window controls |
| Ubuntu 22.04 | ✓ | ✓ | AppImage + deb |

---

## Risk Assessment

### High Risk Items

1. **Event System Migration** - Affects 15+ components, 27 event types
   - Mitigation: Thorough unit tests, gradual rollout

2. **Socket.IO to IPC** - Real-time terminal communication
   - Mitigation: Keep Socket.IO for web, IPC for Electron

3. **Performance** - IPC overhead for high-frequency events
   - Mitigation: Batch/debounce streaming output

### Medium Risk Items

1. **Cross-platform PTY** - Different shell behaviors
   - Mitigation: Existing ShellDetector handles this

2. **Native features** - macOS transparency, Windows controls
   - Mitigation: Feature detection, graceful fallback

### Low Risk Items

1. **localStorage migration** - Works in both environments
2. **React components** - No changes to rendering logic
3. **AI providers** - HTTP-based, transport-agnostic

---

## Success Criteria

The migration is complete when:

- [ ] `pnpm dev` launches both web and Electron windows
- [ ] Terminal works identically in both environments
- [ ] All 27 event types work correctly
- [ ] Electron window has native transparency (macOS)
- [ ] Web fallback works without Electron installed
- [ ] No direct socket.io imports in ui-core package
- [ ] TypeScript compiles without errors
- [ ] All existing features work (AI, flows, knowledge, etc.)
- [ ] `pnpm build:electron` produces distributable for all platforms

---

## Appendix A: File Migration Map

### Files Requiring Major Changes

| File | Changes | Destination |
|------|---------|-------------|
| `src/services/BackgroundTerminalService.ts` | Replace socket.io | packages/ui-core |
| `src/components/Terminal/InteractiveBlock.tsx` | Replace socket.io | packages/ui-core |
| `src/hooks/useTermAiEvent.ts` | Transport abstraction | packages/ui-core |
| `src/hooks/useAutoRunMachine.ts` | Event abstraction | packages/ui-core |
| `src/services/LLMManager.ts` | API abstraction | packages/ui-core |
| `server/index.js` | Use pty-service | apps/web-server |

### Files Requiring Minor Changes

| File | Changes |
|------|---------|
| `src/config/index.ts` | Electron detection |
| `src/hooks/useSettingsLoader.ts` | Storage abstraction |
| `src/components/AI/AIPanel.tsx` | Storage keys |
| `src/components/Workspace/Workspace.tsx` | Storage keys |

### Files Unchanged

- All UI components (rendering logic)
- Flow editor components
- Knowledge import components
- Type definitions
- CSS/styling

---

## Appendix B: Package Dependencies

### packages/transport

```json
{
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

### packages/pty-service

```json
{
  "dependencies": {
    "node-pty": "^1.0.0"
  }
}
```

### packages/ui-core

```json
{
  "dependencies": {
    "react": "^19.2.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
  },
  "peerDependencies": {
    "react": "^18.2.0 || ^19.0.0"
  }
}
```

### apps/electron-app

```json
{
  "dependencies": {
    "@termai/pty-service": "workspace:*",
    "@termai/ui-core": "workspace:*",
    "@termai/transport": "workspace:*",
    "electron-updater": "^6.1.7"
  },
  "devDependencies": {
    "electron": "^28.1.0",
    "electron-builder": "^24.9.1",
    "electron-vite": "^2.0.0"
  }
}
```

---

*Document Version: 1.0*
*Created: 2025-12-08*
*Based on: TermAI v1.0 codebase analysis*
