import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal, 
  Search, 
  Bot, 
  Plus, 
  Workflow, 
  Cpu, 
  Settings, 
  Play, 
  Square, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  Clock, 
  X, 
  Sidebar as SidebarIcon,
  Loader,
  GraduationCap,
  FileText,
  Copy,
  Sun,
  Moon,
  Folder,
  FolderOpen,
  Home,
  Cloud,
  CloudOff,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Trash2,
  Check,
  Brain,
  Paperclip,
  File,
  Image,
  HardDrive,
   Book,
   ScrollText,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Services
import { LLMManager } from './services/LLMManager';
import { SessionManager } from './services/SessionManager';
import { KnowledgeService } from './services/KnowledgeService';
import { InitialCwdService } from './services/InitialCwdService';
import { LocalAgentService } from './services/LocalAgentService';
import { buildSystemPrompt } from './utils/promptBuilder';
import { executeCommand, cancelCommand, detectCommandType } from './utils/commandRunner';
import { emit } from './events';
import { isSmallModel } from './data/models';
import { BackgroundTerminalService } from './services/BackgroundTerminalService';
import { SessionPersistenceService } from './services/SessionPersistenceService';
import type { SessionState } from './services/SessionPersistenceService';
import { config } from './config';

// Assets
import backgroundImg from '/background.png?url';

// Hooks
import { useSafetyCheck } from './hooks/useSafetyCheck';
import { useObserver } from './hooks/useObserver';
import { useUIState, shouldShowComplexDialog } from './hooks/useUIState';
import { useSettingsLoader } from './hooks/useSettingsLoader';
import {
  useAutoRunMachine,
  MAX_AUTO_STEPS,
  MAX_STALLS_BEFORE_ASK,
  formatOutputMessage,
  processResponseForCommand,
} from './hooks/useAutoRunMachine';
import { useWidgetContext } from './hooks/useWidgetContext';
import { useTermAiEvent } from './hooks/useTermAiEvent';

// Components
import { ModelSelector } from './components/AI/ModelSelector';
import { APIKeyPrompt } from './components/AI/APIKeyPrompt';
import { SafetyConfirmDialog } from './components/AI/SafetyConfirmDialog';
import { ComplexRequestDialog } from './components/AI/ComplexRequestDialog';
import { LocalAgentPrompt } from './components/AI/LocalAgentPrompt';
import { SettingsModal } from './components/Settings/SettingsModal';
import { SessionLogsModal } from './components/Settings/SessionLogsModal';
import { LearnedSkillsModal } from './components/Settings/LearnedSkillsModal';
import { KnowledgeEngineModal } from './components/Settings/KnowledgeEngineModal';
import { PromptLibraryModal } from './components/Settings/PromptLibraryModal';
import { UserManualModal } from './components/Help/UserManualModal';
import { BackgroundTerminals } from './components/Terminal/BackgroundTerminals';
import { FlowCanvas } from './components/Flow/FlowCanvas';

// Types
import type { ProviderType } from './types';
import type { ModelSpec } from './data/models';
import type {
  CommandFinishedPayload,
  CommandStartedPayload,
  RunCommandPayload,
  CancelCommandPayload,
  RestoreSessionPayload,
} from './events/types';

// ============================================================================
// TYPES
// ============================================================================

interface Tab {
  id: string;
  title: string;
}

interface HistoryItem {
  id: string;
  type: 'user' | 'ai' | 'system' | 'command';
  content: string;
  timestamp: number;
  command?: string;
  status?: 'success' | 'error' | 'running' | 'cancelled';
  output?: string;
  exitCode?: number;
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

const TABS_STORAGE_KEY = "termai_tabs";
const ACTIVE_TAB_STORAGE_KEY = "termai_active_tab";

const loadPersistedTabs = (): { tabs: Tab[]; activeTabId: string } => {
  try {
    const storedTabs = localStorage.getItem(TABS_STORAGE_KEY);
    const storedActiveTab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (storedTabs) {
      const tabs = JSON.parse(storedTabs) as Tab[];
      if (tabs.length > 0) {
        const activeTabId = storedActiveTab && tabs.some(t => t.id === storedActiveTab)
          ? storedActiveTab
          : tabs[0].id;
        return { tabs, activeTabId };
      }
    }
  } catch (e) {
    console.error("Failed to load persisted tabs:", e);
  }
  return { tabs: [{ id: "default", title: "Terminal 1" }], activeTabId: "default" };
};

const persistTabs = (tabs: Tab[], activeTabId: string) => {
  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
  } catch (e) {
    console.error("Failed to persist tabs:", e);
  }
};

// ============================================================================
// SUB COMPONENTS
// ============================================================================

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: (() => void) | undefined;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, onClick }) => (
  <div className="nav-item" onClick={onClick}>
    <span className="nav-icon">{icon}</span>
    <span className="nav-label">{label}</span>
  </div>
);

interface SessionItemProps {
  id: string;
  name: string;
  status: 'idle' | 'active' | 'error' | 'running';
  active: boolean;
  onClick: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  canClose: boolean;
}

const SessionItem: React.FC<SessionItemProps> = ({ id, name, status, active, onClick, onClose, onRename, canClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editName.trim()) {
      onRename(id, editName.trim());
    } else {
      setEditName(name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditName(name);
      setIsEditing(false);
    }
  };

  return (
    <div 
      onClick={() => !isEditing && onClick(id)}
      className={`session-item ${active ? 'active' : ''}`}
    >
      <Terminal size={14} className="session-icon" />
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="session-name-input"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="session-name">{name}</span>
      )}
      <div className={`session-status ${status}`} />
      <div className="session-actions">
        {isEditing ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            className="session-action-btn save"
            title="Save"
          >
            <Check size={12} />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="session-action-btn edit"
            title="Rename"
          >
            <Pencil size={12} />
          </button>
        )}
        {canClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
            className="session-action-btn delete"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

interface CommandBlockProps {
  item: HistoryItem;
  onRerun: () => void;
  onCopy: () => void;
}

const CommandBlock: React.FC<CommandBlockProps> = ({ item, onRerun, onCopy }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSuccess = item.status === 'success';
  const isError = item.status === 'error';
  const isRunning = item.status === 'running';
  
  // Count output lines for preview
  const outputLines = (item.output || '').split('\n').length;
  const outputPreview = (item.output || '').split('\n').slice(0, 3).join('\n');
  const hasMoreOutput = outputLines > 3;
  
  return (
    <div className={`command-block ${isError ? 'error' : ''}`}>
      {/* Command Header */}
      <div className="command-header">
        <div className="command-text">
          <ChevronRight size={14} className="command-prompt-icon" />
          <span>{item.command}</span>
        </div>
        <div className="command-actions">
          <button onClick={onCopy} className="command-copy-btn" title="Copy command">
            <Copy size={12} />
          </button>
          <button onClick={onRerun} className="command-run-btn" title="Run again">
            <Play size={10} /> Run
          </button>
        </div>
      </div>
      
      {/* Command Output - Collapsible */}
      {isRunning ? (
        <div className="command-output">
          <div className="command-running">
            <Loader size={14} className="animate-spin" />
            <span>Running...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Output Preview or Full Output */}
          <div 
            className={`command-output ${isError ? 'error' : ''} ${isExpanded ? 'expanded' : 'collapsed'}`}
            onClick={() => !isExpanded && hasMoreOutput && setIsExpanded(true)}
          >
            <pre>{isExpanded ? (item.output || 'No output') : (outputPreview || 'No output')}</pre>
            {!isExpanded && hasMoreOutput && (
              <div className="command-output-fade" />
            )}
          </div>
          
          {/* Expand/Collapse Toggle */}
          {(hasMoreOutput || isExpanded) && (
            <button 
              className="command-expand-btn"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={14} />
                  <span>Collapse output</span>
                </>
              ) : (
                <>
                  <ChevronDown size={14} />
                  <span>Show full output ({outputLines} lines)</span>
                </>
              )}
            </button>
          )}
        </>
      )}

      {/* Footer Info */}
      <div className="command-footer">
        {isSuccess && <CheckCircle2 size={10} />}
        {isError && <AlertCircle size={10} />}
        <span>{isRunning ? 'Running' : isError ? 'Failed' : 'Success'}</span>
        {item.exitCode !== undefined && item.exitCode !== 0 && (
          <span className="command-exit-code">Exit code: {item.exitCode}</span>
        )}
      </div>
    </div>
  );
};

