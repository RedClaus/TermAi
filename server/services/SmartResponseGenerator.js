/**
 * Smart Response Generator
 *
 * Part of the RAPID Framework (Reduce AI Prompt Iteration Depth)
 *
 * Determines the optimal response strategy based on:
 * - Intent classification confidence
 * - Context completeness
 * - Gap analysis
 *
 * Strategies:
 * 1. Direct Response: High confidence, proceed with solution
 * 2. Assumed Response: Medium confidence, provide solution with stated assumptions
 * 3. Compound Question: Low confidence, ask all needed info at once + preliminary analysis
 */

const { getIntentClassifier } = require('./IntentClassifier');
const { getContextInferenceEngine } = require('./ContextInferenceEngine');
const { buildRAPIDPrompt } = require('./RAPIDPrompt');

// Response strategy thresholds
const CONFIDENCE_THRESHOLDS = {
  DIRECT: 0.7,      // >= 70%: Answer directly
  ASSUMED: 0.5,     // 50-70%: Answer with assumptions
  ASK: 0.0          // < 50%: Ask compound question
};

// Reasonable default assumptions for common gaps
const DEFAULT_ASSUMPTIONS = {
  os: (context) => {
    if (context.os) return null;
    return 'Assuming macOS/Linux (Unix-like environment)';
  },
  packageManager: (context) => {
    if (context.packageManager) return null;
    if (context.projectType === 'node') return 'Assuming npm';
    if (context.projectType === 'python') return 'Assuming pip';
    if (context.projectType === 'rust') return 'Assuming cargo';
    if (context.projectType === 'go') return 'Assuming go modules';
    return null;
  },
  runtimeVersions: (context) => {
    if (Object.keys(context.runtimeVersions || {}).length > 0) return null;
    return 'Assuming latest stable versions';
  },
  shell: (context) => {
    if (context.shell) return null;
    return 'Assuming bash/zsh';
  },
  framework: (context) => {
    if (context.framework) return null;
    return null; // Don't assume framework
  }
};

class SmartResponseGenerator {
  constructor(options = {}) {
    this.llmChat = options.llmChat || null;
    this.contextEngine = options.contextEngine || getContextInferenceEngine();
    this.intentClassifier = options.intentClassifier || getIntentClassifier();
    this.enablePreliminaryAnalysis = options.enablePreliminaryAnalysis !== false;
  }

  /**
   * Main method: Generate a smart response strategy
   * Returns structured data for prompt building
   */
  async generateStrategy(userMessage, sessionId, cwd = null) {
    // Step 1: Gather context
    const context = await this.contextEngine.gatherContext(sessionId, cwd);

    // Step 2: Classify intent
    const intent = this.intentClassifier.classify(userMessage, context);

    // Step 3: Determine strategy
    const strategy = this._determineStrategy(intent, context);

    // Step 4: Build enhanced prompt data
    const promptData = {
      userMessage,
      context,
      intent,
      strategy,
      systemPrompt: buildRAPIDPrompt(context, intent, strategy)
    };

    return promptData;
  }

  /**
   * Generate a full AI response using the strategy
   * This wraps the LLM call with RAPID framework
   */
  async generateResponse(userMessage, sessionId, cwd = null, existingMessages = []) {
    if (!this.llmChat) {
      throw new Error('LLM chat function not configured');
    }

    const promptData = await this.generateStrategy(userMessage, sessionId, cwd);
    const { strategy, intent, context } = promptData;

    // Handle based on strategy
    switch (strategy.approach) {
      case 'direct':
        return this._generateDirectResponse(promptData, existingMessages);

      case 'assumed':
        return this._generateAssumedResponse(promptData, existingMessages);

      case 'ask':
        return this._generateCompoundQuestion(promptData, existingMessages);

      default:
        return this._generateDirectResponse(promptData, existingMessages);
    }
  }

  /**
   * Set LLM chat function
   */
  setLLMChat(llmChat) {
    this.llmChat = llmChat;
    this.intentClassifier.setLLMChat(llmChat);
  }

  // ===========================================
  // PRIVATE: Strategy Determination
  // ===========================================

  _determineStrategy(intent, context) {
    const { confidence, gaps } = intent;
    const requiredGaps = gaps.filter(g => g.importance === 'required');

    // Calculate effective confidence
    let effectiveConfidence = confidence;

    // Boost if we have recent errors (most critical context)
    if (context.recentErrors?.length > 0 || context.lastError) {
      effectiveConfidence = Math.min(effectiveConfidence + 0.15, 1.0);
    }

    // Reduce if missing critical required fields
    if (requiredGaps.length > 2) {
      effectiveConfidence = Math.max(effectiveConfidence - 0.2, 0.1);
    }

    // Determine assumptions we can make
    const assumptions = this._generateAssumptions(requiredGaps, context);
    const assumableGaps = requiredGaps.filter(gap =>
      assumptions.some(a => a.field === gap.field)
    );

    // Calculate final gap count after assumptions
    const remainingGaps = requiredGaps.filter(gap =>
      !assumptions.some(a => a.field === gap.field)
    );

    // Determine approach
    let approach;
    if (effectiveConfidence >= CONFIDENCE_THRESHOLDS.DIRECT && remainingGaps.length === 0) {
      approach = 'direct';
    } else if (effectiveConfidence >= CONFIDENCE_THRESHOLDS.ASSUMED || remainingGaps.length <= 1) {
      approach = 'assumed';
    } else {
      approach = 'ask';
    }

    return {
      approach,
      confidence: effectiveConfidence,
      originalConfidence: confidence,
      assumptions,
      gaps: remainingGaps,
      allGaps: gaps,
      assumedFields: assumableGaps.map(g => g.field)
    };
  }

