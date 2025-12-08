# Framework Visualization Components - Technical Overview

## File Structure

```
/home/normanking/github/TermAi/src/components/AI/FrameworkVisuals/
├── index.ts                    # Barrel exports
├── PhaseProgress.tsx           # Phase progress visualization (3.6KB)
├── ConfidenceBadge.tsx         # Confidence level badge (2.3KB)
├── StepCard.tsx                # Expandable thinking step card (4.2KB)
├── FrameworkBadge.tsx          # Framework identifier badge (1.3KB)
├── Example.tsx                 # Usage example and demo (6.7KB)
├── README.md                   # Documentation (6.1KB)
└── COMPONENTS.md               # This file
```

## Component Details

### 1. PhaseProgress.tsx
**Purpose:** Visual progress indicator showing all phases of a framework execution

**Features:**
- Connected dots showing phase progression
- Current phase highlighted with pulse animation
- Completed phases marked with checkmarks
- Future phases dimmed
- Phase names and descriptions
- Custom color support via props

**Props:**
```typescript
interface PhaseProgressProps {
  phases: { name: string; description: string; icon?: string }[];
  currentPhase: string;
  completedPhases: string[];
  color: string;
}
```

**Key Implementation:**
- Normalizes phase names for case-insensitive comparison
- Uses Tailwind CSS for styling
- Responsive flex layout
- Animated pulse effect on current phase using CSS animations
- lucide-react Check icon for completed phases

---

### 2. ConfidenceBadge.tsx
**Purpose:** Display confidence level with color-coded visual feedback

**Features:**
- Three confidence tiers: High (>70%), Medium (40-70%), Low (<40%)
- Color-coded: Green, Yellow, Red
- Three size variants: sm, md, lg
- Percentage display
- Icon indicators (CheckCircle, AlertTriangle, AlertCircle)

**Props:**
```typescript
interface ConfidenceBadgeProps {
  confidence: number; // 0-1
  size?: 'sm' | 'md' | 'lg';
}
```

**Key Implementation:**
- Clamps confidence values between 0 and 1
- Dynamic icon selection based on confidence level
- Tailwind classes for styling with opacity variations
- Hover tooltip with exact percentage

---

### 3. StepCard.tsx
**Purpose:** Expandable card displaying detailed information about a thinking step

**Features:**
- Collapsible content with chevron indicator
- Phase badge
- Timestamp display
- Success/failure indicators
- Thought preview (truncates at 100 chars)
- Full thought, action, and result when expanded
- Syntax-highlighted code blocks
- Integrated confidence badge

**Props:**
```typescript
interface StepCardProps {
  step: ThinkingStep;
  isExpanded: boolean;
  onToggle: () => void;
}
```

**Key Implementation:**
- Uses ThinkingStep type from frameworks.ts
- Timestamp formatting with toLocaleTimeString
- Conditional rendering for action and result
- Different styling for success vs. failure results
- lucide-react icons: ChevronDown, ChevronRight, CheckCircle, XCircle, Clock

---

### 4. FrameworkBadge.tsx
**Purpose:** Compact badge showing framework identity

**Features:**
- Framework-specific emoji icon
- Framework display name
- Custom color theming per framework
- Optional name display (icon-only mode)
- Hover shadow effect

**Props:**
```typescript
interface FrameworkBadgeProps {
  framework: FrameworkType;
  showName?: boolean;
}
```

**Key Implementation:**
- Imports utility functions from useThinkingFramework hook
- Dynamic styling based on framework color
- Inline styles for color theming
- Tailwind classes for base styling

---

## Integration Points

### Type Dependencies
All components import types from:
- `../../../types/frameworks.ts`
  - FrameworkType
  - ThinkingStep
  - FrameworkInfo (via getFrameworkInfo)

### Hook Dependencies
Some components use utilities from:
- `../../../hooks/useThinkingFramework.ts`
  - getFrameworkColor()
  - getFrameworkIcon()
  - formatFrameworkName()

### External Dependencies
- **React**: Core framework
- **lucide-react**: Icon library
  - Check, ChevronDown, ChevronRight
  - CheckCircle, XCircle, AlertCircle, AlertTriangle
  - Clock

