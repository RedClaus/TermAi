/**
 * Claude Conversation Parser
 * Parses exported conversations from Claude (claude.ai)
 *
 * Claude export format (JSON):
 * {
 *   "uuid": "...",
 *   "name": "Conversation Title",
 *   "created_at": "2024-01-15T...",
 *   "updated_at": "2024-01-15T...",
 *   "chat_messages": [
 *     { "uuid": "...", "text": "...", "sender": "human"|"assistant", "created_at": "..." }
 *   ]
 * }
 */

const crypto = require('crypto');

/**
 * @typedef {import('../../types/ingestion').ImportedConversation} ImportedConversation
 * @typedef {import('../../types/ingestion').ConversationMessage} ConversationMessage
 * @typedef {import('../../types/ingestion').CodeBlock} CodeBlock
 */

class ClaudeParser {
  constructor() {
    this.name = 'ClaudeParser';
    this.source = 'claude';
  }

  /**
   * Detect if content is a Claude export
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {boolean}
   */
  detect(content, filename) {
    if (!filename.endsWith('.json')) {
      return false;
    }

    try {
      const data = JSON.parse(content);

      // Single conversation format
      if (data.uuid && data.chat_messages && Array.isArray(data.chat_messages)) {
        return true;
      }

      // Array of conversations
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        if (first.uuid && first.chat_messages) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Parse Claude export into ImportedConversation[]
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {ImportedConversation[]}
   */
  parse(content, filename) {
    const data = JSON.parse(content);

    // Handle single conversation or array
    const conversations = Array.isArray(data) ? data : [data];

    return conversations.map(conv => this.parseConversation(conv, filename));
  }

  /**
   * Parse a single Claude conversation
   * @param {Object} conv - Raw conversation object
   * @param {string} filename - Source filename
   * @returns {ImportedConversation}
   */
  parseConversation(conv, filename) {
    /** @type {ConversationMessage[]} */
    const messages = (conv.chat_messages || []).map(msg => {
      const role = msg.sender === 'human' ? 'user' : 'assistant';
      const codeBlocks = this.extractCodeBlocks(msg.text || '');

      return {
        role,
        content: msg.text || '',
        timestamp: msg.created_at,
        metadata: {
          codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
          errorOutput: this.detectErrorOutput(msg.text || '')
        }
      };
    });

    return {
      id: crypto.randomUUID(),
      source: 'claude',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      messages,
      metadata: {
        originalId: conv.uuid,
        title: conv.name || 'Untitled Conversation',
        createdAt: conv.created_at,
        model: conv.model || undefined
      }
    };
  }

  /**
   * Extract code blocks from markdown text
   * @param {string} text
   * @returns {CodeBlock[]}
   */
  extractCodeBlocks(text) {
    const blocks = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const language = match[1] || 'text';
      const content = match[2].trim();

      blocks.push({
        language,
        content,
        isCommand: this.isShellLanguage(language)
      });
    }

    return blocks;
  }

  /**
   * Check if language indicates a shell command
   * @param {string} language
   * @returns {boolean}
   */
  isShellLanguage(language) {
    const shellLangs = ['bash', 'sh', 'shell', 'zsh', 'terminal', 'console', 'powershell', 'cmd'];
    return shellLangs.includes(language.toLowerCase());
  }

  /**
   * Detect if text contains error output
   * @param {string} text
   * @returns {string|undefined}
   */
  detectErrorOutput(text) {
    // Common error patterns
    const errorPatterns = [
      /error:/i,
      /Error:/,
      /ERROR/,
      /failed/i,
      /exception/i,
      /traceback/i,
      /ENOENT/,
      /EACCES/,
      /command not found/i,
      /permission denied/i,
      /no such file/i,
      /cannot find/i,
      /undefined is not/i,
      /TypeError:/,
      /ReferenceError:/,
      /SyntaxError:/
    ];

    for (const pattern of errorPatterns) {
      if (pattern.test(text)) {
        // Extract the error context (up to 500 chars around match)
        const match = text.match(pattern);
        if (match) {
          const start = Math.max(0, match.index - 100);
          const end = Math.min(text.length, match.index + 400);
          return text.slice(start, end).trim();
        }
      }
    }

    return undefined;
  }
}

module.exports = ClaudeParser;
