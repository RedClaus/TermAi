import { memo, useState, useMemo } from "react";
import type { BlockData } from "../../types";
import {
  ChevronRight,
  ChevronDown,
  CheckCircle,
  XCircle,
  SkipForward,
} from "lucide-react";
import { emit } from "../../events";
import { TypingIndicator } from "../common";

interface BlockProps {
  data: BlockData;
  isSelected?: boolean | undefined;
  onClick?: (() => void) | undefined;
  defaultCollapsed?: boolean | undefined;
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
 * Warp-style design with left border accent
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
        className={`
          group mb-6 font-mono rounded-lg overflow-hidden
          border border-gray-800 hover:border-gray-700
          transition-colors duration-200
          ${isSelected ? 'border-cyan-400/50' : ''}
        `}
        onClick={onClick}
      >
        {/* Header with emerald path and cyan command */}
        <div className="flex items-center gap-3 bg-[#1a1a1a] px-5 py-4 border-b border-gray-800">
          <span className="text-[14px] font-semibold font-mono text-emerald-500">{data.cwd}</span>
          <ChevronRight size={16} className="text-gray-600" />
          <span className="text-[15px] font-mono text-cyan-400 flex-1">{data.command}</span>
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            {!data.isLoading && (
              <span className="inline-flex items-center">
                {data.exitCode === 0 ? (
                  <CheckCircle size={14} className="text-emerald-500" />
                ) : (
                  <XCircle size={14} className="text-red-500" />
                )}
              </span>
            )}
            <span className="text-xs text-gray-500">{formattedTime}</span>
          </div>
        </div>

        {/* Output section */}
        <div
          className={`
            px-5 py-4 font-mono bg-[#0f0f0f]
            ${data.exitCode !== 0 ? 'border-l-4 border-red-500' : ''}
            ${isCollapsed ? 'max-h-[180px] overflow-hidden relative' : ''}
          `}
        >
          {/* Gradient fade for collapsed state */}
          {isCollapsed && (
            <div className="absolute bottom-12 left-0 right-0 h-12 bg-gradient-to-t from-[#0f0f0f] to-transparent pointer-events-none" />
          )}
          
          {data.isLoading ? (
            <div className="flex items-center justify-between gap-4">
              <TypingIndicator label="Running" size="sm" />
              <button
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 border-none rounded-lg text-white text-[14px] font-semibold cursor-pointer transition-all duration-150 whitespace-nowrap"
                onClick={(e) => {
                  e.stopPropagation();
                  emit("termai-cancel-command", {
                    commandId: data.id,
                    sessionId,
                  });
                }}
                title="Skip this command and continue"
              >
                <SkipForward size={16} />
                Skip
              </button>
            </div>
          ) : (
            <>
              <pre className={`m-0 whitespace-pre-wrap break-words text-[14px] leading-[1.6] ${data.exitCode !== 0 ? 'text-red-400' : 'text-gray-300'}`}>
                {displayOutput}
              </pre>
              {isCollapsible && (
                <button
                  className="flex items-center gap-2 mt-4 px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg text-gray-400 text-[14px] cursor-pointer transition-all duration-150 hover:bg-[#222222] hover:text-cyan-400 hover:border-gray-700"
                  onClick={toggleCollapse}
                  title={isCollapsed ? "Show full output" : "Collapse output"}
                >
                  {isCollapsed ? (
                    <>
                      <ChevronDown size={16} />
                      <span>Show all {lineCount} lines</span>
                    </>
                  ) : (
                    <>
                      <ChevronRight size={16} />
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
