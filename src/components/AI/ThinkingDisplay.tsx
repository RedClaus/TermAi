/**
 * ThinkingDisplay
 * Displays the thinking process of a framework execution with collapsible
 * panel, phase progress, step-by-step details, and pause/resume controls
 */

import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type {
  FrameworkType,
  FrameworkState,
  ThinkingStep,
} from "../../types/frameworks";
import { FRAMEWORK_INFO } from "../../types/frameworks";
import {
  getFrameworkColor,
  getFrameworkIcon,
  formatFrameworkName,
} from "../../hooks/useThinkingFramework";

export interface ThinkingDisplayProps {
  framework: FrameworkType;
  state: FrameworkState | null;
  steps: ThinkingStep[];
  currentPhase: string | null;
  isActive: boolean;
  isPaused: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onCollapse?: () => void;
}

export const ThinkingDisplay: React.FC<ThinkingDisplayProps> = ({
  framework,
  state: _state,
  steps,
  currentPhase,
  isActive,
  isPaused,
  onPause,
  onResume,
  onCollapse,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Get framework info
  const frameworkInfo = FRAMEWORK_INFO[framework];
  const frameworkColor = getFrameworkColor(framework);
  const frameworkIconEmoji = getFrameworkIcon(framework);
  const frameworkDisplayName = formatFrameworkName(framework);

  // Phase progress
  const phases = frameworkInfo?.phases || [];
  const currentPhaseIndex = useMemo(() => {
    if (!currentPhase) return 0;
    const index = phases.findIndex(
      (p) => p.name.toLowerCase() === currentPhase.toLowerCase()
    );
    return index >= 0 ? index : 0;
  }, [currentPhase, phases]);

  const progress = phases.length > 0 ? ((currentPhaseIndex + 1) / phases.length) * 100 : 0;

  // Toggle step expansion
  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence > 0.7) return "text-green-500";
    if (confidence >= 0.4) return "text-yellow-500";
    return "text-red-500";
  };

  // Get confidence badge background
  const getConfidenceBg = (confidence: number): string => {
    if (confidence > 0.7) return "bg-green-500/20 border-green-500/40";
    if (confidence >= 0.4) return "bg-yellow-500/20 border-yellow-500/40";
    return "bg-red-500/20 border-red-500/40";
  };

  // Truncate text
  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#222222] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ borderLeftColor: frameworkColor, borderLeftWidth: "4px" }}
      >
        <div className="flex items-center gap-3 flex-1">
          <button
            className="text-gray-400 hover:text-gray-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>

          <span className="text-xl" aria-label={`${frameworkDisplayName} icon`}>
            {frameworkIconEmoji}
          </span>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-100">
                {frameworkDisplayName}
              </span>
              {isActive && !isPaused && (
                <Loader2
                  size={14}
                  className="text-blue-500 animate-spin"
                  aria-label="Thinking in progress"
                />
              )}
              {isPaused && (
                <span className="text-xs text-yellow-500 font-medium uppercase tracking-wide">
                  Paused
                </span>
              )}
            </div>
            {currentPhase && (
              <div className="text-sm text-gray-400 mt-0.5">
                Phase: {currentPhase} ({currentPhaseIndex + 1}/{phases.length})
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {isActive && !isPaused && onPause && (
              <button
                className="p-2 rounded hover:bg-gray-800 text-gray-400 hover:text-yellow-500 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onPause();
                }}
                title="Pause execution"
              >
                <Pause size={16} />
              </button>
            )}
            {isPaused && onResume && (
              <button
                className="p-2 rounded hover:bg-gray-800 text-gray-400 hover:text-green-500 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onResume();
                }}
                title="Resume execution"
              >
                <Play size={16} />
              </button>
            )}
            {onCollapse && (
              <button
                className="p-2 rounded hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onCollapse();
                }}
                title="Close thinking display"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {isExpanded && (
        <div className="px-4 pb-3">
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300 ease-out rounded-full"
              style={{
                width: `${progress}%`,
                backgroundColor: frameworkColor,
              }}
            />
          </div>

          {/* Phase Indicators */}
          <div className="flex justify-between mt-2 text-xs">
            {phases.map((phase, index) => (
              <div
                key={phase.name}
                className={`flex flex-col items-center gap-1 ${
                  index === currentPhaseIndex
                    ? "text-gray-100 font-semibold"
                    : index < currentPhaseIndex
                    ? "text-gray-400"
                    : "text-gray-600"
                }`}
              >
                <span className="text-base" aria-label={phase.description}>
                  {phase.icon || "•"}
                </span>
                <span className="text-[10px] leading-tight text-center max-w-[60px]">
                  {phase.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Steps */}
      {isExpanded && steps.length > 0 && (
        <div className="border-t border-gray-800">
          <div className="max-h-[400px] overflow-y-auto">
            {steps.map((step, index) => {
              const isExpanded = expandedSteps.has(step.id);
              const phaseInfo = phases.find(
                (p) => p.name.toLowerCase() === step.phase.toLowerCase()
              );

              return (
                <div
                  key={step.id}
                  className="border-b border-gray-800 last:border-b-0"
                >
                  {/* Step Header */}
                  <div
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[#222222] transition-colors"
                    onClick={() => toggleStep(step.id)}
                  >
                    <button
                      className="text-gray-400 hover:text-gray-200 transition-colors mt-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStep(step.id);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>

                    <div className="flex-shrink-0 mt-0.5">
                      <span className="text-lg" aria-label={step.phase}>
                        {phaseInfo?.icon || "•"}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 font-mono">
                          #{index + 1}
                        </span>
                        <span className="text-xs text-gray-400 uppercase tracking-wide">
                          {step.phase}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${getConfidenceBg(
                            step.confidence
                          )} ${getConfidenceColor(step.confidence)}`}
                        >
                          {Math.round(step.confidence * 100)}%
                        </span>
                        {step.result && (
                          <span
                            className={`ml-auto ${
                              step.result.success
                                ? "text-green-500"
                                : "text-red-500"
                            }`}
                          >
                            {step.result.success ? (
                              <CheckCircle size={14} />
                            ) : (
                              <XCircle size={14} />
                            )}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-200">
                        {isExpanded
                          ? step.thought
                          : truncate(step.thought, 100)}
                      </div>
                    </div>
                  </div>

                  {/* Step Details (Expanded) */}
                  {isExpanded && (
                    <div className="px-4 pb-3 ml-11 space-y-2">
                      {step.action && (
                        <div className="bg-[#0f0f0f] p-3 rounded border border-gray-800">
                          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                            Action
                          </div>
                          <div className="text-sm text-cyan-400 font-mono">
                            {step.action}
                          </div>
                        </div>
                      )}

                      {step.result && (
                        <div className="bg-[#0f0f0f] p-3 rounded border border-gray-800">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-400 uppercase tracking-wide">
                              Result
                            </span>
                            {step.result.success ? (
                              <CheckCircle size={12} className="text-green-500" />
                            ) : (
                              <XCircle size={12} className="text-red-500" />
                            )}
                          </div>
                          <div
                            className={`text-sm font-mono ${
                              step.result.success
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {step.result.output}
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        {new Date(step.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {isExpanded && steps.length === 0 && (
        <div className="px-4 py-8 text-center text-gray-500">
          <AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />
          <div className="text-sm">No thinking steps yet</div>
          {isActive && (
            <div className="text-xs mt-1">Framework is initializing...</div>
          )}
        </div>
      )}
    </div>
  );
};

ThinkingDisplay.displayName = "ThinkingDisplay";
