/**
 * FrameworkSelector - Selects the best thinking framework based on user message, intent, and context
 */

// Maps intent categories to recommended frameworks (in priority order)
const FRAMEWORK_MAPPING = {
  debugging: ['ooda', 'five_whys', 'divide_conquer'],
  installation: ['chain_of_thought', 'pre_mortem'],
  configuration: ['chain_of_thought', 'first_principles'],
  build: ['ooda', 'five_whys', 'chain_of_thought'],
  runtime: ['ooda', 'bayesian', 'divide_conquer'],
  network: ['bayesian', 'ooda', 'divide_conquer'],
  permissions: ['chain_of_thought', 'ooda'],
  git: ['chain_of_thought', 'ooda'],
  docker: ['chain_of_thought', 'divide_conquer', 'ooda'],
  deployment: ['pre_mortem', 'chain_of_thought'],
  'how-to': ['feynman', 'chain_of_thought'],
  optimization: ['theory_of_constraints', 'first_principles'],
  // Phase 6 - New intent mappings
  decision: ['decide', 'first_principles', 'bayesian'],
  comparison: ['decide', 'scientific_method', 'first_principles'],
  explanation: ['feynman', 'chain_of_thought'],
  post_mortem: ['swiss_cheese', 'five_whys', 'ooda'],
  incident: ['swiss_cheese', 'ooda', 'five_whys'],
  experiment: ['scientific_method', 'bayesian'],
  benchmark: ['scientific_method', 'theory_of_constraints'],
  unknown: ['bayesian', 'ooda']
};

// Keywords that suggest specific frameworks
const KEYWORD_SIGNALS = {
  ooda: ['debug', 'not working', 'broken', 'error', 'fix', 'crash', 'failing'],
  five_whys: ['why', 'root cause', 'keeps happening', 'recurring', 'again'],
  bayesian: ['might be', 'could be', 'not sure', 'possibly', 'diagnose'],
  chain_of_thought: ['setup', 'install', 'configure', 'deploy', 'steps', 'how to'],
  pre_mortem: ['delete', 'remove', 'drop', 'migrate', 'production', 'dangerous', 'risky'],
  first_principles: ['should I', 'best way', 'architecture', 'design', 'approach'],
  theory_of_constraints: ['slow', 'performance', 'bottleneck', 'optimize', 'faster'],
  scientific_method: ['experiment', 'test', 'hypothesis', 'verify', 'compare', 'benchmark'],
  divide_conquer: ['complex', 'multiple', 'components', 'services', 'parts'],
  feynman: ['explain', 'understand', 'what is', 'how does', 'teach me'],
  decide: ['choose', 'decision', 'option', 'trade-off', 'which one'],
  swiss_cheese: ['incident', 'post-mortem', 'review', 'what went wrong']
};

// Context signals that suggest specific frameworks
const CONTEXT_SIGNALS = {
  ooda: { hasError: true, hasRecentErrors: true, lastCommandFailed: true },
  five_whys: { hasRecentErrors: true, errorCount: 3 },
  bayesian: { hasError: true, hasDependencyInfo: true },
  chain_of_thought: { projectType: true, hasDependencyInfo: true },
  pre_mortem: { hasGitInfo: true, gitBranch: ['main', 'master', 'production'] },
  first_principles: { projectType: true, hasDependencyInfo: true },
  theory_of_constraints: { hasError: false, projectType: true },
  scientific_method: { hasDependencyInfo: true, projectType: true },
  divide_conquer: { hasError: true },
  feynman: { hasError: false, projectType: true },
  decide: { hasDependencyInfo: true, projectType: true },
  swiss_cheese: { hasRecentErrors: true, lastCommandFailed: true, errorCount: 2 }
};

class FrameworkSelector {
  /**
   * Select the best framework for the given inputs
   * @param {string} userMessage - User's request
   * @param {string} intent - Classified intent category
   * @param {Object} context - Gathered context object
   * @returns {Object} FrameworkMatch
   */
  select(userMessage, intent, context = {}) {
    const matches = this.getAllMatches(userMessage, intent, context);
    return matches[0];
  }

