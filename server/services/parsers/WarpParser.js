/**
 * Warp Terminal Parser
 * Parses exported sessions from Warp Terminal
 *
 * Warp can export in multiple formats:
 * - JSON session data
 * - Plain text command history
 * - Workflow YAML files
 */

const crypto = require('crypto');

/**
 * @typedef {import('../../types/ingestion').ImportedConversation} ImportedConversation
 * @typedef {import('../../types/ingestion').ConversationMessage} ConversationMessage
 * @typedef {import('../../types/ingestion').CodeBlock} CodeBlock
 */

class WarpParser {
  constructor() {
    this.name = 'WarpParser';
    this.source = 'warp';
  }

  /**
   * Detect if content is a Warp export
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {boolean}
   */
  detect(content, filename) {
    const lowerName = filename.toLowerCase();

    // Warp-specific filename patterns
    if (lowerName.includes('warp') || lowerName.endsWith('.warp')) {
      return true;
    }

    // Check for Warp JSON format
    if (filename.endsWith('.json')) {
      try {
        const data = JSON.parse(content);

        // Warp session format with blocks
        if (data.blocks && Array.isArray(data.blocks)) {
          const hasWarpStructure = data.blocks.some(
            block => block.command !== undefined || block.input !== undefined
          );
          if (hasWarpStructure) return true;
        }

        // Warp workflow format
        if (data.name && data.steps && Array.isArray(data.steps)) {
          return true;
        }

        return false;
      } catch {
        return false;
      }
    }

    // Check for YAML workflow format
    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
      // Simple heuristic for Warp workflows
      if (content.includes('steps:') && content.includes('command:')) {
        return true;
      }
    }

