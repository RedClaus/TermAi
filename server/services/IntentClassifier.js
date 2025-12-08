/**
 * Intent Classifier
 *
 * Part of the RAPID Framework (Reduce AI Prompt Iteration Depth)
 *
 * Classifies user requests into problem domains using:
 * 1. Fast pattern matching (instant, no API calls)
 * 2. Context signals (recent errors, project type)
 * 3. Optional LLM classification for ambiguous cases
 *
 * This enables the system to know what context is needed BEFORE responding.
 */

const { PROBLEM_CATEGORIES } = require('./ContextInferenceEngine');

// Domain-specific context requirements
// What information do we NEED for each problem type?
const DOMAIN_REQUIREMENTS = {
  installation: {
    required: ['packageManager', 'errorOutput'],
    helpful: ['os', 'runtimeVersions', 'projectType'],
    optional: ['networkAccess', 'proxyConfig']
  },
  configuration: {
    required: ['configFiles', 'errorOutput'],
    helpful: ['projectType', 'framework'],
    optional: ['recentChanges']
  },
  build: {
    required: ['errorOutput', 'projectType'],
    helpful: ['buildCommand', 'configFiles', 'runtimeVersions'],
    optional: ['ciBuild']
  },
  runtime: {
    required: ['errorOutput'],
    helpful: ['triggerAction', 'stackTrace', 'runtimeVersions'],
    optional: ['inputData', 'envVars']
  },
  network: {
    required: ['errorOutput'],
    helpful: ['targetHost', 'networkConfig', 'proxySettings'],
    optional: ['firewallRules']
  },
  permissions: {
    required: ['errorOutput', 'targetPath'],
    helpful: ['currentUser', 'os'],
    optional: ['selinuxContext']
  },
  git: {
    required: ['gitContext'],
    helpful: ['intendedAction', 'recentCommands'],
    optional: ['remoteConfig']
  },
  docker: {
    required: ['errorOutput'],
    helpful: ['dockerfile', 'dockerComposeYaml', 'baseImage'],
    optional: ['buildArgs', 'volumes']
  },
  deployment: {
    required: ['errorOutput', 'deployTarget'],
    helpful: ['deployConfig', 'envVars'],
    optional: ['previousDeploy']
  },
  'how-to': {
    required: ['specificGoal'],
    helpful: ['currentSetup', 'constraints', 'projectType'],
    optional: ['preferences']
  },
  optimization: {
    required: ['currentMetrics', 'targetMetrics'],
    helpful: ['profilerOutput', 'architecture'],
    optional: ['budgetConstraints']
  },
  debugging: {
    required: ['errorOutput'],
    helpful: ['reproductionSteps', 'expectedBehavior', 'actualBehavior'],
    optional: ['recentChanges']
  },
  unknown: {
    required: ['userIntent'],
    helpful: ['context'],
    optional: []
  }
};

