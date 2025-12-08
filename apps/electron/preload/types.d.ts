import type { IpcRendererEvent } from 'electron';

/**
 * Valid IPC channels for secure communication
 */
export type ValidChannel =
  // PTY channels
  | 'pty:spawn'
  | 'pty:write'
  | 'pty:resize'
  | 'pty:kill'
  | 'pty:data'
  | 'pty:exit'
  // File system channels
  | 'fs:readDir'
  | 'fs:readFile'
  | 'fs:writeFile'
  | 'fs:exists'
  | 'fs:stat'
  | 'fs:mkdir'
  // Storage channels
  | 'storage:get'
  | 'storage:set'
  | 'storage:remove'
  | 'storage:clear'
  // App channels
  | 'app:getVersion'
  | 'app:getPlatform'
  | 'app:quit';

/**
 * Electron API exposed to renderer process via contextBridge
 */
export interface ElectronAPI {
  /**
   * Send a message and wait for a response (request/response pattern)
   */
  invoke: <T = unknown>(channel: ValidChannel, ...args: unknown[]) => Promise<T>;

  /**
   * Listen to events from the main process
   */
  on: (channel: ValidChannel, callback: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;

  /**
   * Remove event listener
   */
  off: (channel: ValidChannel, callback: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;

  /**
   * Send a fire-and-forget message (no response expected)
   */
  send: (channel: ValidChannel, ...args: unknown[]) => void;

  /**
   * Listen to an event once (automatically removes listener after first call)
   */
  once: (channel: ValidChannel, callback: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;

  /**
   * Remove all listeners for a channel
   */
  removeAllListeners: (channel: ValidChannel) => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
    electronAPI?: ElectronAPI;
  }
}
