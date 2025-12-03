/**
 * SystemInfoService
 * Detects and stores client system information on load
 * Provides OS, browser, and IP info for troubleshooting
 */

import { config } from "../config";

// ===========================================
// Types
// ===========================================

export interface BrowserInfo {
  name: string;
  version: string;
  engine: string;
}

export interface OSInfo {
  name: string;
  version: string;
  platform: string;
  architecture: string;
}

export interface NetworkInfo {
  clientIP: string;
  serverIP: string;
  connectionType: string | undefined;
}

export interface ScreenInfo {
  width: number;
  height: number;
  colorDepth: number;
  pixelRatio: number;
}

export interface SystemInfo {
  browser: BrowserInfo;
  os: OSInfo;
  serverOS: OSInfo | undefined;
  network: NetworkInfo;
  screen: ScreenInfo;
  userAgent: string;
  language: string;
  timezone: string;
  timestamp: number;
}

// ===========================================
// Detection Functions
// ===========================================

function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent;
  let name = "Unknown";
  let version = "Unknown";
  let engine = "Unknown";

  // Detect browser engine
  if (ua.includes("Gecko/")) engine = "Gecko";
  if (ua.includes("AppleWebKit/")) engine = "WebKit";
  if (ua.includes("Trident/")) engine = "Trident";
  if (ua.includes("Blink")) engine = "Blink";

  // Detect browser name and version
  if (ua.includes("Firefox/")) {
    name = "Firefox";
    const match = ua.match(/Firefox\/(\d+(\.\d+)?)/);
    if (match) version = match[1];
  } else if (ua.includes("Edg/")) {
    name = "Edge";
    const match = ua.match(/Edg\/(\d+(\.\d+)?)/);
    if (match) version = match[1];
    engine = "Blink";
  } else if (ua.includes("Chrome/")) {
    name = "Chrome";
    const match = ua.match(/Chrome\/(\d+(\.\d+)?)/);
    if (match) version = match[1];
    engine = "Blink";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    name = "Safari";
    const match = ua.match(/Version\/(\d+(\.\d+)?)/);
    if (match) version = match[1];
  } else if (ua.includes("Opera/") || ua.includes("OPR/")) {
    name = "Opera";
    const match = ua.match(/(?:Opera|OPR)\/(\d+(\.\d+)?)/);
    if (match) version = match[1];
    engine = "Blink";
  }

  return { name, version, engine };
}

function detectOS(): OSInfo {
  const ua = navigator.userAgent;
  const platform = navigator.platform || "Unknown";
  let name = "Unknown";
  let version = "Unknown";
  let architecture = "Unknown";

  // Detect architecture
  if (
    ua.includes("x86_64") ||
    ua.includes("x64") ||
    ua.includes("Win64") ||
    ua.includes("WOW64")
  ) {
    architecture = "x86_64";
  } else if (ua.includes("arm64") || ua.includes("aarch64")) {
    architecture = "arm64";
  } else if (ua.includes("arm")) {
    architecture = "arm";
  } else if (platform.includes("Win")) {
    architecture = "x86_64"; // Default assumption for modern Windows
  } else if (platform.includes("Mac") && ua.includes("Mac OS X")) {
    architecture = "arm64/x86_64"; // Could be either on modern Mac
  }

  // Detect OS
  if (ua.includes("Windows NT 10.0")) {
    name = "Windows";
    version = ua.includes("Windows NT 10.0; Win64") ? "10/11" : "10";
  } else if (ua.includes("Windows NT 6.3")) {
    name = "Windows";
    version = "8.1";
  } else if (ua.includes("Windows NT 6.2")) {
    name = "Windows";
    version = "8";
  } else if (ua.includes("Windows NT 6.1")) {
    name = "Windows";
    version = "7";
  } else if (ua.includes("Mac OS X")) {
    name = "macOS";
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    if (match) {
      version = match[1].replace(/_/g, ".");
    }
  } else if (ua.includes("Linux")) {
    name = "Linux";
    if (ua.includes("Ubuntu")) {
      name = "Ubuntu";
    } else if (ua.includes("Fedora")) {
      name = "Fedora";
    } else if (ua.includes("Debian")) {
      name = "Debian";
    }
    version = "Unknown";
  } else if (ua.includes("Android")) {
    name = "Android";
    const match = ua.match(/Android (\d+(\.\d+)?)/);
    if (match) version = match[1];
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    name = "iOS";
    const match = ua.match(/OS (\d+[._]\d+)/);
    if (match) version = match[1].replace(/_/g, ".");
  }

  return { name, version, platform, architecture };
}

