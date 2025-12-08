/**
 * StepCard - Expandable card for a thinking step
 *
 * Shows phase, thought preview, and confidence.
 * Expands to show full content including action and result.
 */

import React from 'react';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { ThinkingStep } from '../../../types/frameworks';
import { ConfidenceBadge } from './ConfidenceBadge';

export interface StepCardProps {
  step: ThinkingStep;
  isExpanded: boolean;
  onToggle: () => void;
}

export const StepCard: React.FC<StepCardProps> = ({
  step,
  isExpanded,
  onToggle,
}) => {
  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Truncate thought for preview
  const thoughtPreview = step.thought.length > 100
    ? `${step.thought.slice(0, 100)}...`
    : step.thought;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden transition-all duration-200 hover:border-gray-600">
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-750 transition-colors"
      >
        {/* Expand/Collapse icon */}
        <div className="flex-shrink-0 mt-1">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Phase badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-300 bg-gray-700 px-2 py-0.5 rounded">
              {step.phase}
            </span>
            <span className="text-xs text-gray-500">
              <Clock className="w-3 h-3 inline mr-1" />
              {formatTime(step.timestamp)}
            </span>
            {step.result && (
              <span className="ml-auto">
                {step.result.success ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
              </span>
            )}
          </div>

          {/* Thought preview */}
          <p className="text-sm text-gray-200 mb-2">
            {isExpanded ? step.thought : thoughtPreview}
          </p>

          {/* Confidence badge */}
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={step.confidence} size="sm" />
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-700 pt-3 space-y-3">
          {/* Action */}
          {step.action && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-1">Action</div>
              <div className="text-sm text-gray-300 bg-gray-900 rounded px-3 py-2 font-mono">
                {step.action}
              </div>
            </div>
          )}

          {/* Result */}
          {step.result && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-2">
                Result
                {step.result.success ? (
                  <span className="text-green-400 text-xs">Success</span>
                ) : (
                  <span className="text-red-400 text-xs">Failed</span>
                )}
              </div>
              <div className={`
                text-sm rounded px-3 py-2 font-mono
                ${step.result.success
                  ? 'text-gray-300 bg-gray-900'
                  : 'text-red-200 bg-red-900/20 border border-red-800'
                }
              `}>
                {step.result.output}
              </div>
            </div>
          )}

          {/* Step ID (for debugging) */}
          <div className="text-xs text-gray-600">
            ID: {step.id}
          </div>
        </div>
      )}
    </div>
  );
};
