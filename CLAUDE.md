# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TermAI** is an AI-powered terminal assistant built with React + TypeScript that bridges natural language and command-line operations. It features a modern UI with block-based output, multi-AI provider support (Gemini, OpenAI, Claude, Ollama), smart error recovery, and session management.

## Architecture

### Client-Server Model

The application consists of two main parts:

1. **Frontend** (React + Vite): UI and AI interaction logic
   - Port: `5173` (dev server)
   - Entry point: `src/main.tsx`

2. **Backend** (Node.js/Express): Command execution and file system operations
   - Port: `3001`
   - Entry point: `server/index.js`
   - **Must be running** for the application to work

### Key Components

- **AIPanel** (`src/components/AI/AIPanel.tsx`): Main AI interaction component that handles command generation, error recovery, and auto-run modes. Uses custom events for cross-component communication.

- **TerminalSession** (`src/components/Terminal/TerminalSession.tsx`): Manages terminal state, command blocks, and working directory (cwd). Handles both standard and interactive (SSH) commands.

- **SystemOverseer** (`src/components/Workspace/SystemOverseer.tsx`): Watchdog component that monitors command execution and AI thinking time. Auto-intervenes when commands stall (>30s with no output) or AI hangs (>45s).

- **LLMManager** (`src/services/LLMManager.ts`): Provider abstraction layer for AI models. Each provider (Gemini/OpenAI/Anthropic/Ollama) implements the `LLMProvider` interface with a `chat()` method.

- **FileSystemService** (`src/services/FileSystemService.ts`): Client-side API for agentic file operations (read/write/list/mkdir) that communicate with backend endpoints.

### Backend Capabilities

The Express server (`server/index.js`) provides:

- **REST API** (`/api/execute`, `/api/cancel`): Command execution with working directory tracking, including special handling for `cd` commands
- **File System API** (`/api/fs/*`): Read, write, list, and mkdir operations for AI agents
- **Ollama Proxy** (`/api/proxy/ollama/*`): CORS-safe proxy for local Ollama instances
- **WebSocket/PTY** (via Socket.IO): Interactive terminal sessions for SSH and other real-time commands using `node-pty`

### Event System

Components communicate via custom browser events (all prefixed with `termai-`):

- `termai-command-started`: Fired when command execution begins
- `termai-command-output`: Fired during command output streaming
- `termai-command-finished`: Fired when command completes
- `termai-ai-thinking`: Fired when AI starts/stops processing
- `termai-cancel-command`: Request to cancel a running command
- `termai-run-command`: Request to execute a command
- `termai-cwd-changed`: Working directory changed

Events are scoped by `sessionId` to support multiple terminal sessions.

### System Prompt Architecture

The AI assistant behavior is defined in `src/data/advancedSystemPrompt.ts` (ADVANCED_SYSTEM_PROMPT), which includes:

- Cross-platform command knowledge (macOS/Windows/Linux)
- Shell-specific syntax (bash/zsh/fish/PowerShell/CMD)
- Safety constraints for destructive operations
- Tool definitions for agentic operations (READ_FILE, WRITE_FILE, LIST_FILES, MKDIR)
- Error handling patterns
- Domain-specific knowledge (git, docker, kubernetes, ssh)

The prompt is dynamically built in `src/utils/promptBuilder.ts` with context about OS, shell, working directory, and recent command history.

## Development Commands

### Setup

```bash
# Install dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..
```

### Running the Application

**You must run both frontend and backend simultaneously:**

```bash
# Terminal 1: Start backend server (port 3001)
cd server
node index.js

# Terminal 2: Start frontend dev server (port 5173)
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Build and Lint

```bash
# Type-check and build for production
npm run build

# Lint the codebase
npm run lint

