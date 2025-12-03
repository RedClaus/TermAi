# TermAI Startup Script

This repository includes a comprehensive startup script (`start.sh`) that handles both dependency installation and application startup for the TermAI project.

## Quick Start

```bash
# Make the script executable (if not already)
chmod +x start.sh

# Run the application (installs dependencies and starts both frontend and backend)
./start.sh
```

## Script Features

- **Pre-flight Checks**: Verifies Node.js version (requires v18+) and npm installation
- **Dependency Management**: Automatically installs frontend and backend dependencies if not present
- **Port Checking**: Warns if required ports (3001, 5173) are already in use
- **Concurrent Services**: Starts both frontend (React+Vite) and backend (Node.js+Express) simultaneously
- **Colored Output**: Uses colored terminal output for better readability
- **Error Handling**: Graceful error handling and cleanup on interruption

## Command Line Options

### Default Behavior
```bash
./start.sh
```
- Installs dependencies (if needed)
- Starts both frontend and backend services

### Install Only
```bash
./start.sh --install-only
```
- Only installs dependencies without starting the application
- Useful for CI/CD pipelines or initial setup

### Skip Installation
```bash
./start.sh --skip-install
```
- Skips dependency installation and directly starts the application
- Useful when dependencies are already installed

## Application URLs

Once started, the application will be available at:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

## Stopping the Application

Press `Ctrl+C` to stop both services. The script handles graceful shutdown.

## Manual Commands (Alternative)

If you prefer to run commands manually:

```bash
# Install all dependencies
npm run install:all

# Start both services
npm run dev:all

# Or start them separately:
npm run dev          # Frontend only
npm run dev:server   # Backend only
```

## Requirements

- Node.js v18 or higher
- npm
- macOS, Linux, or WSL (bash script)

## Troubleshooting

- **Port conflicts**: If ports 3001 or 5173 are in use, stop other services or change ports in the configuration
- **Permission denied**: Run `chmod +x start.sh` to make the script executable
- **Node version**: Update Node.js to v18+ from [nodejs.org](https://nodejs.org/)