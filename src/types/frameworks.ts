/**
 * Type definitions for the Thinking Frameworks system
 * Supports 12 specialized frameworks for different problem-solving approaches
 */

/**
 * Union type of all available framework identifiers
 */
export type FrameworkType =
  | 'ooda'
  | 'five_whys'
  | 'bayesian'
  | 'chain_of_thought'
  | 'pre_mortem'
  | 'first_principles'
  | 'theory_of_constraints'
  | 'scientific_method'
  | 'divide_conquer'
  | 'feynman'
  | 'decide'
  | 'swiss_cheese';

/**
 * Individual step in a thinking framework execution
 */
export interface ThinkingStep {
  id: string;
  framework: FrameworkType;
  phase: string;
  thought: string;
  action?: string;
  result?: {
    success: boolean;
    output: string;
  };
  confidence: number;
  timestamp: number;
}

/**
 * Current state of a framework execution
 */
export interface FrameworkState {
  framework: FrameworkType;
  phase: string;
  steps: ThinkingStep[];
  loopCount: number;
  context: Record<string, unknown>;
  status: 'active' | 'paused' | 'complete' | 'failed';
  error?: string;
}

/**
 * Final result of a framework execution
 */
export interface FrameworkResult {
  status: 'success' | 'partial' | 'failed' | 'escalate';
  summary: string;
  chain: ThinkingStep[];
  solution?: Record<string, unknown>;
  nextSteps?: string[];
}

/**
 * Framework recommendation with confidence score
 */
export interface FrameworkMatch {
  framework: FrameworkType;
  confidence: number;
  reason: string;
}

/**
 * Information about a single phase in a framework
 */
export interface FrameworkPhaseInfo {
  name: string;
  description: string;
  icon?: string;
}

/**
 * Display information for a framework
 */
export interface FrameworkInfo {
  type: FrameworkType;
  name: string;
  description: string;
  bestFor: string[];
  phases: FrameworkPhaseInfo[];
  color?: string;
}

/**
 * Constant array of all framework type strings
 */
export const FRAMEWORK_TYPES: readonly FrameworkType[] = [
  'ooda',
  'five_whys',
  'bayesian',
  'chain_of_thought',
  'pre_mortem',
  'first_principles',
  'theory_of_constraints',
  'scientific_method',
  'divide_conquer',
  'feynman',
  'decide',
  'swiss_cheese',
] as const;

/**
 * Display information for all frameworks
 */
