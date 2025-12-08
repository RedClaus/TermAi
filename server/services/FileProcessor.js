/**
 * FileProcessor
 * Handles file attachments for AI context - images, code files, PDFs, etc.
 * 
 * Key features:
 * - Image processing (screenshots, diagrams)
 * - Code file reading with syntax detection
 * - PDF text extraction (optional)
 * - File type validation and size limits
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// File size limits (in bytes)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images

// Supported file types
const SUPPORTED_TYPES = {
  // Code files
  code: ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt', '.scala', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd'],
  // Config/data files
  config: ['.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.env', '.conf', '.cfg'],
  // Markup files
  markup: ['.md', '.mdx', '.html', '.htm', '.css', '.scss', '.sass', '.less'],
  // Images (for vision models)
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
  // Documents
  document: ['.txt', '.log', '.csv'],
};

class FileProcessor {
  constructor() {
    this.cache = new Map(); // Simple in-memory cache
    this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Process a file attachment and return AI-ready content
   */
  async processFile(filePath, options = {}) {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(options.basePath || process.cwd(), filePath);

    // Check cache first
    const cacheKey = this._getCacheKey(absolutePath);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.data;
    }

    // Validate file exists
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get file stats
    const stats = await fs.stat(absolutePath);
    
    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE})`);
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const fileType = this._getFileType(ext);

    let result;

    switch (fileType) {
      case 'code':
      case 'config':
      case 'markup':
      case 'document':
        result = await this._processTextFile(absolutePath, ext);
        break;
      case 'image':
        result = await this._processImageFile(absolutePath, ext, stats.size);
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    // Cache the result
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Process multiple file attachments
   */
  async processFiles(filePaths, options = {}) {
    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          return await this.processFile(filePath, options);
        } catch (error) {
          return {
            path: filePath,
            error: error.message,
            type: 'error'
          };
        }
      })
    );

    return results;
  }

  /**
   * Process a text-based file (code, config, etc.)
   */
  async _processTextFile(filePath, ext) {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').length;
    const language = this._getLanguage(ext);

    return {
      type: 'text',
      path: filePath,
      name: path.basename(filePath),
      extension: ext,
      language,
      content,
      lines,
      size: Buffer.byteLength(content, 'utf-8'),
      // Formatted for AI context
      formatted: `File: ${path.basename(filePath)} (${lines} lines)\n\`\`\`${language}\n${content}\n\`\`\``
    };
  }

  /**
   * Process an image file
   * Returns base64 for vision models or description for text-only
   */
  async _processImageFile(filePath, ext, size) {
    if (size > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${size} bytes (max: ${MAX_IMAGE_SIZE})`);
    }

    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');
    const mimeType = this._getMimeType(ext);

    return {
      type: 'image',
      path: filePath,
      name: path.basename(filePath),
      extension: ext,
      mimeType,
      size,
      base64,
      dataUrl: `data:${mimeType};base64,${base64}`,
      // For text-only models
      formatted: `[Image: ${path.basename(filePath)} (${this._formatBytes(size)})]`
    };
  }

  /**
   * Create context string for AI from processed files
   */
  createContext(processedFiles) {
    const textFiles = processedFiles.filter(f => f.type === 'text' && !f.error);
    const images = processedFiles.filter(f => f.type === 'image' && !f.error);
    const errors = processedFiles.filter(f => f.error);

    let context = '';

    if (textFiles.length > 0) {
      context += '## Attached Files\n\n';
      context += textFiles.map(f => f.formatted).join('\n\n---\n\n');
    }

    if (images.length > 0) {
      context += '\n\n## Attached Images\n';
      context += images.map(f => f.formatted).join('\n');
    }

    if (errors.length > 0) {
      context += '\n\n## File Errors\n';
      context += errors.map(f => `- ${f.path}: ${f.error}`).join('\n');
    }

    return context;
  }

  /**
   * Get file type category
   */
  _getFileType(ext) {
    for (const [type, extensions] of Object.entries(SUPPORTED_TYPES)) {
      if (extensions.includes(ext)) {
        return type;
      }
    }
    return null;
  }

  /**
   * Get language identifier for code highlighting
   */
  _getLanguage(ext) {
    const languageMap = {
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.py': 'python',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'zsh',
      '.fish': 'fish',
      '.ps1': 'powershell',
      '.bat': 'batch',
      '.cmd': 'batch',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.xml': 'xml',
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.md': 'markdown',
      '.mdx': 'mdx',
      '.txt': 'text',
      '.log': 'text',
      '.csv': 'csv',
      '.env': 'dotenv',
      '.ini': 'ini',
      '.conf': 'text',
      '.cfg': 'text',
    };
    return languageMap[ext] || 'text';
  }

  /**
   * Get MIME type for images
   */
  _getMimeType(ext) {
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * Get cache key for file
   */
  _getCacheKey(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  /**
   * Format bytes to human readable
   */
  _formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Check if file type is supported
   */
  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this._getFileType(ext) !== null;
  }
}

module.exports = { FileProcessor };
