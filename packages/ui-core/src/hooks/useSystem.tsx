'use client';

/**
 * useSystem - Universal Bridge pattern for TermAI
 *
 * Detects runtime environment (Electron vs Web) and provides identical APIs
 * that work seamlessly in both environments.
 *
 * Usage:
 *   const { isElectron, platform, pty, fs, events, storage } = useSystem();
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type {
  PTYSpawnOptions,
  PTYResizeOptions,
  FileInfo,
} from '@termai/shared-types';
import { StorageTransport } from '../transport/StorageTransport.js';
import { EventTransport } from '../transport/EventTransport.js';
import { ApiTransport } from '../transport/ApiTransport.js';

// ============================================================================
// Types
// ============================================================================

type Platform = 'darwin' | 'win32' | 'linux' | 'browser';

interface PTYTransport {
  spawn(options: PTYSpawnOptions): Promise<{ id: string; pid: number }>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, options: PTYResizeOptions): Promise<void>;
  kill(sessionId: string): Promise<void>;
  onData(sessionId: string, callback: (data: string) => void): () => void;
  onExit(sessionId: string, callback: (exitCode: number) => void): () => void;
}

interface FSTransport {
  readDir(path: string): Promise<FileInfo[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileInfo>;
}

interface SystemContextValue {
  isElectron: boolean;
  platform: Platform;
  pty: PTYTransport;
  fs: FSTransport;
  events: EventTransport;
  storage: StorageTransport;
}

// ============================================================================
// Environment Detection
// ============================================================================

function isElectronEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('electron' in window || 'electronAPI' in window)
  );
}

function detectPlatform(): Platform {
  if (typeof window === 'undefined') {
    return 'browser';
  }

  if (isElectronEnvironment()) {
    // In Electron, get platform from exposed API
    const electronPlatform = (window as any).electron?.platform || (window as any).electronAPI?.platform;
    if (
      electronPlatform === 'darwin' ||
      electronPlatform === 'win32' ||
      electronPlatform === 'linux'
    ) {
      return electronPlatform;
    }
  }

  // Fallback: detect from user agent
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'win32';
  if (ua.includes('linux')) return 'linux';

  return 'browser';
}

// ============================================================================
// PTY Transport Implementation
// ============================================================================

/**
 * SSE connection for PTY streaming
 */
interface SSEConnection {
  eventSource: EventSource;
  dataCallbacks: Set<(data: string) => void>;
  exitCallbacks: Set<(exitCode: number) => void>;
}

class PTYTransportImpl implements PTYTransport {
  private sseConnections: Map<string, SSEConnection> = new Map();
  private baseUrl: string;

  constructor(private api: ApiTransport, private events: EventTransport) {
    this.baseUrl = api.getBaseUrl();
  }

