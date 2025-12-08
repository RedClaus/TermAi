/**
 * Markdown/Generic Conversation Parser
 * Fallback parser for markdown files and plain text conversations
 *
 * Supports various conversation formats:
 * - User:/Assistant: labels
 * - Human:/AI: labels
 * - Q:/A: labels
 * - ChatML-style markers
 * - Generic markdown with code blocks
 */

const crypto = require('crypto');

/**
 * @typedef {import('../../types/ingestion').ImportedConversation} ImportedConversation
 * @typedef {import('../../types/ingestion').ConversationMessage} ConversationMessage
 * @typedef {import('../../types/ingestion').CodeBlock} CodeBlock
 */

class MarkdownParser {
  constructor() {
    this.name = 'MarkdownParser';
    this.source = 'markdown';

    // Role markers to detect (case-insensitive)
    this.userMarkers = [
      'user:', 'human:', 'me:', 'q:', 'question:',
      '**user**:', '**human**:', '## user', '## human',
      '<|user|>', '[user]', '>>> user'
    ];

    this.assistantMarkers = [
      'assistant:', 'ai:', 'claude:', 'chatgpt:', 'gpt:', 'a:', 'answer:',
      'bot:', 'model:', 'response:',
      '**assistant**:', '**ai**:', '## assistant', '## ai',
      '<|assistant|>', '[assistant]', '>>> assistant'
    ];
  }

  /**
   * Detect if content is a markdown conversation
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {boolean}
   */
  detect(content, filename) {
    // Accept markdown and text files
    if (!filename.endsWith('.md') && !filename.endsWith('.txt') && !filename.endsWith('.markdown')) {
      return false;
    }

    const lowerContent = content.toLowerCase();

    // Check for conversation markers
    const hasUserMarker = this.userMarkers.some(m => lowerContent.includes(m.toLowerCase()));
    const hasAssistantMarker = this.assistantMarkers.some(m => lowerContent.includes(m.toLowerCase()));

    // Need at least one of each
    if (hasUserMarker && hasAssistantMarker) {
      return true;
    }

    // Also accept files with multiple code blocks (likely a tutorial/walkthrough)
    const codeBlockCount = (content.match(/```/g) || []).length / 2;
    if (codeBlockCount >= 2) {
      return true;
    }

    return false;
  }

  /**
   * Parse markdown content into ImportedConversation[]
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {ImportedConversation[]}
   */
  parse(content, filename) {
    // Try structured parsing first
    let messages = this.parseStructured(content);

    // If structured parsing found few messages, try code-block based parsing
    if (messages.length < 2) {
      messages = this.parseCodeBlocks(content);
    }

    // If still nothing useful, create a single assistant message with the content
    if (messages.length === 0) {
      messages = [{
        role: 'assistant',
        content: content,
        metadata: {
          codeBlocks: this.extractCodeBlocks(content)
        }
      }];
    }

    return [{
      id: crypto.randomUUID(),
      source: 'markdown',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      messages,
      metadata: {
        title: this.extractTitle(content, filename)
      }
    }];
  }

  /**
   * Parse content with role markers
   * @param {string} content
   * @returns {ConversationMessage[]}
   */
  parseStructured(content) {
    /** @type {ConversationMessage[]} */
    const messages = [];

    // Build regex pattern for all markers
    const allMarkers = [...this.userMarkers, ...this.assistantMarkers];
    const escapedMarkers = allMarkers.map(m =>
      m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const markerPattern = new RegExp(
      `^(${escapedMarkers.join('|')})\\s*`,
      'gim'
    );

    // Split by markers
    const parts = content.split(markerPattern).filter(Boolean);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      // Check if this part is a marker
      const isUserMarker = this.userMarkers.some(m =>
        part.toLowerCase() === m.toLowerCase().replace(/:$/, '') ||
        part.toLowerCase() === m.toLowerCase()
      );
      const isAssistantMarker = this.assistantMarkers.some(m =>
        part.toLowerCase() === m.toLowerCase().replace(/:$/, '') ||
        part.toLowerCase() === m.toLowerCase()
      );

      if (isUserMarker || isAssistantMarker) {
        // Next part is the content
        const contentPart = parts[i + 1];
        if (contentPart && contentPart.trim()) {
          const role = isUserMarker ? 'user' : 'assistant';
          const msgContent = contentPart.trim();

          messages.push({
            role,
            content: msgContent,
            metadata: {
              codeBlocks: this.extractCodeBlocks(msgContent),
              errorOutput: this.detectErrorOutput(msgContent)
            }
          });
        }
        i++; // Skip the content part we just consumed
      }
    }

    return messages;
  }

  /**
   * Parse content based on code blocks (for tutorials/walkthroughs)
   * @param {string} content
   * @returns {ConversationMessage[]}
   */
  parseCodeBlocks(content) {
    /** @type {ConversationMessage[]} */
    const messages = [];

    // Split by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    let currentText = '';

    for (const part of parts) {
      if (part.startsWith('```')) {
        // This is a code block
        const codeBlocks = this.extractCodeBlocks(part);

        if (codeBlocks.length > 0) {
          const block = codeBlocks[0];

          // If there's preceding text, add it as context
          if (currentText.trim()) {
            messages.push({
              role: 'user',
              content: currentText.trim()
            });
            currentText = '';
          }

          // Add the code block as a message
          if (block.isCommand) {
            messages.push({
              role: 'user',
              content: part,
              metadata: { codeBlocks }
            });
          } else {
            messages.push({
              role: 'assistant',
              content: part,
              metadata: { codeBlocks }
            });
          }
        }
      } else {
        currentText += part;
      }
    }

    // Add any remaining text
    if (currentText.trim()) {
      messages.push({
        role: 'assistant',
        content: currentText.trim()
      });
    }

    return messages;
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
      /no such file/i,
      /fatal:/i
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

  /**
   * Extract title from content or use filename
   * @param {string} content
   * @param {string} filename
   * @returns {string}
   */
  extractTitle(content, filename) {
    // Look for markdown title (# Title)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Look for first non-empty line
    const firstLine = content.split('\n').find(l => l.trim());
    if (firstLine && firstLine.length < 100) {
      return firstLine.trim();
    }

    // Fall back to filename without extension
    return filename.replace(/\.(md|txt|markdown)$/i, '');
  }
}

module.exports = MarkdownParser;
