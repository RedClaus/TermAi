# PTY REST API Guide

This guide explains how to use the new REST API endpoints for PTY (pseudo-terminal) management in TermAI.

## Overview

The PTY REST API provides an alternative to WebSocket for terminal session management. It uses:
- **REST endpoints** for control operations (spawn, write, resize, kill)
- **Server-Sent Events (SSE)** for real-time output streaming

This "hybrid" approach works better in certain scenarios:
- Environments with WebSocket restrictions
- Better debugging with standard HTTP tools
- Easier load balancing and proxying
- Progressive enhancement from REST to real-time

## Architecture

```
Client                                    Server
  │                                         │
  ├──POST /api/pty/spawn────────────────►  │  Create PTY session
  │                                         ├─► PTYAdapter.spawn()
  │◄──{sessionId, pid}──────────────────── │
  │                                         │
  ├──GET /api/pty/output/:sessionId──────►  │  Start SSE stream
  │◄──SSE: {type:'output', data}────────── │  (bidirectional: buffered + live)
  │◄──SSE: {type:'output', data}────────── │
  │                                         │
  ├──POST /api/pty/write────────────────►  │  Send input
  │   {sessionId, data:"ls\r"}              ├─► PTYAdapter.write()
  │◄──{success:true}───────────────────── │
  │                                         │
  │◄──SSE: {type:'output', data}────────── │  Output appears in SSE
  │                                         │
  ├──POST /api/pty/resize───────────────►  │  Resize terminal
  │◄──{success:true}───────────────────── │
  │                                         │
  ├──POST /api/pty/kill─────────────────►  │  Terminate session
  │◄──{success:true}───────────────────── │
  │                                         │
  │◄──SSE: {type:'exit', exitCode}─────── │  Session closed
  └─────────────────────────────────────── │
```

## API Endpoints

### 1. Spawn PTY Session

Create a new pseudo-terminal session.

**Endpoint:** `POST /api/pty/spawn`

**Request Body:**
```json
{
  "sessionId": "unique-session-id",
  "command": "/bin/bash",       // Optional: shell to use (defaults to system shell)
  "cwd": "/home/user/project",  // Optional: working directory
  "cols": 80,                   // Optional: columns (default: 80)
  "rows": 24,                   // Optional: rows (default: 24)
  "env": {                      // Optional: environment variables
    "TERM": "xterm-256color"
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "unique-session-id",
  "pid": 12345,
  "shell": "/bin/bash",
  "cwd": "/home/user/project"
}
```

**Error Responses:**
- `400` - sessionId is required
- `409` - Session already exists
- `500` - Internal error

**Example:**
```bash
curl -X POST http://localhost:3001/api/pty/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "term-1",
    "cwd": "/home/user",
    "cols": 120,
    "rows": 30
  }'
```

---

### 2. Output Stream (SSE)

Subscribe to real-time output from a PTY session using Server-Sent Events.

**Endpoint:** `GET /api/pty/output/:sessionId`

**SSE Event Types:**

| Type | Description | Data |
|------|-------------|------|
| `connected` | Stream connection confirmed | `{sessionId}` |
| `output` | Terminal output data | `{data: string}` |
| `exit` | Process exited | `{exitCode: number, signal?: string}` |
| `heartbeat` | Keep-alive ping (every 15s) | `{timestamp: number}` |
| `error` | Error occurred | `{error: string}` |

**Example (JavaScript):**
```javascript
const eventSource = new EventSource('http://localhost:3001/api/pty/output/term-1');

eventSource.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'connected':
      console.log('Connected to session:', msg.sessionId);
      break;

    case 'output':
      // Write to terminal display
      terminal.write(msg.data);
      break;

    case 'exit':
      console.log('Process exited with code:', msg.exitCode);
      eventSource.close();
      break;

    case 'heartbeat':
      // Connection is alive
      break;
  }
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};
```

**Example (curl):**
```bash
curl -N http://localhost:3001/api/pty/output/term-1
# Output:
# data: {"type":"connected","sessionId":"term-1"}
#
# data: {"type":"output","data":"user@host:~$ "}
#
# data: {"type":"output","data":"ls\r\n"}
```

**Buffering:**
The SSE stream automatically sends any buffered output from before the connection was established. This ensures you don't miss output if you spawn the PTY before subscribing to the stream.

---

### 3. Write Input

Send input data (keystrokes, commands) to the PTY.

**Endpoint:** `POST /api/pty/write`

**Request Body:**
```json
{
  "sessionId": "unique-session-id",
  "data": "ls -la\r"    // \r = Enter key
}
```

**Response:**
```json
{
  "success": true
}
```

**Error Responses:**
- `400` - sessionId or data is required
- `404` - Session not found
- `500` - Internal error

