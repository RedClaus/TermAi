# Thinking Frameworks Implementation Plan

## Executive Summary

This plan outlines a multi-phase approach to implementing 12 cognitive reasoning frameworks in TermAI, building on the existing RAPID framework infrastructure. The goal is to enable the AI to select and apply the most appropriate reasoning strategy based on task type, context, and confidence levels.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         THINKING FRAMEWORKS SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐   │
│  │ Framework       │───►│ Framework        │───►│ Framework               │   │
│  │ Selector        │    │ Orchestrator     │    │ Executor (per type)     │   │
│  └─────────────────┘    └──────────────────┘    └─────────────────────────┘   │
│         ▲                       │                         │                    │
│         │                       ▼                         ▼                    │
│  ┌──────┴──────────┐    ┌──────────────────┐    ┌─────────────────────────┐   │
│  │ RAPID Context   │    │ Thinking State   │    │ LLM with Streaming      │   │
│  │ (existing)      │    │ Manager          │    │ Thinking Display        │   │
│  └─────────────────┘    └──────────────────┘    └─────────────────────────┘   │
│                                                                                 │
│  Frameworks:                                                                    │
│  ├─ OODA Loop (debugging, incidents)                                           │
│  ├─ Five Whys + Fishbone (root cause)                                          │
│  ├─ Bayesian Reasoning (diagnosis)                                             │
│  ├─ Chain of Thought (multi-step tasks)                                        │
│  ├─ Pre-mortem (risk assessment)                                               │
│  ├─ First Principles (architecture)                                            │
│  ├─ Theory of Constraints (optimization)                                       │
│  ├─ Scientific Method (experiments)                                            │
│  ├─ Divide & Conquer (complex systems)                                         │
│  ├─ Feynman Technique (explanations)                                           │
│  ├─ DECIDE Framework (decisions)                                               │
│  └─ Swiss Cheese Model (post-incident)                                         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Core Infrastructure

**Duration:** 1 sprint
**Priority:** Critical
**Dependencies:** Existing RAPID framework

### 1.1 Framework Type System

Create TypeScript/JavaScript types for all frameworks.

**Files to create:**
- `server/services/frameworks/types.js` - Core type definitions
- `server/services/frameworks/index.js` - Framework registry and exports

```javascript
// server/services/frameworks/types.js

/**
 * @typedef {'ooda' | 'five_whys' | 'bayesian' | 'chain_of_thought' |
 *           'pre_mortem' | 'first_principles' | 'theory_of_constraints' |
 *           'scientific_method' | 'divide_conquer' | 'feynman' |
 *           'decide' | 'swiss_cheese'} FrameworkType
 */

/**
 * @typedef {Object} ThinkingStep
 * @property {string} id - Unique step identifier
 * @property {FrameworkType} framework - Framework being used
 * @property {string} phase - Current phase within framework
 * @property {string} thought - The reasoning content
 * @property {string} [action] - Command or action to take
 * @property {Object} [result] - Result of action
 * @property {number} confidence - 0-1 confidence in this step
 * @property {number} timestamp - When step was created
 */

/**
 * @typedef {Object} FrameworkState
 * @property {FrameworkType} framework
 * @property {string} phase - Current phase
 * @property {ThinkingStep[]} steps - All steps taken
 * @property {number} loopCount - For iterative frameworks
 * @property {Object} context - Framework-specific context
 * @property {'active' | 'paused' | 'complete' | 'failed'} status
 */

/**
 * @typedef {Object} FrameworkResult
 * @property {'success' | 'partial' | 'failed' | 'escalate'} status
 * @property {string} summary - Human-readable summary
 * @property {ThinkingStep[]} chain - Full reasoning chain
 * @property {Object} [solution] - Solution if found
 * @property {string[]} [nextSteps] - Recommended follow-ups
 */
```

### 1.2 Framework Selector Service

Determines which framework to use based on context and intent.

**File:** `server/services/frameworks/FrameworkSelector.js`

```javascript
// Integration with existing IntentClassifier
const FRAMEWORK_MAPPING = {
  // Intent category → Recommended frameworks (ordered by preference)
  debugging: ['ooda', 'five_whys', 'divide_conquer'],
  installation: ['chain_of_thought', 'pre_mortem'],
  configuration: ['chain_of_thought', 'first_principles'],
  build: ['ooda', 'five_whys', 'chain_of_thought'],
  runtime: ['ooda', 'bayesian', 'divide_conquer'],
  network: ['bayesian', 'ooda', 'divide_conquer'],
  permissions: ['chain_of_thought', 'ooda'],
  git: ['chain_of_thought', 'ooda'],
  docker: ['chain_of_thought', 'divide_conquer', 'ooda'],
  deployment: ['pre_mortem', 'chain_of_thought'],
  'how-to': ['feynman', 'chain_of_thought'],
  optimization: ['theory_of_constraints', 'first_principles'],
  unknown: ['bayesian', 'ooda']
};

// Additional keyword signals
const KEYWORD_SIGNALS = {
  ooda: ['debug', 'not working', 'broken', 'error', 'fix', 'crash'],
  five_whys: ['why', 'root cause', 'keeps happening', 'recurring', 'again'],
  bayesian: ['might be', 'could be', 'not sure', 'possibly', 'diagnose'],
  chain_of_thought: ['setup', 'install', 'configure', 'deploy', 'steps', 'how to'],
  pre_mortem: ['delete', 'remove', 'drop', 'migrate', 'production', 'dangerous'],
  first_principles: ['should I', 'best way', 'architecture', 'design', 'approach'],
  theory_of_constraints: ['slow', 'performance', 'bottleneck', 'optimize', 'faster'],
  scientific_method: ['experiment', 'test', 'hypothesis', 'verify', 'compare', 'benchmark'],
  divide_conquer: ['complex', 'multiple', 'components', 'services', 'parts'],
  feynman: ['explain', 'understand', 'what is', 'how does', 'teach me'],
  decide: ['choose', 'decision', 'option', 'trade-off', 'which one'],
  swiss_cheese: ['incident', 'post-mortem', 'review', 'what went wrong']
};
```

