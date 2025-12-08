/**
 * Example usage of Framework Visualization Components
 *
 * This file demonstrates how to use all the framework visual components together.
 * This is for reference only and should not be imported into production code.
 */

import React, { useState } from 'react';
import type { ThinkingStep, FrameworkType } from '../../../types/frameworks';
import { PhaseProgress } from './PhaseProgress';
import { ConfidenceBadge } from './ConfidenceBadge';
import { StepCard } from './StepCard';
import { FrameworkBadge } from './FrameworkBadge';

// Mock data for demonstration
const mockPhases = [
  { name: 'Observe', description: 'Gather system state, errors, logs', icon: '👁️' },
  { name: 'Orient', description: 'Analyze and form hypotheses', icon: '🧭' },
  { name: 'Decide', description: 'Choose best course of action', icon: '🤔' },
  { name: 'Act', description: 'Execute and monitor', icon: '⚡' },
];

const mockSteps: ThinkingStep[] = [
  {
    id: 'step-1',
    framework: 'ooda',
    phase: 'Observe',
    thought: 'Checking system logs for error patterns related to authentication failures...',
    action: 'grep -r "ERROR" /var/log/auth.log',
    result: {
      success: true,
      output: 'Found 3 authentication failures in the last hour from IP 192.168.1.100',
    },
    confidence: 0.85,
    timestamp: Date.now() - 300000,
  },
  {
    id: 'step-2',
    framework: 'ooda',
    phase: 'Orient',
    thought: 'Analyzing the pattern: multiple failed login attempts suggest possible brute force attack or misconfigured client.',
    action: 'cat /var/log/auth.log | grep "192.168.1.100"',
    result: {
      success: true,
      output: 'All attempts used valid username but incorrect password. Pattern matches automated attack.',
    },
    confidence: 0.75,
    timestamp: Date.now() - 240000,
  },
  {
    id: 'step-3',
    framework: 'ooda',
    phase: 'Decide',
    thought: 'Based on the evidence, this appears to be a brute force attack. Best action is to temporarily block the IP and investigate further.',
    confidence: 0.65,
    timestamp: Date.now() - 180000,
  },
];

export const FrameworkVisualsExample: React.FC = () => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(['step-1']));
  const [selectedFramework] = useState<FrameworkType>('ooda');

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

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-white">Framework Visualization Components</h1>
          <p className="text-gray-400">Demo of all thinking framework visual components</p>
        </div>

        {/* Section 1: Framework Badge */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Framework Badge</h2>
          <div className="flex flex-wrap gap-3">
            <FrameworkBadge framework="ooda" showName={true} />
            <FrameworkBadge framework="five_whys" showName={true} />
            <FrameworkBadge framework="bayesian" showName={true} />
            <FrameworkBadge framework="chain_of_thought" showName={true} />
            <FrameworkBadge framework="ooda" showName={false} />
          </div>
        </div>

        {/* Section 2: Confidence Badge */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Confidence Badge</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-2">High Confidence (85%)</p>
              <ConfidenceBadge confidence={0.85} size="sm" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Medium Confidence (60%)</p>
              <ConfidenceBadge confidence={0.60} size="md" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Low Confidence (30%)</p>
              <ConfidenceBadge confidence={0.30} size="lg" />
            </div>
          </div>
        </div>

        {/* Section 3: Phase Progress */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Phase Progress</h2>
          <PhaseProgress
            phases={mockPhases}
            currentPhase="Orient"
            completedPhases={['Observe']}
            color="#3b82f6"
          />
        </div>

        {/* Section 4: Complete Framework Display */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Complete Framework Display</h2>
            <div className="flex items-center gap-3">
              <FrameworkBadge framework={selectedFramework} showName={true} />
              <ConfidenceBadge confidence={0.75} size="md" />
            </div>
          </div>

          {/* Phase Progress */}
          <PhaseProgress
            phases={mockPhases}
            currentPhase="Orient"
            completedPhases={['Observe']}
            color="#3b82f6"
          />

          {/* Steps */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Thinking Steps
            </h3>
            {mockSteps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                isExpanded={expandedSteps.has(step.id)}
                onToggle={() => toggleStep(step.id)}
              />
            ))}
          </div>
        </div>

        {/* Usage Instructions */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Usage</h2>
          <div className="text-sm text-gray-300 space-y-2">
            <p>Import the components:</p>
            <pre className="bg-gray-900 rounded p-3 overflow-x-auto">
              <code className="text-green-400">
                {`import {
  PhaseProgress,
  ConfidenceBadge,
  StepCard,
  FrameworkBadge
} from './components/AI/FrameworkVisuals';`}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
