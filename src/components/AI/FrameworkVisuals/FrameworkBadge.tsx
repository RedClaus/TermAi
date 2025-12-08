/**
 * FrameworkBadge - Small badge showing framework name with icon
 *
 * Displays the framework type with its associated icon and color.
 * Optionally shows the full framework name.
 */

import React from 'react';
import type { FrameworkType } from '../../../types/frameworks';
import { getFrameworkColor, getFrameworkIcon, formatFrameworkName } from '../../../hooks/useThinkingFramework';

export interface FrameworkBadgeProps {
  framework: FrameworkType;
  showName?: boolean;
}

export const FrameworkBadge: React.FC<FrameworkBadgeProps> = ({
  framework,
  showName = true,
}) => {
  const color = getFrameworkColor(framework);
  const icon = getFrameworkIcon(framework);
  const name = formatFrameworkName(framework);

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200 hover:shadow-lg"
      style={{
        backgroundColor: `${color}20`,
        borderColor: `${color}40`,
        color: color,
      }}
    >
      {/* Icon */}
      <span className="text-base leading-none">{icon}</span>

      {/* Framework name */}
      {showName && (
        <span className="text-sm font-semibold whitespace-nowrap">
          {name}
        </span>
      )}
    </div>
  );
};
