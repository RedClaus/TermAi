/**
 * Extraction Engine
 * Uses LLM to identify problem-solution patterns in conversations
 * and extract structured knowledge for the skill database
 */

const crypto = require('crypto');

/**
 * @typedef {import('../types/ingestion').ImportedConversation} ImportedConversation
 * @typedef {import('../types/ingestion').ConversationMessage} ConversationMessage
 * @typedef {import('../types/ingestion').ExtractionCandidate} ExtractionCandidate
 * @typedef {import('../types/ingestion').ConversationSegment} ConversationSegment
 * @typedef {import('../types/ingestion').SolutionStep} SolutionStep
 * @typedef {import('../types/ingestion').InferredContext} InferredContext
 */

class ExtractionEngine {
  /**
   * @param {Object} options
   * @param {Function} options.llmChat - Function to call LLM (messages) => Promise<string>
   * @param {Function} [options.embedQuery] - Optional embedding function for similarity
   */
  constructor(options = {}) {
    this.llmChat = options.llmChat;
    this.embedQuery = options.embedQuery;
  }

  /**
   * Set the LLM chat function
   * @param {Function} llmChat
   */
  setLLMChat(llmChat) {
    this.llmChat = llmChat;
  }

  /**
   * Set the embedding function
   * @param {Function} embedQuery
   */
  setEmbedQuery(embedQuery) {
    this.embedQuery = embedQuery;
  }

  /**
   * Extract knowledge patterns from a conversation
   * @param {ImportedConversation} conversation
   * @returns {Promise<ExtractionCandidate[]>}
   */
  async extractKnowledge(conversation) {
    if (!this.llmChat) {
      console.warn('[ExtractionEngine] No LLM configured, skipping extraction');
      return [];
    }

    try {
      // Step 1: Identify problem-solving segments
      const segments = await this.identifySegments(conversation);

      if (segments.length === 0) {
        console.log(`[ExtractionEngine] No segments found in conversation ${conversation.id}`);
        return [];
      }

      console.log(`[ExtractionEngine] Found ${segments.length} segments in conversation ${conversation.id}`);

      // Step 2: Extract structured knowledge from each segment
      /** @type {ExtractionCandidate[]} */
      const candidates = [];

      for (const segment of segments) {
        try {
          const candidate = await this.extractFromSegment(conversation, segment);
          if (candidate && candidate.confidence > 0.4) {
            candidates.push(candidate);
          }
        } catch (e) {
          console.warn(`[ExtractionEngine] Segment extraction failed:`, e.message);
        }
      }

      return candidates;
    } catch (e) {
      console.error(`[ExtractionEngine] Extraction failed for ${conversation.id}:`, e.message);
      return [];
    }
  }

  /**
   * Identify problem-solving segments in a conversation
   * @param {ImportedConversation} conversation
   * @returns {Promise<ConversationSegment[]>}
   */
  async identifySegments(conversation) {
    const formattedConversation = this.formatConversation(conversation.messages);

    const prompt = `Analyze this conversation and identify problem-solving segments.

A problem-solving segment is a portion of the conversation where:
1. A user encounters an error, issue, or asks how to accomplish something
2. There's troubleshooting, debugging, or step-by-step guidance
3. Eventually there's a resolution (successful or unsuccessful)

Conversation:
${formattedConversation}

Return a JSON array of segments. Each segment should identify:
- startIndex: The message index where the problem begins (0-based)
- endIndex: The message index where the solution ends (0-based)
- problemType: One of "installation_error", "configuration", "runtime_error", "how_to", "debugging", "refactoring"
- briefDescription: A 1-sentence description of the problem
- wasResolved: true if the problem was solved, false otherwise
- confidence: 0-1, how confident you are this is a valid, reusable pattern

Only include segments that could be useful for future reference. Skip casual conversation, greetings, or context-setting without actual problem-solving.

Respond with ONLY valid JSON array, no markdown:
[{"startIndex": 0, "endIndex": 5, "problemType": "installation_error", "briefDescription": "...", "wasResolved": true, "confidence": 0.85}]

If no valid segments exist, return: []`;

    try {
      const response = await this.llmChat([
        { role: 'user', content: prompt }
      ]);

      // Parse JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const segments = JSON.parse(jsonMatch[0]);

      // Validate and filter segments
      return segments.filter(s =>
        typeof s.startIndex === 'number' &&
        typeof s.endIndex === 'number' &&
        s.startIndex >= 0 &&
        s.endIndex >= s.startIndex &&
        s.endIndex < conversation.messages.length &&
        s.confidence > 0.3
      );
    } catch (e) {
      console.error('[ExtractionEngine] Segment identification failed:', e.message);
      return [];
    }
  }

