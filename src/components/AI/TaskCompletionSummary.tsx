/**
 * TaskCompletionSummary Component
 * Displays a summary when the AI finishes a task
 * Shows status with emojis: success, partial, failure
 */

import React from "react";
import styles from "./TaskCompletionSummary.module.css";

export interface TaskStep {
  command: string;
  exitCode: number;
  output?: string;
  timestamp: number;
}

export interface TaskSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  steps: TaskStep[];
  startTime: number;
  endTime: number;
  appStatus: "running" | "stopped" | "unknown" | "error";
  appPort: number | undefined;
  finalMessage: string | undefined;
  narrative?: string | undefined; // New field for detailed report
}

interface TaskCompletionSummaryProps {
  summary: TaskSummary;
  onDismiss: () => void;
  onRetry?: () => void;
}

/**
 * Get overall status emoji based on results
 */
function getOverallStatusEmoji(summary: TaskSummary): string {
  const successRate =
    summary.totalSteps > 0 ? summary.successfulSteps / summary.totalSteps : 0;

  if (successRate === 1 && summary.appStatus === "running") {
    return "🎉"; // Perfect - all good and app running
  }
  if (successRate === 1) {
    return "✅"; // All commands succeeded
  }
  if (successRate >= 0.7) {
    return "⚠️"; // Mostly successful
  }
  if (successRate >= 0.3) {
    return "😟"; // Partial success
  }
  return "❌"; // Mostly failed
}

/**
 * Get app status emoji
 */
function getAppStatusEmoji(status: TaskSummary["appStatus"]): string {
  switch (status) {
    case "running":
      return "🟢";
    case "stopped":
      return "🔴";
    case "error":
      return "💥";
    default:
      return "❓";
  }
}

/**
 * Get app status label
 */
function getAppStatusLabel(
  status: TaskSummary["appStatus"],
  port?: number,
): string {
  switch (status) {
    case "running":
      return port ? `Running on port ${port}` : "Running";
    case "stopped":
      return "Not running";
    case "error":
      return "Error state";
    default:
      return "Unknown";
  }
}

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get step status emoji
 */
function getStepEmoji(exitCode: number): string {
  return exitCode === 0 ? "✓" : "✗";
}

export const TaskCompletionSummary: React.FC<TaskCompletionSummaryProps> = ({
  summary,
  onDismiss,
  onRetry,
}) => {
  const overallEmoji = getOverallStatusEmoji(summary);
  const appEmoji = getAppStatusEmoji(summary.appStatus);
  const duration = formatDuration(summary.endTime - summary.startTime);
  const successRate =
    summary.totalSteps > 0
      ? Math.round((summary.successfulSteps / summary.totalSteps) * 100)
      : 0;

  // Determine overall status class
  const statusClass =
    successRate === 100 && summary.appStatus === "running"
      ? styles.statusSuccess
      : successRate >= 70
        ? styles.statusWarning
        : styles.statusError;

  return (
    <div className={`${styles.container} ${statusClass}`}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.overallEmoji}>{overallEmoji}</span>
        <div className={styles.headerText}>
          <h3 className={styles.title}>Task Complete</h3>
          <span className={styles.duration}>Completed in {duration}</span>
        </div>
        <button className={styles.dismissBtn} onClick={onDismiss}>
          ×
        </button>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {summary.successfulSteps}/{summary.totalSteps}
          </span>
          <span className={styles.statLabel}>Steps Passed</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{successRate}%</span>
          <span className={styles.statLabel}>Success Rate</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statEmoji}>{appEmoji}</span>
          <span className={styles.statLabel}>
            {getAppStatusLabel(summary.appStatus, summary.appPort)}
          </span>
        </div>
      </div>

      {/* Mission Report / Narrative */}
      {summary.narrative && (
        <div className={styles.narrativeSection}>
          <h4 className={styles.stepsTitle}>Mission Report</h4>
          <div className={styles.narrativeContent}>
            {summary.narrative.split('\n').map((line, i) => (
              <div key={i} style={{ marginBottom: line.trim().startsWith('-') ? '4px' : '8px' }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Steps Summary */}
      {summary.steps.length > 0 && (
        <div className={styles.stepsSection}>
          <h4 className={styles.stepsTitle}>Commands Executed</h4>
          <div className={styles.stepsList}>
            {summary.steps.slice(-5).map((step, idx) => (
              <div
                key={idx}
                className={`${styles.step} ${step.exitCode === 0 ? styles.stepSuccess : styles.stepFailed}`}
              >
                <span className={styles.stepEmoji}>
                  {getStepEmoji(step.exitCode)}
                </span>
                <code className={styles.stepCommand}>
                  {step.command.substring(0, 50)}
                  {step.command.length > 50 ? "..." : ""}
                </code>
                <span className={styles.stepCode}>Exit: {step.exitCode}</span>
              </div>
            ))}
            {summary.steps.length > 5 && (
              <div className={styles.moreSteps}>
                +{summary.steps.length - 5} more commands
              </div>
            )}
          </div>
        </div>
      )}

      {/* Final Message */}
      {summary.finalMessage && (
        <div className={styles.finalMessage}>{summary.finalMessage}</div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {summary.appStatus === "running" && summary.appPort && (
          <a
            href={`http://localhost:${summary.appPort}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.openBtn}
          >
            🌐 Open App
          </a>
        )}
        {(summary.failedSteps > 0 || summary.appStatus === "error") &&
          onRetry && (
            <button className={styles.retryBtn} onClick={onRetry}>
              🔄 Retry Failed
            </button>
          )}
        <button className={styles.doneBtn} onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  );
};
