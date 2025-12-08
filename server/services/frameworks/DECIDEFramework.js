const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * DECIDEFramework - Structured decision-making for evaluating multiple options
 *
 * Implements the DECIDE framework (Define, Establish, Consider, Identify, Develop, Evaluate)
 * for systematic evaluation of alternatives when choosing between tools, approaches, or solutions.
 *
 * @extends BaseFramework
 */
class DECIDEFramework extends BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   */
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    this.definition = FRAMEWORK_DEFINITIONS.decide;

    // State tracking
    this.decisionStatement = null;   // Clarified decision to make
    this.criteria = [];               // Decision criteria with weights
    this.alternatives = [];           // List of options to evaluate
    this.evaluations = [];            // Pros/cons/scoring for each alternative
    this.recommendation = null;       // Final recommended option
    this.evaluation = null;           // Quality assessment of the decision
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  getName() {
    return 'decide';
  }

  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the DECIDE framework analysis
   * @param {string} problem - The decision problem or choice to make
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    try {
      this.state.context.problem = problem;

      // Phase 1: Define the decision
      await this.defineDecision(problem);

      // Phase 2: Establish criteria
      await this.establishCriteria(this.decisionStatement);

      // Phase 3: Consider alternatives
      await this.considerAlternatives(this.decisionStatement);

      // Phase 4: Identify pros/cons
      await this.identifyProsAndCons(this.alternatives);

      // Phase 5: Develop recommendation
      await this.developRecommendation(this.evaluations);

      // Phase 6: Evaluate decision quality
      await this.evaluateDecision(this.recommendation);

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
   * Phase 1: Define and clarify the decision to be made
   * @param {string} problem - Raw problem statement
   */
  async defineDecision(problem) {
    const step = this.addStep('define',
      'Clarifying the decision statement and framing the choice clearly...',
      null
    );

    const prompt = `You are helping someone make a decision using the DECIDE framework.

PROBLEM: ${problem}

Your task is to clarify and frame this as a clear decision statement.

A good decision statement:
- ✓ Is specific and actionable
- ✓ Clearly states what needs to be chosen
- ✓ Includes relevant constraints (budget, time, technical requirements)
- ✓ Defines success criteria implicitly
- ✗ Avoids vague language like "improve" or "optimize" without specifics
- ✗ Does not presuppose a solution

Format your response as:

DECISION STATEMENT:
[A clear, single-sentence statement of the decision to be made]

CONTEXT:
[Key constraints, requirements, or background information that affects this decision]

STAKEHOLDERS:
[Who is affected by this decision? What are their concerns?]

Example:
DECISION STATEMENT: Choose a frontend framework for a new web application that handles real-time data updates with 10,000+ concurrent users.
CONTEXT: Team has React experience, budget allows for learning time, need deployment within 3 months.
STAKEHOLDERS: Development team (learning curve), users (performance), management (time-to-market).`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse the decision statement
      const statementMatch = response.match(/DECISION STATEMENT:\s*\n*([^\n]+(?:\n(?!CONTEXT:|STAKEHOLDERS:)[^\n]+)*)/i);
      if (statementMatch) {
        this.decisionStatement = statementMatch[1].trim();
      } else {
        // Fallback: use the entire response
        this.decisionStatement = response.trim();
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.8
      });

      this.state.context.decisionStatement = this.decisionStatement;

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
   * Phase 2: Establish decision criteria with weights
   * @param {string} decisionStatement - The clarified decision
   */
  async establishCriteria(decisionStatement) {
    const step = this.addStep('establish',
      'Establishing decision criteria to evaluate alternatives...',
      null
    );

    const prompt = `Now that we have a clear decision statement, establish the criteria for evaluating options.

DECISION STATEMENT: ${decisionStatement}

ORIGINAL PROBLEM: ${this.state.context.problem}

Your task is to identify 3-7 key criteria that matter for this decision.

For each criterion:
1. Name it clearly
2. Explain why it matters
3. Assign a weight (1-10, where 10 is most critical)
4. Define how to measure it (quantitative or qualitative)

Criteria categories to consider:
- **Performance**: Speed, scalability, efficiency
- **Cost**: Initial cost, ongoing cost, TCO (Total Cost of Ownership)
- **Ease of Use**: Learning curve, developer experience, documentation
- **Compatibility**: Integration with existing systems, platform support
- **Risk**: Maturity, community support, vendor lock-in, future-proofing
- **Features**: Functionality coverage, extensibility, customization
- **Quality**: Reliability, security, maintainability

Format your response as:

CRITERIA:

1. [Criterion Name] (Weight: X/10)
   - Why it matters: [Explanation]
   - How to measure: [Measurement approach]

2. [Criterion Name] (Weight: X/10)
   - Why it matters: [Explanation]
   - How to measure: [Measurement approach]

[etc...]

TOTAL WEIGHT: [Sum of all weights]

MUST-HAVES vs NICE-TO-HAVES:
- Must-haves: [Deal-breaker criteria]
- Nice-to-haves: [Bonus criteria]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse criteria from response
      this.parseCriteria(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.8
      });

      this.state.context.criteria = this.criteria;

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
   * Parse criteria from LLM response
   * @param {string} response - LLM response text
   */
  parseCriteria(response) {
    // Match numbered criteria with weights
    const criteriaRegex = /(\d+)\.\s*([^\(]+)\s*\(Weight:\s*(\d+)(?:\/10)?\)/gi;
    const matches = response.matchAll(criteriaRegex);

    for (const match of matches) {
      const name = match[2].trim();
      const weight = parseInt(match[3]) || 5;

      // Try to extract the "why it matters" and "how to measure" sections
      const criterionText = response.substring(match.index);
      const whyMatch = criterionText.match(/Why it matters:\s*([^\n]+)/i);
      const measureMatch = criterionText.match(/How to measure:\s*([^\n]+)/i);

      this.criteria.push({
        name,
        weight,
        why: whyMatch ? whyMatch[1].trim() : '',
        measurement: measureMatch ? measureMatch[1].trim() : ''
      });
    }

    // Fallback: if no criteria parsed, create generic ones
    if (this.criteria.length === 0) {
      this.criteria = [
        { name: 'Performance', weight: 8, why: 'System speed and responsiveness', measurement: 'Benchmarks, load tests' },
        { name: 'Cost', weight: 7, why: 'Budget constraints', measurement: 'Total cost of ownership' },
        { name: 'Ease of Use', weight: 6, why: 'Developer productivity', measurement: 'Learning curve, documentation quality' },
        { name: 'Compatibility', weight: 7, why: 'Integration requirements', measurement: 'API compatibility, platform support' },
        { name: 'Risk', weight: 8, why: 'Long-term viability', measurement: 'Community size, update frequency, vendor stability' }
      ];
    }
  }

  /**
   * Phase 3: Consider and list all viable alternatives
   * @param {string} decisionStatement - The clarified decision
   */
  async considerAlternatives(decisionStatement) {
    const step = this.addStep('consider',
      'Generating a comprehensive list of viable alternatives...',
      null
    );

    const prompt = `Now generate a list of ALL viable alternatives for this decision.

DECISION STATEMENT: ${decisionStatement}

ORIGINAL PROBLEM: ${this.state.context.problem}

CRITERIA TO SATISFY:
${this.criteria.map(c => `- ${c.name} (Weight: ${c.weight}/10): ${c.why}`).join('\n')}

Your task is to list 3-8 distinct alternatives that could potentially solve this problem.

For each alternative:
1. Name it clearly
2. Provide a brief description (1-2 sentences)
3. Note its primary differentiator (what makes it unique)
4. Identify any obvious dealbreakers or constraints

Include:
- Popular/mainstream options
- Emerging/innovative options
- "Do nothing" or "status quo" if applicable
- Custom/build-it-yourself option if relevant

Format your response as:

ALTERNATIVES:

1. **[Alternative Name]**
   - Description: [What it is and what it does]
   - Differentiator: [What makes it unique]
   - Potential dealbreakers: [Any obvious showstoppers or concerns]

2. **[Alternative Name]**
   - Description: [What it is and what it does]
   - Differentiator: [What makes it unique]
   - Potential dealbreakers: [Any obvious showstoppers or concerns]

[etc...]

ALTERNATIVES EXPLICITLY EXCLUDED:
- [Alternative X]: [Reason for exclusion]
- [Alternative Y]: [Reason for exclusion]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse alternatives from response
      this.parseAlternatives(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.75
      });

      this.state.context.alternatives = this.alternatives;

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
   * Parse alternatives from LLM response
   * @param {string} response - LLM response text
   */
  parseAlternatives(response) {
    // Match numbered alternatives with bold names
    const altRegex = /(\d+)\.\s*\*\*([^\*]+)\*\*/g;
    const matches = response.matchAll(altRegex);

    for (const match of matches) {
      const name = match[2].trim();
      const startIndex = match.index;

      // Try to extract description and differentiator
      const altText = response.substring(startIndex);
      const nextAltIndex = altText.search(/\n\d+\.\s*\*\*/);
      const altSection = nextAltIndex > 0 ? altText.substring(0, nextAltIndex) : altText;

      const descMatch = altSection.match(/Description:\s*([^\n]+)/i);
      const diffMatch = altSection.match(/Differentiator:\s*([^\n]+)/i);
      const dealMatch = altSection.match(/(?:Potential )?dealbreakers:\s*([^\n]+)/i);

      this.alternatives.push({
        name,
        description: descMatch ? descMatch[1].trim() : '',
        differentiator: diffMatch ? diffMatch[1].trim() : '',
        dealbreakers: dealMatch ? dealMatch[1].trim() : 'None identified'
      });
    }

    // Fallback: if no alternatives parsed, extract from simple bullet points
    if (this.alternatives.length === 0) {
      const bulletRegex = /[-•*]\s*\*\*([^\*]+)\*\*/g;
      const bulletMatches = response.matchAll(bulletRegex);

      for (const match of bulletMatches) {
        this.alternatives.push({
          name: match[1].trim(),
          description: '',
          differentiator: '',
          dealbreakers: 'None identified'
        });
      }
    }
  }

  /**
   * Phase 4: Identify pros, cons, and score each alternative
   * @param {Array} alternatives - List of alternatives to evaluate
   */
  async identifyProsAndCons(alternatives) {
    const step = this.addStep('identify',
      'Evaluating pros, cons, and scoring each alternative against criteria...',
      null
    );

    const alternativesList = alternatives.map(a => `- ${a.name}: ${a.description}`).join('\n');
    const criteriaList = this.criteria.map(c => `- ${c.name} (Weight: ${c.weight}/10)`).join('\n');

    const prompt = `Now evaluate each alternative against the decision criteria.

DECISION STATEMENT: ${this.decisionStatement}

ALTERNATIVES:
${alternativesList}

CRITERIA:
${criteriaList}

For EACH alternative, provide:
1. **Pros**: 3-5 key strengths
2. **Cons**: 3-5 key weaknesses
3. **Score**: Rate each criterion (0-10 scale)
4. **Weighted Total**: Calculate (criterion_score × criterion_weight) summed across all criteria

Format your response as:

---
ALTERNATIVE 1: [Name]

PROS:
- [Pro 1]
- [Pro 2]
- [Pro 3]

CONS:
- [Con 1]
- [Con 2]
- [Con 3]

SCORES:
${this.criteria.map(c => `- ${c.name}: X/10 (weighted: X × ${c.weight} = XX)`).join('\n')}

TOTAL WEIGHTED SCORE: XXX / ${this.criteria.reduce((sum, c) => sum + (c.weight * 10), 0)}

---
ALTERNATIVE 2: [Name]

[etc...]

---

SCORING NOTES:
[Any important context about the scores, trade-offs, or uncertainties]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse evaluations from response
      this.parseEvaluations(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.85
      });

      this.state.context.evaluations = this.evaluations;

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
   * Parse evaluations (pros/cons/scores) from LLM response
   * @param {string} response - LLM response text
   */
  parseEvaluations(response) {
    // Split by alternative sections (separated by ---)
    const sections = response.split(/---+/).filter(s => s.trim().length > 0);

    for (const section of sections) {
      // Extract alternative name
      const nameMatch = section.match(/ALTERNATIVE\s+\d+:\s*([^\n]+)/i);
      if (!nameMatch) continue;

      const name = nameMatch[1].trim();

      // Extract pros
      const prosMatch = section.match(/PROS:\s*\n((?:[-•*]\s*[^\n]+\n?)+)/i);
      const pros = prosMatch
        ? prosMatch[1].split('\n').filter(p => p.trim().startsWith('-') || p.trim().startsWith('•') || p.trim().startsWith('*'))
            .map(p => p.replace(/^[-•*]\s*/, '').trim())
            .filter(p => p.length > 0)
        : [];

      // Extract cons
      const consMatch = section.match(/CONS:\s*\n((?:[-•*]\s*[^\n]+\n?)+)/i);
      const cons = consMatch
        ? consMatch[1].split('\n').filter(c => c.trim().startsWith('-') || c.trim().startsWith('•') || c.trim().startsWith('*'))
            .map(c => c.replace(/^[-•*]\s*/, '').trim())
            .filter(c => c.length > 0)
        : [];

      // Extract total score
      const scoreMatch = section.match(/TOTAL WEIGHTED SCORE:\s*(\d+)/i);
      const totalScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

      // Extract individual criterion scores
      const scores = {};
      for (const criterion of this.criteria) {
        const criterionRegex = new RegExp(`${criterion.name}:\\s*(\\d+)`, 'i');
        const match = section.match(criterionRegex);
        if (match) {
          scores[criterion.name] = parseInt(match[1]);
        }
      }

      this.evaluations.push({
        alternative: name,
        pros,
        cons,
        scores,
        totalScore
      });
    }

    // Fallback: if no evaluations parsed, create basic structure
    if (this.evaluations.length === 0 && this.alternatives.length > 0) {
      this.evaluations = this.alternatives.map(alt => ({
        alternative: alt.name,
        pros: ['Evaluation pending'],
        cons: ['Evaluation pending'],
        scores: {},
        totalScore: 0
      }));
    }
  }

  /**
   * Phase 5: Develop a recommendation for the best option
   * @param {Array} evaluations - Scored evaluations of alternatives
   */
  async developRecommendation(evaluations) {
    const step = this.addStep('develop',
      'Analyzing scores and developing final recommendation...',
      null
    );

    const evaluationSummary = evaluations
      .map(e => `- ${e.alternative}: ${e.totalScore} points (Pros: ${e.pros.length}, Cons: ${e.cons.length})`)
      .join('\n');

    const prompt = `Based on the evaluation, recommend the best alternative.

DECISION STATEMENT: ${this.decisionStatement}

EVALUATION SUMMARY:
${evaluationSummary}

DETAILED EVALUATIONS:
${evaluations.map(e => `
**${e.alternative}** (Score: ${e.totalScore})
Pros: ${e.pros.join(', ')}
Cons: ${e.cons.join(', ')}
`).join('\n')}

Your task is to:
1. Recommend the BEST alternative
2. Explain why it's the best choice
3. Acknowledge trade-offs and what you're giving up
4. Provide confidence level (0-100%)
5. Suggest when to reconsider this decision

Format your response as:

RECOMMENDED ALTERNATIVE: [Name]

CONFIDENCE: X%

REASONING:
[2-3 paragraphs explaining why this is the best choice, considering the weighted scores,
critical criteria, and overall context. Be specific about which criteria drove the decision.]

TRADE-OFFS ACCEPTED:
- [What are we giving up by not choosing other options?]
- [What weaknesses does this choice have?]

RUNNER-UP: [Alternative name]
- Why it's close: [Brief explanation]
- When to choose it instead: [Conditions under which runner-up would be better]

RECONSIDER IF:
- [Condition 1 that would invalidate this decision]
- [Condition 2 that would invalidate this decision]

IMPLEMENTATION NOTES:
[Any specific considerations for implementing this choice]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse recommendation
      const recMatch = response.match(/RECOMMENDED ALTERNATIVE:\s*([^\n]+)/i);
      if (recMatch) {
        this.recommendation = {
          alternative: recMatch[1].trim(),
          fullResponse: response
        };
      } else {
        // Fallback: recommend highest scored alternative
        const topScored = evaluations.reduce((best, current) =>
          current.totalScore > best.totalScore ? current : best
        );
        this.recommendation = {
          alternative: topScored.alternative,
          fullResponse: response
        };
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.9
      });

      this.state.context.recommendation = this.recommendation;

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
   * Phase 6: Evaluate the quality of the decision-making process
   * @param {Object} recommendation - The final recommendation
   */
  async evaluateDecision(recommendation) {
    const step = this.addStep('evaluate',
      'Evaluating the quality of this decision-making process...',
      null
    );

    const prompt = `Reflect on the quality of this decision-making process.

DECISION STATEMENT: ${this.decisionStatement}

RECOMMENDED ALTERNATIVE: ${recommendation.alternative}

CRITERIA USED: ${this.criteria.length} criteria
ALTERNATIVES CONSIDERED: ${this.alternatives.length} options

Your task is to evaluate the decision process itself (not the outcome):

1. **Decision Quality Score** (0-100): How well did we make this decision?
2. **Completeness**: Did we consider all important alternatives and criteria?
3. **Bias Check**: Any cognitive biases that might have influenced this decision?
4. **Uncertainty**: What are the biggest unknowns or assumptions?
5. **Reversibility**: How hard would it be to change this decision later?

Format your response as:

DECISION QUALITY SCORE: X/100

STRENGTHS OF THIS DECISION PROCESS:
- [Strength 1]
- [Strength 2]
- [Strength 3]

WEAKNESSES / GAPS:
- [Gap 1: what we might have missed]
- [Gap 2: what we might have missed]

COGNITIVE BIASES TO WATCH FOR:
- [Bias 1: e.g., anchoring, confirmation bias, sunk cost fallacy]
- [Bias 2]

KEY ASSUMPTIONS:
- [Assumption 1 that could be wrong]
- [Assumption 2 that could be wrong]

REVERSIBILITY: [High/Medium/Low]
- Explanation: [How hard to reverse, what's locked in]

CONFIDENCE FACTORS:
- What increases confidence: [Factor 1]
- What decreases confidence: [Factor 2]

RECOMMENDED NEXT STEPS:
- [Step 1: e.g., prototype, pilot test, get expert review]
- [Step 2]

DECISION REVIEW DATE:
[When should we revisit this decision? E.g., "After 3 months of use", "When X happens"]`;

    try {
      const response = await this.promptLLM(prompt);

      this.evaluation = response;

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.85
      });

      this.state.context.evaluation = this.evaluation;
      this.state.context.solution = {
        decision: this.decisionStatement,
        recommendation: this.recommendation.alternative,
        reasoning: this.recommendation.fullResponse,
        evaluation: this.evaluation,
        alternatives: this.alternatives,
        criteria: this.criteria
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
    return `You are an expert decision analyst using the DECIDE framework.

METHODOLOGY:
1. Define: Clarify the decision statement
2. Establish: Set weighted criteria for evaluation
3. Consider: List all viable alternatives
4. Identify: Pros, cons, and scores for each option
5. Develop: Recommend the best choice
6. Evaluate: Review decision quality and process

CURRENT WORKING DIRECTORY: ${this.context.cwd}

PHASES: ${this.getPhases().join(' → ')}

PRINCIPLES:
- Be systematic and objective in evaluation
- Consider both quantitative scores and qualitative factors
- Acknowledge trade-offs explicitly
- Identify cognitive biases that might affect the decision
- Make the decision process transparent and reviewable
- Provide actionable recommendations with clear reasoning
- Consider reversibility and future flexibility

Your goal is to help make a well-reasoned decision with full awareness of trade-offs and risks.`;
  }
}

module.exports = DECIDEFramework;
