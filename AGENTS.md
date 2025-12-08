# TermAI Agent Guide

## Commands
- **Install:** `npm run install:all` (installs root & server deps)
- **Dev:** `npm run dev:all` (runs frontend :5173 & backend :3001)
- **Build:** `npm run build` (tsc + vite build)
- **Lint:** `npm run lint` (eslint)
- **Test:** Manual testing only. No automated test suite. Verify via UI or `curl`.

## Code Style
- **Frontend (src):** TypeScript, React 19, strict mode. Use `import type` (verbatimModuleSyntax).
- **Backend (server):** CommonJS (Node.js). Use `require()`. No TypeScript.
- **Styling:** Tailwind CSS v4 + CSS Modules (`.module.css`). Dark theme (Warp-style).
- **Naming:** PascalCase for components/types, camelCase for vars/funcs.
- **Structure:** `src/components`, `src/services`, `src/hooks`. Events scoped by `sessionId`.
- **Imports:** Explicit `import type`. Named imports preferred.
- **Safety:** API keys server-side only. Validate all paths/commands.

## Architecture
- **State:** React state + Custom Events (`termai-*`).
- **Comms:** Socket.IO for PTY, REST for logic.
- **AI Context:** Drag & Drop files supported in `AIPanel`. CLI piping planned.
