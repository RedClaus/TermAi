# PTY Operations with ApiTransport

This document describes how to use the PTY operations in the enhanced `ApiTransport` class.

## Overview

The `ApiTransport` class now supports PTY (pseudo-terminal) operations with automatic transport selection:
- **Electron mode**: Uses IPC channels for communication
- **Web mode**: Uses WebSocket for real-time streaming

## API Methods

### 1. Create PTY Session

Spawns a new PTY session with a shell.

```typescript
import { ApiTransport } from '@termai/ui-core';

const transport = new ApiTransport('http://localhost:3001');

const result = await transport.createPTYSession({
  shell: '/bin/bash',
  cwd: '/home/user/project',
  cols: 80,
  rows: 24,
  env: {
    ...process.env,
    CUSTOM_VAR: 'value'
  }
});

if (result.success && result.data) {
  const session = result.data;
  console.log('Session ID:', session.id);
  console.log('Process ID:', session.pid);
  console.log('Working directory:', session.cwd);
}
```

### 2. Connect to PTY Stream

Register callbacks to receive output and events from the PTY.

```typescript
transport.connectPTYStream(sessionId, {
  onData: (data: string) => {
    // Handle terminal output
    console.log(data);
    // Update your UI here
  },
  onExit: (exitCode: number) => {
    // Handle process exit
    console.log('Process exited with code:', exitCode);
  },
  onError: (error: string) => {
    // Handle errors
    console.error('PTY error:', error);
  }
});
```

### 3. Send Input to PTY

Send keyboard input or commands to the terminal.

```typescript
// Send a command
await transport.sendPTYInput(sessionId, 'ls -la\n');

// Send Ctrl+C
await transport.sendPTYInput(sessionId, '\x03');

// Send Ctrl+D (EOF)
await transport.sendPTYInput(sessionId, '\x04');
```

### 4. Resize PTY

Update the terminal dimensions when the window is resized.

```typescript
await transport.resizePTY(sessionId, 120, 40);
```

### 5. Kill PTY Session

Terminate a running PTY session.

```typescript
await transport.killPTY(sessionId);
```

### 6. Disconnect from PTY Stream

Stop receiving events from a PTY session (without killing it).

```typescript
transport.disconnectPTYStream(sessionId);
```

## Complete Example: Interactive Terminal

```typescript
import { ApiTransport, type PTYStreamCallbacks } from '@termai/ui-core';
import type { PTYSession } from '@termai/shared-types';

class TerminalWidget {
  private transport: ApiTransport;
  private session: PTYSession | null = null;
  private outputElement: HTMLDivElement;

  constructor(outputElement: HTMLDivElement) {
    this.transport = new ApiTransport();
    this.outputElement = outputElement;
  }

  async start() {
    // Create PTY session
    const result = await this.transport.createPTYSession({
      shell: '/bin/bash',
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    });

    if (!result.success || !result.data) {
      console.error('Failed to create PTY:', result.error);
      return;
    }

    this.session = result.data;

    // Connect to stream
    this.transport.connectPTYStream(this.session.id, {
      onData: (data) => {
        this.appendOutput(data);
      },
      onExit: (exitCode) => {
        this.appendOutput(`\n[Process exited with code ${exitCode}]\n`);
        this.session = null;
      },
      onError: (error) => {
        this.appendOutput(`\n[Error: ${error}]\n`);
      }
    });

    console.log('Terminal started, session ID:', this.session.id);
  }

  async sendInput(data: string) {
    if (!this.session) {
      console.warn('No active session');
      return;
    }

    await this.transport.sendPTYInput(this.session.id, data);
  }

  async resize(cols: number, rows: number) {
    if (!this.session) {
      return;
    }

    await this.transport.resizePTY(this.session.id, cols, rows);
  }

  async stop() {
    if (!this.session) {
      return;
    }

    await this.transport.killPTY(this.session.id);
    this.session = null;
  }

  private appendOutput(data: string) {
    // Simple text append (you'd want proper ANSI parsing in production)
    this.outputElement.textContent += data;
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  destroy() {
    this.stop();
    this.transport.destroy();
  }
}

// Usage
const outputDiv = document.getElementById('terminal-output') as HTMLDivElement;
const terminal = new TerminalWidget(outputDiv);

await terminal.start();

// Handle input
document.getElementById('input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const input = (e.target as HTMLInputElement).value;
    terminal.sendInput(input + '\n');
    (e.target as HTMLInputElement).value = '';
  }
});

// Handle resize
window.addEventListener('resize', () => {
  const cols = Math.floor(window.innerWidth / 9);
  const rows = Math.floor(window.innerHeight / 16);
  terminal.resize(cols, rows);
});

// Cleanup on unmount
window.addEventListener('beforeunload', () => {
  terminal.destroy();
});
```

