/**
 * ConfidenceBadge - Shows confidence as a colored badge
 *
 * Displays confidence level with appropriate color coding:
 * - Green (>0.7): High confidence
 * - Yellow (0.4-0.7): Medium confidence
 * - Red (<0.4): Low confidence
 */

import React from 'react';
import { CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

export interface ConfidenceBadgeProps {
  confidence: number; // 0-1
  size?: 'sm' | 'md' | 'lg';
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  confidence,
  size = 'md',
}) => {
  // Clamp confidence between 0 and 1
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const percentage = Math.round(clampedConfidence * 100);

  // Determine color and icon based on confidence level
  const getConfidenceInfo = () => {
    if (clampedConfidence > 0.7) {
      return {
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        borderColor: 'border-green-500/30',
        icon: CheckCircle,
        label: 'High',
      };
    } else if (clampedConfidence >= 0.4) {
      return {
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        borderColor: 'border-yellow-500/30',
        icon: AlertTriangle,
        label: 'Medium',
      };
    } else {
      return {
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        borderColor: 'border-red-500/30',
        icon: AlertCircle,
        label: 'Low',
      };
    }
  };

  const { color, bgColor, borderColor, icon: Icon, label } = getConfidenceInfo();

  // Size variants
  const sizeClasses = {
    sm: {
      container: 'px-2 py-1 text-xs',
      icon: 'w-3 h-3',
      gap: 'gap-1',
    },
    md: {
      container: 'px-3 py-1.5 text-sm',
      icon: 'w-4 h-4',
      gap: 'gap-1.5',
    },
    lg: {
      container: 'px-4 py-2 text-base',
      icon: 'w-5 h-5',
      gap: 'gap-2',
    },
  };

  const { container, icon, gap } = sizeClasses[size];

  return (
    <div
      className={`
        inline-flex items-center ${gap} rounded-full border
        ${container} ${bgColor} ${borderColor} ${color}
        font-medium transition-all duration-200
      `}
      title={`Confidence: ${percentage}%`}
    >
      <Icon className={icon} />
      <span>{label}</span>
      <span className="opacity-80">{percentage}%</span>
    </div>
  );
};
