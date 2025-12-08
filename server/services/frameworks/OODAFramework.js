const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * OODAFramework - Observe-Orient-Decide-Act Loop
 *
 * Rapid iteration cycle for real-time debugging and incident response.
 * Continuously loops through phases, gathering data and refining hypotheses
 * until a solution is found or max iterations reached.
 *
 * Phases:
 * 1. Observe - Gather system state, errors, logs
 * 2. Orient - Analyze observations, form hypotheses
 * 3. Decide - Select action based on hypothesis confidence
 * 4. Act - Execute action, then loop back
 *
 * @extends BaseFramework
 */
class OODAFramework extends BaseFramework {
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);
    this.definition = FRAMEWORK_DEFINITIONS.ooda;
    this.maxIterations = this.definition.maxIterations || 5;
    this.confidenceThreshold = 0.8;

    // Track loop data across iterations
    this.observations = [];
    this.hypotheses = [];
    this.previousActions = [];
  }

  /**
   * Get framework name
   * @returns {string}
   */
  getName() {
    return 'ooda';
  }

  /**
   * Get framework phases
   * @returns {string[]}
   */
  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the OODA Loop on a problem
   * @param {string} problem - The problem to solve
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    this.state.framework = this.getName();
    this.state.status = 'active';

    let iteration = 0;
    let solutionFound = false;

    try {
      while (iteration < this.maxIterations && !solutionFound) {
        this.state.loopCount = iteration + 1;

        console.log(`[OODA] Starting iteration ${iteration + 1}/${this.maxIterations}`);

        // Phase 1: Observe
        const observations = await this.observe(problem, iteration > 0 ? this.observations : null);

        // Phase 2: Orient
        const hypotheses = await this.orient(observations);

        // Phase 3: Decide
        const decision = await this.decide(hypotheses);

        // Phase 4: Act
        const actionResult = await this.act(decision);

        // Check if we found a solution
        if (decision.confidence >= this.confidenceThreshold && actionResult.success) {
          solutionFound = true;
          this.state.context.solution = {
            hypothesis: decision.selectedHypothesis,
            action: decision.action,
            result: actionResult,
            confidence: decision.confidence
          };
          console.log(`[OODA] Solution found with confidence ${decision.confidence}`);
        }

        iteration++;

        // If we're not done, prepare for next iteration
        if (!solutionFound && iteration < this.maxIterations) {
          console.log(`[OODA] Continuing to next iteration...`);
        }
      }

      // Finalize result
      if (solutionFound) {
        this.state.status = 'complete';
        const summaryStep = this.addStep(
          'complete',
          `Solution found: ${this.state.context.solution.hypothesis.description}`,
          null
        );
        summaryStep.confidence = this.state.context.solution.confidence;
      } else {
        this.state.status = 'failed';
        this.addStep(
          'incomplete',
          `Could not find definitive solution after ${this.maxIterations} iterations. Recommend manual investigation or different framework.`,
          null
        );
        this.state.context.nextSteps = [
          'Review diagnostic data collected during OODA loop',
          'Try Five Whys framework for root cause analysis',
          'Consider manual expert intervention'
        ];
      }

      return this.getResult();

    } catch (error) {
      this.state.status = 'failed';
      this.addStep('error', `Framework execution failed: ${error.message}`, null);
      throw error;
    }
  }

  /**
   * Phase 1: Observe - Gather current system state
   * @param {string} problem - The problem being investigated
   * @param {Array} previousObservations - Observations from previous iterations
   * @returns {Promise<Object>} Observations object
   */
  async observe(problem, previousObservations) {
    const step = this.addStep('observe', 'Gathering system state and diagnostic data...', null);

    // Build context for the LLM
    let observePrompt = `Problem: ${problem}\n\n`;

    if (previousObservations && previousObservations.length > 0) {
      observePrompt += `Previous observations:\n${JSON.stringify(previousObservations, null, 2)}\n\n`;
      observePrompt += `Previous actions taken:\n${this.previousActions.map(a => `- ${a}`).join('\n')}\n\n`;
    }

    observePrompt += `Generate 3-5 diagnostic commands to gather information about the current system state.
Focus on:
- Error logs and stack traces
- Process status and resource usage
- Configuration files
- Network connectivity
- Environment variables
- File permissions

Return ONLY a JSON array of command strings, like:
["command1", "command2", "command3"]

No explanations, just the JSON array.`;

    const systemPrompt = `You are a systems debugging expert using the OODA Loop framework.
Your task is to suggest diagnostic commands that will reveal the current system state.
Working directory: ${this.context.cwd}
Be precise and thorough.`;

    // Get diagnostic commands from LLM
    const response = await this.promptLLM(observePrompt, { systemPrompt });

    let commands = [];
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        commands = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[OODA] Failed to parse diagnostic commands:', error);
      // Fallback to generic commands
      commands = [
        'pwd',
        'ls -la',
        'env | head -20',
        'ps aux | head -10'
      ];
    }

    // Execute diagnostic commands
    const observations = {
      problem,
      timestamp: Date.now(),
      diagnostics: []
    };

    for (const cmd of commands) {
      const result = this.executeCommand(cmd, 10000);
      observations.diagnostics.push({
        command: cmd,
        success: result.success,
        output: result.output
      });
    }

    this.observations.push(observations);

    // Update step
    const summary = `Executed ${commands.length} diagnostic commands:\n${commands.map(c => `  - ${c}`).join('\n')}`;
    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(observations, null, 2) },
      confidence: 0.6
    });

    return observations;
  }

  /**
   * Phase 2: Orient - Analyze observations and generate hypotheses
   * @param {Object} observations - Data from observe phase
   * @returns {Promise<Array>} Array of hypotheses with confidence scores
   */
  async orient(observations) {
    const step = this.addStep('orient', 'Analyzing observations and forming hypotheses...', null);

    const orientPrompt = `Based on the following diagnostic data, generate 3-5 hypotheses about what is causing the problem.

Problem: ${observations.problem}

Diagnostic Results:
${observations.diagnostics.map(d => `
Command: ${d.command}
Success: ${d.success}
Output: ${d.output.substring(0, 500)}
`).join('\n---\n')}

${this.hypotheses.length > 0 ? `
Previous hypotheses (for refinement):
${this.hypotheses.map((h, i) => `${i + 1}. ${h.description} (confidence: ${h.confidence})`).join('\n')}
` : ''}

Generate hypotheses ranked by probability. For each hypothesis provide:
1. Description (what you think is wrong)
2. Confidence (0.0 to 1.0)
3. Reasoning (why you think this)

Return ONLY a JSON array like:
[
  {
    "description": "Hypothesis description",
    "confidence": 0.8,
    "reasoning": "Why this is likely"
  }
]

No other text, just the JSON array.`;

    const systemPrompt = `You are a systems debugging expert using Bayesian reasoning.
Analyze diagnostic data to form probabilistic hypotheses.
Rank hypotheses by likelihood based on evidence.
Be specific and actionable.`;

    const response = await this.promptLLM(orientPrompt, { systemPrompt });

    let hypotheses = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        hypotheses = JSON.parse(jsonMatch[0]);
        // Sort by confidence descending
        hypotheses.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      }
    } catch (error) {
      console.error('[OODA] Failed to parse hypotheses:', error);
      hypotheses = [{
        description: 'Unable to form hypothesis from diagnostic data',
        confidence: 0.3,
        reasoning: 'Insufficient data or parsing error'
      }];
    }

    this.hypotheses = hypotheses;

    const summary = `Generated ${hypotheses.length} hypotheses:\n${hypotheses.map((h, i) =>
      `  ${i + 1}. [${(h.confidence * 100).toFixed(0)}%] ${h.description}`
    ).join('\n')}`;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(hypotheses, null, 2) },
      confidence: hypotheses[0]?.confidence || 0.5
    });

    return hypotheses;
  }

  /**
   * Phase 3: Decide - Select action based on highest confidence hypothesis
   * @param {Array} hypotheses - Array of hypotheses from orient phase
   * @returns {Promise<Object>} Decision object with selected action
   */
  async decide(hypotheses) {
    const step = this.addStep('decide', 'Determining best action based on hypotheses...', null);

    if (hypotheses.length === 0) {
      this.updateStep(step.id, {
        thought: 'No hypotheses available to make a decision',
        confidence: 0.0
      });
      return {
        selectedHypothesis: null,
        action: null,
        confidence: 0.0
      };
    }

    // Select the highest confidence hypothesis
    const topHypothesis = hypotheses[0];

    const decidePrompt = `Based on this hypothesis, what specific action should we take?

Hypothesis: ${topHypothesis.description}
Confidence: ${topHypothesis.confidence}
Reasoning: ${topHypothesis.reasoning}

Provide ONE specific command or fix to test this hypothesis.
Return ONLY a JSON object like:
{
  "action": "command to execute or fix to apply",
  "expected_outcome": "what should happen if hypothesis is correct",
  "fallback": "what to do if this doesn't work"
}

No other text, just the JSON object.`;

    const systemPrompt = `You are a systems debugging expert making tactical decisions.
Choose the most impactful action to test the leading hypothesis.
Be specific and executable.`;

    const response = await this.promptLLM(decidePrompt, { systemPrompt });

    let action = null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        action = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[OODA] Failed to parse action:', error);
      action = {
        action: 'echo "Unable to determine action"',
        expected_outcome: 'None',
        fallback: 'Manual investigation required'
      };
    }

    const decision = {
      selectedHypothesis: topHypothesis,
      action: action.action,
      expectedOutcome: action.expected_outcome,
      fallback: action.fallback,
      confidence: topHypothesis.confidence
    };

    const summary = `Selected action (confidence ${(decision.confidence * 100).toFixed(0)}%):\n  ${decision.action}\nExpected: ${decision.expectedOutcome}`;

    this.updateStep(step.id, {
      thought: summary,
      action: decision.action,
      confidence: decision.confidence
    });

    return decision;
  }

  /**
   * Phase 4: Act - Execute the decided action
   * @param {Object} decision - Decision object from decide phase
   * @returns {Promise<Object>} Action result
   */
  async act(decision) {
    if (!decision.action) {
      const step = this.addStep('act', 'No action to execute', null);
      this.updateStep(step.id, { confidence: 0.0 });
      return { success: false, output: 'No action specified' };
    }

    const step = this.addStep('act', `Executing: ${decision.action}`, decision.action);

    // Execute the action
    const result = this.executeCommand(decision.action, 30000);

    // Track this action
    this.previousActions.push(decision.action);

    const summary = result.success
      ? `Action succeeded:\n${result.output.substring(0, 300)}`
      : `Action failed:\n${result.output.substring(0, 300)}`;

    this.updateStep(step.id, {
      thought: summary,
      result,
      confidence: result.success ? decision.confidence : decision.confidence * 0.5
    });

    return result;
  }

  /**
   * Get framework-specific system prompt
   * @returns {string}
   */
  getFrameworkSystemPrompt() {
    return `You are an AI systems debugger using the OODA Loop (Observe-Orient-Decide-Act) framework for rapid incident response.

Working directory: ${this.context.cwd}

OODA Loop Philosophy:
- Iterate quickly through cycles
- Gather data, form hypotheses, test them
- Refine understanding with each loop
- Prioritize speed of feedback over perfect analysis

Your phases:
1. OBSERVE: Suggest diagnostic commands to gather current state
2. ORIENT: Analyze data to form ranked hypotheses
3. DECIDE: Select the highest-confidence action
4. ACT: Execute and observe results

Be precise, actionable, and focused on rapid iteration.`;
  }
}

module.exports = OODAFramework;