### CSS Framework
- **Tailwind CSS**: All styling uses Tailwind utility classes
- Dark theme compatible (bg-gray-800/900, text-gray-200/300)

---

## Usage Pattern

### Basic Import
```typescript
import {
  PhaseProgress,
  ConfidenceBadge,
  StepCard,
  FrameworkBadge
} from '@/components/AI/FrameworkVisuals';
```

### With useThinkingFramework Hook
```typescript
import { useThinkingFramework } from '@/hooks/useThinkingFramework';
import { PhaseProgress, StepCard } from '@/components/AI/FrameworkVisuals';
import { getFrameworkInfo } from '@/types/frameworks';

function MyComponent({ sessionId }: { sessionId: string }) {
  const { state, steps, currentPhase } = useThinkingFramework({ sessionId });
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  if (!state) return null;

  const framework = getFrameworkInfo(state.framework);
  const completedPhases = steps
    .map(s => s.phase)
    .filter((phase, index, arr) => arr.indexOf(phase) !== index);

  return (
    <div>
      <PhaseProgress
        phases={framework.phases}
        currentPhase={currentPhase || ''}
        completedPhases={completedPhases}
        color={framework.color || '#6b7280'}
      />

      {steps.map(step => (
        <StepCard
          key={step.id}
          step={step}
          isExpanded={expandedSteps.has(step.id)}
          onToggle={() => {
            setExpandedSteps(prev => {
              const next = new Set(prev);
              next.has(step.id) ? next.delete(step.id) : next.add(step.id);
              return next;
            });
          }}
        />
      ))}
    </div>
  );
}
```

---

## Design Decisions

### Color System
- All frameworks have predefined colors in FRAMEWORK_INFO
- Colors are passed as hex strings and applied via inline styles
- Tailwind classes used for structure, inline styles for theming

### Phase Matching
- Phase names are normalized (lowercase, trimmed) for comparison
- Allows flexible matching regardless of casing

### Dark Theme
- All components use gray-800/900 backgrounds
- Text uses gray-200/300 for readability
- Borders use gray-700/600

### Responsive Design
- FlexBox layouts adapt to container width
- Text truncation on small screens (line-clamp-2)
- Icon sizes scale with component size

### Accessibility
- Semantic HTML structure
- Title attributes for tooltips
- Button elements for interactive areas
- Proper ARIA labels (could be enhanced further)

---

## Testing Recommendations

### Unit Tests
1. **PhaseProgress**: Test phase highlighting, completion status, normalization
2. **ConfidenceBadge**: Test color selection, size variants, percentage calculation
3. **StepCard**: Test expand/collapse, data display, success/failure states
4. **FrameworkBadge**: Test icon/name display, color application

### Integration Tests
1. Test with useThinkingFramework hook
2. Test with real framework execution data
3. Test phase transitions
4. Test step addition and updates

### Visual Tests
1. Storybook stories for each component
2. Dark theme compatibility
3. Responsive behavior
4. Animation smoothness

---

## Future Enhancements

### Potential Features
1. **PhaseProgress**:
   - Vertical layout option
   - Click to jump to phase
   - Phase duration display

2. **ConfidenceBadge**:
   - Trend indicator (confidence increasing/decreasing)
   - Historical confidence graph

3. **StepCard**:
   - Copy action/result buttons
   - Re-run action capability
   - Inline editing for thought

4. **FrameworkBadge**:
   - Framework switching dropdown
   - Recommendation indicator

### Accessibility Improvements
1. Keyboard navigation for StepCard
2. Screen reader announcements for phase changes
3. Focus management for expanded content
4. High contrast mode support

### Performance
1. Virtualization for large step lists
2. Memoization of expensive renders
3. Lazy loading of expanded content

---

## Version History

- **v1.0** (2025-12-08): Initial implementation
  - PhaseProgress with animation
  - ConfidenceBadge with three tiers
  - StepCard with expand/collapse
  - FrameworkBadge with icon/name
  - Example component for demos
  - Complete documentation