**Example:**
```bash
# Send "ls" command
curl -X POST http://localhost:3001/api/pty/write \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"term-1","data":"ls -la\r"}'

# Send Ctrl+C (SIGINT)
curl -X POST http://localhost:3001/api/pty/write \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"term-1","data":"\u0003"}'
```

---

### 4. Resize Terminal

Change the terminal dimensions (e.g., when user resizes the terminal window).

**Endpoint:** `POST /api/pty/resize`

**Request Body:**
```json
{
  "sessionId": "unique-session-id",
  "cols": 120,
  "rows": 40
}
```

**Response:**
```json
{
  "success": true,
  "cols": 120,
  "rows": 40
}
```

**Error Responses:**
- `400` - sessionId, cols, or rows is required
- `404` - Session not found
- `500` - Internal error

**Example:**
```bash
curl -X POST http://localhost:3001/api/pty/resize \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"term-1","cols":120,"rows":40}'
```

---

### 5. Kill Session

Terminate a PTY session and clean up resources.

**Endpoint:** `POST /api/pty/kill`

**Request Body:**
```json
{
  "sessionId": "unique-session-id",
  "signal": "SIGTERM"    // Optional: signal to send (default: SIGHUP)
}
```

**Response:**
```json
{
  "success": true
}
```

**Error Responses:**
- `400` - sessionId is required
- `404` - Session not found
- `500` - Internal error

**Available Signals:**
- `SIGHUP` (default) - Hangup
- `SIGTERM` - Terminate
- `SIGKILL` - Force kill
- `SIGINT` - Interrupt (Ctrl+C)

**Example:**
```bash
curl -X POST http://localhost:3001/api/pty/kill \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"term-1","signal":"SIGTERM"}'
```

---

### 6. List Sessions

Get information about all active PTY sessions.

**Endpoint:** `GET /api/pty/sessions`

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "term-1",
      "shell": "/bin/bash",
      "cwd": "/home/user",
      "cols": 80,
      "rows": 24,
      "pid": 12345,
      "createdAt": 1704067200000,
      "uptime": 45000
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:3001/api/pty/sessions
```

---

### 7. Get Session Info

Get detailed information about a specific session.

**Endpoint:** `GET /api/pty/session/:sessionId`

**Response:**
```json
{
  "sessionId": "term-1",
  "shell": "/bin/bash",
  "cwd": "/home/user/project",
  "cols": 120,
  "rows": 30,
  "pid": 12345,
  "createdAt": 1704067200000,
  "uptime": 45000
}
```

**Error Responses:**
- `400` - sessionId is required
- `404` - Session not found

**Example:**
```bash
curl http://localhost:3001/api/pty/session/term-1
```

---

### 8. Get Statistics

Get PTY adapter statistics (debugging/monitoring).

**Endpoint:** `GET /api/pty/stats`

**Response:**
```json
{
  "activeSessions": 2,
  "backend": "node-pty",
  "sessions": [
    {
      "sessionId": "term-1",
      "shell": "/bin/bash",
      "cwd": "/home/user",
      "cols": 80,
      "rows": 24,
      "pid": 12345,
      "createdAt": 1704067200000,
      "uptime": 45000
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:3001/api/pty/stats
```

---

## Complete Example: Terminal Session

Here's a complete example showing the full lifecycle of a PTY session:

```javascript
// 1. Spawn a new PTY session
const spawnResponse = await fetch('http://localhost:3001/api/pty/spawn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'my-terminal',
    cwd: '/home/user/project',
    cols: 80,
    rows: 24
  })
});

const { sessionId, pid } = await spawnResponse.json();
console.log(`Spawned PTY: sessionId=${sessionId}, pid=${pid}`);

// 2. Connect to SSE output stream
const eventSource = new EventSource(`http://localhost:3001/api/pty/output/${sessionId}`);

eventSource.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'output') {
    // Display output in terminal UI
    terminal.write(msg.data);
  } else if (msg.type === 'exit') {
    console.log('Process exited:', msg.exitCode);
    eventSource.close();
  }
};

// 3. Send commands
async function sendCommand(command) {
  await fetch('http://localhost:3001/api/pty/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId,
      data: command + '\r'  // Add carriage return
    })
  });
}

await sendCommand('ls -la');
await sendCommand('git status');
await sendCommand('npm install');

// 4. Handle terminal resize
window.addEventListener('resize', async () => {
  const { cols, rows } = terminal.getDimensions();

  await fetch('http://localhost:3001/api/pty/resize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId,
      cols,
      rows
    })
  });
});