function detectScreen(): ScreenInfo {
  return {
    width: window.screen.width,
    height: window.screen.height,
    colorDepth: window.screen.colorDepth,
    pixelRatio: window.devicePixelRatio || 1,
  };
}

function detectConnectionType(): string | undefined {
  // Navigator.connection is experimental and not fully typed
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
    mozConnection?: { effectiveType?: string; type?: string };
    webkitConnection?: { effectiveType?: string; type?: string };
  };
  const connection =
    nav.connection || nav.mozConnection || nav.webkitConnection;
  if (connection) {
    return connection.effectiveType || connection.type;
  }
  return undefined;
}

// ===========================================
// Service Class
// ===========================================

class SystemInfoServiceClass {
  private info: SystemInfo | null = null;
  private initialized = false;
  private initPromise: Promise<SystemInfo> | null = null;

  /**
   * Initialize and detect all system info
   * Call this early in app startup
   */
  async init(): Promise<SystemInfo> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.detect();
    return this.initPromise;
  }

  private async detect(): Promise<SystemInfo> {
    const browser = detectBrowser();
    const os = detectOS();
    const screen = detectScreen();
    const connectionType = detectConnectionType();

    // Fetch IP info from backend
    let clientIP = "Unknown";
    let serverIP = "Unknown";
    let serverOS: OSInfo | undefined;

    try {
      const response = await fetch(`${config.apiUrl}/api/client-info`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        clientIP = data.clientIP || "Unknown";
        serverIP = data.serverIP || "Unknown";

        if (data.serverOS) {
          serverOS = {
            name:
              data.serverOS.platform === "win32"
                ? "Windows"
                : data.serverOS.platform === "darwin"
                  ? "macOS"
                  : data.serverOS.platform === "linux"
                    ? "Linux"
                    : data.serverOS.platform,
            version: data.serverOS.release,
            platform: data.serverOS.platform,
            architecture: data.serverOS.arch,
          };
        }
      }
    } catch (err) {
      console.warn("Failed to fetch client IP info:", err);
    }

    this.info = {
      browser,
      os,
      serverOS,
      network: {
        clientIP,
        serverIP,
        connectionType,
      },
      screen,
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: Date.now(),
    };

    this.initialized = true;
    console.log("[SystemInfo] Detected:", this.info);

    return this.info;
  }

  /**
   * Get the detected system info (must call init first)
   */
  get(): SystemInfo | null {
    return this.info;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get a formatted summary string for AI context
   */
  getSummary(): string {
    if (!this.info) {
      return "System info not yet detected";
    }

    const { browser, os, network, screen, timezone } = this.info;

    return [
      `OS: ${os.name} ${os.version} (${os.architecture})`,
      `Browser: ${browser.name} ${browser.version} (${browser.engine})`,
      `Client IP: ${network.clientIP}`,
      `Server IP: ${network.serverIP}`,
      `Screen: ${screen.width}x${screen.height} @${screen.pixelRatio}x`,
      `Timezone: ${timezone}`,
      network.connectionType ? `Connection: ${network.connectionType}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  /**
   * Get info formatted for AI system prompt
   */
  getForPrompt(): string {
    if (!this.info) {
      return "";
    }

    const { browser, os, network, timezone } = this.info;

    return `
## Client System Information
- **Operating System**: ${os.name} ${os.version} (${os.platform}, ${os.architecture})
- **Browser**: ${browser.name} ${browser.version} (Engine: ${browser.engine})
- **Client IP Address**: ${network.clientIP}
- **Server IP Address**: ${network.serverIP}
- **Timezone**: ${timezone}
- **Language**: ${this.info.language}
${network.connectionType ? `- **Connection Type**: ${network.connectionType}` : ""}
`.trim();
  }
}

// Export singleton instance
export const SystemInfoService = new SystemInfoServiceClass();
