/**
 * Example usage of the Electron preload API from the renderer process
 *
 * This file demonstrates how to use window.electron in a TypeScript renderer.
 * Copy these patterns into your actual renderer code.
 */

// ==================================================
// PTY Examples
// ==================================================

async function spawnPtyExample() {
  try {
    // Spawn a new PTY session
    const ptyId = await window.electron.invoke<string>(
      'pty:spawn',
      '/bin/bash',
      [],
      {
        cwd: '/home/user',
        cols: 80,
        rows: 24,
        env: process.env,
      }
    );

    console.log('PTY spawned with ID:', ptyId);

    // Listen for data from the PTY
    window.electron.on('pty:data', (event, id: string, data: string) => {
      if (id === ptyId) {
        console.log('PTY output:', data);
      }
    });

    // Listen for PTY exit
    window.electron.on('pty:exit', (event, id: string, exitCode: number) => {
      if (id === ptyId) {
        console.log('PTY exited with code:', exitCode);
      }
    });

    // Write a command to the PTY
    window.electron.send('pty:write', ptyId, 'ls -la\n');

    // Resize the PTY
    window.electron.send('pty:resize', ptyId, { cols: 100, rows: 30 });

    // Kill the PTY when done
    setTimeout(() => {
      window.electron.send('pty:kill', ptyId);
    }, 5000);
  } catch (error) {
    console.error('PTY error:', error);
  }
}

// ==================================================
// File System Examples
// ==================================================

async function fileSystemExample() {
  try {
    // Check if a file exists
    const exists = await window.electron.invoke<boolean>('fs:exists', '/path/to/file.txt');
    console.log('File exists:', exists);

    // Read file contents
    const content = await window.electron.invoke<string>('fs:readFile', '/path/to/file.txt');
    console.log('File content:', content);

    // Write file contents
    await window.electron.invoke('fs:writeFile', '/path/to/output.txt', 'Hello, World!');
    console.log('File written successfully');

    // Read directory contents
    const files = await window.electron.invoke<string[]>('fs:readDir', '/path/to/directory');
    console.log('Directory contents:', files);

    // Get file stats
    interface FileStat {
      size: number;
      isFile: boolean;
      isDirectory: boolean;
      mtime: Date;
    }
    const stats = await window.electron.invoke<FileStat>('fs:stat', '/path/to/file.txt');
    console.log('File stats:', stats);

    // Create directory
    await window.electron.invoke('fs:mkdir', '/path/to/new/directory');
    console.log('Directory created');
  } catch (error) {
    console.error('File system error:', error);
  }
}

// ==================================================
// Storage Examples
// ==================================================

async function storageExample() {
  try {
    // Set a value
    await window.electron.invoke('storage:set', 'myKey', { foo: 'bar', count: 42 });
    console.log('Value stored');

    // Get a value
    const value = await window.electron.invoke<{ foo: string; count: number }>(
      'storage:get',
      'myKey'
    );
    console.log('Retrieved value:', value);

    // Remove a value
    await window.electron.invoke('storage:remove', 'myKey');
    console.log('Value removed');

    // Clear all storage
    await window.electron.invoke('storage:clear');
    console.log('Storage cleared');
  } catch (error) {
    console.error('Storage error:', error);
  }
}

// ==================================================
// App Examples
// ==================================================

async function appExample() {
  try {
    // Get app version
    const version = await window.electron.invoke<string>('app:getVersion');
    console.log('App version:', version);

    // Get platform
    const platform = await window.electron.invoke<'darwin' | 'win32' | 'linux'>(
      'app:getPlatform'
    );
    console.log('Platform:', platform);

    // Quit the app
    window.electron.send('app:quit');
  } catch (error) {
    console.error('App error:', error);
  }
}

// ==================================================
// Event Listener Management Examples
// ==================================================

function eventListenerExample() {
  // Define a callback
  const handlePtyData = (event: unknown, id: string, data: string) => {
    console.log(`PTY ${id} data:`, data);
  };

  // Add listener
  window.electron.on('pty:data', handlePtyData);

  // Remove listener later
  setTimeout(() => {
    window.electron.off('pty:data', handlePtyData);
    console.log('Listener removed');
  }, 10000);

  // Listen once (auto-removes after first call)
  window.electron.once('pty:exit', (event, id: string, exitCode: number) => {
    console.log(`PTY ${id} exited with code ${exitCode}`);
    // This callback will only fire once
  });

  // Remove all listeners for a channel
  setTimeout(() => {
    window.electron.removeAllListeners('pty:data');
    console.log('All pty:data listeners removed');
  }, 20000);
}

// ==================================================
// React Component Example
// ==================================================

import { useEffect, useState } from 'react';

function TerminalComponent() {
  const [ptyId, setPtyId] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');

  useEffect(() => {
    // Spawn PTY on mount
    const initPty = async () => {
      const id = await window.electron.invoke<string>(
        'pty:spawn',
        '/bin/bash',
        [],
        { cwd: process.cwd(), cols: 80, rows: 24 }
      );
      setPtyId(id);
    };

    initPty();

    // Set up data listener
    const handleData = (event: unknown, id: string, data: string) => {
      if (id === ptyId) {
        setOutput((prev) => prev + data);
      }
    };

    window.electron.on('pty:data', handleData);

    // Cleanup on unmount
    return () => {
      window.electron.off('pty:data', handleData);
      if (ptyId) {
        window.electron.send('pty:kill', ptyId);
      }
    };
  }, [ptyId]);

  const handleInput = (command: string) => {
    if (ptyId) {
      window.electron.send('pty:write', ptyId, command + '\n');
    }
  };

  return (
    <div>
      <pre>{output}</pre>
      <input onKeyDown={(e) => e.key === 'Enter' && handleInput(e.currentTarget.value)} />
    </div>
  );
}

// ==================================================
// Error Handling Best Practices
// ==================================================

async function errorHandlingExample() {
  try {
    // Always wrap IPC calls in try-catch
    const result = await window.electron.invoke('fs:readFile', '/nonexistent/file.txt');
    console.log(result);
  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        console.error('File not found');
      } else if (error.message.includes('EACCES')) {
        console.error('Permission denied');
      } else {
        console.error('Unknown error:', error.message);
      }
    }
  }

  // Invalid channel will throw immediately (caught at preload validation)
  try {
    // @ts-expect-error - TypeScript will catch this at compile time
    await window.electron.invoke('invalid:channel', 'arg');
  } catch (error) {
    console.error('Invalid channel:', error);
    // Error: Invalid IPC channel: invalid:channel. Channel not in whitelist.
  }
}

export {
  spawnPtyExample,
  fileSystemExample,
  storageExample,
  appExample,
  eventListenerExample,
  TerminalComponent,
  errorHandlingExample,
};
