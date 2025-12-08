/**
 * ContextIndicator - Visual display of RAPID context
 *
 * Shows what context TermAI has gathered about the user's environment.
 * Helps users understand why AI responses are informed and accurate.
 */

import { useState } from "react";
import {
  Brain,
  Terminal,
  GitBranch,
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Cpu,
  FolderOpen,
  Activity,
} from "lucide-react";
import type { ContextSummary, ContextSummaryItem } from "../../hooks/useSmartContext";

// ===========================================
// Types
// ===========================================

interface ContextIndicatorProps {
  context: ContextSummary | null;
  isGathering: boolean;
  onRefresh?: () => void;
  compact?: boolean;
  className?: string;
}

// ===========================================
// Icon mapping
// ===========================================

const TYPE_ICONS: Record<ContextSummaryItem["type"], React.ReactNode> = {
  env: <Terminal size={12} />,
  project: <Package size={12} />,
  runtime: <Cpu size={12} />,
  git: <GitBranch size={12} />,
  error: <AlertCircle size={12} />,
  commands: <Activity size={12} />,
};

const TYPE_COLORS: Record<ContextSummaryItem["type"], string> = {
  env: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  project: "bg-green-500/20 text-green-400 border-green-500/30",
  runtime: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  git: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
  commands: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ===========================================
// Component
// ===========================================

export function ContextIndicator({
  context,
  isGathering,
  onRefresh,
  compact = false,
  className = "",
}: ContextIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  // No context gathered yet
  if (!context && !isGathering) {
    return null;
  }

  const completenessPercent = context ? Math.round(context.completeness * 100) : 0;
  const completenessColor =
    completenessPercent >= 70
      ? "text-green-400"
      : completenessPercent >= 40
        ? "text-yellow-400"
        : "text-red-400";

  // Compact mode - just show icon and completeness
  if (compact) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          flex items-center gap-1 px-2 py-1 rounded-md
          bg-[#1a1a1a] border border-[#333] hover:border-[#444]
          transition-colors text-xs
          ${className}
        `}
        title={`Context: ${completenessPercent}% complete`}
      >
        {isGathering ? (
          <RefreshCw size={12} className="animate-spin text-blue-400" />
        ) : (
          <Brain size={12} className={completenessColor} />
        )}
        <span className={completenessColor}>{completenessPercent}%</span>
      </button>
    );
  }

  return (
    <div className={`bg-[#1a1a1a] border border-[#333] rounded-lg ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#222] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          {isGathering ? (
            <RefreshCw size={14} className="animate-spin text-blue-400" />
          ) : (
            <Brain size={14} className={completenessColor} />
          )}
          <span className="text-sm text-gray-300">
            Context{" "}
            <span className={`font-mono ${completenessColor}`}>
              {completenessPercent}%
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && !isGathering && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              className="p-1 hover:bg-[#333] rounded transition-colors"
              title="Refresh context"
            >
              <RefreshCw size={12} className="text-gray-500 hover:text-gray-300" />
            </button>
          )}
          {expanded ? (
            <ChevronUp size={14} className="text-gray-500" />
          ) : (
            <ChevronDown size={14} className="text-gray-500" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && context && (
        <div className="px-3 pb-3 space-y-2">
          {/* Chips */}
          <div className="flex flex-wrap gap-1.5">
            {context.items.map((item, index) => (
              <ContextChip key={`${item.type}-${index}`} item={item} />
            ))}
            {context.items.length === 0 && (
              <span className="text-xs text-gray-500 italic">No context gathered</span>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-1 border-t border-[#333]">
            <span>Gathered in {context.gatherTime}ms</span>
            <span>{context.items.length} items</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================
// Context Chip
// ===========================================

interface ContextChipProps {
  item: ContextSummaryItem;
}

function ContextChip({ item }: ContextChipProps) {
  return (
    <div
      className={`
        flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
        border ${TYPE_COLORS[item.type]}
      `}
      title={`${item.label}: ${item.value}`}
    >
      {TYPE_ICONS[item.type]}
      <span className="font-medium">{item.label}</span>
      <span className="opacity-70">{item.value}</span>
    </div>
  );
}

// ===========================================
// Context Bar (inline version for input area)
// ===========================================

interface ContextBarProps {
  context: ContextSummary | null;
  isGathering: boolean;
  className?: string;
}

export function ContextBar({ context, isGathering, className = "" }: ContextBarProps) {
  if (!context && !isGathering) {
    return null;
  }

  const completenessPercent = context ? Math.round(context.completeness * 100) : 0;

  return (
    <div className={`flex items-center gap-2 overflow-x-auto scrollbar-hide ${className}`}>
      {/* Status indicator */}
      <div className="flex items-center gap-1 px-2 py-0.5 bg-[#1a1a1a] rounded-full text-xs whitespace-nowrap">
        {isGathering ? (
          <>
            <RefreshCw size={10} className="animate-spin text-blue-400" />
            <span className="text-blue-400">Gathering...</span>
          </>
        ) : (
          <>
            <Brain
              size={10}
              className={
                completenessPercent >= 70
                  ? "text-green-400"
                  : completenessPercent >= 40
                    ? "text-yellow-400"
                    : "text-gray-400"
              }
            />
            <span className="text-gray-400">{completenessPercent}%</span>
          </>
        )}
      </div>

      {/* Compact chips - show first 4 */}
      {context?.items.slice(0, 4).map((item, index) => (
        <div
          key={`${item.type}-${index}`}
          className={`
            flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
            bg-[#1a1a1a] border border-[#333] whitespace-nowrap
          `}
        >
          {TYPE_ICONS[item.type]}
          <span className="text-gray-400">{item.value}</span>
        </div>
      ))}

      {/* More indicator */}
      {context && context.items.length > 4 && (
        <span className="text-[10px] text-gray-500 whitespace-nowrap">
          +{context.items.length - 4} more
        </span>
      )}
    </div>
  );
}

// ===========================================
// Intent Badge (show what category was detected)
// ===========================================

interface IntentBadgeProps {
  category: string;
  confidence: number;
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  installation: "bg-blue-500/20 text-blue-400",
  configuration: "bg-purple-500/20 text-purple-400",
  build: "bg-yellow-500/20 text-yellow-400",
  runtime: "bg-red-500/20 text-red-400",
  network: "bg-cyan-500/20 text-cyan-400",
  permissions: "bg-orange-500/20 text-orange-400",
  git: "bg-green-500/20 text-green-400",
  docker: "bg-indigo-500/20 text-indigo-400",
  deployment: "bg-pink-500/20 text-pink-400",
  "how-to": "bg-teal-500/20 text-teal-400",
  optimization: "bg-amber-500/20 text-amber-400",
  debugging: "bg-rose-500/20 text-rose-400",
  unknown: "bg-gray-500/20 text-gray-400",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  installation: <Package size={12} />,
  configuration: <FolderOpen size={12} />,
  build: <Cpu size={12} />,
  runtime: <AlertCircle size={12} />,
  network: <Activity size={12} />,
  permissions: <AlertCircle size={12} />,
  git: <GitBranch size={12} />,
  docker: <Package size={12} />,
  deployment: <Activity size={12} />,
  "how-to": <Brain size={12} />,
  optimization: <Cpu size={12} />,
  debugging: <Terminal size={12} />,
  unknown: <Brain size={12} />,
};

export function IntentBadge({ category, confidence, className = "" }: IntentBadgeProps) {
  const confidenceLabel =
    confidence >= 0.7 ? "high" : confidence >= 0.5 ? "medium" : "low";

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs
        ${CATEGORY_COLORS[category] || CATEGORY_COLORS.unknown}
        ${className}
      `}
      title={`Intent: ${category} (${Math.round(confidence * 100)}% confidence)`}
    >
      {CATEGORY_ICONS[category] || CATEGORY_ICONS.unknown}
      <span className="font-medium capitalize">{category.replace("-", " ")}</span>
      <span className="opacity-60">({confidenceLabel})</span>
    </div>
  );
}

// ===========================================
// Strategy Indicator (show response strategy)
// ===========================================

interface StrategyIndicatorProps {
  approach: "direct" | "assumed" | "ask";
  confidence: number;
  assumptions?: string[];
  gaps?: Array<{ field: string; question: string }>;
  className?: string;
}

export function StrategyIndicator({
  approach,
  confidence,
  assumptions = [],
  gaps = [],
  className = "",
}: StrategyIndicatorProps) {
  const strategyLabels = {
    direct: "Direct answer",
    assumed: "With assumptions",
    ask: "Need more info",
  };

  const strategyColors = {
    direct: "bg-green-500/20 text-green-400 border-green-500/30",
    assumed: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ask: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <div
      className={`
        flex items-center gap-2 px-2 py-1 rounded-md text-xs border
        ${strategyColors[approach]}
        ${className}
      `}
    >
      <span className="font-medium">{strategyLabels[approach]}</span>
      <span className="opacity-60">{Math.round(confidence * 100)}%</span>
      {assumptions.length > 0 && (
        <span className="opacity-60">({assumptions.length} assumptions)</span>
      )}
      {gaps.length > 0 && (
        <span className="opacity-60">({gaps.length} questions)</span>
      )}
    </div>
  );
}
