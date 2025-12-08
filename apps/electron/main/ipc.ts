/**
 * IPC Handler Registration
 *
 * This module registers all IPC handlers for communication between
 * the main process and renderer process.
 */

import { ipcMain, dialog } from 'electron';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PTYManager } from '@termai/pty-service';
import type {
  PTYSpawnOptions,
  PTYResizeOptions,
  PTYSession,
} from '@termai/shared-types';
import { getMainWindow } from './index';

// Simple in-memory storage (electron-store can be added later)
const storage = new Map<string, unknown>();

/**
 * Set up all IPC handlers
 */
export function setupIpcHandlers(ptyManager: PTYManager): void {
  console.log('[IPC] Setting up handlers');

  // ==================== PTY Handlers ====================

  /**
   * Spawn a new PTY session
   */
  ipcMain.handle(
    'pty:spawn',
    async (
      _event,
      options: PTYSpawnOptions = {}
    ): Promise<PTYSession> => {
      console.log('[IPC] pty:spawn', options);

      try {
        const session = ptyManager.spawn(options);

        // Set up data handler - forward PTY output to renderer
        ptyManager.onData(session.id, (data: string) => {
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pty:data', {
              sessionId: session.id,
              data,
            });
          }
        });

        // Set up exit handler
        ptyManager.onExit(session.id, (exitCode: number) => {
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pty:exit', {
              sessionId: session.id,
              exitCode,
            });
          }
        });

        console.log('[IPC] PTY session spawned:', session.id);
        return session;
      } catch (error) {
        console.error('[IPC] Failed to spawn PTY:', error);
        throw error;
      }
    }
  );

  /**
   * Write data to PTY session
   */
  ipcMain.handle(
    'pty:write',
    async (_event, sessionId: string, data: string): Promise<void> => {
      try {
        ptyManager.write(sessionId, data);
      } catch (error) {
        console.error(`[IPC] Failed to write to PTY ${sessionId}:`, error);
        throw error;
      }
    }
  );

  /**
   * Resize PTY session
   */
  ipcMain.handle(
    'pty:resize',
    async (
      _event,
      sessionId: string,
      options: PTYResizeOptions
    ): Promise<void> => {
      try {
        ptyManager.resize(sessionId, options);
        console.log(`[IPC] PTY ${sessionId} resized to ${options.cols}x${options.rows}`);
      } catch (error) {
        console.error(`[IPC] Failed to resize PTY ${sessionId}:`, error);
        throw error;
      }
    }
  );

  /**
   * Kill PTY session
   */
  ipcMain.handle(
    'pty:kill',
    async (_event, sessionId: string): Promise<void> => {
      try {
        ptyManager.kill(sessionId);
        console.log(`[IPC] PTY ${sessionId} killed`);
      } catch (error) {
        console.error(`[IPC] Failed to kill PTY ${sessionId}:`, error);
        throw error;
      }
    }
  );

  /**
   * Get all PTY sessions
   */
  ipcMain.handle('pty:list', async (): Promise<PTYSession[]> => {
    return ptyManager.getAllSessions();
  });

  // ==================== File System Handlers ====================

  /**
   * Read directory contents
   */
  ipcMain.handle(
    'fs:readDir',
    async (_event, path: string): Promise<string[]> => {
      try {
        // Resolve ~ to home directory
        const resolvedPath = path.startsWith('~')
          ? join(homedir(), path.slice(1))
          : path;

        const entries = await readdir(resolvedPath, { withFileTypes: true });
        return entries.map((entry) => {
          const name = entry.name;
          return entry.isDirectory() ? `${name}/` : name;
        });
      } catch (error) {
        console.error(`[IPC] Failed to read directory ${path}:`, error);
        throw error;
      }
    }
  );

  /**
   * Read file contents
   */
  ipcMain.handle(
    'fs:readFile',
    async (_event, path: string): Promise<string> => {
      try {
        // Resolve ~ to home directory
        const resolvedPath = path.startsWith('~')
          ? join(homedir(), path.slice(1))
          : path;

        const contents = await readFile(resolvedPath, 'utf-8');
        return contents;
      } catch (error) {
        console.error(`[IPC] Failed to read file ${path}:`, error);
        throw error;
      }
    }
  );

  /**
   * Write file contents
   */
  ipcMain.handle(
    'fs:writeFile',
    async (_event, path: string, contents: string): Promise<void> => {
      try {
        // Resolve ~ to home directory
        const resolvedPath = path.startsWith('~')
          ? join(homedir(), path.slice(1))
          : path;

        await writeFile(resolvedPath, contents, 'utf-8');
        console.log(`[IPC] File written: ${path}`);
      } catch (error) {
        console.error(`[IPC] Failed to write file ${path}:`, error);
        throw error;
      }
    }
  );

  /**
   * Show open dialog
   */
  ipcMain.handle(
    'dialog:showOpen',
    async (
      _event,
      options: Electron.OpenDialogOptions
    ): Promise<Electron.OpenDialogReturnValue> => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      return dialog.showOpenDialog(mainWindow, options);
    }
  );

  /**
   * Show save dialog
   */
  ipcMain.handle(
    'dialog:showSave',
    async (
      _event,
      options: Electron.SaveDialogOptions
    ): Promise<Electron.SaveDialogReturnValue> => {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      return dialog.showSaveDialog(mainWindow, options);
    }
  );

  // ==================== Storage Handlers ====================

  /**
   * Get value from storage
   */
  ipcMain.handle(
    'storage:get',
    async <T>(_event: unknown, key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }
  );

  /**
   * Set value in storage
   */
  ipcMain.handle(
    'storage:set',
    async (_event, key: string, value: unknown): Promise<void> => {
      storage.set(key, value);
      console.log(`[IPC] Storage set: ${key}`);
    }
  );

  /**
   * Remove value from storage
   */
  ipcMain.handle('storage:remove', async (_event, key: string): Promise<void> => {
    storage.delete(key);
    console.log(`[IPC] Storage removed: ${key}`);
  });

  /**
   * Clear all storage
   */
  ipcMain.handle('storage:clear', async (): Promise<void> => {
    storage.clear();
    console.log('[IPC] Storage cleared');
  });

  /**
   * Get all storage keys
   */
  ipcMain.handle('storage:keys', async (): Promise<string[]> => {
    return Array.from(storage.keys());
  });

  // ==================== App Handlers ====================

  /**
   * Get app version
   */
  ipcMain.handle('app:getVersion', async (): Promise<string> => {
    const { app } = await import('electron');
    return app.getVersion();
  });

  /**
   * Get platform
   */
  ipcMain.handle('app:getPlatform', async (): Promise<string> => {
    return process.platform;
  });

  /**
   * Get home directory
   */
  ipcMain.handle('app:getHomeDir', async (): Promise<string> => {
    return homedir();
  });

  console.log('[IPC] All handlers registered');
}
