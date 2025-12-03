# TermAI Agent Guidelines

## Build/Test Commands

- **Install**: `npm run install:all` (installs frontend + server deps)
- **Dev**: `npm run dev:all` (runs frontend:5173 + server:3001 concurrently)
- **Build**: `npm run build` (tsc -b && vite build)
- **Lint**: `npm run lint` (ESLint with typescript-eslint)
- **No test suite** - manual testing required (run both servers, test commands, AI interactions, SSH)

## Code Style

- **Frontend**: React 19 + TypeScript + Vite, CSS Modules (`.module.css`)
- **Backend**: Node.js/Express (plain JS in `server/`), Socket.IO + node-pty for interactive sessions
- **TypeScript**: Strict mode, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `verbatimModuleSyntax`
- **Imports**: Named imports preferred; use `import type { X }` for type-only imports (required by `verbatimModuleSyntax`)
- **Naming**: camelCase (vars/functions), PascalCase (components/interfaces/types)
- **Types**: Define interfaces in `src/types.ts`; use type guards (`isDefined`, `isApiError`, `isNonEmptyString`) over try/catch
- **Events**: Custom browser events prefixed `termai-*` (e.g., `termai-command-started`, `termai-run-command`)
- **Error handling**: Type guards preferred; wrap API responses with `ApiResponse<T>` interface

## Architecture

- React frontend ↔ Express backend via REST (`/api/*`) + WebSocket (port 3001)
- AI providers abstracted in `src/services/LLMManager.ts` (Gemini, OpenAI, Claude, Ollama, OpenRouter)
- System prompt in `src/data/advancedSystemPrompt.ts`, models in `src/data/models.ts`
- See `CLAUDE.md` for detailed architecture, command flow, and adding new features