## WebSocket Protocol (Web Mode)

The WebSocket connection is established at `ws://[baseUrl]/pty`.

### Client to Server Messages

```typescript
// Spawn a new PTY
{
  type: 'spawn',
  data: {
    shell: '/bin/bash',
    cwd: '/home/user',
    cols: 80,
    rows: 24,
    env: { ... }
  }
}

// Send input to PTY
{
  type: 'input',
  sessionId: 'session-uuid',
  data: 'ls -la\n'
}

// Resize PTY
{
  type: 'resize',
  sessionId: 'session-uuid',
  data: { cols: 120, rows: 40 }
}

// Kill PTY
{
  type: 'kill',
  sessionId: 'session-uuid'
}
```

### Server to Client Messages

```typescript
// PTY spawned successfully
{
  type: 'spawned',
  data: {
    id: 'session-uuid',
    pid: 12345,
    cwd: '/home/user',
    active: true
  }
}

// Terminal output
{
  type: 'output',
  sessionId: 'session-uuid',
  data: 'command output...'
}

// Process exited
{
  type: 'exit',
  sessionId: 'session-uuid',
  exitCode: 0
}

// Error occurred
{
  type: 'error',
  sessionId: 'session-uuid',
  error: 'Error message'
}
```

## Features

### Automatic Reconnection

The WebSocket layer includes automatic reconnection with exponential backoff:
- Maximum 5 reconnection attempts
- 2-second delay between attempts
- Queues messages during reconnection
- Notifies active sessions if reconnection fails

### Message Queueing

Messages sent while the WebSocket is disconnected are automatically queued and sent once the connection is re-established.

### Multiple Sessions

You can manage multiple PTY sessions simultaneously. Each session is identified by a unique session ID.

```typescript
const session1 = await transport.createPTYSession({ shell: '/bin/bash' });
const session2 = await transport.createPTYSession({ shell: '/bin/zsh' });

transport.connectPTYStream(session1.data!.id, { onData: handleBash });
transport.connectPTYStream(session2.data!.id, { onData: handleZsh });
```

### Cleanup

Always call `destroy()` when you're done with the transport to clean up WebSocket connections and timers:

```typescript
// When component unmounts
useEffect(() => {
  return () => {
    transport.destroy();
  };
}, []);
```

## Electron Mode

In Electron mode, the PTY operations use IPC channels:
- `pty:spawn` - Create PTY session
- `pty:write` - Send input
- `pty:resize` - Resize terminal
- `pty:kill` - Terminate session

The Electron main process should emit events for PTY output:
- `pty:data` - Terminal output
- `pty:exit` - Process exit
- `pty:error` - Error occurred

## Error Handling

Always check the `success` field in responses:

```typescript
const result = await transport.createPTYSession(options);

if (!result.success) {
  console.error('Failed to create PTY:', result.error);
  // Handle error appropriately
  return;
}

// Safe to use result.data
const session = result.data!;
```

For stream callbacks, implement error handlers:

```typescript
transport.connectPTYStream(sessionId, {
  onData: (data) => { /* ... */ },
  onError: (error) => {
    // Connection lost, session error, etc.
    console.error('Stream error:', error);
    // Show error to user
    // Attempt recovery or cleanup
  }
});
```
