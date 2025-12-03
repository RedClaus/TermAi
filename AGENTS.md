# TermAI Agent Guidelines

## Build/Test Commands

- **Install**: `npm install` (frontend) and `cd server && npm install` (backend)
- **Dev**: Run both `npm run dev` (port 5173) and `node server/index.js` (port 3001)
- **Build**: `npm run build` (runs tsc + vite build)
- **Lint**: `npm run lint`
- **Test**: No test framework configured; manual testing only

## Code Style

- **Runtime**: React 19 + TypeScript with Vite, Node.js/Express backend
- **Imports**: ESM modules, named imports preferred
- **Types**: TypeScript interfaces in `src/types.ts`, strict mode enabled
- **Naming**: camelCase for variables/functions, PascalCase for components/interfaces
- **Components**: Functional components with hooks, CSS modules for styling
- **State**: React hooks for local state, custom `termai-*` events for cross-component communication
- **Error handling**: Commands return `exitCode`, AI has auto-retry with safety limits

## Architecture

- **Frontend**: React components in `src/components/`, services in `src/services/`
- **Backend**: Express server at `server/index.js` with REST + WebSocket (Socket.IO + node-pty)
- **AI Providers**: Implement `LLMProvider` interface in `src/services/LLMManager.ts`
- **Storage**: LocalStorage for API keys, sessions, and working directory
