# Electron Preload Script

This directory contains the secure preload script that bridges the main and renderer processes in the Electron app.

## Security Model

The preload script uses Electron's `contextBridge` API to expose a **whitelisted** set of IPC channels to the renderer process. This prevents arbitrary code execution and ensures only approved operations can be performed.

## API Surface

The `window.electron` API is exposed to the renderer with the following methods:

### `invoke<T>(channel, ...args): Promise<T>`

Request/response pattern for IPC communication.

**Example:**
```typescript
// Spawn a PTY session
const ptyId = await window.electron.invoke<string>('pty:spawn', '/bin/bash', [], {
  cwd: '/home/user',
  cols: 80,
  rows: 24,
});

// Read a file
const content = await window.electron.invoke<string>('fs:readFile', '/path/to/file.txt');

// Get app version
const version = await window.electron.invoke<string>('app:getVersion');
```

### `on(channel, callback)`

Listen to events from the main process.

**Example:**
```typescript
// Listen for PTY data
window.electron.on('pty:data', (event, data) => {
  console.log('PTY output:', data);
});

// Listen for PTY exit
window.electron.on('pty:exit', (event, exitCode) => {
  console.log('PTY exited with code:', exitCode);
});
```

### `off(channel, callback)`

Remove event listener.

**Example:**
```typescript
const handleData = (event, data) => console.log(data);

window.electron.on('pty:data', handleData);
// Later...
window.electron.off('pty:data', handleData);
```

### `send(channel, ...args)`

Fire-and-forget message (no response expected).

**Example:**
```typescript
// Write to PTY
window.electron.send('pty:write', ptyId, 'ls -la\n');

// Resize PTY
window.electron.send('pty:resize', ptyId, { cols: 100, rows: 30 });
```

### `once(channel, callback)`

Listen to an event once (auto-removes listener after first call).

**Example:**
```typescript
window.electron.once('pty:exit', (event, exitCode) => {
  console.log('PTY exited:', exitCode);
  // This callback will only fire once
});
```

### `removeAllListeners(channel)`

Remove all listeners for a channel.

**Example:**
```typescript
window.electron.removeAllListeners('pty:data');
```

## Whitelisted Channels

### PTY Channels
- `pty:spawn` - Spawn a new PTY session
- `pty:write` - Write data to PTY
- `pty:resize` - Resize PTY dimensions
- `pty:kill` - Kill a PTY session
- `pty:data` - PTY data output (event)
- `pty:exit` - PTY exit notification (event)

### File System Channels
- `fs:readDir` - List directory contents
- `fs:readFile` - Read file contents
- `fs:writeFile` - Write file contents
- `fs:exists` - Check if path exists
- `fs:stat` - Get file/directory stats
- `fs:mkdir` - Create directory

### Storage Channels
- `storage:get` - Get stored value
- `storage:set` - Set stored value
- `storage:remove` - Remove stored value
- `storage:clear` - Clear all storage

### App Channels
- `app:getVersion` - Get application version
- `app:getPlatform` - Get platform (darwin/win32/linux)
- `app:quit` - Quit the application

## Security Notes

1. **Channel Validation**: All channels are validated against the whitelist before forwarding to `ipcRenderer`. Attempting to use an invalid channel will throw an error.

2. **No Arbitrary IPC**: The renderer process cannot send messages to arbitrary IPC channels, preventing potential security exploits.

3. **Type Safety**: TypeScript types ensure compile-time validation of channel names.

4. **Event Isolation**: Each channel's events are isolated - listeners on one channel won't receive events from another.

## Adding New Channels

To add a new IPC channel:

1. Add the channel to the `VALID_CHANNELS` constant in `index.ts`
2. Add the channel to the `ValidChannel` type in `types.d.ts`
3. Implement the corresponding handler in the main process
4. Document the channel in this README

**Example:**
```typescript
// In index.ts
const VALID_CHANNELS = {
  // ... existing channels
  'clipboard:read': true,
  'clipboard:write': true,
} as const;

// In types.d.ts
export type ValidChannel =
  // ... existing channels
  | 'clipboard:read'
  | 'clipboard:write';
```

## TypeScript Support

The preload script exports type definitions that are automatically available in the renderer process. No additional imports are needed - just use `window.electron` with full type safety.

```typescript
// TypeScript will autocomplete and type-check all methods
window.electron.invoke('pty:spawn', /* ... */);
                      // ^ Autocomplete shows all valid channels
```
