# Framework Visualization Components

A collection of React components for visualizing the Thinking Frameworks system in TermAI.

## Components

### PhaseProgress

Shows framework phases as connected dots/steps with current phase highlighted.

```tsx
import { PhaseProgress } from './FrameworkVisuals';

<PhaseProgress
  phases={[
    { name: 'Observe', description: 'Gather system state', icon: '👁️' },
    { name: 'Orient', description: 'Analyze hypotheses', icon: '🧭' },
    { name: 'Decide', description: 'Choose action', icon: '🤔' },
    { name: 'Act', description: 'Execute and monitor', icon: '⚡' },
  ]}
  currentPhase="Orient"
  completedPhases={['Observe']}
  color="#3b82f6"
/>
```

**Props:**
- `phases`: Array of phase definitions with name, description, and optional icon
- `currentPhase`: Name of the currently active phase
- `completedPhases`: Array of completed phase names
- `color`: Hex color for the framework theme

**Features:**
- Animated pulse effect on current phase
- Check marks on completed phases
- Progress line connecting all phases
- Responsive layout

---

### ConfidenceBadge

Shows confidence level with color-coded badge.

```tsx
import { ConfidenceBadge } from './FrameworkVisuals';

<ConfidenceBadge confidence={0.85} size="md" />
```

**Props:**
- `confidence`: Number between 0-1 representing confidence level
- `size`: Optional size variant ('sm' | 'md' | 'lg'), defaults to 'md'

**Color Mapping:**
- Green (>0.7): High confidence
- Yellow (0.4-0.7): Medium confidence
- Red (<0.4): Low confidence

---

### StepCard

Expandable card for displaying a thinking step with full details.

```tsx
import { StepCard } from './FrameworkVisuals';

const step: ThinkingStep = {
  id: 'step-1',
  framework: 'ooda',
  phase: 'Observe',
  thought: 'Analyzing system logs for error patterns...',
  action: 'grep -r "ERROR" /var/log',
  result: {
    success: true,
    output: 'Found 3 critical errors in authentication service'
  },
  confidence: 0.75,
  timestamp: Date.now(),
};

<StepCard
  step={step}
  isExpanded={false}
  onToggle={() => setExpanded(!expanded)}
/>
```

**Props:**
- `step`: ThinkingStep object containing all step data
- `isExpanded`: Boolean indicating if card is expanded
- `onToggle`: Callback function when expand/collapse is triggered

**Features:**
- Collapsible content with smooth animation
- Phase badge and timestamp display
- Success/failure indicators for results
- Syntax-highlighted action and result output
- Confidence badge integration

---

### FrameworkBadge

Small badge showing framework name with icon and color.

```tsx
import { FrameworkBadge } from './FrameworkVisuals';

<FrameworkBadge framework="ooda" showName={true} />
```

**Props:**
- `framework`: FrameworkType identifier
- `showName`: Optional boolean to show/hide framework name (default: true)

**Features:**
- Auto-styled with framework color
- Framework-specific emoji icon
- Hover effects with shadow
- Can be used icon-only by setting `showName={false}`

---

## Usage Example

Here's a complete example showing all components together:

```tsx
import React, { useState } from 'react';
import {
  PhaseProgress,
  ConfidenceBadge,
  StepCard,
  FrameworkBadge
} from './components/AI/FrameworkVisuals';
import { getFrameworkInfo } from './types/frameworks';

function ThinkingDisplay({ frameworkState }) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const frameworkInfo = getFrameworkInfo(frameworkState.framework);

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
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
    <div className="p-4 space-y-4">
      {/* Framework header */}
      <div className="flex items-center justify-between">
        <FrameworkBadge
          framework={frameworkState.framework}
          showName={true}
        />
        <ConfidenceBadge
          confidence={frameworkState.steps[frameworkState.steps.length - 1]?.confidence || 0}
          size="md"
        />
      </div>

      {/* Phase progress */}
      <PhaseProgress
        phases={frameworkInfo.phases}
        currentPhase={frameworkState.phase}
        completedPhases={getCompletedPhases(frameworkState)}
        color={frameworkInfo.color || '#6b7280'}
      />

      {/* Steps list */}
      <div className="space-y-2">
        {frameworkState.steps.map(step => (
          <StepCard
            key={step.id}
            step={step}
            isExpanded={expandedSteps.has(step.id)}
            onToggle={() => toggleStep(step.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

## Styling

All components use Tailwind CSS classes and are designed for dark theme compatibility:
- Background colors: `bg-gray-800`, `bg-gray-900`
- Text colors: `text-gray-200`, `text-gray-300`
- Border colors: `border-gray-700`, `border-gray-600`

Components are responsive and will adapt to container width.

## Integration with useThinkingFramework

These components are designed to work seamlessly with the `useThinkingFramework` hook:

```tsx
import { useThinkingFramework } from '../../hooks/useThinkingFramework';
import { PhaseProgress, StepCard } from './FrameworkVisuals';

function MyComponent() {
  const {
    state,
    steps,
    currentPhase,
    availableFrameworks
  } = useThinkingFramework({ sessionId: 'session-1' });

  if (!state) return null;

  const framework = availableFrameworks.find(f => f.type === state.framework);

  return (
    <div>
      <PhaseProgress
        phases={framework?.phases || []}
        currentPhase={currentPhase || ''}
        completedPhases={getCompletedPhases(state)}
        color={framework?.color || '#6b7280'}
      />
      {/* ... */}
    </div>
  );
}
```

## Type Safety

All components are fully typed with TypeScript and import types from:
- `../../types/frameworks` - Core framework types
- `../../hooks/useThinkingFramework` - Display utilities

```typescript
import type { ThinkingStep, FrameworkType } from '../../types/frameworks';
```
