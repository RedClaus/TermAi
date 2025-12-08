const BaseFramework = require('./BaseFramework');

/**
 * Theory of Constraints (TOC) Framework
 *
 * Identifies and optimizes system bottlenecks for maximum throughput.
 * Based on Eliyahu Goldratt's Theory of Constraints methodology.
 *
 * Best For:
 * - Performance optimization
 * - Bottleneck identification
 * - Slow systems and processes
 * - Resource utilization issues
 * - Throughput maximization
 *
 * Phases:
 * 1. system_mapping - Identify all components and throughput metrics
 * 2. constraint_finding - Locate the bottleneck (the constraint)
 * 3. exploit - Maximize efficiency of the current constraint
 * 4. subordinate - Align other system parts to support the constraint
 * 5. elevate - Add capacity if optimization isn't enough
 *
 * Core TOC Principle:
 * The throughput of any system is limited by its weakest link (constraint).
 * Optimizing anything other than the constraint is an illusion.
 *
 * Iterative Process:
 * After elevating the constraint, a new bottleneck emerges.
 * The framework can loop up to 3 times to address multiple constraints.
 */
class TOCFramework extends BaseFramework {
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    // TOC-specific state
    this.systemMap = [];           // All system components
    this.constraints = [];          // Identified bottlenecks
    this.currentConstraint = null;  // Active constraint being optimized
    this.optimizations = [];        // Applied optimizations
    this.throughputMetrics = {
      before: null,
      after: null
    };

    // Allow up to 3 constraint cycles
    this.maxIterations = 3;
    this.currentIteration = 0;

