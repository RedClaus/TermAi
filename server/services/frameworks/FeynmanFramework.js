const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * FeynmanFramework - Simplify complex concepts through teaching
 *
 * The Feynman Technique is a learning and explanation method developed by
 * Nobel Prize-winning physicist Richard Feynman. It works by forcing you to
 * explain a concept in simple terms, which reveals knowledge gaps and unclear
 * thinking. This framework is ideal for documentation, understanding complex
 * systems, and teaching others.
 *
 * Process:
 * 1. Identify the concept that needs to be explained
 * 2. Explain it as if teaching a beginner (simple language, no jargon)
 * 3. Identify gaps where the explanation breaks down
 * 4. Refine using better analogies and simpler language
 *
 * @extends BaseFramework
 */
class FeynmanFramework extends BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   */
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    this.definition = FRAMEWORK_DEFINITIONS.feynman;
    this.maxIterations = this.definition.maxIterations || 3;

    // State tracking
    this.concept = null;              // The core concept identified
    this.simpleExplanation = null;    // First attempt at simple explanation
    this.gaps = [];                   // Identified knowledge/explanation gaps
    this.refinedExplanation = null;   // Final refined explanation
    this.analogies = [];              // Analogies used to explain
    this.iteration = 0;               // Current refinement iteration
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  getName() {
    return 'feynman';
  }

  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the Feynman Technique on a given topic
   * @param {string} topic - The topic or concept to explain/understand
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(topic) {
    try {
      this.state.context.topic = topic;

      // Phase 1: Identify the core concept
      await this.identifyConcept(topic);

      // Phase 2: Create simple explanation (teach to beginner)
      await this.createSimpleExplanation(this.concept);

      // Phase 3: Identify gaps in understanding/explanation
      await this.identifyGaps(this.simpleExplanation);

      // Phase 4: Refine explanation with better analogies
      await this.refineExplanation(this.gaps);

      // If gaps remain and we haven't hit max iterations, iterate
      while (this.gaps.length > 0 && this.iteration < this.maxIterations - 1) {
        this.iteration++;
        this.addStep('refinement',
          `Iteration ${this.iteration + 1}: Re-explaining with new insights...`,
          null
        );

        // Re-identify gaps and refine
        await this.identifyGaps(this.refinedExplanation || this.simpleExplanation);
        if (this.gaps.length > 0) {
          await this.refineExplanation(this.gaps);
        }
      }

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
   * Phase 1: Identify the core concept that needs to be explained
   * @param {string} topic - The topic provided by the user
   */
  async identifyConcept(topic) {
    const step = this.addStep('concept_identification',
      'Identifying the core concept that needs to be explained...',
      null
    );

    const prompt = `You are using the Feynman Technique to understand and explain this topic:

TOPIC: ${topic}

First, identify the CORE CONCEPT that needs to be explained. This should be:
- The fundamental idea or principle at the heart of this topic
- Specific enough to be explainable
- General enough to be meaningful
- Something that, if understood, unlocks understanding of the whole topic

If the topic involves multiple concepts, identify the MOST IMPORTANT one to start with.

Format your response as:

CORE CONCEPT:
[One clear sentence defining the concept]

SCOPE:
[What this concept covers and what it doesn't]

WHY IT MATTERS:
[Why understanding this concept is important]

PREREQUISITES:
[What someone needs to know before learning this concept]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse the core concept
      this.parseConcept(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.8
      });

      this.state.context.concept = this.concept;

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
   * Parse the concept identification response
   * @param {string} response - LLM response text
   */
  parseConcept(response) {
    // Extract core concept
    const conceptMatch = response.match(/CORE CONCEPT:\s*\n*([^\n]+)/i);
    if (conceptMatch) {
      this.concept = conceptMatch[1].trim();
    } else {
      // Fallback: use first paragraph
      this.concept = response.split('\n\n')[0].trim();
    }
  }

  /**
   * Phase 2: Create a simple explanation as if teaching a beginner
   * @param {string} concept - The concept to explain
   */
  async createSimpleExplanation(concept) {
    const step = this.addStep('simple_explanation',
      'Explaining the concept in simple terms (as if teaching a 12-year-old)...',
      null
    );

    const prompt = `You are using the Feynman Technique. Explain this concept as if teaching it to a 12-year-old child:

CONCEPT: ${concept}

ORIGINAL TOPIC: ${this.state.context.topic}

Rules for simple explanation:
1. Use simple, everyday language (no jargon or technical terms)
2. If you MUST use a technical term, define it immediately in simple words
3. Use concrete examples and analogies from everyday life
4. Break it down into small, digestible pieces
5. Explain the "why" and "how", not just the "what"
6. Assume the learner knows nothing about this topic

Your explanation should make the concept crystal clear. Write as if you're having a conversation with a curious child who asks "why?" frequently.

SIMPLE EXPLANATION:`;

    try {
      const response = await this.promptLLM(prompt);

      this.simpleExplanation = response.trim();

      // Extract analogies if present
      this.extractAnalogies(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.7
      });

      this.state.context.simpleExplanation = this.simpleExplanation;
      this.state.context.analogies = this.analogies;

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
   * Extract analogies from the explanation
   * @param {string} text - The explanation text
   */
  extractAnalogies(text) {
    // Look for common analogy indicators
    const analogyPatterns = [
      /like (\w+(?:\s+\w+){1,4})/gi,
      /similar to (\w+(?:\s+\w+){1,4})/gi,
      /just as (\w+(?:\s+\w+){1,4})/gi,
      /think of it as (\w+(?:\s+\w+){1,4})/gi,
      /imagine (\w+(?:\s+\w+){1,4})/gi
    ];

    this.analogies = [];
    analogyPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          this.analogies.push(match[1].trim());
        }
      }
    });
  }

  /**
   * Phase 3: Identify gaps where the explanation breaks down
   * @param {string} explanation - The current explanation
   */
  async identifyGaps(explanation) {
    const step = this.addStep('gap_identification',
      'Analyzing the explanation to find gaps, unclear points, or areas that need improvement...',
      null
    );

    const prompt = `You are reviewing this explanation using the Feynman Technique. Identify where it breaks down:

CONCEPT: ${this.concept}

CURRENT EXPLANATION:
${explanation}

Critically analyze this explanation and identify:

1. **JARGON/TECHNICAL TERMS**: Words or phrases that a beginner wouldn't understand
2. **VAGUE STATEMENTS**: Claims that sound good but aren't specific enough
3. **LOGICAL GAPS**: Places where the explanation jumps without connecting the dots
4. **MISSING "WHY"**: Places where the explanation says "what" but not "why"
5. **UNCLEAR ANALOGIES**: Analogies that might confuse rather than clarify
6. **ASSUMPTIONS**: Things assumed to be known but might not be

For each gap, explain:
- What's unclear or missing
- Why it's a problem for understanding
- What needs to be added or changed

Format your response as:

GAP 1: [Type]
ISSUE: [What's wrong]
WHY IT MATTERS: [Impact on understanding]
FIX: [What should be done]

GAP 2: [Type]
[etc...]

If the explanation is excellent and has no significant gaps, write:
NO SIGNIFICANT GAPS FOUND
[Brief explanation of why the explanation is clear]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse the gaps
      this.parseGaps(response);

      const confidence = this.gaps.length === 0 ? 0.9 : Math.max(0.4, 0.8 - (this.gaps.length * 0.1));

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence
      });

      this.state.context.gaps = this.gaps;

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
   * Parse the gaps from the response
   * @param {string} response - LLM response text
   */
  parseGaps(response) {
    // Check if no gaps found
    if (/NO SIGNIFICANT GAPS FOUND/i.test(response)) {
      this.gaps = [];
      return;
    }

    // Extract individual gaps
    const gapPattern = /GAP \d+:[^\n]*\n([^]*?)(?=\nGAP \d+:|$)/gi;
    const matches = response.matchAll(gapPattern);

    this.gaps = [];
    for (const match of matches) {
      const gapText = match[1].trim();

      // Extract structured fields
      const issueMatch = gapText.match(/ISSUE:\s*([^\n]+)/i);
      const whyMatch = gapText.match(/WHY IT MATTERS:\s*([^\n]+)/i);
      const fixMatch = gapText.match(/FIX:\s*([^\n]+)/i);

      this.gaps.push({
        issue: issueMatch ? issueMatch[1].trim() : gapText,
        whyItMatters: whyMatch ? whyMatch[1].trim() : '',
        fix: fixMatch ? fixMatch[1].trim() : '',
        fullText: gapText
      });
    }

    // If no structured gaps found but response isn't "no gaps", parse as single gap
    if (this.gaps.length === 0 && response.length > 50) {
      this.gaps.push({
        issue: 'Explanation needs improvement',
        whyItMatters: 'Clarity can be enhanced',
        fix: response.substring(0, 200),
        fullText: response
      });
    }
  }

  /**
   * Phase 4: Refine the explanation using better analogies and simpler language
   * @param {Array} gaps - The identified gaps
   */
  async refineExplanation(gaps) {
    const step = this.addStep('refinement',
      'Refining the explanation with better analogies and simpler language...',
      null
    );

    const gapsText = gaps.map((g, i) =>
      `${i + 1}. ${g.issue}${g.fix ? `\n   Suggested fix: ${g.fix}` : ''}`
    ).join('\n\n');

    const prompt = `You are refining your explanation using the Feynman Technique.

CONCEPT: ${this.concept}

PREVIOUS EXPLANATION:
${this.simpleExplanation}

IDENTIFIED GAPS:
${gapsText}

Now create a REFINED explanation that:
1. Fixes all the identified gaps
2. Uses even simpler language
3. Adds better analogies (from everyday life)
4. Explains the "why" behind every "what"
5. Connects all the dots explicitly
6. Removes or explains all jargon

Think of creative, memorable analogies that make the concept click instantly.
Explain it so clearly that even someone with no background could teach it to someone else.

REFINED EXPLANATION:`;

    try {
      const response = await this.promptLLM(prompt);

      this.refinedExplanation = response.trim();

      // Update analogies
      this.extractAnalogies(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.85
      });

      this.state.context.refinedExplanation = this.refinedExplanation;
      this.state.context.analogies = this.analogies;
      this.state.context.solution = {
        concept: this.concept,
        explanation: this.refinedExplanation,
        analogies: this.analogies,
        iterations: this.iteration + 1
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
    return `You are an expert educator using the Feynman Technique to explain complex concepts.

The Feynman Technique, developed by Nobel laureate Richard Feynman, is based on the principle:
"If you can't explain it simply, you don't understand it well enough."

METHODOLOGY:
1. Identify the core concept to explain
2. Explain it using simple language, as if teaching a 12-year-old
3. Identify gaps where the explanation breaks down or uses jargon
4. Refine with better analogies and simpler language

CURRENT WORKING DIRECTORY: ${this.context.cwd}

PHASES: ${this.getPhases().join(' → ')}

PRINCIPLES:
- Use everyday language and concrete examples
- Every technical term must be defined in simple words
- Use memorable analogies from daily life
- Explain "why" and "how", not just "what"
- If you can't simplify it, you need to understand it better first
- Test understanding: Could a beginner teach this to someone else?

Your goal is to create an explanation so clear that anyone could understand and teach it.`;
  }

  // ============================================================================
  // OVERRIDE: Custom Result Format
  // ============================================================================

  /**
   * Override getResult to include Feynman-specific outputs
   * @returns {Object} FrameworkResult
   */
  getResult() {
    const baseResult = super.getResult();

    // Add Feynman-specific summary
    const summary = this.refinedExplanation || this.simpleExplanation || 'Explanation in progress';

    return {
      ...baseResult,
      summary: `Feynman Technique Explanation:\n\n${summary}`,
      solution: {
        concept: this.concept,
        simpleExplanation: this.simpleExplanation,
        refinedExplanation: this.refinedExplanation,
        analogies: this.analogies,
        gaps: this.gaps,
        iterations: this.iteration + 1,
        finalExplanation: this.refinedExplanation || this.simpleExplanation
      },
      nextSteps: this.gaps.length > 0
        ? [
            'Review the identified gaps for deeper understanding',
            'Research the unclear areas further',
            'Practice teaching the concept to someone else',
            'Create visual diagrams or examples'
          ]
        : [
            'Practice teaching this concept to verify understanding',
            'Create documentation or teaching materials',
            'Apply the concept to real-world examples'
          ],
      metadata: {
        ...baseResult.metadata,
        iterations: this.iteration + 1,
        gapsIdentified: this.gaps.length,
        analogiesUsed: this.analogies.length,
        technique: 'Feynman'
      }
    };
  }
}

module.exports = FeynmanFramework;
