const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * FiveWhysFramework - Root cause analysis using Fishbone + Five Whys
 *
 * Combines Ishikawa (Fishbone) diagram categorization with recursive "why" drilling
 * to identify actionable root causes of recurring or systemic issues.
 *
 * @extends BaseFramework
 */
class FiveWhysFramework extends BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   */
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    this.definition = FRAMEWORK_DEFINITIONS.five_whys;
    this.maxWhys = 7; // Maximum depth of "why" drilling

    // Ishikawa diagram categories (6M's)
    this.fishboneCategories = [
      'machine',      // Hardware, infrastructure, tools
      'method',       // Processes, procedures, workflows
      'material',     // Data, inputs, dependencies, packages
      'manpower',     // Human factors, skills, knowledge gaps
      'measurement',  // Monitoring, metrics, observability
      'environment'   // External factors, network, OS, configuration
    ];

    // State tracking
    this.whyChain = [];        // Array of {question, answer, depth} objects
    this.fishbone = {};        // Categorized potential causes
    this.selectedCause = null; // The cause we'll drill into
    this.rootCause = null;     // Final identified root cause
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  getName() {
    return 'five_whys';
  }

  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the Five Whys + Fishbone analysis
   * @param {string} problem - The problem or recurring issue to analyze
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    try {
      this.state.context.problem = problem;

      // Phase 1: Build Fishbone Diagram
      await this.buildFishbone(problem);

      // Phase 2: Drill with "Why" questions
      await this.drillWhy(this.selectedCause);

      // Phase 3: Identify if we've reached an actionable root cause
      const isRoot = await this.identifyRoot(this.whyChain);

      if (!isRoot) {
        // If not a true root, add a step indicating we need deeper analysis
        const step = this.addStep('root_identification',
          `The current answer appears to be a symptom rather than an actionable root cause. Consider investigating: ${this.whyChain[this.whyChain.length - 1]?.answer || 'the underlying system'} further.`,
          null
        );
        step.confidence = 0.4;
        this.updateStep(step.id, { confidence: 0.4 });
      }

      // Phase 4: Generate remediation plan
      await this.generateRemediation(this.rootCause || this.whyChain[this.whyChain.length - 1]?.answer);

      // Mark as complete
      this.state.status = 'complete';

      return this.getResult();
    } catch (error) {
      this.state.status = 'failed';
      this.addStep('error', `Framework execution failed: ${error.message}`, null);
      throw error;
    }
  }

  // ============================================================================
  // FRAMEWORK-SPECIFIC METHODS
  // ============================================================================

  /**
   * Phase 1: Build Fishbone diagram by categorizing potential causes
   * @param {string} problem - The problem to analyze
   */
  async buildFishbone(problem) {
    const step = this.addStep('fishbone_mapping',
      'Categorizing potential causes using Ishikawa (Fishbone) diagram approach...',
      null
    );

    // Build the prompt for LLM
    const prompt = `Analyze this recurring problem using the Ishikawa (Fishbone) diagram framework:

PROBLEM: ${problem}

Categorize potential causes into these 6 categories (the 6 M's):

1. **Machine** (Hardware, infrastructure, tools, servers, devices)
2. **Method** (Processes, procedures, workflows, algorithms)
3. **Material** (Data, inputs, dependencies, packages, libraries, resources)
4. **Manpower** (Human factors, skills, knowledge gaps, training)
5. **Measurement** (Monitoring, metrics, logging, observability, alerts)
6. **Environment** (External factors, network, OS, configuration, environment variables)

For each category, list 2-4 specific potential causes relevant to this problem.
Then select the HIGHEST PRIORITY cause (the one most likely to be the root) to investigate further.

Format your response as:

FISHBONE DIAGRAM:
- Machine:
  - [cause 1]
  - [cause 2]
- Method:
  - [cause 1]
  - [cause 2]
[etc...]

SELECTED CAUSE FOR INVESTIGATION:
[The single most likely root cause to drill into]

REASONING:
[Why you selected this cause]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse the response to extract fishbone categories and selected cause
      this.parseFishboneResponse(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.7
      });

      this.state.context.fishbone = this.fishbone;
      this.state.context.selectedCause = this.selectedCause;

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: error.message
        },
        confidence: 0.3
      });
      throw error;
    }
  }

  /**
   * Parse the LLM response to extract fishbone diagram and selected cause
   * @param {string} response - LLM response text
   */
  parseFishboneResponse(response) {
    // Initialize fishbone with empty arrays
    this.fishboneCategories.forEach(cat => {
      this.fishbone[cat] = [];
    });

    // Extract selected cause (look for "SELECTED CAUSE" section)
    const selectedMatch = response.match(/SELECTED CAUSE[^:]*:\s*\n*([^\n]+)/i);
    if (selectedMatch) {
      this.selectedCause = selectedMatch[1].trim();
    }

    // Parse categories - look for each category name followed by causes
    this.fishboneCategories.forEach(category => {
      const categoryRegex = new RegExp(`${category}:\\s*\\n([^]*?)(?=\\n\\w+:|$)`, 'i');
      const match = response.match(categoryRegex);

      if (match) {
        // Extract bullet points
        const causes = match[1]
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace(/^[-•*]\s*/, '').trim())
          .filter(line => line.length > 0);

        this.fishbone[category] = causes;
      }
    });

    // If no selected cause was parsed, pick the first non-empty category's first cause
    if (!this.selectedCause) {
      for (const category of this.fishboneCategories) {
        if (this.fishbone[category].length > 0) {
          this.selectedCause = this.fishbone[category][0];
          break;
        }
      }
    }
  }

  /**
   * Phase 2: Drill down with recursive "Why" questions
   * @param {string} cause - The cause to investigate
   * @param {number} depth - Current depth (0-based)
   */
  async drillWhy(cause, depth = 0) {
    if (depth >= this.maxWhys) {
      const step = this.addStep('why_drilling',
        `Reached maximum depth of ${this.maxWhys} "why" questions. Stopping drill-down.`,
        null
      );
      step.confidence = 0.6;
      this.updateStep(step.id, { confidence: 0.6 });
      return;
    }

    const question = depth === 0
      ? `Why does this happen: "${cause}"?`
      : `Why: "${this.whyChain[depth - 1].answer}"?`;

    const step = this.addStep('why_drilling',
      `Asking "Why" (depth ${depth + 1}/${this.maxWhys}): ${question}`,
      null
    );

    // Build context from previous whys
    const previousContext = this.whyChain.length > 0
      ? `\n\nPREVIOUS WHY CHAIN:\n${this.whyChain.map((w, i) => `${i + 1}. Q: ${w.question}\n   A: ${w.answer}`).join('\n')}`
      : '';

    const prompt = `You are performing root cause analysis using the "Five Whys" technique.

ORIGINAL PROBLEM: ${this.state.context.problem}

CURRENT INVESTIGATION: ${cause}
${previousContext}

QUESTION: ${question}

Provide a direct, specific answer that gets closer to the root cause.
- If this is a SYMPTOM, explain the underlying mechanism that causes it
- If this is a ROOT CAUSE (something actionable/fixable), state it clearly and explain why it's the root
- Be specific about technical details, configurations, or system behaviors
- Avoid vague answers like "because it's broken" - dig deeper

Your answer:`;

    try {
      const response = await this.promptLLM(prompt);

      // Store in why chain
      this.whyChain.push({
        question,
        answer: response.trim(),
        depth
      });

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.6 + (depth * 0.05) // Increase confidence as we drill deeper
      });

      // Check if we should continue drilling
      const shouldContinue = await this.shouldContinueDrilling(response, depth);

      if (shouldContinue && depth < this.maxWhys - 1) {
        // Recursively drill deeper
        await this.drillWhy(cause, depth + 1);
      }

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: error.message
        },
        confidence: 0.3
      });
      throw error;
    }
  }

  /**
   * Determine if we should continue drilling deeper
   * @param {string} answer - Latest answer from why chain
   * @param {number} depth - Current depth
   * @returns {Promise<boolean>} True if should continue
   */
  async shouldContinueDrilling(answer, depth) {
    // Simple heuristic: if the answer contains certain keywords, it might be a root cause
    const rootCauseIndicators = [
      'not configured',
      'missing',
      'not installed',
      'wrong version',
      'hardcoded',
      'no validation',
      'not implemented',
      'design flaw',
      'legacy',
      'technical debt'
    ];

    const lowerAnswer = answer.toLowerCase();
    const hasRootIndicator = rootCauseIndicators.some(indicator =>
      lowerAnswer.includes(indicator)
    );

    // If we have clear root indicators at depth 3+, we can stop
    if (hasRootIndicator && depth >= 2) {
      return false;
    }

    // Continue if we're not at max depth
    return depth < this.maxWhys - 1;
  }

  /**
   * Phase 3: Identify if we've reached an actionable root cause
   * @param {Array} whyChain - Chain of why questions and answers
   * @returns {Promise<boolean>} True if this is an actionable root cause
   */
  async identifyRoot(whyChain) {
    if (whyChain.length === 0) {
      return false;
    }

    const lastAnswer = whyChain[whyChain.length - 1].answer;

    const step = this.addStep('root_identification',
      'Determining if we\'ve reached an actionable root cause vs. just a symptom...',
      null
    );

    const prompt = `Analyze whether this is a TRUE ROOT CAUSE or just a SYMPTOM.

WHY CHAIN:
${whyChain.map((w, i) => `${i + 1}. Q: ${w.question}\n   A: ${w.answer}`).join('\n\n')}

CRITERIA FOR ROOT CAUSE:
- ✓ Actionable: Can be fixed/changed/configured
- ✓ Specific: Points to a concrete issue (config, code, process)
- ✓ Fundamental: If fixed, the original problem won't recur
- ✗ Symptom: Describes an effect of something deeper
- ✗ Vague: "It's broken", "Bad design" without specifics

Is "${lastAnswer}" a TRUE ROOT CAUSE?

Respond with:
VERDICT: [ROOT_CAUSE or SYMPTOM]
CONFIDENCE: [0-100]
REASONING: [Your explanation]
${whyChain.length < 3 ? 'NEXT_WHY: [If symptom, what should we ask next?]' : ''}`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse verdict
      const verdictMatch = response.match(/VERDICT:\s*(ROOT_CAUSE|SYMPTOM)/i);
      const isRootCause = verdictMatch && verdictMatch[1].toUpperCase() === 'ROOT_CAUSE';

      const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.5;

      if (isRootCause) {
        this.rootCause = lastAnswer;
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence
      });

      this.state.context.isRootCause = isRootCause;
      this.state.context.rootCause = this.rootCause;

      return isRootCause;

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: error.message
        },
        confidence: 0.3
      });
      return false;
    }
  }

  /**
   * Phase 4: Generate remediation plan (immediate fix + prevention)
   * @param {string} rootCause - The identified root cause
   */
  async generateRemediation(rootCause) {
    const step = this.addStep('remediation',
      'Generating immediate fix and long-term prevention measures...',
      null
    );

    const prompt = `Generate a comprehensive remediation plan for this root cause.

ROOT CAUSE: ${rootCause}

ORIGINAL PROBLEM: ${this.state.context.problem}

WHY CHAIN CONTEXT:
${this.whyChain.map((w, i) => `${i + 1}. ${w.question} → ${w.answer}`).join('\n')}

Provide:

1. IMMEDIATE FIX:
   - Concrete steps to resolve the issue NOW
   - Commands to run (if applicable)
   - Configurations to change
   - Expected outcome

2. PREVENTION MEASURES:
   - Changes to prevent recurrence
   - Monitoring/alerting to add
   - Process improvements
   - Documentation updates

3. VERIFICATION:
   - How to verify the fix worked
   - Tests to run
   - Metrics to check

Format as actionable steps with commands where applicable.`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse immediate fix commands if present
      const commandMatches = response.matchAll(/```(?:bash|sh)?\n(.*?)```/gs);
      const commands = [];
      for (const match of commandMatches) {
        commands.push(match[1].trim());
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.8
      });

      this.state.context.remediation = response;
      this.state.context.commands = commands;
      this.state.context.solution = {
        rootCause: this.rootCause || rootCause,
        immediateFix: response,
        commands
      };

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: error.message
        },
        confidence: 0.3
      });
      throw error;
    }
  }

  // ============================================================================
  // OVERRIDE: Custom System Prompt
  // ============================================================================

  getFrameworkSystemPrompt() {
    return `You are an expert root cause analyst using the Five Whys + Fishbone (Ishikawa) framework.

METHODOLOGY:
1. Fishbone Mapping: Categorize causes by Machine, Method, Material, Manpower, Measurement, Environment
2. Why Drilling: Recursively ask "why" to dig deeper (up to ${this.maxWhys} levels)
3. Root Identification: Distinguish actionable root causes from symptoms
4. Remediation: Generate immediate fixes and long-term prevention

CURRENT WORKING DIRECTORY: ${this.context.cwd}

PHASES: ${this.getPhases().join(' → ')}

PRINCIPLES:
- Be specific and technical in your analysis
- Distinguish between symptoms (effects) and root causes (sources)
- Focus on actionable, fixable issues
- Consider systemic problems, not just surface issues
- Provide concrete remediation steps with commands when applicable

Your goal is to identify the TRUE root cause that, if fixed, will prevent recurrence.`;
  }
}

module.exports = FiveWhysFramework;
