const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * Chain of Thought Framework
 *
 * Sequential step-by-step reasoning with Plan → Execute → Verify → Recover cycle.
 * Best for multi-step tasks like installations, deployments, and configurations.
 *
 * Phases:
 * 1. plan_generation - Create detailed dependency-aware execution plan
 * 2. step_execution - Execute each step sequentially
 * 3. verification - Verify step success using various methods
 * 4. recovery - Handle failures with retry/skip/abort strategies
 *
 * Features:
 * - Dependency-aware planning
 * - Multiple verification methods (command, file, pattern)
 * - Automatic retry on transient failures
 * - Rollback capability
 * - Progress tracking (step N of M)
 */
class ChainOfThoughtFramework extends BaseFramework {
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    this.definition = FRAMEWORK_DEFINITIONS.chain_of_thought;
    this.maxRetries = 3;
    this.maxSteps = 50;

    // Execution state
    this.plan = [];
    this.currentStepIndex = 0;
    this.completedSteps = [];
    this.failedSteps = [];
    this.skippedSteps = [];
    this.rollbackStack = [];

    // Verification methods
    this.verificationMethods = {
      COMMAND: 'command',      // Run a verification command
      FILE_EXISTS: 'file',     // Check if file/directory exists
      PATTERN_MATCH: 'pattern', // Match pattern in output/file
      NO_ERROR: 'no_error'     // Just check exit code was 0
    };
  }

  // ============================================================================
  // FRAMEWORK INTERFACE
  // ============================================================================

  getName() {
    return 'chain_of_thought';
  }

  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the Chain of Thought framework on a multi-step task
   * @param {string} problem - The task to accomplish
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    try {
      // Phase 1: Generate the execution plan
      await this.generatePlan(problem);

      if (this.plan.length === 0) {
        throw new Error('Failed to generate execution plan');
      }

      // Phase 2-4: Execute each step with verification and recovery
      for (let i = 0; i < this.plan.length; i++) {
        this.currentStepIndex = i;
        const planStep = this.plan[i];

        // Check if we've exceeded max steps
        if (this.state.steps.length >= this.maxSteps) {
          this.state.status = 'failed';
          this.addStep('recovery', `Exceeded maximum steps (${this.maxSteps}). Aborting.`);
          break;
        }

        // Execute the step
        const executeResult = await this.executeStep(planStep);

        if (!executeResult.success) {
          // Attempt recovery
          const recoveryResult = await this.recoverFromFailure(planStep, executeResult.error);

          if (recoveryResult.action === 'abort') {
            this.state.status = 'failed';
            break;
          } else if (recoveryResult.action === 'skip') {
            this.skippedSteps.push(planStep);
            continue;
          } else if (recoveryResult.action === 'retry') {
            // Retry the same step
            i--;
            continue;
          } else if (recoveryResult.action === 'add_prerequisite') {
            // Insert prerequisite step before current one
            this.plan.splice(i, 0, recoveryResult.prerequisiteStep);
            i--;
            continue;
          }
        }

        // Verify the step
        const verifyResult = await this.verifyStep(planStep, executeResult);

        if (!verifyResult.success) {
          // Verification failed - attempt recovery
          const recoveryResult = await this.recoverFromFailure(planStep,
            new Error(`Verification failed: ${verifyResult.reason}`));

          if (recoveryResult.action === 'abort') {
            this.state.status = 'failed';
            break;
          } else if (recoveryResult.action === 'skip') {
            this.skippedSteps.push(planStep);
            continue;
          } else if (recoveryResult.action === 'retry') {
            i--;
            continue;
          }
        }

        // Step completed successfully
        this.completedSteps.push({
          ...planStep,
          result: executeResult,
          verification: verifyResult
        });

        // Add to rollback stack if step has rollback command
        if (planStep.rollback) {
          this.rollbackStack.push(planStep);
        }
      }

      // Determine final status
      if (this.state.status !== 'failed') {
        if (this.completedSteps.length === this.plan.length) {
          this.state.status = 'complete';
        } else if (this.completedSteps.length > 0) {
          this.state.status = 'partial';
        } else {
          this.state.status = 'failed';
        }
      }

      // Generate final summary
      await this.generateSummary(problem);

      return this.getResult();
    } catch (error) {
      this.state.status = 'failed';
      this.addStep('recovery', `Fatal error: ${error.message}`);
      return this.getResult();
    }
  }

  // ============================================================================
  // PHASE 1: PLAN GENERATION
  // ============================================================================

  /**
   * Generate a detailed step-by-step execution plan
   * @param {string} problem - The task to plan for
   * @returns {Promise<void>}
   */
  async generatePlan(problem) {
    const step = this.addStep('plan_generation',
      `Analyzing task and creating step-by-step execution plan...`);

    const planPrompt = `Analyze this task and create a detailed execution plan:

TASK: ${problem}

CONTEXT:
- Current directory: ${this.context.cwd}
- System: Linux

Create a JSON array of steps with the following structure for EACH step:
{
  "id": 1,
  "description": "Clear description of what this step does",
  "command": "The actual shell command to run",
  "dependencies": [0], // Array of step IDs that must complete first (empty array if none)
  "optional": false, // true if this step can be skipped on failure
  "verification": {
    "method": "command|file|pattern|no_error",
    "value": "verification command OR file path OR pattern to match"
  },
  "rollback": "command to undo this step if needed (optional)"
}

VERIFICATION METHODS:
- "command": Run a verification command (e.g., "which node" to check if node is installed)
- "file": Check if a file/directory exists (e.g., "node_modules")
- "pattern": Check if output matches a pattern (e.g., "success|complete")
- "no_error": Just verify exit code was 0

IMPORTANT:
1. Order steps by dependencies
2. Include prerequisite checks (e.g., check if tool is installed before using it)
3. Make each step atomic and testable
4. Include verification for critical steps
5. Mark optional steps appropriately
6. Include rollback commands for destructive operations
7. Return ONLY the JSON array, no markdown formatting

Example:
[
  {
    "id": 1,
    "description": "Check if npm is installed",
    "command": "which npm",
    "dependencies": [],
    "optional": false,
    "verification": {
      "method": "command",
      "value": "npm --version"
    }
  },
  {
    "id": 2,
    "description": "Install dependencies",
    "command": "npm install",
    "dependencies": [1],
    "optional": false,
    "verification": {
      "method": "file",
      "value": "node_modules"
    }
  }
]`;

    try {
      const response = await this.promptLLM(planPrompt);

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\s*$/g, '').trim();
      }

      this.plan = JSON.parse(jsonStr);

      // Validate plan structure
      if (!Array.isArray(this.plan) || this.plan.length === 0) {
        throw new Error('Invalid plan format: expected non-empty array');
      }

      // Validate each step
      for (const planStep of this.plan) {
        if (!planStep.id || !planStep.description || !planStep.command) {
          throw new Error(`Invalid step structure: ${JSON.stringify(planStep)}`);
        }
        planStep.dependencies = planStep.dependencies || [];
        planStep.optional = planStep.optional || false;
        planStep.verification = planStep.verification || { method: 'no_error' };
      }

      const confidence = Math.min(0.9, 0.5 + (this.plan.length * 0.05));
      this.updateStep(step.id, {
        result: {
          success: true,
          output: `Generated plan with ${this.plan.length} steps`
        },
        confidence
      });

      // Store plan in context
      this.state.context.plan = this.plan;

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: `Failed to generate plan: ${error.message}`
        },
        confidence: 0.1
      });
      throw error;
    }
  }

  // ============================================================================
  // PHASE 2: STEP EXECUTION
  // ============================================================================

  /**
   * Execute a single step from the plan
   * @param {Object} planStep - The step to execute
   * @returns {Promise<Object>} { success: boolean, output: string, error?: Error }
   */
  async executeStep(planStep) {
    const stepNum = this.currentStepIndex + 1;
    const totalSteps = this.plan.length;

    const step = this.addStep('step_execution',
      `[${stepNum}/${totalSteps}] ${planStep.description}`,
      planStep.command);

    try {
      // Check dependencies
      for (const depId of planStep.dependencies) {
        const depCompleted = this.completedSteps.find(s => s.id === depId);
        if (!depCompleted) {
          throw new Error(`Dependency not met: step ${depId} not completed`);
        }
      }

      // Execute the command
      const result = this.executeCommand(planStep.command, 60000); // 60s timeout

      this.updateStep(step.id, {
        result,
        confidence: result.success ? 0.7 : 0.2
      });

      return {
        success: result.success,
        output: result.output,
        exitCode: result.success ? 0 : 1
      };
    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: error.message
        },
        confidence: 0.1
      });

      return {
        success: false,
        output: error.message,
        error
      };
    }
  }

  // ============================================================================
  // PHASE 3: VERIFICATION
  // ============================================================================

  /**
   * Verify a step completed successfully
   * @param {Object} planStep - The plan step that was executed
   * @param {Object} executeResult - Result from executing the step
   * @returns {Promise<Object>} { success: boolean, reason?: string }
   */
  async verifyStep(planStep, executeResult) {
    const verification = planStep.verification || { method: 'no_error' };

    const step = this.addStep('verification',
      `Verifying step: ${planStep.description}`);

    try {
      let verifyResult = { success: false, reason: 'Unknown verification method' };

      switch (verification.method) {
        case this.verificationMethods.NO_ERROR:
          verifyResult = this.verifyNoError(executeResult);
          break;

        case this.verificationMethods.COMMAND:
          verifyResult = await this.verifyByCommand(verification.value);
          break;

        case this.verificationMethods.FILE_EXISTS:
          verifyResult = await this.verifyFileExists(verification.value);
          break;

        case this.verificationMethods.PATTERN_MATCH:
          verifyResult = this.verifyPatternMatch(executeResult.output, verification.value);
          break;

        default:
          verifyResult = {
            success: false,
            reason: `Unknown verification method: ${verification.method}`
          };
      }

      this.updateStep(step.id, {
        result: {
          success: verifyResult.success,
          output: verifyResult.reason || (verifyResult.success ? 'Verified' : 'Failed')
        },
        confidence: verifyResult.success ? 0.8 : 0.3
      });

      return verifyResult;
    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: error.message
        },
        confidence: 0.2
      });

      return {
        success: false,
        reason: error.message
      };
    }
  }

  /**
   * Verify by checking exit code was 0
   */
  verifyNoError(executeResult) {
    if (executeResult.success && executeResult.exitCode === 0) {
      return { success: true, reason: 'Command succeeded (exit code 0)' };
    }
    return {
      success: false,
      reason: `Command failed with exit code ${executeResult.exitCode}`
    };
  }

  /**
   * Verify by running a verification command
   */
  async verifyByCommand(command) {
    const result = this.executeCommand(command, 30000);
    if (result.success) {
      return { success: true, reason: `Verification command succeeded: ${command}` };
    }
    return {
      success: false,
      reason: `Verification command failed: ${command}`
    };
  }

  /**
   * Verify by checking if a file/directory exists
   */
  async verifyFileExists(path) {
    const result = this.executeCommand(`test -e "${path}" && echo "exists" || echo "not found"`);
    if (result.success && result.output.includes('exists')) {
      return { success: true, reason: `File/directory exists: ${path}` };
    }
    return {
      success: false,
      reason: `File/directory not found: ${path}`
    };
  }

  /**
   * Verify by pattern matching in output
   */
  verifyPatternMatch(output, pattern) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(output)) {
      return { success: true, reason: `Output matches pattern: ${pattern}` };
    }
    return {
      success: false,
      reason: `Output does not match pattern: ${pattern}`
    };
  }

  // ============================================================================
  // PHASE 4: RECOVERY
  // ============================================================================

  /**
   * Handle step failure with recovery strategies
   * @param {Object} planStep - The failed step
   * @param {Error} error - The error that occurred
   * @returns {Promise<Object>} Recovery action: { action: 'retry'|'skip'|'abort'|'add_prerequisite', prerequisiteStep?: Object }
   */
  async recoverFromFailure(planStep, error) {
    const stepNum = this.currentStepIndex + 1;
    const retryCount = this.failedSteps.filter(s => s.id === planStep.id).length;

    const step = this.addStep('recovery',
      `Step ${stepNum} failed: ${error.message}. Determining recovery strategy...`);

    try {
      // If optional step, can skip
      if (planStep.optional) {
        this.updateStep(step.id, {
          result: {
            success: true,
            output: 'Skipping optional step'
          },
          confidence: 0.6
        });
        return { action: 'skip' };
      }

      // If we've retried too many times, abort
      if (retryCount >= this.maxRetries) {
        this.updateStep(step.id, {
          result: {
            success: false,
            output: `Exceeded max retries (${this.maxRetries}). Aborting.`
          },
          confidence: 0.9
        });
        this.failedSteps.push({ ...planStep, error: error.message });
        return { action: 'abort' };
      }

      // Ask LLM for recovery strategy
      const recoveryPrompt = `A step in the execution plan failed. Determine the best recovery strategy.

FAILED STEP:
Description: ${planStep.description}
Command: ${planStep.command}
Error: ${error.message}

RETRY COUNT: ${retryCount}/${this.maxRetries}

CONTEXT:
- Current directory: ${this.context.cwd}
- Completed steps: ${this.completedSteps.length}
- Failed steps: ${this.failedSteps.length}

Respond with a JSON object with ONE of these structures:

1. RETRY (if transient failure, network issue, or might work on second try):
   { "action": "retry", "reason": "why retry might work" }

2. SKIP (if non-critical and can proceed without):
   { "action": "skip", "reason": "why it's safe to skip" }

3. ABORT (if critical failure that cannot be recovered):
   { "action": "abort", "reason": "why we must stop" }

4. ADD_PREREQUISITE (if missing dependency or setup):
   {
     "action": "add_prerequisite",
     "reason": "what's missing",
     "prerequisite": {
       "id": ${this.plan.length + 1},
       "description": "what the prerequisite does",
       "command": "command to run",
       "dependencies": [],
       "optional": false,
       "verification": { "method": "no_error" }
     }
   }

Return ONLY the JSON object, no markdown.`;

      const response = await this.promptLLM(recoveryPrompt);

      // Extract JSON
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\s*$/g, '').trim();
      }

      const recovery = JSON.parse(jsonStr);

      // Log the recovery decision
      this.updateStep(step.id, {
        result: {
          success: true,
          output: `Recovery strategy: ${recovery.action} - ${recovery.reason}`
        },
        confidence: 0.7
      });

      // Track failed attempt
      this.failedSteps.push({ ...planStep, error: error.message, retryCount });

      // Execute recovery action
      if (recovery.action === 'add_prerequisite') {
        return {
          action: 'add_prerequisite',
          prerequisiteStep: recovery.prerequisite
        };
      }

      return { action: recovery.action };

    } catch (recoveryError) {
      // If recovery analysis fails, default to abort
      this.updateStep(step.id, {
        result: {
          success: false,
          output: `Recovery analysis failed: ${recoveryError.message}. Aborting.`
        },
        confidence: 0.5
      });
      return { action: 'abort' };
    }
  }

  /**
   * Rollback completed steps (if needed)
   * @returns {Promise<void>}
   */
  async performRollback() {
    if (this.rollbackStack.length === 0) {
      return;
    }

    const step = this.addStep('recovery',
      `Performing rollback of ${this.rollbackStack.length} steps...`);

    const rolledBack = [];

    // Execute rollback commands in reverse order
    while (this.rollbackStack.length > 0) {
      const planStep = this.rollbackStack.pop();

      if (planStep.rollback) {
        const result = this.executeCommand(planStep.rollback, 60000);
        rolledBack.push({
          step: planStep.description,
          success: result.success,
          output: result.output
        });
      }
    }

    this.updateStep(step.id, {
      result: {
        success: true,
        output: `Rolled back ${rolledBack.length} steps`
      },
      confidence: 0.7
    });

    this.state.context.rollback = rolledBack;
  }

  // ============================================================================
  // SUMMARY GENERATION
  // ============================================================================

  /**
   * Generate final summary of execution
   * @param {string} problem - Original problem statement
   * @returns {Promise<void>}
   */
  async generateSummary(problem) {
    const summaryPrompt = `Summarize the execution of this multi-step task:

ORIGINAL TASK: ${problem}

EXECUTION RESULTS:
- Total steps planned: ${this.plan.length}
- Steps completed: ${this.completedSteps.length}
- Steps failed: ${this.failedSteps.length}
- Steps skipped: ${this.skippedSteps.length}
- Overall status: ${this.state.status}

COMPLETED STEPS:
${this.completedSteps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

${this.failedSteps.length > 0 ? `FAILED STEPS:\n${this.failedSteps.map(s => `- ${s.description}: ${s.error}`).join('\n')}` : ''}

${this.skippedSteps.length > 0 ? `SKIPPED STEPS:\n${this.skippedSteps.map(s => `- ${s.description}`).join('\n')}` : ''}

Provide:
1. A brief summary (2-3 sentences) of what was accomplished
2. Any next steps needed if execution was incomplete
3. Key takeaways or recommendations

Be concise and focus on actionable information.`;

    try {
      const summary = await this.promptLLM(summaryPrompt);

      this.state.context.solution = summary;

      // Generate next steps if not fully complete
      if (this.state.status !== 'complete') {
        const nextSteps = [];

        if (this.failedSteps.length > 0) {
          nextSteps.push(`Resolve ${this.failedSteps.length} failed step(s)`);
        }

        const remainingSteps = this.plan.length - this.completedSteps.length;
        if (remainingSteps > 0) {
          nextSteps.push(`Complete remaining ${remainingSteps} step(s)`);
        }

        this.state.context.nextSteps = nextSteps;
      }
    } catch (error) {
      this.state.context.solution = `Execution ${this.state.status}. Completed ${this.completedSteps.length}/${this.plan.length} steps.`;
    }
  }

  // ============================================================================
  // CUSTOM RESULT FORMATTING
  // ============================================================================

  /**
   * Override getResult to include plan execution details
   * @returns {Object} FrameworkResult
   */
  getResult() {
    const baseResult = super.getResult();

    return {
      ...baseResult,
      metadata: {
        ...baseResult.metadata,
        plan: this.plan,
        completedSteps: this.completedSteps.length,
        failedSteps: this.failedSteps.length,
        skippedSteps: this.skippedSteps.length,
        progress: `${this.completedSteps.length}/${this.plan.length}`,
        rollbackAvailable: this.rollbackStack.length > 0
      }
    };
  }
}

module.exports = ChainOfThoughtFramework;