# Preview production build
npm run preview
```

## Code Style and Patterns

### State Management

- React hooks (`useState`, `useEffect`, `useRef`) for local state
- Custom events for cross-component communication
- LocalStorage for session persistence (API keys, session history, cwd)

### Working with AI Providers

When adding or modifying AI providers:

1. Implement the `LLMProvider` interface in `src/services/LLMManager.ts`
2. Add model metadata to `src/data/models.ts`
3. Handle API key validation and browser safety flags (`dangerouslyAllowBrowser` for client-side SDKs)
4. For Ollama: support both direct connection and proxy fallback

### Command Execution Flow

1. User types command or AI generates one → `AIPanel` or `InputArea`
2. Event dispatched → `termai-run-command`
3. `TerminalSession` creates pending block → dispatches `termai-command-started`
4. Command sent to backend → `/api/execute`
5. Backend executes via `child_process.exec` or PTY
6. Output streamed back → block updated → `termai-command-output`
7. Command completes → `termai-command-finished`
8. `SystemOverseer` monitors throughout for stalls

### Interactive Commands (SSH)

SSH and other interactive commands use WebSocket + PTY:

1. Detected by `command.trim().startsWith('ssh')`
2. `InteractiveBlock` component renders xterm.js terminal
3. Socket.IO connection established to backend
4. Backend spawns PTY process via `node-pty`
5. Bidirectional streaming between xterm and PTY

## Project-Specific Notes

### API Keys and Configuration

- API keys stored in LocalStorage (keys: `termai_gemini_key`, `termai_openai_key`, `termai_anthropic_key`)
- Ollama endpoint configurable in settings (default: `http://localhost:11434`)
- No `.env` file needed for frontend (all client-side)

### Session Management

- Sessions stored in LocalStorage under `termai_sessions`
- Each session tracks: id, name, messages, timestamp
- Working directory tracked per-session: `termai_cwd_${sessionId}`

### Error Recovery

The AI assistant has auto-retry capability:

1. Command fails (exitCode !== 0)
2. Error output captured
3. AI prompted with error context
4. AI suggests fix or alternative command
5. User approves or rejects fix

Safety limits prevent infinite retry loops.

### Testing Notes

- No test framework currently configured
- Manual testing workflow:
  1. Start both servers
  2. Test command execution (try: `ls`, `pwd`, `cd ~`)
  3. Test AI generation (describe what you want)
  4. Test error recovery (run invalid command)
  5. Test SSH/interactive mode
  6. Test file operations via AI tools

## Dependencies

### Runtime

- `react` + `react-dom`: UI framework
- `@anthropic-ai/sdk`, `@google/generative-ai`, `openai`: AI provider SDKs
- `xterm` + `xterm-addon-fit`: Terminal emulator for SSH
- `socket.io-client`: WebSocket client for PTY
- `lucide-react`: Icon library
- `framer-motion`: Animations
- `uuid`: Unique ID generation

### Backend (server/)

- `express`: HTTP server
- `socket.io`: WebSocket server
- `node-pty`: Pseudo-terminal for interactive sessions
- `cors`: CORS middleware

## Common Tasks

### Adding a New AI Model

1. Add model definition to `src/data/models.ts`:
   ```typescript
   { id: 'provider-model-name', name: 'Display Name', provider: 'provider' }
   ```

2. Update provider class in `src/services/LLMManager.ts` if needed (add to modelMap)

### Adding New Agentic Tools

1. Define tool in `ADVANCED_SYSTEM_PROMPT.tools.available_tools` (src/data/advancedSystemPrompt.ts)
2. Add parsing logic in `AIPanel.tsx` (search for `[READ_FILE:` pattern)
3. Implement backend endpoint if needed (server/index.js)
4. Add corresponding method to `FileSystemService.ts` if client-side API needed

### Debugging Command Execution

1. Check browser console for frontend errors
2. Check terminal running `node server/index.js` for backend logs
3. Inspect `termai-*` events in browser DevTools (Console → type `monitorEvents(window)`)
4. Verify backend is running on port 3001: `curl http://localhost:3001/api/fs/list -X POST -H "Content-Type: application/json" -d '{"path":"."}'`

### Modifying System Prompt

Edit `src/data/advancedSystemPrompt.ts` → changes apply immediately on next AI request (no rebuild needed for prompt content, but rebuild needed for TypeScript changes).
