/**
 * FrameworkOrchestrator - LLM Integration for Thinking Frameworks
 *
 * Coordinates framework selection, execution, and integration with LLM responses.
 * This is the bridge between the framework system and the LLM chat flow.
 */

const { FrameworkSelector } = require('./FrameworkSelector');
const { stateManager } = require('./ThinkingStateManager');

// Lazy load functions from index.js to avoid circular dependency
// These functions are resolved at call time, not at module load time
let _indexModule = null;
function getIndexModule() {
  if (!_indexModule) {
    _indexModule = require('./index');
  }
  return _indexModule;
}

/**
 * Framework Orchestrator class
 * Manages the lifecycle of framework execution within LLM conversations
 */
class FrameworkOrchestrator {
  constructor() {
    this.selector = new FrameworkSelector();
    this.activeExecutions = new Map(); // sessionId -> framework instance
    this.confidenceThreshold = 0.5; // Minimum confidence to auto-activate framework
  }

  /**
   * Analyze a user message and determine if a framework should be used
   * @param {string} message - User's message
   * @param {string} sessionId - Session identifier
   * @param {Object} context - Additional context (intent, cwd, etc.)
   * @returns {Object} Analysis result with framework recommendation
   */
  async analyzeMessage(message, sessionId, context = {}) {
    const intent = context.intent || 'unknown';

    // Get framework matches
    const matches = this.selector.getAllMatches(message, intent, context);

    // Filter to only registered frameworks
    const registeredFrameworks = getIndexModule().getAvailableFrameworks();
    const availableMatches = matches.filter(m => registeredFrameworks.includes(m.framework));

    if (availableMatches.length === 0) {
      return {
        shouldUseFramework: false,
        reason: 'No suitable framework found',
        matches: []
      };
    }

    const bestMatch = availableMatches[0];

    // Check if framework is already active for this session
    const activeFramework = this.activeExecutions.get(sessionId);
    if (activeFramework) {
      return {
        shouldUseFramework: true,
        framework: activeFramework.getName(),
        isActive: true,
        reason: 'Framework already in progress',
        matches: availableMatches
      };
    }

    return {
      shouldUseFramework: bestMatch.confidence >= this.confidenceThreshold,
      framework: bestMatch.framework,
      confidence: bestMatch.confidence,
      reason: bestMatch.reason,
      matches: availableMatches,
      isActive: false
    };
  }

  /**
   * Start a framework execution
   * @param {string} sessionId - Session identifier
   * @param {string} frameworkType - Framework type to execute
   * @param {string} problem - The problem/question to solve
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   * @returns {Object} Initial framework state
   */
  async startFramework(sessionId, frameworkType, problem, context, llmChatFn) {
    const indexModule = getIndexModule();
    if (!indexModule.isFrameworkRegistered(frameworkType)) {
      throw new Error(`Framework "${frameworkType}" is not registered`);
    }

    // Check if there's already an active framework
    if (this.activeExecutions.has(sessionId)) {
      const existing = this.activeExecutions.get(sessionId);
      console.log(`[Orchestrator] Stopping existing framework ${existing.getName()} for session ${sessionId}`);
      this.activeExecutions.delete(sessionId);
    }

    // Create framework instance
    const framework = indexModule.createFramework(frameworkType, sessionId, context, llmChatFn);
    this.activeExecutions.set(sessionId, framework);

    // Initialize state in state manager
    const state = stateManager.startFramework(sessionId, frameworkType, problem);

    console.log(`[Orchestrator] Started ${frameworkType} framework for session ${sessionId}`);

    return {
      framework: frameworkType,
      state,
      instance: framework
    };
  }

