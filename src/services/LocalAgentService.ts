/**
 * LocalAgentService
 * 
 * Communicates with the TermAI Local Agent running on the user's machine.
 * The local agent provides:
 *   - File system access (drives, directories)
 *   - Secure local storage for API keys
 *   - Settings persistence
 * 
 * Installation:
 *   Users run the local agent on their machine:
 *     node local-agent.cjs --install   # Install as auto-start service
 *     node local-agent.cjs             # Or run manually
 */

export interface DriveEntry {
  name: string;
  path: string;
  type: 'root' | 'home' | 'drive' | 'volume' | 'mount' | 'project' | 'removable' | 'network' | 'cdrom';
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink?: boolean;
}

export interface DirectoryListing {
  path: string;
  files: FileEntry[];
  parent: string;
}

export interface AgentHealth {
  status: 'ok' | 'error';
  version: string;
  platform: string;
  hostname: string;
  configDir: string;
}

export interface AgentConfig {
  env: Record<string, string>;
  config: Record<string, unknown>;
  hasKeys: {
    gemini: boolean;
    openai: boolean;
    anthropic: boolean;
    xai: boolean;
    openrouter: boolean;
    ollama: boolean;
  };
}

export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'xai' | 'openrouter' | 'ollama';

const DEFAULT_AGENT_URL = 'http://127.0.0.1:3010';
const STORAGE_KEY = 'termai_local_agent_url';
const CONNECTION_CHECK_INTERVAL = 30000; // 30 seconds

class LocalAgentServiceClass {
  private agentUrl: string;
  private isConnected: boolean = false;
  private lastCheck: number = 0;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private cachedHealth: AgentHealth | null = null;

  constructor() {
    this.agentUrl = localStorage.getItem(STORAGE_KEY) || DEFAULT_AGENT_URL;
  }

  /**
   * Set custom agent URL (if user runs agent on different port)
   */
  setAgentUrl(url: string): void {
    this.agentUrl = url;
    localStorage.setItem(STORAGE_KEY, url);
    this.checkConnection();
  }

  /**
   * Get current agent URL
   */
  getAgentUrl(): string {
    return this.agentUrl;
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.isConnected);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of connection status change
   */
  private notifyConnectionChange(connected: boolean): void {
    if (this.isConnected !== connected) {
      this.isConnected = connected;
      this.connectionListeners.forEach(cb => cb(connected));
    }
  }

  /**
   * Check if local agent is running and accessible
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.agentUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        const data = await response.json() as AgentHealth;
        this.cachedHealth = data;
        this.notifyConnectionChange(data.status === 'ok');
        this.lastCheck = Date.now();
        return this.isConnected;
      }
    } catch {
      this.cachedHealth = null;
    }
    
    this.notifyConnectionChange(false);
    this.lastCheck = Date.now();
    return false;
  }

  /**
   * Check connection if not checked recently
   */
  async ensureConnection(): Promise<boolean> {
    if (Date.now() - this.lastCheck > CONNECTION_CHECK_INTERVAL) {
      return this.checkConnection();
    }
    return this.isConnected;
  }

  /**
   * Get connection status (cached)
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get cached health info
   */
  getCachedHealth(): AgentHealth | null {
    return this.cachedHealth;
  }

  /**
   * Get health info from local agent
   */
  async getHealth(): Promise<AgentHealth | null> {
    try {
      const response = await fetch(`${this.agentUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        const data = await response.json() as AgentHealth;
        this.cachedHealth = data;
        return data;
      }
    } catch {
      // Agent not available
    }
    return null;
  }

  /**
   * Get list of drives/volumes on user's machine
   */
  async getDrives(): Promise<DriveEntry[]> {
    const connected = await this.ensureConnection();
    if (!connected) {
      throw new Error('Local agent not connected. Please start the TermAI local agent on your machine.');
    }

    const response = await fetch(`${this.agentUrl}/drives`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch drives: ${response.statusText}`);
    }
    
    const data = await response.json() as { drives: DriveEntry[] };
    return data.drives || [];
  }

