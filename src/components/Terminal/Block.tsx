import { memo, useState, useMemo } from "react";
import type { BlockData } from "../../types";
import styles from "./Block.module.css";
import clsx from "clsx";
import {
  ChevronRight,
  ChevronDown,
  CheckCircle,
  XCircle,
  SkipForward,
} from "lucide-react";
import { emit } from "../../events";

interface BlockProps {
  data: BlockData;
  isSelected?: boolean;
  onClick?: () => void;
  defaultCollapsed?: boolean;
  sessionId?: string | undefined;
}

// Threshold for auto-collapsing long output
const COLLAPSE_THRESHOLD = 5; // lines
const SUMMARY_LINES = 3;

/**
 * Generate a summary of the output
 */
function generateSummary(output: string, exitCode: number): string {
  const lines = output.trim().split("\n");
  const lineCount = lines.length;

  if (lineCount <= COLLAPSE_THRESHOLD) {
    return output;
  }

  // For successful commands, show first few lines
  if (exitCode === 0) {
    const preview = lines.slice(0, SUMMARY_LINES).join("\n");
    return `${preview}\n... (${lineCount - SUMMARY_LINES} more lines)`;
  }

  // For errors, show last few lines (usually more relevant)
  const preview = lines.slice(-SUMMARY_LINES).join("\n");
  return `... (${lineCount - SUMMARY_LINES} lines)\n${preview}`;
}

/**
 * Block Component
 * Displays a single command block with collapsible output
 * Memoized to prevent unnecessary re-renders
 */
export const Block = memo<BlockProps>(
  ({ data, isSelected, onClick, defaultCollapsed = true, sessionId }) => {
    const formattedTime = new Date(data.timestamp).toLocaleTimeString();

    // Determine if output should be collapsible
    const lineCount = useMemo(
      () => data.output?.trim().split("\n").length || 0,
      [data.output],
    );
    const isCollapsible = lineCount > COLLAPSE_THRESHOLD;

    // Auto-collapse long outputs by default
    const [isCollapsed, setIsCollapsed] = useState(
      defaultCollapsed && isCollapsible,
    );

    const displayOutput = useMemo(() => {
      if (!data.output) return "";
      if (!isCollapsed || !isCollapsible) return data.output;
      return generateSummary(data.output, data.exitCode);
    }, [data.output, data.exitCode, isCollapsed, isCollapsible]);

    const toggleCollapse = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsCollapsed(!isCollapsed);
    };

    return (
      <div
        className={clsx(styles.block, isSelected && styles.selected)}
        onClick={onClick}
      >
        <div className={styles.header}>
          <ChevronRight size={14} className={styles.prompt} />
          <div className={styles.command}>{data.command}</div>
          <div className={styles.meta}>
            {/* Status indicator */}
            {!data.isLoading && (
              <span className={styles.status}>
                {data.exitCode === 0 ? (
                  <CheckCircle size={12} className={styles.successIcon} />
                ) : (
                  <XCircle size={12} className={styles.errorIcon} />
                )}
              </span>
            )}
            {formattedTime} • {data.cwd}
          </div>
        </div>

        {/* Collapsible output section */}
        <div
          className={clsx(
            styles.output,
            data.exitCode !== 0 && styles.error,
            isCollapsed && styles.collapsed,
          )}
        >
          {data.isLoading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.loading}>
                <span className={styles.dot}>.</span>
                <span className={styles.dot}>.</span>
                <span className={styles.dot}>.</span>
                <span className={styles.loadingText}>Running...</span>
              </div>
              <button
                className={styles.skipBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  emit("termai-cancel-command", {
                    commandId: data.id,
                    sessionId,
                  });
                }}
                title="Skip this command and continue"
              >
                <SkipForward size={14} />
                Skip
              </button>
            </div>
          ) : (
            <>
              <pre className={styles.outputText}>{displayOutput}</pre>
              {isCollapsible && (
                <button
                  className={styles.expandBtn}
                  onClick={toggleCollapse}
                  title={isCollapsed ? "Show full output" : "Collapse output"}
                >
                  {isCollapsed ? (
                    <>
                      <ChevronDown size={14} />
                      <span>Show all {lineCount} lines</span>
                    </>
                  ) : (
                    <>
                      <ChevronRight size={14} />
                      <span>Collapse</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
      prevProps.data.id === nextProps.data.id &&
      prevProps.data.output === nextProps.data.output &&
      prevProps.data.isLoading === nextProps.data.isLoading &&
      prevProps.data.exitCode === nextProps.data.exitCode &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.defaultCollapsed === nextProps.defaultCollapsed &&
      prevProps.sessionId === nextProps.sessionId
    );
  },
);

Block.displayName = "Block";
