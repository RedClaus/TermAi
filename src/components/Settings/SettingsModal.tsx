import React, { useState, useEffect } from "react";
import styles from "./SettingsModal.module.css";
import { X, Check, AlertCircle, Loader } from "lucide-react";
import { LLMManager } from "../../services/LLMManager";
import { config } from "../../config";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Provider = "gemini" | "openai" | "anthropic" | "ollama";

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

  // API key inputs (only used for setting, never displayed)
  const [geminiKey, setGeminiKey] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");

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
    }
  }, [isOpen]);

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
      }));
    } catch (error) {
      console.error("Failed to check provider keys:", error);
      setProviderStatus((prev) => ({
        ...prev,
        gemini: { ...prev.gemini, checking: false },
        openai: { ...prev.openai, checking: false },
        anthropic: { ...prev.anthropic, checking: false },
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

  const handleSave = () => {
    // Save provider preference locally
    localStorage.setItem("termai_provider", provider);

    // Save Ollama endpoint locally (not sensitive)
    if (ollamaEndpoint) {
      localStorage.setItem("termai_ollama_endpoint", ollamaEndpoint);
    }

    // Notify other components that settings have changed
    window.dispatchEvent(new Event("termai-settings-changed"));

    if (provider === "ollama") {
      window.dispatchEvent(
        new CustomEvent("termai-fetch-models", {
          detail: { endpoint: ollamaEndpoint },
        }),
      );
    }

    onClose();
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

            {provider === "gemini" && (
              <div className={styles.inputGroup}>
                <label className={styles.label}>
                  Google Gemini API Key
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
                        ? "••••••••••••••••"
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
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
                {providerStatus.gemini.error && (
                  <p className={styles.error}>{providerStatus.gemini.error}</p>
                )}
              </div>
            )}

            {provider === "openai" && (
              <div className={styles.inputGroup}>
                <label className={styles.label}>
                  OpenAI API Key
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
                        ? "••••••••••••••••"
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
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
                {providerStatus.openai.error && (
                  <p className={styles.error}>{providerStatus.openai.error}</p>
                )}
              </div>
            )}

            {provider === "anthropic" && (
              <div className={styles.inputGroup}>
                <label className={styles.label}>
                  Anthropic API Key
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
                        ? "••••••••••••••••"
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
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
                {providerStatus.anthropic.error && (
                  <p className={styles.error}>
                    {providerStatus.anthropic.error}
                  </p>
                )}
              </div>
            )}

            {provider === "ollama" && (
              <div className={styles.inputGroup}>
                <label className={styles.label}>Ollama Endpoint URL</label>
                <input
                  type="text"
                  className={styles.input}
                  value={ollamaEndpoint}
                  onChange={(e) => setOllamaEndpoint(e.target.value)}
                  placeholder="http://localhost:11434"
                />
                <p className={styles.hint}>
                  Default is http://localhost:11434. No API key required.
                </p>
              </div>
            )}
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
    </div>
  );
};
