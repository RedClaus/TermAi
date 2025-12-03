/**
 * AIPanel Component
 * Main AI chat interface - refactored to use extracted components and hooks
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
import { AVAILABLE_MODELS, isSmallModel, getModelSize } from "../../data/models";
import { emit } from "../../events";

// Hooks
import { useChatHistory } from "../../hooks/useChatHistory";
import { useSafetyCheck } from "../../hooks/useSafetyCheck";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import { useObserver } from "../../hooks/useObserver";

// Components
import { ModelSelector } from "./ModelSelector";
import { ChatMessage } from "./ChatMessage";
import { APIKeyPrompt } from "./APIKeyPrompt";
import { SafetyConfirmDialog } from "./SafetyConfirmDialog";
import { ComplexRequestDialog } from "./ComplexRequestDialog";
import { CommandPreview } from "./CommandPreview";
import {
  TaskCompletionSummary,
  type TaskStep,
  type TaskSummary,
} from "./TaskCompletionSummary";

// Types
import type { ProviderType } from "../../types";
import type { ModelSpec } from "../../data/models";
import type { CwdChangedPayload } from "../../events/types";

// =============================================
// Command Validation Helpers
// =============================================

/**
 * Known shell commands and utilities - commands must start with one of these
 * or be a path to an executable
 */
const KNOWN_COMMANDS = new Set([
  // Core shell commands
  "cd", "ls", "ll", "la", "pwd", "echo", "printf", "cat", "head", "tail", "less", "more",
  "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown", "chgrp", "ln",
  "find", "locate", "which", "whereis", "type", "file", "stat",
  // Text processing
  "grep", "egrep", "fgrep", "rg", "ag", "awk", "sed", "cut", "sort", "uniq", "wc", "tr", "diff", "patch",
  "head", "tail", "tee", "xargs", "column",
  // File viewing/editing
  "nano", "vim", "vi", "nvim", "emacs", "code", "subl",
  // Archive/compression
  "tar", "zip", "unzip", "gzip", "gunzip", "bzip2", "xz", "7z",
  // Network
  "curl", "wget", "ssh", "scp", "rsync", "ping", "netstat", "ss", "lsof", "nc", "nmap",
  "ifconfig", "ip", "nslookup", "dig", "host", "traceroute", "tracert", "telnet",
  // Process management
  "ps", "top", "htop", "kill", "killall", "pkill", "pgrep", "nice", "nohup", "bg", "fg", "jobs",
  // System
  "sudo", "su", "whoami", "id", "groups", "uname", "hostname", "uptime", "date", "cal",
  "df", "du", "free", "vmstat", "iostat", "dmesg", "journalctl", "systemctl", "service",
  "mount", "umount", "fdisk", "lsblk", "blkid",
  // Package managers
  "apt", "apt-get", "dpkg", "yum", "dnf", "pacman", "brew", "snap", "flatpak",
  "pip", "pip3", "pipx", "npm", "npx", "yarn", "pnpm", "bun", "deno",
  "cargo", "rustup", "go", "gem", "bundle", "composer", "maven", "mvn", "gradle",
  // Development
  "git", "gh", "docker", "docker-compose", "podman", "kubectl", "helm", "terraform",
  "make", "cmake", "gcc", "g++", "clang", "javac", "java", "python", "python3", "node", "ruby", "perl", "php",
  "tsc", "esbuild", "vite", "webpack", "rollup", "jest", "vitest", "pytest", "mocha",
  // Misc utilities
  "man", "info", "help", "clear", "reset", "history", "alias", "export", "source", "env", "set", "unset",
  "sleep", "watch", "time", "timeout", "yes", "true", "false", "test", "expr", "bc",
  "jq", "yq", "xmllint", "base64", "md5sum", "sha256sum", "openssl",
  // macOS specific
  "open", "pbcopy", "pbpaste", "defaults", "launchctl", "sw_vers", "diskutil", "hdiutil",
  // Windows/PowerShell (in case they slip through)
  "powershell", "pwsh", "cmd", "dir", "copy", "move", "del", "type", "ipconfig",
]);

