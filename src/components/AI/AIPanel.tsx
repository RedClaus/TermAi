/**
 * AIPanel Component
 * Main AI chat interface - refactored to use extracted hooks
 * 
 * Uses:
 * - useUIState: input, loading, status, dialogs
 * - useSettingsLoader: API keys, models, CWD
 * - useAutoRunMachine: auto-run state machine, task tracking
 */
import React, { useState, useEffect, useCallback } from "react";
import styles from "./AIPanel.module.css";
import {
  X,
  Rocket,
  Folder,
  GitBranch,
  Paperclip,
  ArrowUp,
  Pencil,
  Save,
  Loader,
  Square,
  GraduationCap,
  Eye,
  EyeOff,
} from "lucide-react";
import clsx from "clsx";

// Services
import { LLMManager } from "../../services/LLMManager";
import { SessionManager } from "../../services/SessionManager";
import { KnowledgeService } from "../../services/KnowledgeService";
import { buildSystemPrompt } from "../../utils/promptBuilder";
import { config } from "../../config";
import { emit } from "../../events";
import { isSmallModel } from "../../data/models";
import {
  extractSingleCommand,
  isWriteFileBlock,
} from "../../utils/commandValidator";

// Hooks
import { useChatHistory } from "../../hooks/useChatHistory";
import { useSafetyCheck } from "../../hooks/useSafetyCheck";
import { useObserver } from "../../hooks/useObserver";
import { useUIState, shouldShowComplexDialog } from "../../hooks/useUIState";
import { useSettingsLoader } from "../../hooks/useSettingsLoader";
import {
  useAutoRunMachine,
  isCodingCommand,
} from "../../hooks/useAutoRunMachine";

// Components
import { ModelSelector } from "./ModelSelector";
import { ChatMessage } from "./ChatMessage";
import { APIKeyPrompt } from "./APIKeyPrompt";
import { SafetyConfirmDialog } from "./SafetyConfirmDialog";
import { ComplexRequestDialog } from "./ComplexRequestDialog";
import { CommandPreview } from "./CommandPreview";
import { TaskCompletionSummary } from "./TaskCompletionSummary";