### 1.3 Framework Base Class

Abstract base for all framework implementations.

**File:** `server/services/frameworks/BaseFramework.js`

```javascript
class BaseFramework {
  constructor(sessionId, context, llmChat) {
    this.sessionId = sessionId;
    this.context = context;
    this.llmChat = llmChat; // Injected LLM function
    this.state = {
      framework: this.getName(),
      phase: 'init',
      steps: [],
      loopCount: 0,
      context: {},
      status: 'active'
    };
    this.maxIterations = 5;
    this.emitter = null; // For real-time updates
  }

  // Abstract methods - must be implemented
  getName() { throw new Error('Must implement getName'); }
  getPhases() { throw new Error('Must implement getPhases'); }
  async execute(problem) { throw new Error('Must implement execute'); }

  // Common methods
  async addStep(phase, thought, action = null) { /* ... */ }
  async executeCommand(command) { /* ... */ }
  emitProgress(step) { /* ... */ }
  async promptLLM(prompt, options = {}) { /* ... */ }
  getResult() { /* ... */ }
}
```

### 1.4 Thinking State Manager

Manages framework execution state across requests.

**File:** `server/services/frameworks/ThinkingStateManager.js`

```javascript
class ThinkingStateManager {
  constructor() {
    this.sessions = new Map(); // sessionId → FrameworkState
    this.history = new Map();  // sessionId → past executions
  }

  startFramework(sessionId, framework, problem) { /* ... */ }
  updateState(sessionId, update) { /* ... */ }
  getState(sessionId) { /* ... */ }
  pauseFramework(sessionId) { /* ... */ }
  resumeFramework(sessionId) { /* ... */ }
  completeFramework(sessionId, result) { /* ... */ }
  getHistory(sessionId, limit = 10) { /* ... */ }
}
```

### 1.5 API Routes

**File:** `server/routes/frameworks.js`

```javascript
// POST /api/frameworks/select - Select best framework for task
// POST /api/frameworks/execute - Execute a framework
// GET /api/frameworks/state/:sessionId - Get current state
// POST /api/frameworks/step/:sessionId - Execute next step
// POST /api/frameworks/pause/:sessionId - Pause execution
// POST /api/frameworks/resume/:sessionId - Resume execution
// GET /api/frameworks/history/:sessionId - Get execution history
```

### 1.6 Frontend Hook

**File:** `src/hooks/useThinkingFramework.ts`

```typescript
interface UseThinkingFrameworkResult {
  // State
  currentFramework: FrameworkType | null;
  state: FrameworkState | null;
  isThinking: boolean;
  steps: ThinkingStep[];

  // Actions
  selectFramework: (message: string) => Promise<FrameworkMatch[]>;
  executeFramework: (framework: FrameworkType, problem: string) => Promise<void>;
  pauseExecution: () => void;
  resumeExecution: () => void;

  // Events
  onStep: (callback: (step: ThinkingStep) => void) => () => void;
  onComplete: (callback: (result: FrameworkResult) => void) => () => void;
}
```

---

## Phase 2: Core Frameworks Implementation

**Duration:** 2 sprints
**Priority:** High
**Dependencies:** Phase 1

### 2.1 OODA Loop Framework

Best for: Real-time debugging, incident response

**File:** `server/services/frameworks/OODAFramework.js`

**Phases:**
1. **Observe** - Gather current system state, errors, logs
2. **Orient** - Analyze observations, form mental model, generate hypotheses
3. **Decide** - Select action based on hypothesis confidence
4. **Act** - Execute action, loop back with new observations

**Key Features:**
- Fast iteration cycles (max 5 loops)
- Automatic command generation for diagnostics
- Hypothesis ranking by probability
- Early exit on solution found

### 2.2 Five Whys + Fishbone Framework

Best for: Root cause analysis, recurring issues

**File:** `server/services/frameworks/FiveWhysFramework.js`

**Phases:**
1. **Fishbone Mapping** - Categorize potential causes (Machine, Method, Material, Manpower, Measurement, Environment)
2. **Why Drilling** - Recursive "why" questions (up to 7 levels)
3. **Root Identification** - Determine if cause is actionable root
4. **Remediation** - Generate fix + prevention steps

**Key Features:**
- Fishbone diagram data structure
- Root cause detection (actionable vs symptom)
- Evidence collection at each level
- Prevention recommendations

### 2.3 Chain of Thought Framework

Best for: Multi-step installations, deployments, configurations

**File:** `server/services/frameworks/ChainOfThoughtFramework.js`

**Phases:**
1. **Plan Generation** - Create step-by-step plan with dependencies
2. **Step Execution** - Execute each step with verification
3. **Verification** - Check step success via command/assertion/LLM
4. **Recovery** - Handle failures (retry, add prereq, skip, abort)