/**
 * Patterns that indicate this is explanatory text, not a command
 */
const EXPLANATORY_TEXT_PATTERNS = [
  /^the\s+/i,
  /^this\s+/i,
  /^that\s+/i,
  /^here\s+/i,
  /^now\s+/i,
  /^next\s+/i,
  /^first\s+/i,
  /^then\s+/i,
  /^after\s+/i,
  /^before\s+/i,
  /^you\s+(can|should|need|must|will|may)/i,
  /^we\s+(can|should|need|must|will|may)/i,
  /^it\s+(will|should|can|is|was)/i,
  /^let\s+me/i,
  /^let's\s+/i,
  /^i\s+(will|would|can|am|have|need)/i,
  /^please\s+/i,
  /^note:/i,
  /^note\s+that/i,
  /^remember/i,
  /^important:/i,
  /^warning:/i,
  /^error:/i,
  /^example:/i,
  /^output:/i,
  /^result:/i,
  /^expected/i,
  /^actually/i,
  /^however/i,
  /^although/i,
  /^because/i,
  /^since\s+/i,
  /^when\s+/i,
  /^if\s+you/i,
  /^if\s+the/i,
  /^if\s+this/i,
  /^once\s+/i,
  /^to\s+(do|fix|solve|run|start|install|create|make|build|test|check|verify)/i,
  /^in\s+order\s+to/i,
  /^make\s+sure/i,
  /^be\s+sure/i,
  /^don't\s+/i,
  /^do\s+not/i,
  /^try\s+to/i,
  /^trying\s+to/i,
  /^attempt/i,
  /^failed/i,
  /^success/i,
  /^looks\s+like/i,
  /^seems\s+like/i,
  /^appears\s+/i,
  /^based\s+on/i,
  /^according\s+to/i,
  /^\d+\.\s+/, // numbered lists like "1. First step"
  /^-\s+[A-Z]/, // bullet points starting with capital letter
  /^\*\s+[A-Z]/, // bullet points starting with capital letter
  /^step\s+\d/i,
  /^option\s+\d/i,
  /previous/i,
  /following/i,
  /above/i,
  /below/i,
];

/**
 * Check if a string looks like command output rather than a command
 */
const looksLikeOutput = (text: string): boolean => {
  const outputPatterns = [
    /^up to date/i,
    /^found \d+ vulnerabilities/i,
    /^npm warn/i,
    /^npm notice/i,
    /^npm err!/i,
    /^added \d+ packages/i,
    /^removed \d+ packages/i,
    /^audited \d+ packages/i,
    /^total \d+/i,
    /^drwx/, // ls -la output
    /^-rw/, // ls -la output
    /^├──/, // tree output
    /^└──/, // tree output
    /^│/, // tree output
    /^\s*\d+\s+\w+\s+\w+/, // ps aux output
    /^LISTEN\s/i,
    /^tcp\s/i,
    /^udp\s/i,
    /^Python version:/i,
    /^PySide6/i,
    /^✅/,
    /^❌/,
    /^Error:/i,
    /^Warning:/i,
    /^Traceback/i,
    /^File "/i,
    /^\s{4,}/, // Lines starting with 4+ spaces (likely output/indented code)
    /^=+$/, // Separator lines
    /^-+$/, // Separator lines
    /^\[.*\]$/, // Status indicators like [OK], [FAILED]
    /^Loading/i,
    /^Downloading/i,
    /^Installing/i,
    /^Compiling/i,
    /^Building/i,
    /^Running/i,
    /^Starting/i,
    /^Stopping/i,
    /^Waiting/i,
    /^Done\.?$/i,
    /^Finished/i,
    /^Complete/i,
    /^\d+%/, // Progress percentages
  ];

  return outputPatterns.some((pattern) => pattern.test(text));
};

/**
 * Check if text looks like natural language explanation rather than a command
 */
