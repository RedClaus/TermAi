# TermAI

An AI-powered terminal assistant that bridges natural language and command-line operations. Features a modern UI with multi-provider AI support, skill learning, auto-run capabilities, CLI launcher, and Docker deployment.

## Features

### AI Integration
- **Multi-Provider Support**: Gemini, OpenAI GPT-4, Anthropic Claude, Ollama (local), and OpenRouter
- **Natural Language Commands**: Describe what you want, get executable shell commands
- **Smart Error Recovery**: Automatic error detection and fix suggestions
- **Skill Learning**: AI learns from successful command sequences and reuses them

### Terminal
- **Block-Based Output**: Commands grouped into readable, card-like blocks
- **Multi-Tab Sessions**: Run multiple terminal sessions simultaneously
- **Interactive Mode**: Full PTY support for SSH, vim, and other interactive programs
- **Working Directory Tracking**: Context-aware command execution
- **CLI Launcher**: Run `termai` from any directory to start in that project

### UI/UX
- **Split Panel Layout**: Terminal on top, AI panel on bottom (both resizable)
- **Drag-to-Resize**: Adjust panel sizes with the grip handle
- **Light/Dark Themes**: Toggle between themes
- **Git Branch Display**: Shows current branch in context chips
- **File Browser**: Browse and navigate filesystem from AI panel

### Automation
- **Auto-Run Mode**: Let AI execute command sequences autonomously
- **Safety Confirmations**: Dangerous commands require approval
- **Task Completion Summaries**: View what was accomplished after auto-run
- **Command Preview Mode**: Review commands before execution in auto-run

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/RedClaus/TermAi.git
cd TermAi

# Install all dependencies (frontend + server)
npm run install:all

# Start both servers
npm run dev:all
```

Open http://localhost:5173 in your browser.

### Global CLI Installation (Recommended)

Run TermAI from any directory on your system:

```bash
# Create wrapper script
mkdir -p ~/.local/bin
cat > ~/.local/bin/termai << 'EOF'
#!/bin/bash
TERMAI_DIR="$HOME/github/TermAi"  # Update this path
exec node "$TERMAI_DIR/bin/termai.cjs" "$@"
EOF
chmod +x ~/.local/bin/termai

# Ensure ~/.local/bin is in your PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Now you can run from any project:

```bash
cd ~/my-project
termai              # Starts TermAI in your project directory
termai --help       # Show help
termai --version    # Show version
```

### Docker Deployment

```bash
# Using docker-compose (recommended)
docker-compose up -d

# Or build manually
docker build -t termai .
docker run -p 5173:5173 -p 3001:3001 termai
```

## Configuration

### API Keys

1. Click the **Settings** icon in the sidebar
2. Select your AI provider (Gemini, OpenAI, Claude, OpenRouter)
3. Enter your API key
4. Keys are stored securely on the server (not in browser localStorage)

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Frontend (.env)
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
VITE_DEFAULT_PROVIDER=gemini
VITE_DEFAULT_OLLAMA_ENDPOINT=http://localhost:11434

# Backend (server/.env)
PORT=3001
HOST=0.0.0.0
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Ollama (Local AI)

