import React, { useState, useEffect, useCallback } from "react";
import styles from "./SettingsModal.module.css";
import { X, Check, AlertCircle, Loader, Sun, Contrast, Brain, RotateCcw, Trash2, Upload } from "lucide-react";
import { LLMManager } from "../../services/LLMManager";
import { config } from "../../config";
import { Toggle } from "../common";
import { KnowledgeService } from "../../services/KnowledgeService";
import { LocalAgentService } from "../../services/LocalAgentService";
import { ImportWizard } from "../KnowledgeImport";

// Contrast presets with text color values
const CONTRAST_PRESETS = {
  low: {
    label: "Low",
    textPrimary: "#a1a1aa",    // Zinc-400
    textSecondary: "#71717a",   // Zinc-500
    textTertiary: "#52525b",    // Zinc-600
  },
  medium: {
    label: "Medium",
    textPrimary: "#d4d4d8",    // Zinc-300
    textSecondary: "#a1a1aa",   // Zinc-400
    textTertiary: "#71717a",    // Zinc-500
  },
  default: {
    label: "Default",
    textPrimary: "#e4e4e7",    // Zinc-200
    textSecondary: "#a1a1aa",   // Zinc-400
    textTertiary: "#71717a",    // Zinc-500
  },
  high: {
    label: "High",
    textPrimary: "#f4f4f5",    // Zinc-100
    textSecondary: "#d4d4d8",   // Zinc-300
    textTertiary: "#a1a1aa",    // Zinc-400
  },
  max: {
    label: "Maximum",
    textPrimary: "#fafafa",    // Zinc-50
    textSecondary: "#e4e4e7",   // Zinc-200
    textTertiary: "#d4d4d8",    // Zinc-300
  },
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Provider = "gemini" | "openai" | "anthropic" | "ollama" | "xai" | "openrouter";

interface ProviderStatus {
  hasKey: boolean;
  checking: boolean;
  saving: boolean;
  error: string | null;
  success: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [ollamaEndpoint, setOllamaEndpoint] = useState(
    config.defaultOllamaEndpoint,
  );
  const [autoObserve, setAutoObserve] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [knowledgeEngineEnabled, setKnowledgeEngineEnabled] = useState(false);
  const [knowledgeEngineStatus, setKnowledgeEngineStatus] = useState<string>("unknown");
  const [contrastLevel, setContrastLevel] = useState(50); // 0-100 scale

  // API key inputs (only used for setting, never displayed)
  const [geminiKey, setGeminiKey] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [xaiKey, setXaiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");

  // Reset confirmation state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Import wizard state
  const [showImportWizard, setShowImportWizard] = useState(false);

  // Status for each provider
  const [providerStatus, setProviderStatus] = useState<
    Record<Provider, ProviderStatus>
  >({
    gemini: {
      hasKey: false,
      checking: true,
      saving: false,
      error: null,
      success: false,
    },
    openai: {
      hasKey: false,
      checking: true,
      saving: false,
      error: null,
      success: false,
    },
    anthropic: {
      hasKey: false,
      checking: true,
      saving: false,
      error: null,
      success: false,
    },
    xai: {
      hasKey: false,
      checking: true,
      saving: false,
      error: null,
      success: false,
    },
    openrouter: {
      hasKey: false,
      checking: true,
      saving: false,
      error: null,
      success: false,
    },
    ollama: {
      hasKey: true,
      checking: false,
      saving: false,
      error: null,
      success: false,
    },
  });

  // Check which providers have keys on load
  useEffect(() => {
    if (isOpen) {
      checkProviderKeys();
      // Load saved provider preference and Ollama endpoint
      const storedProvider =
        (localStorage.getItem("termai_provider") as Provider) || "gemini";
      setProvider(storedProvider);
      const storedEndpoint =
        localStorage.getItem("termai_ollama_endpoint") ||
        config.defaultOllamaEndpoint;
      setOllamaEndpoint(storedEndpoint);
      const storedObserve =
        localStorage.getItem("termai_auto_observe") === "true";
      setAutoObserve(storedObserve);
      const storedRag =
        localStorage.getItem("termai_rag_enabled") !== "false"; // Default: enabled
      setRagEnabled(storedRag);
      
      // Load contrast setting
      const storedContrast = localStorage.getItem("termai_contrast");
      if (storedContrast) {
        const level = parseInt(storedContrast, 10);
        setContrastLevel(level);
      }
      
      // Load Knowledge Engine setting and check status
      const storedKE = localStorage.getItem("termai_knowledge_engine_enabled");
      // Default to false if not set (requires explicit enabling)
      setKnowledgeEngineEnabled(storedKE === "true");
      checkKnowledgeEngineStatus();
    }
  }, [isOpen]);

  // Check Knowledge Engine status from server
  const checkKnowledgeEngineStatus = async () => {
    try {
      console.log('[Settings] Checking Knowledge Engine status...');
      const status = await KnowledgeService.getStatus();
      console.log('[Settings] Knowledge Engine status:', status);
      if (status && status.initialized) {
        setKnowledgeEngineStatus("running");
      } else {
        setKnowledgeEngineStatus("stopped");
      }
    } catch (err) {
      console.error('[Settings] Knowledge Engine status error:', err);
      setKnowledgeEngineStatus("unavailable");
    }
  };

  // Apply contrast changes in real-time
  const applyContrast = useCallback((level: number) => {
    const root = document.documentElement;
    const isDark = root.getAttribute("data-theme") !== "light";
    
    if (!isDark) return; // Only apply to dark theme
    
    // Map 0-100 to contrast presets
    let preset: keyof typeof CONTRAST_PRESETS;
    if (level <= 15) preset = "low";
    else if (level <= 35) preset = "medium";
    else if (level <= 65) preset = "default";
    else if (level <= 85) preset = "high";
    else preset = "max";
    
    const colors = CONTRAST_PRESETS[preset];
    root.style.setProperty("--text-primary", colors.textPrimary);
    root.style.setProperty("--text-secondary", colors.textSecondary);
    root.style.setProperty("--text-tertiary", colors.textTertiary);
  }, []);

  // Get current contrast preset label
  const getContrastLabel = (level: number): string => {
    if (level <= 15) return CONTRAST_PRESETS.low.label;
    if (level <= 35) return CONTRAST_PRESETS.medium.label;
    if (level <= 65) return CONTRAST_PRESETS.default.label;
    if (level <= 85) return CONTRAST_PRESETS.high.label;
    return CONTRAST_PRESETS.max.label;
  };

  const handleContrastChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const level = parseInt(e.target.value, 10);
    console.log('[Settings] Contrast changed to:', level, getContrastLabel(level));
    setContrastLevel(level);
    applyContrast(level);
  };

  const checkProviderKeys = async () => {
    try {
      const configured = await LLMManager.getConfiguredProviders();
      setProviderStatus((prev) => ({
        ...prev,
        gemini: { ...prev.gemini, hasKey: configured.gemini, checking: false },
        openai: { ...prev.openai, hasKey: configured.openai, checking: false },
        anthropic: {
          ...prev.anthropic,
          hasKey: configured.anthropic,
          checking: false,
        },
        xai: { ...prev.xai, hasKey: configured.xai, checking: false },
        openrouter: { ...prev.openrouter, hasKey: configured.openrouter, checking: false },
      }));
    } catch (error) {
      console.error("Failed to check provider keys:", error);
      setProviderStatus((prev) => ({
        ...prev,
        gemini: { ...prev.gemini, checking: false },
        openai: { ...prev.openai, checking: false },
        anthropic: { ...prev.anthropic, checking: false },
        xai: { ...prev.xai, checking: false },
        openrouter: { ...prev.openrouter, checking: false },
      }));
    }
  };

  const handleSaveKey = async (providerName: Provider, key: string) => {
    if (!key.trim()) return;

    setProviderStatus((prev) => ({
      ...prev,
      [providerName]: {
        ...prev[providerName],
        saving: true,
        error: null,
        success: false,
      },
    }));

    try {
      await LLMManager.setApiKey(providerName, key);
      setProviderStatus((prev) => ({
        ...prev,
        [providerName]: {
          ...prev[providerName],
          saving: false,
          hasKey: true,
          success: true,
        },
      }));

      // Clear the input after successful save
      switch (providerName) {
        case "gemini":
          setGeminiKey("");
          break;
        case "openai":
          setOpenAIKey("");
          break;
        case "anthropic":
          setAnthropicKey("");
          break;
        case "xai":
          setXaiKey("");
          break;
        case "openrouter":
          setOpenrouterKey("");
          break;
      }

      // Reset success state after 2 seconds
      setTimeout(() => {
        setProviderStatus((prev) => ({
          ...prev,
          [providerName]: { ...prev[providerName], success: false },
        }));
      }, 2000);
    } catch (error) {
      setProviderStatus((prev) => ({
        ...prev,
        [providerName]: {
          ...prev[providerName],
          saving: false,
          error: (error as Error).message,
        },
      }));
    }
  };

  const handleDeleteKey = async (providerName: Provider) => {
    if (!providerStatus[providerName].hasKey) return;

    setProviderStatus((prev) => ({
      ...prev,
      [providerName]: {
        ...prev[providerName],
        saving: true,
        error: null,
        success: false,
      },
    }));

    try {
      await LLMManager.deleteApiKey(providerName);
      setProviderStatus((prev) => ({
        ...prev,
        [providerName]: {
          ...prev[providerName],
          saving: false,
          hasKey: false,
          success: true,
        },
      }));

      // Reset success state after 2 seconds
      setTimeout(() => {
        setProviderStatus((prev) => ({
          ...prev,
          [providerName]: { ...prev[providerName], success: false },
        }));
      }, 2000);
    } catch (error) {
      setProviderStatus((prev) => ({
        ...prev,
        [providerName]: {
          ...prev[providerName],
          saving: false,
          error: (error as Error).message,
        },
      }));
    }
  };

  const handleSave = () => {
    // Save provider preference locally
    localStorage.setItem("termai_provider", provider);

    // Save Ollama endpoint locally (not sensitive)
    if (ollamaEndpoint) {
      localStorage.setItem("termai_ollama_endpoint", ollamaEndpoint);
    }

    localStorage.setItem("termai_auto_observe", String(autoObserve));
    localStorage.setItem("termai_rag_enabled", String(ragEnabled));
    localStorage.setItem("termai_contrast", String(contrastLevel));
    localStorage.setItem("termai_knowledge_engine_enabled", String(knowledgeEngineEnabled));

    // Notify other components that settings have changed
    window.dispatchEvent(new Event("termai-settings-changed"));

    // Update Knowledge Engine config if enabled
    if (knowledgeEngineEnabled) {
      // Don't await this to keep UI responsive, it will update in background
      KnowledgeService.updateConfig(provider, ollamaEndpoint).then(() => {
        checkKnowledgeEngineStatus();
      });
    }

    if (provider === "ollama") {
      window.dispatchEvent(
        new CustomEvent("termai-fetch-models", {
          detail: { endpoint: ollamaEndpoint },
        }),
      );
    }

    onClose();
  };

  const handleResetToDefaults = async () => {
    setIsResetting(true);
    
    try {
      // List of all TermAI localStorage keys to clear
      const keysToRemove = [
        'termai_provider',
        'termai_ollama_endpoint',
        'termai_auto_observe',
        'termai_rag_enabled',
        'termai_contrast',
        'termai_knowledge_engine_enabled',
        'termai_theme',
        'termai_tabs',
        'termai_active_tab',
        'termai_local_agent_url',
        'termai_local_agent_disabled',
        'termai_local_agent_skipped',
        'termai_local_agent_setup_complete',
        'termai_provider',
        'termai_ai_height_percent',
        'termai_ollama_endpoint',
        'termai_preview_mode',
      ];
      
      // Also clear any session-specific keys
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (key.startsWith('termai_cwd_') || 
            key.startsWith('termai_session_') ||
            key.startsWith('termai_history_') ||
            key.startsWith('termai_model_')) {
          keysToRemove.push(key);
        }
      });
      
      // Remove all keys
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Clear API keys from local agent if connected
      try {
        const isConnected = await LocalAgentService.checkConnection();
        if (isConnected) {
          // Clear all provider keys
          await Promise.all([
            LocalAgentService.setApiKey('gemini', null),
            LocalAgentService.setApiKey('openai', null),
            LocalAgentService.setApiKey('anthropic', null),
            LocalAgentService.setApiKey('xai', null),
            LocalAgentService.setApiKey('openrouter', null),
            LocalAgentService.setApiKey('ollama', null),
          ]);
        }
      } catch (agentError) {
        console.warn('Could not clear local agent keys:', agentError);
      }
      
      // Reset CSS variables to defaults
      const root = document.documentElement;
      root.style.removeProperty('--text-primary');
      root.style.removeProperty('--text-secondary');
      root.style.removeProperty('--text-tertiary');
      root.setAttribute('data-theme', 'dark');
      
      // Notify other components
      window.dispatchEvent(new Event("termai-settings-changed"));
      window.dispatchEvent(new CustomEvent("termai-factory-reset"));
      
      // Close modal and reload the page to apply all changes
      setShowResetConfirm(false);
      onClose();
      
      // Small delay to let the modal close, then reload
      setTimeout(() => {
        window.location.reload();
      }, 100);
      
    } catch (error) {
      console.error('Error during reset:', error);
      alert('Failed to reset settings. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const renderProviderStatus = (providerName: Provider) => {
    const status = providerStatus[providerName];

    if (status.checking) {
      return <Loader size={14} className={styles.spinner} />;
    }

    if (status.success) {
      return <Check size={14} className={styles.successIcon} />;
    }

    if (status.hasKey) {
      return (
        <span className={styles.keyConfigured}>
          <Check size={12} /> Configured
        </span>
      );
    }

    return (
      <span className={styles.keyMissing}>
        <AlertCircle size={12} /> Not set
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Settings</div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Brain size={16} style={{ marginRight: "8px" }} />
              Knowledge Engine
            </div>
            <div className={styles.inputGroup}>
              <div className={styles.keStatusRow}>
                <Toggle
                  checked={knowledgeEngineEnabled}
                  onChange={(checked) => setKnowledgeEngineEnabled(checked)}
                  label="Enable Knowledge Engine"
                  labelPosition="right"
                />
                <span className={`${styles.keStatus} ${styles[knowledgeEngineStatus]}`}>
                  {knowledgeEngineStatus === "running" && "Running"}
                  {knowledgeEngineStatus === "stopped" && "Stopped"}
                  {knowledgeEngineStatus === "unavailable" && "Unavailable"}
                  {knowledgeEngineStatus === "unknown" && "Checking..."}
                </span>
              </div>
              <p className={styles.hint} style={{ marginTop: "8px" }}>
                The Knowledge Engine indexes your codebase for semantic search (RAG).
                Uses your selected AI provider for embeddings (OpenAI or Ollama).
              </p>
            </div>
            <div className={styles.inputGroup} style={{ marginTop: "16px" }}>
              <Toggle
                checked={ragEnabled}
                onChange={(checked) => setRagEnabled(checked)}
                label="Enable Codebase Context (RAG)"
                labelPosition="right"
                disabled={!knowledgeEngineEnabled}
              />
              <p className={styles.hint} style={{ marginTop: "8px" }}>
                Automatically searches your indexed codebase for relevant context when you ask questions.
                {!knowledgeEngineEnabled && (
                  <span style={{ color: "var(--warning)", display: "block", marginTop: "4px" }}>
                    Enable Knowledge Engine first to use RAG.
                  </span>
                )}
              </p>
            </div>
            <div className={styles.inputGroup} style={{ marginTop: "16px" }}>
              <Toggle
                checked={autoObserve}
                onChange={(checked) => setAutoObserve(checked)}
                label="Enable Continuous Learning (Auto-Observer)"
                labelPosition="right"
              />
              <p className={styles.hint} style={{ marginTop: "8px" }}>
                Automatically analyzes successful tasks to learn new skills.
                <span
                  style={{
                    color: "var(--warning)",
                    display: "block",
                    marginTop: "4px",
                  }}
                >
                  Warning: Uses extra tokens after each Auto-Run.
                </span>
              </p>
            </div>

            <div className={styles.inputGroup} style={{ marginTop: "16px" }}>
              <label className={styles.label}>Import Knowledge</label>
              <button
                type="button"
                className={styles.importBtn}
                onClick={() => setShowImportWizard(true)}
              >
                <Upload size={16} />
                Import Conversations
              </button>
              <p className={styles.hint} style={{ marginTop: "8px" }}>
                Import conversation exports from Claude, ChatGPT, Warp, Cursor, and other AI tools
                to extract knowledge patterns and add them to your skill library.
              </p>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Contrast size={16} style={{ marginRight: "8px" }} />
              Display
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>
                Text Contrast
                <span className={styles.contrastValue}>{getContrastLabel(contrastLevel)}</span>
              </label>
              <div className={styles.sliderContainer}>
                <Sun size={14} className={styles.sliderIconLow} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={contrastLevel}
                  onChange={handleContrastChange}
                  className={styles.slider}
                  style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                />
                <Sun size={14} className={styles.sliderIconHigh} />
              </div>
              <div className={styles.sliderLabels}>
                <span>Low</span>
                <span>Default</span>
                <span>High</span>
              </div>
              <p className={styles.hint}>
                Adjust text brightness for comfortable reading. Lower values reduce eye strain in dark environments.
              </p>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>AI Provider</div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Select Active Provider</label>
              <select
                className={styles.select}
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI (GPT-4)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="xai">xAI (Grok)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              API Keys
              <span className={styles.securityNote}>
                Keys are stored securely on the server
              </span>
            </div>

            {/* Google Gemini */}
            <div className={`${styles.inputGroup} ${provider === "gemini" ? styles.activeProvider : ""}`}>
              <label className={styles.label}>
                Google Gemini API Key
                {provider === "gemini" && <span className={styles.activeLabel}>Active</span>}
                {renderProviderStatus("gemini")}
              </label>
              <div className={styles.keyInputRow}>
                <input
                  type="password"
                  className={styles.input}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={
                    providerStatus.gemini.hasKey
                      ? "••••••••••••••••  (enter new key to update)"
                      : "Enter your Gemini API Key"
                  }
                />
                <button
                  className={styles.saveKeyBtn}
                  onClick={() => handleSaveKey("gemini", geminiKey)}
                  disabled={!geminiKey.trim() || providerStatus.gemini.saving}
                >
                  {providerStatus.gemini.saving ? (
                    <Loader size={14} className={styles.spinner} />
                  ) : providerStatus.gemini.hasKey ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </button>
                {providerStatus.gemini.hasKey && (
                  <button
                    className={styles.deleteKeyBtn}
                    onClick={() => handleDeleteKey("gemini")}
                    disabled={providerStatus.gemini.saving}
                    title="Delete API key"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {providerStatus.gemini.error && (
                <p className={styles.error}>{providerStatus.gemini.error}</p>
              )}
            </div>

            {/* OpenAI */}
            <div className={`${styles.inputGroup} ${provider === "openai" ? styles.activeProvider : ""}`}>
              <label className={styles.label}>
                OpenAI API Key
                {provider === "openai" && <span className={styles.activeLabel}>Active</span>}
                {renderProviderStatus("openai")}
              </label>
              <div className={styles.keyInputRow}>
                <input
                  type="password"
                  className={styles.input}
                  value={openAIKey}
                  onChange={(e) => setOpenAIKey(e.target.value)}
                  placeholder={
                    providerStatus.openai.hasKey
                      ? "••••••••••••••••  (enter new key to update)"
                      : "Enter your OpenAI API Key"
                  }
                />
                <button
                  className={styles.saveKeyBtn}
                  onClick={() => handleSaveKey("openai", openAIKey)}
                  disabled={!openAIKey.trim() || providerStatus.openai.saving}
                >
                  {providerStatus.openai.saving ? (
                    <Loader size={14} className={styles.spinner} />
                  ) : providerStatus.openai.hasKey ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </button>
                {providerStatus.openai.hasKey && (
                  <button
                    className={styles.deleteKeyBtn}
                    onClick={() => handleDeleteKey("openai")}
                    disabled={providerStatus.openai.saving}
                    title="Delete API key"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {providerStatus.openai.error && (
                <p className={styles.error}>{providerStatus.openai.error}</p>
              )}
              <p className={styles.hint}>
                Also used for Knowledge Engine embeddings if Ollama is unavailable.
              </p>
            </div>

            {/* Anthropic */}
            <div className={`${styles.inputGroup} ${provider === "anthropic" ? styles.activeProvider : ""}`}>
              <label className={styles.label}>
                Anthropic API Key
                {provider === "anthropic" && <span className={styles.activeLabel}>Active</span>}
                {renderProviderStatus("anthropic")}
              </label>
              <div className={styles.keyInputRow}>
                <input
                  type="password"
                  className={styles.input}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder={
                    providerStatus.anthropic.hasKey
                      ? "••••••••••••••••  (enter new key to update)"
                      : "Enter your Anthropic API Key"
                  }
                />
                <button
                  className={styles.saveKeyBtn}
                  onClick={() => handleSaveKey("anthropic", anthropicKey)}
                  disabled={
                    !anthropicKey.trim() || providerStatus.anthropic.saving
                  }
                >
                  {providerStatus.anthropic.saving ? (
                    <Loader size={14} className={styles.spinner} />
                  ) : providerStatus.anthropic.hasKey ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </button>
                {providerStatus.anthropic.hasKey && (
                  <button
                    className={styles.deleteKeyBtn}
                    onClick={() => handleDeleteKey("anthropic")}
                    disabled={providerStatus.anthropic.saving}
                    title="Delete API key"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {providerStatus.anthropic.error && (
                <p className={styles.error}>
                  {providerStatus.anthropic.error}
                </p>
              )}
            </div>

            {/* xAI / Grok */}
            <div className={`${styles.inputGroup} ${provider === "xai" ? styles.activeProvider : ""}`}>
              <label className={styles.label}>
                xAI (Grok) API Key
                {provider === "xai" && <span className={styles.activeLabel}>Active</span>}
                {renderProviderStatus("xai")}
              </label>
              <div className={styles.keyInputRow}>
                <input
                  type="password"
                  className={styles.input}
                  value={xaiKey}
                  onChange={(e) => setXaiKey(e.target.value)}
                  placeholder={
                    providerStatus.xai.hasKey
                      ? "••••••••••••••••  (enter new key to update)"
                      : "Enter your xAI API Key"
                  }
                />
                <button
                  className={styles.saveKeyBtn}
                  onClick={() => handleSaveKey("xai", xaiKey)}
                  disabled={
                    !xaiKey.trim() || providerStatus.xai.saving
                  }
                >
                  {providerStatus.xai.saving ? (
                    <Loader size={14} className={styles.spinner} />
                  ) : providerStatus.xai.hasKey ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </button>
                {providerStatus.xai.hasKey && (
                  <button
                    className={styles.deleteKeyBtn}
                    onClick={() => handleDeleteKey("xai")}
                    disabled={providerStatus.xai.saving}
                    title="Delete API key"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {providerStatus.xai.error && (
                <p className={styles.error}>
                  {providerStatus.xai.error}
                </p>
              )}
            </div>

            {/* OpenRouter */}
            <div className={`${styles.inputGroup} ${provider === "openrouter" ? styles.activeProvider : ""}`}>
              <label className={styles.label}>
                OpenRouter API Key
                {provider === "openrouter" && <span className={styles.activeLabel}>Active</span>}
                {renderProviderStatus("openrouter")}
              </label>
              <div className={styles.keyInputRow}>
                <input
                  type="password"
                  className={styles.input}
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder={
                    providerStatus.openrouter.hasKey
                      ? "••••••••••••••••  (enter new key to update)"
                      : "Enter your OpenRouter API Key"
                  }
                />
                <button
                  className={styles.saveKeyBtn}
                  onClick={() => handleSaveKey("openrouter", openrouterKey)}
                  disabled={
                    !openrouterKey.trim() || providerStatus.openrouter.saving
                  }
                >
                  {providerStatus.openrouter.saving ? (
                    <Loader size={14} className={styles.spinner} />
                  ) : providerStatus.openrouter.hasKey ? (
                    "Update"
                  ) : (
                    "Save"
                  )}
                </button>
                {providerStatus.openrouter.hasKey && (
                  <button
                    className={styles.deleteKeyBtn}
                    onClick={() => handleDeleteKey("openrouter")}
                    disabled={providerStatus.openrouter.saving}
                    title="Delete API key"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {providerStatus.openrouter.error && (
                <p className={styles.error}>
                  {providerStatus.openrouter.error}
                </p>
              )}
            </div>

            {/* Ollama */}
            <div className={`${styles.inputGroup} ${provider === "ollama" ? styles.activeProvider : ""}`}>
              <label className={styles.label}>
                Ollama Endpoint URL
                {provider === "ollama" && <span className={styles.activeLabel}>Active</span>}
                <span className={styles.keyConfigured}>
                  <Check size={12} /> No key needed
                </span>
              </label>
              <input
                type="text"
                className={styles.input}
                value={ollamaEndpoint}
                onChange={(e) => setOllamaEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
              />
              <p className={styles.hint}>
                Default is http://localhost:11434. Also used for Knowledge Engine embeddings.
              </p>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Security Info</div>
            <div className={styles.securityInfo}>
              <p>
                API keys are sent to and stored on your local TermAI server.
                They are never exposed to the browser or sent to external
                services other than the respective AI provider.
              </p>
              <p>
                Keys set via this interface are stored in memory and will be
                cleared when the server restarts. For persistent storage, set
                keys in the server's .env file.
              </p>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <RotateCcw size={16} style={{ marginRight: "8px" }} />
              Reset
            </div>
            {!showResetConfirm ? (
              <div className={styles.resetSection}>
                <p className={styles.hint}>
                  Reset TermAI to factory defaults. This will clear all settings, 
                  API keys, session history, and preferences.
                </p>
                <button
                  className={styles.resetBtn}
                  onClick={() => setShowResetConfirm(true)}
                >
                  <RotateCcw size={14} />
                  Reset to Factory Defaults
                </button>
              </div>
            ) : (
              <div className={styles.resetConfirm}>
                <div className={styles.resetWarning}>
                  <AlertCircle size={20} />
                  <div>
                    <strong>Are you sure?</strong>
                    <p>This action cannot be undone. All your settings, API keys, and session data will be permanently deleted.</p>
                  </div>
                </div>
                <div className={styles.resetActions}>
                  <button
                    className={styles.resetCancelBtn}
                    onClick={() => setShowResetConfirm(false)}
                    disabled={isResetting}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.resetConfirmBtn}
                    onClick={handleResetToDefaults}
                    disabled={isResetting}
                  >
                    {isResetting ? (
                      <>
                        <Loader size={14} className={styles.spinner} />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <RotateCcw size={14} />
                        Yes, Reset Everything
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSave}
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Import Wizard Modal */}
      <ImportWizard
        isOpen={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        onComplete={() => {
          setShowImportWizard(false);
          // Could refresh skills count or show a success message
        }}
      />
    </div>
  );
};
