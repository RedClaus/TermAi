/**
 * ApiTransport
 *
 * Abstracts API calls between Electron IPC and HTTP fetch.
 * Automatically detects the runtime environment and uses the appropriate transport.
 * Includes WebSocket support for PTY streaming operations in web mode.
 */

import type { APIResponse, PTYSpawnOptions, PTYSession } from '@termai/shared-types';

/**
 * Electron API interface (if available on window object)
 */
interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
    electronAPI?: ElectronAPI;
  }
}

/**
 * PTY WebSocket message types
 */
export interface PTYWebSocketMessage {
  type: 'spawn' | 'input' | 'resize' | 'kill' | 'output' | 'exit' | 'error' | 'spawned';
  sessionId?: string;
  data?: unknown;
  exitCode?: number;
  error?: string;
}

/**
 * PTY stream callbacks
 */
export interface PTYStreamCallbacks {
  onData?: (data: string) => void;
  onExit?: (exitCode: number) => void;
  onError?: (error: string) => void;
}

/**
 * WebSocket connection state
 */
type WSState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * PTY session connection info
 */
interface PTYConnection {
  sessionId: string;
  callbacks: PTYStreamCallbacks;
  active: boolean;
}

/**
 * Channel to HTTP endpoint mappings for web mode
 */
const CHANNEL_TO_ENDPOINT: Record<string, { method: string; path: string }> = {
  // File System operations
  'fs:readDir': { method: 'POST', path: '/api/fs/list' },
  'fs:readFile': { method: 'POST', path: '/api/fs/read' },
  'fs:writeFile': { method: 'POST', path: '/api/fs/write' },
  'fs:mkdir': { method: 'POST', path: '/api/fs/mkdir' },
  'fs:getDrives': { method: 'GET', path: '/api/fs/drives' },

  // PTY operations (REST + SSE endpoints from server/routes/pty.js)
  'pty:spawn': { method: 'POST', path: '/api/pty/spawn' },
  'pty:write': { method: 'POST', path: '/api/pty/write' },
  'pty:resize': { method: 'POST', path: '/api/pty/resize' },
  'pty:kill': { method: 'POST', path: '/api/pty/kill' },

  // LLM operations
  'llm:chat': { method: 'POST', path: '/api/llm/chat' },
  'llm:hasKey': { method: 'POST', path: '/api/llm/has-key' },
  'llm:setKey': { method: 'POST', path: '/api/llm/set-key' },
  'llm:getModels': { method: 'POST', path: '/api/llm/models' },

  // Knowledge operations
  'knowledge:getSkills': { method: 'GET', path: '/api/knowledge/skills' },
  'knowledge:addSkill': { method: 'POST', path: '/api/knowledge/skills' },
  'knowledge:deleteSkill': { method: 'DELETE', path: '/api/knowledge/skills' },

  // Flow operations
  'flows:list': { method: 'GET', path: '/api/flows' },
  'flows:get': { method: 'GET', path: '/api/flows/:id' },
  'flows:save': { method: 'POST', path: '/api/flows' },
  'flows:delete': { method: 'DELETE', path: '/api/flows/:id' },
  'flows:execute': { method: 'POST', path: '/api/flows/:id/execute' },

  // Context operations (RAPID)
  'context:gather': { method: 'POST', path: '/api/context/gather' },
  'context:classify': { method: 'POST', path: '/api/context/classify' },
  'context:strategy': { method: 'POST', path: '/api/context/strategy' },
  'context:recordCommand': { method: 'POST', path: '/api/context/record-command' },

  // Session operations
  'session:getCwd': { method: 'GET', path: '/api/initial-cwd' },
  'session:setCwd': { method: 'POST', path: '/api/cwd' },
};

/**
 * ApiTransport class
 *
 * Provides a unified API for making calls that works in both Electron and Web contexts.
 * Includes WebSocket support for PTY streaming operations.
 */
export class ApiTransport {
  private baseUrl: string;
  private isElectron: boolean;

  // WebSocket for PTY operations (web mode only)
  private ws: WebSocket | null = null;
  private wsState: WSState = 'disconnected';
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsReconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_MS = 2000;

  // PTY session connections
  private ptyConnections: Map<string, PTYConnection> = new Map();

  // Message queue for when WebSocket is not ready
  private messageQueue: PTYWebSocketMessage[] = [];