**Key Features:**
- Dependency graph for steps
- Multiple verification methods
- Automatic rollback on failure
- Progress tracking

### 2.4 Pre-mortem Framework

Best for: Destructive operations, production changes

**File:** `server/services/frameworks/PreMortemFramework.js`

**Phases:**
1. **Risk Imagination** - "It's tomorrow and this failed catastrophically. Why?"
2. **Risk Assessment** - Probability × Impact scoring
3. **Safety Checks** - Generate pre-execution checks
4. **Mitigation Planning** - Create rollback procedures

**Key Features:**
- Risk matrix (probability × impact)
- Automatic safety check generation
- User confirmation for high-risk actions
- Rollback command generation

---

## Phase 3: Advanced Frameworks

**Duration:** 2 sprints
**Priority:** Medium
**Dependencies:** Phase 2

### 3.1 Bayesian Reasoning Framework

Best for: Ambiguous errors, diagnostic workflows

**File:** `server/services/frameworks/BayesianFramework.js`

**Phases:**
1. **Prior Generation** - Generate hypotheses with initial probabilities
2. **Evidence Collection** - Gather diagnostic evidence
3. **Belief Update** - Apply Bayes' theorem to update probabilities
4. **Decision** - Act when confidence threshold reached

**Key Features:**
- Probability normalization
- Entropy calculation (uncertainty measure)
- Information gain optimization
- Diagnostic command suggestion

### 3.2 First Principles Framework

Best for: Architecture decisions, design questions

**File:** `server/services/frameworks/FirstPrinciplesFramework.js`

**Phases:**
1. **Assumption Extraction** - Find hidden assumptions in question
2. **Assumption Challenge** - Question each assumption's validity
3. **Fundamental Discovery** - Identify irreducible truths
4. **Derivation** - Build answer from fundamentals only

**Key Features:**
- Assumption identification
- Validity challenging
- Alternative approach generation
- Trade-off analysis

### 3.3 Theory of Constraints Framework

Best for: Performance optimization, bottleneck identification

**File:** `server/services/frameworks/TOCFramework.js`

**Phases:**
1. **System Mapping** - Identify all components and throughput
2. **Constraint Finding** - Locate the bottleneck
3. **Exploit** - Maximize current constraint efficiency
4. **Subordinate** - Align system to support constraint
5. **Elevate** - Add capacity if needed

**Key Features:**
- Component throughput modeling
- Bottleneck identification
- Strategy generation (exploit → subordinate → elevate)
- Metrics-based recommendations

### 3.4 Divide & Conquer Framework

Best for: Complex multi-component failures

**File:** `server/services/frameworks/DivideConquerFramework.js`

**Phases:**
1. **Decomposition** - Break system into testable components
2. **Isolation** - Test each component independently
3. **Localization** - Narrow down to failing component(s)
4. **Resolution** - Fix identified component(s)

**Key Features:**
- Binary search for failures
- Component dependency awareness
- Parallel testing where possible
- Integration verification

---

## Phase 4: UI Integration

**Duration:** 1 sprint
**Priority:** High
**Dependencies:** Phase 2

### 4.1 Thinking Display Component

**File:** `src/components/AI/ThinkingDisplay.tsx`

```typescript
interface ThinkingDisplayProps {
  framework: FrameworkType;
  steps: ThinkingStep[];
  currentPhase: string;
  isComplete: boolean;
  onPause?: () => void;
  onResume?: () => void;
}
```

**Features:**
- Collapsible thinking process
- Phase progress indicator
- Step-by-step expansion
- Real-time streaming updates
- Framework-specific visualizations

### 4.2 Framework Visualizations

**File:** `src/components/AI/FrameworkVisuals/`

```
FrameworkVisuals/
├── OODADiagram.tsx        # Circular OODA loop with current phase highlighted
├── FishboneDiagram.tsx    # Interactive Ishikawa diagram
├── BayesianBeliefs.tsx    # Probability bars with updates
├── ChainProgress.tsx      # Step checklist with dependencies
├── RiskMatrix.tsx         # Pre-mortem risk grid
├── TOCFlowDiagram.tsx     # System flow with bottleneck highlighted
└── index.ts
```

### 4.3 AIPanel Integration

**Modifications to:** `src/components/AI/AIPanel.tsx`

```typescript
// Add to handleSend flow:
const handleSend = async () => {
  // 1. Get RAPID strategy (existing)
  const strategy = await smartContext.getStrategy(userMessage);

  // 2. NEW: Select thinking framework
  const frameworkMatch = await selectFramework(userMessage, strategy.intent);

  // 3. If framework selected, execute with thinking display
  if (frameworkMatch && frameworkMatch.confidence > 0.6) {
    setShowThinking(true);
    await executeFramework(frameworkMatch.framework, userMessage, {
      onStep: (step) => addThinkingStep(step),
      onComplete: (result) => handleFrameworkComplete(result)
    });
  } else {
    // 4. Fallback to standard response
    await streamStandardResponse(userMessage, strategy);
  }
};
```

### 4.4 Event System Extensions

**Add to:** `src/events/types.ts`

