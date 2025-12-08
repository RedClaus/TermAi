const BaseFramework = require('./BaseFramework');

/**
 * FirstPrinciplesFramework - Breaks down problems to fundamental truths and reasons up
 *
 * Implements First Principles Thinking:
 * 1. Assumption Extraction - Identify all hidden assumptions in the problem
 * 2. Assumption Challenge - Question validity of each assumption
 * 3. Fundamental Discovery - Identify irreducible fundamental truths
 * 4. Derivation - Build solution from fundamentals only
 *
 * Best for:
 * - Architecture decisions
 * - Design questions
 * - Best practices evaluation
 * - Approach selection
 * - Breaking through conventional thinking
 * - Innovation and optimization
 *
 * This is a NON-ITERATIVE framework (runs once through all phases).
 */

class FirstPrinciplesFramework extends BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   */
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    // Framework state
    this.assumptions = [];
    this.challenged = [];
    this.fundamentals = [];
    this.derivedSolutions = [];
    this.alternatives = [];
    this.tradeoffs = {};
  }

  getName() {
    return 'first_principles';
  }

  getPhases() {
    return [
      'assumption_extraction',
      'assumption_challenge',
      'fundamental_discovery',
      'derivation'
    ];
  }

  getFrameworkSystemPrompt() {
    return `You are an expert critical thinker using FIRST PRINCIPLES THINKING to solve problems from the ground up.

Your current working directory is: ${this.context.cwd}

Framework Phases:
1. ASSUMPTION EXTRACTION - Identify ALL hidden assumptions (technical, contextual, conventional wisdom)
2. ASSUMPTION CHALLENGE - Question each assumption's validity (Why is this true? Is it always true?)
3. FUNDAMENTAL DISCOVERY - Find irreducible truths that cannot be broken down further
4. DERIVATION - Build solution from fundamentals ONLY (ignore analogies and conventions)

Critical Guidelines:
- Question EVERYTHING - even "obvious" truths may be assumptions
- Don't accept industry best practices without examining their foundations
- Identify the difference between "true" and "conventional"
- Break down to physics, mathematics, and logic where possible
- Build solutions from scratch using only proven fundamentals
- Consider multiple alternative approaches derived from same fundamentals
- Analyze trade-offs objectively without bias toward current methods

Your goal is to find the BEST solution, not the CONVENTIONAL solution.`;
  }

  /**
   * Execute the first principles thinking framework
   * @param {string} problem - The problem/question to analyze
   * @returns {Promise<Object>} FrameworkResult with fundamental analysis
   */
  async execute(problem) {
    this.state.framework = this.getName();
    this.state.phase = 'init';
    this.state.status = 'active';

    try {
      // Phase 1: Extract Assumptions
      const step1 = this.addStep(
        'assumption_extraction',
        'Identifying all hidden assumptions in the problem statement...',
        null
      );
      const assumptions = await this.extractAssumptions(problem);
      this.assumptions = assumptions;

      this.updateStep(step1.id, {
        result: {
          success: true,
          output: `Identified ${assumptions.length} assumptions (${assumptions.filter(a => a.type === 'hidden').length} hidden, ${assumptions.filter(a => a.type === 'explicit').length} explicit)`
        },
        confidence: 0.85
      });

      // Phase 2: Challenge Assumptions
      const step2 = this.addStep(
        'assumption_challenge',
        'Challenging validity of each assumption...',
        null
      );
      const challenged = await this.challengeAssumptions(assumptions);
      this.challenged = challenged;

      const validCount = challenged.filter(c => c.validity === 'valid').length;
      const invalidCount = challenged.filter(c => c.validity === 'invalid').length;
      const questionableCount = challenged.filter(c => c.validity === 'questionable').length;

      this.updateStep(step2.id, {
        result: {
          success: true,
          output: `Challenged ${challenged.length} assumptions: ${validCount} valid, ${invalidCount} invalid, ${questionableCount} questionable`
        },
        confidence: 0.9
      });

      // Phase 3: Discover Fundamentals
      const step3 = this.addStep(
        'fundamental_discovery',
        'Identifying irreducible fundamental truths...',
        null
      );
      const fundamentals = await this.discoverFundamentals(problem, challenged);
      this.fundamentals = fundamentals;

      this.updateStep(step3.id, {
        result: {
          success: true,
          output: `Discovered ${fundamentals.length} fundamental truths that form the foundation`
        },
        confidence: 0.9
      });

      // Phase 4: Derive Solutions
      const step4 = this.addStep(
        'derivation',
        'Building solutions from fundamental truths only...',
        null
      );
      const derivation = await this.deriveSolutions(problem, fundamentals);
      this.derivedSolutions = derivation.solutions;
      this.alternatives = derivation.alternatives;
      this.tradeoffs = derivation.tradeoffs;

      this.updateStep(step4.id, {
        result: {
          success: true,
          output: `Derived ${derivation.solutions.length} solutions with ${derivation.alternatives.length} alternative approaches`
        },
        confidence: 0.85
      });

      // Determine recommended solution
      const recommended = this.selectRecommendedSolution(derivation);

      this.state.status = 'complete';
      this.state.context = {
        assumptions: this.assumptions,
        challenged: this.challenged,
        fundamentals: this.fundamentals,
        solutions: this.derivedSolutions,
        alternatives: this.alternatives,
        tradeoffs: this.tradeoffs,
        recommended
      };

      return this.getResult();

    } catch (error) {
      this.state.status = 'failed';
      this.addStep('error', `First principles analysis failed: ${error.message}`, null);
      throw error;
    }
  }

  /**
   * Extract assumptions from problem statement (Phase 1)
   * @param {string} problem - The problem to analyze
   * @returns {Promise<Array>} List of identified assumptions
   */
  async extractAssumptions(problem) {
    const prompt = `You are extracting ALL ASSUMPTIONS from the following problem statement. Assumptions are things we take for granted as true without proof.

PROBLEM: ${problem}

Context:
- Working directory: ${this.context.cwd}

Identify assumptions in these categories:

1. TECHNICAL ASSUMPTIONS
   - Technology choices (why this language/framework/tool?)
   - Architecture patterns (why this design?)
   - Performance requirements (why these metrics?)
   - Scalability needs (why this scale?)

2. CONTEXTUAL ASSUMPTIONS
   - User needs (what problem are we really solving?)
   - Business constraints (are these real or perceived?)
   - Resource limitations (are these truly fixed?)
   - Timeline constraints (why this deadline?)

3. CONVENTIONAL WISDOM
   - Industry best practices (why is this "best"?)
   - Common patterns (why does everyone do it this way?)
   - Standard approaches (what makes this "standard"?)
   - Popular opinions (is popularity the same as correctness?)

4. HIDDEN ASSUMPTIONS
   - Unstated requirements
   - Implicit constraints
   - Taken-for-granted truths
   - Background beliefs

For each assumption, provide:
ASSUMPTION: [Clear statement of what is being assumed]
TYPE: [technical|contextual|conventional|hidden]
SOURCE: [Where does this assumption come from?]
IMPACT: [How does this assumption constrain the solution?]

Be thorough - find 8-15 assumptions. Question everything.`;

    const response = await this.promptLLM(prompt);

    // Parse assumptions
    const assumptions = this.parseAssumptions(response);

    return assumptions;
  }

  /**
   * Parse assumptions from LLM response
   * @param {string} response - LLM response text
   * @returns {Array} Structured assumptions
   */
  parseAssumptions(response) {
    const assumptions = [];
    const blocks = response.split(/ASSUMPTION:/i).slice(1);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const assumption = {
        statement: lines[0]?.trim() || 'Unknown assumption',
        type: 'hidden',
        source: '',
        impact: ''
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.match(/^TYPE:/i)) {
          const typeMatch = trimmed.match(/TYPE:\s*(technical|contextual|conventional|hidden)/i);
          if (typeMatch) {
            assumption.type = typeMatch[1].toLowerCase();
          }
        } else if (trimmed.match(/^SOURCE:/i)) {
          assumption.source = trimmed.replace(/^SOURCE:\s*/i, '').trim();
        } else if (trimmed.match(/^IMPACT:/i)) {
          assumption.impact = trimmed.replace(/^IMPACT:\s*/i, '').trim();
        }
      }

      if (assumption.statement && assumption.source) {
        assumptions.push(assumption);
      }
    }

    return assumptions;
  }

  /**
   * Challenge each assumption's validity (Phase 2)
   * @param {Array} assumptions - Extracted assumptions
   * @returns {Promise<Array>} Challenged assumptions with validity assessment
   */
  async challengeAssumptions(assumptions) {
    const prompt = `You are CHALLENGING each assumption to determine if it's truly necessary or just conventional thinking.

For each assumption, ask:
1. WHY is this true? What's the actual reason?
2. Is this ALWAYS true, or only in certain contexts?
3. What happens if we REMOVE this assumption?
4. Is this a fundamental constraint or just habit/convention?
5. Can we prove this from first principles, or is it just belief?

ASSUMPTIONS TO CHALLENGE:
${assumptions.map((a, i) => `${i + 1}. ${a.statement}\n   Type: ${a.type}\n   Source: ${a.source}`).join('\n\n')}

Context: ${this.context.cwd}

For each assumption, respond with:
CHALLENGE [number]:
VALIDITY: [valid|invalid|questionable]
REASONING: [Why is this necessary or not? What's the proof?]
ALTERNATIVE: [What if we remove this assumption? What becomes possible?]
VERDICT: [Keep, Remove, or Replace with something more fundamental]

Be ruthlessly logical. Question even "obvious" truths.`;

    const response = await this.promptLLM(prompt);

    // Parse challenged assumptions
    const challenged = this.parseChallengedAssumptions(response, assumptions);

    return challenged;
  }

  /**
   * Parse challenged assumptions from LLM response
   * @param {string} response - LLM response
   * @param {Array} assumptions - Original assumptions
   * @returns {Array} Challenged assumptions with validity
   */
  parseChallengedAssumptions(response, assumptions) {
    const challenged = [];
    const blocks = response.split(/CHALLENGE\s+\d+:/i).slice(1);

    for (let i = 0; i < blocks.length && i < assumptions.length; i++) {
      const block = blocks[i];
      const assumption = assumptions[i];

      let validity = 'questionable';
      let reasoning = '';
      let alternative = '';
      let verdict = 'Keep';

      // Extract validity
      const validityMatch = block.match(/VALIDITY:\s*(valid|invalid|questionable)/i);
      if (validityMatch) {
        validity = validityMatch[1].toLowerCase();
      }

      // Extract reasoning
      const reasoningMatch = block.match(/REASONING:\s*(.+?)(?=\nALTERNATIVE:|$)/is);
      if (reasoningMatch) {
        reasoning = reasoningMatch[1].trim();
      }

      // Extract alternative
      const altMatch = block.match(/ALTERNATIVE:\s*(.+?)(?=\nVERDICT:|$)/is);
      if (altMatch) {
        alternative = altMatch[1].trim();
      }

      // Extract verdict
      const verdictMatch = block.match(/VERDICT:\s*(.+?)(?=\n\n|$)/is);
      if (verdictMatch) {
        verdict = verdictMatch[1].trim();
      }

      challenged.push({
        ...assumption,
        validity,
        reasoning,
        alternative,
        verdict
      });
    }

    return challenged;
  }

  /**
   * Discover fundamental truths (Phase 3)
   * @param {string} problem - Original problem
   * @param {Array} challenged - Challenged assumptions
   * @returns {Promise<Array>} Fundamental truths
   */
  async discoverFundamentals(problem, challenged) {
    // Filter to only valid/necessary assumptions and their alternatives
    const validAssumptions = challenged.filter(c => c.validity === 'valid');
    const removedAssumptions = challenged.filter(c => c.validity === 'invalid' || c.validity === 'questionable');

    const prompt = `You are identifying FUNDAMENTAL TRUTHS - irreducible facts that cannot be broken down further.

PROBLEM: ${problem}

Valid constraints we must work with:
${validAssumptions.map((a, i) => `${i + 1}. ${a.statement}\n   Reasoning: ${a.reasoning}`).join('\n\n')}

Removed/questionable assumptions (new possibilities):
${removedAssumptions.map((a, i) => `${i + 1}. ${a.statement}\n   Alternative: ${a.alternative}`).join('\n\n')}

Now identify FUNDAMENTAL TRUTHS that are:
1. Provable from physics, mathematics, or logic
2. Cannot be broken down into simpler truths
3. Universal (not context-dependent)
4. Necessary constraints (not optional preferences)

Categories of fundamentals:
- Physical laws (speed of light, conservation of energy, etc.)
- Mathematical truths (computation complexity, information theory)
- Logical constraints (causality, consistency)
- Resource realities (time, space, energy)
- Human factors (cognitive limits, biological needs)

For each fundamental, provide:
FUNDAMENTAL: [Clear statement of the irreducible truth]
CATEGORY: [physical|mathematical|logical|resource|human]
PROOF: [Why is this fundamental and irreducible?]
RELEVANCE: [How does this constrain or enable the solution?]

Find 5-10 fundamentals. Focus on what's TRULY foundational, not just "important".`;

    const response = await this.promptLLM(prompt);

    // Parse fundamentals
    const fundamentals = this.parseFundamentals(response);

    return fundamentals;
  }

  /**
   * Parse fundamental truths from LLM response
   * @param {string} response - LLM response
   * @returns {Array} Fundamental truths
   */
  parseFundamentals(response) {
    const fundamentals = [];
    const blocks = response.split(/FUNDAMENTAL:/i).slice(1);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const fundamental = {
        statement: lines[0]?.trim() || 'Unknown fundamental',
        category: 'logical',
        proof: '',
        relevance: ''
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.match(/^CATEGORY:/i)) {
          const catMatch = trimmed.match(/CATEGORY:\s*(physical|mathematical|logical|resource|human)/i);
          if (catMatch) {
            fundamental.category = catMatch[1].toLowerCase();
          }
        } else if (trimmed.match(/^PROOF:/i)) {
          fundamental.proof = trimmed.replace(/^PROOF:\s*/i, '').trim();
        } else if (trimmed.match(/^RELEVANCE:/i)) {
          fundamental.relevance = trimmed.replace(/^RELEVANCE:\s*/i, '').trim();
        }
      }

      if (fundamental.statement && fundamental.proof) {
        fundamentals.push(fundamental);
      }
    }

    return fundamentals;
  }

  /**
   * Derive solutions from fundamentals (Phase 4)
   * @param {string} problem - Original problem
   * @param {Array} fundamentals - Discovered fundamentals
   * @returns {Promise<Object>} Derived solutions, alternatives, and tradeoffs
   */
  async deriveSolutions(problem, fundamentals) {
    const prompt = `You are building solutions FROM SCRATCH using ONLY the fundamental truths identified. Ignore conventions, best practices, and analogies.

PROBLEM: ${problem}

FUNDAMENTAL TRUTHS:
${fundamentals.map((f, i) => `${i + 1}. [${f.category.toUpperCase()}] ${f.statement}\n   Proof: ${f.proof}\n   Relevance: ${f.relevance}`).join('\n\n')}

Now derive solutions using ONLY these fundamentals:

1. PRIMARY SOLUTION - The most direct solution from fundamentals
   Format:
   SOLUTION: [Title]
   APPROACH: [How it works, built from fundamentals]
   REASONING: [Why this emerges from the fundamentals]
   REQUIREMENTS: [What's needed to implement this]
   ADVANTAGES: [Why this is optimal from first principles]
   LIMITATIONS: [Fundamental constraints, not implementation details]

2. ALTERNATIVE APPROACHES - Other valid solutions from same fundamentals
   Format:
   ALTERNATIVE: [Title]
   APPROACH: [Different way to combine fundamentals]
   TRADEOFFS: [What's gained vs lost compared to primary]
   WHEN_BETTER: [Contexts where this is superior]

Generate 1 primary solution and 2-4 alternatives. Each must be derived ONLY from fundamentals.

3. TRADE-OFF ANALYSIS
   Compare all approaches across:
   - Complexity (fundamental, not implementation)
   - Performance (from fundamental limits)
   - Flexibility (from first principles)
   - Resource usage (from resource fundamentals)
   - Maintainability (from human cognitive fundamentals)

Be innovative - the best solution might be completely different from current approaches.`;

    const response = await this.promptLLM(prompt);

    // Parse solutions and alternatives
    const derivation = this.parseDerivation(response);

    return derivation;
  }

  /**
   * Parse derived solutions from LLM response
   * @param {string} response - LLM response
   * @returns {Object} Solutions, alternatives, and tradeoffs
   */
  parseDerivation(response) {
    const derivation = {
      solutions: [],
      alternatives: [],
      tradeoffs: {}
    };

    // Parse primary solution
    const solutionMatch = response.match(/SOLUTION:\s*(.+?)\n\s*APPROACH:\s*(.+?)(?:\n\s*REASONING:\s*(.+?))?(?:\n\s*REQUIREMENTS:\s*(.+?))?(?:\n\s*ADVANTAGES:\s*(.+?))?(?:\n\s*LIMITATIONS:\s*(.+?))?(?=\n\n|\nALTERNATIVE:|$)/is);
    if (solutionMatch) {
      derivation.solutions.push({
        title: solutionMatch[1]?.trim() || 'Primary Solution',
        approach: solutionMatch[2]?.trim() || '',
        reasoning: solutionMatch[3]?.trim() || '',
        requirements: solutionMatch[4]?.trim() || '',
        advantages: solutionMatch[5]?.trim() || '',
        limitations: solutionMatch[6]?.trim() || '',
        isPrimary: true
      });
    }

    // Parse alternatives
    const altMatches = response.matchAll(/ALTERNATIVE:\s*(.+?)\n\s*APPROACH:\s*(.+?)(?:\n\s*TRADEOFFS:\s*(.+?))?(?:\n\s*WHEN_BETTER:\s*(.+?))?(?=\n\n|\nALTERNATIVE:|\nTRADE-OFF|$)/gis);
    for (const match of altMatches) {
      derivation.alternatives.push({
        title: match[1]?.trim() || 'Alternative Approach',
        approach: match[2]?.trim() || '',
        tradeoffs: match[3]?.trim() || '',
        whenBetter: match[4]?.trim() || '',
        isPrimary: false
      });
    }

    // Parse trade-off analysis
    const tradeoffSection = response.match(/TRADE-OFF ANALYSIS[\s\S]*?(?:Complexity|Performance|Flexibility|Resource|Maintainability)[\s\S]*?(?=\n\n|$)/i);
    if (tradeoffSection) {
      const text = tradeoffSection[0];
      derivation.tradeoffs = {
        complexity: this.extractTradeoffMetric(text, 'Complexity'),
        performance: this.extractTradeoffMetric(text, 'Performance'),
        flexibility: this.extractTradeoffMetric(text, 'Flexibility'),
        resources: this.extractTradeoffMetric(text, 'Resource'),
        maintainability: this.extractTradeoffMetric(text, 'Maintainability')
      };
    }

    return derivation;
  }

  /**
   * Extract trade-off metric from text
   * @param {string} text - Trade-off section text
   * @param {string} metric - Metric name
   * @returns {string} Extracted analysis
   */
  extractTradeoffMetric(text, metric) {
    const regex = new RegExp(`${metric}[^:]*:?\\s*(.+?)(?=\\n\\s*(?:Complexity|Performance|Flexibility|Resource|Maintainability)|$)`, 'is');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * Select recommended solution from derivations
   * @param {Object} derivation - All derived solutions
   * @returns {Object} Recommended solution with reasoning
   */
  selectRecommendedSolution(derivation) {
    // Primary solution is usually recommended, but include full context
    const primary = derivation.solutions[0];
    const alternativeCount = derivation.alternatives.length;

    return {
      solution: primary,
      reasoning: `Primary solution derived from fundamental truths. ${alternativeCount} alternative approaches available with different trade-offs.`,
      confidence: 0.85,
      considerAlternatives: alternativeCount > 0,
      nextSteps: this.generateImplementationSteps(primary)
    };
  }

  /**
   * Generate implementation steps from solution
   * @param {Object} solution - The solution to implement
   * @returns {Array} Implementation steps
   */
  generateImplementationSteps(solution) {
    const steps = [];

    if (solution.requirements) {
      steps.push(`Verify requirements: ${solution.requirements}`);
    }

    steps.push('Implement solution based on fundamental approach');

    if (solution.limitations) {
      steps.push(`Be aware of limitations: ${solution.limitations}`);
    }

    steps.push('Validate against fundamental truths');
    steps.push('Compare with alternative approaches if needed');

    return steps;
  }

  /**
   * Override getResult to include first principles specific data
   * @returns {Object} Enhanced FrameworkResult
   */
  getResult() {
    const baseResult = super.getResult();

    const primary = this.derivedSolutions[0];
    const summary = primary
      ? `${primary.title}: ${primary.approach.substring(0, 200)}...`
      : 'First principles analysis complete';

    return {
      ...baseResult,
      summary,
      solution: {
        assumptions: {
          identified: this.assumptions,
          challenged: this.challenged,
          invalidated: this.challenged.filter(c => c.validity === 'invalid').length
        },
        fundamentals: this.fundamentals,
        primary: this.derivedSolutions[0] || null,
        alternatives: this.alternatives,
        tradeoffs: this.tradeoffs,
        recommended: this.state.context.recommended
      },
      nextSteps: this.state.context.recommended?.nextSteps || [
        'Review derived solutions and alternatives',
        'Select approach based on specific context',
        'Implement using fundamental principles',
        'Validate against fundamental truths'
      ],
      metadata: {
        ...baseResult.metadata,
        assumptionsIdentified: this.assumptions.length,
        assumptionsInvalidated: this.challenged.filter(c => c.validity === 'invalid').length,
        fundamentalsDiscovered: this.fundamentals.length,
        solutionsGenerated: this.derivedSolutions.length + this.alternatives.length,
        isIterative: false
      }
    };
  }
}

module.exports = FirstPrinciplesFramework;
