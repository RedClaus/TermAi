import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

// Whitelist of valid IPC channels for security
const VALID_CHANNELS = {
  // PTY channels
  'pty:spawn': true,
  'pty:write': true,
  'pty:resize': true,
  'pty:kill': true,
  'pty:data': true,
  'pty:exit': true,

  // File system channels
  'fs:readDir': true,
  'fs:readFile': true,
  'fs:writeFile': true,
  'fs:exists': true,
  'fs:stat': true,
  'fs:mkdir': true,

  // Storage channels
  'storage:get': true,
  'storage:set': true,
  'storage:remove': true,
  'storage:clear': true,

  // App channels
  'app:getVersion': true,
  'app:getPlatform': true,
  'app:quit': true,
} as const;

type ValidChannel = keyof typeof VALID_CHANNELS;

/**
 * Validates if a channel is in the whitelist
 * @throws Error if channel is invalid
 */
function validateChannel(channel: string): asserts channel is ValidChannel {
  if (!(channel in VALID_CHANNELS)) {
    throw new Error(`Invalid IPC channel: ${channel}. Channel not in whitelist.`);
  }
}

/**
 * Electron API exposed to renderer process
 */
const electronAPI = {
  /**
   * Send a message and wait for a response (request/response pattern)
   * @param channel - IPC channel name
   * @param args - Arguments to send
   * @returns Promise with the response
   */
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    validateChannel(channel);
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen to events from the main process
   * @param channel - IPC channel name
   * @param callback - Function to call when event is received
   */
  on: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void => {
    validateChannel(channel);

    // Wrap callback to remove the event object for cleaner API
    const wrappedCallback = (_event: IpcRendererEvent, ...args: unknown[]) => {
      callback(_event, ...args);
    };

    ipcRenderer.on(channel, wrappedCallback);
  },

  /**
   * Remove event listener
   * @param channel - IPC channel name
   * @param callback - The same callback function passed to 'on'
   */
  off: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void => {
    validateChannel(channel);
    ipcRenderer.removeListener(channel, callback);
  },

  /**
   * Send a fire-and-forget message (no response expected)
   * @param channel - IPC channel name
   * @param args - Arguments to send
   */
  send: (channel: string, ...args: unknown[]): void => {
    validateChannel(channel);
    ipcRenderer.send(channel, ...args);
  },

  /**
   * Listen to an event once (automatically removes listener after first call)
   * @param channel - IPC channel name
   * @param callback - Function to call when event is received
   */
  once: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void => {
    validateChannel(channel);

    const wrappedCallback = (_event: IpcRendererEvent, ...args: unknown[]) => {
      callback(_event, ...args);
    };

    ipcRenderer.once(channel, wrappedCallback);
  },

  /**
   * Remove all listeners for a channel
   * @param channel - IPC channel name
   */
  removeAllListeners: (channel: string): void => {
    validateChannel(channel);
    ipcRenderer.removeAllListeners(channel);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electron', electronAPI);

// Export types for TypeScript support in renderer
export type ElectronAPI = typeof electronAPI;

// Declare global window interface for TypeScript
// NOTE: Using optional (?) to match the ui-core package declaration
declare global {
  interface Window {
    electron?: ElectronAPI;
    electronAPI?: ElectronAPI;
  }
}