  /**
   * Creates a new ApiTransport instance
   *
   * @param baseUrl - Base URL for HTTP requests (used in web mode). Defaults to http://localhost:3001
   */
  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.isElectron = this.detectElectron();
  }

  /**
   * Detects if running in Electron environment
   */
  private detectElectron(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return !!(window.electron || window.electronAPI);
  }

  /**
   * Gets the Electron API if available
   */
  private getElectronAPI(): ElectronAPI | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.electron || window.electronAPI || null;
  }

  /**
   * Invokes an API call
   *
   * @param channel - The IPC channel name or operation identifier
   * @param args - Arguments to pass to the API
   * @returns Promise resolving to the API response
   */
  async invoke<T>(channel: string, ...args: unknown[]): Promise<APIResponse<T>> {
    try {
      if (this.isElectron) {
        return await this.invokeElectron<T>(channel, ...args);
      } else {
        return await this.invokeWeb<T>(channel, ...args);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Invokes an API call using Electron IPC
   */
  private async invokeElectron<T>(channel: string, ...args: unknown[]): Promise<APIResponse<T>> {
    const electronAPI = this.getElectronAPI();

    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      const result = await electronAPI.invoke(channel, ...args);

      // If result is already an APIResponse, return it
      if (this.isAPIResponse(result)) {
        return result as APIResponse<T>;
      }

      // Otherwise, wrap it in an APIResponse
      return {
        success: true,
        data: result as T,
      };
    } catch (error) {
      throw new Error(`Electron IPC error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Invokes an API call using HTTP fetch
   */
  private async invokeWeb<T>(channel: string, ...args: unknown[]): Promise<APIResponse<T>> {
    const endpoint = CHANNEL_TO_ENDPOINT[channel];

    if (!endpoint) {
      throw new Error(`No HTTP endpoint mapped for channel: ${channel}`);
    }

    const { method, path } = endpoint;

    // Replace path parameters (e.g., :id) with actual values from args
    let finalPath = path;
    const pathParams: Record<string, unknown> = {};
    const bodyData: Record<string, unknown> = {};

    // First arg is typically the main parameter object
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      const params = args[0] as Record<string, unknown>;

      // Extract path parameters
      const pathParamMatches = path.match(/:(\w+)/g);
      if (pathParamMatches) {
        pathParamMatches.forEach(match => {
          const paramName = match.substring(1); // Remove ':'
          if (paramName in params) {
            pathParams[paramName] = params[paramName];
            finalPath = finalPath.replace(match, String(params[paramName]));
            delete params[paramName]; // Remove from params so it's not sent in body
          }
        });
      }

      // Remaining params go in body (for POST/PUT) or query string (for GET/DELETE)
      Object.assign(bodyData, params);
    }

    const url = `${this.baseUrl}${finalPath}`;

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      // Add body for POST/PUT requests
      if (method === 'POST' || method === 'PUT') {
        fetchOptions.body = JSON.stringify(bodyData);
      } else if (method === 'GET' && Object.keys(bodyData).length > 0) {
        // Add query parameters for GET requests
        const queryParams = new URLSearchParams(
          Object.entries(bodyData).reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
          }, {} as Record<string, string>)
        );
        const urlWithQuery = `${url}?${queryParams.toString()}`;
        const response = await fetch(urlWithQuery, fetchOptions);
        return await this.handleResponse<T>(response);
      }

      const response = await fetch(url, fetchOptions);
      return await this.handleResponse<T>(response);
    } catch (error) {
      throw new Error(`HTTP fetch error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handles HTTP response and converts to APIResponse
   */
  private async handleResponse<T>(response: Response): Promise<APIResponse<T>> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    try {
      const data = await response.json();

      // If response is already an APIResponse, return it
      if (this.isAPIResponse(data)) {
        return data as APIResponse<T>;
      }

      // Otherwise, wrap it
      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Type guard to check if a value is an APIResponse
   */
  private isAPIResponse(value: unknown): value is APIResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const obj = value as Record<string, unknown>;
    return 'success' in obj && typeof obj.success === 'boolean';
  }

  /**
   * Gets the current transport type
   */
  getTransportType(): 'electron' | 'web' {
    return this.isElectron ? 'electron' : 'web';
  }

  /**
   * Gets the base URL (for web mode)
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Sets a new base URL (for web mode)
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ============================================================================
  // PTY Operations with WebSocket Support
  // ============================================================================

  /**
   * Creates a PTY session
   *
   * @param options - PTY spawn options
   * @returns Promise resolving to PTYSession
   */
  async createPTYSession(options: PTYSpawnOptions): Promise<APIResponse<PTYSession>> {
    if (this.isElectron) {
      return await this.invoke<PTYSession>('pty:spawn', options);
    } else {
      // Web mode: Use WebSocket for spawning
      return await this.createPTYSessionWeb(options);
    }
  }

  /**
   * Creates a PTY session in web mode using WebSocket
   */
  private async createPTYSessionWeb(options: PTYSpawnOptions): Promise<APIResponse<PTYSession>> {
    try {
      // Ensure WebSocket is connected
      await this.ensureWebSocketConnected();

      // Send spawn message
      const message: PTYWebSocketMessage = {
        type: 'spawn',
        data: options,
      };

      // Wait for spawned response
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            success: false,
            error: 'PTY spawn timeout',
          });
        }, 10000);

        const handleMessage = (event: MessageEvent) => {
          try {
            const msg: PTYWebSocketMessage = JSON.parse(event.data);
            if (msg.type === 'spawned') {
              clearTimeout(timeout);
              this.ws?.removeEventListener('message', handleMessage);
              resolve({
                success: true,
                data: msg.data as PTYSession,
              });
            } else if (msg.type === 'error' && !msg.sessionId) {
              clearTimeout(timeout);
              this.ws?.removeEventListener('message', handleMessage);
              resolve({
                success: false,
                error: msg.error || 'Failed to spawn PTY',
              });
            }
          } catch (err) {
            // Ignore parse errors
          }
        };

        this.ws?.addEventListener('message', handleMessage);
        this.sendWebSocketMessage(message);
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PTY session',
      };
    }
  }

  /**
   * Connects to a PTY session stream
   *
   * @param sessionId - The PTY session ID
   * @param callbacks - Callbacks for stream events
   */
  connectPTYStream(sessionId: string, callbacks: PTYStreamCallbacks): void {
    if (this.isElectron) {
      // Electron mode: Use IPC events (handled by Electron main process)
      // The Electron side should emit 'pty:data', 'pty:exit', 'pty:error' events
      // which can be listened to via window.electron.on() or similar
      console.warn('[ApiTransport] Electron PTY streaming should be handled via IPC events');
    } else {
      // Web mode: Register callbacks for this session
      this.ptyConnections.set(sessionId, {
        sessionId,
        callbacks,
        active: true,
      });

      // Ensure WebSocket is connected
      this.ensureWebSocketConnected().catch(console.error);
    }
  }

  /**
   * Disconnects from a PTY session stream
   *
   * @param sessionId - The PTY session ID
   */
  disconnectPTYStream(sessionId: string): void {
    const connection = this.ptyConnections.get(sessionId);
    if (connection) {
      connection.active = false;
      this.ptyConnections.delete(sessionId);
    }
  }

  /**
   * Sends input to a PTY session
   *
   * @param sessionId - The PTY session ID
   * @param data - The input data to send
   */
  async sendPTYInput(sessionId: string, data: string): Promise<void> {
    if (this.isElectron) {
      await this.invoke('pty:write', { sessionId, data });
    } else {
      const message: PTYWebSocketMessage = {
        type: 'input',
        sessionId,
        data,
      };
      this.sendWebSocketMessage(message);
    }
  }

  /**
   * Resizes a PTY session
   *
   * @param sessionId - The PTY session ID
   * @param cols - Number of columns
   * @param rows - Number of rows
   */
  async resizePTY(sessionId: string, cols: number, rows: number): Promise<void> {
    if (this.isElectron) {
      await this.invoke('pty:resize', { sessionId, cols, rows });
    } else {
      const message: PTYWebSocketMessage = {
        type: 'resize',
        sessionId,
        data: { cols, rows },
      };
      this.sendWebSocketMessage(message);
    }
  }

  /**
   * Kills a PTY session
   *
   * @param sessionId - The PTY session ID
   */
  async killPTY(sessionId: string): Promise<void> {
    if (this.isElectron) {
      await this.invoke('pty:kill', { sessionId });
    } else {
      const message: PTYWebSocketMessage = {
        type: 'kill',
        sessionId,
      };
      this.sendWebSocketMessage(message);

      // Clean up connection
      this.disconnectPTYStream(sessionId);
    }
  }

  // ============================================================================
  // WebSocket Management (Private)
  // ============================================================================

  /**
   * Gets the WebSocket URL from the base URL
   */
  private getWebSocketUrl(): string {
    const wsProtocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const urlWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${urlWithoutProtocol}/pty`;
  }

  /**
   * Ensures WebSocket is connected, connects if needed
   */
  private async ensureWebSocketConnected(): Promise<void> {
    if (this.wsState === 'connected') {
      return;
    }

    if (this.wsState === 'connecting') {
      // Wait for connection to complete
      return await new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.wsState === 'connected') {
            clearInterval(checkInterval);
            resolve();
          } else if (this.wsState === 'disconnected') {
            clearInterval(checkInterval);
            reject(new Error('WebSocket connection failed'));
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
      });
    }

    return await this.connectWebSocket();
  }

  /**
   * Connects the WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    if (this.ws && this.wsState !== 'disconnected') {
      return;
    }

    return await new Promise((resolve, reject) => {
      try {
        this.wsState = 'connecting';
        const wsUrl = this.getWebSocketUrl();
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[ApiTransport] WebSocket connected');
          this.wsState = 'connected';
          this.wsReconnectAttempts = 0;

          // Send queued messages
          this.flushMessageQueue();

          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleWebSocketMessage(event);
        };

        this.ws.onerror = (error) => {
          console.error('[ApiTransport] WebSocket error:', error);
          if (this.wsState === 'connecting') {
            reject(new Error('Failed to connect WebSocket'));
          }
        };

        this.ws.onclose = () => {
          console.log('[ApiTransport] WebSocket closed');
          this.wsState = 'disconnected';
          this.ws = null;

          // Attempt reconnection if we have active connections
          if (this.ptyConnections.size > 0 && this.wsReconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        this.wsState = 'disconnected';
        reject(error);
      }
    });
  }

  /**
   * Handles incoming WebSocket messages
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message: PTYWebSocketMessage = JSON.parse(event.data);

      if (!message.sessionId) {
        // Non-session specific message (like spawned response)
        return;
      }

      const connection = this.ptyConnections.get(message.sessionId);
      if (!connection || !connection.active) {
        return;
      }

      switch (message.type) {
        case 'output':
          if (connection.callbacks.onData && typeof message.data === 'string') {
            connection.callbacks.onData(message.data);
          }
          break;

        case 'exit':
          if (connection.callbacks.onExit && typeof message.exitCode === 'number') {
            connection.callbacks.onExit(message.exitCode);
          }
          // Clean up connection
          this.disconnectPTYStream(message.sessionId);
          break;

        case 'error':
          if (connection.callbacks.onError && typeof message.error === 'string') {
            connection.callbacks.onError(message.error);
          }
          break;
      }
    } catch (error) {
      console.error('[ApiTransport] Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Sends a message over WebSocket
   */
  private sendWebSocketMessage(message: PTYWebSocketMessage): void {
    if (this.ws && this.wsState === 'connected') {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[ApiTransport] Failed to send WebSocket message:', error);
        // Queue message for retry
        this.messageQueue.push(message);
      }
    } else {
      // Queue message until connected
      this.messageQueue.push(message);
    }
  }

  /**
   * Flushes the message queue
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws && this.wsState === 'connected') {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendWebSocketMessage(message);
      }
    }
  }

  /**
   * Schedules a WebSocket reconnection
   */
  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) {
      return;
    }

    this.wsReconnectAttempts++;
    this.wsState = 'reconnecting';

    console.log(`[ApiTransport] Scheduling WebSocket reconnect (attempt ${this.wsReconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket().catch((error) => {
        console.error('[ApiTransport] Reconnection failed:', error);
        this.wsState = 'disconnected';

        // Schedule another reconnect if we haven't exceeded attempts
        if (this.wsReconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.scheduleReconnect();
        } else {
          console.error('[ApiTransport] Max reconnection attempts reached');
          // Notify all active connections of the error
          for (const connection of this.ptyConnections.values()) {
            if (connection.callbacks.onError) {
              connection.callbacks.onError('WebSocket connection lost');
            }
          }
        }
      });
    }, this.RECONNECT_DELAY_MS);
  }

  /**
   * Closes the WebSocket connection
   */
  closeWebSocket(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.wsState = 'disconnected';
    this.wsReconnectAttempts = 0;
    this.messageQueue = [];
  }

  /**
   * Cleanup method to be called when transport is no longer needed
   */
  destroy(): void {
    this.closeWebSocket();
    this.ptyConnections.clear();
  }
}

/**
 * Default export for convenience
 */
export default ApiTransport;