    // Throughput measurement methods
    this.metricMethods = {
      LATENCY: 'latency',           // Time to complete operation
      THROUGHPUT: 'throughput',     // Operations per second
      QUEUE_LENGTH: 'queue',        // Backlog/queue size
      UTILIZATION: 'utilization',   // Resource usage %
      ERROR_RATE: 'error_rate'      // Failure rate
    };
  }

  // ============================================================================
  // FRAMEWORK INTERFACE
  // ============================================================================

  getName() {
    return 'theory_of_constraints';
  }

  getPhases() {
    return [
      'system_mapping',
      'constraint_finding',
      'exploit',
      'subordinate',
      'elevate'
    ];
  }

  /**
   * Execute Theory of Constraints analysis and optimization
   * @param {string} problem - The performance/bottleneck problem
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    try {
      // Iterative TOC process (can address multiple constraints)
      for (this.currentIteration = 0; this.currentIteration < this.maxIterations; this.currentIteration++) {
        // Phase 1: Map the system components and throughput
        await this.mapSystem(problem);

        if (this.systemMap.length === 0) {
          throw new Error('Failed to map system components');
        }

        // Phase 2: Find the constraint (bottleneck)
        await this.findConstraint();

        if (!this.currentConstraint) {
          // No constraint found - system is balanced
          this.state.status = 'complete';
          this.addStep('constraint_finding',
            'No significant constraint found. System appears balanced.');
          break;
        }

        // Phase 3: Exploit the constraint (optimize what exists)
        await this.exploitConstraint();

        // Phase 4: Subordinate other processes to the constraint
        await this.subordinateToConstraint();

        // Phase 5: Elevate the constraint (add capacity if needed)
        const elevated = await this.elevateConstraint();

        // Check if we should continue (new constraint may emerge)
        if (!elevated.shouldContinue || this.currentIteration >= this.maxIterations - 1) {
          this.state.status = 'complete';
          break;
        }

        // Prepare for next iteration
        this.addStep('elevate',
          `Constraint elevated. Checking for new bottlenecks (iteration ${this.currentIteration + 2}/${this.maxIterations})...`);
        this.state.loopCount++;
      }

      // Generate final recommendations
      await this.generateRecommendations(problem);

      return this.getResult();
    } catch (error) {
      this.state.status = 'failed';
      this.addStep('elevate', `Fatal error: ${error.message}`);
      return this.getResult();
    }
  }

  // ============================================================================
  // PHASE 1: SYSTEM MAPPING
  // ============================================================================

  /**
   * Identify all system components and measure their throughput
   * @param {string} problem - The performance problem
   * @returns {Promise<void>}
   */
  async mapSystem(problem) {
    const iterationLabel = this.currentIteration > 0
      ? ` (Iteration ${this.currentIteration + 1})`
      : '';

    const step = this.addStep('system_mapping',
      `Mapping system components and measuring throughput${iterationLabel}...`);

    const mapPrompt = `Analyze this system and identify all components that affect performance:

PROBLEM: ${problem}

CONTEXT:
- Current directory: ${this.context.cwd}
- System: Linux
${this.optimizations.length > 0 ? `- Previous optimizations applied: ${this.optimizations.length}` : ''}

Map the system by identifying:
1. All components in the workflow/pipeline (e.g., database, API, cache, network, CPU, disk)
2. Current throughput/performance of each component
3. Dependencies between components
4. Measurable metrics for each component

Use commands to gather real data where possible:
- Process metrics: ps, top, htop
- Network: netstat, ss, ping, curl with timing
- Disk I/O: iostat, df, du
- Database: query logs, connection pools, slow query logs
- Application: logs, profiling data, health checks

Respond with a JSON object:
{
  "components": [
    {
      "name": "Component name",
      "type": "database|api|cache|network|cpu|disk|memory|process|other",
      "currentThroughput": "Measured value with units (e.g., '100 req/sec', '5 queries/sec', '80% CPU')",
      "maxCapacity": "Theoretical or observed maximum (e.g., '500 req/sec', '1000 IOPS')",
      "utilizationPercent": 85,
      "measurementMethod": "How this was measured (command or observation)",
      "dependencies": ["List", "of", "components", "this", "depends", "on"],
      "metrics": {
        "latency": "50ms",
        "queueLength": 100,
        "errorRate": "2%"
      }
    }
  ],
  "systemFlow": "Brief description of how data flows through components",
  "gatheringCommands": [
    "List of commands to run to gather metrics"
  ]
}

Return ONLY the JSON object, no markdown.`;

    try {
      const response = await this.promptLLM(mapPrompt);

      // Parse JSON response
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\s*$/g, '').trim();
      }

      const mapData = JSON.parse(jsonStr);

      // Execute gathering commands to get real metrics
      if (mapData.gatheringCommands && Array.isArray(mapData.gatheringCommands)) {
        for (const cmd of mapData.gatheringCommands.slice(0, 5)) { // Limit to 5 commands
          const result = this.executeCommand(cmd, 10000);
          if (result.success) {
            // Store command output for LLM analysis
            mapData.commandOutputs = mapData.commandOutputs || {};
            mapData.commandOutputs[cmd] = result.output;
          }
        }
      }

      // Store the system map
      this.systemMap = mapData.components || [];
      this.state.context.systemFlow = mapData.systemFlow;
      this.state.context.commandOutputs = mapData.commandOutputs;

      // Calculate average utilization
      const avgUtil = this.systemMap.length > 0
        ? this.systemMap.reduce((sum, c) => sum + (c.utilizationPercent || 0), 0) / this.systemMap.length
        : 0;

      this.updateStep(step.id, {
        result: {
          success: true,
          output: `Mapped ${this.systemMap.length} components. Average utilization: ${avgUtil.toFixed(1)}%`
        },
        confidence: 0.7
      });

      // Record metrics before optimization
      if (this.currentIteration === 0) {
        this.throughputMetrics.before = {
          components: this.systemMap.length,
          avgUtilization: avgUtil
        };
      }

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: `Failed to map system: ${error.message}`
        },
        confidence: 0.2
      });
      throw error;
    }
  }

  // ============================================================================
  // PHASE 2: CONSTRAINT FINDING
  // ============================================================================

  /**
   * Identify the constraint (bottleneck) in the system
   * @returns {Promise<void>}
   */
  async findConstraint() {
    const step = this.addStep('constraint_finding',
      'Analyzing components to identify the constraint (bottleneck)...');

    const constraintPrompt = `Identify the constraint (bottleneck) in this system:

SYSTEM COMPONENTS:
${JSON.stringify(this.systemMap, null, 2)}

SYSTEM FLOW:
${this.state.context.systemFlow || 'Not specified'}

${this.state.context.commandOutputs ? `MEASURED DATA:\n${JSON.stringify(this.state.context.commandOutputs, null, 2)}` : ''}

Theory of Constraints Principle:
The constraint is the component that limits overall system throughput.
It has the HIGHEST utilization, longest queue, or causes backups in the system.

Analyze each component and identify THE ONE constraint that:
1. Has the highest utilization percentage
2. Is operating at or near capacity
3. Causes queuing or waiting in other components
4. Has the slowest throughput relative to demand
5. Other components are waiting for it

Signs of a constraint:
- High utilization (>80%)
- Growing queues/backlogs
- Other components are idle waiting for it
- Longest processing time in the critical path

Respond with JSON:
{
  "constraint": {
    "component": "Name of the bottleneck component",
    "reason": "Why this is the constraint",
    "evidence": [
      "Specific metrics showing it's the bottleneck"
    ],
    "impact": "How this constraint limits overall throughput",
    "utilizationPercent": 95,
    "severity": "critical|high|medium"
  },
  "alternativeConstraints": [
    {
      "component": "Name",
      "reason": "Why it could be the constraint",
      "utilizationPercent": 85
    }
  ]
}

If no clear constraint exists (system is balanced), set constraint to null.
Return ONLY the JSON object, no markdown.`;

    try {
      const response = await this.promptLLM(constraintPrompt);

      // Parse JSON
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\s*$/g, '').trim();
      }

      const constraintData = JSON.parse(jsonStr);

      if (constraintData.constraint && constraintData.constraint.component) {
        this.currentConstraint = constraintData.constraint;
        this.constraints.push({
          ...this.currentConstraint,
          iteration: this.currentIteration,
          timestamp: Date.now()
        });

        this.updateStep(step.id, {
          result: {
            success: true,
            output: `Constraint identified: ${this.currentConstraint.component} (${this.currentConstraint.utilizationPercent}% utilization) - ${this.currentConstraint.reason}`
          },
          confidence: 0.85
        });

        // Store in context
        this.state.context.currentConstraint = this.currentConstraint;
        this.state.context.alternativeConstraints = constraintData.alternativeConstraints || [];
      } else {
        // No constraint found
        this.currentConstraint = null;

        this.updateStep(step.id, {
          result: {
            success: true,
            output: 'No significant constraint found. System appears balanced.'
          },
          confidence: 0.7
        });
      }

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: `Failed to identify constraint: ${error.message}`
        },
        confidence: 0.3
      });
      throw error;
    }
  }

  // ============================================================================
  // PHASE 3: EXPLOIT THE CONSTRAINT
  // ============================================================================

  /**
   * Maximize the efficiency of the current constraint without adding resources
   * @returns {Promise<void>}
   */
  async exploitConstraint() {
    if (!this.currentConstraint) {
      return;
    }

    const step = this.addStep('exploit',
      `Exploiting constraint: ${this.currentConstraint.component}...`);

    const exploitPrompt = `Generate strategies to EXPLOIT (maximize efficiency of) this constraint:

CONSTRAINT:
Component: ${this.currentConstraint.component}
Utilization: ${this.currentConstraint.utilizationPercent}%
Issue: ${this.currentConstraint.reason}
Impact: ${this.currentConstraint.impact}

CONTEXT:
- Current directory: ${this.context.cwd}
- System components: ${this.systemMap.length}

EXPLOIT means:
Get MORE output from the constraint WITHOUT adding resources.
Focus on eliminating waste, improving efficiency, reducing idle time.

Examples:
- Database constraint: Add indexes, optimize queries, tune connection pool
- CPU constraint: Optimize algorithms, reduce unnecessary processing, use caching
- Network constraint: Compress data, batch requests, use CDN
- Disk I/O constraint: Use faster serialization, optimize file formats, buffer writes
- API constraint: Add caching layer, optimize endpoint logic, reduce payload size

Generate specific, actionable optimizations:

Respond with JSON:
{
  "optimizations": [
    {
      "action": "Specific optimization to apply",
      "rationale": "Why this improves constraint efficiency",
      "commands": [
        "Commands to implement (if applicable)"
      ],
      "expectedImprovement": "Estimated improvement (e.g., '20% faster queries')",
      "risk": "low|medium|high",
      "reversible": true
    }
  ],
  "priority": "Order by impact (highest first)"
}

Return ONLY the JSON object, no markdown.`;

    try {
      const response = await this.promptLLM(exploitPrompt);

      // Parse JSON
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\s*$/g, '').trim();
      }

      const exploitData = JSON.parse(jsonStr);
      const optimizations = exploitData.optimizations || [];

      // Apply safe optimizations (low risk only in automated mode)
      const applied = [];
      for (const opt of optimizations) {
        if (opt.risk === 'low' && opt.commands && opt.commands.length > 0) {
          // Execute optimization commands
          for (const cmd of opt.commands.slice(0, 2)) { // Limit to 2 commands per optimization
            const result = this.executeCommand(cmd, 30000);
            applied.push({
              action: opt.action,
              command: cmd,
              success: result.success,
              output: result.output
            });
          }
        } else {
          // High/medium risk - recommend but don't auto-apply
          applied.push({
            action: opt.action,
            recommended: true,
            risk: opt.risk,
            commands: opt.commands
          });
        }

        this.optimizations.push({
          type: 'exploit',
          constraint: this.currentConstraint.component,
          action: opt.action,
          expectedImprovement: opt.expectedImprovement,
          applied: opt.risk === 'low'
        });
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: `Generated ${optimizations.length} exploit strategies. ${applied.filter(a => a.success).length} applied automatically.`
        },
        confidence: 0.8
      });

      this.state.context.exploitOptimizations = applied;

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: `Failed to exploit constraint: ${error.message}`
        },
        confidence: 0.4
      });
      // Continue despite error
    }
  }

  // ============================================================================
  // PHASE 4: SUBORDINATE TO CONSTRAINT
  // ============================================================================

  /**
   * Align other system components to support the constraint
   * @returns {Promise<void>}
   */
  async subordinateToConstraint() {
    if (!this.currentConstraint) {
      return;
    }

    const step = this.addStep('subordinate',
      `Subordinating other components to support ${this.currentConstraint.component}...`);

    const subordinatePrompt = `Align other system components to support the constraint:

CONSTRAINT:
Component: ${this.currentConstraint.component}
Utilization: ${this.currentConstraint.utilizationPercent}%

ALL COMPONENTS:
${JSON.stringify(this.systemMap, null, 2)}

SUBORDINATE means:
Adjust non-constraint components to feed the constraint at optimal rate.
Don't let other components overproduce or starve the constraint.

Examples:
- If DB is constraint: Reduce API request rate to match DB capacity
- If CPU is constraint: Add backpressure to input queue
- If network is constraint: Batch operations, reduce upstream throughput
- If disk is constraint: Implement write buffering, rate limit writes

Key principle: "Don't go faster than the constraint allows"

Generate subordination strategies:

Respond with JSON:
{
  "strategies": [
    {
      "component": "Non-constraint component to adjust",
      "action": "How to subordinate it to the constraint",
      "rationale": "Why this helps the constraint",
      "commands": [
        "Commands to implement"
      ],
      "expectedEffect": "How this improves overall throughput"
    }
  ]
}

Return ONLY the JSON object, no markdown.`;

    try {
      const response = await this.promptLLM(subordinatePrompt);

      // Parse JSON
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\s*$/g, '').trim();
      }

      const subordinateData = JSON.parse(jsonStr);
      const strategies = subordinateData.strategies || [];

      const applied = [];
      for (const strategy of strategies) {
        // Record strategy (don't auto-apply - these can be disruptive)
        applied.push({
          component: strategy.component,
          action: strategy.action,
          rationale: strategy.rationale,
          recommendedCommands: strategy.commands
        });

        this.optimizations.push({
          type: 'subordinate',
          constraint: this.currentConstraint.component,
          targetComponent: strategy.component,
          action: strategy.action,
          applied: false // Manual approval needed
        });
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: `Generated ${strategies.length} subordination strategies for other components.`
        },
        confidence: 0.75
      });

      this.state.context.subordinateStrategies = applied;

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: `Failed to generate subordination strategies: ${error.message}`
        },
        confidence: 0.4
      });
      // Continue despite error
    }
  }

  // ============================================================================
  // PHASE 5: ELEVATE THE CONSTRAINT
  // ============================================================================

  /**
   * Increase capacity of the constraint (if optimization isn't enough)
   * @returns {Promise<Object>} { shouldContinue: boolean }
   */
  async elevateConstraint() {
    if (!this.currentConstraint) {
      return { shouldContinue: false };
    }

    const step = this.addStep('elevate',
      `Determining if constraint elevation is needed for ${this.currentConstraint.component}...`);

    const elevatePrompt = `Determine if the constraint needs MORE CAPACITY:

CONSTRAINT:
Component: ${this.currentConstraint.component}
Current Utilization: ${this.currentConstraint.utilizationPercent}%
Severity: ${this.currentConstraint.severity}

OPTIMIZATIONS APPLIED:
${JSON.stringify(this.optimizations, null, 2)}

ELEVATE means:
Add more resources/capacity to the constraint.
Only do this if exploit + subordinate optimizations aren't enough.

Examples:
- Scale up (bigger server, more CPU, more memory)
- Scale out (add more instances, sharding, load balancing)
- Upgrade infrastructure (SSD instead of HDD, faster network)
- Parallelize the constraint

Determine:
1. Is elevation needed? (or is exploit/subordinate sufficient?)
2. What elevation options exist?
3. After elevation, what will be the new constraint?

Respond with JSON:
{
  "elevationNeeded": true,
  "reason": "Why elevation is/isn't needed",
  "elevationOptions": [
    {
      "approach": "Scale up|Scale out|Upgrade|Parallelize",
      "description": "Specific elevation strategy",
      "commands": ["Commands to implement"],
      "estimatedCost": "low|medium|high",
      "estimatedImprovement": "Expected improvement"
    }
  ],
  "newConstraintPrediction": "After elevating, which component becomes the new bottleneck?",
  "continueOptimization": false
}

Set continueOptimization=true only if elevation will shift the constraint to another component.
Return ONLY the JSON object, no markdown.`;

    try {
      const response = await this.promptLLM(elevatePrompt);

      // Parse JSON
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\s*$/g, '').trim();
      }

      const elevateData = JSON.parse(jsonStr);

      this.state.context.elevationNeeded = elevateData.elevationNeeded;
      this.state.context.elevationOptions = elevateData.elevationOptions || [];
      this.state.context.newConstraintPrediction = elevateData.newConstraintPrediction;

      const shouldContinue = elevateData.continueOptimization &&
                            this.currentIteration < this.maxIterations - 1;

      this.updateStep(step.id, {
        result: {
          success: true,
          output: `Elevation ${elevateData.elevationNeeded ? 'needed' : 'not needed'}. ` +
                  `${elevateData.elevationOptions.length} options identified. ` +
                  `${shouldContinue ? 'Will check for new constraint.' : 'Optimization complete.'}`
        },
        confidence: 0.8
      });

      // Record elevation recommendations
      for (const option of elevateData.elevationOptions || []) {
        this.optimizations.push({
          type: 'elevate',
          constraint: this.currentConstraint.component,
          approach: option.approach,
          description: option.description,
          estimatedCost: option.estimatedCost,
          applied: false // Requires manual approval/resources
        });
      }

      return { shouldContinue };

    } catch (error) {
      this.updateStep(step.id, {
        result: {
          success: false,
          output: `Failed to determine elevation strategy: ${error.message}`
        },
        confidence: 0.4
      });
      return { shouldContinue: false };
    }
  }

  // ============================================================================
  // FINAL RECOMMENDATIONS
  // ============================================================================

  /**
   * Generate comprehensive recommendations based on TOC analysis
   * @param {string} problem - Original problem statement
   * @returns {Promise<void>}
   */
  async generateRecommendations(problem) {
    const summaryPrompt = `Generate final recommendations based on Theory of Constraints analysis:

ORIGINAL PROBLEM: ${problem}

CONSTRAINTS IDENTIFIED:
${JSON.stringify(this.constraints, null, 2)}

OPTIMIZATIONS:
${JSON.stringify(this.optimizations, null, 2)}

SYSTEM STATE:
- Total constraints analyzed: ${this.constraints.length}
- Total optimizations recommended: ${this.optimizations.length}
- Optimizations auto-applied: ${this.optimizations.filter(o => o.applied).length}
- Iterations performed: ${this.currentIteration + 1}

Provide:
1. Executive Summary (2-3 sentences about the bottleneck and solution)
2. Immediate Actions (what can be done right now)
3. Short-term Actions (what needs planning/approval)
4. Long-term Actions (strategic improvements)
5. Expected Impact (quantify improvement if possible)
6. Monitoring Plan (how to track improvements)

Focus on actionable recommendations prioritized by impact and effort.`;

    try {
      const recommendations = await this.promptLLM(summaryPrompt);

      this.state.context.solution = recommendations;

      // Generate next steps
      const nextSteps = [];

      // Auto-applied optimizations
      const autoApplied = this.optimizations.filter(o => o.applied);
      if (autoApplied.length > 0) {
        nextSteps.push(`Verify ${autoApplied.length} auto-applied optimization(s)`);
      }

      // Manual optimizations
      const manualOpts = this.optimizations.filter(o => !o.applied && o.type === 'exploit');
      if (manualOpts.length > 0) {
        nextSteps.push(`Review and apply ${manualOpts.length} additional optimization(s)`);
      }

      // Subordination strategies
      const subordinate = this.optimizations.filter(o => o.type === 'subordinate');
      if (subordinate.length > 0) {
        nextSteps.push(`Implement ${subordinate.length} subordination strategy(ies)`);
      }

      // Elevation options
      const elevate = this.optimizations.filter(o => o.type === 'elevate');
      if (elevate.length > 0) {
        nextSteps.push(`Evaluate ${elevate.length} capacity elevation option(s)`);
      }

      this.state.context.nextSteps = nextSteps;

      // Record final metrics
      const currentAvgUtil = this.systemMap.length > 0
        ? this.systemMap.reduce((sum, c) => sum + (c.utilizationPercent || 0), 0) / this.systemMap.length
        : 0;

      this.throughputMetrics.after = {
        components: this.systemMap.length,
        avgUtilization: currentAvgUtil
      };

    } catch (error) {
      this.state.context.solution = `TOC Analysis completed. Identified ${this.constraints.length} constraint(s) and generated ${this.optimizations.length} optimization(s).`;
      this.state.context.nextSteps = ['Review constraints and optimizations in the analysis'];
    }
  }

  // ============================================================================
  // CUSTOM RESULT FORMATTING
  // ============================================================================

  /**
   * Override getResult to include TOC-specific details
   * @returns {Object} FrameworkResult
   */
  getResult() {
    const baseResult = super.getResult();

    return {
      ...baseResult,
      metadata: {
        ...baseResult.metadata,
        constraints: this.constraints,
        optimizations: this.optimizations,
        systemMap: this.systemMap,
        throughputMetrics: this.throughputMetrics,
        constraintsIdentified: this.constraints.length,
        optimizationsApplied: this.optimizations.filter(o => o.applied).length,
        optimizationsPending: this.optimizations.filter(o => !o.applied).length
      }
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get the framework-specific system prompt
   * @returns {string}
   */
  getFrameworkSystemPrompt() {
    return `You are an AI assistant using the Theory of Constraints (TOC) methodology to identify and optimize system bottlenecks.

TOC Core Principles:
1. Every system has at least one constraint that limits throughput
2. Optimizing non-constraints doesn't improve overall system performance
3. Focus all improvement efforts on the constraint

TOC Process:
1. IDENTIFY the constraint (the bottleneck)
2. EXPLOIT the constraint (get the most out of it without adding resources)
3. SUBORDINATE everything else to the constraint (align other components)
4. ELEVATE the constraint (add capacity if needed)
5. REPEAT (a new constraint will emerge)

Your current working directory is: ${this.context.cwd}

Phases: ${this.getPhases().join(' → ')}

Be data-driven. Use real measurements. Identify the ONE true bottleneck, not multiple "problem areas".
Focus on maximizing throughput of the ENTIRE SYSTEM, not individual components.`;
  }
}

module.exports = TOCFramework;