```typescript
interface TermAiEvents {
  // ... existing events ...

  // Thinking framework events
  'termai-thinking-started': { sessionId: string; framework: FrameworkType; problem: string };
  'termai-thinking-step': { sessionId: string; step: ThinkingStep };
  'termai-thinking-phase': { sessionId: string; phase: string; progress: number };
  'termai-thinking-complete': { sessionId: string; result: FrameworkResult };
  'termai-thinking-paused': { sessionId: string };
  'termai-thinking-resumed': { sessionId: string };
}
```

---

## Phase 5: Learning & Optimization

**Duration:** 1 sprint
**Priority:** Medium
**Dependencies:** Phase 4

### 5.1 Framework Effectiveness Tracking

**File:** `server/services/frameworks/FrameworkAnalytics.js`

```javascript
class FrameworkAnalytics {
  // Track which frameworks succeed for which problem types
  recordExecution(sessionId, framework, intent, result) { /* ... */ }

  // Get success rates by framework × intent
  getSuccessRates() { /* ... */ }

  // Adjust framework selection based on history
  getAdjustedWeights(intent) { /* ... */ }

  // Identify patterns in successful resolutions
  analyzeSuccessPatterns() { /* ... */ }
}
```

### 5.2 Framework-Skill Integration

Connect frameworks to the existing skill learning system.

**Modifications to:** `server/routes/knowledge.js`

```javascript
// When a framework successfully resolves an issue:
// 1. Extract the key commands/steps that worked
// 2. Generate a skill from the successful pattern
// 3. Store for future similar problems

async function learnFromFramework(sessionId, frameworkResult) {
  if (frameworkResult.status === 'success') {
    const skill = await extractSkillFromChain(frameworkResult.chain);
    await KnowledgeService.saveSkill(skill);
  }
}
```

### 5.3 Framework Hints in Skills

**Enhance skill storage:**

```javascript
// skills.json entry
{
  "id": "skill_123",
  "task": "Fix npm peer dependency conflicts",
  "pattern": "npm install --legacy-peer-deps",
  "framework_hint": "ooda",  // NEW: Suggested framework
  "success_count": 5,
  "avg_iterations": 2.4      // NEW: How many framework loops typically needed
}
```

---

## Phase 6: Secondary Frameworks

**Duration:** 1 sprint
**Priority:** Low
**Dependencies:** Phase 3

### 6.1 Feynman Technique Framework

Best for: Explanations, teaching, documentation

**File:** `server/services/frameworks/FeynmanFramework.js`

**Phases:**
1. **Concept Identification** - What needs to be explained
2. **Simple Explanation** - Explain as if to a beginner
3. **Gap Identification** - Where did the explanation fail
4. **Refinement** - Simplify and use analogies

### 6.2 DECIDE Framework

Best for: Multi-option decisions

**File:** `server/services/frameworks/DECIDEFramework.js`

**Phases:**
1. **Define** - Clarify the decision needed
2. **Establish** - Set criteria for good outcome
3. **Consider** - List all alternatives
4. **Identify** - Pros/cons for each
5. **Develop** - Recommend best option
6. **Evaluate** - Review decision quality

### 6.3 Swiss Cheese Model Framework

Best for: Post-incident analysis

**File:** `server/services/frameworks/SwissCheeseFramework.js`

**Phases:**
1. **Layer Identification** - What defenses should have caught this
2. **Hole Finding** - What failed at each layer
3. **Alignment Analysis** - How holes aligned to allow failure
4. **Strengthening** - Recommendations per layer

### 6.4 Scientific Method Framework

Best for: A/B testing, benchmarking, comparisons

**File:** `server/services/frameworks/ScientificMethodFramework.js`

**Phases:**
1. **Question** - What are we trying to learn
2. **Hypothesis** - Predicted outcome
3. **Experiment Design** - Controlled test plan
4. **Execution** - Run the experiment
5. **Analysis** - Interpret results
6. **Conclusion** - Answer the original question

---

## Implementation Order Summary (Original Linear)

```
Phase 1 (Foundation)     ████████████████████  Week 1-2
├─ Types & Interfaces
├─ Framework Selector
├─ Base Framework Class
├─ State Manager
├─ API Routes
└─ Frontend Hook

Phase 2 (Core)           ████████████████████████████████████  Week 3-6
├─ OODA Loop
├─ Five Whys + Fishbone
├─ Chain of Thought
└─ Pre-mortem

Phase 4 (UI)             ████████████████████  Week 7-8
├─ Thinking Display
├─ Framework Visualizations
├─ AIPanel Integration
└─ Event System

Phase 3 (Advanced)       ████████████████████████████████████  Week 9-12
├─ Bayesian Reasoning
├─ First Principles
├─ Theory of Constraints
└─ Divide & Conquer

Phase 5 (Learning)       ████████████████████  Week 13-14
├─ Analytics
├─ Skill Integration
└─ Framework Hints

Phase 6 (Secondary)      ████████████████████  Week 15-16
├─ Feynman Technique
├─ DECIDE Framework
├─ Swiss Cheese Model
└─ Scientific Method
```

---

## OPTIMIZED BUILD ORDER (Maximum Efficiency)

