# TermAI Development Changelog

This file tracks development progress for agentic coding sessions. Update after each significant change.

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
