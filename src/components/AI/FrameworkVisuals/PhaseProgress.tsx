/**
 * PhaseProgress - Generic phase progress component
 *
 * Shows framework phases as connected dots/steps with current phase highlighted.
 * Completed phases are marked with check icons, future phases are dimmed.
 */

import React from 'react';
import { Check } from 'lucide-react';

export interface PhaseProgressProps {
  phases: { name: string; description: string; icon?: string }[];
  currentPhase: string;
  completedPhases: string[];
  color: string;
}

export const PhaseProgress: React.FC<PhaseProgressProps> = ({
  phases,
  currentPhase,
  completedPhases,
  color,
}) => {
  // Normalize phase names for comparison (lowercase, trim)
  const normalizePhase = (phase: string) => phase.toLowerCase().trim();
  const currentPhaseNorm = normalizePhase(currentPhase);
  const completedPhasesNorm = completedPhases.map(normalizePhase);

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between relative">
        {/* Connection line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-700" />

        {phases.map((phase, index) => {
          const phaseNorm = normalizePhase(phase.name);
          const isCompleted = completedPhasesNorm.includes(phaseNorm);
          const isCurrent = phaseNorm === currentPhaseNorm;
          const isPending = !isCompleted && !isCurrent;

          return (
            <div
              key={index}
              className="relative flex flex-col items-center"
              style={{ flex: 1 }}
            >
              {/* Dot/Circle */}
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  text-white font-medium z-10 transition-all duration-300
                  ${isCurrent ? 'ring-4 ring-opacity-30' : ''}
                  ${isPending ? 'bg-gray-700 text-gray-400' : ''}
                `}
                style={{
                  backgroundColor: isCompleted || isCurrent ? color : undefined,
                  boxShadow: isCurrent ? `0 0 20px ${color}40` : undefined,
                  ...(isCurrent ? { '--tw-ring-color': `${color}40` } as React.CSSProperties : {}),
                }}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : phase.icon ? (
                  <span className="text-lg">{phase.icon}</span>
                ) : (
                  <span className="text-sm">{index + 1}</span>
                )}
              </div>

              {/* Phase name */}
              <div className="mt-2 text-center">
                <div
                  className={`
                    text-xs font-semibold transition-colors
                    ${isCurrent ? 'text-white' : ''}
                    ${isCompleted ? 'text-gray-300' : ''}
                    ${isPending ? 'text-gray-500' : ''}
                  `}
                  style={{
                    color: isCurrent ? color : undefined,
                  }}
                >
                  {phase.name}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 max-w-[80px] line-clamp-2">
                  {phase.description}
                </div>
              </div>

              {/* Pulse animation for current phase */}
              {isCurrent && (
                <div
                  className="absolute top-0 w-10 h-10 rounded-full animate-ping opacity-20"
                  style={{ backgroundColor: color }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