    // Plain text command history (from Warp export)
    if (filename.endsWith('.txt') || filename.endsWith('.sh')) {
      // Check for command-output pattern
      const lines = content.split('\n');
      let commandCount = 0;
      for (const line of lines) {
        if (line.startsWith('$ ') || line.startsWith('> ') || line.startsWith('% ')) {
          commandCount++;
        }
      }
      // If significant portion are commands, treat as Warp history
      if (commandCount > 3 && commandCount > lines.length * 0.1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse Warp export into ImportedConversation[]
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {ImportedConversation[]}
   */
  parse(content, filename) {
    // JSON format
    if (filename.endsWith('.json')) {
      return this.parseJson(content, filename);
    }

    // YAML format
    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
      return this.parseYaml(content, filename);
    }

    // Plain text command history
    return this.parseTextHistory(content, filename);
  }

  /**
   * Parse Warp JSON format
   * @param {string} content
   * @param {string} filename
   * @returns {ImportedConversation[]}
   */
  parseJson(content, filename) {
    const data = JSON.parse(content);
    /** @type {ImportedConversation[]} */
    const conversations = [];

    // Session with blocks
    if (data.blocks && Array.isArray(data.blocks)) {
      const messages = this.parseBlocks(data.blocks);
      conversations.push({
        id: crypto.randomUUID(),
        source: 'warp',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        messages,
        metadata: {
          originalId: data.id,
          title: data.title || data.name || 'Warp Session',
          createdAt: data.createdAt || data.timestamp
        }
      });
    }

    // Workflow format
    if (data.steps && Array.isArray(data.steps)) {
      const messages = this.parseWorkflowSteps(data.steps);
      conversations.push({
        id: crypto.randomUUID(),
        source: 'warp',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        messages,
        metadata: {
          title: data.name || 'Warp Workflow',
          tags: data.tags
        }
      });
    }

    // Array of sessions
    if (Array.isArray(data)) {
      for (const session of data) {
        if (session.blocks) {
          const messages = this.parseBlocks(session.blocks);
          conversations.push({
            id: crypto.randomUUID(),
            source: 'warp',
            sourceFile: filename,
            importedAt: new Date().toISOString(),
            messages,
            metadata: {
              originalId: session.id,
              title: session.title || 'Warp Session',
              createdAt: session.createdAt
            }
          });
        }
      }
    }

    return conversations;
  }

  /**
   * Parse Warp terminal blocks
   * @param {Object[]} blocks
   * @returns {ConversationMessage[]}
   */
  parseBlocks(blocks) {
    /** @type {ConversationMessage[]} */
    const messages = [];

    for (const block of blocks) {
      const command = block.command || block.input || '';
      const output = block.output || block.result || '';
      const exitCode = block.exitCode ?? block.exit_code ?? 0;

      if (command) {
        // Command as user message
        messages.push({
          role: 'user',
          content: command,
          timestamp: block.timestamp,
          metadata: {
            codeBlocks: [{
              language: 'bash',
              content: command,
              isCommand: true
            }]
          }
        });

        // Output as assistant response
        if (output) {
          messages.push({
            role: 'assistant',
            content: output,
            metadata: {
              errorOutput: exitCode !== 0 ? output : undefined
            }
          });
        }
      }
    }

    return messages;
  }

  /**
   * Parse Warp workflow steps
   * @param {Object[]} steps
   * @returns {ConversationMessage[]}
   */
  parseWorkflowSteps(steps) {
    /** @type {ConversationMessage[]} */
    const messages = [];

    for (const step of steps) {
      const command = step.command || step.cmd || '';
      const description = step.description || step.name || '';

      if (command) {
        // Description + command as user context
        const content = description
          ? `${description}\n\`\`\`bash\n${command}\n\`\`\``
          : command;

        messages.push({
          role: 'user',
          content,
          metadata: {
            codeBlocks: [{
              language: 'bash',
              content: command,
              isCommand: true
            }]
          }
        });
      }
    }

    return messages;
  }

  /**
   * Parse YAML workflow (basic parsing without yaml library)
   * @param {string} content
   * @param {string} filename
   * @returns {ImportedConversation[]}
   */
  parseYaml(content, filename) {
    // Basic YAML parsing for Warp workflows
    // Format:
    // name: Workflow Name
    // steps:
    //   - command: "echo hello"
    //     description: "Say hello"

    /** @type {ConversationMessage[]} */
    const messages = [];
    let workflowName = 'Warp Workflow';

    const lines = content.split('\n');
    let currentCommand = '';
    let currentDescription = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('name:')) {
        workflowName = trimmed.substring(5).trim().replace(/^["']|["']$/g, '');
      }

      if (trimmed.startsWith('command:') || trimmed.startsWith('- command:')) {
        // Save previous command if exists
        if (currentCommand) {
          messages.push({
            role: 'user',
            content: currentDescription
              ? `${currentDescription}\n\`\`\`bash\n${currentCommand}\n\`\`\``
              : currentCommand,
            metadata: {
              codeBlocks: [{
                language: 'bash',
                content: currentCommand,
                isCommand: true
              }]
            }
          });
        }

        currentCommand = trimmed
          .replace(/^-?\s*command:\s*/, '')
          .replace(/^["']|["']$/g, '');
        currentDescription = '';
      }

      if (trimmed.startsWith('description:')) {
        currentDescription = trimmed
          .substring(12)
          .trim()
          .replace(/^["']|["']$/g, '');
      }
    }

    // Don't forget last command
    if (currentCommand) {
      messages.push({
        role: 'user',
        content: currentDescription
          ? `${currentDescription}\n\`\`\`bash\n${currentCommand}\n\`\`\``
          : currentCommand,
        metadata: {
          codeBlocks: [{
            language: 'bash',
            content: currentCommand,
            isCommand: true
          }]
        }
      });
    }

    return [{
      id: crypto.randomUUID(),
      source: 'warp',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      messages,
      metadata: {
        title: workflowName
      }
    }];
  }

  /**
   * Parse plain text command history
   * @param {string} content
   * @param {string} filename
   * @returns {ImportedConversation[]}
   */
  parseTextHistory(content, filename) {
    /** @type {ConversationMessage[]} */
    const messages = [];
    const lines = content.split('\n');

    let currentCommand = '';
    let currentOutput = [];

    const commandPrefixes = ['$ ', '> ', '% ', '# '];

    for (const line of lines) {
      const isCommand = commandPrefixes.some(p => line.startsWith(p));

      if (isCommand) {
        // Save previous command-output pair
        if (currentCommand) {
          messages.push({
            role: 'user',
            content: currentCommand,
            metadata: {
              codeBlocks: [{
                language: 'bash',
                content: currentCommand,
                isCommand: true
              }]
            }
          });

          if (currentOutput.length > 0) {
            const output = currentOutput.join('\n');
            messages.push({
              role: 'assistant',
              content: output,
              metadata: {
                errorOutput: this.looksLikeError(output) ? output : undefined
              }
            });
          }
        }

        // Extract command (remove prefix)
        currentCommand = line.replace(/^[$>%#]\s*/, '');
        currentOutput = [];
      } else if (currentCommand && line.trim()) {
        currentOutput.push(line);
      }
    }

    // Don't forget last command
    if (currentCommand) {
      messages.push({
        role: 'user',
        content: currentCommand,
        metadata: {
          codeBlocks: [{
            language: 'bash',
            content: currentCommand,
            isCommand: true
          }]
        }
      });

      if (currentOutput.length > 0) {
        messages.push({
          role: 'assistant',
          content: currentOutput.join('\n')
        });
      }
    }

    return [{
      id: crypto.randomUUID(),
      source: 'warp',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      messages,
      metadata: {
        title: `Warp History - ${filename}`
      }
    }];
  }

  /**
   * Check if text looks like an error
   * @param {string} text
   * @returns {boolean}
   */
  looksLikeError(text) {
    const errorPatterns = [
      /error:/i,
      /Error:/,
      /ERROR/,
      /failed/i,
      /ENOENT/,
      /EACCES/,
      /command not found/i,
      /permission denied/i,
      /no such file/i,
      /fatal:/i,
      /panic:/i
    ];

    return errorPatterns.some(p => p.test(text));
  }
}

module.exports = WarpParser;