// Types
import type { ProviderType } from "../../types";
import type { ModelSpec } from "../../data/models";

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string | undefined;
  isEmbedded?: boolean | undefined;
  isActive?: boolean | undefined;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  isEmbedded,
  isActive = true,
}) => {
  // =============================================
  // Local State (panel-specific)
  // =============================================
  const [apiKey, setApiKey] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isCheckingKey, setIsCheckingKey] = useState(false);

  // Command preview state for auto-run
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(() => {
    const saved = localStorage.getItem("termai_preview_mode");
    return saved === "true";
  });

  // =============================================
  // Chat History Hook
  // =============================================
  const { messages, setMessages, messagesEndRef, scrollToBottom } =
    useChatHistory({ sessionId });

  // =============================================
  // UI State Hook
  // =============================================
  const {
    input,
    isLoading,
    agentStatus,
    showComplexConfirm,
    pendingComplexMessage,
    needsAttention,
    setInput,
    setIsLoading,
    setAgentStatus,
    showComplexDialog,
    hideComplexDialog,
    clearInput,
  } = useUIState({ sessionId });

  // =============================================
  // Observer Hook
  // =============================================
  const { isObserving, analyzeAndLearn } = useObserver();

  // =============================================
  // Settings Loader Hook
  // =============================================
  const {
    hasKey,
    models,
    selectedModelId,
    currentCwd,
    isLiteMode,
    handleModelSelect: baseHandleModelSelect,
    fetchOllamaModels,
    setHasKey,
    setSelectedModelId,
    setModels,
  } = useSettingsLoader({
    sessionId,
    setMessages,
    setAgentStatus,
    isActive,
  });

  // =============================================
  // Auto-Run Machine Hook
  // =============================================
  const {
    isAutoRun,
    taskSummary,
    toggleAutoRun,
    stopAutoRun,
    dismissSummary,
    incrementAutoRunCount,
  } = useAutoRunMachine({
    sessionId,
    messages,
    setMessages,
    setAgentStatus,
    analyzeAndLearn,
  });

  // =============================================
  // Safety Check Hook
  // =============================================
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
    onAutoRunCountIncrement: incrementAutoRunCount,
  });

  // Include safety confirm in needsAttention calculation
  const actualNeedsAttention = needsAttention || showSafetyConfirm;

  // =============================================
  // Effects
  // =============================================

  // Load session name
  useEffect(() => {
    if (sessionId) {
      const saved = SessionManager.getSession(sessionId);
      setSessionName(saved?.name || `Session ${sessionId.substring(0, 6)}`);
    }
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    scrollToBottom();
  }, [messages, agentStatus, isLoading, scrollToBottom]);

  // =============================================
  // API Key Saving (panel-specific)
  // =============================================
  const handleSaveKey = useCallback(
    async (key: string) => {
      const provider = localStorage.getItem("termai_provider") || "gemini";

      if (provider === "ollama") {
        fetchOllamaModels(key || config.defaultOllamaEndpoint);
        return;
      }

      setIsCheckingKey(true);
      setKeyError(null);

      try {
        await LLMManager.setApiKey(provider, key);
        setHasKey(true);
        setApiKey(key);
        setAgentStatus("API key saved successfully!");

        const dynamicModels = await LLMManager.fetchModels(provider);
        if (dynamicModels.length > 0) {
          setModels((prev) => {
            const others = prev.filter((p) => p.provider !== provider);
            return [...others, ...dynamicModels] as ModelSpec[];
          });
        }

        setMessages([
          {
            role: "ai",
            content: `API key configured! How can I help you today?`,
          },
        ]);

        setTimeout(() => setAgentStatus(null), 2000);
      } catch (error) {
        console.error("Error saving API key:", error);
        setKeyError(
          error instanceof Error ? error.message : "Failed to save API key"
        );
        setHasKey(false);
      } finally {
        setIsCheckingKey(false);
      }
    },
    [fetchOllamaModels, setMessages, setAgentStatus, setHasKey, setModels]
  );

  // =============================================
  // Model Selection (wrap base handler)
  // =============================================
  const handleModelSelect = useCallback(
    (model: ModelSpec) => {
      baseHandleModelSelect(model);
      setSelectedModelId(model.id);
    },
    [baseHandleModelSelect, setSelectedModelId]
  );

  // =============================================
  // Process Auto-Run Response
  // =============================================
  const processAutoRunResponse = useCallback(
    (response: string) => {
      const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\n([\s\S]*?)\n```/g;
      let match;
      let foundCommand = false;

      while ((match = codeBlockRegex.exec(response)) !== null) {
        const blockContent = match[1];

        if (isWriteFileBlock(response, match.index)) {
          continue;
        }

        const nextCommand = extractSingleCommand(blockContent);
        if (!nextCommand) continue;

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

        // If preview mode is enabled, show the command preview
        if (previewEnabled) {
          setPendingCommand(nextCommand);
          setAgentStatus("Review command before execution...");
          return;
        }

        // Otherwise execute immediately
        incrementAutoRunCount();
        emit("termai-run-command", { command: nextCommand, sessionId });
        setAgentStatus(
          isCodingCommand(nextCommand)
            ? `Coding: ${nextCommand}`
            : `Terminal: ${nextCommand}`
        );
        return;
      }

      if (!foundCommand) {
        if (response.toLowerCase().includes("task complete")) {
          let narrative = "";
          const reportMatch = response.match(
            /Mission Report:([\s\S]*?)Task Complete/i
          );
          if (reportMatch) {
            narrative = reportMatch[1].trim();
          } else {
            narrative = response.replace(/task complete/i, "").trim();
          }
          stopAutoRun("complete", narrative);
        } else if (
          response.includes("[ASK_USER]") ||
          response.includes("[WAIT]") ||
          response.includes("[NEED_HELP]")
        ) {
          setAgentStatus("Waiting for your input...");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content:
                "Auto-Run Stalled: No valid command found. The AI may have output invalid content or is waiting for guidance.",
            },
          ]);
          setAgentStatus("Stalled. Waiting for input...");
        }
      }

      if (response.includes("[NEW_TAB]")) {
        emit("termai-new-tab");
        setAgentStatus("Opening new tab...");
      }
    },
    [
      sessionId,
      getCommandImpact,
      requestSafetyConfirmation,
      stopAutoRun,
      setMessages,
      previewEnabled,
      incrementAutoRunCount,
      setAgentStatus,
    ]
  );

  // Handle command preview actions
  const handlePreviewExecute = useCallback(() => {
    if (!pendingCommand) return;
    incrementAutoRunCount();
    emit("termai-run-command", { command: pendingCommand, sessionId });
    setAgentStatus(
      isCodingCommand(pendingCommand)
        ? `Coding: ${pendingCommand}`
        : `Terminal: ${pendingCommand}`
    );
    setPendingCommand(null);
  }, [pendingCommand, sessionId, incrementAutoRunCount, setAgentStatus]);

  const handlePreviewSkip = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `Skipped command: \`${pendingCommand}\`\nPlease provide an alternative approach.`,
      },
    ]);
    setPendingCommand(null);
    setAgentStatus("Command skipped. Waiting for guidance...");
  }, [pendingCommand, setMessages, setAgentStatus]);

  // =============================================
  // Save Session Name
  // =============================================
  const handleSaveSessionName = useCallback(() => {
    setIsEditingName(false);
    if (sessionId && sessionName.trim()) {
      SessionManager.saveSession({
        id: sessionId,
        name: sessionName,
        timestamp: Date.now(),
        preview:
          messages[messages.length - 1]?.content?.substring(0, 50) || "",
      });
    }
  }, [sessionId, sessionName, messages]);

  // =============================================
  // Send Message
  // =============================================
  const handleSend = async (
    overrideInput?: string,
    isNewConversation = false
  ) => {
    const textToSend = overrideInput ?? input;
    if (!textToSend.trim()) return;

    // Complex Request Check
    if (!overrideInput && shouldShowComplexDialog(textToSend, messages.length)) {
      showComplexDialog(textToSend);
      return;
    }

    hideComplexDialog();

    if (isNewConversation) {
      setMessages([{ role: "ai", content: "Starting new conversation..." }]);
    }

    const userMsg = textToSend;
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    clearInput();
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

      // Fetch relevant skills
      const learnedSkills = await KnowledgeService.searchSkills(userMsg);
      const skillsContext =
        learnedSkills.length > 0
          ? `\n## Learned Skills (SOPs)\nUse these patterns if relevant:\n${JSON.stringify(
              learnedSkills.map((s) => ({
                condition: s.use_when,
                steps: s.tool_sops,
              })),
              null,
              2
            )}`
          : "";

      const context =
        messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
        skillsContext +
        `\nUser: ${userMsg}`;

      const selectedModel = models.find((m) => m.id === selectedModelId);
      const useLiteMode = selectedModel
        ? isSmallModel(selectedModel)
        : isLiteMode;

      const systemPrompt = buildSystemPrompt({
        cwd: currentCwd,
        isAutoRun,
        isLiteMode: useLiteMode,
      });
      const response = await llm.chat(systemPrompt, context, sessionId);

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
            <Rocket size={16} className="text-accent-primary" />
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
                onChange={() => toggleAutoRun()}
                style={{ accentColor: "var(--accent-primary)" }}
              />
              Auto-Run
            </label>
            {isAutoRun && (
              <>
                <button
                  onClick={() => {
                    const newValue = !previewEnabled;
                    setPreviewEnabled(newValue);
                    localStorage.setItem(
                      "termai_preview_mode",
                      String(newValue)
                    );
                  }}
                  className={styles.iconButton}
                  title={
                    previewEnabled
                      ? "Disable command preview (run immediately)"
                      : "Enable command preview (2s delay)"
                  }
                  style={{
                    color: previewEnabled
                      ? "var(--accent-primary)"
                      : "var(--text-secondary)",
                  }}
                >
                  {previewEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => stopAutoRun("user")}
                  className={styles.stopButton}
                  title="Stop Auto-Run"
                >
                  <Square size={14} />
                  Stop
                </button>
              </>
            )}
            <button
              onClick={() => analyzeAndLearn(messages, apiKey)}
              className={styles.iconButton}
              title="Learn skills from this session"
              disabled={isObserving || messages.length < 3}
              style={{
                color: isObserving
                  ? "var(--accent-primary)"
                  : "var(--text-secondary)",
              }}
            >
              {isObserving ? (
                <Loader size={16} className={styles.spinner} />
              ) : (
                <GraduationCap size={16} />
              )}
            </button>
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
            <Rocket size={16} className="text-accent-primary" />
            {isEditingName ? (
              <div
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className={styles.input}
                  style={{
                    padding: "2px 4px",
                    height: "24px",
                    width: "120px",
                  }}
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
              onChange={() => toggleAutoRun()}
              style={{ accentColor: "var(--accent-primary)" }}
            />
            Auto-Run
          </label>
          {isAutoRun && (
            <>
              <button
                onClick={() => {
                  const newValue = !previewEnabled;
                  setPreviewEnabled(newValue);
                  localStorage.setItem("termai_preview_mode", String(newValue));
                }}
                className={styles.iconButton}
                title={
                  previewEnabled
                    ? "Disable command preview"
                    : "Enable command preview"
                }
                style={{
                  color: previewEnabled
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                }}
              >
                {previewEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={() => stopAutoRun("user")}
                className={styles.stopButton}
                title="Stop Auto-Run"
              >
                <Square size={14} />
                Stop
              </button>
            </>
          )}
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
        {agentStatus && !pendingCommand && (
          <div
            className={clsx(
              styles.agentStatus,
              actualNeedsAttention && styles.waitingForInput
            )}
          >
            {actualNeedsAttention ? (
              <span style={{ fontSize: "16px" }}>👆</span>
            ) : (
              <Loader size={14} className={styles.spinner} />
            )}
            <span>{agentStatus}</span>
            {actualNeedsAttention && (
              <span className={styles.attentionBadge}>Input Required</span>
            )}
          </div>
        )}

        {/* Command Preview for Auto-Run */}
        {pendingCommand && (
          <CommandPreview
            command={pendingCommand}
            delay={2000}
            onExecute={handlePreviewExecute}
            onSkip={handlePreviewSkip}
          />
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
          <div
            className={clsx(
              styles.inputContainer,
              actualNeedsAttention && styles.needsAttention
            )}
          >
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
          command={pendingSafetyCommand.command}
          impact={pendingSafetyCommand.impact}
          risk={pendingSafetyCommand.risk}
          allowAllOption={pendingSafetyCommand.allowAllOption}
          onConfirm={(allowAll) => handleSafetyConfirm(true, allowAll)}
          onCancel={() => handleSafetyConfirm(false)}
        />
      )}

      {/* Task Completion Summary */}
      {taskSummary && (
        <TaskCompletionSummary summary={taskSummary} onDismiss={dismissSummary} />
      )}
    </div>
  );
};