  _generateAssumptions(gaps, context) {
    const assumptions = [];

    for (const gap of gaps) {
      const assumptionFn = DEFAULT_ASSUMPTIONS[gap.field];
      if (assumptionFn) {
        const assumption = assumptionFn(context);
        if (assumption) {
          assumptions.push({
            field: gap.field,
            assumption,
            question: gap.question
          });
        }
      }
    }

    return assumptions;
  }

  // ===========================================
  // PRIVATE: Response Generation
  // ===========================================

  async _generateDirectResponse(promptData, existingMessages) {
    const messages = [
      { role: 'system', content: promptData.systemPrompt },
      ...existingMessages,
      { role: 'user', content: promptData.userMessage }
    ];

    const response = await this.llmChat(messages);

    return {
      content: response,
      metadata: {
        strategy: 'direct',
        intent: promptData.intent.category,
        confidence: promptData.strategy.confidence,
        contextCompleteness: promptData.context.contextCompleteness
      }
    };
  }

  async _generateAssumedResponse(promptData, existingMessages) {
    const { strategy, context, intent } = promptData;

    // Build assumption notice for the prompt
    const assumptionNotice = strategy.assumptions.length > 0
      ? `\n\n## ASSUMPTIONS FOR THIS RESPONSE:\n${strategy.assumptions.map(a => `- ${a.assumption}`).join('\n')}\n\nState these assumptions in your response. Provide alternatives if they're wrong.`
      : '';

    const enhancedSystemPrompt = promptData.systemPrompt + assumptionNotice;

    const messages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...existingMessages,
      { role: 'user', content: promptData.userMessage }
    ];

    const response = await this.llmChat(messages);

    return {
      content: response,
      metadata: {
        strategy: 'assumed',
        assumptions: strategy.assumptions.map(a => a.assumption),
        intent: intent.category,
        confidence: strategy.confidence,
        contextCompleteness: context.contextCompleteness
      }
    };
  }

  async _generateCompoundQuestion(promptData, existingMessages) {
    const { strategy, context, intent } = promptData;

    // Generate the compound question
    const compoundQuestion = this.intentClassifier.generateCompoundQuestion(strategy.allGaps);

    // Get preliminary analysis if enabled
    let preliminaryAnalysis = '';
    if (this.enablePreliminaryAnalysis && this.llmChat) {
      try {
        preliminaryAnalysis = await this._getPreliminaryAnalysis(promptData);
      } catch (error) {
        console.warn('[SmartResponseGenerator] Preliminary analysis failed:', error.message);
      }
    }

    // Build the response
    const content = this._buildCompoundQuestionResponse(
      intent.category,
      compoundQuestion,
      preliminaryAnalysis,
      strategy.gaps.length
    );

    return {
      content,
      metadata: {
        strategy: 'ask',
        waitingFor: strategy.gaps.map(g => g.field),
        intent: intent.category,
        confidence: strategy.confidence,
        contextCompleteness: context.contextCompleteness,
        hasPreliminaryAnalysis: !!preliminaryAnalysis
      }
    };
  }

  async _getPreliminaryAnalysis(promptData) {
    const { context, intent, userMessage } = promptData;

    const analysisPrompt = `Given limited context, provide a brief preliminary analysis (2-3 sentences) of what might be wrong and the most likely solution direction.

User issue: ${userMessage}
Category: ${intent.category}
Recent errors: ${(context.recentErrors || []).slice(-2).map(e => (e.patterns || []).map(p => p.message).join(', ')).join('; ').slice(0, 300)}
Project type: ${context.projectType || 'unknown'}
Last command: ${context.lastCommand?.command || 'none'}

Be specific but acknowledge uncertainty. Start with "Based on the ${intent.category} pattern..."`;

    const response = await this.llmChat([
      { role: 'user', content: analysisPrompt }
    ]);

    return response.slice(0, 500); // Limit length
  }

  _buildCompoundQuestionResponse(category, compoundQuestion, preliminaryAnalysis, gapCount) {
    const categoryDescriptions = {
      installation: 'installation/dependency',
      configuration: 'configuration',
      build: 'build/compilation',
      runtime: 'runtime',
      network: 'network/connectivity',
      permissions: 'permissions',
      git: 'git/version control',
      docker: 'Docker/container',
      deployment: 'deployment',
      'how-to': '',
      optimization: 'performance',
      debugging: 'debugging',
      unknown: ''
    };

    const categoryDesc = categoryDescriptions[category] || '';
    const issueType = categoryDesc ? `${categoryDesc} issue` : 'request';

    let response = `I can help with this ${issueType}. ${compoundQuestion}`;

    if (preliminaryAnalysis) {
      response += `\n\n**While you gather that info, here's my initial analysis:**\n\n${preliminaryAnalysis}`;
    }

    if (gapCount === 1) {
      response += '\n\nJust share that info and I\'ll have your solution.';
    }

    return response;
  }
}

// Singleton instance
let generatorInstance = null;

function getSmartResponseGenerator(options = {}) {
  if (!generatorInstance) {
    generatorInstance = new SmartResponseGenerator(options);
  }
  return generatorInstance;
}

module.exports = {
  SmartResponseGenerator,
  getSmartResponseGenerator,
  CONFIDENCE_THRESHOLDS
};
