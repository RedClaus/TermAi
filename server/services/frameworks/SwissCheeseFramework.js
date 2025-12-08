const BaseFramework = require('./BaseFramework');
const { FRAMEWORK_DEFINITIONS } = require('./types');

/**
 * SwissCheeseFramework - Multi-layered defense analysis for post-incident review
 *
 * Based on James Reason's Swiss Cheese Model, this framework analyzes how
 * multiple defense layers failed simultaneously to allow an incident to occur.
 * Each defense layer has "holes" (weaknesses), and incidents happen when holes
 * align to create a path through all defenses.
 *
 * @extends BaseFramework
 */
class SwissCheeseFramework extends BaseFramework {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Execution context
   * @param {Function} llmChatFn - LLM chat function
   */
  constructor(sessionId, context, llmChatFn) {
    super(sessionId, context, llmChatFn);

    this.definition = FRAMEWORK_DEFINITIONS.swiss_cheese;

    // Defense layer categories (typical for software systems)
    this.layerCategories = [
      'prevention',      // Design, architecture, input validation
      'detection',       // Monitoring, logging, alerting
      'containment',     // Rate limiting, circuit breakers, isolation
      'response',        // Incident response, runbooks, escalation
      'recovery',        // Backups, rollback mechanisms, redundancy
      'organizational'   // Process, training, communication, culture
    ];

    // State tracking
    this.defenseLayers = [];     // Array of identified defense layers
    this.holes = {};              // Map of layer -> array of holes
    this.alignmentPath = [];      // Sequence of holes that aligned
    this.improvements = [];       // Recommended fixes
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  getName() {
    return 'swiss_cheese';
  }

  getPhases() {
    return this.definition.phases.map(p => p.name);
  }

  /**
   * Execute the Swiss Cheese Model analysis
   * @param {string} incident - The incident/failure to analyze
   * @returns {Promise<Object>} FrameworkResult
   */
  async execute(incident) {
    try {
      this.state.context.incident = incident;

      // Phase 1: Identify all defensive layers
      await this.identifyDefenseLayers(incident);

      // Phase 2: Find holes (failures) at each layer
      await this.findHoles(this.defenseLayers);

      // Phase 3: Analyze how holes aligned to allow incident
      await this.analyzeAlignment(this.holes);

      // Phase 4: Generate strengthening recommendations
      await this.generateStrengthening(this.alignmentPath);

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
   * Phase 1: Identify all defensive layers that should have prevented the incident
   * @param {string} incident - The incident to analyze
   */
  async identifyDefenseLayers(incident) {
    const step = this.addStep('layer_identification',
      'Identifying all defensive layers that should have prevented this incident...',
      null
    );

    const prompt = `Analyze this incident using the Swiss Cheese Model framework.

INCIDENT: ${incident}

The Swiss Cheese Model states that systems have multiple defensive layers, each with potential weaknesses ("holes").
Incidents occur when holes align across all layers, creating a path for failure.

Identify ALL defensive layers that should have prevented this incident. For each layer, describe:
1. What it is (specific defense mechanism)
2. What it was SUPPOSED to do (intended protection)
3. Which category it belongs to

DEFENSE LAYER CATEGORIES:
- **Prevention**: Design, architecture, input validation, access control
- **Detection**: Monitoring, logging, alerting, anomaly detection
- **Containment**: Rate limiting, circuit breakers, isolation, sandboxing
- **Response**: Incident response procedures, runbooks, escalation paths
- **Recovery**: Backups, rollback mechanisms, redundancy, failover
- **Organizational**: Process, training, communication, documentation, culture

Format your response as:

DEFENSE LAYERS:

1. [Layer Name] (Category: [category])
   - Purpose: [What it should prevent]
   - Implementation: [How it's implemented]

2. [Layer Name] (Category: [category])
   - Purpose: [What it should prevent]
   - Implementation: [How it's implemented]

[Continue for all layers - aim for 5-8 layers]

Identify layers from code level to organizational level. Be comprehensive.`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse the response to extract defense layers
      this.parseDefenseLayersResponse(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.7
      });

      this.state.context.defenseLayers = this.defenseLayers;

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
   * Parse LLM response to extract defense layers
   * @param {string} response - LLM response text
   */
  parseDefenseLayersResponse(response) {
    // Extract numbered layers (1. Layer Name)
    const layerMatches = response.matchAll(/(\d+)\.\s+([^\(]+)\s*\(Category:\s*([^\)]+)\)/gi);

    for (const match of layerMatches) {
      const layerName = match[2].trim();
      const category = match[3].trim().toLowerCase();

      // Extract purpose and implementation
      const layerText = response.substring(match.index);
      const nextLayerIndex = layerText.indexOf(/\d+\.\s+[^\(]+\(Category:/.test(layerText.substring(1)) ? layerText.substring(1).search(/\d+\.\s+[^\(]+\(Category:/) + 1 : layerText.length);
      const layerSection = layerText.substring(0, nextLayerIndex);

      const purposeMatch = layerSection.match(/Purpose:\s*([^\n]+)/i);
      const implMatch = layerSection.match(/Implementation:\s*([^\n]+)/i);

      this.defenseLayers.push({
        name: layerName,
        category: category,
        purpose: purposeMatch ? purposeMatch[1].trim() : '',
        implementation: implMatch ? implMatch[1].trim() : ''
      });
    }

    // Fallback: if no structured parsing worked, extract layer names from bullet points
    if (this.defenseLayers.length === 0) {
      const bulletMatches = response.matchAll(/[-•*]\s*([^\n]+)/g);
      for (const match of bulletMatches) {
        const text = match[1].trim();
        if (text.length > 5 && !text.startsWith('Purpose:') && !text.startsWith('Implementation:')) {
          this.defenseLayers.push({
            name: text,
            category: 'unknown',
            purpose: '',
            implementation: ''
          });
        }
      }
    }
  }

  /**
   * Phase 2: Find holes (failures) at each defense layer
   * @param {Array} defenseLayers - Array of defense layer objects
   */
  async findHoles(defenseLayers) {
    const step = this.addStep('hole_finding',
      'Identifying what failed (holes) at each defense layer...',
      null
    );

    const layersList = defenseLayers.map((layer, i) =>
      `${i + 1}. ${layer.name} (${layer.category})\n   Purpose: ${layer.purpose}`
    ).join('\n\n');

    const prompt = `For each defense layer, identify the "HOLE" (failure/weakness) that allowed the incident to pass through.

INCIDENT: ${this.state.context.incident}

DEFENSE LAYERS:
${layersList}

For each layer, identify:
1. **What went wrong**: What failed, was missing, or didn't work as intended
2. **Why it failed**: Root cause of the hole (design flaw, human error, not implemented, etc.)
3. **Severity**: How critical was this hole (High/Medium/Low)

A "hole" can be:
- Something that didn't exist (missing defense)
- Something that existed but failed (broken defense)
- Something that was bypassed (circumvented defense)
- Something that was inadequate (weak defense)

Format your response as:

HOLES IN DEFENSE LAYERS:

1. [Layer Name]
   HOLE: [What failed]
   WHY: [Root cause]
   SEVERITY: [High/Medium/Low]

2. [Layer Name]
   HOLE: [What failed]
   WHY: [Root cause]
   SEVERITY: [High/Medium/Low]

[Continue for all layers]

Be specific about technical details, configurations, or process failures.`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse holes for each layer
      this.parseHolesResponse(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.75
      });

      this.state.context.holes = this.holes;

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
   * Parse LLM response to extract holes for each layer
   * @param {string} response - LLM response text
   */
  parseHolesResponse(response) {
    // Match each layer section
    const layerSections = response.matchAll(/(\d+)\.\s+([^\n]+)\n\s*HOLE:\s*([^\n]+)\n\s*WHY:\s*([^\n]+)\n\s*SEVERITY:\s*([^\n]+)/gi);

    for (const match of layerSections) {
      const layerName = match[2].trim();
      const hole = match[3].trim();
      const why = match[4].trim();
      const severity = match[5].trim().toLowerCase();

      if (!this.holes[layerName]) {
        this.holes[layerName] = [];
      }

      this.holes[layerName].push({
        hole,
        why,
        severity: severity.includes('high') ? 'high' : severity.includes('low') ? 'low' : 'medium'
      });
    }

    // Fallback: if structured parsing failed, create generic holes
    if (Object.keys(this.holes).length === 0) {
      this.defenseLayers.forEach(layer => {
        this.holes[layer.name] = [{
          hole: 'Defense layer failed or was bypassed',
          why: 'Specific failure mode not identified',
          severity: 'medium'
        }];
      });
    }
  }

  /**
   * Phase 3: Analyze how holes aligned to create incident path
   * @param {Object} holes - Map of layer -> holes
   */
  async analyzeAlignment(holes) {
    const step = this.addStep('alignment_analysis',
      'Analyzing how holes aligned across layers to allow the incident...',
      null
    );

    const holesText = Object.entries(holes).map(([layer, holeList]) =>
      `**${layer}**:\n${holeList.map(h => `  - ${h.hole} (${h.severity.toUpperCase()})`).join('\n')}`
    ).join('\n\n');

    const prompt = `Analyze how the holes aligned across all defense layers to allow this incident.

INCIDENT: ${this.state.context.incident}

HOLES IN EACH LAYER:
${holesText}

The Swiss Cheese Model shows that incidents occur when holes in multiple layers align, creating a straight path through all defenses.

Analyze:
1. **The sequence**: In what order did the incident pass through layers?
2. **The alignment**: Which specific holes lined up to create the path?
3. **The cascade**: Did failure in one layer make other layers more vulnerable?
4. **The timing**: Were any holes transient (temporary) vs permanent?
5. **The criticality**: Which hole alignment was most critical?

Format your response as:

INCIDENT PATH (Layer-by-Layer):

Step 1: [First layer]
- Hole exploited: [specific hole]
- Impact on next layer: [how it weakened next defense]

Step 2: [Second layer]
- Hole exploited: [specific hole]
- Impact on next layer: [how it weakened next defense]

[Continue through all layers]

CRITICAL ALIGNMENT POINT:
[Identify the single most critical point where, if any hole was closed, the incident would have been prevented]

CONTRIBUTING FACTORS:
- [Factor 1: Why holes aligned temporally]
- [Factor 2: Systemic issues]
- [Factor 3: etc.]`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse alignment path
      this.parseAlignmentResponse(response);

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.8
      });

      this.state.context.alignmentPath = this.alignmentPath;

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
   * Parse LLM response to extract alignment path
   * @param {string} response - LLM response text
   */
  parseAlignmentResponse(response) {
    // Extract step-by-step path
    const stepMatches = response.matchAll(/Step\s+(\d+):\s*([^\n]+)\n\s*-\s*Hole exploited:\s*([^\n]+)/gi);

    for (const match of stepMatches) {
      const stepNum = parseInt(match[1]);
      const layer = match[2].trim();
      const hole = match[3].trim();

      this.alignmentPath.push({
        step: stepNum,
        layer,
        hole
      });
    }

    // Extract critical alignment point
    const criticalMatch = response.match(/CRITICAL ALIGNMENT POINT:\s*\n*([^\n]+(?:\n(?![\w\s]+:)[^\n]+)*)/i);
    if (criticalMatch) {
      this.state.context.criticalPoint = criticalMatch[1].trim();
    }
  }

  /**
   * Phase 4: Generate strengthening recommendations to close holes
   * @param {Array} alignmentPath - The sequence of aligned holes
   */
  async generateStrengthening(alignmentPath) {
    const step = this.addStep('strengthening',
      'Generating recommendations to strengthen defenses and close holes...',
      null
    );

    const pathText = alignmentPath.map(p =>
      `${p.step}. ${p.layer}: ${p.hole}`
    ).join('\n');

    const holesText = Object.entries(this.holes).map(([layer, holeList]) =>
      `${layer}: ${holeList.map(h => `${h.hole} (${h.severity})`).join('; ')}`
    ).join('\n');

    const prompt = `Generate comprehensive recommendations to strengthen defenses and prevent recurrence.

INCIDENT: ${this.state.context.incident}

INCIDENT PATH:
${pathText}

ALL IDENTIFIED HOLES:
${holesText}

The goal is to close enough holes so that even if some failures occur, the incident path is blocked.

Provide recommendations in THREE tiers:

1. IMMEDIATE FIXES (Do Now):
   - Quick wins that close critical holes
   - Can be implemented in hours/days
   - Directly address this incident

2. MEDIUM-TERM IMPROVEMENTS (Do This Quarter):
   - Strengthen multiple layers
   - Require more effort/coordination
   - Prevent similar incident classes

3. LONG-TERM SYSTEMIC CHANGES (Strategic):
   - Organizational/cultural changes
   - Architecture improvements
   - Shift-left strategies

For each recommendation:
- Which layer(s) it strengthens
- What hole(s) it closes
- Implementation approach
- Expected impact

Also provide:
- **Redundancy strategy**: Which layers should overlap to provide backup
- **Monitoring improvements**: How to detect future hole alignments
- **Testing recommendations**: How to verify defenses work

Format clearly with actionable steps and commands where applicable.`;

    try {
      const response = await this.promptLLM(prompt);

      // Parse recommendations
      this.parseStrengtheningResponse(response);

      // Extract commands if present
      const commandMatches = response.matchAll(/```(?:bash|sh)?\n(.*?)```/gs);
      const commands = [];
      for (const match of commandMatches) {
        commands.push(match[1].trim());
      }

      this.updateStep(step.id, {
        result: {
          success: true,
          output: response
        },
        confidence: 0.85
      });

      this.state.context.improvements = this.improvements;
      this.state.context.commands = commands;
      this.state.context.solution = {
        incidentPath: this.alignmentPath,
        criticalPoint: this.state.context.criticalPoint,
        recommendations: response,
        commands
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

  /**
   * Parse strengthening recommendations from LLM response
   * @param {string} response - LLM response text
   */
  parseStrengtheningResponse(response) {
    // Extract recommendations by tier
    const tiers = ['IMMEDIATE FIXES', 'MEDIUM-TERM IMPROVEMENTS', 'LONG-TERM SYSTEMIC CHANGES'];

    for (const tier of tiers) {
      const tierMatch = response.match(new RegExp(`${tier}[^:]*:([\\s\\S]*?)(?=\\d+\\.|$|${tiers.find(t => t !== tier) || 'REDUNDANCY'})`, 'i'));

      if (tierMatch) {
        const tierText = tierMatch[1];
        const recMatches = tierText.matchAll(/[-•*]\s*([^\n]+)/g);

        for (const recMatch of recMatches) {
          this.improvements.push({
            tier: tier.toLowerCase().replace(/ /g, '_'),
            recommendation: recMatch[1].trim()
          });
        }
      }
    }
  }

  // ============================================================================
  // OVERRIDE: Custom System Prompt
  // ============================================================================

  getFrameworkSystemPrompt() {
    return `You are an expert in post-incident analysis using the Swiss Cheese Model (James Reason's framework).

SWISS CHEESE MODEL PRINCIPLES:
- Systems have multiple defensive layers (prevention, detection, containment, response, recovery)
- Each layer has "holes" (weaknesses/gaps)
- Holes are dynamic - they open and close over time
- Incidents occur when holes in ALL layers align simultaneously
- No single point of failure - it's always a combination

METHODOLOGY:
1. Layer Identification: Map all defenses that should have prevented the incident
2. Hole Finding: Identify what failed at each layer
3. Alignment Analysis: Trace how holes lined up to create incident path
4. Strengthening: Close critical holes and add redundancy

CURRENT WORKING DIRECTORY: ${this.context.cwd}

PHASES: ${this.getPhases().join(' → ')}

ANALYSIS APPROACH:
- Be forensic and systematic - trace the exact failure sequence
- Identify both active failures (immediate causes) and latent conditions (underlying weaknesses)
- Consider human factors, organizational culture, and systemic issues
- Focus on strengthening the system, not blaming individuals
- Recommend multiple mitigations (defense in depth)

Your goal is to ensure this incident class cannot recur by closing enough holes to block any alignment.`;
  }
}

module.exports = SwissCheeseFramework;