interface StatusCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  clickable?: boolean;
}

const StatusCard: React.FC<StatusCardProps> = ({ label, value, icon, color, onClick, clickable }) => (
  <div 
    className={`status-card ${clickable ? 'clickable' : ''}`}
    onClick={onClick}
    title={clickable ? `Click to change ${label.toLowerCase()}` : undefined}
  >
    <div className="status-card-left">
      <div className={`status-card-icon ${color}`}>{icon}</div>
      <span className="status-card-label">{label}</span>
    </div>
    <span className="status-card-value">{value}</span>
  </div>
);

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const App: React.FC = () => {
  // ==================== SESSION/TAB STATE ====================
  const initialState = useRef(loadPersistedTabs());
  const [tabs, setTabs] = useState<Tab[]>(initialState.current.tabs);
  const [activeTabId, setActiveTabId] = useState(initialState.current.activeTabId);
  const initialized = useRef(false);

  // ==================== UI STATE ====================
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [isSessionsCollapsed, setIsSessionsCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isKnowledgeEngineOpen, setIsKnowledgeEngineOpen] = useState(false);
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
  const [activeView, setActiveView] = useState<'terminal' | 'flows'>('terminal');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('termai_theme');
    return saved !== 'light';
  });

  // Theme toggle effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('termai_theme', isDarkMode ? 'dark' : 'light');
    
    // Apply saved contrast setting when theme changes
    if (isDarkMode) {
      const savedContrast = localStorage.getItem('termai_contrast');
      if (savedContrast) {
        applyContrastLevel(parseInt(savedContrast, 10));
      }
    } else {
      // Reset to default for light theme
      document.documentElement.style.removeProperty('--text-primary');
      document.documentElement.style.removeProperty('--text-secondary');
      document.documentElement.style.removeProperty('--text-tertiary');
    }
  }, [isDarkMode]);

  // Apply contrast level to CSS variables
  const applyContrastLevel = (level: number) => {
    const root = document.documentElement;
    
    // Map 0-100 to text color values (Zinc palette)
    const presets = {
      low: { primary: '#a1a1aa', secondary: '#71717a', tertiary: '#52525b' },
      medium: { primary: '#d4d4d8', secondary: '#a1a1aa', tertiary: '#71717a' },
      default: { primary: '#e4e4e7', secondary: '#a1a1aa', tertiary: '#71717a' },
      high: { primary: '#f4f4f5', secondary: '#d4d4d8', tertiary: '#a1a1aa' },
      max: { primary: '#fafafa', secondary: '#e4e4e7', tertiary: '#d4d4d8' },
    };
    
    let preset: keyof typeof presets;
    if (level <= 15) preset = 'low';
    else if (level <= 35) preset = 'medium';
    else if (level <= 65) preset = 'default';
    else if (level <= 85) preset = 'high';
    else preset = 'max';
    
    const colors = presets[preset];
    root.style.setProperty('--text-primary', colors.primary);
    root.style.setProperty('--text-secondary', colors.secondary);
    root.style.setProperty('--text-tertiary', colors.tertiary);
  };

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  // ==================== MAIN CONTENT STATE ====================
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('~');
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isCheckingKey, setIsCheckingKey] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recentCommands, setRecentCommands] = useState<HistoryItem[]>([]);
  const [showBackgroundTerminals, setShowBackgroundTerminals] = useState(false);
  const [showDirBrowser, setShowDirBrowser] = useState(false);
  const [dirBrowserPath, setDirBrowserPath] = useState('~');
  const [dirBrowserItems, setDirBrowserItems] = useState<Array<{ name: string; isDirectory: boolean; path: string }>>([]);
  const [dirBrowserLoading, setDirBrowserLoading] = useState(false);
  const [showDrivesView, setShowDrivesView] = useState(false);
  const [drives, setDrives] = useState<Array<{ name: string; path: string; type: string }>>([]);
  const [localAgentConnected, setLocalAgentConnected] = useState(false);
  const [showLocalAgentSetup, setShowLocalAgentSetup] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; type: string; size: number; content?: string }>>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const currentCommandRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================== HOOKS ====================
  const { analyzeAndLearn } = useObserver();

  const {
    isLoading,
    agentStatus,
    showComplexConfirm,
    pendingComplexMessage,
    needsAttention,
    setIsLoading,
    setAgentStatus,
    showComplexDialog,
    hideComplexDialog,
  } = useUIState({ sessionId: activeTabId });

  const {
    hasKey,
    models,
    selectedModelId,
    isLiteMode,
    handleModelSelect: baseHandleModelSelect,
    fetchOllamaModels,
    setHasKey,
    setSelectedModelId,
    setModels,
  } = useSettingsLoader({
    sessionId: activeTabId,
    setMessages: (updater) => {
      setHistory(() => {
        const newItems: HistoryItem[] = [];
        const updated = typeof updater === 'function' ? updater([]) : updater;
        updated.forEach(msg => {
          newItems.push({
            id: uuidv4(),
            type: msg.role,
            content: msg.content,
            timestamp: Date.now(),
          });
        });
        return newItems;
      });
    },
    setAgentStatus,
    isActive: true,
  });

  const {
    isAutoRun,
    autoRunCount,
    consecutiveStalls,
    toggleAutoRun,
    stopAutoRun,
    addTaskStep,
    setRunningCommandId,
    setConsecutiveStalls,
    incrementAutoRunCount,
  } = useAutoRunMachine({
    sessionId: activeTabId,
    messages: history.filter(h => h.type !== 'command').map(h => ({ role: h.type as 'user' | 'ai' | 'system', content: h.content })),
    setMessages: () => {},
    setAgentStatus,
    analyzeAndLearn,
  });

  const { gitBranch, hasContext } = useWidgetContext({
    sessionId: activeTabId || 'default',
    autoFetchGit: true,
  });

  const {
    showSafetyConfirm,
    pendingSafetyCommand,
    getCommandImpact,
    requestSafetyConfirmation,
    handleSafetyConfirm,
  } = useSafetyCheck({
    sessionId: activeTabId,
    onMessagesUpdate: () => {},
    onStatusChange: setAgentStatus,
    onAutoRunCountIncrement: incrementAutoRunCount,
  });

  const actualNeedsAttention = needsAttention || showSafetyConfirm;

  // ==================== INITIALIZATION ====================
  
  // Initialize sessions
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    tabs.forEach(tab => {
      SessionManager.startSession(tab.id, tab.title);
    });
    console.log(`[App] Restored ${tabs.length} tab(s), active: ${activeTabId}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist tabs
  useEffect(() => {
    if (initialized.current) {
      persistTabs(tabs, activeTabId);
    }
  }, [tabs, activeTabId]);

  // Restore session state helper function (defined before initialization effect)
  const restoreSessionState = useCallback((sessionId: string): boolean => {
    const savedState = SessionPersistenceService.loadSession(sessionId);
    if (savedState && savedState.history.length > 0) {
      setHistory(savedState.history);
      if (savedState.cwd) {
        setCwd(savedState.cwd);
      }
      console.log(`[App] Restored session state: ${sessionId} (${savedState.history.length} messages)`);
      return true;
    }
    return false;
  }, []);

  // Initialize CWD and history when session changes
  useEffect(() => {
    const initSession = async () => {
      // Helper to check if a path looks valid for this server
      // Detects Mac paths when running on a different server
      const isValidServerPath = (path: string): boolean => {
        if (!path) return false;
        // Mac paths that won't exist on Linux server
        if (path.startsWith('/Users/')) return false;
        // Windows paths
        if (/^[A-Z]:\\/.test(path)) return false;
        // Valid paths: ~, /, /home, etc.
        return true;
      };

      // Try to restore persisted session state first
      const restored = restoreSessionState(activeTabId);
      
      if (restored) {
        // Session restored from persistence, just update recent commands from history
        const restoredHistory = SessionPersistenceService.loadSession(activeTabId)?.history || [];
        const commands = restoredHistory
          .filter(h => h.type === 'command')
          .slice(-10)
          .reverse();
        setRecentCommands(commands);
        
        // Validate the restored cwd - if it's a Mac path, fetch fresh from server
        const restoredCwd = SessionPersistenceService.loadSession(activeTabId)?.cwd;
        if (restoredCwd && !isValidServerPath(restoredCwd)) {
          console.warn(`[App] Restored cwd "${restoredCwd}" appears invalid for server, fetching fresh`);
          try {
            const { cwd: freshCwd } = await InitialCwdService.getInitialCwd();
            setCwd(freshCwd);
          } catch {
            setCwd('~');
          }
        }
        return;
      }

      // No persisted state, initialize fresh
      const storedCwd = localStorage.getItem(`termai_cwd_${activeTabId}`);
      
      // Validate stored cwd - skip if it's a Mac/Windows path
      if (storedCwd && isValidServerPath(storedCwd)) {
        setCwd(storedCwd);
      } else {
        // Clear invalid stored path
        if (storedCwd) {
          console.warn(`[App] Stored cwd "${storedCwd}" appears invalid for server, clearing`);
          localStorage.removeItem(`termai_cwd_${activeTabId}`);
        }
        try {
          const { cwd: initialCwd } = await InitialCwdService.getInitialCwd();
          setCwd(initialCwd);
        } catch (error) {
          console.error('[App] Failed to fetch initial CWD:', error);
          setCwd('~');
        }
      }

      setHistory([{
        id: uuidv4(),
        type: 'system',
        content: `System Healthy. Terminal ready.`,
        timestamp: Date.now(),
      }]);
      setRecentCommands([]);
    };

    initSession();
  }, [activeTabId, restoreSessionState]);

  // Save CWD
  useEffect(() => {
    if (activeTabId && cwd) {
      localStorage.setItem(`termai_cwd_${activeTabId}`, cwd);
    }
    emit('termai-cwd-changed', { cwd, sessionId: activeTabId });
  }, [cwd, activeTabId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, agentStatus, isLoading]);

  // Skills modal listener
  useEffect(() => {
    const handleOpenSkills = () => setIsSkillsOpen(true);
    window.addEventListener('termai-show-skills', handleOpenSkills);
    return () => window.removeEventListener('termai-show-skills', handleOpenSkills);
  }, []);

  // Help modal listener
  useEffect(() => {
    const handleOpenHelp = () => setIsHelpOpen(true);
    window.addEventListener('termai-show-help', handleOpenHelp);
    return () => window.removeEventListener('termai-show-help', handleOpenHelp);
  }, []);

  // Local agent connection status
  useEffect(() => {
    // Initial check and determine if we should show setup prompt
    const checkAndPrompt = async () => {
      const connected = await LocalAgentService.checkConnection();
      
      // Show setup prompt if:
      // 1. Not connected
      // 2. User hasn't skipped before (or hasn't seen it in this session)
      // 3. Not already showing
      const hasSkippedSetup = localStorage.getItem('termai_local_agent_skipped');
      const hasCompletedSetup = localStorage.getItem('termai_local_agent_setup_complete');
      
      if (!connected && !hasSkippedSetup && !hasCompletedSetup) {
        setShowLocalAgentSetup(true);
      }
    };
    
    checkAndPrompt();
    
    // Subscribe to connection changes
    const unsubscribe = LocalAgentService.onConnectionChange((connected) => {
      setLocalAgentConnected(connected);
      if (connected) {
        setShowLocalAgentSetup(false);
        localStorage.setItem('termai_local_agent_setup_complete', 'true');
      }
    });
    
    // Periodic check every 30 seconds
    const interval = setInterval(() => {
      LocalAgentService.checkConnection();
    }, 30000);
    
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Load API keys from local agent when connected
  useEffect(() => {
    const loadKeysFromAgent = async () => {
      if (!localAgentConnected || hasKey) return;
      
      const provider = localStorage.getItem('termai_provider') || 'gemini';
      
      try {
        const key = await LocalAgentService.getApiKey(provider as 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama');
        
        if (key) {
          console.log('[App] Loaded API key from local agent for provider:', provider);
          await LLMManager.setApiKey(provider, key);
          setHasKey(true);
          setApiKey(key);
          
          // Fetch models for this provider
          const dynamicModels = await LLMManager.fetchModels(provider);
          if (dynamicModels.length > 0) {
            setModels(prev => {
              const others = prev.filter(p => p.provider !== provider);
              return [...others, ...dynamicModels] as ModelSpec[];
            });
          }
          
          setHistory([{
            id: uuidv4(),
            type: 'system',
            content: 'API key loaded from local storage. Ready to assist!',
            timestamp: Date.now(),
          }]);
        }
      } catch (error) {
        console.warn('[App] Could not load API key from local agent:', error);
      }
    };
    
    loadKeysFromAgent();
  }, [localAgentConnected, hasKey, setHasKey, setModels]);

  // Settings change listener (for contrast updates)
  useEffect(() => {
    const handleSettingsChange = () => {
      if (isDarkMode) {
        const savedContrast = localStorage.getItem('termai_contrast');
        if (savedContrast) {
          applyContrastLevel(parseInt(savedContrast, 10));
        }
      }
    };
    window.addEventListener('termai-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('termai-settings-changed', handleSettingsChange);
  }, [isDarkMode]);

  // Auto-save session state (debounced)
  useEffect(() => {
    if (!activeTabId || history.length === 0) return;

    const saveTimer = setTimeout(() => {
      setIsSaving(true);
      const currentTab = tabs.find(t => t.id === activeTabId);
      
      // Build history entries, only including optional fields if defined
      const mappedHistory = history.map(h => {
        const entry: {
          id: string;
          type: 'user' | 'ai' | 'system' | 'command';
          content: string;
          timestamp: number;
          command?: string;
          status?: 'success' | 'error' | 'running' | 'cancelled';
          output?: string;
          exitCode?: number;
        } = {
          id: h.id,
          type: h.type,
          content: h.content,
          timestamp: h.timestamp,
        };
        if (h.command !== undefined) entry.command = h.command;
        if (h.status !== undefined) entry.status = h.status;
        if (h.output !== undefined) entry.output = h.output;
        if (h.exitCode !== undefined) entry.exitCode = h.exitCode;
        return entry;
      });
      
      const sessionState: SessionState = {
        id: activeTabId,
        name: currentTab?.title || `Session ${activeTabId.substring(0, 6)}`,
        createdAt: Date.now(), // Will be updated by service if existing
        updatedAt: Date.now(),
        cwd,
        history: mappedHistory,
        modelId: selectedModelId,
        autoRunEnabled: isAutoRun,
      };

      SessionPersistenceService.saveSession(sessionState);
      setLastSaved(Date.now());
      setIsSaving(false);
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(saveTimer);
  }, [activeTabId, history, cwd, selectedModelId, isAutoRun, tabs]);

  // ==================== TAB MANAGEMENT ====================

  const addTab = useCallback(async () => {
    const newId = uuidv4();
    const title = `Terminal ${tabs.length + 1}`;
    const newTabs = [...tabs, { id: newId, title }];
    setTabs(newTabs);
    setActiveTabId(newId);
    persistTabs(newTabs, newId);
    // Start session in background - don't block tab creation
    SessionManager.startSession(newId, title).catch(err => {
      console.error('[App] Failed to start session:', err);
    });
  }, [tabs]);

  useTermAiEvent("termai-new-tab", addTab, [addTab]);

  useTermAiEvent(
    "termai-restore-session",
    (payload: RestoreSessionPayload) => {
      const { sessionId } = payload;
      const existingTab = tabs.find(t => t.id === sessionId);
      if (existingTab) {
        setActiveTabId(sessionId);
        persistTabs(tabs, sessionId);
        return;
      }
      const savedSession = SessionManager.getSession(sessionId);
      const title = savedSession?.name || `Session ${sessionId.substring(0, 6)}`;
      const newTabs = [...tabs, { id: sessionId, title }];
      SessionManager.startSession(sessionId, title);
      setTabs(newTabs);
      setActiveTabId(sessionId);
      persistTabs(newTabs, sessionId);
    },
    [tabs]
  );

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    persistTabs(tabs, tabId);
  }, [tabs]);

  const closeTab = useCallback((id: string) => {
    if (tabs.length === 1) return;
    SessionManager.endSession(id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    const newActiveId = activeTabId === id ? newTabs[newTabs.length - 1].id : activeTabId;
    if (activeTabId === id) {
      setActiveTabId(newActiveId);
    }
    persistTabs(newTabs, newActiveId);
  }, [tabs, activeTabId]);

  const renameTab = useCallback((id: string, newName: string) => {
    const newTabs = tabs.map(t => t.id === id ? { ...t, title: newName } : t);
    setTabs(newTabs);
    persistTabs(newTabs, activeTabId);
  }, [tabs, activeTabId]);

  // ==================== COMMAND EXECUTION ====================

  const handleExecute = useCallback(async (command: string) => {
    if (command === 'clear') {
      setHistory([{
        id: uuidv4(),
        type: 'system',
        content: 'Terminal cleared.',
        timestamp: Date.now(),
      }]);
      return;
    }

    // Detect if this should run in a background terminal
    const commandType = detectCommandType(command);
    
    if (commandType !== 'inline') {
      // Run in background terminal
      try {
        const terminal = await BackgroundTerminalService.spawn(command, cwd, {
          sessionId: activeTabId,
        });
        
        setHistory(prev => [...prev, {
          id: uuidv4(),
          type: 'system',
          content: `Started ${commandType} terminal for: ${command}\nTerminal ID: ${terminal.id}\nMonitor progress in the Background Terminals panel.`,
          timestamp: Date.now(),
        }]);
        
        // Show background terminals panel
        setShowBackgroundTerminals(true);
        
        emit('termai-background-started', { 
          terminalId: terminal.id, 
          command, 
          type: commandType,
          sessionId: activeTabId 
        });
      } catch (error) {
        setHistory(prev => [...prev, {
          id: uuidv4(),
          type: 'system',
          content: `Failed to start background terminal: ${(error as Error).message}`,
          timestamp: Date.now(),
        }]);
      }
      return;
    }

    // Regular inline command execution
    const tempId = uuidv4();
    currentCommandRef.current = tempId;

    const newCommand: HistoryItem = {
      id: tempId,
      type: 'command',
      content: '',
      command,
      timestamp: Date.now(),
      status: 'running',
      output: '',
    };

    setHistory(prev => [...prev, newCommand]);
    emit('termai-command-started', { commandId: tempId, command, sessionId: activeTabId });

    try {
      const result = await executeCommand(command, cwd, tempId, activeTabId);

      setHistory(prev =>
        prev.map(item =>
          item.id === tempId
            ? {
                ...item,
                output: result.output,
                exitCode: result.exitCode,
                status: result.exitCode === 0 ? 'success' : 'error',
              }
            : item
        )
      );

      // Add to recent commands
      setRecentCommands(prev => [{
        id: tempId,
        type: 'command' as const,
        content: '',
        command,
        timestamp: Date.now(),
        status: (result.exitCode === 0 ? 'success' : 'error') as 'success' | 'error',
        exitCode: result.exitCode,
      }, ...prev].slice(0, 10));

      if (result.newCwd) {
        setCwd(result.newCwd);
      }

      emit('termai-command-output', { commandId: tempId, output: result.output, sessionId: activeTabId });
      emit('termai-command-finished', { command, output: result.output, exitCode: result.exitCode, sessionId: activeTabId });
    } catch (error) {
      const errorMessage = `Error: ${(error as Error).message}`;
      setHistory(prev =>
        prev.map(item =>
          item.id === tempId
            ? { ...item, output: errorMessage, exitCode: 1, status: 'error' }
            : item
        )
      );
      emit('termai-command-finished', { command, output: errorMessage, exitCode: 1, sessionId: activeTabId });
    } finally {
      currentCommandRef.current = null;
    }
  }, [cwd, activeTabId]);

  useTermAiEvent(
    'termai-run-command',
    (payload: RunCommandPayload) => {
      if (!payload.sessionId || payload.sessionId === activeTabId) {
        handleExecute(payload.command);
      }
    },
    [handleExecute, activeTabId]
  );

  useTermAiEvent(
    'termai-cancel-command',
    (payload: CancelCommandPayload) => {
      if (payload.commandId === currentCommandRef.current && (!payload.sessionId || payload.sessionId === activeTabId)) {
        cancelCommand(payload.commandId);
        setHistory(prev =>
          prev.map(item =>
            item.id === payload.commandId
              ? { ...item, output: 'Command cancelled.', exitCode: 130, status: 'cancelled' }
              : item
          )
        );
      }
    },
    [activeTabId]
  );

  // ==================== AI INTEGRATION ====================

  const handleSaveKey = useCallback(async (key: string) => {
    const provider = localStorage.getItem('termai_provider') || 'gemini';

    if (provider === 'ollama') {
      fetchOllamaModels(key || 'http://localhost:11434');
      return;
    }

    setIsCheckingKey(true);
    setKeyError(null);

    try {
      await LLMManager.setApiKey(provider, key);
      setHasKey(true);
      setApiKey(key);
      setAgentStatus('API key saved successfully!');

      // Also save to local agent if connected (for persistence across sessions)
      if (localAgentConnected) {
        try {
          await LocalAgentService.setApiKey(provider as 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama', key);
          setAgentStatus('API key saved locally!');
        } catch (localError) {
          console.warn('Could not save API key to local agent:', localError);
          // Continue anyway - key is still in memory
        }
      }

      const dynamicModels = await LLMManager.fetchModels(provider);
      if (dynamicModels.length > 0) {
        setModels(prev => {
          const others = prev.filter(p => p.provider !== provider);
          return [...others, ...dynamicModels] as ModelSpec[];
        });
      }

      setHistory([{
        id: uuidv4(),
        type: 'ai',
        content: 'API key configured! How can I help you today?',
        timestamp: Date.now(),
      }]);

      setTimeout(() => setAgentStatus(null), 2000);
    } catch (error) {
      console.error('Error saving API key:', error);
      setKeyError(error instanceof Error ? error.message : 'Failed to save API key');
      setHasKey(false);
    } finally {
      setIsCheckingKey(false);
    }
  }, [fetchOllamaModels, setAgentStatus, setHasKey, setModels, localAgentConnected]);

  const handleModelSelect = useCallback((model: ModelSpec) => {
    baseHandleModelSelect(model);
    setSelectedModelId(model.id);
  }, [baseHandleModelSelect, setSelectedModelId]);

  // Process Auto-Run Response
  const processAutoRunResponse = useCallback((response: string) => {
    const selectedModel = models.find(m => m.id === selectedModelId);
    const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

    processResponseForCommand(
      response,
      {
        sessionId: activeTabId,
        currentCwd: cwd,
        selectedModelId,
        models,
        isLiteMode: useLiteMode,
      },
      {
        getCommandImpact,
        requestSafetyConfirmation,
      },
      {
        setAgentStatus,
        onCommandFound: () => incrementAutoRunCount(),
        onTaskComplete: (narrative) => {
          setConsecutiveStalls(0);
          stopAutoRun('complete', narrative);
        },
        onNeedsUserInput: () => setConsecutiveStalls(0),
        onStall: (newStallCount) => {
          setConsecutiveStalls(newStallCount);
          if (newStallCount >= MAX_STALLS_BEFORE_ASK) {
            setHistory(prev => [...prev, {
              id: uuidv4(),
              type: 'system',
              content: 'Auto-Run Stalled: No valid command found. Please provide guidance.',
              timestamp: Date.now(),
            }]);
            setAgentStatus('Stalled. Waiting for input...');
          }
        },
      },
      consecutiveStalls
    );
  }, [activeTabId, cwd, selectedModelId, models, isLiteMode, getCommandImpact, requestSafetyConfirmation, setAgentStatus, incrementAutoRunCount, setConsecutiveStalls, stopAutoRun, consecutiveStalls]);

  // Handle command finished for auto-run loop
  useTermAiEvent(
    'termai-command-finished',
    async (payload: CommandFinishedPayload) => {
      if (payload.sessionId !== activeTabId && payload.sessionId) return;

      const { command, output, exitCode } = payload;
      setRunningCommandId(null);

      if (isAutoRun) {
        addTaskStep({
          command,
          exitCode,
          output: output.substring(0, 500),
          timestamp: Date.now(),
        });
      }

      if (!isAutoRun) return;

      if (autoRunCount >= MAX_AUTO_STEPS) {
        setHistory(prev => [...prev, {
          id: uuidv4(),
          type: 'system',
          content: 'Auto-Run limit reached (10 steps). Stopping for safety.',
          timestamp: Date.now(),
        }]);
        stopAutoRun('limit');
        return;
      }

      setIsLoading(true);
      setAgentStatus('Analyzing command output...');

      try {
        const providerType = localStorage.getItem('termai_provider') || 'gemini';
        const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);

        const messages = history.filter(h => h.type !== 'command').map(h => ({ role: h.type, content: h.content }));
        const outputMsg = formatOutputMessage(command, output, exitCode, isAutoRun);
        const context = messages.map(m => `${m.role}: ${m.content}`).join('\n') + `\nSystem Output:\n${outputMsg}`;

        const selectedModel = models.find(m => m.id === selectedModelId);
        const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

        const systemPrompt = buildSystemPrompt({
          cwd,
          isAutoRun,
          isLiteMode: useLiteMode,
          sessionId: activeTabId || 'default',
          includeTerminalContext: hasContext,
        });

        const response = await llm.chat(systemPrompt, context, activeTabId);

        setHistory(prev => [...prev, {
          id: uuidv4(),
          type: 'ai',
          content: response,
          timestamp: Date.now(),
        }]);

        processAutoRunResponse(response);
      } catch {
        setHistory(prev => [...prev, {
          id: uuidv4(),
          type: 'ai',
          content: 'Error in auto-run loop.',
          timestamp: Date.now(),
        }]);
        setAgentStatus('Error encountered.');
      } finally {
        setIsLoading(false);
      }
    },
    [activeTabId, isAutoRun, autoRunCount, selectedModelId, apiKey, history, cwd, models, isLiteMode, hasContext, processAutoRunResponse, stopAutoRun, addTaskStep, setRunningCommandId, setIsLoading, setAgentStatus]
  );

  useTermAiEvent(
    'termai-command-started',
    (payload: CommandStartedPayload) => {
      if (payload.sessionId === activeTabId || !payload.sessionId) {
        setRunningCommandId(payload.commandId);
      }
    },
    [activeTabId, setRunningCommandId]
  );

  // ==================== SEND MESSAGE ====================

  const handleSend = async (overrideInput?: string, isNewConversation = false) => {
    const textToSend = overrideInput ?? input;
    if (!textToSend.trim()) return;

    // Check if it's a direct command (starts with /)
    if (textToSend.startsWith('/')) {
      handleExecute(textToSend.substring(1));
      setInput('');
      return;
    }

    // Complex Request Check
    const messagesCount = history.filter(h => h.type !== 'command').length;
    if (!overrideInput && shouldShowComplexDialog(textToSend, messagesCount)) {
      showComplexDialog(textToSend);
      return;
    }

    hideComplexDialog();

    if (isNewConversation) {
      setHistory([{
        id: uuidv4(),
        type: 'ai',
        content: 'Starting new conversation...',
        timestamp: Date.now(),
      }]);
    }

    setHistory(prev => [...prev, {
      id: uuidv4(),
      type: 'user',
      content: textToSend,
      timestamp: Date.now(),
    }]);

    setInput('');
    setAttachedFiles([]); // Clear attached files after sending
    setIsLoading(true);
    setAgentStatus('Thinking...');

    if (activeTabId) {
      const currentTab = tabs.find(t => t.id === activeTabId);
      SessionManager.saveSession({
        id: activeTabId,
        name: currentTab?.title || `Session ${activeTabId.substring(0, 6)}`,
        timestamp: Date.now(),
        preview: textToSend.substring(0, 50),
      });
    }

    try {
      const providerType = localStorage.getItem('termai_provider') || 'gemini';
      const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);

      // Fetch learned skills relevant to the query
      const learnedSkills = await KnowledgeService.searchSkills(textToSend);
      const skillsContext = learnedSkills.length > 0
        ? `\n## Learned Skills (SOPs)\n${JSON.stringify(learnedSkills.map(s => ({ condition: s.use_when, steps: s.tool_sops })), null, 2)}`
        : '';

      // Fetch RAG context from Knowledge Engine (semantic codebase search)
      // Knowledge Engine must be explicitly enabled (defaults to false)
      const knowledgeEngineEnabled = localStorage.getItem('termai_knowledge_engine_enabled') === 'true';
      // RAG defaults to true when Knowledge Engine is enabled
      const ragEnabled = localStorage.getItem('termai_rag_enabled') !== 'false';
      let ragContext = '';
      if (knowledgeEngineEnabled && ragEnabled) {
        try {
          const ragData = await KnowledgeService.getContext(textToSend, 5);
          if (ragData.count > 0) {
            ragContext = `\n## Relevant Code Context (from codebase)\n${ragData.context}\n(Sources: ${ragData.sources.join(', ')})`;
          }
        } catch (ragError) {
          console.warn('[App] RAG context fetch failed:', ragError);
          // Continue without RAG context - don't block the chat
        }
      }

      // Build attached files context
      let attachmentsContext = '';
      if (attachedFiles.length > 0) {
        const fileContents = attachedFiles
          .filter(f => f.content && !f.type.startsWith('image/'))
          .map(f => `File: ${f.name}\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n');
        
        if (fileContents) {
          attachmentsContext = `\n## Attached Files\n${fileContents}`;
        }
        
        // Note about images (for future vision model support)
        const imageFiles = attachedFiles.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
          attachmentsContext += `\n\n[${imageFiles.length} image(s) attached: ${imageFiles.map(f => f.name).join(', ')}]`;
        }
      }

      const messages = history.filter(h => h.type !== 'command').map(h => ({ role: h.type, content: h.content }));
      const context = messages.map(m => `${m.role}: ${m.content}`).join('\n') + skillsContext + ragContext + attachmentsContext + `\nUser: ${textToSend}`;

      const selectedModel = models.find(m => m.id === selectedModelId);
      const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

      const systemPrompt = buildSystemPrompt({
        cwd,
        isAutoRun,
        isLiteMode: useLiteMode,
      });

      const response = await llm.chat(systemPrompt, context, activeTabId);

      setHistory(prev => [...prev, {
        id: uuidv4(),
        type: 'ai',
        content: response,
        timestamp: Date.now(),
      }]);

      setAgentStatus(null);

      if (isAutoRun) {
        processAutoRunResponse(response);
      }
    } catch (error: unknown) {
      console.error('LLM Error:', error);
      let errorMsg = 'Sorry, something went wrong.';
      if (error instanceof Error) {
        errorMsg += ` Error: ${error.message}`;
      }
      setHistory(prev => [...prev, {
        id: uuidv4(),
        type: 'ai',
        content: errorMsg,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // ==================== FILE ATTACHMENT HANDLERS ====================
  
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: Array<{ name: string; type: string; size: number; content?: string }> = [];
    
    for (const file of Array.from(files)) {
      // Limit file size to 5MB
      if (file.size > 5 * 1024 * 1024) {
        setHistory(prev => [...prev, {
          id: uuidv4(),
          type: 'system',
          content: `File "${file.name}" is too large (max 5MB)`,
          timestamp: Date.now(),
        }]);
        continue;
      }

      // Read text-based files
      const isTextFile = file.type.startsWith('text/') || 
        /\.(js|ts|jsx|tsx|py|rb|go|rs|java|c|cpp|h|json|yaml|yml|md|html|css|sh|sql|xml)$/i.test(file.name);
      
      if (isTextFile) {
        const content = await file.text();
        newFiles.push({
          name: file.name,
          type: file.type || 'text/plain',
          size: file.size,
          content,
        });
      } else if (file.type.startsWith('image/')) {
        // For images, we'll store as base64 for potential vision model support
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          content: base64,
        });
      } else {
        newFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
        });
      }
    }

    setAttachedFiles(prev => [...prev, ...newFiles]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image size={12} />;
    return <File size={12} />;
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // ==================== DIRECTORY BROWSER ====================
  
  const fetchDirectoryContents = useCallback(async (dirPath: string) => {
    setDirBrowserLoading(true);
    setShowDrivesView(false);
    console.log('[DirBrowser] fetchDirectoryContents called with:', dirPath);
    try {
      // Try local agent first if connected
      const useLocalAgent = await LocalAgentService.shouldUseLocalAgent();
      console.log('[DirBrowser] useLocalAgent:', useLocalAgent);
      
      if (useLocalAgent) {
        // Use local agent for directory listing
        console.log('[DirBrowser] Calling LocalAgentService.listDirectory...');
        const result = await LocalAgentService.listDirectory(dirPath);
        console.log('[DirBrowser] Result from local agent:', result);
        const sorted = result.files.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        console.log('[DirBrowser] Setting items:', sorted.length, 'items');
        setDirBrowserItems(sorted);
        setDirBrowserPath(result.path);
      } else {
        // Fall back to server endpoint
        const response = await fetch(`${config.apiUrl}/api/fs/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: dirPath }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch directory');
        }
        
        const data = await response.json();
        // Sort: directories first, then files, alphabetically
        const sorted = data.files.sort((a: { isDirectory: boolean; name: string }, b: { isDirectory: boolean; name: string }) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        setDirBrowserItems(sorted);
        setDirBrowserPath(dirPath);
      }
    } catch (error) {
      console.error('Failed to fetch directory:', error);
      setDirBrowserItems([]);
      // Show error to user
      setHistory(prev => [...prev, {
        id: uuidv4(),
        type: 'system',
        content: `Failed to browse directory: ${(error as Error).message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setDirBrowserLoading(false);
    }
  }, []);

  const openDirBrowser = useCallback(() => {
    setShowDirBrowser(true);
    fetchDirectoryContents(cwd);
  }, [cwd, fetchDirectoryContents]);

  const handleDirSelect = useCallback((path: string) => {
    setCwd(path);
    setShowDirBrowser(false);
    setHistory(prev => [...prev, {
      id: uuidv4(),
      type: 'system',
      content: `Changed working directory to: ${path}`,
      timestamp: Date.now(),
    }]);
  }, []);

  const navigateToParent = useCallback(() => {
    const parentPath = dirBrowserPath === '/' ? '/' : dirBrowserPath.split('/').slice(0, -1).join('/') || '/';
    fetchDirectoryContents(parentPath);
  }, [dirBrowserPath, fetchDirectoryContents]);

  const navigateToHome = useCallback(() => {
    fetchDirectoryContents('~');
  }, [fetchDirectoryContents]);

  const fetchDrives = useCallback(async () => {
    setDirBrowserLoading(true);
    try {
      // Try local agent first (for remote access to user's machine)
      const useLocalAgent = await LocalAgentService.shouldUseLocalAgent();
      
      if (useLocalAgent) {
        const localDrives = await LocalAgentService.getDrives();
        setDrives(localDrives);
        setShowDrivesView(true);
      } else {
        // Fall back to server-side drives
        const response = await fetch(`${config.apiUrl}/api/fs/drives`);
        if (!response.ok) {
          throw new Error('Failed to fetch drives');
        }
        const data = await response.json();
        setDrives(data.drives || []);
        setShowDrivesView(true);
      }
    } catch (error) {
      console.error('Failed to fetch drives:', error);
      // Show error message to user
      setHistory(prev => [...prev, {
        id: uuidv4(),
        type: 'system',
        content: `Failed to fetch drives: ${(error as Error).message}`,
        timestamp: Date.now(),
      }]);
      setDrives([]);
    } finally {
      setDirBrowserLoading(false);
    }
  }, []);

  const navigateToDrives = useCallback(() => {
    fetchDrives();
  }, [fetchDrives]);

  const handleDriveSelect = useCallback((drivePath: string) => {
    setShowDrivesView(false);
    fetchDirectoryContents(drivePath);
  }, [fetchDirectoryContents]);

  const currentProvider = (localStorage.getItem('termai_provider') || 'gemini') as ProviderType;
  const currentSession = tabs.find(t => t.id === activeTabId);

  // ==================== RENDER ====================

  return (
    <div className="app-container">
      {/* Background Watermark */}
      <img 
        src={backgroundImg} 
        alt="" 
        className="app-background-watermark"
      />
      
      {/* TOP NAVIGATION BAR */}
      <div className="top-nav-bar">
        <button 
          className="nav-drawer-toggle"
          onClick={() => setShowLeftSidebar(!showLeftSidebar)}
          title={showLeftSidebar ? 'Hide sidebar' : 'Show sidebar'}
        >
          {showLeftSidebar ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
        <div className="top-nav-brand">
          <img src={backgroundImg} alt="TermAI" className="top-nav-logo" />
          <span>TermAI</span>
        </div>
        <button className="theme-toggle-btn" onClick={toggleTheme} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* MAIN CONTENT WRAPPER */}
      <div className="app-main-content">
        {/* LEFT SIDEBAR */}
        <div className={`left-sidebar ${!showLeftSidebar ? 'collapsed' : ''}`}>

        {/* Main Nav */}
        <div className="sidebar-nav">
          <NavItem 
            icon={<Terminal size={18} />} 
            label="Terminal" 
            onClick={() => {
              if (activeView === 'terminal') {
                addTab();
              } else {
                setActiveView('terminal');
              }
            }} 
          />
          <NavItem icon={<Workflow size={18} />} label="Flows" onClick={() => setActiveView('flows')} />
          <NavItem icon={<Search size={18} />} label="Search" />
          <NavItem icon={<Bot size={18} />} label="AI Assistant" />
        </div>

        {/* Sessions Label */}
        <div 
          className="sessions-header"
          onClick={() => setIsSessionsCollapsed(!isSessionsCollapsed)}
        >
          <div className="sessions-header-left">
            {isSessionsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>Active Sessions</span>
            <span className="sessions-count">{tabs.length}</span>
          </div>
          <Plus 
            size={14} 
            className="add-session-btn" 
            onClick={(e) => {
              e.stopPropagation();
              addTab();
            }} 
          />
        </div>

        {/* Session List */}
        <div className={`sessions-list ${isSessionsCollapsed ? 'collapsed' : ''}`}>
          {tabs.map((tab) => (
            <SessionItem 
              key={tab.id}
              id={tab.id}
              name={tab.title}
              status={tab.id === activeTabId ? 'active' : 'idle'}
              active={tab.id === activeTabId}
              onClick={handleTabClick}
              onClose={closeTab}
              onRename={renameTab}
              canClose={tabs.length > 1}
            />
          ))}
        </div>

        {/* Background Terminals */}
        <BackgroundTerminals
          isExpanded={showBackgroundTerminals}
          onToggle={() => setShowBackgroundTerminals(!showBackgroundTerminals)}
        />

        {/* Tools Section */}
        <div className="sidebar-tools">
          <NavItem icon={<Brain size={18} />} label="Knowledge Engine" onClick={() => setIsKnowledgeEngineOpen(true)} />
          <NavItem icon={<FileText size={18} />} label="Prompt Library" onClick={() => setIsPromptLibraryOpen(true)} />
          <NavItem icon={<GraduationCap size={18} />} label="Learned Skills" onClick={() => setIsSkillsOpen(true)} />
          <NavItem icon={<ScrollText size={18} />} label="Session Logs" onClick={() => setIsLogsOpen(true)} />
          <NavItem icon={<Book size={18} />} label="User Manual" onClick={() => setIsHelpOpen(true)} />
          <NavItem icon={<Settings size={18} />} label="Settings" onClick={() => setIsSettingsOpen(true)} />
        </div>
      </div>

      {/* CENTER - MAIN CONTENT */}
      <div className="center-content">
        
        {activeView === 'flows' ? (
          /* Flow Editor View */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="center-header">
              <div className="header-left">
                <span className="header-breadcrumb">Automation</span>
                <ChevronRight size={14} className="header-separator" />
                <span className="header-title">
                  <Workflow size={14} className="header-title-icon" />
                  Flow Editor
                </span>
              </div>
              <div className="header-right">
                <button 
                  className="sidebar-toggle-btn"
                  onClick={() => setActiveView('terminal')}
                  title="Back to Terminal"
                >
                  <Terminal size={18} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FlowCanvas sessionId={activeTabId} />
            </div>
          </div>
        ) : (
        <>
        {/* Terminal Tabs Header */}
        <div className="terminal-tabs-header">
          <div className="terminal-tabs-container">
            {tabs.map((tab) => (
              <div 
                key={tab.id}
                className={`terminal-tab ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => handleTabClick(tab.id)}
              >
                <Terminal size={14} className="terminal-tab-icon" />
                <span className="terminal-tab-title">{tab.title}</span>
                {tabs.length > 1 && (
                  <button 
                    className="terminal-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <button 
              className="terminal-tab-add"
              onClick={addTab}
              title="New Terminal Session"
            >
              <Plus size={14} />
            </button>
          </div>
          
          <div className="header-right">
            <div className="status-badge">System Healthy</div>
            <div className={`save-indicator ${isSaving ? 'saving' : lastSaved ? 'saved' : ''}`} title={lastSaved ? `Last saved: ${new Date(lastSaved).toLocaleTimeString()}` : 'Not saved yet'}>
              {isSaving ? (
                <>
                  <Loader size={12} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <Cloud size={12} />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <CloudOff size={12} />
                  <span>Unsaved</span>
                </>
              )}
            </div>
            {/* Auto Run Toggle */}
            <div 
              className={`auto-run-toggle ${isAutoRun ? 'active' : ''}`}
              onClick={() => toggleAutoRun()}
            >
              <div className="auto-run-indicator" />
              <span className="auto-run-label">Auto-Run</span>
            </div>
            {isAutoRun && (
              <button onClick={() => stopAutoRun('user')} className="stop-btn">
                <Square size={12} /> Stop
              </button>
            )}
            <button 
              className="sidebar-toggle-btn"
              onClick={() => setShowRightSidebar(!showRightSidebar)}
            >
              <SidebarIcon size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable History */}
        <div className="chat-history" ref={scrollRef}>
          {!hasKey ? (
            <div className="api-key-container">
              <APIKeyPrompt
                provider={currentProvider}
                isLoading={isCheckingKey}
                error={keyError}
                onSaveKey={handleSaveKey}
                onFetchOllamaModels={fetchOllamaModels}
              />
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="message-container">
                {item.type === 'system' && (
                  <div className="system-message">
                    <span className="system-message-content">{item.content}</span>
                  </div>
                )}

                {item.type === 'user' && (
                  <div className="user-message">
                    <div className="user-message-bubble">
                      <p className="user-message-text">{item.content}</p>
                      <div className="user-message-time">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )}

                {item.type === 'ai' && (
                  <div className="ai-message">
                    <div className="ai-avatar">
                      <Bot size={18} />
                    </div>
                    <div className="ai-message-content">
                      <div className="ai-message-header">TermAI Assistant</div>
                      <div className="ai-message-text">{item.content}</div>
                    </div>
                  </div>
                )}

                {item.type === 'command' && (
                  <div className="command-wrapper">
                    <div className="command-spacer" />
                    <CommandBlock 
                      item={item} 
                      onRerun={() => handleExecute(item.command || '')}
                      onCopy={() => copyToClipboard(item.command || '')}
                    />
                  </div>
                )}
              </div>
            ))
          )}

          {/* Agent Status */}
          {agentStatus && (
            <div className={`agent-status ${actualNeedsAttention ? 'attention' : ''}`}>
              {actualNeedsAttention ? (
                <span style={{ fontSize: '18px' }}>👆</span>
              ) : (
                <Loader size={16} className="animate-spin" style={{ color: '#818cf8' }} />
              )}
              <span className="agent-status-text">{agentStatus}</span>
              {actualNeedsAttention && (
                <span className="agent-status-badge">Input Required</span>
              )}
            </div>
          )}

          {/* Loading */}
          {isLoading && !agentStatus && (
            <div className="loading-indicator">
              <div className="ai-avatar">
                <Bot size={18} />
              </div>
              <div className="loading-content">
                <Loader size={14} className="animate-spin" style={{ color: '#818cf8' }} />
                <span className="loading-text">Thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        {hasKey && (
          <div className="input-area">
            {/* Attached Files Preview */}
            {attachedFiles.length > 0 && (
              <div className="attached-files">
                {attachedFiles.map((file, index) => (
                  <div key={index} className="attached-file">
                    {getFileIcon(file.type)}
                    <span className="attached-file-name">{file.name}</span>
                    <span className="attached-file-size">{formatFileSize(file.size)}</span>
                    <button 
                      className="attached-file-remove"
                      onClick={() => removeAttachedFile(index)}
                      title="Remove file"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="input-container">
              <ChevronRight size={18} className="input-prompt-icon" />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or ask AI..."
                className="input-textarea"
                rows={1}
              />
              <div className="input-actions">
                {/* File Attachment Button */}
                <button 
                  className="input-attach-btn"
                  onClick={handleFileSelect}
                  title="Attach files"
                >
                  <Paperclip size={16} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  accept=".js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.json,.yaml,.yml,.md,.html,.css,.sh,.sql,.xml,.txt,.log,image/*"
                />
                <ModelSelector
                  models={models}
                  selectedModelId={selectedModelId}
                  onSelect={handleModelSelect}
                />
                <span className="input-hint">Enter</span>
                <button 
                  onClick={() => handleSend()}
                  disabled={isLoading}
                  className="input-send-btn"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              </div>
            </div>
            <div className="input-disclaimer">
              <span>AI can make mistakes. Review commands before running.</span>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* RIGHT SIDEBAR */}
      {showRightSidebar && (
        <div className="right-sidebar">
          <div className="right-sidebar-section">
            <h3 className="right-sidebar-title">System Context</h3>
            
            <div className="status-cards">
              <StatusCard 
                label="Working Dir" 
                value={cwd.split('/').pop() || '~'} 
                icon={<FolderOpen size={14} />} 
                color="emerald" 
                onClick={openDirBrowser}
                clickable
              />
              <StatusCard label="Git Branch" value={gitBranch || 'N/A'} icon={<Cpu size={14} />} color="blue" />
              <StatusCard label="Session" value={currentSession?.title || 'N/A'} icon={<Clock size={14} />} color="indigo" />
            </div>
          </div>

          <div className="right-sidebar-section">
            <h3 className="right-sidebar-title">Recent Commands</h3>
            <div className="recent-commands-list">
              {recentCommands.length === 0 ? (
                <div className="recent-commands-empty">No commands yet</div>
              ) : (
                recentCommands.map((cmd) => (
                  <div 
                    key={cmd.id}
                    className="recent-command-item"
                    onClick={() => handleExecute(cmd.command || '')}
                  >
                    <code className={`recent-command-text ${cmd.status === 'error' ? 'error' : ''}`}>
                      {(cmd.command || '').length > 20 ? (cmd.command || '').slice(0, 20) + '...' : cmd.command}
                    </code>
                    <span className={`recent-command-time ${cmd.status === 'error' ? 'error' : ''}`}>
                      {cmd.status === 'error' ? 'Failed' : formatTimeAgo(cmd.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      </div>{/* END app-main-content */}

      {/* Complex Request Dialog */}
      {showComplexConfirm && (
        <ComplexRequestDialog
          onStartNew={() => handleSend(pendingComplexMessage, true)}
          onContinue={() => handleSend(pendingComplexMessage, false)}
        />
      )}

      {/* Safety Confirm Dialog */}
      {showSafetyConfirm && pendingSafetyCommand && (
        <SafetyConfirmDialog
          command={pendingSafetyCommand.command}
          impact={pendingSafetyCommand.impact}
          risk={pendingSafetyCommand.risk}
          allowAllOption={pendingSafetyCommand.allowAllOption}
          onConfirm={(allowAll) => handleSafetyConfirm(true, allowAll)}
          onCancel={() => handleSafetyConfirm(false)}
        />
      )}

      {/* Modals */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <SessionLogsModal isOpen={isLogsOpen} onClose={() => setIsLogsOpen(false)} />
      {isSkillsOpen && <LearnedSkillsModal onClose={() => setIsSkillsOpen(false)} />}
      <UserManualModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <KnowledgeEngineModal
        isOpen={isKnowledgeEngineOpen}
        onClose={() => setIsKnowledgeEngineOpen(false)}
        currentCwd={cwd}
      />
      <PromptLibraryModal
        isOpen={isPromptLibraryOpen}
        onClose={() => setIsPromptLibraryOpen(false)}
      />

      {/* Local Agent Setup Modal */}
      {showLocalAgentSetup && (
        <LocalAgentPrompt
          isModal={true}
          onConnected={() => {
            setShowLocalAgentSetup(false);
            localStorage.setItem('termai_local_agent_setup_complete', 'true');
          }}
          onSkip={() => {
            setShowLocalAgentSetup(false);
            localStorage.setItem('termai_local_agent_skipped', 'true');
          }}
          onDismiss={() => {
            setShowLocalAgentSetup(false);
            localStorage.setItem('termai_local_agent_skipped', 'true');
          }}
          showSkip={true}
        />
      )}

      {/* Directory Browser Modal */}
      {showDirBrowser && (
        <div className="modal-overlay" onClick={() => setShowDirBrowser(false)}>
          <div className="dir-browser-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dir-browser-header">
              <h3>Select Working Directory</h3>
              <div className="dir-browser-header-right">
                <div className={`local-agent-status ${localAgentConnected ? 'connected' : 'disconnected'}`} title={localAgentConnected ? 'Local agent connected - showing your local drives' : 'Local agent not running - showing server drives'}>
                  <div className="local-agent-dot" />
                  <span>{localAgentConnected ? 'Local' : 'Server'}</span>
                </div>
                <button className="modal-close-btn" onClick={() => setShowDirBrowser(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="dir-browser-toolbar">
              <button className="dir-browser-nav-btn" onClick={navigateToDrives} title="Show all drives/volumes">
                <HardDrive size={16} />
              </button>
              <button className="dir-browser-nav-btn" onClick={navigateToParent} title="Go to parent directory" disabled={showDrivesView}>
                <ChevronUp size={16} />
              </button>
              <button className="dir-browser-nav-btn" onClick={navigateToHome} title="Go to home directory">
                <Home size={16} />
              </button>
              <div className="dir-browser-path">
                <FolderOpen size={14} />
                <span>{showDrivesView ? 'Drives / Volumes' : dirBrowserPath}</span>
              </div>
            </div>

            <div className="dir-browser-content">
              {dirBrowserLoading ? (
                <div className="dir-browser-loading">
                  <Loader size={20} className="animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : showDrivesView ? (
                // Drives/Volumes View
                drives.length === 0 ? (
                  <div className="dir-browser-empty">No drives found</div>
                ) : (
                  <div className="dir-browser-list">
                    {drives.map((drive) => (
                      <div 
                        key={drive.path}
                        className="dir-browser-item drive-item"
                        onClick={() => handleDriveSelect(drive.path)}
                      >
                        <HardDrive size={16} className="dir-browser-item-icon drive" />
                        <span className="dir-browser-item-name">{drive.name}</span>
                        <span className="dir-browser-item-type">{drive.type}</span>
                      </div>
                    ))}
                  </div>
                )
              ) : dirBrowserItems.length === 0 ? (
                <div className="dir-browser-empty">No items found</div>
              ) : (
                <div className="dir-browser-list">
                  {dirBrowserItems.filter(item => item.isDirectory).map((item) => (
                    <div 
                      key={item.path}
                      className="dir-browser-item"
                      onClick={() => fetchDirectoryContents(item.path)}
                      onDoubleClick={() => handleDirSelect(item.path)}
                    >
                      <Folder size={16} className="dir-browser-item-icon folder" />
                      <span className="dir-browser-item-name">{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dir-browser-footer">
              <div className="dir-browser-selected">
                <span>Selected:</span>
                <code>{dirBrowserPath}</code>
              </div>
              <div className="dir-browser-actions">
                <button className="dir-browser-cancel-btn" onClick={() => setShowDirBrowser(false)}>
                  Cancel
                </button>
                <button className="dir-browser-select-btn" onClick={() => handleDirSelect(dirBrowserPath)}>
                  Select This Directory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