  async spawn(options: PTYSpawnOptions): Promise<{ id: string; pid: number }> {
    // Generate sessionId if not provided
    const sessionId = (options as any).sessionId || `pty-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const spawnOptions = { ...options, sessionId };

    const result = await this.api.invoke<{ sessionId: string; pid: number }>('pty:spawn', spawnOptions);
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to spawn PTY');
    }

    // In web mode, we need to connect to SSE after spawning
    if (this.api.getTransportType() === 'web') {
      this.connectSSE(result.data.sessionId);
    }

    return { id: result.data.sessionId, pid: result.data.pid };
  }

  async write(sessionId: string, data: string): Promise<void> {
    const result = await this.api.invoke('pty:write', { sessionId, data });
    if (!result.success) {
      throw new Error(result.error || 'Failed to write to PTY');
    }
  }

  async resize(sessionId: string, options: PTYResizeOptions): Promise<void> {
    const result = await this.api.invoke('pty:resize', { sessionId, ...options });
    if (!result.success) {
      throw new Error(result.error || 'Failed to resize PTY');
    }
  }

  async kill(sessionId: string): Promise<void> {
    const result = await this.api.invoke('pty:kill', { sessionId });
    if (!result.success) {
      throw new Error(result.error || 'Failed to kill PTY');
    }

    // Cleanup SSE connection
    this.disconnectSSE(sessionId);
  }

  onData(sessionId: string, callback: (data: string) => void): () => void {
    // In web mode, use SSE; in Electron mode, use EventTransport
    if (this.api.getTransportType() === 'web') {
      const connection = this.sseConnections.get(sessionId);
      if (connection) {
        connection.dataCallbacks.add(callback);
      } else {
        // Connection not yet established, queue the callback
        // and connect if needed
        this.connectSSE(sessionId);
        const newConnection = this.sseConnections.get(sessionId);
        if (newConnection) {
          newConnection.dataCallbacks.add(callback);
        }
      }
      return () => {
        const conn = this.sseConnections.get(sessionId);
        if (conn) {
          conn.dataCallbacks.delete(callback);
        }
      };
    } else {
      // Electron mode: use EventTransport
      const handler = (eventData: { sessionId: string; data: string }) => {
        if (eventData.sessionId === sessionId) {
          callback(eventData.data);
        }
      };
      this.events.on('pty:data', handler);
      return () => this.events.off('pty:data', handler);
    }
  }

  onExit(sessionId: string, callback: (exitCode: number) => void): () => void {
    // In web mode, use SSE; in Electron mode, use EventTransport
    if (this.api.getTransportType() === 'web') {
      const connection = this.sseConnections.get(sessionId);
      if (connection) {
        connection.exitCallbacks.add(callback);
      } else {
        // Connection not yet established
        this.connectSSE(sessionId);
        const newConnection = this.sseConnections.get(sessionId);
        if (newConnection) {
          newConnection.exitCallbacks.add(callback);
        }
      }
      return () => {
        const conn = this.sseConnections.get(sessionId);
        if (conn) {
          conn.exitCallbacks.delete(callback);
        }
      };
    } else {
      // Electron mode: use EventTransport
      const handler = (eventData: { sessionId: string; exitCode: number }) => {
        if (eventData.sessionId === sessionId) {
          callback(eventData.exitCode);
        }
      };
      this.events.on('pty:exit', handler);
      return () => this.events.off('pty:exit', handler);
    }
  }

  /**
   * Connect to SSE endpoint for PTY streaming (web mode only)
   */
  private connectSSE(sessionId: string): void {
    if (this.sseConnections.has(sessionId)) {
      return; // Already connected
    }

    const sseUrl = `${this.baseUrl}/api/pty/output/${sessionId}`;
    const eventSource = new EventSource(sseUrl);

    const connection: SSEConnection = {
      eventSource,
      dataCallbacks: new Set(),
      exitCallbacks: new Set(),
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'output':
            for (const cb of connection.dataCallbacks) {
              cb(message.data);
            }
            break;

          case 'exit':
            for (const cb of connection.exitCallbacks) {
              cb(message.exitCode ?? 0);
            }
            // Cleanup after exit
            this.disconnectSSE(sessionId);
            break;

          case 'connected':
            console.log(`[PTYTransport] SSE connected for session ${sessionId}`);
            break;

          case 'heartbeat':
            // Ignore heartbeat messages
            break;

          case 'error':
            console.error(`[PTYTransport] SSE error for session ${sessionId}:`, message.error);
            break;
        }
      } catch (err) {
        console.error('[PTYTransport] Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error(`[PTYTransport] SSE connection error for session ${sessionId}:`, err);
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (this.sseConnections.has(sessionId)) {
          this.disconnectSSE(sessionId);
          this.connectSSE(sessionId);
        }
      }, 2000);
    };

    this.sseConnections.set(sessionId, connection);
  }

  /**
   * Disconnect SSE for a session
   */
  private disconnectSSE(sessionId: string): void {
    const connection = this.sseConnections.get(sessionId);
    if (connection) {
      connection.eventSource.close();
      connection.dataCallbacks.clear();
      connection.exitCallbacks.clear();
      this.sseConnections.delete(sessionId);
      console.log(`[PTYTransport] SSE disconnected for session ${sessionId}`);
    }
  }
}

// ============================================================================
// FS Transport Implementation
// ============================================================================

class FSTransportImpl implements FSTransport {
  constructor(private api: ApiTransport) {}

  async readDir(path: string): Promise<FileInfo[]> {
    const result = await this.api.invoke<FileInfo[]>('fs:readDir', { path });
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to read directory');
    }
    return result.data;
  }

  async readFile(path: string): Promise<string> {
    const result = await this.api.invoke<string>('fs:readFile', { path });
    if (!result.success || result.data === undefined) {
      throw new Error(result.error || 'Failed to read file');
    }
    return result.data;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const result = await this.api.invoke('fs:writeFile', { path, content });
    if (!result.success) {
      throw new Error(result.error || 'Failed to write file');
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<FileInfo> {
    const result = await this.api.invoke<FileInfo>('fs:stat', { path });
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to stat file');
    }
    return result.data;
  }
}

// ============================================================================
// React Context
// ============================================================================

const SystemContext = createContext<SystemContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface SystemProviderProps {
  children: ReactNode;
  /** Base URL for API calls in web mode (defaults to http://localhost:3001) */
  apiBaseUrl?: string;
}

export function SystemProvider({ children, apiBaseUrl }: SystemProviderProps) {
  const contextValue = useMemo<SystemContextValue>(() => {
    const isElectron = isElectronEnvironment();
    const platform = detectPlatform();

    // Initialize transports
    const api = new ApiTransport(apiBaseUrl);
    const events = new EventTransport();
    const storage = new StorageTransport();

    // Create high-level APIs
    const pty = new PTYTransportImpl(api, events);
    const fs = new FSTransportImpl(api);

    return {
      isElectron,
      platform,
      pty,
      fs,
      events,
      storage,
    };
  }, [apiBaseUrl]);

  return (
    <SystemContext.Provider value={contextValue}>
      {children}
    </SystemContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useSystem(): SystemContextValue {
  const context = useContext(SystemContext);

  if (!context) {
    throw new Error(
      'useSystem must be used within a SystemProvider. ' +
        'Wrap your app with <SystemProvider> to use this hook.'
    );
  }

  return context;
}