### Dependency Analysis

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DEPENDENCY GRAPH                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  EXISTING RAPID ──────────────────────────────────────────────────────────────┐ │
│       │                                                                       │ │
│       ▼                                                                       │ │
│  ┌─────────┐                                                                  │ │
│  │ Types   │ ◄─── No dependencies, pure definitions                          │ │
│  └────┬────┘                                                                  │ │
│       │                                                                       │ │
│       ├──────────────────┬──────────────────┐                                 │ │
│       ▼                  ▼                  ▼                                 │ │
│  ┌─────────┐       ┌──────────┐      ┌───────────┐                           │ │
│  │ Base    │       │ Selector │      │ State     │  ◄─── Can build parallel  │ │
│  │Framework│       │          │      │ Manager   │                           │ │
│  └────┬────┘       └────┬─────┘      └─────┬─────┘                           │ │
│       │                 │                  │                                  │ │
│       └─────────────────┼──────────────────┘                                  │ │
│                         ▼                                                     │ │
│                   ┌───────────┐                                               │ │
│                   │ API Routes│  ◄─── Needs all 3 above                      │ │
│                   └─────┬─────┘                                               │ │
│                         │                                                     │ │
│       ┌─────────────────┼─────────────────┐                                   │ │
│       ▼                 ▼                 ▼                                   │ │
│  ┌─────────┐      ┌──────────┐     ┌───────────┐                             │ │
│  │ Frontend│      │ 1st Core │     │ Event     │  ◄─── Can build parallel   │ │
│  │ Hook    │      │ Framework│     │ Types     │                             │ │
│  └────┬────┘      └────┬─────┘     └─────┬─────┘                             │ │
│       │                │                 │                                    │ │
│       └────────────────┼─────────────────┘                                    │ │
│                        ▼                                                      │ │
│                  ┌───────────┐                                                │ │
│                  │ Minimal UI│  ◄─── Just ThinkingDisplay, not all visuals   │ │
│                  └─────┬─────┘                                                │ │
│                        │                                                      │ │
│                        ▼                                                      │ │
│              ┌─────────────────────────────────────────────┐                  │ │
│              │              USABLE MVP                     │                  │ │
│              │  (One framework + selector + basic UI)      │                  │ │
│              └─────────────────────────────────────────────┘                  │ │
│                                                                               │ │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Critical Path Analysis

**Critical Path (Minimum time to usable product):**
```
Types → BaseFramework → API Routes → OODA Framework → Minimal UI → MVP
  │          │              │              │              │
  1 day    2 days        1 day         3 days         2 days = 9 days to MVP
```

**Parallel Opportunities:**
- Types + Selector + StateManager can be built together (same day)
- Frontend Hook + Event Types + First Framework can be built in parallel
- All frameworks (after first) can be built in parallel
- All visualizations can be built in parallel (after basic UI)

### Optimized Build Schedule

```
═══════════════════════════════════════════════════════════════════════════════════
                        WEEK 1: FOUNDATION + OODA MVP
═══════════════════════════════════════════════════════════════════════════════════

Day 1-2: Foundation Layer (Parallel Build)
┌────────────────────┬────────────────────┬────────────────────┐
│    STREAM A        │    STREAM B        │    STREAM C        │
├────────────────────┼────────────────────┼────────────────────┤
│ types.js           │ FrameworkSelector  │ ThinkingState      │
│ BaseFramework.js   │ (pattern matching) │ Manager.js         │
│                    │                    │ Event types.ts     │
└────────────────────┴────────────────────┴────────────────────┘
                              │
                              ▼
Day 3: Integration Layer
┌─────────────────────────────────────────────────────────────┐
│ frameworks.js (API Routes) - combines all 3 streams        │
│ useThinkingFramework.ts (Frontend hook)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
Day 4-5: First Framework + Basic UI
┌────────────────────┬────────────────────────────────────────┐
│    STREAM A        │    STREAM B                            │
├────────────────────┼────────────────────────────────────────┤
│ OODAFramework.js   │ ThinkingDisplay.tsx (basic version)   │
│ (full impl)        │ AIPanel integration (minimal)          │
└────────────────────┴────────────────────────────────────────┘
                              │
                              ▼
                     ┌────────────────┐
                     │   MVP READY    │  ← Can demo & test
                     │   (Day 5)      │
                     └────────────────┘

═══════════════════════════════════════════════════════════════════════════════════
                        WEEK 2: CORE FRAMEWORKS (Parallel)
═══════════════════════════════════════════════════════════════════════════════════

Day 6-10: Build 3 Frameworks in Parallel
┌────────────────────┬────────────────────┬────────────────────┐
│    STREAM A        │    STREAM B        │    STREAM C        │
├────────────────────┼────────────────────┼────────────────────┤
│ FiveWhysFramework  │ ChainOfThought     │ PreMortem          │
│ FishboneDiagram    │ ChainProgress      │ RiskMatrix         │
│ (2-3 days)         │ (2-3 days)         │ (2 days)           │
└────────────────────┴────────────────────┴────────────────────┘

                     ┌────────────────────┐
                     │  4 FRAMEWORKS      │  ← Core complete
                     │  (End Week 2)      │
                     └────────────────────┘

═══════════════════════════════════════════════════════════════════════════════════
                        WEEK 3: ADVANCED FRAMEWORKS (Parallel)
═══════════════════════════════════════════════════════════════════════════════════

Day 11-15: Build 4 Advanced Frameworks in Parallel
┌───────────────┬───────────────┬───────────────┬───────────────┐
│   STREAM A    │   STREAM B    │   STREAM C    │   STREAM D    │
├───────────────┼───────────────┼───────────────┼───────────────┤
│ Bayesian      │ FirstPrinc    │ TOC           │ DivideConquer │
│ BeliefVis     │               │ TOCFlowDiag   │               │
│ (3 days)      │ (2 days)      │ (2 days)      │ (2 days)      │
└───────────────┴───────────────┴───────────────┴───────────────┘

                     ┌────────────────────┐
                     │  8 FRAMEWORKS      │  ← Advanced complete
                     │  (End Week 3)      │
                     └────────────────────┘

═══════════════════════════════════════════════════════════════════════════════════
                        WEEK 4: LEARNING + SECONDARY (Parallel)
═══════════════════════════════════════════════════════════════════════════════════

Day 16-20: Analytics + Secondary Frameworks
┌────────────────────────┬────────────────────────────────────────┐
│    STREAM A            │    STREAM B                            │
├────────────────────────┼────────────────────────────────────────┤
│ FrameworkAnalytics.js  │ Feynman, DECIDE, SwissCheese,         │
│ Skill Integration      │ ScientificMethod                       │
│ Framework Hints        │ (simpler frameworks, 1 day each)       │
│ (3-4 days)             │ (4 days)                               │
└────────────────────────┴────────────────────────────────────────┘

                     ┌────────────────────┐
                     │  FULL SYSTEM       │  ← All 12 frameworks
                     │  (End Week 4)      │
                     └────────────────────┘
```

