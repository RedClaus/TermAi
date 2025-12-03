/**
 * AIInputBox Component
 * Full AI chat interface embedded in the terminal - contains all AIPanel functionality
 * 
 * Refactored to use:
 * - useUIState: input, loading, status, dialogs
 * - useSettingsLoader: API keys, models, CWD
 * - useAutoRunMachine: auto-run state machine, task tracking
 */
import React, { useEffect, useCallback, useRef } from "react";
import {
  Command,
  Paperclip,
  AtSign,
  FolderOpen,
  Square,
  ChevronsRight,
  Send,
  Loader,
  AlertCircle,
  Folder,
  GitBranch,
  Sparkles,
} from "lucide-react";
import styles from "./AIInputBox.module.css";

// Services
import { LLMManager } from "../../services/LLMManager";
import { SessionManager } from "../../services/SessionManager";
import { buildSystemPrompt } from "../../utils/promptBuilder";

// Hooks
import { useChatHistory } from "../../hooks/useChatHistory";
import { useSafetyCheck } from "../../hooks/useSafetyCheck";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import { useObserver } from "../../hooks/useObserver";
import { useUIState, shouldShowComplexDialog } from "../../hooks/useUIState";
import { useSettingsLoader } from "../../hooks/useSettingsLoader";
import {
  useAutoRunMachine,
  MAX_AUTO_STEPS,
  MAX_STALLS_BEFORE_ASK,
  formatOutputMessage,
  processResponseForCommand,
} from "../../hooks/useAutoRunMachine";
import { isSmallModel } from "../../data/models";

// Components
import { ModelSelector } from "../AI/ModelSelector";
import { ChatMessage } from "../AI/ChatMessage";
import { SafetyConfirmDialog } from "../AI/SafetyConfirmDialog";
import { ComplexRequestDialog } from "../AI/ComplexRequestDialog";
import { TaskCompletionSummary } from "../AI/TaskCompletionSummary";

// Types
import type {
  CommandFinishedPayload,
  CommandStartedPayload,
} from "../../events/types";

interface AIInputBoxProps {
  onCommand: (cmd: string) => void;
  sessionId?: string | undefined;
  cwd?: string | undefined;
}

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => (
  <div className={styles.tooltipWrapper}>
    {children}
    <span className={styles.tooltip}>{text}</span>
  </div>
);