const looksLikeExplanatoryText = (text: string): boolean => {
  const trimmed = text.trim();
  
  // Check against known explanatory patterns
  if (EXPLANATORY_TEXT_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }
  
  // Contains multiple sentences (commands rarely have periods followed by capital letters)
  if (/\.\s+[A-Z]/.test(trimmed)) {
    return true;
  }
  
  // Contains question marks (explanatory text or questions)
  if (trimmed.includes("?")) {
    return true;
  }
  
  // Very long without pipes, redirects, or common command separators
  if (trimmed.length > 100 && !/[|><;&]/.test(trimmed)) {
    return true;
  }
  
  // Contains markdown-style formatting (explanatory text)
  if (/\*\*[^*]+\*\*/.test(trimmed) || /`[^`]+`/.test(trimmed)) {
    return true;
  }
  
  return false;
};

/**
 * Check if a string is a valid command
 */
const isValidCommand = (text: string): boolean => {
  // Empty or whitespace only
  if (!text || !text.trim()) return false;
  
  const trimmed = text.trim();

  // Too long to be a single command (likely output or file content)
  if (trimmed.length > 500) return false;

  // Looks like command output
  if (looksLikeOutput(trimmed)) return false;
  
  // Looks like explanatory text
  if (looksLikeExplanatoryText(trimmed)) return false;

  // Contains error messages being echoed back
  if (trimmed.includes("no such file or directory:")) return false;
  if (trimmed.includes("command not found")) return false;
  if (trimmed.includes("Permission denied")) return false;
  
  // Contains placeholder paths that AI commonly outputs
  if (/\/path\/to\//.test(trimmed)) return false;
  if (/<[^>]+>/.test(trimmed) && !trimmed.startsWith("cat")) return false; // <placeholder> but not heredoc
  if (/\[.*\]/.test(trimmed) && !/\[.*=.*\]/.test(trimmed)) return false; // [placeholder] but not [key=value]

  // Extract the first word (the command name)
  const firstWord = trimmed.split(/[\s;&|]/)[0].replace(/^sudo\s+/, "");
  const commandName = firstWord.replace(/^\.\//, "").replace(/^~\//, "").split("/").pop() || "";
  
  // Check if it starts with a known command
  if (KNOWN_COMMANDS.has(commandName.toLowerCase())) {
    return true;
  }
  
  // Allow paths to executables
  if (/^\.\//.test(trimmed) || /^~\//.test(trimmed) || /^\//.test(trimmed)) {
    return true;
  }
  
  // Allow subshell execution
  if (/^\$\(/.test(trimmed)) {
    return true;
  }
  
  // Allow environment variable assignment followed by command
  if (/^[A-Z_][A-Z0-9_]*=/.test(trimmed)) {
    return true;
  }

  // If none of the above, reject it
  console.log(`[AIPanel] Rejecting as invalid command: "${trimmed.substring(0, 50)}..."`);
  return false;
};

/**
 * Extract and validate a single command from code block content
 * Returns null if invalid or multi-line with issues
 */
const extractSingleCommand = (blockContent: string): string | null => {
  const lines = blockContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  if (lines.length === 0) return null;

  // If single line, validate and return
  if (lines.length === 1) {
    const cmd = lines[0];
    return isValidCommand(cmd) ? cmd : null;
  }

  // Multi-line: check if it's a valid compound command or needs splitting
  // For now, only allow if joined with && or ; or if it's a here-doc/script

  // Check if first line is a shebang (script content, not a command)
  if (lines[0].startsWith("#!")) return null;

  // Check if it's a valid multi-line command pattern (e.g., with backslash continuation)
  if (blockContent.includes("\\\n")) {
    // Command with line continuation - join and validate
    const joined = blockContent.replace(/\\\n\s*/g, " ").trim();
    return isValidCommand(joined) ? joined : null;
  }

  // Check if lines can be combined with && (all valid commands)
  const allValid = lines.every((l) => isValidCommand(l));
  if (allValid && lines.length <= 3) {
    // Combine with && for sequential execution
    const combined = lines.join(" && ");
    console.log(
      `[AIPanel] Combining ${lines.length} commands with &&:`,
      combined,
    );
    return combined;
  }

  // Otherwise, just take the first valid command
  const firstValid = lines.find((l) => isValidCommand(l));
  if (firstValid) {
    console.log(
      `[AIPanel] Multi-line block, using first valid command:`,
      firstValid,
    );
    return firstValid;
  }

  return null;
};

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  isEmbedded?: boolean;
  isActive?: boolean;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  isEmbedded,
  isActive = true,
}) => {
  // =============================================
  // State
  // =============================================
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoRun, setIsAutoRun] = useState(false);
  const [_autoRunCount, setAutoRunCount] = useState(0);
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

  // Task tracking state
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);
  const [taskStartTime, setTaskStartTime] = useState<number | null>(null);
  const [taskSummary, setTaskSummary] = useState<TaskSummary | null>(null);

  // Command preview state for auto-run
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(() => {
    const saved = localStorage.getItem("termai_preview_mode");
    return saved === "true";
  });

  // Lite mode for small LLMs
  const [isLiteMode, setIsLiteMode] = useState(false);
  const [liteModeNotified, setLiteModeNotified] = useState(false);

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
  // Attention State - determines if AI needs user input
  // =============================================
  const needsAttention =
    agentStatus?.toLowerCase().includes("waiting") ||
    agentStatus?.toLowerCase().includes("stalled") ||
    agentStatus?.toLowerCase().includes("input") ||
    showSafetyConfirm;

  // Emit event when attention state changes
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
      if (reason === "complete" && successfulSteps > 0) {
        setTimeout(() => {
          analyzeAndLearn(messages, apiKey);
        }, 1000);
      }

      // Cancel any running command
      if (runningCommandId) {
        emit("termai-cancel-command", {
          commandId: runningCommandId,
          sessionId,
        });
        setRunningCommandId(null);
      }
    },
    [isAutoRun, taskStartTime, taskSteps, runningCommandId, sessionId, analyzeAndLearn, apiKey, messages],
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
  // API Key Saving
  // =============================================
  const handleSaveKey = useCallback(
    async (key: string) => {
      const provider = localStorage.getItem("termai_provider") || "gemini";
      
      if (provider === "ollama") {
        // For Ollama, the "key" is actually the endpoint
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
        
        // Fetch models after saving key
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
        setKeyError(error instanceof Error ? error.message : "Failed to save API key");
        setHasKey(false);
      } finally {
        setIsCheckingKey(false);
      }
    },
    [fetchOllamaModels, setMessages],
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

      if (hasServerKey) {
        // Fetch dynamic models
        const dynamicModels = await LLMManager.fetchModels(storedProvider);
        if (dynamicModels.length > 0) {
          setModels((prev) => {
            const others = prev.filter((p) => p.provider !== storedProvider);
            return [...others, ...dynamicModels] as ModelSpec[];
          });
          if (storedProvider === "gemini") {
            setAgentStatus(`Fetched ${dynamicModels.length} Gemini models`);
            setTimeout(() => setAgentStatus(null), 2000);
          }
        }
      }

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

  // Load settings on mount (only when active tab)
  useEffect(() => {
    if (isActive) {
      loadSettings();
    }
  }, [isOpen, isActive, loadSettings]);

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
              2,
            )}`
          : "";

      const context =
        messages.map((m) => `${m.role}: ${m.content}`).join("\n") +
        skillsContext +
        `\nUser: ${userMsg}`;
      // Check if selected model is small and needs lite prompt
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

        // If preview mode is enabled, show the command preview
        if (previewEnabled) {
          setPendingCommand(nextCommand);
          setAgentStatus("Review command before execution...");
          return;
        }

        // Otherwise execute immediately
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
          // Extract narrative: try to find Mission Report, otherwise use full text
          let narrative = "";
          const reportMatch = response.match(/Mission Report:([\s\S]*?)Task Complete/i);
          if (reportMatch) {
             narrative = reportMatch[1].trim();
          } else {
             // Fallback: take the whole response minus "Task Complete"
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
    [sessionId, getCommandImpact, requestSafetyConfirmation, stopAutoRun, setMessages, previewEnabled],
  );

  // Handle command preview actions
  const handlePreviewExecute = useCallback(() => {
    if (!pendingCommand) return;
    setAutoRunCount((prev) => prev + 1);
    emit("termai-run-command", { command: pendingCommand, sessionId });
    const isCoding =
      pendingCommand.startsWith("echo") ||
      pendingCommand.startsWith("cat") ||
      pendingCommand.startsWith("printf") ||
      pendingCommand.includes(">");
    setAgentStatus(
      isCoding ? `Coding: ${pendingCommand}` : `Terminal: ${pendingCommand}`,
    );
    setPendingCommand(null);
  }, [pendingCommand, sessionId]);

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
  }, [pendingCommand, setMessages]);

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
        preview: messages[messages.length - 1]?.content?.substring(0, 50) || "",
      });
    }
  }, [sessionId, sessionName, messages]);

  // =============================================
  // Model Selection Handler
  // =============================================
  const handleModelSelect = (model: ModelSpec) => {
    setSelectedModelId(model.id);
    const newProvider = model.provider;
    localStorage.setItem("termai_provider", newProvider);

    // Check if this is a small model that needs lite mode
    const needsLiteMode = isSmallModel(model);
    const modelSize = getModelSize(model);
    
    if (needsLiteMode !== isLiteMode) {
      setIsLiteMode(needsLiteMode);
      setLiteModeNotified(false); // Reset notification flag for new model
    }

    // Notify user about lite mode
    if (needsLiteMode && !liteModeNotified) {
      setLiteModeNotified(true);
      const sizeInfo = modelSize ? ` (${modelSize})` : "";
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `⚡ **Lite Mode Enabled** for ${model.name}${sizeInfo}

This model has limited capacity, so TermAI is using a simplified prompt to ensure better results.

**What this means:**
- Shorter, more focused instructions
- Basic command format only
- May need more guidance for complex tasks

**For better results with complex tasks**, consider using:
- \`qwen2.5-coder:14b\` - Best for coding tasks
- \`deepseek-coder-v2\` - Great code generation
- \`dolphin-mixtral\` - Most capable (slower)
- Cloud models (Gemini, Claude, GPT-4)`,
        },
      ]);
    }

    const storedKey = localStorage.getItem(`termai_${newProvider}_key`);
    if (newProvider === "ollama") {
      setHasKey(true);
      setApiKey(storedKey || "http://localhost:11434");
    } else {
      setApiKey("");
      // Check if server has key
      LLMManager.hasApiKey(newProvider).then((hasIt) => {
        setHasKey(hasIt);
        if (hasIt) {
          // Fetch models if we have key
          LLMManager.fetchModels(newProvider).then((dynamicModels) => {
            if (dynamicModels.length > 0) {
              setModels((prev) => {
                const others = prev.filter((p) => p.provider !== newProvider);
                return [...others, ...dynamicModels] as ModelSpec[];
              });
            }
          });
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `Switched to ${model.name}. Please enter your ${newProvider} API key.`,
            },
          ]);
        }
      });
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
                onChange={(e) => {
                  const enabling = e.target.checked;
                  setIsAutoRun(enabling);
                  if (enabling) {
                    // Starting auto-run - initialize task tracking
                    setTaskStartTime(Date.now());
                    setTaskSteps([]);
                    setTaskSummary(null);
                  } else {
                    setAutoRunCount(0);
                  }
                }}
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
                  title={previewEnabled ? "Disable command preview (run immediately)" : "Enable command preview (2s delay)"}
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
                const enabling = e.target.checked;
                setIsAutoRun(enabling);
                if (enabling) {
                  setTaskStartTime(Date.now());
                  setTaskSteps([]);
                  setTaskSummary(null);
                } else {
                  setAutoRunCount(0);
                }
              }}
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
                title={previewEnabled ? "Disable command preview" : "Enable command preview"}
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
              needsAttention && styles.waitingForInput,
            )}
          >
            {needsAttention ? (
              <span style={{ fontSize: "16px" }}>👆</span>
            ) : (
              <Loader size={14} className={styles.spinner} />
            )}
            <span>{agentStatus}</span>
            {needsAttention && (
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
              needsAttention && styles.needsAttention,
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
        <TaskCompletionSummary
          summary={taskSummary}
          onDismiss={dismissSummary}
        />
      )}
    </div>
  );
};
