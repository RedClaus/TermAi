/**
 * APIKeyPrompt
 * Displays prompt for API key configuration
 */

import React, { useState } from "react";
import { Loader } from "lucide-react";
import styles from "./APIKeyPrompt.module.css";
import { config } from "../../config";
import type { ProviderType } from "../../types";

interface APIKeyPromptProps {
  provider: ProviderType;
  isLoading: boolean;
  error: string | null;
  onSaveKey: (key: string) => void;
  onFetchOllamaModels: (endpoint: string) => void;
}

export const APIKeyPrompt: React.FC<APIKeyPromptProps> = ({
  provider,
  isLoading,
  error,
  onSaveKey,
  onFetchOllamaModels,
}) => {
  const [inputValue, setInputValue] = useState("");

  const isOllama = provider === "ollama";
  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onSaveKey(inputValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className={styles.container}>
      <p className={styles.prompt}>
        {isOllama
          ? "Enter Ollama Endpoint URL:"
          : `Please configure your ${providerLabel} API Key:`}
      </p>

      <div className={styles.inputRow}>
        <input
          type={isOllama ? "text" : "password"}
          className={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isOllama ? "http://localhost:11434" : "Enter API Key"}
        />

        {isOllama && (
          <button
            className={styles.secondaryButton}
            onClick={() =>
              onFetchOllamaModels(inputValue || config.defaultOllamaEndpoint)
            }
          >
            Fetch Models
          </button>
        )}

        <button
          className={styles.primaryButton}
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? <Loader size={14} className={styles.spinner} /> : "Save"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <p className={styles.hint}>
        {isOllama
          ? "Default: http://localhost:11434. No key required."
          : "Key is stored securely on the server, not in your browser."}
      </p>
    </div>
  );
};
