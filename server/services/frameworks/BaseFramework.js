const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');

/**
 * BaseFramework - Abstract base class for all thinking frameworks
 *
 * Provides common functionality for:
 * - State management
 * - Step tracking
 * - Command execution
 * - LLM interaction
 * - Real-time progress updates
 */
class BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {string} context.cwd - Current working directory
   * @param {string} context.provider - AI provider (e.g., 'gemini', 'openai')
   * @param {string} context.model - Model ID
   * @param {string} context.apiKey - API key for the provider
   * @param {Function} llmChatFn - Function to call LLM: (messages, systemPrompt, options) => Promise<string>
   */
  constructor(sessionId, context, llmChatFn) {
    this.sessionId = sessionId;
    this.context = context;
    this.llmChat = llmChatFn;

    // Framework execution state
    this.state = {
      framework: null,
      phase: 'init',
      steps: [],
      loopCount: 0,
      context: {},
      status: 'active'
    };

    // Configuration
    this.maxIterations = 5;
    this.eventEmitter = null;
  }

  // ============================================================================
  // ABSTRACT METHODS (Must be implemented by subclasses)
  // ============================================================================

  /**
   * Get the framework name/type
   * @returns {string} FrameworkType
   * @abstract
   */
  getName() {
    throw new Error('Must implement getName() in subclass');
  }

  /**
   * Get the phases for this framework
   * @returns {string[]} Array of phase names
   * @abstract
   */
  getPhases() {
    throw new Error('Must implement getPhases() in subclass');
  }

  /**
   * Execute the framework on a given problem
   * @param {string} problem - The problem/task to solve
   * @returns {Promise<Object>} FrameworkResult
   * @abstract
   */
  async execute(problem) {
    throw new Error('Must implement execute() in subclass');
  }

  // ============================================================================
  // STEP MANAGEMENT
  // ============================================================================

  /**
   * Add a new thinking step
   * @param {string} phase - Current phase name
   * @param {string} thought - The reasoning/analysis
   * @param {string|null} action - Optional command or action to execute
   * @returns {Object} The created ThinkingStep
   */
  addStep(phase, thought, action = null) {
    const step = {
      id: this.generateStepId(),
      framework: this.getName(),
      phase,
      thought,
      action,
      result: null,
      confidence: 0.5,
      timestamp: Date.now()
    };

    this.state.steps.push(step);
    this.state.phase = phase;
    this.emitProgress(step);

    return step;
  }

  /**
   * Update an existing step with results
   * @param {string} stepId - The step ID to update
   * @param {Object} updates - Updates to apply (result, confidence, etc.)
   */
  updateStep(stepId, updates) {
    const step = this.state.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    Object.assign(step, updates);
    this.emitProgress(step);
  }

  /**
   * Generate a unique step ID
   * @returns {string} Unique identifier
   */
  generateStepId() {
    return uuidv4();
  }

  // ============================================================================
  // COMMAND EXECUTION
  // ============================================================================

  /**
   * Execute a shell command in the context's working directory
   * @param {string} command - Command to execute
   * @param {number} timeout - Timeout in milliseconds (default: 30000)
   * @returns {Object} { success: boolean, output: string }
   */
  executeCommand(command, timeout = 30000) {
    try {
      const output = execSync(command, {
        cwd: this.context.cwd,
        encoding: 'utf8',
        timeout,
        maxBuffer: 1024 * 1024 * 10,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return {
        success: true,
        output: output.trim()
      };
    } catch (error) {
      return {
        success: false,
        output: error.stderr?.toString() || error.stdout?.toString() || error.message
      };
    }
  }

  // ============================================================================
  // LLM INTERACTION
  // ============================================================================

  /**
   * Prompt the LLM with a message
   * @param {string} prompt - The prompt text
   * @param {Object} options - Optional configuration
   * @returns {Promise<string>} LLM response text
   */
  async promptLLM(prompt, options = {}) {
    const systemPrompt = options.systemPrompt || this.getFrameworkSystemPrompt();
    const previousMessages = options.previousMessages || [];

    const messages = [
      ...previousMessages,
      { role: 'user', content: prompt }
    ];

    try {
      const response = await this.llmChat(messages, systemPrompt, {
        provider: this.context.provider,
        model: this.context.model
      });

      return response;
    } catch (error) {
      throw new Error(`LLM call failed: ${error.message}`);
    }
  }

  /**
   * Get the base system prompt for this framework
   * Subclasses can override to provide framework-specific prompts
   * @returns {string} System prompt
   */
  getFrameworkSystemPrompt() {
    return `You are an AI assistant using the ${this.getName()} thinking framework to solve problems systematically.

Your current working directory is: ${this.context.cwd}

Follow the framework's phases: ${this.getPhases().join(' → ')}

Provide clear, structured reasoning at each phase. When you need to execute commands, suggest them explicitly.

Be precise, thorough, and maintain focus on the task goal.`;
  }

  // ============================================================================
  // PROGRESS TRACKING
  // ============================================================================

  /**
   * Emit progress update for real-time tracking
   * @param {Object} step - The thinking step to emit
   */
  emitProgress(step) {
    if (this.eventEmitter) {
      this.eventEmitter.emit('thinking-step', {
        sessionId: this.sessionId,
        step
      });
    }
  }

  /**
   * Set the event emitter for real-time updates
   * @param {Object} emitter - Socket.IO or EventEmitter instance
   */
  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  // ============================================================================
  // STATE ACCESS
  // ============================================================================

  /**
   * Get the current framework state
   * @returns {Object} Current state
   */
  getState() {
    return {
      ...this.state,
      framework: this.getName()
    };
  }

  /**
   * Convert current state to FrameworkResult format
   * @returns {Object} FrameworkResult
   */
  getResult() {
    const lastStep = this.state.steps[this.state.steps.length - 1];
    const avgConfidence = this.state.steps.length > 0
      ? this.state.steps.reduce((sum, s) => sum + (s.confidence || 0), 0) / this.state.steps.length
      : 0;

    return {
      status: this.state.status === 'complete' ? 'success' :
              this.state.status === 'failed' ? 'failed' : 'partial',
      summary: lastStep?.thought || 'No conclusion reached',
      chain: this.state.steps,
      solution: this.state.context.solution || null,
      nextSteps: this.state.context.nextSteps || [],
      metadata: {
        framework: this.getName(),
        iterations: this.state.loopCount,
        totalSteps: this.state.steps.length,
        finalPhase: this.state.phase,
        averageConfidence: avgConfidence
      }
    };
  }
}

module.exports = BaseFramework;