### Efficiency Comparison

| Approach | Duration | Parallelism | First Usable |
|----------|----------|-------------|--------------|
| **Original Linear** | 16 weeks | None | Week 8 |
| **Optimized Parallel** | 4 weeks | 75% | Day 5 |
| **Speedup** | **4x faster** | - | **11x faster to MVP** |

### Key Optimization Strategies

1. **MVP-First**: Get OODA working with basic UI by Day 5
   - Immediate feedback loop
   - Can iterate while building others

2. **Parallel Framework Development**: All frameworks use same BaseFramework
   - Once base is done, frameworks are independent
   - Can assign to multiple developers or work streams

3. **UI Follows Function**: Build visualization for each framework as you build it
   - Not one big UI phase
   - Each framework ships complete

4. **Defer Learning System**: Analytics needs data from real usage
   - Build it while collecting real-world data
   - More informed design decisions

### Minimum Viable Milestones

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         MILESTONE CHECKPOINTS                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  MVP (Day 5)           BETA (Day 15)        FULL (Day 20)                      │
│  ───────────           ────────────         ──────────────                      │
│  ✓ Types               ✓ 8 frameworks       ✓ 12 frameworks                    │
│  ✓ BaseFramework       ✓ All core visuals   ✓ Analytics                        │
│  ✓ Selector            ✓ Full UI            ✓ Skill integration                │
│  ✓ StateManager        ✓ Event system       ✓ All visualizations              │
│  ✓ API Routes                                                                   │
│  ✓ OODA Framework                                                               │
│  ✓ Basic UI                                                                     │
│                                                                                 │
│  Capability:           Capability:          Capability:                         │
│  - Debug issues        - All problem types  - Self-improving                    │
│  - Show thinking       - Risk assessment    - Learns from success               │
│                        - Root cause         - Framework suggestions             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Priority Queue

For maximum efficiency, implement in this exact order:

```javascript
const IMPLEMENTATION_QUEUE = [
  // ═══ DAY 1 (Parallel) ═══
  { file: 'types.js', priority: 1, dependencies: [], effort: '2h' },
  { file: 'BaseFramework.js', priority: 1, dependencies: ['types.js'], effort: '4h' },
  { file: 'FrameworkSelector.js', priority: 1, dependencies: ['types.js'], effort: '3h' },
  { file: 'ThinkingStateManager.js', priority: 1, dependencies: ['types.js'], effort: '3h' },

  // ═══ DAY 2 (Parallel) ═══
  { file: 'index.js', priority: 2, dependencies: ['BaseFramework', 'Selector', 'StateManager'], effort: '1h' },
  { file: 'frameworks.ts (types)', priority: 2, dependencies: ['types.js'], effort: '2h' },
  { file: 'events/types.ts additions', priority: 2, dependencies: [], effort: '1h' },

  // ═══ DAY 3 ═══
  { file: 'routes/frameworks.js', priority: 3, dependencies: ['index.js'], effort: '4h' },
  { file: 'useThinkingFramework.ts', priority: 3, dependencies: ['frameworks.ts', 'events'], effort: '4h' },

  // ═══ DAY 4-5 (Parallel) ═══
  { file: 'OODAFramework.js', priority: 4, dependencies: ['BaseFramework.js'], effort: '8h' },
  { file: 'ThinkingDisplay.tsx', priority: 4, dependencies: ['useThinkingFramework'], effort: '6h' },
  { file: 'AIPanel integration', priority: 5, dependencies: ['ThinkingDisplay', 'OODA'], effort: '4h' },

  // ═══ MVP CHECKPOINT ═══

  // ═══ DAY 6-10 (Parallel - 3 streams) ═══
  { file: 'FiveWhysFramework.js', priority: 6, dependencies: ['BaseFramework'], effort: '8h' },
  { file: 'ChainOfThoughtFramework.js', priority: 6, dependencies: ['BaseFramework'], effort: '8h' },
  { file: 'PreMortemFramework.js', priority: 6, dependencies: ['BaseFramework'], effort: '6h' },
  { file: 'FishboneDiagram.tsx', priority: 6, dependencies: ['FiveWhys'], effort: '4h' },
  { file: 'ChainProgress.tsx', priority: 6, dependencies: ['ChainOfThought'], effort: '3h' },
  { file: 'RiskMatrix.tsx', priority: 6, dependencies: ['PreMortem'], effort: '3h' },
  { file: 'OODADiagram.tsx', priority: 6, dependencies: ['OODA'], effort: '3h' },

  // ═══ DAY 11-15 (Parallel - 4 streams) ═══
  { file: 'BayesianFramework.js', priority: 7, dependencies: ['BaseFramework'], effort: '10h' },
  { file: 'FirstPrinciplesFramework.js', priority: 7, dependencies: ['BaseFramework'], effort: '6h' },
  { file: 'TOCFramework.js', priority: 7, dependencies: ['BaseFramework'], effort: '6h' },
  { file: 'DivideConquerFramework.js', priority: 7, dependencies: ['BaseFramework'], effort: '6h' },
  { file: 'BayesianBeliefs.tsx', priority: 7, dependencies: ['Bayesian'], effort: '4h' },
  { file: 'TOCFlowDiagram.tsx', priority: 7, dependencies: ['TOC'], effort: '4h' },

  // ═══ DAY 16-20 (Parallel - 2 streams) ═══
  { file: 'FrameworkAnalytics.js', priority: 8, dependencies: ['all frameworks'], effort: '8h' },
  { file: 'Skill integration', priority: 8, dependencies: ['Analytics'], effort: '6h' },
  { file: 'FeynmanFramework.js', priority: 8, dependencies: ['BaseFramework'], effort: '4h' },
  { file: 'DECIDEFramework.js', priority: 8, dependencies: ['BaseFramework'], effort: '4h' },
  { file: 'SwissCheeseFramework.js', priority: 8, dependencies: ['BaseFramework'], effort: '4h' },
  { file: 'ScientificMethodFramework.js', priority: 8, dependencies: ['BaseFramework'], effort: '4h' },
];
```