  /**
   * Extract structured knowledge from a segment
   * @param {ImportedConversation} conversation
   * @param {ConversationSegment} segment
   * @returns {Promise<ExtractionCandidate|null>}
   */
  async extractFromSegment(conversation, segment) {
    const relevantMessages = conversation.messages.slice(
      segment.startIndex,
      segment.endIndex + 1
    );

    const formattedSegment = this.formatConversation(relevantMessages);

    const prompt = `Extract a reusable problem-solution pattern from this conversation segment.

Segment (messages ${segment.startIndex} to ${segment.endIndex}):
${formattedSegment}

Extract the following information:

1. Problem:
   - description: Clear, concise description of what went wrong or what the user needed
   - errorText: The exact error message if present (or null)
   - errorPatterns: Regex patterns that would match similar errors (array of strings)
   - triggerCommand: The command that caused the issue, if applicable (or null)

2. Solution:
   - description: Brief description of what fixed it
   - steps: Array of solution steps, each with:
     - type: "command" (shell command), "check" (verification), "explanation" (context), or "file_edit"
     - content: The actual command, check, or explanation
   - wasSuccessful: true if this actually worked

3. Inferred Context (from clues in the conversation):
   - os: "darwin", "linux", "windows", or null if unknown
   - shell: "bash", "zsh", "powershell", or null
   - packageManager: "npm", "yarn", "pip", "brew", "apt", or null
   - language: Primary programming language mentioned, or null
   - framework: Framework if detected (e.g., "react", "django"), or null
   - tools: Array of tools/services mentioned (e.g., ["docker", "git"])

4. confidence: 0-1, how confident this is a good, reusable pattern

Respond with ONLY valid JSON (no markdown):
{
  "problem": {
    "description": "...",
    "errorText": "..." or null,
    "errorPatterns": ["..."],
    "triggerCommand": "..." or null
  },
  "solution": {
    "description": "...",
    "steps": [{"type": "command", "content": "..."}],
    "wasSuccessful": true
  },
  "inferredContext": {
    "os": null,
    "shell": null,
    "packageManager": null,
    "language": null,
    "framework": null,
    "tools": []
  },
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this is useful"
}

If this segment doesn't contain a clear, reusable pattern, respond with:
{"skip": true, "reason": "explanation"}`;

    try {
      const response = await this.llmChat([
        { role: 'user', content: prompt }
      ]);

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const extracted = JSON.parse(jsonMatch[0]);

      if (extracted.skip) {
        console.log(`[ExtractionEngine] Skipped segment: ${extracted.reason}`);
        return null;
      }

      // Build the candidate
      /** @type {ExtractionCandidate} */
      const candidate = {
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        confidence: extracted.confidence || 0.5,
        problem: {
          description: extracted.problem.description,
          errorText: extracted.problem.errorText || undefined,
          errorPatterns: extracted.problem.errorPatterns || [],
          triggerCommand: extracted.problem.triggerCommand || undefined,
          messageRange: [segment.startIndex, segment.endIndex]
        },
        solution: {
          description: extracted.solution.description,
          steps: this.normalizeSolutionSteps(extracted.solution.steps),
          messageRange: [segment.startIndex, segment.endIndex],
          wasSuccessful: extracted.solution.wasSuccessful !== false
        },
        inferredContext: this.normalizeContext(extracted.inferredContext),
        status: 'pending'
      };

      return candidate;
    } catch (e) {
      console.error('[ExtractionEngine] Segment extraction failed:', e.message);
      return null;
    }
  }

