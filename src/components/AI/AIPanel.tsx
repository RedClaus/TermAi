/**
 * AIPanel Component
 * Main AI chat interface - refactored to use extracted components and hooks
 */
import React, { useState, useEffect, useCallback } from "react";
import styles from "./AIPanel.module.css";
import {
  X,
  Sparkles,
  Folder,
  GitBranch,
  Paperclip,
  ArrowUp,
  Pencil,
  Save,
  Loader,
} from "lucide-react";
import clsx from "clsx";

// Services
import { LLMManager } from "../../services/LLMManager";
import { SessionManager } from "../../services/SessionManager";
import { buildSystemPrompt } from "../../utils/promptBuilder";
import { config } from "../../config";
import { AVAILABLE_MODELS } from "../../data/models";
import { emit } from "../../events";

// Hooks
import { useChatHistory } from "../../hooks/useChatHistory";
import { useSafetyCheck } from "../../hooks/useSafetyCheck";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";

// Components
import { ModelSelector } from "./ModelSelector";
import { ChatMessage } from "./ChatMessage";
import { APIKeyPrompt } from "./APIKeyPrompt";
import { SafetyConfirmDialog } from "./SafetyConfirmDialog";
import { ComplexRequestDialog } from "./ComplexRequestDialog";

// Types
import type { ModelSpec, ProviderType } from "../../types";
import type {
  CommandFinishedPayload,
  CommandStartedPayload,
  CwdChangedPayload,
  FetchModelsPayload,
} from "../../events/types";

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  isEmbedded?: boolean;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  isEmbedded,
}) => {
  // =============================================
  // State
  // =============================================
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoRun, setIsAutoRun] = useState(false);
  const [autoRunCount, setAutoRunCount] = useState(0);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [currentCwd, setCurrentCwd] = useState("~");
  const [selectedModelId, setSelectedModelId] = useState(
    AVAILABLE_MODELS[0].id,
  );
  const [models, setModels] = useState(AVAILABLE_MODELS);
  const [sessionName, setSessionName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [showComplexConfirm, setShowComplexConfirm] = useState(false);
  const [pendingComplexMessage, setPendingComplexMessage] = useState("");
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);

  const MAX_AUTO_STEPS = 10;

  // =============================================
  // Hooks
  // =============================================
  const { messages, setMessages, messagesEndRef, scrollToBottom } =
    useChatHistory({ sessionId });

  const {
    showSafetyConfirm,
    pendingSafetyCommand,
    getCommandImpact,
    requestSafetyConfirmation,
    handleSafetyConfirm,
  } = useSafetyCheck({
    sessionId,
    onMessagesUpdate: setMessages,
    onStatusChange: setAgentStatus,
    onAutoRunCountIncrement: () => setAutoRunCount((prev) => prev + 1),
  });

  // =============================================
  // Ollama Model Fetching
  // =============================================
  const fetchOllamaModels = useCallback(
    async (endpoint: string) => {
      try {
        const ollamaModels = await LLMManager.fetchOllamaModels(endpoint);
        setModels((prev) => {
          const nonOllama = prev.filter((p) => p.provider !== "ollama");
          return [...nonOllama, ...ollamaModels];
        });
        localStorage.setItem("termai_ollama_endpoint", endpoint);
        setHasKey(true);
        setAgentStatus(`Fetched ${ollamaModels.length} local models!`);
        setMessages((prev) => {
          const isWelcome =
            prev.length === 0 || (prev.length === 1 && prev[0].role === "ai");
          if (isWelcome) {
            return [
              {
                role: "ai",
                content: `Connected to Ollama at ${endpoint}. Found ${ollamaModels.length} models. How can I help?`,
              },
            ];
          }
          return prev;
        });
        setTimeout(() => setAgentStatus(null), 3000);
      } catch (error) {
        console.error("Error fetching Ollama models:", error);
        setAgentStatus("Error fetching models. Check endpoint.");
        setTimeout(() => setAgentStatus(null), 3000);
      }
    },
    [setMessages],
  );

  // =============================================
  // Settings & Initialization
  // =============================================
  const loadSettings = useCallback(async () => {
    const storedProvider = localStorage.getItem("termai_provider") || "gemini";

    if (storedProvider === "ollama") {
      const endpoint =
        localStorage.getItem("termai_ollama_endpoint") ||
        config.defaultOllamaEndpoint;
      setHasKey(true);
      fetchOllamaModels(endpoint);
      return;
    }

    setIsCheckingKey(true);
    try {
      const hasServerKey = await LLMManager.hasApiKey(storedProvider);
      setHasKey(hasServerKey);
      if (!hasServerKey) {
        setMessages([
          {
            role: "ai",
            content: `Hi! I'm TermAI. Please configure your ${storedProvider.charAt(0).toUpperCase() + storedProvider.slice(1)} API key in Settings to get started.`,
          },
        ]);
      }
    } catch (error) {
      console.error("Error checking API key:", error);
      setMessages([
        {
          role: "ai",
          content:
            "Unable to connect to the server. Make sure the TermAI backend is running.",
        },
      ]);
      setHasKey(false);
    } finally {
      setIsCheckingKey(false);
    }
  }, [fetchOllamaModels, setMessages]);

  // Load session name
  useEffect(() => {
    if (sessionId) {
      const saved = SessionManager.getSession(sessionId);
      setSessionName(saved?.name || `Session ${sessionId.substring(0, 6)}`);
    }
  }, [sessionId]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [isOpen, loadSettings]);

  // Emit thinking state
  useEffect(() => {
    emit("termai-ai-thinking", { isThinking: isLoading, sessionId });
  }, [isLoading, sessionId]);

  // Auto-scroll
  useEffect(() => {
    scrollToBottom();
  }, [messages, agentStatus, isLoading, scrollToBottom]);

  // =============================================
  // Event Handlers using typed hooks
  // =============================================
  useTermAiEvent("termai-settings-changed", loadSettings, [loadSettings]);

  useTermAiEvent(
    "termai-cwd-changed",
    (payload: CwdChangedPayload) => {
      if (payload.sessionId === sessionId) {
        setCurrentCwd(payload.cwd);
      }
    },
    [sessionId],
  );

  useTermAiEvent(
    "termai-fetch-models",
    (payload: FetchModelsPayload) => {
      fetchOllamaModels(payload.endpoint);
    },
    [fetchOllamaModels],
  );

  useTermAiEvent(
    "termai-command-started",
    (payload: CommandStartedPayload) => {
      if (payload.sessionId === sessionId) {
        setRunningCommandId(payload.commandId);
      }
    },
    [sessionId],
  );

  // Handle auto-continue
  const handleAutoRunContinue = useCallback(() => {
    if (isAutoRun) {
      // Trigger with empty input for continuation
      const providerType = localStorage.getItem("termai_provider") || "gemini";
      const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);
      const context = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      const systemPrompt = buildSystemPrompt({
        cwd: currentCwd,
        isAutoRun,
        os: "macOS",
      });

      setIsLoading(true);
      setAgentStatus("Continuing...");

      llm
        .chat(systemPrompt, context)
        .then((response) => {
          setMessages((prev) => [...prev, { role: "ai", content: response }]);
          processAutoRunResponse(response);
        })
        .catch(() => {
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: "Error continuing." },
          ]);
          setAgentStatus("Error encountered.");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isAutoRun, apiKey, selectedModelId, messages, currentCwd, setMessages]);

  useTermAiEvent("termai-auto-continue", handleAutoRunContinue, [
    handleAutoRunContinue,
  ]);

  // Handle command finished for auto-run loop
  useTermAiEvent(
    "termai-command-finished",
    async (payload: CommandFinishedPayload) => {
      if (payload.sessionId !== sessionId) return;

      const { command, output, exitCode } = payload;
      setRunningCommandId(null);

      let outputMsg = `> Executed: \`${command}\` (Exit: ${exitCode})\n\nOutput:\n\`\`\`\n${output.substring(0, 1000)}${output.length > 1000 ? "..." : ""}\n\`\`\``;

      if (isAutoRun && exitCode !== 0) {
        outputMsg += `\n\nCommand Failed (Exit Code: ${exitCode}).\n\nAUTO-RECOVERY INITIATED:\n1. Review your last plan.\n2. Identify which step failed.\n3. Backtrack to the state before this step.\n4. Propose a DIFFERENT command to achieve the same goal. Do NOT repeat the failed command.`;
      }

      setMessages((prev) => [...prev, { role: "system", content: outputMsg }]);

      if (!isAutoRun) return;

      if (autoRunCount >= MAX_AUTO_STEPS) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: "Auto-Run limit reached (10 steps). Stopping for safety.",
          },
        ]);
        setIsAutoRun(false);
        setAutoRunCount(0);
        return;
      }

      // Continue auto-run loop
      setIsLoading(true);
      setAgentStatus("Analyzing command output...");
      try {
        const providerType =
          localStorage.getItem("termai_provider") || "gemini";
        const llm = LLMManager.getProvider(
          providerType,
          apiKey,
          selectedModelId,
        );
        const context =
          messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
          `\nSystem Output:\n${outputMsg}`;
        const systemPrompt = buildSystemPrompt({
          cwd: currentCwd,
          isAutoRun,
          os: "macOS",
        });
        const response = await llm.chat(systemPrompt, context);

        setMessages((prev) => [...prev, { role: "ai", content: response }]);
        processAutoRunResponse(response);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "Error in auto-run loop." },
        ]);
        setAgentStatus("Error encountered.");
      } finally {
        setIsLoading(false);
      }
    },
    [
      sessionId,
      isAutoRun,
      autoRunCount,
      apiKey,
      selectedModelId,
      messages,
      currentCwd,
      setMessages,
    ],
  );

  // Loop Prevention
  useEffect(() => {
    if (isAutoRun && messages.length > 4) {
      const lastAiMsg = messages[messages.length - 1];
      const prevAiMsg = messages[messages.length - 3];
      if (
        lastAiMsg.role === "ai" &&
        prevAiMsg?.role === "ai" &&
        lastAiMsg.content === prevAiMsg.content
      ) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content:
              "Loop Detected: You are repeating the same command/response. Auto-Run stopped.",
          },
        ]);
        setIsAutoRun(false);
        setAgentStatus("Loop detected. Stopped.");
      }
    }
  }, [messages, isAutoRun, setMessages]);

  // =============================================
  // Session Name Handling
  // =============================================
  const handleSaveSessionName = () => {
    if (sessionId && sessionName.trim()) {
      SessionManager.saveSession({
        id: sessionId,
        name: sessionName,
        timestamp: Date.now(),
        preview: messages[messages.length - 1]?.content.substring(0, 50) || "",
      });
      setIsEditingName(false);
    }
  };

  // =============================================
  // API Key Handling
  // =============================================
  const handleSaveKey = async (key: string) => {
    if (!key.trim()) return;

    const provider = localStorage.getItem("termai_provider") || "gemini";

    if (provider === "ollama") {
      localStorage.setItem("termai_ollama_endpoint", key);
      setHasKey(true);
      fetchOllamaModels(key);
      return;
    }

    setIsCheckingKey(true);
    setKeyError(null);

    try {
      await LLMManager.setApiKey(provider, key);
      setHasKey(true);
      setApiKey("");
      setMessages([
        {
          role: "ai",
          content: "API Key saved securely on the server! How can I help you?",
        },
      ]);
    } catch (error) {
      setKeyError((error as Error).message);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Failed to save API key: ${(error as Error).message}`,
        },
      ]);
    } finally {
      setIsCheckingKey(false);
    }
  };

  // =============================================
  // Auto-Run Response Processing
  // =============================================
  const processAutoRunResponse = useCallback(
    (response: string) => {
      const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
      let match;
      let foundCommand = false;

      while ((match = codeBlockRegex.exec(response)) !== null) {
        const nextCommand = match[1].trim();
        if (!nextCommand) continue;

        // Skip if it's file content for WRITE_FILE
        const beforeBlock = response.substring(0, match.index).trim();
        if (beforeBlock.endsWith("]")) {
          const lastBracket = beforeBlock.lastIndexOf("[");
          if (
            lastBracket !== -1 &&
            beforeBlock.substring(lastBracket).includes("WRITE_FILE")
          ) {
            continue;
          }
        }

        foundCommand = true;
        const impact = getCommandImpact(nextCommand);
        if (impact) {
          requestSafetyConfirmation({
            command: nextCommand,
            sessionId,
            impact,
          });
          setAgentStatus("Waiting for safety confirmation...");
          return;
        }

        setAutoRunCount((prev) => prev + 1);
        emit("termai-run-command", { command: nextCommand, sessionId });
        const isCoding =
          nextCommand.startsWith("echo") ||
          nextCommand.startsWith("cat") ||
          nextCommand.startsWith("printf") ||
          nextCommand.includes(">");
        setAgentStatus(
          isCoding ? `Coding: ${nextCommand}` : `Terminal: ${nextCommand}`,
        );
        return;
      }

      if (!foundCommand) {
        if (response.toLowerCase().includes("task complete")) {
          setAutoRunCount(0);
          setAgentStatus(null);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content:
                "Auto-Run Stalled: No command found. Please explain why you stopped or ask for input.",
            },
          ]);
          setAgentStatus("Stalled. Waiting for input...");
        }
      }

      if (response.includes("[NEW_TAB]")) {
        emit("termai-new-tab");
        setAgentStatus("Opening new tab...");
      }

      if (response.includes("[CANCEL]") && runningCommandId) {
        emit("termai-cancel-command", {
          commandId: runningCommandId,
          sessionId,
        });
        setAgentStatus("Cancelling command...");
        setRunningCommandId(null);
      }
    },
    [
      getCommandImpact,
      requestSafetyConfirmation,
      sessionId,
      runningCommandId,
      setMessages,
    ],
  );

  // =============================================
  // Send Message
  // =============================================
  const handleSend = async (
    overrideInput?: string,
    isNewConversation = false,
  ) => {
    const textToSend = overrideInput ?? input;
    if (!textToSend.trim()) return;

    // Complex Request Check
    if (
      !overrideInput &&
      messages.length > 2 &&
      textToSend.length > 50 &&
      !showComplexConfirm
    ) {
      setPendingComplexMessage(textToSend);
      setShowComplexConfirm(true);
      return;
    }

    setShowComplexConfirm(false);
    setPendingComplexMessage("");

    if (isNewConversation) {
      setMessages([{ role: "ai", content: "Starting new conversation..." }]);
    }

    const userMsg = textToSend;
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setIsLoading(true);
    setAgentStatus("Thinking...");

    if (sessionId) {
      SessionManager.saveSession({
        id: sessionId,
        name: sessionName || `Session ${sessionId.substring(0, 6)}`,
        timestamp: Date.now(),
        preview: userMsg.substring(0, 50),
      });
    }

    try {
      const providerType = localStorage.getItem("termai_provider") || "gemini";
      const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);
      const context =
        messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
        `\nUser: ${userMsg}`;
      const systemPrompt = buildSystemPrompt({
        cwd: currentCwd,
        isAutoRun,
        os: "macOS",
      });
      const response = await llm.chat(systemPrompt, context);

      setMessages((prev) => [...prev, { role: "ai", content: response }]);
      setAgentStatus(null);

      if (isAutoRun) {
        processAutoRunResponse(response);
      }
    } catch (error: unknown) {
      console.error("LLM Error:", error);
      let errorMsg = "Sorry, something went wrong.";
      if (error instanceof Error) {
        errorMsg += ` Error: ${error.message}`;
      }
      if (localStorage.getItem("termai_provider") !== "ollama") {
        errorMsg += " Please check your API key in Settings.";
      } else {
        errorMsg +=
          " Please check your Ollama endpoint and ensure the model is installed.";
      }
      setMessages((prev) => [...prev, { role: "ai", content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  // =============================================
  // Model Selection Handler
  // =============================================
  const handleModelSelect = (model: ModelSpec) => {
    setSelectedModelId(model.id);
    const newProvider = model.provider;
    localStorage.setItem("termai_provider", newProvider);

    const storedKey = localStorage.getItem(`termai_${newProvider}_key`);
    if (newProvider === "ollama") {
      setHasKey(true);
      setApiKey(storedKey || "http://localhost:11434");
    } else if (storedKey) {
      setApiKey(storedKey);
      setHasKey(true);
    } else {
      setApiKey("");
      setHasKey(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Switched to ${model.name}. Please enter your ${newProvider} API key.`,
        },
      ]);
    }

    window.dispatchEvent(new Event("termai-settings-changed"));
  };

  // =============================================
  // Render
  // =============================================
  if (!isOpen) return null;

  const currentProvider = (localStorage.getItem("termai_provider") ||
    "gemini") as ProviderType;

  return (
    <div className={clsx(styles.panel, isEmbedded && styles.embedded)}>
      {/* Header */}
      {!isEmbedded && (
        <div className={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={16} className="text-accent-primary" />
            <span>TermAI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label
              className={styles.autoRunLabel}
              style={{
                color: isAutoRun
                  ? "var(--accent-primary)"
                  : "var(--text-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={isAutoRun}
                onChange={(e) => {
                  setIsAutoRun(e.target.checked);
                  if (!e.target.checked) setAutoRunCount(0);
                }}
                style={{ accentColor: "var(--accent-primary)" }}
              />
              Auto-Run
            </label>
            <button onClick={onClose} className={styles.closeButton}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Embedded Header */}
      {isEmbedded && (
        <div className={styles.header}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
            }}
          >
            <Sparkles size={16} className="text-accent-primary" />
            {isEditingName ? (
              <div
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className={styles.input}
                  style={{ padding: "2px 4px", height: "24px", width: "120px" }}
                  autoFocus
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSaveSessionName()
                  }
                  onBlur={handleSaveSessionName}
                />
                <button
                  onClick={handleSaveSessionName}
                  className={styles.iconButton}
                  style={{ color: "var(--success)" }}
                >
                  <Save size={14} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                }}
                onClick={() => setIsEditingName(true)}
              >
                <span style={{ fontWeight: 600, fontSize: "13px" }}>
                  {sessionName || "TermAI"}
                </span>
                <Pencil size={12} style={{ opacity: 0.5 }} />
              </div>
            )}
          </div>
          <label
            className={styles.autoRunLabel}
            style={{
              color: isAutoRun
                ? "var(--accent-primary)"
                : "var(--text-secondary)",
            }}
          >
            <input
              type="checkbox"
              checked={isAutoRun}
              onChange={(e) => {
                setIsAutoRun(e.target.checked);
                if (!e.target.checked) setAutoRunCount(0);
              }}
              style={{ accentColor: "var(--accent-primary)" }}
            />
            Auto-Run
          </label>
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {isCheckingKey ? (
          <div className={`${styles.message} ${styles.aiMessage}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Loader size={16} className={styles.spinner} />
              <span>Checking API key configuration...</span>
            </div>
          </div>
        ) : !hasKey ? (
          <APIKeyPrompt
            provider={currentProvider}
            isLoading={isCheckingKey}
            error={keyError}
            onSaveKey={handleSaveKey}
            onFetchOllamaModels={fetchOllamaModels}
          />
        ) : (
          messages.map((msg, idx) => (
            <ChatMessage
              key={idx}
              message={msg}
              sessionId={sessionId}
              isAutoRun={isAutoRun}
            />
          ))
        )}

        {/* Agent Status */}
        {agentStatus && (
          <div className={styles.agentStatus}>
            <div className={styles.spinner}></div>
            <span>{agentStatus}</span>
          </div>
        )}

        {/* Loading */}
        {isLoading && !agentStatus && (
          <div className={`${styles.message} ${styles.aiMessage}`}>
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {hasKey && (
        <div className={styles.inputWrapper}>
          <div className={styles.inputContainer}>
            <div className={styles.contextChips}>
              <div className={styles.chip}>
                <Folder size={10} className={styles.chipIcon} />
                {currentCwd.split("/").pop() || "~"}
              </div>
              <div className={styles.chip}>
                <GitBranch size={10} className={styles.chipIcon} />
                git:(main)
              </div>
            </div>
            <div
              style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}
            >
              <button className={styles.iconButton}>
                <Paperclip size={16} />
              </button>
              <ModelSelector
                models={models}
                selectedModelId={selectedModelId}
                onSelect={handleModelSelect}
              />
              <textarea
                className={styles.input}
                placeholder="Ask a follow up..."
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading}
                className={styles.sendButton}
                style={{
                  background: input.trim()
                    ? "var(--accent-primary)"
                    : "var(--bg-tertiary)",
                  color: input.trim() ? "white" : "var(--text-secondary)",
                  cursor: isLoading ? "wait" : "pointer",
                }}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

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
          command={pendingSafetyCommand}
          onConfirm={() => handleSafetyConfirm(true)}
          onCancel={() => handleSafetyConfirm(false)}
        />
      )}
    </div>
  );
};