export const FRAMEWORK_INFO: Record<FrameworkType, FrameworkInfo> = {
  ooda: {
    type: 'ooda',
    name: 'OODA Loop',
    description: 'Observe, Orient, Decide, Act - rapid decision-making cycle for debugging',
    bestFor: ['Debugging', 'Runtime errors', 'Incidents', 'Crash investigation'],
    phases: [
      { name: 'Observe', description: 'Gather system state, errors, logs', icon: '👁️' },
      { name: 'Orient', description: 'Analyze and form hypotheses', icon: '🧭' },
      { name: 'Decide', description: 'Choose best course of action', icon: '🤔' },
      { name: 'Act', description: 'Execute and monitor', icon: '⚡' },
    ],
    color: '#3b82f6',
  },

  five_whys: {
    type: 'five_whys',
    name: 'Five Whys + Fishbone',
    description: 'Recursive root cause analysis with Ishikawa diagram',
    bestFor: ['Root cause analysis', 'Recurring issues', 'Pattern failures'],
    phases: [
      { name: 'Fishbone', description: 'Map potential causes by category', icon: '🐟' },
      { name: 'Why Drilling', description: 'Ask "why" up to 7 levels', icon: '❓' },
      { name: 'Root ID', description: 'Identify actionable root cause', icon: '🎯' },
      { name: 'Remediation', description: 'Generate fix and prevention', icon: '🔧' },
    ],
    color: '#ef4444',
  },

  bayesian: {
    type: 'bayesian',
    name: 'Bayesian Reasoning',
    description: 'Probabilistic hypothesis testing with belief updating',
    bestFor: ['Ambiguous errors', 'Diagnosis', 'Uncertain situations'],
    phases: [
      { name: 'Prior', description: 'Generate hypotheses with probabilities', icon: '📊' },
      { name: 'Evidence', description: 'Gather diagnostic evidence', icon: '🔍' },
      { name: 'Update', description: 'Apply Bayes\' theorem', icon: '📈' },
      { name: 'Decision', description: 'Act when confident', icon: '✅' },
    ],
    color: '#8b5cf6',
  },

  chain_of_thought: {
    type: 'chain_of_thought',
    name: 'Chain of Thought',
    description: 'Sequential step-by-step reasoning with verification',
    bestFor: ['Multi-step tasks', 'Installations', 'Deployments', 'Configurations'],
    phases: [
      { name: 'Plan', description: 'Create step-by-step plan', icon: '📋' },
      { name: 'Execute', description: 'Run each step sequentially', icon: '▶️' },
      { name: 'Verify', description: 'Check step success', icon: '✓' },
      { name: 'Recover', description: 'Handle failures', icon: '🔄' },
    ],
    color: '#10b981',
  },

  pre_mortem: {
    type: 'pre_mortem',
    name: 'Pre-mortem Analysis',
    description: 'Proactive risk assessment by imagining failure',
    bestFor: ['Destructive ops', 'Production changes', 'Migrations'],
    phases: [
      { name: 'Imagine', description: 'Visualize catastrophic failure', icon: '💥' },
      { name: 'Assess', description: 'Score risks by impact', icon: '⚖️' },
      { name: 'Check', description: 'Generate safety checks', icon: '🛡️' },
      { name: 'Mitigate', description: 'Create rollback plan', icon: '↩️' },
    ],
    color: '#dc2626',
  },

  first_principles: {
    type: 'first_principles',
    name: 'First Principles',
    description: 'Break down to fundamentals and rebuild',
    bestFor: ['Architecture decisions', 'Design questions', 'Best practices'],
    phases: [
      { name: 'Extract', description: 'Identify hidden assumptions', icon: '🔎' },
      { name: 'Challenge', description: 'Question each assumption', icon: '❓' },
      { name: 'Discover', description: 'Find fundamental truths', icon: '💎' },
      { name: 'Derive', description: 'Build from fundamentals', icon: '🏗️' },
    ],
    color: '#f59e0b',
  },

  theory_of_constraints: {
    type: 'theory_of_constraints',
    name: 'Theory of Constraints',
    description: 'Identify and optimize system bottlenecks',
    bestFor: ['Performance optimization', 'Bottleneck ID', 'Slow systems'],
    phases: [
      { name: 'Map', description: 'Identify components and throughput', icon: '🗺️' },
      { name: 'Find', description: 'Locate the bottleneck', icon: '🔍' },
      { name: 'Exploit', description: 'Maximize constraint efficiency', icon: '⚡' },
      { name: 'Subordinate', description: 'Align system to constraint', icon: '🔗' },
      { name: 'Elevate', description: 'Add capacity if needed', icon: '📈' },
    ],
    color: '#06b6d4',
  },

  scientific_method: {
    type: 'scientific_method',
    name: 'Scientific Method',
    description: 'Hypothesis-driven experimentation',
    bestFor: ['Experiments', 'A/B testing', 'Benchmarking', 'Comparisons'],
    phases: [
      { name: 'Question', description: 'Define what to learn', icon: '❓' },
      { name: 'Hypothesis', description: 'Predict expected outcome', icon: '💡' },
      { name: 'Experiment', description: 'Design controlled test', icon: '🧪' },
      { name: 'Execute', description: 'Run experiment', icon: '▶️' },
      { name: 'Analyze', description: 'Interpret results', icon: '📊' },
      { name: 'Conclude', description: 'Answer original question', icon: '✅' },
    ],
    color: '#14b8a6',
  },

  divide_conquer: {
    type: 'divide_conquer',
    name: 'Divide & Conquer',
    description: 'Break complex systems into testable components',
    bestFor: ['Complex failures', 'Multi-component systems', 'Integration issues'],
    phases: [
      { name: 'Decompose', description: 'Break into components', icon: '📦' },
      { name: 'Isolate', description: 'Test independently', icon: '🔬' },
      { name: 'Localize', description: 'Find failing component', icon: '📍' },
      { name: 'Resolve', description: 'Fix and verify integration', icon: '🔧' },
    ],
    color: '#6366f1',
  },

  feynman: {
    type: 'feynman',
    name: 'Feynman Technique',
    description: 'Simplify through teaching and finding gaps',
    bestFor: ['Explanations', 'Understanding', 'Teaching', 'Documentation'],
    phases: [
      { name: 'Identify', description: 'What needs explaining', icon: '🎯' },
      { name: 'Explain', description: 'Teach as if to beginner', icon: '👨‍🏫' },
      { name: 'Gap', description: 'Find where it breaks down', icon: '🕳️' },
      { name: 'Refine', description: 'Simplify with analogies', icon: '✨' },
    ],
    color: '#ec4899',
  },

  decide: {
    type: 'decide',
    name: 'DECIDE Framework',
    description: 'Structured decision-making for multiple options',
    bestFor: ['Decisions', 'Trade-off analysis', 'Tool selection'],
    phases: [
      { name: 'Define', description: 'Clarify the decision', icon: '📝' },
      { name: 'Establish', description: 'Set success criteria', icon: '📏' },
      { name: 'Consider', description: 'List alternatives', icon: '📋' },
      { name: 'Identify', description: 'Pros/cons for each', icon: '⚖️' },
      { name: 'Develop', description: 'Recommend best option', icon: '🎯' },
      { name: 'Evaluate', description: 'Review decision quality', icon: '🔍' },
    ],
    color: '#a855f7',
  },

  swiss_cheese: {
    type: 'swiss_cheese',
    name: 'Swiss Cheese Model',
    description: 'Multi-layered defense analysis for post-incident',
    bestFor: ['Post-mortems', 'Incident review', 'Failure analysis'],
    phases: [
      { name: 'Layers', description: 'Identify defensive layers', icon: '🧀' },
      { name: 'Holes', description: 'Find what failed at each layer', icon: '🕳️' },
      { name: 'Alignment', description: 'How holes aligned', icon: '🔗' },
      { name: 'Strengthen', description: 'Close holes at each layer', icon: '🛡️' },
    ],
    color: '#f97316',
  },
};

/**
 * Type guard to check if a string is a valid FrameworkType
 */
export function isFrameworkType(value: string): value is FrameworkType {
  return FRAMEWORK_TYPES.includes(value as FrameworkType);
}

/**
 * Get framework info by type
 */
export function getFrameworkInfo(type: FrameworkType): FrameworkInfo {
  return FRAMEWORK_INFO[type];
}

/**
 * Get all frameworks as array
 */
export function getAllFrameworks(): FrameworkInfo[] {
  return FRAMEWORK_TYPES.map(type => FRAMEWORK_INFO[type]);
}