  /**
   * Format conversation messages for LLM prompt
   * @param {ConversationMessage[]} messages
   * @param {number} [maxLength=4000]
   * @returns {string}
   */
  formatConversation(messages, maxLength = 4000) {
    const formatted = messages.map((m, i) => {
      const role = m.role.toUpperCase();
      let content = m.content;

      // Truncate very long messages
      if (content.length > 1500) {
        content = content.slice(0, 1500) + '... [truncated]';
      }

      return `[${i}] ${role}: ${content}`;
    }).join('\n\n');

    // Truncate overall if needed
    if (formatted.length > maxLength) {
      return formatted.slice(0, maxLength) + '\n... [conversation truncated]';
    }

    return formatted;
  }

  /**
   * Normalize solution steps to consistent format
   * @param {Object[]} steps
   * @returns {SolutionStep[]}
   */
  normalizeSolutionSteps(steps) {
    if (!Array.isArray(steps)) {
      return [];
    }

    return steps.map(step => ({
      type: this.normalizeStepType(step.type),
      content: String(step.content || step.command || step.text || ''),
      description: step.description || undefined
    })).filter(s => s.content);
  }

  /**
   * Normalize step type to valid enum value
   * @param {string} type
   * @returns {'command'|'check'|'explanation'|'file_edit'}
   */
  normalizeStepType(type) {
    const normalized = String(type).toLowerCase();
    if (['command', 'cmd', 'shell', 'bash'].includes(normalized)) {
      return 'command';
    }
    if (['check', 'verify', 'test', 'validation'].includes(normalized)) {
      return 'check';
    }
    if (['file_edit', 'edit', 'file', 'modify'].includes(normalized)) {
      return 'file_edit';
    }
    return 'explanation';
  }

  /**
   * Normalize inferred context
   * @param {Object} context
   * @returns {InferredContext}
   */
  normalizeContext(context) {
    if (!context) {
      return { tools: [] };
    }

    return {
      os: context.os || undefined,
      shell: context.shell || undefined,
      packageManager: context.packageManager || undefined,
      language: context.language || undefined,
      framework: context.framework || undefined,
      tools: Array.isArray(context.tools) ? context.tools : []
    };
  }

  /**
   * Convert an extraction candidate to a Skill for storage
   * @param {ExtractionCandidate} candidate
   * @returns {Object} Skill object compatible with existing skills.json format
   */
  candidateToSkill(candidate) {
    // Build use_when description
    let useWhen = candidate.problem.description;
    if (candidate.problem.errorText) {
      useWhen += ` (Error: ${candidate.problem.errorText.slice(0, 100)})`;
    }

    // Build tool_sops from solution steps
    const toolSops = candidate.solution.steps
      .filter(s => s.type === 'command')
      .map(s => ({
        tool_name: 'terminal',
        action: s.content
      }));

    // If no commands, include explanations
    if (toolSops.length === 0) {
      for (const step of candidate.solution.steps) {
        toolSops.push({
          tool_name: step.type,
          action: step.content
        });
      }
    }

    // Build preferences from context
    const preferences = [];
    if (candidate.inferredContext.os) {
      preferences.push(`OS: ${candidate.inferredContext.os}`);
    }
    if (candidate.inferredContext.packageManager) {
      preferences.push(`Package Manager: ${candidate.inferredContext.packageManager}`);
    }
    if (candidate.inferredContext.framework) {
      preferences.push(`Framework: ${candidate.inferredContext.framework}`);
    }
    if (candidate.inferredContext.tools && candidate.inferredContext.tools.length > 0) {
      preferences.push(`Tools: ${candidate.inferredContext.tools.join(', ')}`);
    }

    return {
      use_when: useWhen,
      preferences: preferences.length > 0 ? preferences.join('; ') : undefined,
      tool_sops: toolSops,
      // Add metadata for tracking source
      _source: {
        type: 'ingestion',
        conversationId: candidate.conversationId,
        candidateId: candidate.id,
        confidence: candidate.confidence
      }
    };
  }
}

module.exports = ExtractionEngine;
