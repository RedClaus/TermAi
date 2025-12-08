const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * BayesianFramework - Probabilistic Hypothesis Testing
 *
 * Uses Bayesian reasoning to maintain and update beliefs about hypotheses
 * based on diagnostic evidence. Optimal for ambiguous errors with multiple
 * possible causes where uncertainty needs to be quantified.
 *
 * Phases:
 * 1. Prior Generation - Generate hypotheses with initial probabilities
 * 2. Evidence Collection - Gather diagnostic evidence via commands
 * 3. Belief Update - Apply Bayes' theorem to update probabilities
 * 4. Decision - Act when confidence threshold (0.7) reached
 *
 * Key Features:
 * - Probability normalization (all hypotheses sum to 1.0)
 * - Entropy calculation for uncertainty measure
 * - Information gain optimization (choose tests that maximize info)
 * - Diagnostic command suggestion
 * - Supports up to 10 iterations until confident
 *
 * @extends BaseFramework
 */
class BayesianFramework extends BaseFramework {
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);
    this.definition = FRAMEWORK_DEFINITIONS.bayesian;
    this.maxIterations = this.definition.maxIterations || 10;
    this.confidenceThreshold = 0.7;

    // Bayesian state tracking
    this.hypotheses = [];
    this.evidenceHistory = [];
    this.currentEntropy = 1.0;
  }

  /**
   * Get framework name
   * @returns {string}
   */
  getName() {
    return 'bayesian';
  }

  /**
   * Get framework phases
   * @returns {string[]}
   */
  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the Bayesian Reasoning framework on a problem
   * @param {string} problem - The problem to solve
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    this.state.framework = this.getName();
    this.state.status = 'active';

    let iteration = 0;
    let highConfidenceReached = false;

    try {
      // Phase 1: Generate initial hypotheses with prior probabilities
      await this.priorGeneration(problem);

      // Iteratively collect evidence and update beliefs
      while (iteration < this.maxIterations && !highConfidenceReached) {
        this.state.loopCount = iteration + 1;

        console.log(`[Bayesian] Iteration ${iteration + 1}/${this.maxIterations}, Entropy: ${this.currentEntropy.toFixed(3)}`);

        // Phase 2: Collect evidence
        const evidence = await this.evidenceCollection(problem, iteration);

        // Phase 3: Update beliefs using Bayes' theorem
        await this.beliefUpdate(evidence);

        // Phase 4: Check if we can make a decision
        const decision = await this.decision();

        if (decision.shouldAct) {
          highConfidenceReached = true;
          this.state.context.solution = {
            hypothesis: decision.hypothesis,
            confidence: decision.confidence,
            evidence: this.evidenceHistory
          };
          console.log(`[Bayesian] High confidence reached: ${decision.confidence.toFixed(3)}`);
        }

        iteration++;

        // If we're not done and entropy is still high, continue
        if (!highConfidenceReached && iteration < this.maxIterations) {
          console.log(`[Bayesian] Continuing to gather more evidence...`);
        }
      }

      // Finalize result
      if (highConfidenceReached) {
        this.state.status = 'complete';
        const summaryStep = this.addStep(
          'complete',
          `Diagnosis complete: ${this.state.context.solution.hypothesis.description}\nConfidence: ${(this.state.context.solution.confidence * 100).toFixed(1)}%`,
          null
        );
        summaryStep.confidence = this.state.context.solution.confidence;
      } else {
        this.state.status = 'partial';
        this.addStep(
          'incomplete',
          `Unable to reach high confidence after ${this.maxIterations} iterations. Most likely hypothesis: ${this.hypotheses[0].description} (${(this.hypotheses[0].probability * 100).toFixed(1)}%)`,
          null
        );
        this.state.context.nextSteps = [
          'Review all collected evidence',
          'Try OODA Loop for rapid iteration',
          'Consider manual expert diagnosis',
          'Gather additional system information'
        ];
        // Still provide the best hypothesis as a solution
        this.state.context.solution = {
          hypothesis: this.hypotheses[0],
          confidence: this.hypotheses[0].probability,
          evidence: this.evidenceHistory,
          note: 'Partial solution - confidence below threshold'
        };
      }

      return this.getResult();

    } catch (error) {
      this.state.status = 'failed';
      this.addStep('error', `Framework execution failed: ${error.message}`, null);
      throw error;
    }
  }

  /**
   * Phase 1: Prior Generation - Generate hypotheses with initial probabilities
   * @param {string} problem - The problem being investigated
   * @returns {Promise<Array>} Array of hypotheses with prior probabilities
   */
  async priorGeneration(problem) {
    const step = this.addStep('prior_generation', 'Generating initial hypotheses with prior probabilities...', null);

    const priorPrompt = `Problem: ${problem}

Generate 4-6 distinct hypotheses about what could be causing this problem.
For each hypothesis, assign an initial probability based on how likely it seems given only the problem description.

Consider:
- Common causes for this type of issue
- System configuration patterns
- Typical failure modes
- Environment-specific factors

For each hypothesis provide:
1. Description (what you think is wrong)
2. Prior probability (0.0 to 1.0, must sum to 1.0 across all hypotheses)
3. Reasoning (why this is plausible)
4. Diagnostic test (what command/check would confirm or refute this)

Return ONLY a JSON array like:
[
  {
    "description": "Hypothesis description",
    "probability": 0.35,
    "reasoning": "Why this is likely",
    "diagnostic_test": "command to test this hypothesis"
  }
]

IMPORTANT: Probabilities MUST sum to 1.0. No other text, just the JSON array.`;

    const systemPrompt = `You are a Bayesian reasoning expert performing probabilistic diagnosis.
Generate hypotheses with accurate prior probabilities based on base rates and problem characteristics.
Working directory: ${this.context.cwd}
Be thorough and consider multiple potential causes.`;

    const response = await this.promptLLM(priorPrompt, { systemPrompt });

    let hypotheses = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        hypotheses = JSON.parse(jsonMatch[0]);
        // Normalize probabilities to sum to 1.0
        hypotheses = this.normalizeProbabilities(hypotheses);
        // Sort by probability descending
        hypotheses.sort((a, b) => b.probability - a.probability);
      }
    } catch (error) {
      console.error('[Bayesian] Failed to parse hypotheses:', error);
      // Fallback to single uniform hypothesis
      hypotheses = [{
        description: 'Unable to generate hypotheses from problem description',
        probability: 1.0,
        reasoning: 'Insufficient information or parsing error',
        diagnostic_test: 'echo "Manual investigation required"'
      }];
    }

    this.hypotheses = hypotheses;
    this.currentEntropy = this.calculateEntropy(hypotheses);

    const summary = `Generated ${hypotheses.length} hypotheses (Entropy: ${this.currentEntropy.toFixed(3)}):\n${hypotheses.map((h, i) =>
      `  ${i + 1}. [${(h.probability * 100).toFixed(1)}%] ${h.description}`
    ).join('\n')}`;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(hypotheses, null, 2) },
      confidence: 1.0 - this.currentEntropy // Low entropy = high confidence
    });

    return hypotheses;
  }

  /**
   * Phase 2: Evidence Collection - Gather diagnostic evidence
   * @param {string} problem - The problem being investigated
   * @param {number} iteration - Current iteration number
   * @returns {Promise<Object>} Evidence object
   */
  async evidenceCollection(problem, iteration) {
    const step = this.addStep('evidence_collection', 'Gathering diagnostic evidence...', null);

    // Determine which hypothesis to test next (choose one with highest information gain potential)
    const targetHypothesis = this.selectHypothesisForTesting();

    const evidencePrompt = `We are diagnosing: ${problem}

Current hypotheses and probabilities:
${this.hypotheses.map((h, i) => `${i + 1}. [${(h.probability * 100).toFixed(1)}%] ${h.description}`).join('\n')}

${this.evidenceHistory.length > 0 ? `
Previous evidence collected:
${this.evidenceHistory.map(e => `- ${e.test}: ${e.result.success ? 'Success' : 'Failed'}`).join('\n')}
` : ''}

Target hypothesis for testing: ${targetHypothesis.description}
Suggested test: ${targetHypothesis.diagnostic_test}

Generate 2-3 diagnostic commands that will help us gather evidence to confirm or refute the target hypothesis.
These commands should:
- Be safe to execute
- Provide clear yes/no or quantitative evidence
- Help distinguish between competing hypotheses

Return ONLY a JSON array of command strings:
["command1", "command2", "command3"]

No explanations, just the JSON array.`;

    const systemPrompt = `You are a diagnostic expert using Bayesian reasoning.
Choose tests that maximize information gain to reduce uncertainty.
Working directory: ${this.context.cwd}
Prioritize safe, fast diagnostic commands.`;

    const response = await this.promptLLM(evidencePrompt, { systemPrompt });

    let commands = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        commands = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[Bayesian] Failed to parse diagnostic commands:', error);
      // Use the suggested diagnostic test from the hypothesis
      commands = [targetHypothesis.diagnostic_test];
    }

    // Execute diagnostic commands
    const evidence = {
      iteration,
      targetHypothesis: targetHypothesis.description,
      timestamp: Date.now(),
      tests: []
    };

    for (const cmd of commands) {
      const result = this.executeCommand(cmd, 15000);
      evidence.tests.push({
        command: cmd,
        success: result.success,
        output: result.output
      });
    }

    this.evidenceHistory.push(evidence);

    const summary = `Executed ${commands.length} diagnostic tests:\n${commands.map(c => `  - ${c}`).join('\n')}\nTarget: ${targetHypothesis.description}`;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(evidence, null, 2) },
      confidence: 0.6
    });

    return evidence;
  }

  /**
   * Phase 3: Belief Update - Apply Bayes' theorem to update probabilities
   * @param {Object} evidence - Evidence from the collection phase
   * @returns {Promise<Array>} Updated hypotheses with posterior probabilities
   */
  async beliefUpdate(evidence) {
    const step = this.addStep('belief_update', 'Updating hypothesis probabilities based on evidence...', null);

    const updatePrompt = `We collected the following diagnostic evidence:

${evidence.tests.map(t => `
Command: ${t.command}
Success: ${t.success}
Output: ${t.output.substring(0, 500)}
`).join('\n---\n')}

Current hypotheses with prior probabilities:
${this.hypotheses.map((h, i) => `${i + 1}. [${(h.probability * 100).toFixed(1)}%] ${h.description}`).join('\n')}

For each hypothesis, determine the likelihood of observing this evidence given that hypothesis is true.
This is P(Evidence|Hypothesis) - how likely would we see these test results if this hypothesis were correct?

Return ONLY a JSON array with updated probabilities using Bayesian update:
[
  {
    "description": "Same as original hypothesis",
    "likelihood": 0.0-1.0,
    "reasoning": "Why this evidence supports or refutes this hypothesis"
  }
]

The likelihood should be:
- High (0.7-1.0) if evidence strongly supports the hypothesis
- Medium (0.3-0.7) if evidence is neutral or mixed
- Low (0.0-0.3) if evidence contradicts the hypothesis

No other text, just the JSON array. Include ALL hypotheses.`;

    const systemPrompt = `You are a Bayesian reasoning expert updating beliefs based on evidence.
Apply Bayes' theorem: P(H|E) ∝ P(E|H) × P(H)
Evaluate how well each hypothesis explains the observed evidence.`;

    const response = await this.promptLLM(updatePrompt, { systemPrompt });

    let likelihoods = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        likelihoods = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[Bayesian] Failed to parse likelihoods:', error);
      // Fallback: no update, keep prior probabilities
      likelihoods = this.hypotheses.map(h => ({
        description: h.description,
        likelihood: 0.5,
        reasoning: 'Unable to update - using neutral likelihood'
      }));
    }

    // Apply Bayesian update: P(H|E) = P(E|H) × P(H) / P(E)
    // where P(E) = Σ P(E|Hi) × P(Hi) for all hypotheses
    const updatedHypotheses = this.hypotheses.map((h, i) => {
      const likelihood = likelihoods[i]?.likelihood || 0.5;
      const posterior = h.probability * likelihood;
      return {
        ...h,
        likelihood,
        unnormalized_posterior: posterior,
        update_reasoning: likelihoods[i]?.reasoning || 'No reasoning provided'
      };
    });

    // Normalize posterior probabilities
    const totalPosterior = updatedHypotheses.reduce((sum, h) => sum + h.unnormalized_posterior, 0);

    if (totalPosterior > 0) {
      updatedHypotheses.forEach(h => {
        h.probability = h.unnormalized_posterior / totalPosterior;
      });
    } else {
      // If all posteriors are 0, fall back to uniform distribution
      updatedHypotheses.forEach(h => {
        h.probability = 1.0 / updatedHypotheses.length;
      });
    }

    // Sort by new probability
    updatedHypotheses.sort((a, b) => b.probability - a.probability);
    this.hypotheses = updatedHypotheses;

    // Calculate new entropy
    const oldEntropy = this.currentEntropy;
    this.currentEntropy = this.calculateEntropy(updatedHypotheses);
    const informationGain = oldEntropy - this.currentEntropy;

    const summary = `Updated probabilities (Info gain: ${informationGain.toFixed(3)}, Entropy: ${this.currentEntropy.toFixed(3)}):\n${updatedHypotheses.map((h, i) =>
      `  ${i + 1}. [${(h.probability * 100).toFixed(1)}%] ${h.description}`
    ).join('\n')}`;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(updatedHypotheses, null, 2) },
      confidence: 1.0 - this.currentEntropy
    });

    return updatedHypotheses;
  }

  /**
   * Phase 4: Decision - Determine if we should act on the top hypothesis
   * @returns {Promise<Object>} Decision object
   */
  async decision() {
    const step = this.addStep('decision', 'Evaluating whether to act on current beliefs...', null);

    const topHypothesis = this.hypotheses[0];
    const shouldAct = topHypothesis.probability >= this.confidenceThreshold;

    let summary;
    let confidence;

    if (shouldAct) {
      summary = `HIGH CONFIDENCE REACHED\nTop hypothesis: ${topHypothesis.description}\nProbability: ${(topHypothesis.probability * 100).toFixed(1)}%\nEntropy: ${this.currentEntropy.toFixed(3)}\n\nRecommended action: Proceed with diagnosis based on this hypothesis.`;
      confidence = topHypothesis.probability;
    } else {
      const uncertaintyNote = this.currentEntropy > 0.8 ? 'Very high uncertainty - need more evidence' : 'Moderate uncertainty - continue gathering evidence';
      summary = `Confidence below threshold (${(this.confidenceThreshold * 100)}%)\nTop hypothesis: ${topHypothesis.description} at ${(topHypothesis.probability * 100).toFixed(1)}%\n${uncertaintyNote}\nEntropy: ${this.currentEntropy.toFixed(3)}`;
      confidence = topHypothesis.probability;
    }

    this.updateStep(step.id, {
      thought: summary,
      confidence
    });

    return {
      shouldAct,
      hypothesis: topHypothesis,
      confidence: topHypothesis.probability,
      entropy: this.currentEntropy
    };
  }

  /**
   * Normalize probabilities to sum to 1.0
   * @param {Array} hypotheses - Array of hypotheses with probability field
   * @returns {Array} Normalized hypotheses
   */
  normalizeProbabilities(hypotheses) {
    const total = hypotheses.reduce((sum, h) => sum + (h.probability || 0), 0);

    if (total === 0) {
      // If all probabilities are 0, use uniform distribution
      const uniform = 1.0 / hypotheses.length;
      return hypotheses.map(h => ({ ...h, probability: uniform }));
    }

    return hypotheses.map(h => ({
      ...h,
      probability: (h.probability || 0) / total
    }));
  }

  /**
   * Calculate Shannon entropy for the probability distribution
   * Higher entropy = more uncertainty
   * @param {Array} hypotheses - Array of hypotheses with probability field
   * @returns {number} Entropy value (0 to log2(n))
   */
  calculateEntropy(hypotheses) {
    let entropy = 0;
    for (const h of hypotheses) {
      if (h.probability > 0) {
        entropy -= h.probability * Math.log2(h.probability);
      }
    }
    return entropy;
  }

  /**
   * Select the hypothesis to test next based on information gain potential
   * Strategy: Test the hypothesis with probability closest to 0.5 (maximum uncertainty)
   * or the top hypothesis if we want to confirm it
   * @returns {Object} Hypothesis to test
   */
  selectHypothesisForTesting() {
    // If top hypothesis has > 50% probability, test it to confirm/refute
    if (this.hypotheses[0].probability > 0.5) {
      return this.hypotheses[0];
    }

    // Otherwise, find hypothesis with probability closest to 0.5 (max info gain potential)
    let selectedHypothesis = this.hypotheses[0];
    let minDistance = Math.abs(0.5 - this.hypotheses[0].probability);

    for (const h of this.hypotheses) {
      const distance = Math.abs(0.5 - h.probability);
      if (distance < minDistance) {
        minDistance = distance;
        selectedHypothesis = h;
      }
    }

    return selectedHypothesis;
  }

  /**
   * Get framework-specific system prompt
   * @returns {string}
   */
  getFrameworkSystemPrompt() {
    return `You are an AI diagnostic expert using Bayesian Reasoning to solve problems through probabilistic analysis.

Working directory: ${this.context.cwd}

Bayesian Reasoning Philosophy:
- Maintain probabilistic beliefs about hypotheses
- Update beliefs systematically as evidence accumulates
- Quantify uncertainty using entropy
- Choose diagnostic tests that maximize information gain
- Act when confidence exceeds threshold

Your phases:
1. PRIOR GENERATION: Generate hypotheses with initial probabilities based on problem
2. EVIDENCE COLLECTION: Gather diagnostic data via targeted commands
3. BELIEF UPDATE: Apply Bayes' theorem to update probabilities based on evidence
4. DECISION: Determine if top hypothesis has sufficient confidence to act

Be precise, quantitative, and systematic in your probabilistic reasoning.`;
  }
}

module.exports = BayesianFramework;
