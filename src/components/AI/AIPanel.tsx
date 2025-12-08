/**
 * AIPanel Component
 * Main AI chat interface - refactored to use extracted hooks
 * Warp-style design with floating input card
 * 
 * Uses:
 * - useUIState: input, loading, status, dialogs
 * - useSettingsLoader: API keys, models, CWD
 * - useAutoRunMachine: auto-run state machine, task tracking
 * - useWidgetContext: git branch, command context
 * - useTermAiEvent: command-started/finished event handlers
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Rocket,
  Folder,
  GitBranch,
  Paperclip,
  FolderOpen,
  ArrowUp,
  Pencil,
  Save,
  Loader,
  Square,
  GraduationCap,
  Eye,
  EyeOff,
  Sparkles,
  ChevronsRight,
  Brain,
} from "lucide-react";
// import styles from "./AIPanel.module.css"; // Unused - using Tailwind classes

// Services
import { LLMManager } from "../../services/LLMManager";
import type { ChatMessage as LLMChatMessage } from "../../services/LLMManager";
import { SessionManager } from "../../services/SessionManager";
import { KnowledgeService } from "../../services/KnowledgeService";
import { buildSystemPrompt } from "../../utils/promptBuilder";
import { config } from "../../config";
import { emit } from "../../events";
import { isSmallModel } from "../../data/models";

// Hooks
import { useChatHistory } from "../../hooks/useChatHistory";
import { useSafetyCheck } from "../../hooks/useSafetyCheck";
import { useObserver } from "../../hooks/useObserver";
import { useUIState, shouldShowComplexDialog } from "../../hooks/useUIState";
import { useSettingsLoader } from "../../hooks/useSettingsLoader";
import {
  useAutoRunMachine,
  isCodingCommand,
  MAX_AUTO_STEPS,
  MAX_STALLS_BEFORE_ASK,
  formatOutputMessage,
  processResponseForCommand,
} from "../../hooks/useAutoRunMachine";
import { useWidgetContext } from "../../hooks/useWidgetContext";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import { useErrorAnalysis } from "../../hooks/useErrorAnalysis";
import { useThinkingFramework } from "../../hooks/useThinkingFramework";

// Components
import { ModelSelector } from "./ModelSelector";
import { ChatMessage } from "./ChatMessage";
import { APIKeyPrompt } from "./APIKeyPrompt";
import { SafetyConfirmDialog } from "./SafetyConfirmDialog";
import { ComplexRequestDialog } from "./ComplexRequestDialog";
import { CommandPreview } from "./CommandPreview";
import { TaskCompletionSummary } from "./TaskCompletionSummary";
import { ErrorFixSuggestion } from "./ErrorFixSuggestion";
import { LearnSkillDialog } from "./LearnSkillDialog";
import { TypingIndicator } from "../common";
import { ThinkingDisplay } from "./ThinkingDisplay";
import { AIStatusBadge, deriveAIState } from "./AIStatusBadge";

// Types
import type { ProviderType } from "../../types";
import type { ModelSpec } from "../../data/models";
import type {
  CommandFinishedPayload,
  CommandStartedPayload,
  ThinkingStartedPayload,
  ThinkingCompletePayload,
} from "../../events/types";

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

  // Learn skill dialog state
  const [showLearnSkill, setShowLearnSkill] = useState(false);
  const [learnSkillCommand, setLearnSkillCommand] = useState<string | null>(null);
  const [learnSkillOutput, setLearnSkillOutput] = useState<string | undefined>(undefined);

  // Thinking framework display state
  const [showThinkingDisplay, setShowThinkingDisplay] = useState(true);


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
  // Widget Context Hook
  // =============================================
  const {
    gitBranch,
    hasContext,
    commandCount,
  } = useWidgetContext({
    sessionId: sessionId || "default",
    autoFetchGit: true,
  });

  // Auto-retry timeout ref
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Streaming state
  const [streamingContent, setStreamingContent] = useState("");
  const streamAbortRef = useRef<AbortController | null>(null);

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
  // Error Analysis Hook (for non-auto-run mode)
  // =============================================
  const {
    currentAnalysis,
    analyzeError,
    dismissAnalysis,
  } = useErrorAnalysis({
    sessionId,
    cwd: currentCwd,
    modelId: selectedModelId,
  });

  // =============================================
  // Thinking Framework Hook
  // =============================================
  const {
    state: thinkingState,
    isActive: thinkingIsActive,
    isPaused: thinkingIsPaused,
    currentPhase: thinkingCurrentPhase,
    steps: thinkingSteps,
    pauseFramework,
    resumeFramework,
  } = useThinkingFramework({
    sessionId: sessionId || "default",
    enabled: isActive,
  });

  // =============================================
  // Drag & Drop Handlers
  // =============================================
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setAgentStatus("Reading dropped files...");
    let newContent = "";
    
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) { 
        setMessages(prev => [...prev, { role: "system", content: `Skipped large file: ${file.name} (>2MB)` }]);
        continue;
      }

      try {
        const text = await file.text();
        if (text.includes('\0')) {
             setMessages(prev => [...prev, { role: "system", content: `Skipped binary file: ${file.name}` }]);
             continue;
        }
        newContent += `\n\n\`\`\`${file.name.split('.').pop() || 'text'} title="${file.name}"\n${text}\n\`\`\`\n`;
      } catch (err) {
        console.error(`Failed to read file ${file.name}:`, err);
      }
    }

    if (newContent) {
      setInput((prev) => {
        const separator = prev ? "\n" : "";
        return prev + separator + "I have attached the following files for context:" + newContent;
      });
      setAgentStatus("Files attached!");
      setTimeout(() => setAgentStatus(null), 2000);
    } else {
        setAgentStatus(null);
    }
  }, [setInput, setAgentStatus, setMessages]);

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
      previewEnabled,
    ]
  );

  // =============================================
  // Event Handlers for Command Lifecycle
  // =============================================

  // Track when commands start
  useTermAiEvent(
    "termai-command-started",
    (payload: CommandStartedPayload) => {
      if (payload.sessionId === sessionId || !payload.sessionId) {
        setRunningCommandId(payload.commandId);
      }
    },
    [sessionId, setRunningCommandId]
  );

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

      // In non-auto-run mode, analyze errors for fix suggestions
      // and offer to save successful commands as skills
      if (!isAutoRun) {
        if (exitCode !== 0) {
          // Trigger error analysis for failed commands
          analyzeError(command, output, exitCode);
        } else {
          // Successful command - offer to save as learned skill
          // Only for non-trivial commands (exclude simple navigation, ls, etc.)
          const trivialPatterns = /^(cd|ls|pwd|clear|exit|echo|cat|head|tail)\b/;
          if (!trivialPatterns.test(command.trim())) {
            setLearnSkillCommand(command);
            setLearnSkillOutput(output.substring(0, 500));
            setShowLearnSkill(true);
          }
        }
        return;
      }

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
        const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);
        const context =
          messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
          `\nSystem Output:\n${outputMsg}`;

        const selectedModel = models.find((m) => m.id === selectedModelId);
        const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

        const systemPrompt = buildSystemPrompt({
          cwd: currentCwd,
          isAutoRun,
          isLiteMode: useLiteMode,
          sessionId: sessionId || "default",
          includeTerminalContext: hasContext,
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
      apiKey,
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
      hasContext,
      analyzeError,
    ]
  );

  // =============================================
  // Thinking Framework Event Handlers
  // =============================================

  // Show thinking display when a framework starts
  useTermAiEvent(
    "termai-thinking-started",
    useCallback(
      (payload: ThinkingStartedPayload) => {
        if (payload.sessionId === sessionId || payload.sessionId === "default") {
          setShowThinkingDisplay(true);
          setAgentStatus(`Using ${payload.framework} framework...`);
        }
      },
      [sessionId, setAgentStatus]
    )
  );

  // Update status when framework completes
  useTermAiEvent(
    "termai-thinking-complete",
    useCallback(
      (payload: ThinkingCompletePayload) => {
        if (payload.sessionId === sessionId || payload.sessionId === "default") {
          setAgentStatus(null);
        }
      },
      [sessionId, setAgentStatus]
    )
  );

  // =============================================
  // Auto-Retry on Stall (debounced)
  // =============================================
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
          const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);
          const context = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

          const selectedModel = models.find((m) => m.id === selectedModelId);
          const useLiteMode = selectedModel ? isSmallModel(selectedModel) : isLiteMode;

          const systemPrompt = buildSystemPrompt({
            cwd: currentCwd,
            isAutoRun: true,
            isLiteMode: useLiteMode,
            sessionId: sessionId || "default",
            includeTerminalContext: hasContext,
          });
          const response = await llm.chat(systemPrompt, context, sessionId);
          setMessages((prev) => [...prev, { role: "ai", content: response }]);
          processAutoRunResponse(response);
        } catch (error) {
          console.error("[AIPanel] Retry failed:", error);
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
    apiKey,
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
    hasContext,
  ]);

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

  // Handle error fix suggestion application
  const handleApplyErrorFix = useCallback(() => {
    if (!currentAnalysis?.suggestedCommand) return;
    
    const command = currentAnalysis.suggestedCommand;
    dismissAnalysis();
    emit("termai-run-command", { command, sessionId });
  }, [currentAnalysis, dismissAnalysis, sessionId]);

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
    setStreamingContent("");
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

      // Build messages array for streaming API
      const chatMessages: LLMChatMessage[] = [
        ...messages.map((m) => ({
          role: m.role as "user" | "ai" | "system",
          content: m.content,
        })),
        { role: "user" as const, content: userMsg + skillsContext },
      ];

      const selectedModel = models.find((m) => m.id === selectedModelId);
      const useLiteMode = selectedModel
        ? isSmallModel(selectedModel)
        : isLiteMode;

      const systemPrompt = buildSystemPrompt({
        cwd: currentCwd,
        isAutoRun,
        isLiteMode: useLiteMode,
      });

      // Get Ollama endpoint if needed
      const endpoint = providerType === "ollama"
        ? localStorage.getItem("termai_ollama_endpoint") || config.defaultOllamaEndpoint
        : undefined;

      // Use streaming API
      streamAbortRef.current = LLMManager.streamChat(
        providerType,
        selectedModelId,
        chatMessages,
        systemPrompt,
        {
          onStatus: (status) => {
            setAgentStatus(status === "thinking" ? "Generating response..." : status);
          },
          onContent: (_chunk, fullContent) => {
            setStreamingContent(fullContent);
          },
          onDone: (response) => {
            setStreamingContent("");
            setMessages((prev) => [...prev, { role: "ai", content: response.content }]);
            setAgentStatus(null);
            setIsLoading(false);

            if (isAutoRun) {
              processAutoRunResponse(response.content);
            }
          },
          onError: (error) => {
            console.error("LLM Stream Error:", error);
            let errorMsg = "Sorry, something went wrong.";
            errorMsg += ` Error: ${error}`;
            if (providerType !== "ollama") {
              errorMsg += " Please check your API key in Settings.";
            } else {
              errorMsg += " Please check your Ollama endpoint and ensure the model is installed.";
            }
            setMessages((prev) => [...prev, { role: "ai", content: errorMsg }]);
            setStreamingContent("");
            setIsLoading(false);
            setAgentStatus(null);
          },
        },
        sessionId,
        endpoint
      );
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
    <div 
      className={`
        ${isEmbedded ? 'w-full h-full border-l-0 shadow-none z-[1]' : 'w-[380px] border-l border-gray-800'}
        bg-[#0d0d0d] flex flex-col h-full transition-all duration-300 overflow-hidden relative
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-purple-500/20 backdrop-blur-sm border-2 border-purple-500 border-dashed m-4 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="bg-[#1a1a1a] p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-bounce">
            <Paperclip size={48} className="text-purple-400" />
            <div className="text-xl font-bold text-white">Drop files to attach</div>
            <div className="text-sm text-gray-400">Text and code files supported</div>
          </div>
        </div>
      )}

      {/* Header */}
      {!isEmbedded && (
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between font-semibold text-gray-100">
          <div className="flex items-center gap-3">
            <Rocket size={18} className="text-purple-500" />
            <span className="text-[15px]">AI Assistant</span>
          </div>
          <button onClick={onClose} className="p-1 bg-transparent border-none cursor-pointer text-muted flex items-center justify-center hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Embedded Header */}
      {isEmbedded && (
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between font-semibold text-gray-100">
          <div className="flex items-center gap-3 flex-1">
            <Rocket size={18} className="text-purple-500" />
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="px-2 py-1 h-7 w-[140px] bg-transparent border border-gray-700 rounded text-gray-100 text-[14px] outline-none focus:border-cyan-400/50"
                  autoFocus
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSaveSessionName()
                  }
                  onBlur={handleSaveSessionName}
                />
                <button
                  onClick={handleSaveSessionName}
                  className="p-1.5 bg-transparent border-none cursor-pointer flex items-center justify-center text-emerald-500 hover:text-emerald-400"
                >
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setIsEditingName(true)}
              >
                <span className="font-semibold text-[15px]">
                  {sessionName || "AI Assistant"}
                </span>
                <Pencil size={14} className="text-gray-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto z-[100] flex flex-col gap-4 scrollbar-hide">
        {/* Thinking Framework Display */}
        {showThinkingDisplay && thinkingState && (
          <ThinkingDisplay
            framework={thinkingState.framework}
            state={thinkingState}
            steps={thinkingSteps}
            currentPhase={thinkingCurrentPhase}
            isActive={thinkingIsActive}
            isPaused={thinkingIsPaused}
            onPause={pauseFramework}
            onResume={resumeFramework}
            onCollapse={() => setShowThinkingDisplay(false)}
          />
        )}

        {isCheckingKey ? (
          <div className="p-4 rounded-lg text-[15px] leading-[1.6] bg-[#1a1a1a] text-gray-300 border border-gray-800 self-start max-w-[90%]">
            <div className="flex items-center gap-3">
              <Loader size={18} className="animate-spin text-purple-500" />
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
        {agentStatus && !pendingCommand && !streamingContent && (
          <div
            className={`
              rounded-lg p-4 my-2 flex items-center gap-3 text-[14px] text-gray-200
              ${actualNeedsAttention
                ? 'bg-purple-500/10 border-2 border-purple-400/40 animate-pulse flex-wrap justify-between'
                : 'bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-400/30'
              }
            `}
          >
            {actualNeedsAttention ? (
              <span className="text-lg">👆</span>
            ) : (
              <div className="relative">
                <Loader size={20} className="animate-spin text-purple-400" />
                <div className="absolute inset-0 animate-ping">
                  <Sparkles size={20} className="text-purple-400 opacity-30" />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="font-medium">{agentStatus}</span>
              {!actualNeedsAttention && (
                <span className="text-xs text-gray-500">AI is processing your request...</span>
              )}
            </div>
            {actualNeedsAttention && (
              <span className="inline-flex items-center gap-2 bg-purple-500 text-white text-xs font-semibold px-3 py-1.5 rounded">
                Input Required
              </span>
            )}
          </div>
        )}

        {/* Error Fix Suggestion (non-auto-run mode only) */}
        {currentAnalysis && !isAutoRun && (
          <ErrorFixSuggestion
            analysis={currentAnalysis}
            onApplyFix={handleApplyErrorFix}
            onDismiss={dismissAnalysis}
          />
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

        {/* Streaming Response */}
        {streamingContent && (
          <div className="p-4 rounded-lg text-[15px] leading-[1.6] bg-[#1a1a1a] text-gray-300 border border-purple-400/30 self-start max-w-[90%]">
            <div className="flex items-center gap-2 mb-2 text-purple-400 text-xs">
              <Loader size={12} className="animate-spin" />
              <span>Generating...</span>
            </div>
            <div className="whitespace-pre-wrap break-words font-mono text-[13px]">
              {streamingContent}
              <span className="animate-pulse">▊</span>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && !agentStatus && !streamingContent && (
          <div className="p-4 rounded-lg text-[15px] leading-[1.6] bg-[#1a1a1a] text-gray-300 border border-gray-800 self-start max-w-[90%]">
            <TypingIndicator label="Thinking" size="sm" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {hasKey && (
        <div className="p-6 bg-[#0d0d0d]">
          {/* Action Toolbar - Above input box */}
          <div className="flex justify-between items-center p-3 bg-purple-900/50 border-2 border-purple-500 rounded-lg mb-3 gap-3">
            <div className="flex items-center gap-2">
              {/* AI Status Badge - Always visible */}
              <AIStatusBadge
                state={deriveAIState({
                  isLoading,
                  agentStatus,
                  streamingContent,
                  isAutoRun,
                  consecutiveStalls,
                })}
                isAutoRun={isAutoRun}
                stepCount={autoRunCount}
                maxSteps={MAX_AUTO_STEPS}
                stallCount={consecutiveStalls}
                maxStalls={MAX_STALLS_BEFORE_ASK}
                currentCommand={agentStatus?.includes("Terminal:") || agentStatus?.includes("Coding:") ? agentStatus : undefined}
              />
              <button
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#0d0d0d] border border-gray-700 rounded-md text-gray-400 text-sm cursor-pointer transition-all hover:bg-[#141414] hover:text-purple-400 hover:border-purple-400"
                type="button"
                title="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <button
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#0d0d0d] border border-gray-700 rounded-md text-gray-400 text-sm cursor-pointer transition-all hover:bg-[#141414] hover:text-purple-400 hover:border-purple-400"
                type="button"
                title="Browse files"
              >
                <FolderOpen size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-all ${
                  isAutoRun
                    ? 'bg-green-500/20 text-green-400 border border-green-500'
                    : 'bg-transparent border border-transparent text-gray-400 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500'
                }`}
                onClick={() => toggleAutoRun()}
                type="button"
                title={isAutoRun ? "Auto-run ON - Click to disable" : "Enable auto-run mode"}
              >
                <ChevronsRight size={16} />
                <span>{isAutoRun ? "Auto-run ON" : "Auto-run"}</span>
              </button>
              {isAutoRun && (
                <>
                  <button
                    onClick={() => {
                      const newValue = !previewEnabled;
                      setPreviewEnabled(newValue);
                      localStorage.setItem("termai_preview_mode", String(newValue));
                    }}
                    className={`p-1.5 rounded-md cursor-pointer transition-all ${
                      previewEnabled ? 'text-purple-400' : 'text-gray-500'
                    } hover:bg-[#1a1a1a]`}
                    type="button"
                    title={previewEnabled ? "Disable command preview" : "Enable command preview (2s delay)"}
                  >
                    {previewEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    onClick={() => stopAutoRun("user")}
                    className="flex items-center gap-1 bg-red-500 text-white border-none rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-all hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98]"
                    type="button"
                    title="Stop Auto-Run"
                  >
                    <Square size={14} />
                    Stop
                  </button>
                </>
              )}
              <button
                onClick={() => analyzeAndLearn(messages, apiKey)}
                className={`p-1.5 rounded-md cursor-pointer transition-all ${
                  isObserving ? 'text-purple-400' : 'text-gray-500'
                } hover:bg-[#1a1a1a] hover:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed`}
                type="button"
                title="Learn skills from this session"
                disabled={isObserving || messages.length < 3}
              >
                {isObserving ? (
                  <Loader size={16} className="animate-spin" />
                ) : (
                  <GraduationCap size={16} />
                )}
              </button>
              {/* Thinking Framework Toggle */}
              <button
                onClick={() => setShowThinkingDisplay(!showThinkingDisplay)}
                className={`p-1.5 rounded-md cursor-pointer transition-all ${
                  showThinkingDisplay && thinkingState ? 'text-cyan-400' : 'text-gray-500'
                } hover:bg-[#1a1a1a] hover:text-cyan-400`}
                type="button"
                title={showThinkingDisplay ? "Hide thinking display" : "Show thinking display"}
              >
                <Brain size={16} />
              </button>
            </div>
          </div>

          <div
            className={`
              bg-[#141414] border-2 rounded-lg p-4 overflow-hidden
              transition-all duration-200
              ${actualNeedsAttention
                ? 'border-purple-400/50 shadow-[0_0_20px_rgba(168,85,247,0.2)] animate-pulse'
                : 'border-gray-800 hover:border-gray-700 focus-within:border-purple-400/40 focus-within:shadow-[0_0_20px_rgba(168,85,247,0.15)]'
              }
            `}
          >
            {/* Context chips */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
              <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded text-[13px] font-mono whitespace-nowrap border border-emerald-500/20" title={`Current directory: ${currentCwd}`}>
                <Folder size={14} />
                {currentCwd.split("/").pop() || "~"}
              </div>
              {gitBranch && (
                <div className="flex items-center gap-2 bg-purple-500/10 text-purple-400 px-3 py-1.5 rounded text-[13px] font-mono whitespace-nowrap border border-purple-400/20" title={`Git branch: ${gitBranch}`}>
                  <GitBranch size={14} />
                  git:({gitBranch})
                </div>
              )}
              {hasContext && (
                <div className="flex items-center gap-2 bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded text-[13px] font-mono whitespace-nowrap border border-blue-400/20" title={`AI has context from ${commandCount} recent commands`}>
                  <Sparkles size={14} />
                  Context
                </div>
              )}
            </div>
            {/* Input row with textarea */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '12px', width: '100%' }}>
              <textarea
                style={{
                  flex: 1,
                  minWidth: 0,
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: '#f3f4f6',
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: '16px',
                  resize: 'none',
                  outline: 'none',
                  minHeight: '28px',
                  maxHeight: '200px',
                  lineHeight: 1.6,
                  overflowY: 'auto',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
                placeholder="Ask a follow up..."
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>
            {/* Model selector and send button row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <ModelSelector
                models={models}
                selectedModelId={selectedModelId}
                onSelect={handleModelSelect}
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading}
                className={`
                  border-none rounded p-2.5 flex items-center justify-center transition-all min-w-[40px] min-h-[40px] shrink-0
                  ${input.trim() 
                    ? 'bg-purple-500 text-white hover:bg-purple-400' 
                    : 'bg-gray-800 text-gray-500'
                  }
                  ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
                `}
              >
                <ArrowUp size={18} />
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

      {/* Learn Skill Dialog */}
      {showLearnSkill && learnSkillCommand && (
        <LearnSkillDialog
          command={learnSkillCommand}
          output={learnSkillOutput}
          onSave={() => {
            setShowLearnSkill(false);
            setLearnSkillCommand(null);
            setLearnSkillOutput(undefined);
          }}
          onDismiss={() => {
            setShowLearnSkill(false);
            setLearnSkillCommand(null);
            setLearnSkillOutput(undefined);
          }}
        />
      )}

      {/* Task Completion Summary */}
      {taskSummary && (
        <TaskCompletionSummary summary={taskSummary} onDismiss={dismissSummary} />
      )}
    </div>
  );
};
