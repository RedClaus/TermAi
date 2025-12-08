/**
 * AIStatusBadge - Prominent status indicator showing AI state
 *
 * Displays:
 * - Current state (Idle, Thinking, Running, Analyzing, Stalled, Loop)
 * - Step counter (Step X/10) during auto-run
 * - Stall counter when approaching limit
 * - Visual indicators with colors and icons
 */

import {
  Terminal,
  Brain,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  Circle,
  Zap,
  PauseCircle,
} from "lucide-react";

export type AIState =
  | "idle"
  | "thinking"
  | "running_command"
  | "analyzing_output"
  | "stalled"
  | "loop_detected"
  | "waiting_input"
  | "waiting_safety"
  | "complete";

interface AIStatusBadgeProps {
  state: AIState;
  isAutoRun: boolean;
  stepCount: number;
  maxSteps: number;
  stallCount: number;
  maxStalls: number;
  currentCommand?: string | undefined;
  className?: string | undefined;
}

const STATE_CONFIG: Record<AIState, {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  animate?: boolean;
}> = {
  idle: {
    label: "Ready",
    icon: Circle,
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
  },
  thinking: {
    label: "Thinking",
    icon: Brain,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/50",
    animate: true,
  },
  running_command: {
    label: "Running",
    icon: Terminal,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/50",
    animate: true,
  },
  analyzing_output: {
    label: "Analyzing",
    icon: RefreshCw,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/50",
    animate: true,
  },
  stalled: {
    label: "Stalled",
    icon: PauseCircle,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/50",
    animate: true,
  },
  loop_detected: {
    label: "Loop!",
    icon: AlertTriangle,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/50",
    animate: true,
  },
  waiting_input: {
    label: "Waiting",
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/50",
    animate: true,
  },
  waiting_safety: {
    label: "Confirm",
    icon: AlertTriangle,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/50",
    animate: true,
  },
  complete: {
    label: "Done",
    icon: CheckCircle,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
};

export function AIStatusBadge({
  state,
  isAutoRun,
  stepCount,
  maxSteps,
  stallCount,
  maxStalls,
  currentCommand,
  className = "",
}: AIStatusBadgeProps) {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  // Determine if we should show warning for approaching limits
  const stepsNearLimit = stepCount >= maxSteps - 2;
  const stallsNearLimit = stallCount >= maxStalls - 1;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium
        ${config.bgColor} ${config.borderColor} ${config.color}
        ${config.animate ? 'animate-pulse' : ''}
        ${className}
      `}
      title={currentCommand ? `Current: ${currentCommand}` : config.label}
    >
      {/* Status Icon */}
      <Icon
        size={16}
        className={config.animate ? 'animate-spin' : ''}
      />

      {/* Status Label */}
      <span className="whitespace-nowrap">{config.label}</span>

      {/* Divider */}
      {isAutoRun && state !== "idle" && state !== "complete" && (
        <span className="text-gray-600">|</span>
      )}

      {/* Step Counter (during auto-run) */}
      {isAutoRun && state !== "idle" && state !== "complete" && (
        <div className={`flex items-center gap-1 ${stepsNearLimit ? 'text-yellow-400' : ''}`}>
          <Zap size={12} />
          <span className="font-mono text-xs">
            {stepCount}/{maxSteps}
          </span>
        </div>
      )}

      {/* Stall Counter (when stalls detected) */}
      {stallCount > 0 && (
        <div className={`flex items-center gap-1 ${stallsNearLimit ? 'text-red-400' : 'text-yellow-400'}`}>
          <PauseCircle size={12} />
          <span className="font-mono text-xs">
            {stallCount}/{maxStalls}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for tight spaces
 */
export function AIStatusDot({
  state,
  className = "",
}: {
  state: AIState;
  className?: string;
}) {
  const config = STATE_CONFIG[state];

  return (
    <div
      className={`
        w-2 h-2 rounded-full
        ${config.color.replace('text-', 'bg-')}
        ${config.animate ? 'animate-pulse' : ''}
        ${className}
      `}
      title={config.label}
    />
  );
}

/**
 * Helper to derive AIState from component state
 */
export function deriveAIState({
  isLoading,
  agentStatus,
  streamingContent,
  isAutoRun: _isAutoRun,
  consecutiveStalls,
}: {
  isLoading: boolean;
  agentStatus: string | null;
  streamingContent: string;
  isAutoRun: boolean;
  consecutiveStalls: number;
}): AIState {
  // Check for specific status messages
  if (agentStatus) {
    const status = agentStatus.toLowerCase();

    if (status.includes("loop")) return "loop_detected";
    if (status.includes("stall")) return "stalled";
    if (status.includes("safety") || status.includes("confirm")) return "waiting_safety";
    if (status.includes("waiting") || status.includes("input")) return "waiting_input";
    if (status.includes("terminal") || status.includes("running") || status.includes("coding")) return "running_command";
    if (status.includes("analyz")) return "analyzing_output";
    if (status.includes("complete") || status.includes("done")) return "complete";
  }

  // Check consecutive stalls
  if (consecutiveStalls > 0) return "stalled";

  // Check loading/streaming state
  if (streamingContent) return "thinking";
  if (isLoading) return "thinking";

  // Default to idle
  return "idle";
}

export default AIStatusBadge;
