const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * PreMortemFramework - Proactive risk assessment before destructive operations
 *
 * Implements the Pre-mortem Analysis thinking framework:
 * 1. Imagine Failure - What could go catastrophically wrong?
 * 2. Assess Risks - Score each risk by probability × impact
 * 3. Safety Checks - Generate pre-execution verification steps
 * 4. Mitigation Planning - Create rollback and recovery procedures
 *
 * This framework is designed for:
 * - Destructive operations (rm -rf, drop table, etc.)
 * - Production changes
 * - Database migrations
 * - High-risk deployments
 * - Any operation where failure has severe consequences
 */

// Patterns that indicate dangerous operations requiring pre-mortem analysis
const DANGEROUS_PATTERNS = [
  // File system operations
  { pattern: /rm\s+-rf?/i, category: 'file_deletion', severity: 'critical' },
  { pattern: /rmdir/i, category: 'file_deletion', severity: 'high' },
  { pattern: /\bdelete\b/i, category: 'file_deletion', severity: 'high' },
  { pattern: /format\b/i, category: 'disk_format', severity: 'critical' },
  { pattern: /fdisk/i, category: 'disk_partition', severity: 'critical' },
  { pattern: /dd\s+if=/i, category: 'disk_write', severity: 'critical' },

  // Database operations
  { pattern: /drop\s+(table|database|schema)/i, category: 'database_drop', severity: 'critical' },
  { pattern: /truncate\s+table/i, category: 'database_truncate', severity: 'critical' },
  { pattern: /delete\s+from/i, category: 'database_delete', severity: 'high' },
  { pattern: /alter\s+table/i, category: 'database_alter', severity: 'medium' },
  { pattern: /migrate/i, category: 'database_migration', severity: 'high' },

  // Version control operations
  { pattern: /git\s+(push|reset)\s+.*--force/i, category: 'git_force', severity: 'critical' },
  { pattern: /git\s+reset\s+--hard/i, category: 'git_reset', severity: 'high' },
  { pattern: /git\s+clean\s+-fd/i, category: 'git_clean', severity: 'medium' },

  // Production operations
  { pattern: /production/i, category: 'production_change', severity: 'high' },
  { pattern: /prod\b/i, category: 'production_change', severity: 'high' },
  { pattern: /deploy/i, category: 'deployment', severity: 'medium' },

  // System operations
  { pattern: /shutdown|reboot/i, category: 'system_restart', severity: 'high' },
  { pattern: /kill\s+-9/i, category: 'force_kill', severity: 'medium' },
  { pattern: /chmod\s+777/i, category: 'permission_change', severity: 'medium' },
  { pattern: /chown\s+-R/i, category: 'ownership_change', severity: 'medium' }
];

// Risk severity thresholds
const RISK_THRESHOLDS = {
  CRITICAL: 0.5,  // Above this requires explicit confirmation
  HIGH: 0.3,      // Requires review
  MEDIUM: 0.1,    // Should warn
  LOW: 0.0        // Informational only
};