// Pattern signals for fast classification
const CATEGORY_SIGNALS = {
  installation: {
    keywords: [
      /\b(install|npm|yarn|pnpm|pip|brew|apt|apt-get|yum|dnf|pacman|choco|winget|package|module|dependency|dependencies)\b/i,
      /\b(npm i|yarn add|pip install|cargo add|go get)\b/i
    ],
    errorPatterns: [
      /npm ERR!/i,
      /ENOENT.*node_modules/i,
      /Cannot find module/i,
      /ModuleNotFoundError/i,
      /No matching version found/i,
      /peer dependency/i,
      /resolution failed/i
    ],
    weight: 0.4
  },
  configuration: {
    keywords: [
      /\b(config|configure|configuration|settings|setup|tsconfig|vite\.config|webpack|eslint|prettier|env)\b/i,
      /\b(\.env|environment|variables)\b/i
    ],
    errorPatterns: [
      /invalid.*config/i,
      /configuration.*error/i,
      /missing.*option/i,
      /unknown.*option/i
    ],
    weight: 0.3
  },
  build: {
    keywords: [
      /\b(build|compile|bundle|webpack|vite|rollup|esbuild|tsc|typescript|babel|transpile|minify)\b/i,
      /\b(npm run build|yarn build|cargo build|go build|make)\b/i
    ],
    errorPatterns: [
      /TS\d+:/,
      /error TS/i,
      /syntax error/i,
      /compilation failed/i,
      /build failed/i,
      /type error/i
    ],
    weight: 0.4
  },
  runtime: {
    keywords: [
      /\b(run|runtime|execute|crash|exception|error|bug|issue|broke|broken|not working)\b/i,
      /\b(node|python|java|ruby|go|rust|php)\s+\S+\.(js|ts|py|java|rb|go|rs|php)/i
    ],
    errorPatterns: [
      /TypeError/i,
      /ReferenceError/i,
      /SyntaxError/i,
      /Traceback/i,
      /panic:/i,
      /segmentation fault/i,
      /core dumped/i,
      /undefined is not/i,
      /null pointer/i
    ],
    weight: 0.35
  },
  network: {
    keywords: [
      /\b(network|connection|connect|timeout|dns|http|https|api|fetch|request|curl|wget|socket|port|proxy)\b/i,
      /\b(ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ERR_CONNECTION)\b/i
    ],
    errorPatterns: [
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /ERR_CONNECTION/i,
      /connection refused/i,
      /name resolution/i,
      /DNS/i,
      /SSL/i,
      /certificate/i
    ],
    weight: 0.5
  },
  permissions: {
    keywords: [
      /\b(permission|access|denied|sudo|root|admin|chmod|chown|acl|owner|group)\b/i,
      /\b(EACCES|EPERM)\b/i
    ],
    errorPatterns: [
      /EACCES/i,
      /EPERM/i,
      /permission denied/i,
      /access denied/i,
      /operation not permitted/i,
      /you don't have permission/i
    ],
    weight: 0.5
  },
  git: {
    keywords: [
      /\b(git|commit|push|pull|merge|branch|rebase|checkout|stash|clone|fetch|remote|origin|main|master)\b/i
    ],
    errorPatterns: [
      /fatal:/i,
      /conflict/i,
      /not a git repository/i,
      /detached HEAD/i,
      /diverged/i,
      /merge conflict/i
    ],
    weight: 0.6
  },
  docker: {
    keywords: [
      /\b(docker|container|image|compose|dockerfile|kubernetes|k8s|pod|helm|swarm)\b/i
    ],
    errorPatterns: [
      /docker.*error/i,
      /no such image/i,
      /container.*exited/i,
      /build.*failed/i,
      /cannot connect.*daemon/i
    ],
    weight: 0.6
  },
  deployment: {
    keywords: [
      /\b(deploy|deployment|production|staging|release|ci\/cd|pipeline|vercel|netlify|heroku|aws|gcp|azure)\b/i
    ],
    errorPatterns: [
      /deployment.*failed/i,
      /build.*failed/i,
      /pipeline.*error/i
    ],
    weight: 0.4
  },
  'how-to': {
    keywords: [
      /\b(how (do|can|to|would)|what('s| is) the (best|right|correct) way|show me how|teach me|explain)\b/i,
      /\b(tutorial|guide|example|documentation)\b/i
    ],
    errorPatterns: [],
    weight: 0.4
  },
  optimization: {
    keywords: [
      /\b(optimize|performance|slow|fast|speed|memory|cpu|cache|efficient|improve|bottleneck)\b/i,
      /\b(profile|profiler|benchmark)\b/i
    ],
    errorPatterns: [
      /out of memory/i,
      /heap/i,
      /memory leak/i,
      /timeout/i
    ],
    weight: 0.35
  },
  debugging: {
    keywords: [
      /\b(debug|debugging|breakpoint|inspect|trace|log|investigate|troubleshoot|diagnose)\b/i
    ],
    errorPatterns: [],
    weight: 0.3
  }
};

// Questions to ask when gaps exist (for compound question generation)
const GAP_QUESTIONS = {
  errorOutput: 'What error message are you seeing? (paste the full output)',
  packageManager: 'Which package manager are you using? [npm/yarn/pnpm/pip/cargo]',
  buildCommand: 'What build command are you running?',
  triggerAction: 'What action triggers this error?',
  targetHost: 'What host/URL are you trying to reach?',
  targetPath: 'What file/directory path is involved?',
  intendedAction: 'What are you trying to accomplish with git?',
  specificGoal: 'What specific outcome do you want to achieve?',
  dockerfile: 'Can you share your Dockerfile content?',
  deployTarget: 'Where are you deploying to? [Vercel/AWS/Docker/etc]',
  reproductionSteps: 'What steps reproduce this issue?',
  currentMetrics: 'What are your current performance numbers?',
  targetMetrics: 'What performance target are you aiming for?',
  expectedBehavior: 'What did you expect to happen?',
  actualBehavior: 'What actually happened?'
};

class IntentClassifier {
  constructor(options = {}) {
    this.llmChat = options.llmChat || null; // Optional LLM for ambiguous cases
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
  }

  /**
   * Classify user intent based on message and context
   * Returns: { category, confidence, signals, gaps }
   */
  classify(userMessage, context = {}) {
    // Step 1: Fast pattern matching
    const patternResult = this._patternMatch(userMessage, context);

    // Step 2: Boost with context signals
    const boostedResult = this._boostWithContext(patternResult, context);

    // Step 3: Analyze gaps for this category
    const gaps = this._analyzeGaps(boostedResult.category, context);

    return {
      category: boostedResult.category,
      confidence: boostedResult.confidence,
      signals: boostedResult.signals,
      gaps,
      requirements: DOMAIN_REQUIREMENTS[boostedResult.category]
    };
  }

  /**
   * Async classify with LLM fallback for low confidence
   */
  async classifyWithLLM(userMessage, context = {}) {
    const result = this.classify(userMessage, context);

    // If confidence is low and LLM is available, use it for refinement
    if (result.confidence < this.confidenceThreshold && this.llmChat) {
      try {
        const llmResult = await this._llmClassify(userMessage, context, result);
        return llmResult;
      } catch (error) {
        console.warn('[IntentClassifier] LLM classification failed:', error.message);
        return result; // Fallback to pattern-based result
      }
    }

    return result;
  }

  /**
   * Generate a compound question for all gaps
   */
  generateCompoundQuestion(gaps) {
    if (gaps.length === 0) return null;

    const requiredGaps = gaps.filter(g => g.importance === 'required');
    const helpfulGaps = gaps.filter(g => g.importance === 'helpful');

    const questions = [];

    // Required gaps first
    requiredGaps.forEach((gap, i) => {
      questions.push(`${i + 1}. **${gap.question}**`);
    });

    // Then helpful gaps (only first 2)
    helpfulGaps.slice(0, 2).forEach((gap, i) => {
      questions.push(`${requiredGaps.length + i + 1}. ${gap.question} (optional)`);
    });

    if (questions.length === 1) {
      return `To help you effectively: ${questions[0]}`;
    }

    return `To give you the right solution quickly, I need:\n\n${questions.join('\n')}\n\n(Share what you can - I'll work with whatever you provide)`;
  }

  /**
   * Set LLM chat function for async classification
   */
  setLLMChat(llmChat) {
    this.llmChat = llmChat;
  }

  // ===========================================
  // PRIVATE: Classification Methods
  // ===========================================

  _patternMatch(message, context) {
    const scores = {};
    const signals = {};

    // Initialize scores
    PROBLEM_CATEGORIES.forEach(cat => {
      scores[cat] = 0;
      signals[cat] = [];
    });

    // Always set a base score for unknown
    scores.unknown = 0.1;

    const lowerMessage = message.toLowerCase();

    // Match against each category's signals
    for (const [category, categorySignals] of Object.entries(CATEGORY_SIGNALS)) {
      // Check keywords
      for (const pattern of categorySignals.keywords) {
        if (pattern.test(message)) {
          scores[category] += categorySignals.weight;
          signals[category].push(`keyword:${pattern.source.slice(0, 30)}`);
        }
      }

      // Check error patterns in message
      for (const pattern of categorySignals.errorPatterns) {
        if (pattern.test(message)) {
          scores[category] += categorySignals.weight * 0.8;
          signals[category].push(`error_pattern:${pattern.source.slice(0, 20)}`);
        }
      }
    }

    // Check recent errors from context
    if (context.recentErrors && context.recentErrors.length > 0) {
      const lastError = context.recentErrors[context.recentErrors.length - 1];
      const errorText = lastError.output || '';

      for (const [category, categorySignals] of Object.entries(CATEGORY_SIGNALS)) {
        for (const pattern of categorySignals.errorPatterns) {
          if (pattern.test(errorText)) {
            scores[category] += categorySignals.weight * 1.2; // Higher weight for actual errors
            signals[category].push(`recent_error:${pattern.source.slice(0, 20)}`);
          }
        }
      }
    }

    // Find highest score
    let maxCategory = 'unknown';
    let maxScore = 0.1;

    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxCategory = category;
      }
    }

    // Normalize confidence (cap at 1.0)
    const confidence = Math.min(maxScore, 1.0);

    return {
      category: maxCategory,
      confidence,
      signals: signals[maxCategory] || [],
      allScores: scores
    };
  }

  _boostWithContext(result, context) {
    let { category, confidence, signals } = result;

    // Boost if project type matches category
    if (context.projectType) {
      const projectBoosts = {
        'node': ['installation', 'build', 'runtime'],
        'python': ['installation', 'runtime'],
        'rust': ['build', 'runtime'],
        'go': ['build', 'runtime'],
        'docker': ['docker', 'deployment'],
        'terraform': ['deployment', 'configuration']
      };

      if (projectBoosts[context.projectType]?.includes(category)) {
        confidence = Math.min(confidence + 0.1, 1.0);
        signals.push(`project_type_boost:${context.projectType}`);
      }
    }

    // Boost git if in git repo with changes
    if (category === 'git' && context.gitContext?.hasChanges) {
      confidence = Math.min(confidence + 0.15, 1.0);
      signals.push('git_context_boost');
    }

    // Boost if recent error matches category
    if (context.lastError && category !== 'how-to') {
      confidence = Math.min(confidence + 0.1, 1.0);
      signals.push('has_recent_error');
    }

    return { category, confidence, signals };
  }

  _analyzeGaps(category, context) {
    const requirements = DOMAIN_REQUIREMENTS[category];
    if (!requirements) return [];

    const gaps = [];

    // Check required fields
    for (const field of requirements.required) {
      if (!this._hasContext(context, field)) {
        gaps.push({
          field,
          importance: 'required',
          question: GAP_QUESTIONS[field] || `What is the ${field}?`
        });
      }
    }

    // Check helpful fields (only if confidence is moderate)
    if (gaps.length === 0 || this._getFieldCount(requirements.required, context) > 0) {
      for (const field of requirements.helpful) {
        if (!this._hasContext(context, field)) {
          gaps.push({
            field,
            importance: 'helpful',
            question: GAP_QUESTIONS[field] || `What is the ${field}? (optional)`
          });
        }
      }
    }

    return gaps;
  }

  _hasContext(context, field) {
    switch (field) {
      case 'errorOutput':
        return context.recentErrors?.length > 0 ||
               context.lastError !== null;
      case 'packageManager':
        return context.packageManager !== null;
      case 'os':
        return context.os !== undefined;
      case 'projectType':
        return context.projectType !== null;
      case 'configFiles':
        return context.configFiles?.length > 0;
      case 'gitContext':
        return context.gitContext !== null;
      case 'runtimeVersions':
        return Object.keys(context.runtimeVersions || {}).length > 0;
      case 'framework':
        return context.framework !== null;
      case 'recentCommands':
        return context.recentCommands?.length > 0;
      case 'currentUser':
        return context.user !== undefined;
      default:
        return false;
    }
  }

  _getFieldCount(fields, context) {
    return fields.filter(f => this._hasContext(context, f)).length;
  }

  async _llmClassify(message, context, patternResult) {
    const prompt = `Classify this terminal/development request into exactly one category.

User message: "${message}"

Recent errors: ${(context.recentErrors || []).slice(-2).map(e => e.patterns?.map(p => p.message).join(', ')).join('; ').slice(0, 300)}
Project type: ${context.projectType || 'unknown'}
Recent commands: ${(context.recentCommands || []).slice(-3).map(c => c.command).join(', ').slice(0, 200)}

Categories:
- installation: Package/dependency install issues
- configuration: Config file problems
- build: Build/compile errors
- runtime: Runtime errors during execution
- network: Connectivity, DNS, ports
- permissions: Access denied, sudo needed
- git: Version control operations
- docker: Container issues
- deployment: Deploy/release problems
- how-to: Learning how to do something
- optimization: Performance improvements
- debugging: General troubleshooting

Pattern matching suggested: ${patternResult.category} (${Math.round(patternResult.confidence * 100)}% confidence)

Respond with JSON only: {"category": "...", "confidence": 0.X, "signals": ["reason1", "reason2"]}`;

    const response = await this.llmChat([
      { role: 'user', content: prompt }
    ]);

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        // Validate category
        if (!PROBLEM_CATEGORIES.includes(result.category)) {
          return patternResult;
        }

        // Merge with gaps analysis
        const gaps = this._analyzeGaps(result.category, context);

        return {
          category: result.category,
          confidence: Math.min(result.confidence || 0.7, 1.0),
          signals: result.signals || [],
          gaps,
          requirements: DOMAIN_REQUIREMENTS[result.category],
          llmClassified: true
        };
      }
    } catch {
      // JSON parse failed
    }

    return patternResult;
  }
}

// Singleton instance
let classifierInstance = null;

function getIntentClassifier(options = {}) {
  if (!classifierInstance) {
    classifierInstance = new IntentClassifier(options);
  }
  return classifierInstance;
}

module.exports = {
  IntentClassifier,
  getIntentClassifier,
  DOMAIN_REQUIREMENTS,
  GAP_QUESTIONS
};
