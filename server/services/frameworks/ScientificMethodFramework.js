const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * ScientificMethodFramework - Hypothesis-driven experimentation with controlled testing
 *
 * Uses the scientific method to systematically test hypotheses through:
 * 1. Question formulation - Define what we're trying to learn
 * 2. Hypothesis generation - Predict expected outcomes
 * 3. Experiment design - Create controlled test plans
 * 4. Execution - Run the experiment
 * 5. Analysis - Interpret results
 * 6. Conclusion - Answer the original question
 *
 * Best for: Experiments, A/B testing, benchmarking, comparisons, performance tests
 *
 * @extends BaseFramework
 */
class ScientificMethodFramework extends BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   */
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    this.definition = FRAMEWORK_DEFINITIONS.scientific_method;
    this.maxIterations = this.definition.maxIterations;

    // State tracking
    this.researchQuestion = null;  // What we're trying to learn
    this.hypothesis = null;        // Predicted outcome
    this.experimentPlan = null;    // Controlled test plan
    this.results = null;           // Experimental results
    this.analysis = null;          // Statistical/logical analysis
    this.conclusion = null;        // Final answer to question
    this.controlGroup = null;      // Baseline for comparison
    this.experimentalGroup = null; // Test condition
    this.variables = {
      independent: [],  // Variables we manipulate
      dependent: [],    // Variables we measure
      controlled: []    // Variables we keep constant
    };
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  getName() {
    return 'scientific_method';
  }

  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the Scientific Method framework
   * @param {string} problem - The experimental question or comparison to investigate
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    try {
      this.state.context.problem = problem;

      // Phase 1: Define research question
      await this.defineResearchQuestion(problem);

      // Phase 2: Formulate hypothesis
      await this.formulateHypothesis(this.researchQuestion);

      // Phase 3: Design experiment
      await this.designExperiment(this.hypothesis);

      // Phase 4: Execute experiment
      await this.executeExperiment(this.experimentPlan);

      // Phase 5: Analyze results
      await this.analyzeResults(this.results);

      // Phase 6: Draw conclusion
      await this.drawConclusion(this.analysis);

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
   * Phase 1: Define what we're trying to learn
   * @param {string} problem - The problem or experimental topic
   */
  async defineResearchQuestion(problem) {
    const step = this.addStep('question',
      'Formulating clear research question from problem statement...',
      null
    );

    const prompt = `You are a scientist designing an experiment. Convert this problem into a clear, testable research question.

PROBLEM: ${problem}

A good research question should be:
- Specific and measurable
- Testable through experimentation
- Focused on cause-effect relationships
- Clear about what is being compared or measured

Examples:
- "Which configuration performs better?" → "Does configuration A have lower latency than configuration B under load?"
- "Test the new cache" → "Does enabling Redis caching reduce database query time by at least 30%?"
- "Compare sorting algorithms" → "Which sorting algorithm (quicksort, mergesort, heapsort) has the lowest average execution time for arrays of 10,000 random integers?"

Provide:
1. RESEARCH QUESTION: [Your formulated question]
2. WHAT WE'RE TESTING: [The specific thing being investigated]
3. SUCCESS CRITERIA: [How we'll know if we have an answer]
4. MEASUREMENT APPROACH: [What metrics/data we'll collect]`;

    try {
      const response = await this.promptLLM(prompt);

      // Extract research question
      const questionMatch = response.match(/RESEARCH QUESTION:\s*\n*([^\n]+)/i);
      if (questionMatch) {
        this.researchQuestion = questionMatch[1].trim();
      } else {
        // Fallback: use first non-empty line
        this.researchQuestion = response.split('\n').find(line => line.trim().length > 0)?.trim() || problem;
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.8
      });

      this.state.context.researchQuestion = this.researchQuestion;

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
   * Phase 2: Formulate testable hypothesis
   * @param {string} researchQuestion - The research question to answer
   */
  async formulateHypothesis(researchQuestion) {
    const step = this.addStep('hypothesis',
      'Generating testable hypothesis based on research question...',
      null
    );

    const prompt = `Based on this research question, formulate a clear, testable hypothesis.

RESEARCH QUESTION: ${researchQuestion}

A good hypothesis should:
- Make a specific prediction about the outcome
- Be falsifiable (can be proven wrong)
- State the expected relationship between variables
- Include the direction of the effect (increase/decrease/equal)

Format your response as:

HYPOTHESIS:
[Your hypothesis statement using "If... then..." format]

NULL HYPOTHESIS (H0):
[The alternative - what would indicate no effect]

VARIABLES:
- Independent (what we manipulate): [list]
- Dependent (what we measure): [list]
- Controlled (what we keep constant): [list]

RATIONALE:
[Why you expect this outcome - cite prior knowledge, patterns, or theory]`;

    try {
      const response = await this.promptLLM(prompt);

      // Extract hypothesis
      const hypothesisMatch = response.match(/HYPOTHESIS:\s*\n([^]*?)(?=\n\n|NULL HYPOTHESIS|$)/i);
      if (hypothesisMatch) {
        this.hypothesis = hypothesisMatch[1].trim();
      } else {
        this.hypothesis = response.split('\n').find(line => line.trim().length > 0)?.trim() ||
                          `If we test ${researchQuestion}, we will observe a measurable difference.`;
      }

      // Extract variables
      this.parseVariables(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.75
      });

      this.state.context.hypothesis = this.hypothesis;
      this.state.context.variables = this.variables;

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
   * Parse variables from hypothesis response
   * @param {string} response - LLM response containing variables
   */
  parseVariables(response) {
    // Extract independent variables
    const indMatch = response.match(/Independent[^:]*:\s*([^\n]+)/i);
    if (indMatch) {
      this.variables.independent = indMatch[1]
        .split(/[,;]/)
        .map(v => v.trim())
        .filter(v => v.length > 0);
    }

    // Extract dependent variables
    const depMatch = response.match(/Dependent[^:]*:\s*([^\n]+)/i);
    if (depMatch) {
      this.variables.dependent = depMatch[1]
        .split(/[,;]/)
        .map(v => v.trim())
        .filter(v => v.length > 0);
    }

    // Extract controlled variables
    const ctrlMatch = response.match(/Controlled[^:]*:\s*([^\n]+)/i);
    if (ctrlMatch) {
      this.variables.controlled = ctrlMatch[1]
        .split(/[,;]/)
        .map(v => v.trim())
        .filter(v => v.length > 0);
    }
  }

  /**
   * Phase 3: Design controlled experiment
   * @param {string} hypothesis - The hypothesis to test
   */
  async designExperiment(hypothesis) {
    const step = this.addStep('experiment_design',
      'Creating detailed experimental plan with controls and measurements...',
      null
    );

    const variablesContext = `
VARIABLES:
- Independent: ${this.variables.independent.join(', ') || 'Not specified'}
- Dependent: ${this.variables.dependent.join(', ') || 'Not specified'}
- Controlled: ${this.variables.controlled.join(', ') || 'Not specified'}`;

    const prompt = `Design a rigorous experiment to test this hypothesis.

HYPOTHESIS: ${hypothesis}
${variablesContext}

CURRENT WORKING DIRECTORY: ${this.context.cwd}

Your experimental design should include:

1. EXPERIMENTAL SETUP:
   - Control group (baseline condition)
   - Experimental group(s) (test conditions)
   - Sample size (number of trials/runs)
   - Randomization approach (if applicable)

2. PROCEDURE (step-by-step):
   - Exact commands to run for each condition
   - Environment setup requirements
   - Data collection methods
   - Measurement timing

3. MEASUREMENT PLAN:
   - What metrics to collect
   - How to collect them (commands, tools)
   - Expected data format
   - Statistical analysis approach

4. CONTROLS:
   - How to ensure controlled variables stay constant
   - Potential confounding factors to watch for
   - Validation checks

Provide concrete, executable commands in code blocks where applicable.`;

    try {
      const response = await this.promptLLM(prompt);

      // Extract commands from code blocks
      const commandMatches = response.matchAll(/```(?:bash|sh)?\n(.*?)```/gs);
      const commands = [];
      for (const match of commandMatches) {
        commands.push(match[1].trim());
      }

      this.experimentPlan = {
        design: response,
        commands,
        controlGroup: this.extractControlGroup(response),
        experimentalGroup: this.extractExperimentalGroup(response)
      };

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.85
      });

      this.state.context.experimentPlan = this.experimentPlan;

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
   * Extract control group description from experiment design
   * @param {string} response - Experiment design text
   * @returns {string|null} Control group description
   */
  extractControlGroup(response) {
    const controlMatch = response.match(/Control group[^:]*:\s*([^\n]+)/i);
    return controlMatch ? controlMatch[1].trim() : null;
  }

  /**
   * Extract experimental group description from experiment design
   * @param {string} response - Experiment design text
   * @returns {string|null} Experimental group description
   */
  extractExperimentalGroup(response) {
    const expMatch = response.match(/Experimental group[^:]*:\s*([^\n]+)/i);
    return expMatch ? expMatch[1].trim() : null;
  }

  /**
   * Phase 4: Execute the experiment
   * @param {Object} experimentPlan - The designed experiment
   */
  async executeExperiment(experimentPlan) {
    const step = this.addStep('execution',
      'Running experiment and collecting data...',
      null
    );

    if (!experimentPlan || !experimentPlan.commands || experimentPlan.commands.length === 0) {
      // No commands to execute - this might be a theoretical experiment
      const manualPrompt = `The experimental plan doesn't include executable commands. This appears to be a manual or observational experiment.

EXPERIMENT PLAN:
${experimentPlan.design}

Guide the user through:
1. What manual steps they need to perform
2. What data to collect and how
3. How to record observations
4. Safety checks or precautions

Provide a clear checklist format.`;

      try {
        const response = await this.promptLLM(manualPrompt);
        this.results = {
          type: 'manual',
          instructions: response,
          data: null
        };

        this.updateStep(step.id, {
          result: {
            success: true,
            output: response
          },
          confidence: 0.6
        });

        this.state.context.results = this.results;
        return;
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

    // Execute commands
    const executionResults = [];
    let allSucceeded = true;

    for (let i = 0; i < experimentPlan.commands.length; i++) {
      const command = experimentPlan.commands[i];
      const commandStep = this.addStep('execution',
        `Executing step ${i + 1}/${experimentPlan.commands.length}: ${command}`,
        command
      );

      try {
        const result = this.executeCommand(command, 60000); // 60 second timeout
        executionResults.push({
          command,
          success: result.success,
          output: result.output
        });

        this.updateStep(commandStep.id, {
          result,
          confidence: result.success ? 0.8 : 0.4
        });

        if (!result.success) {
          allSucceeded = false;
        }
      } catch (error) {
        executionResults.push({
          command,
          success: false,
          output: error.message
        });
        allSucceeded = false;

        this.updateStep(commandStep.id, {
          result: {
            success: false,
            output: error.message
          },
          confidence: 0.2
        });
      }
    }

    this.results = {
      type: 'automated',
      executionResults,
      allSucceeded,
      rawData: executionResults.map(r => r.output).join('\n\n')
    };

    this.updateStep(step.id, {
      result: {
        success: allSucceeded,
        output: allSucceeded ?
          'Experiment completed successfully. Data collected.' :
          'Experiment partially completed. Some steps failed.'
      },
      confidence: allSucceeded ? 0.85 : 0.5
    });

    this.state.context.results = this.results;
  }

  /**
   * Phase 5: Analyze experimental results
   * @param {Object} results - The experimental results
   */
  async analyzeResults(results) {
    const step = this.addStep('analysis',
      'Analyzing experimental data and comparing to hypothesis...',
      null
    );

    const resultsContext = results.type === 'manual'
      ? `MANUAL EXPERIMENT:\n${results.instructions}`
      : `EXPERIMENTAL DATA:\n${results.rawData}`;

    const prompt = `Analyze these experimental results scientifically.

HYPOTHESIS: ${this.hypothesis}

${resultsContext}

ANALYSIS REQUIREMENTS:

1. DATA SUMMARY:
   - What was measured
   - Key observations
   - Quantitative results (numbers, percentages, times)

2. STATISTICAL ANALYSIS:
   - Compare control vs experimental groups
   - Calculate differences/improvements
   - Assess statistical significance (if applicable)
   - Identify patterns or trends

3. HYPOTHESIS EVALUATION:
   - Does data support or refute the hypothesis?
   - How strong is the evidence?
   - Were results consistent or variable?

4. CONFOUNDING FACTORS:
   - Did anything unexpected happen?
   - Were controls maintained properly?
   - Any sources of error or bias?

5. DATA QUALITY:
   - Is the sample size adequate?
   - Are measurements reliable?
   - Any outliers or anomalies?

Be objective and data-driven in your analysis.`;

    try {
      const response = await this.promptLLM(prompt);

      this.analysis = {
        fullAnalysis: response,
        supportsHypothesis: this.determineSupportForHypothesis(response)
      };

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.8
      });

      this.state.context.analysis = this.analysis;

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
   * Determine if analysis supports the hypothesis
   * @param {string} analysisText - The analysis text
   * @returns {boolean|null} True if supported, false if refuted, null if unclear
   */
  determineSupportForHypothesis(analysisText) {
    const lowerText = analysisText.toLowerCase();

    const supportIndicators = [
      'supports the hypothesis',
      'confirms',
      'validates',
      'consistent with',
      'agrees with',
      'evidence supports'
    ];

    const refuteIndicators = [
      'refutes the hypothesis',
      'contradicts',
      'does not support',
      'inconsistent with',
      'evidence against',
      'rejects'
    ];

    const supportCount = supportIndicators.filter(ind => lowerText.includes(ind)).length;
    const refuteCount = refuteIndicators.filter(ind => lowerText.includes(ind)).length;

    if (supportCount > refuteCount) return true;
    if (refuteCount > supportCount) return false;
    return null;
  }

  /**
   * Phase 6: Draw conclusion and answer research question
   * @param {Object} analysis - The experimental analysis
   */
  async drawConclusion(analysis) {
    const step = this.addStep('conclusion',
      'Drawing final conclusions and answering research question...',
      null
    );

    const prompt = `Based on the complete scientific investigation, provide a clear conclusion.

RESEARCH QUESTION: ${this.researchQuestion}

HYPOTHESIS: ${this.hypothesis}

ANALYSIS SUMMARY:
${analysis.fullAnalysis}

Provide:

1. DIRECT ANSWER:
   [Clear, concise answer to the research question]

2. CONCLUSION:
   - Was the hypothesis supported or refuted?
   - What did we learn?
   - Key findings

3. CONFIDENCE LEVEL:
   [High/Medium/Low] - Based on data quality, sample size, and consistency

4. LIMITATIONS:
   - What could have been better?
   - What questions remain?
   - Potential sources of error

5. RECOMMENDATIONS:
   - Actionable next steps based on findings
   - Should we adopt the experimental approach?
   - What further experiments might be needed?

6. GENERALIZABILITY:
   - Do these results apply to other contexts?
   - What are the boundaries of this conclusion?`;

    try {
      const response = await this.promptLLM(prompt);

      // Extract direct answer
      const answerMatch = response.match(/DIRECT ANSWER:\s*\n*([^\n]+)/i);
      this.conclusion = answerMatch ? answerMatch[1].trim() : response.split('\n')[0];

      // Extract confidence level
      const confidenceMatch = response.match(/CONFIDENCE LEVEL:\s*\n*([^\n]+)/i);
      const confidenceText = confidenceMatch ? confidenceMatch[1].toLowerCase() : '';

      let confidenceScore = 0.7;
      if (confidenceText.includes('high')) confidenceScore = 0.9;
      else if (confidenceText.includes('low')) confidenceScore = 0.5;

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: confidenceScore
      });

      this.state.context.conclusion = this.conclusion;
      this.state.context.solution = {
        answer: this.conclusion,
        hypothesis: this.hypothesis,
        supported: analysis.supportsHypothesis,
        fullConclusion: response
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
    return `You are an expert scientist using the Scientific Method to conduct rigorous experiments.

METHODOLOGY:
1. Question: Define clear, testable research questions
2. Hypothesis: Make specific, falsifiable predictions
3. Experiment Design: Create controlled tests with proper variables
4. Execution: Run experiments and collect data systematically
5. Analysis: Interpret results objectively with statistical rigor
6. Conclusion: Answer questions based on evidence

CURRENT WORKING DIRECTORY: ${this.context.cwd}

PHASES: ${this.getPhases().join(' → ')}

PRINCIPLES:
- Be objective and evidence-based
- Control variables rigorously
- Use quantitative measurements when possible
- Distinguish correlation from causation
- Acknowledge limitations and uncertainty
- Make falsifiable predictions
- Let data guide conclusions, not assumptions

Your goal is to answer the research question through systematic experimentation and analysis.`;
  }
}

module.exports = ScientificMethodFramework;
