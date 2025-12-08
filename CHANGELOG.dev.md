# TermAI Development Changelog

This file tracks development progress for agentic coding sessions. Update after each significant change.

---

## Session: 2025-12-08 (Electron Migration)

### Goal
Migrate TermAI from a web-based React + Express architecture to an Electron desktop application.

### Planned Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  - App lifecycle management                                  │
│  - Native file system access                                 │
│  - node-pty for terminal emulation                          │
│  - IPC bridge to renderer                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC
┌──────────────────────────▼──────────────────────────────────┐
│                  Electron Renderer Process                   │
│  - React frontend (existing)                                │
│  - Preload scripts for secure IPC                           │
│  - Same UI components                                       │
└─────────────────────────────────────────────────────────────┘
```

### Completed Analysis
- [x] **Service Layer Analysis** - Identified 14 services needing migration
  - BackgroundTerminalService: CRITICAL - Direct Socket.IO usage
  - LLMManager: HIGH - HTTP fetch abstraction needed
  - FileSystemService: MEDIUM - 5+ fetch calls to abstract
  - Others: Transport abstraction pattern applies

- [x] **Server Route Analysis** - Documented all 60+ API endpoints
  - PTY/Terminal operations via Socket.IO
  - File system operations (5 endpoints)
  - LLM proxy operations (8 endpoints)
  - Knowledge/skills operations (15+ endpoints)
  - Context inference (RAPID framework, 8 endpoints)
  - Thinking frameworks (25+ endpoints)

- [x] **Component Analysis** - 6 components need Socket.IO abstraction
  - InteractiveBlock.tsx - Direct `io()` import
  - BackgroundTerminalService.ts - Direct `io()` import
  - 4+ services using fetch for API calls

- [x] **Hook Analysis** - Migration impact assessment
  - useTermAiEvent: CRITICAL - 27 event types to abstract
  - useAutoRunMachine: MEDIUM - emit() abstraction needed
  - useSettingsLoader: MEDIUM - API + event abstraction
  - useChatHistory: ZERO - Already Electron-compatible

### In Progress
- [x] Phase 1: Foundation Setup (monorepo structure) - **COMPLETED**
  - Created pnpm-workspace.yaml with packages/* and apps/*
  - Set up packages/shared-types, packages/pty-service, packages/ui-core
  - Set up apps/electron, apps/web
  - Created tsconfig.base.json with shared TypeScript configuration
  - All 6 workspace projects recognized by pnpm

- [x] Phase 2: Transport Abstraction Layer - **COMPLETED**
  - Created EventTransport (CustomEvents ↔ IPC)
  - Created ApiTransport (fetch ↔ ipcRenderer.invoke)
  - Created StorageTransport (localStorage ↔ Electron Store)
  - Created useSystem() Universal Bridge hook

- [x] Phase 3: Apple Design System CSS - **COMPLETED**
  - Created tokens.css with colors, spacing, shadows, vibrancy
  - Created typography.css with SF Pro font scale
  - Created index.css with global resets and utilities

- [x] Phase 4: Electron App Shell - **COMPLETED**
  - Created main process (main/index.ts, main/ipc.ts)
    - Window creation with security settings (contextIsolation, nodeIntegration: false)
    - PTY manager initialization from @termai/pty-service
    - IPC handlers for PTY, file system, storage, dialogs
    - Security: navigation blocking, window open prevention
  - Created preload script (preload/index.ts)
    - Channel whitelist validation for security (18 channels)
    - contextBridge.exposeInMainWorld for safe API exposure
    - Full TypeScript types in preload/types.d.ts
  - Created renderer entry (renderer/index.tsx, App.tsx)
    - React 19 with createRoot API
    - SystemProvider integration from @termai/ui-core
    - Placeholder App with PTY test functionality
  - Created electron-vite.config.ts
    - Three-build configuration (main, preload, renderer)
    - Path aliases for @termai/* packages
    - React plugin for renderer
  - Fixed: node-pty version (^1.1.0 → ^1.0.0)
  - Fixed: CSS styles import path
  - **Build successful**: main (8KB), preload (2.6KB), renderer (554KB)

- [x] Phase 5: Web Server Refactor - **COMPLETED**
  - Created apps/web package as monorepo entry point
    - package.json with CommonJS type, workspace dependencies
    - index.js wrapper that changes cwd and requires server
    - README.md with usage documentation
  - Created PTYAdapter service (server/services/PTYAdapter.js)
    - Unified PTY interface for node-pty
    - Pluggable architecture for future @termai/pty-service integration
    - Session management with spawn/write/resize/kill/destroy
    - Cross-platform shell detection
  - Created services index (server/services/index.js)
    - Central export for all server services
    - RAPID framework services (Context, Intent, Smart Response)
    - Knowledge & Learning services
    - Thinking frameworks and parsers subsystems
  - Updated root package.json scripts
    - web:dev - Development mode with hot reload
    - web:start - Production mode
  - **Validated**: Server starts correctly via apps/web entry point

- [x] Phase 6: Frontend Integration - **COMPLETED**
  - Updated BackgroundTerminalService.ts with Universal Bridge pattern
    - Added PTYTransportInterface abstraction for transport-agnostic PTY operations
    - Added setTransport() for dependency injection
    - Dual-mode spawning: spawnWithTransport() vs spawnWithSocketIO() fallback
  - Updated InteractiveBlock.tsx to use useSystem().pty
    - Replaced direct Socket.IO `io()` import with PTY abstraction
    - Uses pty.spawn(), pty.onData(), pty.write(), pty.resize(), pty.kill()
  - Verified PTY REST endpoints already exist (server/routes/pty.js)
    - POST /spawn, /write, /resize, /kill
    - GET /output/:sessionId (Server-Sent Events for streaming)
  - Updated Electron app to use Universal Bridge
    - Fixed renderer App.tsx to use useSystem().pty
    - Fixed TypeScript declaration conflicts (Window.electron optional modifiers)
    - Created CSS module type declarations (renderer/types.d.ts)
    - Fixed preload script type-only imports (IpcRendererEvent)
  - **TypeScript compilation passing for all workspace projects**

- [x] Phase 7: Testing & Polish - **COMPLETED**
  - Fixed ApiTransport PTY endpoint mapping
    - Changed `pty:spawn` from `/api/execute` to `/api/pty/spawn`
    - All PTY operations now correctly target `/api/pty/*` endpoints
  - Integrated SSE streaming into PTYTransportImpl
    - Web mode: Connects to `/api/pty/output/:sessionId` SSE endpoint
    - Electron mode: Uses EventTransport IPC events
    - Auto-generates sessionId if not provided
    - Handles reconnection on SSE errors
  - Verified all PTY REST endpoints:
    - POST `/api/pty/spawn` - Creates PTY session ✓
    - POST `/api/pty/write` - Sends input to PTY ✓
    - POST `/api/pty/resize` - Resizes terminal ✓
    - POST `/api/pty/kill` - Terminates session ✓
    - GET `/api/pty/output/:sessionId` - SSE streaming ✓
    - GET `/api/pty/stats` - Adapter statistics ✓
  - **TypeScript compilation passing for all workspace projects**
  - **Electron app builds successfully (main 8KB, preload 2.6KB, renderer 565KB)**

### Created Artifacts
- `ELECTRON_MIGRATION_PLAN.md` - Comprehensive 7-phase migration plan with todo lists

### Previous Session: 2025-12-08 (P0-P2 UI Engineering Standards)

#### Completed
- [x] **P0: Debouncing for Workspace resize** - 16ms (60fps) debounce utility
- [x] **P0: Error Boundaries** - Terminal and AI Panel error recovery
- [x] **P1: VirtualList for terminal blocks** - Virtualization when >20 blocks
- [x] **P1: ResizeObserver** - Container resize detection
- [x] **Fixed TypeScript errors** in AIStatusBadge, ThinkingDisplay, useThinkingFramework
- [x] **Updated USER_MANUAL.md** - Added Performance & Reliability section
- [x] **Updated README.md** - Added Performance features

---

## Session: 2025-12-04 (Learned Skills as Flow Nodes)

### Completed

- [x] **Learned Skills System for TermFlow**
  - Users can now save successful commands as reusable "Learned Skills"
  - Skills can be added as drag-and-drop nodes in TermFlow automation engine
  
- [x] **New Types & Data Structures**
  - Added `learned-skill` to `FlowNodeType` union (`src/types/flow.ts`)
  - Created `LearnedSkillNodeData` interface with skillId, skillName, command, description, variables
  - Extended `Skill` interface with optional `flowNode?: SkillFlowNode` for flow integration (`src/types/knowledge.ts`)
  - Added `SkillFlowNode` interface for palette display config

- [x] **LearnedSkillNode Component** (`src/components/Flow/nodes/LearnedSkillNode.tsx`)
  - Purple-colored node with Sparkles icon
  - Shows skill name, description, command preview
  - Detects and displays variable placeholders (`{{variable}}` syntax)
  - Registered in `nodeTypes` for React Flow

- [x] **LearnSkillDialog Component** (`src/components/AI/LearnSkillDialog.tsx`)
  - Appears after successful (non-trivial) commands in non-auto-run mode
  - Allows user to name the skill, add description, edit command
  - "Suggest variables" button to auto-detect file paths and replace with placeholders
  - Toggle to enable/disable "Add to TermFlow" (saves flowNode config)
  - Styled to match existing dialog components

- [x] **Updated NodePalette** (`src/components/Flow/NodePalette.tsx`)
  - Now has two sections: "Add Nodes" (built-in) and "Learned Skills"
  - Fetches skills with `flowNode` config from KnowledgeService
  - Learned skills displayed with purple styling and Sparkles icon
  - Refresh button to reload skills
  - Empty state message when no skills saved yet

- [x] **AIPanel Integration** (`src/components/AI/AIPanel.tsx`)
  - Added state for learn skill dialog (`showLearnSkill`, `learnSkillCommand`, `learnSkillOutput`)
  - Triggers LearnSkillDialog after successful commands (exitCode === 0)
  - Excludes trivial commands (cd, ls, pwd, clear, echo, cat, head, tail)
  - Only shows in non-auto-run mode

- [x] **FlowCanvas Updates** (`src/components/Flow/FlowCanvas.tsx`)
  - Updated `getDefaultNodeData()` to handle `learned-skill` type with optional skill data
  - Updated `onDrop` handler to extract skill data from `application/skill-data` dataTransfer
  - Properly creates learned skill nodes with all metadata

- [x] **Backend FlowEngine** (`server/services/FlowEngine.js`)
  - Added `_executeLearnedSkillNode()` method
  - Executes learned skill commands same as command nodes
  - Logs skill name/ID for debugging
  - Supports timeout and cwd options

- [x] **FlowHelpModal Integration** (from previous session)
  - Added Help button to FlowCanvas toolbar
  - Comprehensive user guide with 7 sections

### Files Modified
- `src/types/flow.ts` - Added `learned-skill` type and `LearnedSkillNodeData`
- `src/types/knowledge.ts` - Added `SkillFlowNode` interface, updated `Skill` interface
- `src/components/Flow/nodes/LearnedSkillNode.tsx` - New file
- `src/components/Flow/nodes/index.ts` - Export LearnedSkillNode, add to nodeTypes
- `src/components/AI/LearnSkillDialog.tsx` - New file
- `src/components/Flow/NodePalette.tsx` - Added learned skills section
- `src/components/Flow/NodePalette.module.css` - Added styles for learned skills
- `src/components/AI/AIPanel.tsx` - Integrated LearnSkillDialog
- `src/components/Flow/FlowCanvas.tsx` - Handle learned-skill drops
- `server/services/FlowEngine.js` - Added learned skill node executor

### In Progress

- [ ] **Textarea Text Wrapping Issue**
  - User reports text going behind paperclip and model selector
  - Attempted fixes in AIPanel.tsx (separate rows for textarea and model selector)
  - Added word-wrap CSS to AIInputBox.module.css
  - Issue persists - need more debugging with browser dev tools

### Build Status
- TypeScript: Passing
- Vite Build: Passing

---

## Session: 2025-12-03 (UI Overhaul - Warp Style)

### Completed

- [x] **Tailwind CSS Setup**
  - Installed `tailwindcss`, `autoprefixer`, `@tailwindcss/postcss`
  - Created `tailwind.config.js` with custom Warp-style color palette
  - Updated `postcss.config.js` for Tailwind v4 compatibility
  - Added custom colors: `dark`, `surface`, `accent` (cyan), `purple`, semantic colors
  - Added custom shadows: `cyan-glow`, `purple-glow`
  - Added scrollbar hiding utility class

- [x] **Component Refactoring (CSS Modules → Tailwind)**
  - `AppShell.tsx` - Main shell layout with dark background
  - `Sidebar.tsx` - Warp-style navigation with gradient effects
  - `Block.tsx` - Command blocks with left accent border on hover, cyan glow
  - `TerminalSession.tsx` - Terminal output area with scrollbar hiding
  - `InputArea.tsx` - Floating input card with cyan glow shadow on focus
  - `AIPanel.tsx` - Chat interface with gradient chips, pulsing attention states
  - `TerminalTabs.tsx` - Tab bar with active state indicators
  - `Workspace.tsx` - Vertical split layout with resize handle
  - `ChatMessage.tsx` - Gradient message bubbles with code block styling

- [x] **Warp-Style Design Elements**
  - Left accent borders on command blocks (cyan on hover)
  - Cyan glow shadows on focus states
  - Gradient backgrounds for user/AI messages
  - Context chips with colored borders (cyan for CWD, purple for git, green for context)
  - Animated attention states for when AI needs user input
  - Dark theme with `#050505` base, `#0f1117` surfaces

- [x] **UI Improvements (Font Size & Navigation)**
  - Increased base body font to `15px` with `1.6` line-height
  - Block command text: `text-base` (16px)
  - Terminal input: `text-base` (16px)
  - AI chat messages: `text-base` (16px)
  - Code blocks: `text-sm` (14px)
  - **Made theme toggle more visible** - Now a labeled button showing "Dark"/"Light" with icon
  - Toolbar height increased to 40px with better spacing
  - Larger icon sizes and button hit targets

### Files Modified
- `tailwind.config.js` - New file with Warp color palette
- `postcss.config.js` - Updated for Tailwind
- `src/index.css` - Tailwind directives + increased base font sizes
- `src/components/Shell/AppShell.tsx` - Tailwind classes
- `src/components/Shell/Sidebar.tsx` - Tailwind classes
- `src/components/Terminal/Block.tsx` - Tailwind classes, larger fonts
- `src/components/Terminal/TerminalSession.tsx` - Tailwind classes
- `src/components/Terminal/InputArea.tsx` - Tailwind classes, larger fonts
- `src/components/Terminal/TerminalTabs.tsx` - Tailwind classes
- `src/components/AI/AIPanel.tsx` - Tailwind classes, larger fonts, visible theme toggle
- `src/components/AI/ChatMessage.tsx` - Tailwind classes, larger fonts
- `src/components/Workspace/Workspace.tsx` - Tailwind classes, prominent theme toggle button

### Build Status
- TypeScript: Passing
- Vite Build: Passing
- CSS size reduced from ~85KB to ~81KB (removed unused CSS module styles)

---

## Session: 2025-12-03 (Continued)

### Completed

- [x] **UI Color Theme Overhaul - Catppuccin Mocha Palette**
  - Implemented Catppuccin Mocha (dark) and Latte (light) color schemes
  - **AI elements now use distinct purple/mauve colors** (`--ai-primary: #cba6f7`)
  - **Terminal elements use cyan/green colors** (`--terminal-prompt: #a6e3a1`, `--terminal-command: #89dceb`)
  - **User messages use teal accent** (`--user-bg: #94e2d5`)
  
- [x] **AI Input Box Highlighting**
  - Added gradient background with purple glow effect
  - Purple border with hover glow animation
  - Send button with purple gradient
  - Textarea input in AI accent color
  
- [x] **Message Styling**
  - AI messages: Purple-tinted background with mauve text and border
  - User messages: Teal gradient with dark text, asymmetric border-radius
  - System messages: Green-tinted with dashed border
  
- [x] **Terminal Block Styling**
  - Green prompt color, cyan command color
  - Hover glow effect on terminal blocks
  - Distinct from AI elements for visual clarity
  
- [x] **Code Block & Markdown Updates**
  - Code blocks with cyan border accent
  - Catppuccin syntax highlighting colors
  - Markdown text in AI purple theme

- [x] **Gemini Model Fetching**
  - Implemented dynamic model fetching for Google/Gemini
  - Updated `server/routes/llm.js` to proxy Gemini model list requests
  - Updated `src/services/LLMManager.ts` with generic `fetchModels`
  - Updated `src/components/AI/AIPanel.tsx` to load models on key save/switch

- [x] **Fixed Incorrect OS Detection (macOS vs Linux)**
  - Problem: AI was using Client OS (macOS) instead of Server OS (Ubuntu) for command guidance
  - Fix: Updated `SystemInfoService.ts` to capture `serverOS` from backend
  - Fix: Updated `promptBuilder.ts` to prioritize Server OS in system context
  - Result: AI now correctly identifies the target environment as Linux

- [x] **Fixed Rate Limiting Issues**
  - Problem: `strictRateLimiter` was blocking `/models` and `/has-key` requests during page load
  - Fix: Removed global strict limiter from `/api/llm` in `server/index.js`
  - Fix: Applied strict limiter selectively to `/chat` and `/set-key` in `server/routes/llm.js`
  - Result: UI can fetch models freely without hitting 429 errors

- [x] **Self-Learning System (Context & Skills)**
  - **Backend**: Added `server/routes/knowledge.js` for persistent JSON storage of skills and tasks.
  - **Service**: Created `KnowledgeService` to interface with the knowledge base.
  - **Observer**: Implemented `useObserver` hook ("Task Agent") to analyze sessions and extract SOPs.
  - **UI**: Added "Continuous Learning" toggle in Settings and Manual "Learn" button in AI Panel.
  - **Recall**: Integrated skill retrieval into `AIPanel` to inject learned SOPs into AI context.
  - **Refactoring**: Cleaned up `AIPanel.tsx` to ensure correct function ordering and removed duplicates.
  - **Status**: Build passing. Servers stopped for restart.

### Files Modified
- `src/index.css` - New CSS variables with Catppuccin palette
- `src/components/Terminal/AIInputBox.module.css` - AI box highlighting
- `src/components/Terminal/Block.module.css` - Terminal styling
- `src/components/AI/AIPanel.module.css` - Panel & message styling
- `src/components/AI/ChatMessage.module.css` - Message colors
- `src/components/common/CodeBlock.module.css` - Code styling
- `src/components/common/Markdown.module.css` - Markdown colors
- `server/routes/llm.js` - Added Gemini model fetching & adjusted rate limits
- `server/index.js` - Adjusted middleware configuration, added knowledge routes
- `src/services/LLMManager.ts` - Added `fetchModels`
- `src/components/AI/AIPanel.tsx` - Integrated model fetching logic & Observer. Fixed function ordering.
- `src/services/SystemInfoService.ts` - Added Server OS detection
- `src/utils/promptBuilder.ts` - Updated prompt to use Server OS
- `src/services/KnowledgeService.ts` - New service
- `src/hooks/useObserver.ts` - New hook
- `src/data/prompts/observer.ts` - New prompts
- `server/routes/knowledge.js` - New backend route
- `src/components/Settings/SettingsModal.tsx` - Added Learning toggle

---

## Session: 2025-12-03

### Completed

- [x] Analyzed TermAi codebase structure
- [x] Reviewed existing `AGENTS.md` and `CLAUDE.md` files
- [x] Improved `AGENTS.md` with accurate build commands and code style guidelines
  - Fixed server port (3003 → 3001)
  - Added TypeScript strict settings details
  - Added type guards and error handling patterns
  - Added CSS Modules naming convention
- [x] **Fixed API key save error ("Load failed")**
  - Root cause: **CORS blocking** - browser at `192.168.1.173` was not in allowed origins
  - Fixed `server/.env`: Added `http://192.168.1.173:5173` to `CORS_ORIGINS`
  - Fixed `.env`: Set `VITE_API_URL` and `VITE_WS_URL` to `http://192.168.1.186:3003` (server IP)

### Current State

- Project is a React 19 + TypeScript frontend with Node.js/Express backend
- Frontend: Vite dev server on port 5173
- Backend: Express server on port 3003
- No test suite configured
- **NEW: Catppuccin Mocha/Latte color theme implemented**

### Next Steps

- [ ] Verify API key save works after restarting both servers
- [ ] Test Anthropic API integration end-to-end
- [ ] Test new color theme in browser (both dark and light modes)

---

## How to Use This File

1. Read this file at the start of each session to understand current state
2. Update "Completed" section after finishing tasks
3. Update "Current State" if architecture changes
4. Add new tasks to "Next Steps"
5. Create new session header (## Session: YYYY-MM-DD) for each day