  /**
   * List directory contents on user's machine
   */
  async listDirectory(dirPath: string, showHidden = false): Promise<DirectoryListing> {
    console.log('[LocalAgentService] listDirectory called with:', dirPath);
    const connected = await this.ensureConnection();
    console.log('[LocalAgentService] ensureConnection result:', connected);
    if (!connected) {
      throw new Error('Local agent not connected. Please start the TermAI local agent on your machine.');
    }

    console.log('[LocalAgentService] Fetching from:', `${this.agentUrl}/list`);
    const response = await fetch(`${this.agentUrl}/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath, showHidden }),
      signal: AbortSignal.timeout(5000),
    });
    
    console.log('[LocalAgentService] Response status:', response.status, response.ok);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error: string }).error || `Failed to list directory: ${response.statusText}`);
    }
    
    const data = await response.json() as DirectoryListing;
    console.log('[LocalAgentService] Response data:', data);
    return data;
  }

  /**
   * Execute a shell command on the local machine
   */
  async execCommand(command: string, cwd?: string, timeout?: number): Promise<{ stdout: string; stderr: string }> {
    const connected = await this.ensureConnection();
    if (!connected) {
      throw new Error('Local agent not connected. Please start the TermAI local agent on your machine.');
    }

    const response = await fetch(`${this.agentUrl}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd, timeout }),
      signal: AbortSignal.timeout(timeout ? timeout + 1000 : 61000),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error: string }).error || `Failed to execute command: ${response.statusText}`);
    }
    
    return await response.json() as { stdout: string; stderr: string };
  }

  // ===========================================================================
  // API KEY MANAGEMENT
  // ===========================================================================

  /**
   * Get stored configuration (API keys are masked)
   */
  async getConfig(): Promise<AgentConfig | null> {
    const connected = await this.ensureConnection();
    if (!connected) {
      return null;
    }

    try {
      const response = await fetch(`${this.agentUrl}/config`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        return await response.json() as AgentConfig;
      }
    } catch {
      // Agent not available
    }
    return null;
  }

  /**
   * Check if a specific provider has an API key stored
   */
  async hasApiKey(provider: ProviderType): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) {
      return false;
    }
    return config.hasKeys[provider] || false;
  }

  /**
   * Get API key for a specific provider (full value)
   */
  async getApiKey(provider: ProviderType): Promise<string | null> {
    const connected = await this.ensureConnection();
    if (!connected) {
      return null;
    }

    try {
      const response = await fetch(`${this.agentUrl}/config/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        const data = await response.json() as { provider: string; key: string | null; hasKey: boolean };
        return data.key;
      }
    } catch {
      // Agent not available
    }
    return null;
  }

  /**
   * Save API key for a specific provider
   */
  async setApiKey(provider: ProviderType, key: string | null): Promise<boolean> {
    const connected = await this.ensureConnection();
    if (!connected) {
      throw new Error('Local agent not connected. Cannot save API key.');
    }

    try {
      const response = await fetch(`${this.agentUrl}/config/key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        return true;
      }
      
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((error as { error: string }).error);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Local agent')) {
        throw error;
      }
      throw new Error(`Failed to save API key: ${(error as Error).message}`);
    }
  }

  // ===========================================================================
  // SETTINGS MANAGEMENT
  // ===========================================================================

  /**
   * Get all settings from local agent
   */
  async getSettings(): Promise<Record<string, unknown> | null> {
    const connected = await this.ensureConnection();
    if (!connected) {
      return null;
    }

    try {
      const response = await fetch(`${this.agentUrl}/settings`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        const data = await response.json() as { settings: Record<string, unknown> };
        return data.settings;
      }
    } catch {
      // Agent not available
    }
    return null;
  }

  /**
   * Save settings to local agent
   */
  async saveSettings(settings: Record<string, unknown>): Promise<boolean> {
    const connected = await this.ensureConnection();
    if (!connected) {
      return false;
    }

    try {
      const response = await fetch(`${this.agentUrl}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
        signal: AbortSignal.timeout(3000),
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Check if we should use local agent or server-side file system
   */
  async shouldUseLocalAgent(): Promise<boolean> {
    const disabled = localStorage.getItem('termai_local_agent_disabled') === 'true';
    if (disabled) {
      return false;
    }
    return this.ensureConnection();
  }

  /**
   * Get installation instructions based on detected platform
   */
  getInstallInstructions(): { 
    platform: string; 
    steps: string[];
    downloadUrl: string;
  } {
    // Detect platform from user agent
    const ua = navigator.userAgent.toLowerCase();
    let platform = 'unknown';
    
    if (ua.includes('win')) {
      platform = 'windows';
    } else if (ua.includes('mac')) {
      platform = 'macos';
    } else if (ua.includes('linux')) {
      platform = 'linux';
    }

    const baseSteps = [
      'Download the TermAI Local Agent',
      'Extract to a folder of your choice',
    ];

    const platformSteps: Record<string, string[]> = {
      windows: [
        ...baseSteps,
        'Open Command Prompt or PowerShell',
        'Navigate to the extracted folder',
        'Run: node local-agent.cjs --install',
        'The agent will now auto-start when you log in',
      ],
      macos: [
        ...baseSteps,
        'Open Terminal',
        'Navigate to the extracted folder',
        'Run: node local-agent.cjs --install',
        'The agent will now auto-start when you log in',
      ],
      linux: [
        ...baseSteps,
        'Open Terminal',
        'Navigate to the extracted folder',
        'Run: node local-agent.cjs --install',
        'The agent will now auto-start when you log in',
      ],
      unknown: [
        'Download the TermAI Local Agent',
        'Run: node local-agent.cjs --install',
      ],
    };

    return {
      platform,
      steps: platformSteps[platform] || platformSteps.unknown,
      downloadUrl: '/downloads/termai-local-agent.zip', // TODO: Update with actual URL
    };
  }
}

// Export singleton instance
export const LocalAgentService = new LocalAgentServiceClass();