  /**
   * Get all framework matches sorted by confidence
   * @param {string} userMessage - User's request
   * @param {string} intent - Classified intent category
   * @param {Object} context - Gathered context object
   * @returns {Object[]} FrameworkMatch[]
   */
  getAllMatches(userMessage, intent, context = {}) {
    const frameworks = Object.keys(KEYWORD_SIGNALS);
    const matches = [];

    for (const framework of frameworks) {
      const keywordScore = this.getKeywordScore(userMessage, framework);
      const intentScore = this.getIntentScore(intent, framework);
      const contextScore = this.getContextSignals(context, framework);

      const confidence = this.combineScores(keywordScore, intentScore, contextScore);
      const reason = this._buildReason(framework, keywordScore, intentScore, contextScore);

      matches.push({ framework, confidence, reason });
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Score based on keyword matching
   * @param {string} message - User message
   * @param {string} framework - Framework to check
   * @returns {number} Score 0-1
   */
  getKeywordScore(message, framework) {
    const keywords = KEYWORD_SIGNALS[framework] || [];
    const messageLower = (message || '').toLowerCase();

    let matchCount = 0;
    for (const keyword of keywords) {
      if (messageLower.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    return Math.min(matchCount / 3, 1.0);
  }

  /**
   * Score based on intent classification
   * @param {string} intent - Intent category
   * @param {string} framework - Framework to check
   * @returns {number} Score 0-1
   */
  getIntentScore(intent, framework) {
    const recommendedFrameworks = FRAMEWORK_MAPPING[intent] || FRAMEWORK_MAPPING.unknown;

    if (!recommendedFrameworks.includes(framework)) {
      return 0;
    }

    const index = recommendedFrameworks.indexOf(framework);
    const score = 1.0 - (index * 0.2);

    return Math.max(score, 0.4);
  }

  /**
   * Score based on context signals
   * @param {Object} context - Gathered context
   * @param {string} framework - Framework to check
   * @returns {number} Score 0-1
   */
  getContextSignals(context, framework) {
    const signals = CONTEXT_SIGNALS[framework];
    if (!signals) {
      return 0.5;
    }

    let matchCount = 0;
    let totalSignals = 0;

    for (const [signal, expectedValue] of Object.entries(signals)) {
      totalSignals++;

      if (signal === 'hasError') {
        if (context.lastError && expectedValue === true) matchCount++;
        if (!context.lastError && expectedValue === false) matchCount++;
      } else if (signal === 'hasRecentErrors') {
        if (context.recentErrors && context.recentErrors.length > 0 && expectedValue === true) matchCount++;
      } else if (signal === 'lastCommandFailed') {
        if (context.recentCommands && context.recentCommands.length > 0) {
          const lastCmd = context.recentCommands[context.recentCommands.length - 1];
          if (lastCmd && lastCmd.exitCode !== 0 && expectedValue === true) matchCount++;
        }
      } else if (signal === 'errorCount') {
        if (context.recentErrors && context.recentErrors.length >= expectedValue) matchCount++;
      } else if (signal === 'projectType') {
        if (context.projectType) matchCount++;
      } else if (signal === 'hasDependencyInfo') {
        if (context.dependencies && Object.keys(context.dependencies).length > 0 && expectedValue === true) {
          matchCount++;
        }
      } else if (signal === 'hasGitInfo') {
        if (context.gitBranch && expectedValue === true) matchCount++;
      } else if (signal === 'gitBranch') {
        if (context.gitBranch && expectedValue.includes(context.gitBranch)) matchCount++;
      }
    }

    return totalSignals > 0 ? matchCount / totalSignals : 0.5;
  }

  /**
   * Combine scores with weights
   * @param {number} keywordScore - Keyword match score
   * @param {number} intentScore - Intent match score
   * @param {number} contextScore - Context signal score
   * @returns {number} Combined score 0-1
   */
  combineScores(keywordScore, intentScore, contextScore) {
    const KEYWORD_WEIGHT = 0.3;
    const INTENT_WEIGHT = 0.4;
    const CONTEXT_WEIGHT = 0.3;

    return (
      keywordScore * KEYWORD_WEIGHT +
      intentScore * INTENT_WEIGHT +
      contextScore * CONTEXT_WEIGHT
    );
  }

  /**
   * Build human-readable reason for framework selection
   * @private
   */
  _buildReason(framework, keywordScore, intentScore, contextScore) {
    const reasons = [];

    if (keywordScore > 0.5) {
      reasons.push('strong keyword match');
    }
    if (intentScore > 0.6) {
      reasons.push('recommended for intent');
    }
    if (contextScore > 0.6) {
      reasons.push('context signals align');
    }

    if (reasons.length === 0) {
      return 'fallback option';
    }

    return reasons.join(', ');
  }
}

module.exports = {
  FrameworkSelector,
  FRAMEWORK_MAPPING,
  KEYWORD_SIGNALS,
  CONTEXT_SIGNALS
};
