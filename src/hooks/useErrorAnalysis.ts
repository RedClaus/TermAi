/**
 * useErrorAnalysis Hook
 * 
 * Detects command failures and provides AI-powered fix suggestions.
 * Inspired by Butterfish's automatic error analysis feature.
 * 
 * Features:
 * - Detects common error patterns (permission denied, not found, port in use, etc.)
 * - Uses customizable prompts from PromptLibraryService
 * - Offers one-click fix application
 * - Tracks error history to avoid repeating failed fixes
 */

import { useState, useCallback, useRef } from "react";
import { PromptLibraryService } from "../services/PromptLibraryService";
import { LLMManager } from "../services/LLMManager";
import { SystemInfoService } from "../services/SystemInfoService";

// =============================================
// Error Pattern Definitions
// =============================================

export interface ErrorPattern {
  /** Pattern name for identification */
  name: string;
  /** Regex patterns to match in error output */
  patterns: RegExp[];
  /** Prompt template ID to use for analysis */
  promptId: string;
  /** Extract relevant info from the error (e.g., port number) */
  extractInfo?: (output: string) => Record<string, string>;
  /** Priority (higher = check first) */
  priority: number;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    name: "port_in_use",
    patterns: [
      /address already in use/i,
      /EADDRINUSE/i,
      /errno 98/i,
      /port is already allocated/i,
      /bind: address already in use/i,
    ],
    promptId: "port_conflict_fix",
    extractInfo: (output) => {
      // Try to extract port number
      const portMatch = output.match(/(?:port\s*[:\s]?\s*|:)(\d{2,5})/i);
      return { port: portMatch?.[1] || "unknown" };
    },
    priority: 100,
  },
  {
    name: "permission_denied",
    patterns: [
      /permission denied/i,
      /EACCES/i,
      /operation not permitted/i,
      /access is denied/i,
    ],
    promptId: "permission_fix",
    extractInfo: (output) => {
      // Try to extract the path
      const pathMatch = output.match(/['"]([^'"]+)['"]/);
      return { path: pathMatch?.[1] || "unknown" };
    },
    priority: 90,
  },
  {
    name: "command_not_found",
    patterns: [
      /command not found/i,
      /not recognized as.*command/i,
      /is not recognized/i,
      /No such file or directory.*bin/i,
    ],
    promptId: "not_found_fix",
    priority: 85,
  },
  {
    name: "file_not_found",
    patterns: [
      /no such file or directory/i,
      /ENOENT/i,
      /cannot find path/i,
      /file not found/i,
    ],
    promptId: "not_found_fix",
    priority: 80,
  },
  {
    name: "dependency_error",
    patterns: [
      /cannot find module/i,
      /module not found/i,
      /no matching version/i,
      /peer dep/i,
      /ERESOLVE/i,
      /npm ERR!/i,
      /yarn error/i,
      /pip.*error/i,
    ],
    promptId: "dependency_error_fix",
    extractInfo: (output) => {
      // Try to detect package manager
      if (/npm/i.test(output)) return { packageManager: "npm" };
      if (/yarn/i.test(output)) return { packageManager: "yarn" };
      if (/pip/i.test(output)) return { packageManager: "pip" };
      if (/cargo/i.test(output)) return { packageManager: "cargo" };
      return { packageManager: "unknown" };
    },
    priority: 75,
  },
  {
    name: "git_conflict",
    patterns: [
      /merge conflict/i,
      /CONFLICT.*Merge/i,
      /automatic merge failed/i,
      /fix conflicts/i,
    ],
    promptId: "git_conflict_resolution",
    priority: 70,
  },
  {
    name: "generic_error",
    patterns: [
      /error:/i,
      /failed:/i,
      /exception:/i,
      /fatal:/i,
    ],
    promptId: "error_analysis",
    priority: 1, // Lowest priority - catch-all
  },
];

// =============================================
// Types
// =============================================

export interface ErrorAnalysis {
  /** The detected error pattern */
  pattern: ErrorPattern;
  /** Extracted information from the error */
  extractedInfo: Record<string, string>;
  /** The failed command */
  command: string;
  /** The error output */
  output: string;
  /** Exit code */
  exitCode: number;
  /** AI-generated fix suggestion */
  suggestion?: string | undefined;
  /** Suggested command to run */
  suggestedCommand?: string | undefined;
  /** Is analysis in progress */
  isAnalyzing: boolean;
}

export interface UseErrorAnalysisConfig {
  /** Session ID for context */
  sessionId?: string | undefined;
  /** Current working directory */
  cwd: string;
  /** Model ID to use for analysis */
  modelId?: string | undefined;
  /** Callback when a fix is suggested */
  onFixSuggested?: ((analysis: ErrorAnalysis) => void) | undefined;
}

export interface UseErrorAnalysisReturn {
  /** Current error analysis (if any) */
  currentAnalysis: ErrorAnalysis | null;
  /** Is currently analyzing */
  isAnalyzing: boolean;
  /** Analyze a command failure */
  analyzeError: (command: string, output: string, exitCode: number) => Promise<ErrorAnalysis | null>;
  /** Clear current analysis */
  clearAnalysis: () => void;
  /** Apply suggested fix */
  applySuggestedFix: () => string | null;
  /** Dismiss without applying */
  dismissAnalysis: () => void;
  /** Check if output contains a known error pattern */
  detectErrorPattern: (output: string) => ErrorPattern | null;
}

// =============================================
// Hook Implementation
// =============================================

