/**
 * Cursor Conversation Parser
 * Parses exported conversations from Cursor IDE
 *
 * Cursor stores conversations in various formats:
 * - Composer sessions (multi-file edits)
 * - Chat sessions (inline chat)
 * - Agent sessions (autonomous mode)
 */

const crypto = require('crypto');

/**
 * @typedef {import('../../types/ingestion').ImportedConversation} ImportedConversation
 * @typedef {import('../../types/ingestion').ConversationMessage} ConversationMessage
 * @typedef {import('../../types/ingestion').CodeBlock} CodeBlock
 */

class CursorParser {
  constructor() {
    this.name = 'CursorParser';
    this.source = 'cursor';
  }

  /**
   * Detect if content is a Cursor export
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

      // Cursor Composer format
      if (data.composer && typeof data.composer === 'object') {
        return true;
      }

      // Cursor conversations array
      if (data.conversations && Array.isArray(data.conversations)) {
        return true;
      }

      // Cursor chat format (array of messages with specific structure)
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        // Cursor messages often have 'type' field with 'user' or 'assistant'
        if (first.type && (first.type === 'user' || first.type === 'assistant') && first.content) {
          return true;
        }
      }

      // Single session format
      if (data.messages && Array.isArray(data.messages) && data.sessionId) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Parse Cursor export into ImportedConversation[]
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {ImportedConversation[]}
   */
  parse(content, filename) {
    const data = JSON.parse(content);
    /** @type {ImportedConversation[]} */
    const conversations = [];

    // Cursor Composer format
    if (data.composer) {
      for (const [sessionId, session] of Object.entries(data.composer)) {
        if (session && session.messages) {
          conversations.push(this.parseSession(session, sessionId, filename));
        }
      }
      return conversations;
    }

    // Cursor conversations array
    if (data.conversations) {
      for (const conv of data.conversations) {
        if (conv.messages) {
          conversations.push(this.parseSession(conv, conv.id || crypto.randomUUID(), filename));
        }
      }
      return conversations;
    }

    // Direct messages array
    if (Array.isArray(data) && data.length > 0 && data[0].type) {
      return [this.parseMessagesArray(data, filename)];
    }

    // Single session
    if (data.messages) {
      return [this.parseSession(data, data.sessionId || crypto.randomUUID(), filename)];
    }

    return conversations;
  }

  /**
   * Parse a Cursor session into ImportedConversation
   * @param {Object} session - Session object
   * @param {string} sessionId - Session ID
   * @param {string} filename - Source filename
   * @returns {ImportedConversation}
   */
  parseSession(session, sessionId, filename) {
    /** @type {ConversationMessage[]} */
    const messages = (session.messages || []).map(msg => {
      // Cursor uses 'type' instead of 'role' sometimes
      const role = this.normalizeRole(msg.type || msg.role);
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);

      const codeBlocks = this.extractCodeBlocks(content);

      return {
        role,
        content,
        timestamp: msg.timestamp || msg.createdAt,
        metadata: {
          codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
          toolCalls: msg.toolCalls,
          errorOutput: this.detectErrorOutput(content)
        }
      };
    });

    return {
      id: crypto.randomUUID(),
      source: 'cursor',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      messages,
      metadata: {
        originalId: sessionId,
        title: session.title || session.name || 'Cursor Session',
        createdAt: session.createdAt || session.timestamp
      }
    };
  }

  /**
   * Parse a direct messages array
   * @param {Object[]} messages - Array of message objects
   * @param {string} filename - Source filename
   * @returns {ImportedConversation}
   */
  parseMessagesArray(messages, filename) {
    const parsedMessages = messages.map(msg => {
      const role = this.normalizeRole(msg.type || msg.role);
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);

      return {
        role,
        content,
        timestamp: msg.timestamp,
        metadata: {
          codeBlocks: this.extractCodeBlocks(content),
          errorOutput: this.detectErrorOutput(content)
        }
      };
    });

    return {
      id: crypto.randomUUID(),
      source: 'cursor',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      messages: parsedMessages,
      metadata: {
        title: 'Cursor Session'
      }
    };
  }

  /**
   * Normalize role names from Cursor format
   * @param {string} role
   * @returns {'user'|'assistant'|'system'|'tool'}
   */
  normalizeRole(role) {
    if (!role) return 'user';
    const lower = role.toLowerCase();
    if (lower === 'human' || lower === 'user') return 'user';
    if (lower === 'assistant' || lower === 'ai' || lower === 'bot') return 'assistant';
    if (lower === 'system') return 'system';
    if (lower === 'tool' || lower === 'function') return 'tool';
    return 'user';
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
      /no such file/i
    ];

    for (const pattern of errorPatterns) {
      if (pattern.test(text)) {
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

module.exports = CursorParser;
