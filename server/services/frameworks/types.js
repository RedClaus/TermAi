/**
 * Thinking Frameworks Type Definitions
 *
 * This file contains all type definitions for the 12 cognitive reasoning frameworks
 * that enable first-shot accuracy and systematic problem-solving in TermAI.
 *
 * @module frameworks/types
 */

// ============================================================================
// Framework Type Enums
// ============================================================================

/**
 * Enumeration of all available thinking framework types
 *
 * @typedef {'ooda' | 'five_whys' | 'bayesian' | 'chain_of_thought' |
 *           'pre_mortem' | 'first_principles' | 'theory_of_constraints' |
 *           'scientific_method' | 'divide_conquer' | 'feynman' |
 *           'decide' | 'swiss_cheese'} FrameworkType
 */

/**
 * Array of all framework type strings for validation and iteration
 * @type {FrameworkType[]}
 */
const FRAMEWORK_TYPES = [
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
  'swiss_cheese'
];

// ============================================================================
// Core Framework Data Structures
// ============================================================================

/**
 * Represents a single reasoning step within a framework execution
 *
 * @typedef {Object} ThinkingStep
 * @property {string} id - Unique identifier for this step (UUID)
 * @property {FrameworkType} framework - The framework this step belongs to
 * @property {string} phase - Current phase within the framework
 * @property {string} thought - The reasoning content/explanation for this step
 * @property {string} [action] - Optional command or action to execute
 * @property {Object} [result] - Optional result object from executing the action
 * @property {boolean} result.success - Whether the action succeeded
 * @property {string} result.output - Output from the action execution
 * @property {number} confidence - Confidence level in this step (0-1 range)
 * @property {number} timestamp - Unix timestamp (milliseconds) when the step was created
 */

/**
 * Maintains the current state of an active framework execution
 *
 * @typedef {Object} FrameworkState
 * @property {FrameworkType} framework - The framework currently being executed
 * @property {string} phase - Current phase within the framework
 * @property {ThinkingStep[]} steps - Ordered array of all steps taken so far
 * @property {number} loopCount - Number of iterations for iterative frameworks
 * @property {Object} context - Framework-specific contextual data
 * @property {'active' | 'paused' | 'complete' | 'failed'} status - Current execution status
 */

/**
 * Result of a completed framework execution
 *
 * @typedef {Object} FrameworkResult
 * @property {'success' | 'partial' | 'failed' | 'escalate'} status - Overall outcome status
 * @property {string} summary - Human-readable summary of the execution
 * @property {ThinkingStep[]} chain - Complete reasoning chain (all steps taken)
 * @property {Object} [solution] - Solution object if found
 * @property {string[]} [nextSteps] - Recommended follow-up actions
 */

/**
 * Framework selection match with confidence scoring
 *
 * @typedef {Object} FrameworkMatch
 * @property {FrameworkType} framework - The recommended framework type
 * @property {number} confidence - Confidence in this recommendation (0-1 range)
 * @property {string} reason - Human-readable explanation for why this framework was chosen
 */

// ============================================================================
// Framework Definition Structures
// ============================================================================

/**
 * Defines a single phase within a framework
 *
 * @typedef {Object} FrameworkPhase
 * @property {string} name - Phase identifier
 * @property {string} description - Human-readable description of what happens in this phase
 * @property {string[]} requiredInputs - Data required to enter this phase
 * @property {string[]} outputs - Data produced by completing this phase
 */

/**
 * Complete definition of a thinking framework
 *
 * @typedef {Object} FrameworkDefinition
 * @property {FrameworkType} type - Unique framework type identifier
 * @property {string} name - Human-readable framework name
 * @property {string} description - Detailed description of the framework
 * @property {string[]} bestFor - Array of problem types this framework excels at
 * @property {FrameworkPhase[]} phases - Ordered phases of the framework
 * @property {number} maxIterations - Maximum number of iterations/loops before escalation
 */