For local AI without API keys:

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3`
3. Select "Ollama" in TermAI settings
4. Set endpoint (default: http://localhost:11434)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI (bin/termai.cjs)                     │
│         Captures CWD, starts servers, opens browser          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                        Frontend (React)                      │
│                         Port: 5173                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Terminal Session (TOP)                  │    │
│  │  - Command blocks and output                         │    │
│  │  - Direct command input                              │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  ═══════════ Resizable Divider ═══════════         │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │              AI Panel (BOTTOM)                       │    │
│  │  - Chat interface with context chips                 │    │
│  │  - Auto-run controls and model selector              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Services: LLMManager, SessionManager, KnowledgeService,     │
│            InitialCwdService, WidgetContextService           │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                     Backend (Express)                        │
│                       Port: 3001                             │
├─────────────────────────────────────────────────────────────┤
│  Routes:                                                     │
│  - /api/execute - Command execution                          │
│  - /api/initial-cwd - Returns CLI launch directory           │
│  - /api/llm/* - AI provider proxy (keys stored here)         │
│  - /api/knowledge/* - Skill learning storage                 │
│  - /api/fs/* - File system operations                        │
│  - Socket.IO - Interactive PTY sessions                      │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
TermAi/
├── bin/                    # CLI entry point
│   └── termai.cjs         # Global CLI launcher
├── src/                    # Frontend source
│   ├── components/
│   │   ├── AI/            # AI panel, chat, model selector
│   │   ├── Terminal/      # Terminal session, blocks, input
│   │   ├── Settings/      # Settings modal, skill viewer
│   │   ├── Shell/         # App shell, sidebar
│   │   └── Workspace/     # Layout (terminal top, AI bottom)
│   ├── services/          # API clients (LLM, Knowledge, FS, InitialCwd)
│   ├── hooks/             # React hooks (autorun, observer, etc)
│   ├── data/              # System prompts, model definitions
│   └── events/            # Custom event system
├── server/                # Backend source
│   ├── routes/            # API route handlers
│   ├── middleware/        # Rate limiting, validation, logging
│   ├── config/            # Server configuration
│   └── data/              # Learned skills storage (JSON)
├── public/                # Static assets
├── Dockerfile             # Container build
├── docker-compose.yml     # Multi-container orchestration
└── Makefile              # Common commands
```

## Development

### Commands

```bash
# Install dependencies
npm run install:all

# Development (frontend + backend)
npm run dev:all

# Frontend only
npm run dev

# Backend only
npm run dev:server

# Build for production
npm run build

# Lint
npm run lint

# Run via CLI (from any directory)
termai                # Start in current directory
termai --help         # Show CLI help
termai --version      # Show version
```

### Adding a New AI Provider

1. Add model definitions to `src/data/models.ts`
2. Add provider case to `LLMManager.getProvider()` in `src/services/LLMManager.ts`
3. Add backend route handler in `server/routes/llm.js`

### Event System

Components communicate via custom events prefixed with `termai-`:

| Event | Description |
|-------|-------------|
| `termai-run-command` | Request command execution |
| `termai-command-started` | Command execution began |
| `termai-command-output` | Streaming command output |
| `termai-command-finished` | Command completed |
| `termai-ai-thinking` | AI processing state |
| `termai-cwd-changed` | Working directory changed |
| `termai-settings-changed` | Settings updated |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send message / Run command |
| `Ctrl+Shift+A` | Toggle Auto-Run mode |
| `Ctrl+K` | Open command palette |
| `Ctrl+L` | Clear terminal |
| `Escape` | Cancel current operation |

## Troubleshooting

### "Unable to connect to server"
- Ensure backend is running: `npm run dev:server`
- Check port 3001 is not in use
- Verify CORS settings in `server/.env`

### AI not responding
- Check API key is set in Settings
- Verify provider is selected
- Check browser console for errors
- For Ollama: ensure service is running

### Commands not executing
- Backend must be running
- Check terminal output for errors
- Verify working directory exists

### Rate limiting (429 errors)
- API key caching prevents spam on page load
- If persists, check for component re-render loops

## Tech Stack

**Frontend**
- React 19 + TypeScript
- Vite (build tool)
- CSS Modules (styling)
- xterm.js (terminal emulation)
- Socket.IO (WebSocket client)
- Framer Motion (animations)
- Lucide React (icons)

**Backend**
- Node.js + Express
- Socket.IO (WebSocket server)
- node-pty (pseudo-terminal)
- AI SDKs: @anthropic-ai/sdk, @google/generative-ai, openai

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

See `CLAUDE.md` for detailed architecture and `AGENTS.md` for coding guidelines.

## License

MIT License - see LICENSE for details.