### Single Developer Schedule

If working alone (no parallel streams), optimal order:

```
Day 1:  types.js + BaseFramework.js
Day 2:  FrameworkSelector.js + ThinkingStateManager.js + index.js
Day 3:  routes/frameworks.js + useThinkingFramework.ts
Day 4:  OODAFramework.js (most valuable single framework)
Day 5:  ThinkingDisplay.tsx + AIPanel integration
        ═══════════════════════════════════════
        MVP READY - Can use and demo
        ═══════════════════════════════════════
Day 6:  ChainOfThoughtFramework.js (2nd most valuable)
Day 7:  PreMortemFramework.js (critical for safety)
Day 8:  FiveWhysFramework.js
Day 9:  BayesianFramework.js
Day 10: DivideConquerFramework.js
Day 11: FirstPrinciplesFramework.js + TOCFramework.js
Day 12: All visualizations (batch)
Day 13: FrameworkAnalytics.js
Day 14: Skill integration
Day 15: Secondary frameworks (Feynman, DECIDE, SwissCheese, Scientific)
```

### Why This Order?

1. **OODA First**: Most generally useful (debugging is #1 use case)
2. **Chain of Thought Second**: Enables multi-step tasks safely
3. **Pre-mortem Third**: Safety-critical for destructive operations
4. **Five Whys Fourth**: Root cause analysis is common need
5. **Bayesian Fifth**: Diagnostic value for ambiguous errors
6. **Divide & Conquer Sixth**: Complex system debugging
7. **First Principles + TOC**: Architecture and optimization
8. **Visuals Batched**: More efficient than interleaving
9. **Analytics Last**: Needs usage data to be meaningful
10. **Secondary Frameworks Last**: Least common use cases

---

## File Structure

```
server/
├── services/
│   ├── frameworks/
│   │   ├── index.js                    # Registry & exports
│   │   ├── types.js                    # Type definitions
│   │   ├── BaseFramework.js            # Abstract base class
│   │   ├── FrameworkSelector.js        # Selection logic
│   │   ├── ThinkingStateManager.js     # State management
│   │   ├── FrameworkAnalytics.js       # Tracking & learning
│   │   │
│   │   ├── OODAFramework.js            # Phase 2
│   │   ├── FiveWhysFramework.js        # Phase 2
│   │   ├── ChainOfThoughtFramework.js  # Phase 2
│   │   ├── PreMortemFramework.js       # Phase 2
│   │   │
│   │   ├── BayesianFramework.js        # Phase 3
│   │   ├── FirstPrinciplesFramework.js # Phase 3
│   │   ├── TOCFramework.js             # Phase 3
│   │   ├── DivideConquerFramework.js   # Phase 3
│   │   │
│   │   ├── FeynmanFramework.js         # Phase 6
│   │   ├── DECIDEFramework.js          # Phase 6
│   │   ├── SwissCheeseFramework.js     # Phase 6
│   │   └── ScientificMethodFramework.js # Phase 6
│   │
│   └── ... (existing services)
│
├── routes/
│   ├── frameworks.js                   # Phase 1
│   └── ... (existing routes)
│
src/
├── hooks/
│   ├── useThinkingFramework.ts         # Phase 1
│   └── ... (existing hooks)
│
├── components/
│   └── AI/
│       ├── ThinkingDisplay.tsx         # Phase 4
│       ├── ThinkingDisplay.module.css
│       ├── FrameworkVisuals/           # Phase 4
│       │   ├── OODADiagram.tsx
│       │   ├── FishboneDiagram.tsx
│       │   ├── BayesianBeliefs.tsx
│       │   ├── ChainProgress.tsx
│       │   ├── RiskMatrix.tsx
│       │   ├── TOCFlowDiagram.tsx
│       │   └── index.ts
│       └── ... (existing components)
│
├── types/
│   ├── frameworks.ts                   # Phase 1
│   └── ... (existing types)
│
└── events/
    └── types.ts                        # Phase 4 additions
```

---

## Integration Points with Existing Code

### 1. RAPID Framework Integration

The thinking frameworks extend (not replace) RAPID:

```javascript
// In SmartResponseGenerator.js
async generateStrategy(userMessage, sessionId, cwd) {
  // Existing RAPID flow
  const context = await ContextInferenceEngine.gatherContext(sessionId, cwd);
  const intent = await IntentClassifier.classify(userMessage, context);

  // NEW: Framework selection
  const frameworkMatch = FrameworkSelector.select(userMessage, intent, context);

  return {
    ...existingStrategy,
    recommendedFramework: frameworkMatch.framework,
    frameworkConfidence: frameworkMatch.confidence
  };
}
```

### 2. LLM Integration

All frameworks use the existing LLM abstraction:

```javascript
// In BaseFramework.js
async promptLLM(prompt, options = {}) {
  const { llmChat } = require('../routes/llm');

  return llmChat({
    provider: this.context.provider || 'gemini',
    model: this.context.model,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: this.getFrameworkSystemPrompt(),
    ...options
  });
}
```

### 3. Command Execution

Frameworks execute commands through existing infrastructure:

```javascript
// In BaseFramework.js
async executeCommand(command) {
  const { execSync } = require('child_process');

  // Use existing command execution pattern
  try {
    const result = execSync(command, {
      cwd: this.context.cwd,
      encoding: 'utf-8',
      timeout: 30000
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, output: error.message };
  }
}
```

### 4. Event System

Frameworks emit events through existing system:

```javascript
// In BaseFramework.js
emitProgress(step) {
  // Emit via Socket.IO for real-time updates
  if (this.socket) {
    this.socket.emit('thinking-step', {
      sessionId: this.sessionId,
      step
    });
  }
}
```

---

## Success Metrics

### Phase Completion Criteria

| Phase | Criteria |
|-------|----------|
| 1 | Framework selector returns appropriate framework for 10 test cases |
| 2 | OODA successfully debugs 3 common error types |
| 2 | Five Whys reaches root cause in test scenarios |
| 2 | Chain of Thought completes npm install with verification |
| 2 | Pre-mortem catches risks in `rm -rf` scenario |
| 3 | Bayesian narrows to correct hypothesis in 3 iterations |
| 3 | First Principles provides non-obvious architecture insights |
| 4 | UI displays thinking process in real-time |
| 4 | User can pause/resume framework execution |
| 5 | Framework success rates improve over time |

### Long-term Metrics

- **First-shot resolution rate**: % of problems solved without clarification
- **Framework selection accuracy**: % of times optimal framework was chosen
- **Average iterations to resolution**: Lower is better
- **User satisfaction**: Framework explanations rated as helpful

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM latency in iterative frameworks | Streaming display, parallel operations where possible |
| Framework selection wrong | Allow user override, learn from corrections |
| Infinite loops in OODA/Five Whys | Hard iteration limits, escalation paths |
| Over-engineering simple problems | Confidence threshold for framework activation |
| Destructive commands in Act phase | Pre-mortem integration, confirmation prompts |

---

## Getting Started

To begin Phase 1 implementation:

1. Create `server/services/frameworks/` directory
2. Implement `types.js` with all interfaces
3. Implement `BaseFramework.js` abstract class
4. Implement `FrameworkSelector.js` with pattern matching
5. Create `server/routes/frameworks.js` API endpoints
6. Add `src/hooks/useThinkingFramework.ts` frontend hook
7. Add framework events to `src/events/types.ts`

Run tests:
```bash
npm run test:frameworks  # Add to package.json
```

---

## Appendix: Framework Quick Reference

| Framework | Best For | Key Phases | Max Iterations |
|-----------|----------|------------|----------------|
| OODA | Live debugging | Observe→Orient→Decide→Act | 5 |
| Five Whys | Root cause | Fishbone→Why×5→Remediate | 7 whys |
| Chain of Thought | Multi-step tasks | Plan→Execute→Verify→Recover | N steps |
| Pre-mortem | Risky operations | Imagine→Assess→Check→Mitigate | 1 |
| Bayesian | Diagnosis | Prior→Evidence→Update→Decide | Until confident |
| First Principles | Architecture | Extract→Challenge→Derive | 1 |
| TOC | Optimization | Map→Find→Exploit→Subordinate→Elevate | 1 |
| Divide & Conquer | Complex systems | Decompose→Isolate→Locate→Resolve | log(n) |
| Feynman | Explanations | Identify→Explain→Gap→Refine | 3 |
| DECIDE | Decisions | Define→Establish→Consider→Identify→Develop→Evaluate | 1 |
| Swiss Cheese | Post-incident | Layers→Holes→Alignment→Strengthen | 1 |
| Scientific | Experiments | Question→Hypothesis→Design→Execute→Analyze→Conclude | 1 |