class PreMortemFramework extends BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   */
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);
    this.definition = FRAMEWORK_DEFINITIONS.pre_mortem;

    // Framework state
    this.risks = [];
    this.safetyChecks = [];
    this.mitigations = [];
    this.riskThreshold = RISK_THRESHOLDS.CRITICAL;
    this.detectedPatterns = [];
  }

  getName() {
    return 'pre_mortem';
  }

  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  getFrameworkSystemPrompt() {
    return `You are an expert risk assessment AI using the Pre-mortem Analysis framework to identify and mitigate risks BEFORE executing potentially dangerous operations.

Your current working directory is: ${this.context.cwd}

Framework Phases:
1. RISK IMAGINATION - Imagine it's tomorrow and the operation failed catastrophically. What went wrong?
2. RISK ASSESSMENT - Score each failure scenario by probability × impact (0-1 scale)
3. SAFETY CHECKS - Generate verification steps to run BEFORE execution
4. MITIGATION PLANNING - Create rollback procedures and recovery plans

Critical Guidelines:
- Be pessimistic and thorough - missing a risk could be catastrophic
- Consider data loss, downtime, security breaches, dependency breaks
- Generate specific, executable safety checks (not vague suggestions)
- Create actual rollback commands that can be run if things go wrong
- If ANY risk scores above 0.5, recommend STOPPING unless mitigations are in place

Your goal is to prevent disasters, not to approve operations.`;
  }

  /**
   * Execute the pre-mortem analysis framework
   * @param {string} intendedAction - The action/command to analyze
   * @returns {Promise<Object>} FrameworkResult with risk analysis
   */
  async execute(intendedAction) {
    this.state.framework = this.getName();
    this.state.phase = 'init';
    this.state.status = 'active';

    try {
      // Phase 1: Imagine Failures
      const step1 = this.addStep('risk_imagination', 'Analyzing intended action for potential failure scenarios...', intendedAction);
      const failures = await this.imagineFailures(intendedAction);
      this.updateStep(step1.id, {
        result: { success: true, output: `Identified ${failures.length} failure scenarios` },
        confidence: 0.9
      });

      // Phase 2: Assess Risks
      const step2 = this.addStep('risk_assessment', 'Scoring risks by probability and impact...', null);
      const risks = await this.assessRisks(failures);
      this.risks = risks;

      const criticalRisks = risks.filter(r => r.score >= RISK_THRESHOLDS.CRITICAL);
      const highRisks = risks.filter(r => r.score >= RISK_THRESHOLDS.HIGH && r.score < RISK_THRESHOLDS.CRITICAL);

      this.updateStep(step2.id, {
        result: {
          success: true,
          output: `Risk Matrix: ${criticalRisks.length} critical, ${highRisks.length} high, ${risks.length - criticalRisks.length - highRisks.length} medium/low`
        },
        confidence: 0.85
      });

      // Phase 3: Safety Checks
      const step3 = this.addStep('safety_checks', 'Generating pre-execution verification checks...', null);
      const safetyChecks = await this.generateSafetyChecks(risks);
      this.safetyChecks = safetyChecks;

      this.updateStep(step3.id, {
        result: {
          success: true,
          output: `Generated ${safetyChecks.length} safety verification checks`
        },
        confidence: 0.9
      });

      // Phase 4: Mitigation Planning
      const step4 = this.addStep('mitigation_planning', 'Creating rollback and recovery procedures...', null);
      const mitigations = await this.createMitigationPlan(risks);
      this.mitigations = mitigations;

      this.updateStep(step4.id, {
        result: {
          success: true,
          output: `Created mitigation plan with ${mitigations.rollbackCommands.length} rollback commands`
        },
        confidence: 0.85
      });

      // Determine final recommendation
      const shouldProceed = criticalRisks.length === 0 || mitigations.criticalRisksMitigated;
      const recommendation = this.generateRecommendation(risks, safetyChecks, mitigations, shouldProceed);

      this.state.status = 'complete';
      this.state.context = {
        risks,
        safetyChecks,
        mitigations,
        recommendation,
        shouldProceed,
        detectedPatterns: this.detectedPatterns
      };

      return this.getResult();

    } catch (error) {
      this.state.status = 'failed';
      this.addStep('error', `Pre-mortem analysis failed: ${error.message}`, null);
      throw error;
    }
  }

  /**
   * Check if a command contains dangerous patterns
   * @param {string} command - Command or action to check
   * @returns {Object} { isDangerous: boolean, patterns: Array, maxSeverity: string }
   */
  isDangerous(command) {
    const detected = [];
    let maxSeverityLevel = 0;
    const severityMap = { critical: 3, high: 2, medium: 1, low: 0 };

    for (const { pattern, category, severity } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        detected.push({ pattern: pattern.source, category, severity });
        maxSeverityLevel = Math.max(maxSeverityLevel, severityMap[severity] || 0);
      }
    }

    const severityLevels = ['low', 'medium', 'high', 'critical'];
    this.detectedPatterns = detected;

    return {
      isDangerous: detected.length > 0,
      patterns: detected,
      maxSeverity: severityLevels[maxSeverityLevel] || 'low'
    };
  }

  /**
   * Imagine failure scenarios (Phase 1)
   * @param {string} action - The intended action
   * @returns {Promise<Array>} Array of failure scenarios
   */
  async imagineFailures(action) {
    const dangerAnalysis = this.isDangerous(action);

    const prompt = `You are conducting a PRE-MORTEM analysis. Imagine it is tomorrow, and the following action has FAILED CATASTROPHICALLY:

ACTION: ${action}

Current context:
- Working directory: ${this.context.cwd}
- Detected dangerous patterns: ${dangerAnalysis.patterns.map(p => p.category).join(', ') || 'none'}
- Max severity: ${dangerAnalysis.maxSeverity}

Now, working backwards from this catastrophic failure, describe 5-7 specific failure scenarios explaining WHAT WENT WRONG and WHY.

Consider:
1. Data loss scenarios (deleted wrong files, corrupted database, lost backups)
2. System instability (broken dependencies, crashed services, network issues)
3. Security issues (exposed credentials, permission problems, unauthorized access)
4. Human error (wrong environment, misread output, typo in command)
5. Cascade failures (one thing breaks, then another, then another)
6. Timing issues (race conditions, concurrent access, locked resources)
7. Environment mismatches (different versions, missing dependencies, wrong config)

Format each scenario as:
SCENARIO: [Brief title]
DESCRIPTION: [What specifically went wrong]
WHY: [Root cause that led to this]
IMPACT: [Severity of consequences]

Be specific and realistic. Think like a pessimist trying to prevent disaster.`;

    const response = await this.promptLLM(prompt);

    // Parse the response to extract structured scenarios
    const scenarios = this.parseFailureScenarios(response);

    return scenarios;
  }

  /**
   * Parse failure scenarios from LLM response
   * @param {string} response - LLM response text
   * @returns {Array} Structured failure scenarios
   */
  parseFailureScenarios(response) {
    const scenarios = [];
    const scenarioBlocks = response.split(/SCENARIO:/i).slice(1); // Skip text before first SCENARIO

    for (const block of scenarioBlocks) {
      const lines = block.trim().split('\n');
      const scenario = {
        title: lines[0]?.trim() || 'Unknown scenario',
        description: '',
        why: '',
        impact: ''
      };

      let currentField = null;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('DESCRIPTION:')) {
          currentField = 'description';
          scenario.description = line.replace(/^DESCRIPTION:\s*/i, '');
        } else if (line.startsWith('WHY:')) {
          currentField = 'why';
          scenario.why = line.replace(/^WHY:\s*/i, '');
        } else if (line.startsWith('IMPACT:')) {
          currentField = 'impact';
          scenario.impact = line.replace(/^IMPACT:\s*/i, '');
        } else if (currentField && line) {
          scenario[currentField] += ' ' + line;
        }
      }

      if (scenario.description) {
        scenarios.push(scenario);
      }
    }

    return scenarios;
  }

  /**
   * Assess risks for each failure scenario (Phase 2)
   * @param {Array} failures - Failure scenarios
   * @returns {Promise<Array>} Risks with probability, impact, and score
   */
  async assessRisks(failures) {
    const prompt = `You are assessing the PROBABILITY and IMPACT of each failure scenario.

For each scenario below, provide:
1. PROBABILITY (0.0 - 1.0): How likely is this to happen?
   - 0.9-1.0: Almost certain
   - 0.7-0.9: Very likely
   - 0.4-0.7: Possible
   - 0.2-0.4: Unlikely
   - 0.0-0.2: Very unlikely

2. IMPACT (0.0 - 1.0): How severe are the consequences?
   - 0.9-1.0: Catastrophic (data loss, major outage, security breach)
   - 0.7-0.9: Severe (significant downtime, recoverable data loss)
   - 0.4-0.7: Moderate (temporary issues, manual recovery needed)
   - 0.2-0.4: Minor (small inconvenience, easy to fix)
   - 0.0-0.2: Negligible (barely noticeable)

SCENARIOS:
${failures.map((f, i) => `${i + 1}. ${f.title}\n   ${f.description}`).join('\n\n')}

Context:
- Working directory: ${this.context.cwd}
- Detected patterns: ${this.detectedPatterns.map(p => p.category).join(', ') || 'none'}

For each scenario number, respond with:
RISK [number]:
PROBABILITY: [0.0-1.0]
IMPACT: [0.0-1.0]
JUSTIFICATION: [Brief explanation of scoring]

Be conservative - overestimate risk when uncertain.`;

    const response = await this.promptLLM(prompt);

    // Parse risk assessments
    const risks = this.parseRiskAssessments(response, failures);

    return risks;
  }

  /**
   * Parse risk assessments from LLM response
   * @param {string} response - LLM response
   * @param {Array} failures - Original failure scenarios
   * @returns {Array} Risk objects with scores
   */
  parseRiskAssessments(response, failures) {
    const risks = [];
    const riskBlocks = response.split(/RISK\s+\d+:/i).slice(1);

    for (let i = 0; i < riskBlocks.length && i < failures.length; i++) {
      const block = riskBlocks[i];
      const failure = failures[i];

      let probability = 0.5; // Default moderate probability
      let impact = 0.5;      // Default moderate impact
      let justification = '';

      // Extract probability
      const probMatch = block.match(/PROBABILITY:\s*([\d.]+)/i);
      if (probMatch) {
        probability = Math.max(0, Math.min(1, parseFloat(probMatch[1])));
      }

      // Extract impact
      const impactMatch = block.match(/IMPACT:\s*([\d.]+)/i);
      if (impactMatch) {
        impact = Math.max(0, Math.min(1, parseFloat(impactMatch[1])));
      }

      // Extract justification
      const justMatch = block.match(/JUSTIFICATION:\s*(.+?)(?=\n\n|$)/is);
      if (justMatch) {
        justification = justMatch[1].trim();
      }

      const score = probability * impact;
      const category = this.categorizeRisk(score);

      risks.push({
        scenario: failure.title,
        description: failure.description,
        probability,
        impact,
        score,
        category,
        justification
      });
    }

    // Sort by risk score (highest first)
    risks.sort((a, b) => b.score - a.score);

    return risks;
  }

  /**
   * Categorize risk based on score
   * @param {number} score - Risk score (0-1)
   * @returns {string} Risk category
   */
  categorizeRisk(score) {
    if (score >= RISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
    if (score >= RISK_THRESHOLDS.HIGH) return 'HIGH';
    if (score >= RISK_THRESHOLDS.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate safety checks (Phase 3)
   * @param {Array} risks - Assessed risks
   * @returns {Promise<Array>} Safety check commands
   */
  async generateSafetyChecks(risks) {
    const topRisks = risks.slice(0, 5); // Focus on top 5 risks

    const prompt = `You are generating PRE-EXECUTION SAFETY CHECKS to verify system state before proceeding.

Based on these risks:
${topRisks.map((r, i) => `${i + 1}. [${r.category}] ${r.scenario} (score: ${r.score.toFixed(2)})`).join('\n')}

Generate 5-8 specific, EXECUTABLE commands that should be run BEFORE executing the intended action.

Each check should:
1. Verify a critical assumption (backup exists, disk space available, etc.)
2. Be a real command that can be executed
3. Have clear pass/fail criteria
4. Be quick to run (<10 seconds)

Format:
CHECK: [Brief description]
COMMAND: [Actual shell command to run]
PASS_IF: [What output indicates success]
FAIL_IF: [What output indicates danger]

Examples:
CHECK: Verify backup exists
COMMAND: ls -lh backup_$(date +%Y%m%d).tar.gz
PASS_IF: File exists and size > 0
FAIL_IF: No such file or directory

CHECK: Confirm not in production
COMMAND: echo $ENVIRONMENT && hostname
PASS_IF: Output shows "development" or "staging"
FAIL_IF: Output shows "production" or "prod"

Working directory: ${this.context.cwd}

Generate checks now:`;

    const response = await this.promptLLM(prompt);

    // Parse safety checks
    const checks = this.parseSafetyChecks(response);

    return checks;
  }

  /**
   * Parse safety checks from LLM response
   * @param {string} response - LLM response
   * @returns {Array} Safety check objects
   */
  parseSafetyChecks(response) {
    const checks = [];
    const checkBlocks = response.split(/CHECK:/i).slice(1);

    for (const block of checkBlocks) {
      const check = {
        description: '',
        command: '',
        passIf: '',
        failIf: ''
      };

      const lines = block.trim().split('\n');
      check.description = lines[0]?.trim() || 'Unknown check';

      for (const line of lines) {
        if (line.match(/^COMMAND:/i)) {
          check.command = line.replace(/^COMMAND:\s*/i, '').trim();
        } else if (line.match(/^PASS_IF:/i)) {
          check.passIf = line.replace(/^PASS_IF:\s*/i, '').trim();
        } else if (line.match(/^FAIL_IF:/i)) {
          check.failIf = line.replace(/^FAIL_IF:\s*/i, '').trim();
        }
      }

      if (check.command) {
        checks.push(check);
      }
    }

    return checks;
  }

  /**
   * Create mitigation plan (Phase 4)
   * @param {Array} risks - Assessed risks
   * @returns {Promise<Object>} Mitigation plan with rollback procedures
   */
  async createMitigationPlan(risks) {
    const criticalRisks = risks.filter(r => r.category === 'CRITICAL');
    const highRisks = risks.filter(r => r.category === 'HIGH');

    const prompt = `You are creating a ROLLBACK AND RECOVERY PLAN in case the operation fails.

Critical Risks (must be addressed):
${criticalRisks.map((r, i) => `${i + 1}. ${r.scenario} (${r.score.toFixed(2)})`).join('\n') || 'None'}

High Risks (should be addressed):
${highRisks.map((r, i) => `${i + 1}. ${r.scenario} (${r.score.toFixed(2)})`).join('\n') || 'None'}

Generate:

1. ROLLBACK COMMANDS - Actual commands to undo the operation
   Format:
   ROLLBACK: [description]
   COMMAND: [actual command]
   WHEN: [when to use this]

2. RECOVERY PROCEDURES - Step-by-step recovery if things go wrong
   Format:
   PROCEDURE: [title]
   STEPS:
   1. [step]
   2. [step]
   ...

3. MONITORING - What to watch after execution
   Format:
   MONITOR: [what to check]
   HOW: [command or method]

4. ESCALATION - Who to contact in emergency
   Format:
   IF: [condition]
   CONTACT: [who/how]

Working directory: ${this.context.cwd}

Be specific and actionable.`;

    const response = await this.promptLLM(prompt);

    // Parse mitigation plan
    const plan = this.parseMitigationPlan(response, criticalRisks, highRisks);

    return plan;
  }

  /**
   * Parse mitigation plan from LLM response
   * @param {string} response - LLM response
   * @param {Array} criticalRisks - Critical risks
   * @param {Array} highRisks - High risks
   * @returns {Object} Structured mitigation plan
   */
  parseMitigationPlan(response, criticalRisks, highRisks) {
    const plan = {
      rollbackCommands: [],
      recoveryProcedures: [],
      monitoring: [],
      escalation: [],
      criticalRisksMitigated: criticalRisks.length === 0 // True if no critical risks
    };

    // Parse rollback commands
    const rollbackMatches = response.matchAll(/ROLLBACK:\s*(.+?)\n\s*COMMAND:\s*(.+?)(?:\n\s*WHEN:\s*(.+?))?(?=\n\n|\nROLLBACK:|\nPROCEDURE:|\nMONITOR:|\nIF:|$)/gis);
    for (const match of rollbackMatches) {
      plan.rollbackCommands.push({
        description: match[1].trim(),
        command: match[2].trim(),
        when: match[3]?.trim() || 'When operation fails'
      });
    }

    // Parse recovery procedures
    const procedureMatches = response.matchAll(/PROCEDURE:\s*(.+?)\n\s*STEPS:\s*(.+?)(?=\n\n|\nPROCEDURE:|\nMONITOR:|\nIF:|$)/gis);
    for (const match of procedureMatches) {
      const steps = match[2].trim().split(/\n\s*\d+\.\s*/).filter(s => s.trim());
      plan.recoveryProcedures.push({
        title: match[1].trim(),
        steps: steps.map(s => s.trim())
      });
    }

    // Parse monitoring
    const monitorMatches = response.matchAll(/MONITOR:\s*(.+?)\n\s*HOW:\s*(.+?)(?=\n\n|\nMONITOR:|\nIF:|$)/gis);
    for (const match of monitorMatches) {
      plan.monitoring.push({
        what: match[1].trim(),
        how: match[2].trim()
      });
    }

    // Parse escalation
    const escalationMatches = response.matchAll(/IF:\s*(.+?)\n\s*CONTACT:\s*(.+?)(?=\n\n|\nIF:|$)/gis);
    for (const match of escalationMatches) {
      plan.escalation.push({
        condition: match[1].trim(),
        contact: match[2].trim()
      });
    }

    return plan;
  }

  /**
   * Generate final recommendation
   * @param {Array} risks - All assessed risks
   * @param {Array} safetyChecks - Generated safety checks
   * @param {Object} mitigations - Mitigation plan
   * @param {boolean} shouldProceed - Whether it's safe to proceed
   * @returns {Object} Recommendation object
   */
  generateRecommendation(risks, safetyChecks, mitigations, shouldProceed) {
    const criticalCount = risks.filter(r => r.category === 'CRITICAL').length;
    const highCount = risks.filter(r => r.category === 'HIGH').length;

    let severity = 'LOW';
    let action = 'PROCEED';
    let message = 'Operation appears safe. Review safety checks before proceeding.';

    if (criticalCount > 0) {
      severity = 'CRITICAL';
      action = shouldProceed ? 'PROCEED_WITH_CAUTION' : 'STOP';
      message = shouldProceed
        ? `${criticalCount} CRITICAL risks identified but mitigations are in place. Review carefully before proceeding.`
        : `${criticalCount} CRITICAL risks identified without adequate mitigations. DO NOT PROCEED until risks are addressed.`;
    } else if (highCount > 0) {
      severity = 'HIGH';
      action = 'REVIEW_REQUIRED';
      message = `${highCount} HIGH risks identified. Review safety checks and mitigation plan before proceeding.`;
    }

    return {
      severity,
      action,
      message,
      riskSummary: {
        critical: criticalCount,
        high: highCount,
        medium: risks.filter(r => r.category === 'MEDIUM').length,
        low: risks.filter(r => r.category === 'LOW').length,
        total: risks.length
      },
      requiresConfirmation: criticalCount > 0 || highCount > 0,
      safetyCheckCount: safetyChecks.length,
      hasRollbackPlan: mitigations.rollbackCommands.length > 0
    };
  }

  /**
   * Override getResult to include pre-mortem specific data
   * @returns {Object} Enhanced FrameworkResult
   */
  getResult() {
    const baseResult = super.getResult();

    return {
      ...baseResult,
      solution: {
        risks: this.risks,
        safetyChecks: this.safetyChecks,
        mitigations: this.mitigations,
        recommendation: this.state.context.recommendation,
        shouldProceed: this.state.context.shouldProceed,
        detectedPatterns: this.detectedPatterns
      },
      nextSteps: this.generateNextSteps()
    };
  }

  /**
   * Generate next steps based on analysis
   * @returns {Array} Recommended next steps
   */
  generateNextSteps() {
    const steps = [];
    const { recommendation } = this.state.context;

    if (!recommendation) return steps;

    if (recommendation.action === 'STOP') {
      steps.push('DO NOT PROCEED - Critical risks must be addressed first');
      steps.push('Review all CRITICAL risks and implement mitigations');
      steps.push('Consider alternative approaches with lower risk');
    } else if (recommendation.action === 'PROCEED_WITH_CAUTION') {
      steps.push('Run all safety checks and verify they pass');
      steps.push('Review mitigation plan and ensure rollback commands are ready');
      steps.push('Have recovery procedures accessible');
      steps.push('Proceed only if all safety checks pass');
    } else if (recommendation.action === 'REVIEW_REQUIRED') {
      steps.push('Run all safety checks before proceeding');
      steps.push('Review mitigation plan');
      steps.push('Ensure rollback commands are tested and ready');
    } else {
      steps.push('Run safety checks as a precaution');
      steps.push('Proceed with operation');
    }

    if (this.safetyChecks.length > 0) {
      steps.push(`Execute ${this.safetyChecks.length} safety checks before proceeding`);
    }

    return steps;
  }
}

module.exports = PreMortemFramework;