export function useErrorAnalysis(config: UseErrorAnalysisConfig): UseErrorAnalysisReturn {
  const { sessionId, cwd, modelId, onFixSuggested } = config;

  const [currentAnalysis, setCurrentAnalysis] = useState<ErrorAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Track recently analyzed errors to avoid duplicate analyses
  const recentErrorsRef = useRef<Set<string>>(new Set());

  /**
   * Detect which error pattern matches the output
   */
  const detectErrorPattern = useCallback((output: string): ErrorPattern | null => {
    // Sort by priority (highest first)
    const sortedPatterns = [...ERROR_PATTERNS].sort((a, b) => b.priority - a.priority);

    for (const pattern of sortedPatterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(output)) {
          return pattern;
        }
      }
    }

    return null;
  }, []);

  /**
   * Extract a suggested command from AI response
   */
  const extractCommandFromResponse = useCallback((response: string): string | null => {
    // Look for bash code blocks
    const bashMatch = response.match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/);
    if (bashMatch) {
      const command = bashMatch[1].trim();
      // Filter out comments and empty lines
      const lines = command.split("\n").filter(line => 
        line.trim() && !line.trim().startsWith("#")
      );
      return lines[0] || null; // Return first command
    }

    // Look for inline code
    const inlineMatch = response.match(/`([^`]+)`/);
    if (inlineMatch && inlineMatch[1].length < 200) {
      return inlineMatch[1];
    }

    return null;
  }, []);

  /**
   * Analyze a command failure and generate fix suggestions
   */
  const analyzeError = useCallback(async (
    command: string,
    output: string,
    exitCode: number
  ): Promise<ErrorAnalysis | null> => {
    // Only analyze actual errors
    if (exitCode === 0) return null;

    // Create a hash of the error to avoid duplicates
    const errorHash = `${command}:${output.substring(0, 100)}`;
    if (recentErrorsRef.current.has(errorHash)) {
      console.log("[ErrorAnalysis] Skipping duplicate error analysis");
      return null;
    }

    // Detect error pattern
    const pattern = detectErrorPattern(output);
    if (!pattern) {
      console.log("[ErrorAnalysis] No known error pattern detected");
      return null;
    }

    // Extract info from the error
    const extractedInfo = pattern.extractInfo?.(output) || {};

    // Create initial analysis
    const analysis: ErrorAnalysis = {
      pattern,
      extractedInfo,
      command,
      output,
      exitCode,
      isAnalyzing: true,
    };

    setCurrentAnalysis(analysis);
    setIsAnalyzing(true);

    // Add to recent errors
    recentErrorsRef.current.add(errorHash);
    // Clean up after 5 minutes
    setTimeout(() => recentErrorsRef.current.delete(errorHash), 5 * 60 * 1000);

    try {
      // Get system info
      const systemInfo = SystemInfoService.get();
      const os = systemInfo?.serverOS?.name || systemInfo?.os?.name || "Linux";

      // Build prompt using PromptLibraryService
      const prompt = await PromptLibraryService.getPrompt(pattern.promptId, {
        command,
        output: output.substring(0, 2000), // Limit output length
        exitCode: String(exitCode),
        cwd,
        os,
        ...extractedInfo,
      });

      if (!prompt) {
        console.warn("[ErrorAnalysis] No prompt template found:", pattern.promptId);
        setIsAnalyzing(false);
        return analysis;
      }

      // Get LLM response
      const provider = localStorage.getItem("termai_provider") || "gemini";
      const llm = LLMManager.getProvider(provider, undefined, modelId);
      
      const response = await llm.chat(
        "You are a helpful terminal assistant. Analyze errors and suggest fixes. Be concise and actionable.",
        `User: ${prompt}`,
        sessionId
      );

      // Extract suggested command
      const suggestedCommand = extractCommandFromResponse(response);

      // Update analysis with AI response
      const updatedAnalysis: ErrorAnalysis = {
        ...analysis,
        suggestion: response,
        suggestedCommand: suggestedCommand ?? undefined,
        isAnalyzing: false,
      };

      setCurrentAnalysis(updatedAnalysis);
      setIsAnalyzing(false);

      // Notify callback
      if (onFixSuggested) {
        onFixSuggested(updatedAnalysis);
      }

      return updatedAnalysis;
    } catch (error) {
      console.error("[ErrorAnalysis] Analysis failed:", error);
      setIsAnalyzing(false);
      
      // Still return the pattern detection even if AI analysis failed
      const failedAnalysis: ErrorAnalysis = {
        ...analysis,
        suggestion: "Unable to generate fix suggestion. Please check the error output above.",
        isAnalyzing: false,
      };
      setCurrentAnalysis(failedAnalysis);
      return failedAnalysis;
    }
  }, [cwd, modelId, sessionId, detectErrorPattern, extractCommandFromResponse, onFixSuggested]);

  /**
   * Clear current analysis
   */
  const clearAnalysis = useCallback(() => {
    setCurrentAnalysis(null);
    setIsAnalyzing(false);
  }, []);

  /**
   * Apply the suggested fix command
   */
  const applySuggestedFix = useCallback((): string | null => {
    if (!currentAnalysis?.suggestedCommand) return null;
    
    const command = currentAnalysis.suggestedCommand;
    clearAnalysis();
    return command;
  }, [currentAnalysis, clearAnalysis]);

  /**
   * Dismiss analysis without applying
   */
  const dismissAnalysis = useCallback(() => {
    clearAnalysis();
  }, [clearAnalysis]);

  return {
    currentAnalysis,
    isAnalyzing,
    analyzeError,
    clearAnalysis,
    applySuggestedFix,
    dismissAnalysis,
    detectErrorPattern,
  };
}

// Export error patterns for external use
export { ERROR_PATTERNS };