// ============================================================================
// Framework Definitions Registry
// ============================================================================

/**
 * Complete definitions for all 12 thinking frameworks
 * @type {Object.<FrameworkType, FrameworkDefinition>}
 */
const FRAMEWORK_DEFINITIONS = {
  ooda: {
    type: 'ooda',
    name: 'OODA Loop',
    description: 'Observe-Orient-Decide-Act cycle for rapid iteration and real-time adaptation.',
    bestFor: ['debugging', 'runtime errors', 'incidents', 'live troubleshooting', 'crash investigation'],
    phases: [
      { name: 'observe', description: 'Gather current system state, errors, logs', requiredInputs: ['problem'], outputs: ['observations'] },
      { name: 'orient', description: 'Analyze observations, form mental model, generate hypotheses', requiredInputs: ['observations'], outputs: ['hypotheses'] },
      { name: 'decide', description: 'Select most likely hypothesis and determine action', requiredInputs: ['hypotheses'], outputs: ['action_plan'] },
      { name: 'act', description: 'Execute action and loop back to Observe', requiredInputs: ['action_plan'], outputs: ['action_result'] }
    ],
    maxIterations: 5
  },

  five_whys: {
    type: 'five_whys',
    name: 'Five Whys + Fishbone',
    description: 'Recursive root cause analysis using fishbone diagram and iterative "why" questioning',
    bestFor: ['root cause analysis', 'recurring issues', 'pattern failures', 'systemic problems'],
    phases: [
      { name: 'fishbone_mapping', description: 'Categorize potential causes using Ishikawa diagram', requiredInputs: ['problem'], outputs: ['fishbone_diagram'] },
      { name: 'why_drilling', description: 'Ask "why" recursively up to 7 levels', requiredInputs: ['fishbone_diagram'], outputs: ['why_chain'] },
      { name: 'root_identification', description: 'Determine if cause is actionable root vs symptom', requiredInputs: ['why_chain'], outputs: ['root_cause'] },
      { name: 'remediation', description: 'Generate fix and prevention steps', requiredInputs: ['root_cause'], outputs: ['fix', 'prevention_measures'] }
    ],
    maxIterations: 7
  },

  bayesian: {
    type: 'bayesian',
    name: 'Bayesian Reasoning',
    description: 'Probabilistic hypothesis testing with belief updating based on evidence',
    bestFor: ['ambiguous errors', 'diagnosis', 'multiple possible causes', 'uncertain situations'],
    phases: [
      { name: 'prior_generation', description: 'Generate hypotheses with initial probabilities', requiredInputs: ['problem'], outputs: ['hypotheses', 'prior_probabilities'] },
      { name: 'evidence_collection', description: 'Gather diagnostic evidence', requiredInputs: ['hypotheses'], outputs: ['evidence'] },
      { name: 'belief_update', description: 'Apply Bayes\' theorem to update probabilities', requiredInputs: ['prior_probabilities', 'evidence'], outputs: ['posterior_probabilities'] },
      { name: 'decision', description: 'Act when confidence threshold reached', requiredInputs: ['posterior_probabilities'], outputs: ['decision'] }
    ],
    maxIterations: 10
  },

  chain_of_thought: {
    type: 'chain_of_thought',
    name: 'Chain of Thought',
    description: 'Sequential step-by-step reasoning with explicit intermediate steps and verification',
    bestFor: ['multi-step tasks', 'installations', 'deployments', 'configurations', 'procedures'],
    phases: [
      { name: 'plan_generation', description: 'Create detailed step-by-step plan', requiredInputs: ['problem'], outputs: ['plan'] },
      { name: 'step_execution', description: 'Execute each step sequentially', requiredInputs: ['plan'], outputs: ['step_result'] },
      { name: 'verification', description: 'Verify step success', requiredInputs: ['step_result'], outputs: ['verification_status'] },
      { name: 'recovery', description: 'Handle failures: retry, add prerequisite, skip, or abort', requiredInputs: ['verification_status'], outputs: ['recovery_action'] }
    ],
    maxIterations: 50
  },

  pre_mortem: {
    type: 'pre_mortem',
    name: 'Pre-mortem Analysis',
    description: 'Proactive risk assessment by imagining failure scenarios before execution',
    bestFor: ['destructive operations', 'production changes', 'dangerous commands', 'migrations'],
    phases: [
      { name: 'risk_imagination', description: 'Imagine catastrophic failure - why did it happen?', requiredInputs: ['intended_action'], outputs: ['failure_scenarios'] },
      { name: 'risk_assessment', description: 'Score each risk by probability × impact', requiredInputs: ['failure_scenarios'], outputs: ['risk_matrix'] },
      { name: 'safety_checks', description: 'Generate pre-execution verification checks', requiredInputs: ['risk_matrix'], outputs: ['safety_checks'] },
      { name: 'mitigation_planning', description: 'Create rollback and recovery procedures', requiredInputs: ['risk_matrix'], outputs: ['mitigation_plan'] }
    ],
    maxIterations: 1
  },

  first_principles: {
    type: 'first_principles',
    name: 'First Principles Thinking',
    description: 'Break down problems to fundamental truths and reason up from there',
    bestFor: ['architecture decisions', 'design questions', 'best practices', 'approach selection'],
    phases: [
      { name: 'assumption_extraction', description: 'Identify all hidden assumptions', requiredInputs: ['problem'], outputs: ['assumptions'] },
      { name: 'assumption_challenge', description: 'Question validity of each assumption', requiredInputs: ['assumptions'], outputs: ['challenged_assumptions'] },
      { name: 'fundamental_discovery', description: 'Identify irreducible fundamental truths', requiredInputs: ['challenged_assumptions'], outputs: ['fundamentals'] },
      { name: 'derivation', description: 'Build solution from fundamentals only', requiredInputs: ['fundamentals'], outputs: ['derived_solution'] }
    ],
    maxIterations: 1
  },

  theory_of_constraints: {
    type: 'theory_of_constraints',
    name: 'Theory of Constraints',
    description: 'Identify and optimize system bottlenecks for maximum throughput',
    bestFor: ['performance optimization', 'bottleneck identification', 'slow systems'],
    phases: [
      { name: 'system_mapping', description: 'Identify all components and throughput', requiredInputs: ['system_description'], outputs: ['component_map'] },
      { name: 'constraint_finding', description: 'Locate the bottleneck', requiredInputs: ['component_map'], outputs: ['bottleneck'] },
      { name: 'exploit', description: 'Maximize efficiency of current constraint', requiredInputs: ['bottleneck'], outputs: ['exploit_strategies'] },
      { name: 'subordinate', description: 'Align system to support constraint', requiredInputs: ['bottleneck'], outputs: ['alignment_changes'] },
      { name: 'elevate', description: 'Add capacity if needed', requiredInputs: ['exploit_strategies'], outputs: ['capacity_recommendations'] }
    ],
    maxIterations: 3
  },

  scientific_method: {
    type: 'scientific_method',
    name: 'Scientific Method',
    description: 'Hypothesis-driven experimentation with controlled testing',
    bestFor: ['experiments', 'A/B testing', 'benchmarking', 'comparisons'],
    phases: [
      { name: 'question', description: 'Define what we\'re trying to learn', requiredInputs: ['problem'], outputs: ['research_question'] },
      { name: 'hypothesis', description: 'Predict expected outcome', requiredInputs: ['research_question'], outputs: ['hypothesis'] },
      { name: 'experiment_design', description: 'Create controlled test plan', requiredInputs: ['hypothesis'], outputs: ['experiment_plan'] },
      { name: 'execution', description: 'Run the experiment', requiredInputs: ['experiment_plan'], outputs: ['results'] },
      { name: 'analysis', description: 'Interpret results', requiredInputs: ['results'], outputs: ['analysis'] },
      { name: 'conclusion', description: 'Answer original question', requiredInputs: ['analysis'], outputs: ['conclusion'] }
    ],
    maxIterations: 1
  },

  divide_conquer: {
    type: 'divide_conquer',
    name: 'Divide & Conquer',
    description: 'Break complex systems into components for isolated testing',
    bestFor: ['complex failures', 'multi-component systems', 'integration issues'],
    phases: [
      { name: 'decomposition', description: 'Break system into testable components', requiredInputs: ['system_description'], outputs: ['component_tree'] },
      { name: 'isolation', description: 'Test each component independently', requiredInputs: ['component_tree'], outputs: ['component_results'] },
      { name: 'localization', description: 'Narrow down to failing component(s)', requiredInputs: ['component_results'], outputs: ['root_components'] },
      { name: 'resolution', description: 'Fix identified component(s)', requiredInputs: ['root_components'], outputs: ['fix'] }
    ],
    maxIterations: 10
  },

  feynman: {
    type: 'feynman',
    name: 'Feynman Technique',
    description: 'Simplify complex concepts through teaching and identifying knowledge gaps',
    bestFor: ['explanations', 'understanding', 'teaching', 'documentation'],
    phases: [
      { name: 'concept_identification', description: 'Identify what needs to be explained', requiredInputs: ['topic'], outputs: ['concept'] },
      { name: 'simple_explanation', description: 'Explain as if teaching a beginner', requiredInputs: ['concept'], outputs: ['simple_explanation'] },
      { name: 'gap_identification', description: 'Find where explanation breaks down', requiredInputs: ['simple_explanation'], outputs: ['gaps'] },
      { name: 'refinement', description: 'Simplify further using better analogies', requiredInputs: ['gaps'], outputs: ['refined_explanation'] }
    ],
    maxIterations: 3
  },

  decide: {
    type: 'decide',
    name: 'DECIDE Framework',
    description: 'Structured decision-making for evaluating multiple options',
    bestFor: ['decisions', 'choosing options', 'trade-off analysis', 'tool selection'],
    phases: [
      { name: 'define', description: 'Clarify the decision needed', requiredInputs: ['problem'], outputs: ['decision_statement'] },
      { name: 'establish', description: 'Set criteria for good outcome', requiredInputs: ['decision_statement'], outputs: ['criteria'] },
      { name: 'consider', description: 'List all viable alternatives', requiredInputs: ['decision_statement'], outputs: ['alternatives'] },
      { name: 'identify', description: 'Pros and cons for each', requiredInputs: ['alternatives'], outputs: ['pros_cons'] },
      { name: 'develop', description: 'Recommend best option', requiredInputs: ['pros_cons'], outputs: ['recommendation'] },
      { name: 'evaluate', description: 'Review decision quality', requiredInputs: ['recommendation'], outputs: ['evaluation'] }
    ],
    maxIterations: 1
  },

  swiss_cheese: {
    type: 'swiss_cheese',
    name: 'Swiss Cheese Model',
    description: 'Multi-layered defense analysis for post-incident review',
    bestFor: ['post-mortems', 'incident review', 'failure analysis', 'system resilience'],
    phases: [
      { name: 'layer_identification', description: 'Identify all defensive layers', requiredInputs: ['incident'], outputs: ['defense_layers'] },
      { name: 'hole_finding', description: 'Identify what failed at each layer', requiredInputs: ['defense_layers'], outputs: ['holes'] },
      { name: 'alignment_analysis', description: 'Analyze how holes aligned', requiredInputs: ['holes'], outputs: ['alignment_path'] },
      { name: 'strengthening', description: 'Recommendations to close holes', requiredInputs: ['alignment_path'], outputs: ['improvements'] }
    ],
    maxIterations: 1
  }
};

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  FRAMEWORK_TYPES,
  FRAMEWORK_DEFINITIONS
};
