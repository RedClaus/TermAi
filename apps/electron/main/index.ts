/**
 * Electron Main Process Entry Point
 *
 * This is the main process for the TermAI Electron application.
 * It creates the main window, manages PTY sessions, and handles IPC communication.
 */

import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PTYManager } from '@termai/pty-service';
import * as pty from 'node-pty';
import { setupIpcHandlers } from './ipc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global references to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let ptyManager: PTYManager | null = null;

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      // Security: Enable context isolation
      contextIsolation: true,
      // Security: Disable node integration in renderer
      nodeIntegration: false,
      // Load preload script for IPC bridge
      preload: join(__dirname, '../preload/index.js'),
    },
    // Window appearance
    title: 'TermAI',
    backgroundColor: '#1e1e1e',
    show: false, // Don't show until ready-to-show
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    // Development: Load from Vite dev server
    const rendererPort = process.env.VITE_DEV_SERVER_PORT ?? '5173';
    mainWindow.loadURL(`http://localhost:${rendererPort}`);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production: Load from built files
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize PTY manager
 */
function initializePTY(): void {
  ptyManager = new PTYManager(pty);
  console.log('[Main] PTY Manager initialized');
}

/**
 * Application lifecycle: Ready
 */
app.whenReady().then(() => {
  console.log('[Main] App ready');

  // Initialize PTY manager
  initializePTY();

  // Set up IPC handlers
  if (ptyManager) {
    setupIpcHandlers(ptyManager);
  }

  // Create main window
  createWindow();

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Application lifecycle: All windows closed
 */
app.on('window-all-closed', () => {
  // Cleanup PTY sessions
  if (ptyManager) {
    console.log('[Main] Destroying all PTY sessions');
    ptyManager.destroyAll();
    ptyManager = null;
  }

  // Quit app (except on macOS where apps stay active until Cmd+Q)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Application lifecycle: Before quit
 */
app.on('before-quit', () => {
  console.log('[Main] App quitting');
  // Cleanup PTY sessions
  if (ptyManager) {
    ptyManager.destroyAll();
    ptyManager = null;
  }
});

/**
 * Security: Prevent navigation to external URLs
 */
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    // Allow localhost in development
    if (process.env.NODE_ENV === 'development') {
      if (parsedUrl.hostname === 'localhost') {
        return;
      }
    }

    // Block all other navigation
    event.preventDefault();
    console.warn(`[Main] Blocked navigation to: ${navigationUrl}`);
  });

  // Prevent opening new windows
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

/**
 * Export getter for main window (for IPC handlers)
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