export const AIInputBox: React.FC<AIInputBoxProps> = ({
  onCommand: _onCommand,
  sessionId,
  cwd: propCwd = "~",
}) => {
  // Note: _onCommand is available for future use but currently commands are
  // dispatched via events (termai-run-command) for cross-component communication

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    isCheckingKey,
    models,
    selectedModelId,
    currentCwd,
    isLiteMode,
    handleModelSelect,
    setCurrentCwd,
  } = useSettingsLoader({
    sessionId,
    initialCwd: propCwd,
    setMessages,
    setAgentStatus,
  });

  // =============================================
  // Auto-Run Machine Hook
  // =============================================
  const {
    isAutoRun,
    autoRunCount,
    consecutiveStalls,
    taskSummary,
    toggleAutoRun,
    stopAutoRun,
    dismissSummary,
    addTaskStep,
    setRunningCommandId,
    setConsecutiveStalls,
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

  // Update CWD from prop
  useEffect(() => {
    setCurrentCwd(propCwd);
  }, [propCwd, setCurrentCwd]);

  // Auto-scroll
  useEffect(() => {
    scrollToBottom();
  }, [messages, agentStatus, isLoading, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // =============================================
  // Event Handlers
  // =============================================

  useTermAiEvent(
    "termai-command-started",
    (payload: CommandStartedPayload) => {
      if (payload.sessionId === sessionId || !payload.sessionId) {
        setRunningCommandId(payload.commandId);
      }
    },
    [sessionId, setRunningCommandId]
  );

  // =============================================
  // Process Auto-Run Response
  // =============================================
  const processAutoRunResponse = useCallback(
    (response: string) => {
      const selectedModel = models.find((m) => m.id === selectedModelId);
      const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

      const result = processResponseForCommand(
        response,
        {
          sessionId,
          currentCwd,
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
          onCommandFound: () => {
            incrementAutoRunCount();
          },
          onTaskComplete: (narrative) => {
            setConsecutiveStalls(0);
            stopAutoRun("complete", narrative);
          },
          onNeedsUserInput: () => {
            setConsecutiveStalls(0);
          },
          onStall: (newStallCount) => {
            setConsecutiveStalls(newStallCount);
            if (newStallCount >= MAX_STALLS_BEFORE_ASK) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content:
                    "Auto-Run Stalled: No valid command found after multiple attempts. Please provide guidance or try a different approach.",
                },
              ]);
              setAgentStatus("Stalled. Waiting for input...");
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content:
                    "No executable command found in your response. Please either:\n1. Provide a specific command to run in a ```bash code block\n2. If the task is complete, say 'Task Complete'\n3. If you need help, say '[ASK_USER]' and explain what you need",
                },
              ]);
              setAgentStatus("Retrying with guidance...");
            }
          },
        },
        consecutiveStalls
      );

      return result;
    },
    [
      sessionId,
      currentCwd,
      selectedModelId,
      models,
      isLiteMode,
      getCommandImpact,
      requestSafetyConfirmation,
      setAgentStatus,
      incrementAutoRunCount,
      setConsecutiveStalls,
      stopAutoRun,
      setMessages,
      consecutiveStalls,
    ]
  );

  // Auto-retry when stalled (first stall only) - with debouncing
  useEffect(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (consecutiveStalls === 1 && isAutoRun && !isLoading) {
      retryTimeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        setAgentStatus("Retrying with guidance...");
        try {
          const providerType = localStorage.getItem("termai_provider") || "gemini";
          const llm = LLMManager.getProvider(providerType, "", selectedModelId);
          const context = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

          const selectedModel = models.find((m) => m.id === selectedModelId);
          const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

          const systemPrompt = buildSystemPrompt({
            cwd: currentCwd,
            isAutoRun: true,
            isLiteMode: useLiteMode,
          });
          const response = await llm.chat(systemPrompt, context, sessionId);
          setMessages((prev) => [...prev, { role: "ai", content: response }]);
          processAutoRunResponse(response);
        } catch (error) {
          console.error("[AIInputBox] Retry failed:", error);
          setAgentStatus("Retry failed. Waiting for input...");
          setConsecutiveStalls(MAX_STALLS_BEFORE_ASK);
        } finally {
          setIsLoading(false);
        }
      }, 2000);
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [
    consecutiveStalls,
    isAutoRun,
    isLoading,
    selectedModelId,
    messages,
    currentCwd,
    sessionId,
    models,
    isLiteMode,
    setMessages,
    processAutoRunResponse,
    setIsLoading,
    setAgentStatus,
    setConsecutiveStalls,
  ]);

  // Handle command finished for auto-run loop
  useTermAiEvent(
    "termai-command-finished",
    async (payload: CommandFinishedPayload) => {
      if (payload.sessionId !== sessionId && payload.sessionId) return;

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

      const outputMsg = formatOutputMessage(command, output, exitCode, isAutoRun);
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
        stopAutoRun("limit");
        return;
      }

      setIsLoading(true);
      setAgentStatus("Analyzing command output...");
      try {
        const providerType = localStorage.getItem("termai_provider") || "gemini";
        const llm = LLMManager.getProvider(providerType, "", selectedModelId);
        const context =
          messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
          `\nSystem Output:\n${outputMsg}`;

        const selectedModel = models.find((m) => m.id === selectedModelId);
        const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

        const systemPrompt = buildSystemPrompt({
          cwd: currentCwd,
          isAutoRun,
          isLiteMode: useLiteMode,
        });
        const response = await llm.chat(systemPrompt, context, sessionId);
        setMessages((prev) => [...prev, { role: "ai", content: response }]);
        processAutoRunResponse(response);
      } catch {
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
      selectedModelId,
      messages,
      currentCwd,
      setMessages,
      processAutoRunResponse,
      stopAutoRun,
      addTaskStep,
      setRunningCommandId,
      setIsLoading,
      setAgentStatus,
      models,
      isLiteMode,
    ]
  );

  // =============================================
  // Send Message
  // =============================================
  const handleSend = async (
    overrideInput?: string,
    isNewConversation = false
  ) => {
    const textToSend = overrideInput ?? input;
    if (!textToSend.trim() || !hasKey) return;

    // Check for complex request dialog
    if (
      !overrideInput &&
      shouldShowComplexDialog(textToSend, messages.length)
    ) {
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
        name: `Session ${sessionId.substring(0, 6)}`,
        timestamp: Date.now(),
        preview: userMsg.substring(0, 50),
      });
    }

    try {
      const providerType = localStorage.getItem("termai_provider") || "gemini";
      const llm = LLMManager.getProvider(providerType, "", selectedModelId);
      const context =
        messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
        `\nUser: ${userMsg}`;

      const selectedModel = models.find((m) => m.id === selectedModelId);
      const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

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
      if (error instanceof Error) errorMsg += ` Error: ${error.message}`;
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
  return (
    <div className={styles.container}>
      {/* Messages Area */}
      <div className={styles.messagesArea} ref={messagesContainerRef}>
        {isCheckingKey ? (
          <div className={styles.statusMessage}>
            <Loader size={14} className={styles.spinner} />
            <span>Checking configuration...</span>
          </div>
        ) : !hasKey ? (
          <div className={styles.statusMessage}>
            <AlertCircle size={14} className={styles.warningIcon} />
            <span>API key required - Configure in Settings</span>
          </div>
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
        {(agentStatus || isObserving) && (
          <div
            className={`${styles.agentStatus} ${actualNeedsAttention ? styles.needsAttention : ""}`}
          >
            {actualNeedsAttention ? (
              <span className={styles.attentionIcon}>!</span>
            ) : (
              <Loader size={12} className={styles.spinner} />
            )}
            <span>
              {isObserving ? "Analyzing session & learning skills..." : agentStatus}
            </span>
          </div>
        )}

        {isLoading && !agentStatus && !isObserving && (
          <div className={styles.statusMessage}>
            <Loader size={14} className={styles.spinner} />
            <span>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={styles.inputArea}>
        {/* Context chips */}
        <div className={styles.contextChips}>
          <div className={styles.chip}>
            <Folder size={10} />
            <span>{currentCwd.split("/").pop() || "~"}</span>
          </div>
          <div className={styles.chip}>
            <GitBranch size={10} />
            <span>git:(main)</span>
          </div>
        </div>

        {/* Input box */}
        <div className={styles.inputBox}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              hasKey
                ? "Ask TermAI anything..."
                : "Configure API key in Settings..."
            }
            className={styles.textarea}
            rows={1}
            disabled={isLoading || !hasKey}
          />

          {/* Footer with tools and actions */}
          <div className={styles.footer}>
            <div className={styles.tools}>
              <Tooltip text="Commands (Ctrl+K)">
                <button className={styles.toolBtn} type="button">
                  <Command size={14} />
                </button>
              </Tooltip>
              <Tooltip text="Attach file">
                <button className={styles.toolBtn} type="button">
                  <Paperclip size={14} />
                </button>
              </Tooltip>
              <Tooltip text="Mention context">
                <button className={styles.toolBtn} type="button">
                  <AtSign size={14} />
                </button>
              </Tooltip>
              <Tooltip text="Browse files">
                <button className={styles.toolBtn} type="button">
                  <FolderOpen size={14} />
                </button>
              </Tooltip>
            </div>

            <div className={styles.actions}>
              <Tooltip
                text={
                  isAutoRun
                    ? "Auto-run ON - Click to disable"
                    : "Enable auto-run mode"
                }
              >
                <button
                  className={`${styles.autoRunBtn} ${isAutoRun ? styles.active : ""}`}
                  onClick={toggleAutoRun}
                  type="button"
                >
                  <ChevronsRight size={16} />
                </button>
              </Tooltip>

              {(isAutoRun || isLoading) && (
                <Tooltip text="Stop execution">
                  <button
                    className={styles.stopBtn}
                    onClick={() => stopAutoRun("user")}
                    type="button"
                  >
                    <Square size={14} />
                  </button>
                </Tooltip>
              )}

              <Tooltip text="Learn from this session">
                <button
                  className={styles.toolBtn}
                  onClick={() => {
                    console.log(
                      "[AIInputBox] Manual learn triggered, messages:",
                      messages.length
                    );
                    const providerType =
                      localStorage.getItem("termai_provider") || "gemini";
                    analyzeAndLearn(messages, "", providerType);
                  }}
                  disabled={isObserving || messages.length < 3}
                  type="button"
                >
                  <Sparkles size={14} />
                </button>
              </Tooltip>

              <ModelSelector
                models={models}
                selectedModelId={selectedModelId}
                onSelect={handleModelSelect}
              />

              <Tooltip
                text={hasKey ? "Send message (Enter)" : "API key required"}
              >
                <button
                  className={styles.sendBtn}
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim() || !hasKey}
                  type="button"
                >
                  {isLoading ? (
                    <Loader size={16} className={styles.spinner} />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showComplexConfirm && (
        <ComplexRequestDialog
          onStartNew={() => handleSend(pendingComplexMessage, true)}
          onContinue={() => handleSend(pendingComplexMessage, false)}
        />
      )}

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

      {taskSummary && (
        <TaskCompletionSummary
          summary={taskSummary}
          onDismiss={dismissSummary}
        />
      )}
    </div>
  );
};