  /**
   * Execute the next step of an active framework
   * @param {string} sessionId - Session identifier
   * @param {string} input - User input or command result
   * @param {Object} options - Execution options
   * @returns {Object} Step result with next action
   */
  async executeStep(sessionId, input, options = {}) {
    const framework = this.activeExecutions.get(sessionId);
    if (!framework) {
      throw new Error(`No active framework for session ${sessionId}`);
    }

    const state = stateManager.getState(sessionId);
    if (!state || state.status !== 'active') {
      throw new Error(`Framework is not active for session ${sessionId}`);
    }

    try {
      // Execute the framework's step method
      const stepResult = await framework.executeStep(input, options);

      // Update state manager
      if (stepResult.step) {
        stateManager.addStep(sessionId, stepResult.step);
      }

      if (stepResult.phase && stepResult.phase !== state.phase) {
        stateManager.setPhase(sessionId, stepResult.phase);
      }

      // Check if framework is complete
      if (stepResult.isComplete) {
        const result = await this.completeFramework(sessionId, stepResult.result || {
          success: stepResult.success !== false,
          summary: stepResult.summary || 'Framework execution completed'
        });
        return {
          ...stepResult,
          frameworkResult: result
        };
      }

      return stepResult;
    } catch (error) {
      console.error(`[Orchestrator] Error executing step:`, error);

      // Record error in state
      stateManager.updateState(sessionId, {
        status: 'failed',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Complete a framework execution
   * @param {string} sessionId - Session identifier
   * @param {Object} result - Completion result
   * @returns {Object} Final result
   */
  async completeFramework(sessionId, result) {
    const framework = this.activeExecutions.get(sessionId);
    const frameworkType = framework?.getName() || 'unknown';

    // Clean up active execution
    this.activeExecutions.delete(sessionId);

    // Record completion in state manager
    const finalResult = stateManager.completeFramework(sessionId, {
      success: result.success,
      summary: result.summary,
      actionsTaken: result.actionsTaken || [],
      ...result
    });

    console.log(`[Orchestrator] Completed ${frameworkType} framework for session ${sessionId}`);

    return finalResult;
  }

  /**
   * Pause an active framework
   * @param {string} sessionId - Session identifier
   */
  pauseFramework(sessionId) {
    const state = stateManager.pauseFramework(sessionId);
    console.log(`[Orchestrator] Paused framework for session ${sessionId}`);
    return state;
  }

  /**
   * Resume a paused framework
   * @param {string} sessionId - Session identifier
   */
  resumeFramework(sessionId) {
    const state = stateManager.resumeFramework(sessionId);
    console.log(`[Orchestrator] Resumed framework for session ${sessionId}`);
    return state;
  }

  /**
   * Cancel an active framework
   * @param {string} sessionId - Session identifier
   * @param {string} reason - Cancellation reason
   */
  cancelFramework(sessionId, reason = 'User cancelled') {
    this.activeExecutions.delete(sessionId);

    const state = stateManager.getState(sessionId);
    if (state) {
      stateManager.updateState(sessionId, {
        status: 'cancelled',
        error: reason
      });
    }

    console.log(`[Orchestrator] Cancelled framework for session ${sessionId}: ${reason}`);
    return { cancelled: true, reason };
  }

  /**
   * Get current framework state for a session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Current state or null
   */
  getState(sessionId) {
    return stateManager.getState(sessionId);
  }

  /**
   * Check if a session has an active framework
   * @param {string} sessionId - Session identifier
   * @returns {boolean}
   */
  hasActiveFramework(sessionId) {
    return this.activeExecutions.has(sessionId) &&
           stateManager.hasActiveFramework(sessionId);
  }

  /**
   * Get the active framework instance for a session
   * @param {string} sessionId - Session identifier
   * @returns {BaseFramework|null}
   */
  getActiveFramework(sessionId) {
    return this.activeExecutions.get(sessionId) || null;
  }

  /**
   * Build an enhanced system prompt that includes framework context
   * @param {string} basePrompt - Base system prompt
   * @param {string} sessionId - Session identifier
   * @returns {string} Enhanced prompt
   */
  buildEnhancedPrompt(basePrompt, sessionId) {
    const state = stateManager.getState(sessionId);
    if (!state || state.status !== 'active') {
      return basePrompt;
    }

    const framework = this.activeExecutions.get(sessionId);
    if (!framework) {
      return basePrompt;
    }

    const frameworkPrompt = framework.getFrameworkSystemPrompt?.() || '';
    const phases = framework.getPhases?.() || [];
    const currentPhaseIndex = phases.findIndex(p =>
      p?.name?.toLowerCase() === state.phase?.toLowerCase()
    );
    const currentPhaseInfo = currentPhaseIndex >= 0 ? phases[currentPhaseIndex] : null;

    const frameworkContext = `
## Active Thinking Framework: ${state.framework.toUpperCase()}

You are currently using the ${state.framework} framework to solve this problem.

**Current Phase:** ${state.phase} (${currentPhaseIndex + 1}/${phases.length})
${currentPhaseInfo ? `**Phase Goal:** ${currentPhaseInfo.description}` : ''}

**Progress:**
- Steps completed: ${state.steps.length}
- Loop count: ${state.loopCount}

${frameworkPrompt}

**Instructions:**
1. Follow the ${state.framework} framework methodology
2. Think through each step carefully
3. If you need to execute a command, wrap it in \`\`\`bash code block
4. When the framework phase is complete, move to the next phase
5. Signal completion with [FRAMEWORK_COMPLETE] when the problem is solved

---

`;

    return frameworkContext + basePrompt;
  }

  /**
   * Process LLM response to extract framework actions
   * @param {string} response - LLM response content
   * @param {string} sessionId - Session identifier
   * @returns {Object} Parsed response with framework actions
   */
  parseFrameworkResponse(response, sessionId) {
    const state = stateManager.getState(sessionId);
    if (!state || state.status !== 'active') {
      return { response, isFrameworkResponse: false };
    }

    const result = {
      response,
      isFrameworkResponse: true,
      isComplete: response.includes('[FRAMEWORK_COMPLETE]'),
      hasCommand: false,
      command: null,
      phase: state.phase,
      thought: null,
      confidence: 0.7 // Default confidence
    };

    // Extract bash commands
    const bashMatch = response.match(/```bash\n([\s\S]*?)\n```/);
    if (bashMatch) {
      result.hasCommand = true;
      result.command = bashMatch[1].trim();
    }

    // Extract phase transitions
    const phaseMatch = response.match(/\[PHASE:([^\]]+)\]/);
    if (phaseMatch) {
      result.nextPhase = phaseMatch[1].trim();
    }

    // Extract confidence
    const confidenceMatch = response.match(/\[CONFIDENCE:(\d+(?:\.\d+)?)\]/);
    if (confidenceMatch) {
      result.confidence = parseFloat(confidenceMatch[1]);
    }

    // Extract thought/analysis
    const thoughtMatch = response.match(/\*\*Analysis:\*\*\s*([\s\S]*?)(?=\n\n|\*\*|```|$)/);
    if (thoughtMatch) {
      result.thought = thoughtMatch[1].trim();
    } else {
      // Use first paragraph as thought
      const firstPara = response.split('\n\n')[0];
      if (firstPara && firstPara.length < 500) {
        result.thought = firstPara;
      }
    }

    // Clean response by removing framework markers
    result.cleanResponse = response
      .replace(/\[FRAMEWORK_COMPLETE\]/g, '')
      .replace(/\[PHASE:[^\]]+\]/g, '')
      .replace(/\[CONFIDENCE:[^\]]+\]/g, '')
      .trim();

    return result;
  }

  /**
   * Get statistics about framework usage
   * @returns {Object} Usage statistics
   */
  getStats() {
    return {
      activeExecutions: this.activeExecutions.size,
      confidenceThreshold: this.confidenceThreshold,
      availableFrameworks: getIndexModule().getAvailableFrameworks()
    };
  }
}

// Singleton instance
const orchestrator = new FrameworkOrchestrator();

module.exports = {
  FrameworkOrchestrator,
  orchestrator
};
