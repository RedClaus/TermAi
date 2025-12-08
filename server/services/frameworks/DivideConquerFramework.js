const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * DivideConquerFramework - Break complex systems into components for isolated testing
 *
 * Uses binary search and component decomposition to efficiently locate failures
 * in multi-component systems. Ideal for integration issues and complex failures
 * where the root cause could be in any of many interconnected parts.
 *
 * Phases:
 * 1. Decomposition - Break system into testable components (create component tree)
 * 2. Isolation - Test each component independently
 * 3. Localization - Narrow down to failing component(s) using binary search
 * 4. Resolution - Fix identified component(s)
 *
 * @extends BaseFramework
 */
class DivideConquerFramework extends BaseFramework {
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);
    this.definition = FRAMEWORK_DEFINITIONS.divide_conquer;
    this.maxIterations = this.definition.maxIterations || 10;

    // Component tracking
    this.componentTree = null;
    this.testedComponents = new Map(); // component_id -> { pass: boolean, output: string }
    this.failingComponents = [];
    this.passingComponents = [];

    // Binary search state
    this.searchQueue = [];
    this.testIterations = 0;
  }

  /**
   * Get framework name
   * @returns {string}
   */
  getName() {
    return 'divide_conquer';
  }

  /**
   * Get framework phases
   * @returns {string[]}
   */
  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the Divide & Conquer framework on a problem
   * @param {string} problem - The problem to solve
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(problem) {
    this.state.framework = this.getName();
    this.state.status = 'active';

    try {
      // Phase 1: Decomposition
      await this.decompose(problem);

      if (!this.componentTree || this.componentTree.components.length === 0) {
        throw new Error('Failed to decompose system into testable components');
      }

      // Phase 2: Isolation
      await this.isolate();

      // Phase 3: Localization
      await this.localize();

      // Phase 4: Resolution
      const solution = await this.resolve();

      // Mark as complete
      this.state.status = 'complete';
      this.state.context.solution = solution;

      const summaryStep = this.addStep(
        'complete',
        `Successfully identified and resolved ${this.failingComponents.length} failing component(s) through ${this.testIterations} test iterations`,
        null
      );
      summaryStep.confidence = 0.9;

      return this.getResult();

    } catch (error) {
      this.state.status = 'failed';
      this.addStep('error', `Framework execution failed: ${error.message}`, null);
      throw error;
    }
  }

  /**
   * Phase 1: Decomposition - Break system into testable components
   * Creates a component tree with dependencies
   * @param {string} problem - The problem being investigated
   * @returns {Promise<Object>} Component tree
   */
  async decompose(problem) {
    const step = this.addStep('decomposition', 'Breaking system into testable components...', null);

    const decomposePrompt = `Analyze this problem and decompose the system into testable components:

Problem: ${problem}

Working directory: ${this.context.cwd}

Create a hierarchical component tree where:
1. Each component represents a testable unit (service, module, API, database, etc.)
2. Components have dependencies on each other
3. Each component can be tested independently with a command or verification step
4. Start with high-level components and break down to atomic testable units

Return ONLY a JSON object like:
{
  "system_name": "Brief system name",
  "components": [
    {
      "id": "unique_component_id",
      "name": "Component Name",
      "description": "What this component does",
      "test_command": "Command to test this component independently",
      "dependencies": ["other_component_id"],
      "level": 0,
      "critical": true
    }
  ]
}

Guidelines:
- Use IDs like: "frontend", "backend_api", "database", "auth_service", etc.
- test_command should be executable and return success/failure
- level 0 = leaf components (no dependencies), higher = depends on others
- critical = true if failure would cause system-wide issues
- Aim for 5-15 components total (granular but not excessive)

No other text, just the JSON object.`;

    const systemPrompt = `You are a systems architect specializing in component decomposition.
Your task is to break complex systems into testable, independent components.
Be thorough but practical - components must be actually testable.
Working directory: ${this.context.cwd}`;

    const response = await this.promptLLM(decomposePrompt, { systemPrompt });

    let componentTree = null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        componentTree = JSON.parse(jsonMatch[0]);

        // Validate the tree
        if (!componentTree.components || componentTree.components.length === 0) {
          throw new Error('No components in tree');
        }

        // Sort components by level (test leaves first, then dependencies)
        componentTree.components.sort((a, b) => (a.level || 0) - (b.level || 0));
      }
    } catch (error) {
      console.error('[DivideConquer] Failed to parse component tree:', error);
      // Fallback: create a simple component structure
      componentTree = {
        system_name: 'System',
        components: [
          {
            id: 'system_core',
            name: 'Core System',
            description: 'Main system component',
            test_command: 'echo "Testing core system"',
            dependencies: [],
            level: 0,
            critical: true
          }
        ]
      };
    }

    this.componentTree = componentTree;
    this.state.context.componentTree = componentTree;

    const summary = `Decomposed system into ${componentTree.components.length} components:
${componentTree.components.map(c =>
  `  - [L${c.level}] ${c.name} (${c.id})${c.critical ? ' [CRITICAL]' : ''}`
).join('\n')}`;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(componentTree, null, 2) },
      confidence: 0.8
    });

    return componentTree;
  }

  /**
   * Phase 2: Isolation - Test each component independently
   * Runs test commands for all components to determine pass/fail status
   * @returns {Promise<void>}
   */
  async isolate() {
    const step = this.addStep('isolation', 'Testing components independently...', null);

    const results = [];
    let testedCount = 0;
    let passCount = 0;
    let failCount = 0;

    // Test components in dependency order (leaves first)
    for (const component of this.componentTree.components) {
      testedCount++;
      this.testIterations++;

      console.log(`[DivideConquer] Testing component: ${component.id} (${testedCount}/${this.componentTree.components.length})`);

      // Execute test command
      const testResult = this.executeCommand(component.test_command, 15000);

      const componentResult = {
        id: component.id,
        name: component.name,
        pass: testResult.success,
        output: testResult.output.substring(0, 500),
        critical: component.critical || false
      };

      results.push(componentResult);
      this.testedComponents.set(component.id, componentResult);

      if (testResult.success) {
        this.passingComponents.push(component.id);
        passCount++;
      } else {
        this.failingComponents.push(component.id);
        failCount++;
        console.log(`[DivideConquer] FAILURE: ${component.id}`);
      }
    }

    const summary = `Tested ${testedCount} components:
  ✓ Passing: ${passCount}
  ✗ Failing: ${failCount}

Failing components:
${this.failingComponents.map(id => {
  const comp = this.componentTree.components.find(c => c.id === id);
  return `  - ${comp?.name || id}${comp?.critical ? ' [CRITICAL]' : ''}`;
}).join('\n') || '  (none)'}`;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(results, null, 2) },
      confidence: failCount === 0 ? 0.9 : 0.7
    });

    this.state.context.isolationResults = results;
  }

  /**
   * Phase 3: Localization - Use binary search to narrow down root cause
   * Analyzes failing components and their dependencies to find the root failure
   * @returns {Promise<void>}
   */
  async localize() {
    const step = this.addStep('localization', 'Analyzing failures to locate root cause...', null);

    if (this.failingComponents.length === 0) {
      this.updateStep(step.id, {
        thought: 'No failing components detected - system appears healthy',
        confidence: 0.5
      });
      return;
    }

    // Build dependency analysis
    const localizePrompt = `Analyze the component test results to identify the root cause(s):

System: ${this.componentTree.system_name}

Component Test Results:
${this.componentTree.components.map(c => {
  const result = this.testedComponents.get(c.id);
  return `
Component: ${c.name} (${c.id})
Description: ${c.description}
Dependencies: ${c.dependencies.length > 0 ? c.dependencies.join(', ') : 'none'}
Critical: ${c.critical}
Test Command: ${c.test_command}
Status: ${result.pass ? '✓ PASS' : '✗ FAIL'}
${!result.pass ? `Error Output: ${result.output.substring(0, 300)}` : ''}`;
}).join('\n---')}

Failing Components: ${this.failingComponents.join(', ')}

Analyze the dependency chain to identify:
1. Root cause components (failing components that other components depend on)
2. Cascading failures (components failing because a dependency failed)
3. Independent failures (components failing for their own reasons)

Return ONLY a JSON object like:
{
  "root_causes": [
    {
      "component_id": "id of root cause",
      "reason": "Why this is the root cause",
      "cascading_failures": ["components that fail because of this"],
      "confidence": 0.9
    }
  ],
  "analysis": "Overall analysis of the failure pattern"
}

No other text, just the JSON object.`;

    const systemPrompt = `You are a systems debugging expert specializing in failure analysis.
Identify root causes by analyzing component dependencies and failure patterns.
Distinguish between root causes and cascading failures.
Be precise and evidence-based.`;

    const response = await this.promptLLM(localizePrompt, { systemPrompt });

    let localizationResult = null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        localizationResult = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[DivideConquer] Failed to parse localization:', error);
      // Fallback: treat all failing components as independent root causes
      localizationResult = {
        root_causes: this.failingComponents.map(id => ({
          component_id: id,
          reason: 'Component test failed',
          cascading_failures: [],
          confidence: 0.5
        })),
        analysis: 'Unable to perform detailed dependency analysis'
      };
    }

    this.state.context.localizationResult = localizationResult;

    const summary = `Root cause analysis:

${localizationResult.root_causes.map((rc, i) => {
  const comp = this.componentTree.components.find(c => c.id === rc.component_id);
  return `${i + 1}. ${comp?.name || rc.component_id} [${(rc.confidence * 100).toFixed(0)}% confidence]
   Reason: ${rc.reason}
   ${rc.cascading_failures.length > 0 ? `   Causes cascading failures in: ${rc.cascading_failures.join(', ')}` : ''}`;
}).join('\n\n')}

Analysis: ${localizationResult.analysis}`;

    const avgConfidence = localizationResult.root_causes.length > 0
      ? localizationResult.root_causes.reduce((sum, rc) => sum + rc.confidence, 0) / localizationResult.root_causes.length
      : 0.5;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(localizationResult, null, 2) },
      confidence: avgConfidence
    });
  }

  /**
   * Phase 4: Resolution - Fix identified component(s)
   * Generates and optionally executes fixes for root cause components
   * @returns {Promise<Object>} Solution object
   */
  async resolve() {
    const step = this.addStep('resolution', 'Generating fixes for root causes...', null);

    if (this.failingComponents.length === 0) {
      this.updateStep(step.id, {
        thought: 'No fixes needed - all components passing',
        confidence: 1.0
      });
      return {
        fixes_needed: false,
        message: 'System is healthy - all components passing'
      };
    }

    const localizationResult = this.state.context.localizationResult;
    const rootCauses = localizationResult?.root_causes || [];

    const resolvePrompt = `Generate fixes for the identified root cause components:

${rootCauses.map((rc, i) => {
  const comp = this.componentTree.components.find(c => c.id === rc.component_id);
  const result = this.testedComponents.get(rc.component_id);
  return `
Root Cause ${i + 1}: ${comp?.name || rc.component_id}
Description: ${comp?.description}
Test Command: ${comp?.test_command}
Reason for Failure: ${rc.reason}
Error Output:
${result?.output || 'No output captured'}`;
}).join('\n---\n')}

For each root cause, provide:
1. Diagnosis of what's wrong
2. Command to fix it (or manual steps if no command possible)
3. Verification command to confirm fix worked
4. Expected outcome after fix

Return ONLY a JSON object like:
{
  "fixes": [
    {
      "component_id": "id",
      "diagnosis": "What's wrong",
      "fix_command": "Command to fix (or null if manual)",
      "manual_steps": "Human-readable steps if fix_command is null",
      "verify_command": "Command to verify fix",
      "expected_outcome": "What should happen after fix"
    }
  ],
  "fix_order": ["component_id_1", "component_id_2"],
  "estimated_time": "5 minutes",
  "requires_manual_intervention": false
}

No other text, just the JSON object.`;

    const systemPrompt = `You are a systems repair expert.
Generate precise, executable fixes for component failures.
Consider dependencies - fix lower-level components first.
Be safe and conservative.
Working directory: ${this.context.cwd}`;

    const response = await this.promptLLM(resolvePrompt, { systemPrompt });

    let solution = null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        solution = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[DivideConquer] Failed to parse resolution:', error);
      solution = {
        fixes: rootCauses.map(rc => ({
          component_id: rc.component_id,
          diagnosis: rc.reason,
          fix_command: null,
          manual_steps: 'Manual investigation required',
          verify_command: this.componentTree.components.find(c => c.id === rc.component_id)?.test_command,
          expected_outcome: 'Component test passes'
        })),
        fix_order: rootCauses.map(rc => rc.component_id),
        estimated_time: 'Unknown',
        requires_manual_intervention: true
      };
    }

    const summary = `Generated fixes for ${solution.fixes.length} component(s):

${solution.fixes.map((fix, i) => {
  const comp = this.componentTree.components.find(c => c.id === fix.component_id);
  return `${i + 1}. ${comp?.name || fix.component_id}
   Diagnosis: ${fix.diagnosis}
   Fix: ${fix.fix_command || fix.manual_steps}
   Verification: ${fix.verify_command}`;
}).join('\n\n')}

Fix Order: ${solution.fix_order.join(' → ')}
Estimated Time: ${solution.estimated_time}
Manual Intervention: ${solution.requires_manual_intervention ? 'Yes' : 'No'}`;

    this.updateStep(step.id, {
      thought: summary,
      result: { success: true, output: JSON.stringify(solution, null, 2) },
      confidence: 0.8
    });

    this.state.context.nextSteps = solution.fixes.map(fix =>
      fix.fix_command || fix.manual_steps
    );

    return solution;
  }

  /**
   * Get framework-specific system prompt
   * @returns {string}
   */
  getFrameworkSystemPrompt() {
    return `You are an AI systems debugger using the Divide & Conquer framework for component-based failure analysis.

Working directory: ${this.context.cwd}

Divide & Conquer Philosophy:
- Break complex systems into testable components
- Test components independently to isolate failures
- Use binary search principles to efficiently narrow down problems
- Analyze dependencies to distinguish root causes from cascading failures
- Fix root causes first, then verify cascading issues resolve

Your phases:
1. DECOMPOSITION: Break system into hierarchical testable components
2. ISOLATION: Test each component independently
3. LOCALIZATION: Use dependency analysis to find root causes
4. RESOLUTION: Generate targeted fixes for root cause components

Be systematic, thorough, and efficient in your component testing strategy.`;
  }
}

module.exports = DivideConquerFramework;
