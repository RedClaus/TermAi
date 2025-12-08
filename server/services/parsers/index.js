/**
 * Parser Registry
 * Central registry for conversation format parsers
 */

const ClaudeParser = require('./ClaudeParser');
const ChatGPTParser = require('./ChatGPTParser');
const CursorParser = require('./CursorParser');
const WarpParser = require('./WarpParser');
const MarkdownParser = require('./MarkdownParser');

/**
 * @typedef {import('../../types/ingestion').ConversationSource} ConversationSource
 * @typedef {import('../../types/ingestion').ImportedConversation} ImportedConversation
 */

/**
 * Parser interface
 * @typedef {Object} ConversationParser
 * @property {string} name - Parser name for logging
 * @property {ConversationSource} source - Source identifier
 * @property {function(string, string): boolean} detect - Check if content matches this format
 * @property {function(string, string): ImportedConversation[]} parse - Parse content into conversations
 */

class ParserRegistry {
  constructor() {
    /** @type {ConversationParser[]} */
    this.parsers = [];

    // Register parsers in priority order (most specific first)
    this.register(new ClaudeParser());
    this.register(new ChatGPTParser());
    this.register(new CursorParser());
    this.register(new WarpParser());
    this.register(new MarkdownParser()); // Fallback - least specific
  }

  /**
   * Register a parser
   * @param {ConversationParser} parser
   */
  register(parser) {
    this.parsers.push(parser);
    console.log(`[ParserRegistry] Registered: ${parser.name}`);
  }

  /**
   * Detect the appropriate parser for content
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {ConversationParser|null}
   */
  detect(content, filename) {
    for (const parser of this.parsers) {
      try {
        if (parser.detect(content, filename)) {
          console.log(`[ParserRegistry] Detected format: ${parser.name} for ${filename}`);
          return parser;
        }
      } catch (e) {
        // Parser detection failed, try next
        console.warn(`[ParserRegistry] Detection error in ${parser.name}:`, e.message);
      }
    }
    console.warn(`[ParserRegistry] No parser matched for: ${filename}`);
    return null;
  }

  /**
   * Parse content using auto-detected parser
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @returns {{ parser: ConversationParser|null, conversations: ImportedConversation[] }}
   */
  parse(content, filename) {
    const parser = this.detect(content, filename);
    if (!parser) {
      return { parser: null, conversations: [] };
    }

    try {
      const conversations = parser.parse(content, filename);
      return { parser, conversations };
    } catch (e) {
      console.error(`[ParserRegistry] Parse error in ${parser.name}:`, e.message);
      throw e;
    }
  }

  /**
   * Get all registered parser names
   * @returns {string[]}
   */
  getParserNames() {
    return this.parsers.map(p => p.name);
  }

  /**
   * Get parser by source type
   * @param {ConversationSource} source
   * @returns {ConversationParser|undefined}
   */
  getParserBySource(source) {
    return this.parsers.find(p => p.source === source);
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get the parser registry singleton
 * @returns {ParserRegistry}
 */
function getParserRegistry() {
  if (!registryInstance) {
    registryInstance = new ParserRegistry();
  }
  return registryInstance;
}

module.exports = {
  ParserRegistry,
  getParserRegistry
};