// 5. Cleanup on close
window.addEventListener('beforeunload', async () => {
  await fetch('http://localhost:3001/api/pty/kill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });

  eventSource.close();
});
```

---

## Error Handling

All endpoints return standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (missing/invalid parameters) |
| 404 | Not Found (session doesn't exist) |
| 409 | Conflict (session already exists) |
| 500 | Internal Server Error |

Error response format:
```json
{
  "error": "Error message here",
  "sessionId": "optional-session-id"
}
```

---

## SSE Connection Management

### Reconnection Strategy

If the SSE connection drops, implement exponential backoff:

```javascript
let reconnectAttempts = 0;
const maxReconnectDelay = 30000; // 30 seconds

function connectSSE(sessionId) {
  const eventSource = new EventSource(`/api/pty/output/${sessionId}`);

  eventSource.onopen = () => {
    reconnectAttempts = 0; // Reset on successful connection
  };

  eventSource.onerror = () => {
    eventSource.close();

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    reconnectAttempts++;

    setTimeout(() => connectSSE(sessionId), delay);
  };

  return eventSource;
}
```

### Heartbeat Monitoring

Monitor heartbeats to detect dead connections:

```javascript
let lastHeartbeat = Date.now();

eventSource.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'heartbeat') {
    lastHeartbeat = Date.now();
  }
};

// Check heartbeat every 30 seconds
setInterval(() => {
  const timeSinceHeartbeat = Date.now() - lastHeartbeat;

  if (timeSinceHeartbeat > 45000) { // 45s = 3 missed heartbeats
    console.warn('Connection appears dead, reconnecting...');
    eventSource.close();
    connectSSE(sessionId);
  }
}, 30000);
```

---

## Performance Considerations

1. **Output Buffering**: The server buffers up to 1000 output events per session. This prevents memory leaks for long-running sessions.

2. **SSE Keep-Alive**: Heartbeat events are sent every 15 seconds to prevent connection timeouts through proxies.

3. **Concurrent Sessions**: Each PTY session runs in its own process. Monitor system resources for high session counts.

4. **Network Efficiency**: SSE is unidirectional (server→client). For commands (client→server), REST POST requests are used. This is more efficient than WebSocket for this use case.

---

## Comparison: REST+SSE vs WebSocket

| Feature | REST+SSE | WebSocket |
|---------|----------|-----------|
| Browser Support | Universal | IE 10+ |
| Proxy/Firewall | Better compatibility | Can be blocked |
| Debugging | Easy with curl/DevTools | Requires special tools |
| Connection | Automatic reconnection | Manual reconnection |
| Buffering | Built-in (missed events) | Manual implementation |
| Bidirectional | No (REST for client→server) | Yes |
| Overhead | Slightly higher | Lower |
| HTTP/2 Multiplexing | Yes | No |

**When to use REST+SSE:**
- Corporate networks with WebSocket restrictions
- Simpler client implementation
- Better debugging/testing workflow
- Progressive enhancement from REST

**When to use WebSocket:**
- Real-time bidirectional gaming/collaboration
- Very high frequency updates (>10/sec)
- Low latency requirements (<100ms)

---

## Security Considerations

1. **Session ID**: Use cryptographically secure random IDs (UUID v4 recommended)
2. **Authentication**: Add auth middleware to routes if needed
3. **Rate Limiting**: Already handled by server middleware
4. **CORS**: Configure CORS origins in server config
5. **Input Validation**: Never trust client-provided commands/paths

---

## Integration with TermAI Frontend

To integrate with the existing TermAI frontend:

1. Create a new `PTYService` class in `src/services/PTYService.ts`
2. Wrap the REST+SSE API with TypeScript types
3. Add a toggle in settings: "Use REST Mode" vs "Use WebSocket Mode"
4. Detect WebSocket failures and auto-fallback to REST mode

Example stub:
```typescript
// src/services/PTYService.ts
export class PTYService {
  async spawn(sessionId: string, options: PTYSpawnOptions): Promise<PTYSession>
  async write(sessionId: string, data: string): Promise<void>
  async resize(sessionId: string, cols: number, rows: number): Promise<void>
  async kill(sessionId: string, signal?: string): Promise<void>

  subscribe(sessionId: string, callback: (event: PTYEvent) => void): () => void
}
```

---

## Troubleshooting

### SSE Not Receiving Events

1. Check browser DevTools Network tab for SSE connection
2. Verify session exists: `curl http://localhost:3001/api/pty/sessions`
3. Check server logs for PTY errors
4. Try spawning PTY first, then connecting SSE

### Commands Not Executing

1. Verify carriage return: commands need `\r` suffix
2. Check PTY is alive: `GET /api/pty/session/:sessionId`
3. Test with simple command: `echo "test"\r`

### High Memory Usage

1. Check output buffer size (max 1000 events per session)
2. Kill inactive sessions: `POST /api/pty/kill`
3. Monitor with: `GET /api/pty/stats`

---

## Future Enhancements

Potential improvements for future versions:

- [ ] Session persistence across server restarts
- [ ] Recording/playback of terminal sessions
- [ ] Multi-user session sharing
- [ ] Resource limits (CPU/memory per session)
- [ ] WebRTC data channel as alternative transport
- [ ] Compression for large output volumes

---

## License

Part of TermAI project. See main repository LICENSE.
