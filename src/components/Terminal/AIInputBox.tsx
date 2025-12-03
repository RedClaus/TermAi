/**
 * AIInputBox Component
 * Full AI chat interface embedded in the terminal - contains all AIPanel functionality
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { config } from "../../config";
import { AVAILABLE_MODELS, isSmallModel, getModelSize } from "../../data/models";
import { emit } from "../../events";

// Hooks
import { useChatHistory } from "../../hooks/useChatHistory";
import { useSafetyCheck } from "../../hooks/useSafetyCheck";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import { useObserver } from "../../hooks/useObserver";

// Components
import { ModelSelector } from "../AI/ModelSelector";
import { ChatMessage } from "../AI/ChatMessage";
import { SafetyConfirmDialog } from "../AI/SafetyConfirmDialog";
import { ComplexRequestDialog } from "../AI/ComplexRequestDialog";
import {
  TaskCompletionSummary,
  type TaskStep,
  type TaskSummary,
} from "../AI/TaskCompletionSummary";

// Types
import type { ModelSpec } from "../../data/models";
import type {
  CommandFinishedPayload,
  CommandStartedPayload,
  CwdChangedPayload,
  FetchModelsPayload,
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
  // =============================================
  // State
  // =============================================
  const [input, setInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoRun, setIsAutoRun] = useState(false);
  const [autoRunCount, setAutoRunCount] = useState(0);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [currentCwd, setCurrentCwd] = useState(propCwd);
  
  // Load session-specific model selection or fall back to global setting
  const [selectedModelId, setSelectedModelId] = useState(() => {
    if (sessionId) {
      const sessionModel = localStorage.getItem(`termai_model_${sessionId}`);
      if (sessionModel) return sessionModel;
    }
    // Fall back to global provider's default or first model
    const globalProvider = localStorage.getItem("termai_provider") || "gemini";
    const providerModel = AVAILABLE_MODELS.find(m => m.provider === globalProvider);
    return providerModel?.id || AVAILABLE_MODELS[0].id;
  });
  const [models, setModels] = useState(AVAILABLE_MODELS);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [showComplexConfirm, setShowComplexConfirm] = useState(false);
  const [pendingComplexMessage, setPendingComplexMessage] = useState("");
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);

  // Task tracking state
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);
  const [taskStartTime, setTaskStartTime] = useState<number | null>(null);
  const [taskSummary, setTaskSummary] = useState<TaskSummary | null>(null);

  // Lite mode for small LLMs
  const [isLiteMode, setIsLiteMode] = useState(false);
  const [liteModeNotified, setLiteModeNotified] = useState(false);
  
  // Track consecutive stalls to avoid asking user too quickly
  const [consecutiveStalls, setConsecutiveStalls] = useState(0);
  const MAX_STALLS_BEFORE_ASK = 2; // Try 2 times before asking user

  const MAX_AUTO_STEPS = 10;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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

  const { isObserving, analyzeAndLearn } = useObserver();

  // =============================================
  // Attention State
  // =============================================
  const needsAttention =
    agentStatus?.toLowerCase().includes("waiting") ||
    agentStatus?.toLowerCase().includes("stalled") ||
    agentStatus?.toLowerCase().includes("input") ||
    showSafetyConfirm;

  useEffect(() => {
    emit("termai-ai-needs-input", {
      needsInput: !!needsAttention,
      reason: agentStatus || undefined,
      sessionId,
    });
  }, [needsAttention, agentStatus, sessionId]);

  // =============================================
  // Stop Auto-Run and Generate Summary
  // =============================================
  const stopAutoRun = useCallback(
    (reason: "user" | "complete" | "error" | "limit" = "user", narrative?: string) => {
      if (!isAutoRun && !taskStartTime) return;

      const endTime = Date.now();
      const successfulSteps = taskSteps.filter((s) => s.exitCode === 0).length;
      const failedSteps = taskSteps.filter((s) => s.exitCode !== 0).length;

      // Detect if app might be running (check last few commands for server start patterns)
      const recentSteps = taskSteps.slice(-3);
      const serverPatterns =
        /npm\s+(start|run\s+dev)|python.*main|node\s+|yarn\s+(start|dev)|flask\s+run|uvicorn|gunicorn/i;
      const lastServerCommand = recentSteps.find(
        (s) => serverPatterns.test(s.command) && s.exitCode === 0,
      );

      // Try to detect port from commands or output
      let appPort: number | undefined;
      const portMatch = recentSteps
        .map((s) => s.output || s.command)
        .join(" ")
        .match(
          /(?:port|PORT|localhost:|127\.0\.0\.1:|0\.0\.0\.0:)\s*(\d{4,5})/i,
        );
      if (portMatch) {
        appPort = parseInt(portMatch[1], 10);
      }

      const summary: TaskSummary = {
        totalSteps: taskSteps.length,
        successfulSteps,
        failedSteps,
        steps: taskSteps,
        startTime: taskStartTime || endTime,
        endTime,
        appStatus: lastServerCommand
          ? "running"
          : failedSteps > successfulSteps
            ? "error"
            : "stopped",
        appPort,
        finalMessage:
          reason === "complete"
            ? "Task completed successfully!"
            : reason === "limit"
              ? "Stopped: Maximum steps reached"
              : reason === "error"
                ? "Stopped due to errors"
                : "Stopped by user",
        narrative,
      };

      setTaskSummary(summary);
      setIsAutoRun(false);
      setAutoRunCount(0);
      setAgentStatus(null);

      // Auto-Learn on successful completion
      // Trigger learning if: task completed OR we have successful steps
      const shouldLearn = reason === "complete" || successfulSteps > 0;
      console.log("[AIInputBox] stopAutoRun:", { reason, successfulSteps, shouldLearn, messageCount: messages.length });
      
      if (shouldLearn && messages.length >= 3) {
        console.log("[AIInputBox] Triggering skill learning...");
        setTimeout(() => {
          const providerType = localStorage.getItem("termai_provider") || "gemini";
          analyzeAndLearn(messages, "", providerType); 
        }, 1000);
      } else {
        console.log("[AIInputBox] Skipping skill learning:", { shouldLearn, messageCount: messages.length });
      }

      if (runningCommandId) {
        emit("termai-cancel-command", {
          commandId: runningCommandId,
          sessionId,
        });
        setRunningCommandId(null);
      }
    },
    [isAutoRun, taskStartTime, taskSteps, runningCommandId, sessionId, analyzeAndLearn, messages],
  );

  const dismissSummary = useCallback(() => {
    setTaskSummary(null);
    setTaskSteps([]);
    setTaskStartTime(null);
  }, []);

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
        setAgentStatus(`Found ${ollamaModels.length} local models`);
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
      setIsCheckingKey(false);
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

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Emit thinking state
  useEffect(() => {
    emit("termai-ai-thinking", { isThinking: isLoading, sessionId });
  }, [isLoading, sessionId]);

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

  // Update CWD from prop
  useEffect(() => {
    setCurrentCwd(propCwd);
  }, [propCwd]);

  // =============================================
  // Event Handlers
  // =============================================
  useTermAiEvent("termai-settings-changed", loadSettings, [loadSettings]);

  useTermAiEvent(
    "termai-cwd-changed",
    (payload: CwdChangedPayload) => {
      if (payload.sessionId === sessionId || !payload.sessionId) {
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
      if (payload.sessionId === sessionId || !payload.sessionId) {
        setRunningCommandId(payload.commandId);
      }
    },
    [sessionId],
  );

  // =============================================
  // Command Validation Helpers
  // =============================================
  
  /**
   * Known shell commands and utilities - commands must start with one of these
   */
  const KNOWN_COMMANDS = new Set([
    // Core shell commands
    "cd", "ls", "ll", "la", "pwd", "echo", "printf", "cat", "head", "tail", "less", "more",
    "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown", "chgrp", "ln",
    "find", "locate", "which", "whereis", "type", "file", "stat",
    // Text processing
    "grep", "egrep", "fgrep", "rg", "ag", "awk", "sed", "cut", "sort", "uniq", "wc", "tr", "diff", "patch",
    "head", "tail", "tee", "xargs", "column",
    // Network
    "curl", "wget", "ssh", "scp", "rsync", "ping", "netstat", "ss", "lsof", "nc", "nmap",
    "ifconfig", "ip", "nslookup", "dig", "host", "traceroute",
    // Process management
    "ps", "top", "htop", "kill", "killall", "pkill", "pgrep", "nice", "nohup", "bg", "fg", "jobs",
    // System
    "sudo", "su", "whoami", "id", "groups", "uname", "hostname", "uptime", "date", "cal",
    "df", "du", "free", "vmstat", "dmesg", "journalctl", "systemctl", "service",
    // Package managers
    "apt", "apt-get", "dpkg", "yum", "dnf", "pacman", "brew", "snap", "flatpak",
    "pip", "pip3", "pipx", "npm", "npx", "yarn", "pnpm", "bun", "deno",
    "cargo", "go", "gem", "bundle", "composer", "maven", "mvn", "gradle",
    // Development
    "git", "gh", "docker", "docker-compose", "podman", "kubectl", "helm", "terraform",
    "make", "cmake", "gcc", "g++", "clang", "javac", "java", "python", "python3", "node", "ruby", "perl", "php",
    "tsc", "esbuild", "vite", "webpack", "rollup", "jest", "vitest", "pytest", "mocha",
    // Misc
    "man", "info", "help", "clear", "reset", "history", "alias", "export", "source", "env", "set", "unset",
    "sleep", "watch", "time", "timeout", "yes", "true", "false", "test", "expr", "bc",
    "jq", "yq", "base64", "md5sum", "sha256sum", "openssl",
    // Editors
    "nano", "vim", "vi", "nvim", "emacs", "code", "subl",
    // Archive
    "tar", "zip", "unzip", "gzip", "gunzip", "bzip2", "xz", "7z",
    // macOS specific
    "open", "pbcopy", "pbpaste", "defaults", "launchctl", "sw_vers", "diskutil",
  ]);

  /**
   * Patterns that indicate explanatory text, not a command
   */
  const EXPLANATORY_TEXT_PATTERNS = [
    /^the\s+/i, /^this\s+/i, /^that\s+/i, /^here\s+/i, /^now\s+/i,
    /^next\s+/i, /^first\s+/i, /^then\s+/i, /^after\s+/i, /^before\s+/i,
    /^you\s+(can|should|need|must|will|may)/i,
    /^we\s+(can|should|need|must|will|may)/i,
    /^it\s+(will|should|can|is|was)/i,
    /^let\s+me/i, /^let's\s+/i,
    /^i\s+(will|would|can|am|have|need)/i,
    /^please\s+/i, /^note:/i, /^note\s+that/i, /^remember/i,
    /^important:/i, /^warning:/i, /^error:/i, /^example:/i, /^output:/i, /^result:/i,
    /^expected/i, /^actually/i, /^however/i, /^although/i, /^because/i,
    /^since\s+/i, /^when\s+/i, /^if\s+you/i, /^if\s+the/i, /^if\s+this/i, /^once\s+/i,
    /^to\s+(do|fix|solve|run|start|install|create|make|build|test|check|verify)/i,
    /^in\s+order\s+to/i, /^make\s+sure/i, /^be\s+sure/i,
    /^don't\s+/i, /^do\s+not/i, /^try\s+to/i, /^trying\s+to/i, /^attempt/i,
    /^failed/i, /^success/i, /^looks\s+like/i, /^seems\s+like/i, /^appears\s+/i,
    /^based\s+on/i, /^according\s+to/i, /^\d+\.\s+/, /^-\s+[A-Z]/, /^\*\s+[A-Z]/,
    /^step\s+\d/i, /^option\s+\d/i, /previous/i, /following/i, /above/i, /below/i,
  ];

  const looksLikeOutput = (text: string): boolean => {
    const outputPatterns = [
      /^up to date/i, /^found \d+ vulnerabilities/i, /^npm warn/i, /^npm notice/i,
      /^npm err!/i, /^added \d+ packages/i, /^removed \d+ packages/i, /^audited \d+ packages/i,
      /^total \d+/i, /^drwx/, /^-rw/, /^├──/, /^└──/, /^│/,
      /^\s*\d+\s+\w+\s+\w+/, /^LISTEN\s/i, /^tcp\s/i, /^udp\s/i,
      /^Python version:/i, /^PySide6/i, /^✅/, /^❌/,
      /^Error:/i, /^Warning:/i, /^Traceback/i, /^File "/i,
      /^\s{4,}/, /^=+$/, /^-+$/, /^\[.*\]$/,
      /^Loading/i, /^Downloading/i, /^Installing/i, /^Compiling/i,
      /^Building/i, /^Running/i, /^Starting/i, /^Stopping/i, /^Waiting/i,
      /^Done\.?$/i, /^Finished/i, /^Complete/i, /^\d+%/,
    ];
    return outputPatterns.some((pattern) => pattern.test(text));
  };

  const looksLikeExplanatoryText = (text: string): boolean => {
    const trimmed = text.trim();
    if (EXPLANATORY_TEXT_PATTERNS.some(pattern => pattern.test(trimmed))) return true;
    if (/\.\s+[A-Z]/.test(trimmed)) return true; // Multiple sentences
    if (trimmed.includes("?")) return true; // Questions
    if (trimmed.length > 100 && !/[|><;&]/.test(trimmed)) return true; // Long without shell chars
    if (/\*\*[^*]+\*\*/.test(trimmed) || /`[^`]+`/.test(trimmed)) return true; // Markdown
    return false;
  };

  const isValidCommand = (text: string): boolean => {
    if (!text || !text.trim()) return false;
    const trimmed = text.trim();
    if (trimmed.length > 500) return false;
    if (looksLikeOutput(trimmed)) return false;
    if (looksLikeExplanatoryText(trimmed)) return false;
    if (trimmed.includes("no such file or directory:")) return false;
    if (trimmed.includes("command not found")) return false;
    if (trimmed.includes("Permission denied")) return false;
    if (/\/path\/to\//.test(trimmed)) return false; // Placeholder paths
    if (/<[^>]+>/.test(trimmed) && !trimmed.startsWith("cat")) return false; // <placeholder>

    // Extract the first word (the command name)
    const firstWord = trimmed.split(/[\s;&|]/)[0].replace(/^sudo\s+/, "");
    const commandName = firstWord.replace(/^\.\//, "").replace(/^~\//, "").split("/").pop() || "";
    
    // Check if it starts with a known command
    if (KNOWN_COMMANDS.has(commandName.toLowerCase())) return true;
    
    // Allow paths to executables
    if (/^\.\//.test(trimmed) || /^~\//.test(trimmed) || /^\//.test(trimmed)) return true;
    
    // Allow subshell execution
    if (/^\$\(/.test(trimmed)) return true;
    
    // Allow environment variable assignment followed by command
    if (/^[A-Z_][A-Z0-9_]*=/.test(trimmed)) return true;

    console.log(`[AIInputBox] Rejecting as invalid command: "${trimmed.substring(0, 50)}..."`);
    return false;
  };

  const extractSingleCommand = (blockContent: string): string | null => {
    const lines = blockContent
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length === 0) return null;
    if (lines.length === 1) {
      const cmd = lines[0];
      return isValidCommand(cmd) ? cmd : null;
    }
    if (lines[0].startsWith("#!")) return null;
    if (blockContent.includes("\\\n")) {
      const joined = blockContent.replace(/\\\n\s*/g, " ").trim();
      return isValidCommand(joined) ? joined : null;
    }
    const allValid = lines.every((l) => isValidCommand(l));
    if (allValid && lines.length <= 3) {
      return lines.join(" && ");
    }
    const firstValid = lines.find((l) => isValidCommand(l));
    return firstValid || null;
  };

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

        // Execute the command
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
          // Extract narrative
          let narrative = "";
          const reportMatch = response.match(/Mission Report:([\s\S]*?)Task Complete/i);
          if (reportMatch) {
             narrative = reportMatch[1].trim();
          } else {
             narrative = response.replace(/task complete/i, "").trim();
          }
          setConsecutiveStalls(0); // Reset stall counter on success
          stopAutoRun("complete", narrative);
        } else if (
          response.includes("[ASK_USER]") ||
          response.includes("[WAIT]") ||
          response.includes("[NEED_HELP]")
        ) {
          setConsecutiveStalls(0); // Reset - AI explicitly asked for help
          setAgentStatus("Waiting for your input...");
        } else {
          // No command found - track consecutive stalls
          const newStallCount = consecutiveStalls + 1;
          setConsecutiveStalls(newStallCount);
          
          if (newStallCount >= MAX_STALLS_BEFORE_ASK) {
            // After multiple stalls, ask for user guidance
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
            // First stall - prompt AI to try an alternative approach
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
        }
      } else {
        // Found a command - reset stall counter
        setConsecutiveStalls(0);
      }

      if (response.includes("[NEW_TAB]")) {
        emit("termai-new-tab");
        setAgentStatus("Opening new tab...");
      }
    },
    [sessionId, getCommandImpact, requestSafetyConfirmation, stopAutoRun, setMessages, consecutiveStalls],
  );

  // Auto-retry when stalled (first stall only) - with debouncing to prevent request storms
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    if (consecutiveStalls === 1 && isAutoRun && !isLoading) {
      // Debounce: wait 2 seconds before retrying to prevent spam
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
          // Don't trigger another retry on error - stop the loop
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
  }, [consecutiveStalls, isAutoRun, isLoading, selectedModelId, messages, currentCwd, sessionId, models, isLiteMode, setMessages, processAutoRunResponse]);

  // Handle command finished for auto-run loop
  useTermAiEvent(
    "termai-command-finished",
    async (payload: CommandFinishedPayload) => {
      if (payload.sessionId !== sessionId && payload.sessionId) return;

      const { command, output, exitCode } = payload;
      setRunningCommandId(null);

      if (isAutoRun) {
        setTaskSteps((prev) => [
          ...prev,
          {
            command,
            exitCode,
            output: output.substring(0, 500),
            timestamp: Date.now(),
          },
        ]);
      }

      let outputMsg = `> Executed: \`${command}\` (Exit: ${exitCode})\n\nOutput:\n\`\`\`\n${output.substring(0, 1000)}${output.length > 1000 ? "..." : ""}\n\`\`\``;

      if (isAutoRun && exitCode !== 0) {
        outputMsg += `\n\nCommand Failed (Exit Code: ${exitCode}).\n\nAUTO-RECOVERY INITIATED:\n1. Review your last plan.\n2. Identify which step failed.\n3. Backtrack to the state before this step.\n4. Propose a DIFFERENT command to achieve the same goal. Do NOT repeat the failed command.`;
      }
      
      // Detect if an application successfully started/ran
      if (isAutoRun && exitCode === 0) {
        const successIndicators = [
          /please select/i,
          /choose.*option/i,
          /menu:/i,
          /available.*options/i,
          /welcome to/i,
          /server.*running/i,
          /listening on/i,
          /started.*successfully/i,
          /ready.*http/i,
          /application.*started/i,
          /press.*to.*exit/i,
          /enter.*to.*continue/i,
          /waiting for input/i,
          /╔.*╗/,  // Box drawing characters often indicate a TUI started
          /═{3,}/, // Horizontal lines in TUI
        ];
        
        const looksLikeAppStarted = successIndicators.some(pattern => pattern.test(output));
        
        if (looksLikeAppStarted) {
          outputMsg += `\n\n**APPLICATION STARTED SUCCESSFULLY** - The output shows the application is running and displaying a UI/menu. If this was the user's goal (to run/start the app), you should output your Mission Report and say "Task Complete". Do NOT run additional commands unless the user asked for something beyond just starting the app.`;
        }
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
        stopAutoRun("limit");
        return;
      }

      setIsLoading(true);
      setAgentStatus("Analyzing command output...");
      try {
        const providerType =
          localStorage.getItem("termai_provider") || "gemini";
        const llm = LLMManager.getProvider(providerType, "", selectedModelId);
        const context =
          messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
          `\nSystem Output:\n${outputMsg}`;
        
        // Check if selected model needs lite mode
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
  // Send Message
  // =============================================
  const handleSend = async (
    overrideInput?: string,
    isNewConversation = false,
  ) => {
    const textToSend = overrideInput ?? input;
    if (!textToSend.trim() || !hasKey) return;

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
      
      // Check if selected model needs lite mode
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
  // Model Selection Handler
  // =============================================
  const handleModelSelect = async (model: ModelSpec) => {
    setSelectedModelId(model.id);
    localStorage.setItem("termai_provider", model.provider);
    
    // Save model selection per session
    if (sessionId) {
      localStorage.setItem(`termai_model_${sessionId}`, model.id);
    }

    // Check if this is a small model that needs lite mode
    const needsLiteMode = isSmallModel(model);
    const modelSize = getModelSize(model);
    
    if (needsLiteMode !== isLiteMode) {
      setIsLiteMode(needsLiteMode);
      setLiteModeNotified(false);
    }

    // Notify user about lite mode
    if (needsLiteMode && !liteModeNotified) {
      setLiteModeNotified(true);
      const sizeInfo = modelSize ? ` (${modelSize})` : "";
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `⚡ **Lite Mode** enabled for ${model.name}${sizeInfo}. Using simplified prompts for better results with this smaller model. For complex tasks, consider using a larger model like qwen2.5-coder:14b.`,
        },
      ]);
    }

    if (model.provider === "ollama") {
      setHasKey(true);
    } else {
      const hasServerKey = await LLMManager.hasApiKey(model.provider);
      setHasKey(hasServerKey);
      if (!hasServerKey) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Switched to ${model.name}. Please enter your ${model.provider} API key in Settings.`,
          },
        ]);
      }
    }
    window.dispatchEvent(new Event("termai-settings-changed"));
  };

  // =============================================
  // Toggle Auto-Run
  // =============================================
  const toggleAutoRun = useCallback(() => {
    const enabling = !isAutoRun;
    setIsAutoRun(enabling);
    if (enabling) {
      setTaskStartTime(Date.now());
      setTaskSteps([]);
      setTaskSummary(null);
      setAgentStatus("Auto-run enabled");
    } else {
      setAutoRunCount(0);
      setAgentStatus("Auto-run disabled");
    }
    setTimeout(() => setAgentStatus(null), 2000);
  }, [isAutoRun]);

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
            className={`${styles.agentStatus} ${needsAttention ? styles.needsAttention : ""}`}
          >
            {needsAttention ? (
              <span className={styles.attentionIcon}>!</span>
            ) : (
              <Loader size={12} className={styles.spinner} />
            )}
            <span>{isObserving ? "Analyzing session & learning skills..." : agentStatus}</span>
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
                    console.log("[AIInputBox] Manual learn triggered, messages:", messages.length);
                    const providerType = localStorage.getItem("termai_provider") || "gemini";
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
