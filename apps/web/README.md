# @termai/web

Web server package for TermAI - provides the Express + Socket.IO backend.

## Overview

This package serves as a monorepo wrapper for the TermAI web server. The actual server implementation lives in `/server/` at the project root. This package exists to:

1. Provide workspace integration for the monorepo structure
2. Enable proper dependency management via pnpm workspaces
3. Allow running the server via workspace commands

## Architecture

```
apps/web/
├── index.js          # Entry point that changes to project root and starts server
├── package.json      # Package configuration with workspace dependencies
└── README.md         # This file

../../server/         # Actual server implementation
├── index.js          # Main server file
├── routes/           # API routes
├── services/         # Backend services
├── middleware/       # Express middleware
└── socket.js         # Socket.IO handlers
```

## Usage

### Development Mode

```bash
# From project root
pnpm web:dev

# Or directly
pnpm --filter @termai/web dev
```

This runs the server with Node's `--watch` flag for auto-restart on file changes.

### Production Mode

```bash
# From project root
pnpm web:start

# Or directly
pnpm --filter @termai/web start
```

## Dependencies

- `@termai/pty-service` - PTY service for interactive terminal sessions
- `@termai/shared-types` - Shared TypeScript type definitions

The server itself depends on packages installed in `/server/node_modules/`:
- express
- socket.io
- node-pty
- dotenv
- cors
- And more (see `/server/package.json`)

## Environment Variables

Environment variables are loaded from `/server/.env`. See `/server/.env.example` for required variables.

## Port Configuration

Default port: 3001 (configurable via `PORT` environment variable)

## Notes

- This package uses CommonJS (`type: "commonjs"`) to match the server implementation
- No build step is required - the server is plain JavaScript
- The entry point changes the working directory to the project root to ensure relative paths work correctly
