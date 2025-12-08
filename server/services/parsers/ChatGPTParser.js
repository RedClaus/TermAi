/**
 * ChatGPT Conversation Parser
 * Parses exported conversations from ChatGPT (chat.openai.com)
 *
 * ChatGPT export format (JSON):
 * {
 *   "title": "...",
 *   "create_time": 1705123456.789,
 *   "update_time": 1705123456.789,
 *   "mapping": {
 *     "node-id-1": {
 *       "id": "node-id-1",
 *       "message": {
 *         "id": "msg-id",
 *         "author": { "role": "user"|"assistant"|"system" },
 *         "content": { "content_type": "text", "parts": ["..."] },
 *         "create_time": 1705123456.789
 *       },
 *       "parent": "parent-node-id",
 *       "children": ["child-node-id"]
 *     }
 *   }
 * }
 */

const crypto = require('crypto');

/**
 * @typedef {import('../../types/ingestion').ImportedConversation} ImportedConversation
 * @typedef {import('../../types/ingestion').ConversationMessage} ConversationMessage
 * @typedef {import('../../types/ingestion').CodeBlock} CodeBlock
 */

class ChatGPTParser {
  constructor() {
    this.name = 'ChatGPTParser';
    this.source = 'chatgpt';
  }

  /**
   * Detect if content is a ChatGPT export
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

      // Single conversation with mapping structure
      if (data.mapping && typeof data.mapping === 'object' && data.title !== undefined) {
        return true;
      }

      // Array of conversations (full export)
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        if (first.mapping && first.title !== undefined) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Parse ChatGPT export into ImportedConversation[]
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {ImportedConversation[]}
   */
  parse(content, filename) {
    const data = JSON.parse(content);

    // Handle single conversation or array
    const conversations = Array.isArray(data) ? data : [data];

    return conversations
      .filter(conv => conv.mapping) // Skip any malformed entries
      .map(conv => this.parseConversation(conv, filename));
  }

  /**
   * Parse a single ChatGPT conversation
   * @param {Object} conv - Raw conversation object
   * @param {string} filename - Source filename
   * @returns {ImportedConversation}
   */
  parseConversation(conv, filename) {
    const messages = this.flattenMessages(conv.mapping);

    return {
      id: crypto.randomUUID(),
      source: 'chatgpt',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      messages,
      metadata: {
        originalId: conv.id,
        title: conv.title || 'Untitled Conversation',
        createdAt: conv.create_time
          ? new Date(conv.create_time * 1000).toISOString()
          : undefined
      }
    };
  }

  /**
   * Flatten the tree-structured mapping into linear messages
   * @param {Object} mapping - ChatGPT's node mapping
   * @returns {ConversationMessage[]}
   */
  flattenMessages(mapping) {
    /** @type {ConversationMessage[]} */
    const messages = [];
    const visited = new Set();

    // Build parent-child relationships
    const nodeMap = new Map(Object.entries(mapping));

    // Find root node (no parent or parent not in mapping)
    let rootId = null;
    for (const [id, node] of nodeMap) {
      if (!node.parent || !nodeMap.has(node.parent)) {
        rootId = id;
        break;
      }
    }

    if (!rootId) {
      // Fallback: just iterate all nodes
      for (const node of Object.values(mapping)) {
        const msg = this.extractMessage(node);
        if (msg) messages.push(msg);
      }
      return messages;
    }

    // DFS traversal from root
    const traverse = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) return;

      const msg = this.extractMessage(node);
      if (msg) {
        messages.push(msg);
      }

      // Visit children in order
      if (node.children && Array.isArray(node.children)) {
        for (const childId of node.children) {
          traverse(childId);
        }
      }
    };

    traverse(rootId);
    return messages;
  }

  /**
   * Extract a ConversationMessage from a ChatGPT node
   * @param {Object} node
   * @returns {ConversationMessage|null}
   */
  extractMessage(node) {
    if (!node.message || !node.message.content) {
      return null;
    }

    const { message } = node;
    const role = message.author?.role;

    // Only include user and assistant messages
    if (role !== 'user' && role !== 'assistant') {
      return null;
    }

    // Extract content from parts
    let content = '';
    if (message.content.parts && Array.isArray(message.content.parts)) {
      content = message.content.parts
        .filter(part => typeof part === 'string')
        .join('\n');
    } else if (typeof message.content === 'string') {
      content = message.content;
    }

    if (!content.trim()) {
      return null;
    }

    const codeBlocks = this.extractCodeBlocks(content);

    return {
      role,
      content,
      timestamp: message.create_time
        ? new Date(message.create_time * 1000).toISOString()
        : undefined,
      metadata: {
        codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
        errorOutput: this.detectErrorOutput(content)
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

module.exports = ChatGPTParser;
