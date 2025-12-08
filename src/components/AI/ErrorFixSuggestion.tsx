/**
 * ErrorFixSuggestion Component
 * 
 * Displays AI-generated fix suggestions for command errors.
 * Shows the detected error type, explanation, and a suggested command.
 */

import React from "react";
import styles from "./dialogs.module.css";
import { AlertTriangle, Play, X, Loader, Wrench } from "lucide-react";
import type { ErrorAnalysis } from "../../hooks/useErrorAnalysis";

interface ErrorFixSuggestionProps {
  analysis: ErrorAnalysis;
  onApplyFix: () => void;
  onDismiss: () => void;
}

export const ErrorFixSuggestion: React.FC<ErrorFixSuggestionProps> = ({
  analysis,
  onApplyFix,
  onDismiss,
}) => {
  const { pattern, suggestion, suggestedCommand, isAnalyzing } = analysis;

  // Get a friendly name for the error pattern
  const getErrorTypeName = (name: string): string => {
    const names: Record<string, string> = {
      port_in_use: "Port Already in Use",
      permission_denied: "Permission Denied",
      command_not_found: "Command Not Found",
      file_not_found: "File Not Found",
      dependency_error: "Dependency Error",
      git_conflict: "Git Conflict",
      generic_error: "Command Error",
    };
    return names[name] || "Error Detected";
  };

  // Get an icon color based on pattern priority
  const getIconColor = (): string => {
    if (pattern.priority >= 90) return "var(--error)";
    if (pattern.priority >= 70) return "var(--warning)";
    return "var(--text-secondary)";
  };

  return (
    <div className={styles.errorFixSuggestion}>
      <div className={styles.errorFixHeader}>
        <div className={styles.errorFixTitle}>
          <Wrench size={16} style={{ color: getIconColor() }} />
          <span>{getErrorTypeName(pattern.name)}</span>
        </div>
        <button 
          className={styles.dismissButton} 
          onClick={onDismiss}
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {isAnalyzing ? (
        <div className={styles.errorFixAnalyzing}>
          <Loader size={14} className={styles.spinner} />
          <span>Analyzing error and generating fix...</span>
        </div>
      ) : (
        <>
          {suggestion && (
            <div className={styles.errorFixExplanation}>
              {/* Truncate long suggestions */}
              {suggestion.length > 500 
                ? suggestion.substring(0, 500) + "..." 
                : suggestion}
            </div>
          )}

          {suggestedCommand && (
            <div className={styles.errorFixCommand}>
              <div className={styles.errorFixCommandHeader}>
                <AlertTriangle size={12} />
                <span>Suggested Fix:</span>
              </div>
              <code className={styles.errorFixCommandCode}>
                {suggestedCommand}
              </code>
              <button 
                className={styles.applyFixButton}
                onClick={onApplyFix}
                title="Run this command"
              >
                <Play size={12} />
                <span>Apply Fix</span>
              </button>
            </div>
          )}

          {!suggestedCommand && !isAnalyzing && (
            <div className={styles.errorFixNoCommand}>
              No automatic fix available. Please review the error above.
            </div>
          )}
        </>
      )}
    </div>
  );
};
