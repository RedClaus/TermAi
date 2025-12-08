/**
 * Thinking Frameworks - Main Registry and Exports
 *
 * Central export point for the thinking frameworks system
 */

const { FRAMEWORK_TYPES, FRAMEWORK_DEFINITIONS } = require('./types');
const BaseFramework = require('./BaseFramework');
const { FrameworkSelector, FRAMEWORK_MAPPING, KEYWORD_SIGNALS, CONTEXT_SIGNALS } = require('./FrameworkSelector');
const { ThinkingStateManager, stateManager } = require('./ThinkingStateManager');

// Phase 5 - Orchestration and Analytics
const { FrameworkOrchestrator, orchestrator } = require('./FrameworkOrchestrator');
const { FrameworkAnalytics, analytics } = require('./FrameworkAnalytics');

// Import framework implementations
// Phase 2 - Core Frameworks
const OODAFramework = require('./OODAFramework');
const FiveWhysFramework = require('./FiveWhysFramework');
const ChainOfThoughtFramework = require('./ChainOfThoughtFramework');
const PreMortemFramework = require('./PreMortemFramework');

// Phase 3 - Advanced Frameworks
const BayesianFramework = require('./BayesianFramework');
const FirstPrinciplesFramework = require('./FirstPrinciplesFramework');
const TOCFramework = require('./TOCFramework');
const DivideConquerFramework = require('./DivideConquerFramework');

// Phase 6 - Secondary Frameworks
const ScientificMethodFramework = require('./ScientificMethodFramework');
const FeynmanFramework = require('./FeynmanFramework');
const DECIDEFramework = require('./DECIDEFramework');
const SwissCheeseFramework = require('./SwissCheeseFramework');

// Framework registry - stores framework type → implementation class mappings
const frameworkRegistry = new Map();

/**
 * Register a framework implementation
 * @param {string} type - Framework type (from FRAMEWORK_TYPES)
 * @param {Function} FrameworkClass - Class extending BaseFramework
 */
function registerFramework(type, FrameworkClass) {
  if (!FRAMEWORK_TYPES.includes(type)) {
    console.warn(`[Frameworks] Warning: "${type}" is not a known framework type`);
  }

  if (typeof FrameworkClass !== 'function') {
    throw new Error(`Framework class for "${type}" must be a constructor function`);
  }

  frameworkRegistry.set(type, FrameworkClass);
  console.log(`[Frameworks] Registered framework: ${type}`);
}

/**
 * Get a framework class by type
 * @param {string} type - Framework type
 * @returns {Function|undefined} Framework class or undefined
 */
function getFramework(type) {
  return frameworkRegistry.get(type);
}

/**
 * Create a framework instance
 * @param {string} type - Framework type
 * @param {string} sessionId - Session identifier
 * @param {Object} context - Execution context (cwd, provider, model, etc.)
 * @param {Function} llmChatFn - Function to call LLM
 * @returns {BaseFramework} Framework instance
 */
function createFramework(type, sessionId, context, llmChatFn) {
  const FrameworkClass = frameworkRegistry.get(type);

  if (!FrameworkClass) {
    const available = getAvailableFrameworks();
    throw new Error(
      `Unknown framework type: "${type}". Available: ${available.join(', ') || 'none registered'}`
    );
  }

  const instance = new FrameworkClass(sessionId, context, llmChatFn);
  console.log(`[Frameworks] Created ${type} framework for session: ${sessionId}`);

  return instance;
}

/**
 * Get list of registered framework types
 * @returns {string[]} Array of registered framework types
 */
function getAvailableFrameworks() {
  return Array.from(frameworkRegistry.keys());
}

/**
 * Check if a framework is registered
 * @param {string} type - Framework type
 * @returns {boolean}
 */
function isFrameworkRegistered(type) {
  return frameworkRegistry.has(type);
}

/**
 * Unregister a framework
 * @param {string} type - Framework type
 * @returns {boolean} True if framework was removed
 */
function unregisterFramework(type) {
  const existed = frameworkRegistry.has(type);
  frameworkRegistry.delete(type);
  if (existed) {
    console.log(`[Frameworks] Unregistered framework: ${type}`);
  }
  return existed;
}

/**
 * Clear all registered frameworks
 */
function clearRegistry() {
  const count = frameworkRegistry.size;
  frameworkRegistry.clear();
  console.log(`[Frameworks] Cleared registry (removed ${count} frameworks)`);
}

/**
 * Get registry statistics
 * @returns {Object} Stats about registered frameworks
 */
function getRegistryStats() {
  const registered = getAvailableFrameworks();
  const missing = FRAMEWORK_TYPES.filter(t => !registered.includes(t));

  return {
    totalDefined: FRAMEWORK_TYPES.length,
    totalRegistered: registered.length,
    registered,
    missing,
    coverage: registered.length / FRAMEWORK_TYPES.length
  };
}

// ===========================================
// Auto-register available framework implementations
// ===========================================

/**
 * Register all available framework implementations
 * This is called on module load to make frameworks available
 */
function initializeFrameworks() {
  // Phase 2 - Core frameworks
  registerFramework('ooda', OODAFramework);
  registerFramework('five_whys', FiveWhysFramework);
  registerFramework('chain_of_thought', ChainOfThoughtFramework);
  registerFramework('pre_mortem', PreMortemFramework);

  // Phase 3 - Advanced frameworks
  registerFramework('bayesian', BayesianFramework);
  registerFramework('first_principles', FirstPrinciplesFramework);
  registerFramework('theory_of_constraints', TOCFramework);
  registerFramework('divide_conquer', DivideConquerFramework);

  // Phase 6 - Secondary frameworks
  registerFramework('scientific_method', ScientificMethodFramework);
  registerFramework('feynman', FeynmanFramework);
  registerFramework('decide', DECIDEFramework);
  registerFramework('swiss_cheese', SwissCheeseFramework);

  // Log initialization status
  const stats = getRegistryStats();
  console.log(`[Frameworks] Initialized ${stats.totalRegistered}/${stats.totalDefined} frameworks`);
  if (stats.missing.length > 0) {
    console.log(`[Frameworks] Not yet implemented: ${stats.missing.join(', ')}`);
  }
}

// Initialize on module load
initializeFrameworks();

module.exports = {
  // Type definitions and constants
  FRAMEWORK_TYPES,
  FRAMEWORK_DEFINITIONS,

  // Core classes
  BaseFramework,
  FrameworkSelector,
  ThinkingStateManager,

  // Framework implementations - Phase 2
  OODAFramework,
  FiveWhysFramework,
  ChainOfThoughtFramework,
  PreMortemFramework,

  // Framework implementations - Phase 3
  BayesianFramework,
  FirstPrinciplesFramework,
  TOCFramework,
  DivideConquerFramework,

  // Framework implementations - Phase 6
  ScientificMethodFramework,
  FeynmanFramework,
  DECIDEFramework,
  SwissCheeseFramework,

  // Phase 5 - Orchestration and Analytics
  FrameworkOrchestrator,
  FrameworkAnalytics,
  orchestrator,
  analytics,

  // Selector constants
  FRAMEWORK_MAPPING,
  KEYWORD_SIGNALS,
  CONTEXT_SIGNALS,

  // Singleton state manager
  stateManager,

  // Registry functions
  registerFramework,
  getFramework,
  createFramework,
  getAvailableFrameworks,
  isFrameworkRegistered,
  unregisterFramework,
  clearRegistry,
  getRegistryStats,

  // Registry itself (for advanced use)
  frameworkRegistry
};
