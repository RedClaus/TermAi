import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Terminal,
  Copy,
  Check,
  AlertTriangle,
  Shield,
  ChevronRight,
  Command,
  Keyboard,
} from 'lucide-react';
import { LocalAgentService } from '../../services/LocalAgentService';
import { config } from '../../config';
import styles from './LocalAgentPrompt.module.css';

interface LocalAgentPromptProps {
  onConnected?: () => void;
  onSkip?: () => void;
  onDismiss?: () => void;
  showSkip?: boolean;
  isModal?: boolean;
}

type SetupStep = 'intro' | 'install' | 'waiting' | 'connected';

export const LocalAgentPrompt: React.FC<LocalAgentPromptProps> = ({ 
  onConnected, 
  onSkip,
  onDismiss,
  showSkip = true,
  isModal = false,
}) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('intro');
  const [isChecking, setIsChecking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [health, setHealth] = useState<{ platform: string; hostname: string } | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<'windows' | 'macos' | 'linux' | 'unknown'>('unknown');
  
  // Build the download URL for the agent script
  const agentDownloadUrl = `${config.apiUrl}/bin/local-agent.cjs`;
  
  // Detect user's platform
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) {
      setDetectedPlatform('windows');
    } else if (ua.includes('mac')) {
      setDetectedPlatform('macos');
    } else if (ua.includes('linux')) {
      setDetectedPlatform('linux');
    }
  }, []);

  // Check connection on mount
  useEffect(() => {
    const checkInitialConnection = async () => {
      const connected = await LocalAgentService.checkConnection();
      if (connected) {
        setIsConnected(true);
        setCurrentStep('connected');
        const healthInfo = await LocalAgentService.getHealth();
        setHealth(healthInfo);
        onConnected?.();
      }
    };
    checkInitialConnection();
  }, [onConnected]);

  // Poll for connection when in install or waiting step
  useEffect(() => {
    if (currentStep !== 'install' && currentStep !== 'waiting') return;
    
    const interval = setInterval(async () => {
      const connected = await LocalAgentService.checkConnection();
      if (connected) {
        setIsConnected(true);
        setCurrentStep('connected');
        const healthInfo = await LocalAgentService.getHealth();
        setHealth(healthInfo);
        onConnected?.();
        clearInterval(interval);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [currentStep, onConnected]);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    const connected = await LocalAgentService.checkConnection();
    setIsConnected(connected);
    
    if (connected) {
      setCurrentStep('connected');
      const healthInfo = await LocalAgentService.getHealth();
      setHealth(healthInfo);
      onConnected?.();
    }
    
    setIsChecking(false);
  }, [onConnected]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  // Generate the one-liner command based on platform
  const getOneLinerCommand = () => {
    const url = agentDownloadUrl;
    
    if (detectedPlatform === 'windows') {
      // PowerShell command
      return `Invoke-WebRequest -Uri "${url}" -OutFile local-agent.cjs; node local-agent.cjs`;
    } else if (detectedPlatform === 'macos' || detectedPlatform === 'linux') {
      // curl command for Unix-like systems
      return `curl -O "${url}" && node local-agent.cjs`;
    }
    return `curl -O "${url}" && node local-agent.cjs`;
  };

  // Get terminal open instructions
  const getTerminalInstructions = () => {
    if (detectedPlatform === 'windows') {
      return {
        name: 'PowerShell or Terminal',
        shortcut: 'Win + X, then select "Terminal" or "PowerShell"',
        altMethod: 'Or search for "PowerShell" in the Start menu',
      };
    } else if (detectedPlatform === 'macos') {
      return {
        name: 'Terminal',
        shortcut: 'Cmd + Space, then type "Terminal"',
        altMethod: 'Or go to Applications → Utilities → Terminal',
      };
    }
    return {
      name: 'Terminal',
      shortcut: 'Ctrl + Alt + T',
      altMethod: 'Or search for "Terminal" in your applications',
    };
  };

  const terminalInfo = getTerminalInstructions();

  // Render based on current step
  const renderStep = () => {
    switch (currentStep) {
      case 'intro':
        return (
          <div className={styles.stepContent}>
            <div className={styles.iconContainer}>
              <Shield size={32} className={styles.shieldIcon} />
            </div>
            
            <h2 className={styles.title}>Local Agent Required</h2>
            
            <p className={styles.description}>
              To access files on your computer and securely store your API keys locally, 
              TermAI needs to install a small agent on this machine.
            </p>

            <div className={styles.infoBox}>
              <AlertTriangle size={18} />
              <div>
                <strong>What the agent does:</strong>
                <ul>
                  <li>Provides access to your local file system</li>
                  <li>Stores API keys securely on your machine (~/.termai/)</li>
                  <li>Runs only on localhost (127.0.0.1:3010)</li>
                  <li>Cannot be accessed from the internet</li>
                </ul>
              </div>
            </div>

            <div className={styles.acknowledgment}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className={styles.checkbox}
                />
                <span>
                  I understand that this will install a local service on my computer 
                  and I accept the associated risks.
                </span>
              </label>
            </div>

            <div className={styles.actions}>
              <button
                className={styles.primaryBtn}
                onClick={() => setCurrentStep('install')}
                disabled={!acknowledged}
              >
                Continue
                <ChevronRight size={16} />
              </button>
              {showSkip && (
                <button className={styles.skipBtn} onClick={onSkip}>
                  Skip for now
                </button>
              )}
            </div>
          </div>
        );

      case 'install':
        return (
          <div className={styles.stepContent}>
            <div className={styles.terminalIcon}>
              <Terminal size={32} />
            </div>

            <h2 className={styles.title}>Open Terminal & Run Command</h2>
            
            <div className={styles.stepInstructions}>
              <div className={styles.instructionStep}>
                <div className={styles.stepBadge}>1</div>
                <div className={styles.stepText}>
                  <strong>Open {terminalInfo.name}</strong>
                  <div className={styles.shortcutBox}>
                    <Keyboard size={14} />
                    <code>{terminalInfo.shortcut}</code>
                  </div>
                  <span className={styles.altMethod}>{terminalInfo.altMethod}</span>
                </div>
              </div>

              <div className={styles.instructionStep}>
                <div className={styles.stepBadge}>2</div>
                <div className={styles.stepText}>
                  <strong>Copy and paste this command:</strong>
                  <div className={styles.commandBox}>
                    <code>{getOneLinerCommand()}</code>
                    <button 
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(getOneLinerCommand(), 'oneliner')}
                      title="Copy command"
                    >
                      {copiedCommand === 'oneliner' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  {copiedCommand === 'oneliner' && (
                    <span className={styles.copiedNotice}>Copied to clipboard!</span>
                  )}
                </div>
              </div>

              <div className={styles.instructionStep}>
                <div className={styles.stepBadge}>3</div>
                <div className={styles.stepText}>
                  <strong>Press Enter and wait</strong>
                  <span className={styles.stepHint}>
                    The agent will start and this page will automatically detect it.
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.waitingIndicator}>
              <RefreshCw size={16} className={styles.spinningIcon} />
              <span>Waiting for agent to connect...</span>
            </div>

            <div className={styles.actions}>
              <button className={styles.secondaryBtn} onClick={() => setCurrentStep('intro')}>
                Back
              </button>
              <button 
                className={styles.primaryBtn} 
                onClick={checkConnection}
                disabled={isChecking}
              >
                {isChecking ? (
                  <>
                    <RefreshCw size={14} className={styles.spinningIcon} />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Check Connection
                  </>
                )}
              </button>
            </div>

            <div className={styles.troubleshootLink}>
              <button 
                className={styles.linkBtn}
                onClick={() => setCurrentStep('waiting')}
              >
                Having trouble? See troubleshooting tips
              </button>
            </div>
          </div>
        );

      case 'waiting':
        return (
          <div className={styles.stepContent}>
            <div className={styles.waitingAnimation}>
              <RefreshCw size={32} className={styles.spinningIcon} />
            </div>

            <h2 className={styles.title}>Troubleshooting</h2>
            
            <div className={styles.troubleshoot}>
              <h4>Common Issues:</h4>
              <ul>
                <li>
                  <strong>Node.js not installed?</strong>
                  <br />
                  Download from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a>
                </li>
                <li>
                  <strong>Command not found?</strong>
                  <br />
                  Make sure you're in the directory where the file was downloaded
                </li>
                <li>
                  <strong>Permission denied?</strong>
                  <br />
                  On Mac/Linux, try: <code>chmod +x local-agent.cjs</code>
                </li>
                <li>
                  <strong>Port already in use?</strong>
                  <br />
                  Another instance may be running. Close it or use a different port.
                </li>
              </ul>
            </div>

            <div className={styles.manualDownload}>
              <h4>Alternative: Manual Download</h4>
              <p>If the automatic download doesn't work:</p>
              <a 
                href="/bin/local-agent.cjs" 
                download="local-agent.cjs"
                className={styles.downloadLink}
              >
                Download local-agent.cjs
              </a>
              <p className={styles.smallText}>
                Then run: <code>node local-agent.cjs</code>
              </p>
            </div>

            <div className={styles.actions}>
              <button className={styles.secondaryBtn} onClick={() => setCurrentStep('install')}>
                Back to Instructions
              </button>
              <button 
                className={styles.primaryBtn} 
                onClick={checkConnection}
                disabled={isChecking}
              >
                {isChecking ? (
                  <>
                    <RefreshCw size={14} className={styles.spinningIcon} />
                    Checking...
                  </>
                ) : (
                  <>
                    Check Connection
                  </>
                )}
              </button>
            </div>
          </div>
        );

      case 'connected':
        return (
          <div className={styles.stepContent}>
            <div className={styles.successIcon}>
              <CheckCircle2 size={48} />
            </div>

            <h2 className={styles.title}>Connected!</h2>
            
            <p className={styles.description}>
              The local agent is running on your machine.
            </p>

            {health && (
              <div className={styles.connectionInfo}>
                <div className={styles.infoRow}>
                  <span>Platform:</span>
                  <strong>{health.platform}</strong>
                </div>
                <div className={styles.infoRow}>
                  <span>Hostname:</span>
                  <strong>{health.hostname}</strong>
                </div>
                <div className={styles.infoRow}>
                  <span>Status:</span>
                  <strong className={styles.statusConnected}>Connected</strong>
                </div>
              </div>
            )}

            <div className={styles.successNote}>
              <CheckCircle2 size={16} />
              <span>Your API keys will now be stored securely on your local machine.</span>
            </div>

            <div className={styles.persistNote}>
              <Command size={14} />
              <span>
                To make the agent start automatically, run: <code>node local-agent.cjs --install</code>
              </span>
            </div>

            <div className={styles.actions}>
              <button className={styles.primaryBtn} onClick={onDismiss || onConnected}>
                Get Started
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        );
    }
  };

  // If already connected and not modal, show compact status
  if (isConnected && !isModal) {
    return (
      <div className={styles.compactStatus}>
        <CheckCircle2 size={16} className={styles.connectedIcon} />
        <span>Local Agent Connected</span>
        {health && <span className={styles.hostname}>({health.hostname})</span>}
      </div>
    );
  }

  // Modal wrapper
  if (isModal) {
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <button className={styles.closeBtn} onClick={onDismiss || onSkip}>
            <XCircle size={20} />
          </button>
          {renderStep()}
        </div>
      </div>
    );
  }

  // Inline render
  return (
    <div className={styles.container}>
      {renderStep()}
    </div>
  );
};

export default LocalAgentPrompt;
