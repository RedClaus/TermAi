/**
 * FilePreview Component
 * Rich file preview with support for multiple file types
 * Inspired by WaveTerm's preview system
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Download,
  Copy,
  Check,
  FileText,
  FileCode,
  Image as ImageIcon,
  Table,
  File,
  Maximize2,
  Minimize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import styles from "./FilePreview.module.css";
import { FileSystemService } from "../../services/FileSystemService";
import { Markdown } from "../common/Markdown";
import { CodeBlock } from "../common/CodeBlock";

// =============================================
// Types
// =============================================

interface FilePreviewProps {
  filePath: string;
  onClose?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

type PreviewMode = "text" | "code" | "markdown" | "image" | "csv" | "json" | "binary" | "loading" | "error";

interface CSVData {
  headers: string[];
  rows: string[][];
}

// =============================================
// Utility Functions
// =============================================

const getFileExtension = (path: string): string => {
  const parts = path.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
};

const getPreviewMode = (path: string): PreviewMode => {
  const ext = getFileExtension(path);
  
  // Code files
  const codeExtensions = [
    "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp",
    "cs", "swift", "kt", "scala", "php", "sh", "bash", "zsh", "fish", "ps1",
    "yaml", "yml", "toml", "ini", "conf", "cfg", "xml", "html", "htm", "css", "scss", "less",
    "sql", "graphql", "vue", "svelte", "astro"
  ];
  
  // Markdown
  if (ext === "md" || ext === "mdx" || ext === "markdown") return "markdown";
  
  // JSON
  if (ext === "json" || ext === "jsonc" || ext === "json5") return "json";
  
  // CSV
  if (ext === "csv" || ext === "tsv") return "csv";
  
  // Images
  const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
  if (imageExtensions.includes(ext)) return "image";
  
  // Code
  if (codeExtensions.includes(ext)) return "code";
  
  // Text
  const textExtensions = ["txt", "log", "env", "gitignore", "dockerignore", "editorconfig"];
  if (textExtensions.includes(ext)) return "text";
  
  // Binary
  const binaryExtensions = ["exe", "dll", "so", "dylib", "bin", "dat", "db", "sqlite", "zip", "tar", "gz", "7z", "rar"];
  if (binaryExtensions.includes(ext)) return "binary";
  
  // Default to text for unknown
  return "text";
};

const getLanguageFromExtension = (ext: string): string => {
  const langMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    sql: "sql",
    graphql: "graphql",
    json: "json",
    jsonc: "json",
    md: "markdown",
    vue: "vue",
    svelte: "svelte",
  };
  return langMap[ext] || "plaintext";
};

const parseCSV = (content: string, delimiter = ","): CSVData => {
  const lines = content.trim().split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  
  return { headers, rows };
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// =============================================
// Sub-components
// =============================================

const TextPreview: React.FC<{ content: string }> = ({ content }) => (
  <pre className={styles.textContent}>{content}</pre>
);

const CodePreview: React.FC<{ content: string; language: string }> = ({ content, language }) => (
  <div className={styles.codeWrapper}>
    <CodeBlock code={content} language={language} showLineNumbers />
  </div>
);

const MarkdownPreview: React.FC<{ content: string }> = ({ content }) => (
  <div className={styles.markdownWrapper}>
    <Markdown content={content} />
  </div>
);

const JSONPreview: React.FC<{ content: string }> = ({ content }) => {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }, [content]);
  
  return <CodePreview content={formatted} language="json" />;
};

const CSVPreview: React.FC<{ content: string }> = ({ content }) => {
  const data = useMemo(() => parseCSV(content), [content]);
  
  if (data.headers.length === 0) {
    return <div className={styles.emptyState}>Empty CSV file</div>;
  }
  
  return (
    <div className={styles.csvWrapper}>
      <table className={styles.csvTable}>
        <thead>
          <tr>
            {data.headers.map((header, i) => (
              <th key={i}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.slice(0, 1000).map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length > 1000 && (
        <div className={styles.truncatedNote}>
          Showing first 1000 of {data.rows.length} rows
        </div>
      )}
    </div>
  );
};

const ImagePreview: React.FC<{ 
  src: string; 
  alt: string;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}> = ({ src, alt, zoom, onZoomIn, onZoomOut }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  
  return (
    <div className={styles.imageWrapper}>
      <div className={styles.imageControls}>
        <button onClick={onZoomOut} disabled={zoom <= 25} title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <span>{zoom}%</span>
        <button onClick={onZoomIn} disabled={zoom >= 400} title="Zoom in">
          <ZoomIn size={16} />
        </button>
      </div>
      <div className={styles.imageContainer} style={{ transform: `scale(${zoom / 100})` }}>
        {!loaded && !error && <div className={styles.imageLoading}>Loading image...</div>}
        {error && <div className={styles.imageError}>Failed to load image</div>}
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{ display: loaded ? "block" : "none" }}
        />
      </div>
    </div>
  );
};

const BinaryPreview: React.FC<{ filePath: string; fileSize?: number | undefined }> = ({ filePath, fileSize }) => (
  <div className={styles.binaryWrapper}>
    <File size={48} />
    <h3>Binary File</h3>
    <p>This file cannot be previewed</p>
    {fileSize && <p className={styles.fileSize}>{formatFileSize(fileSize)}</p>}
    <p className={styles.filePath}>{filePath}</p>
  </div>
);

// =============================================
// Main Component
// =============================================

export const FilePreview: React.FC<FilePreviewProps> = ({
  filePath,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const [content, setContent] = useState<string>("");
  const [mode, setMode] = useState<PreviewMode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageZoom, setImageZoom] = useState(100);
  const [fileSize, setFileSize] = useState<number | undefined>();
  
  const fileName = useMemo(() => filePath.split("/").pop() || filePath, [filePath]);
  const extension = useMemo(() => getFileExtension(filePath), [filePath]);
  const language = useMemo(() => getLanguageFromExtension(extension), [extension]);
  
  // Load file content
  const loadFile = useCallback(async () => {
    setMode("loading");
    setError(null);
    
    const previewMode = getPreviewMode(filePath);
    
    // Don't load binary files
    if (previewMode === "binary") {
      setMode("binary");
      return;
    }
    
    // For images, just set mode (will use URL)
    if (previewMode === "image") {
      setMode("image");
      return;
    }
    
    try {
      const result = await FileSystemService.readFile(filePath);
      setContent(result);
      setFileSize(result.length);
      setMode(previewMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file");
      setMode("error");
    }
  }, [filePath]);
  
  useEffect(() => {
    loadFile();
  }, [loadFile]);
  
  // Copy content to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [content]);
  
  // Get mode icon
  const getModeIcon = () => {
    switch (mode) {
      case "markdown": return <FileText size={16} />;
      case "code": return <FileCode size={16} />;
      case "json": return <FileCode size={16} />;
      case "csv": return <Table size={16} />;
      case "image": return <ImageIcon size={16} />;
      default: return <File size={16} />;
    }
  };
  
  // Image URL for preview
  const imageUrl = useMemo(() => {
    if (mode !== "image") return "";
    // Use backend endpoint to serve the image
    return `/api/fs/read?path=${encodeURIComponent(filePath)}&raw=true`;
  }, [mode, filePath]);
  
  return (
    <div className={`${styles.container} ${isFullscreen ? styles.fullscreen : ""}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.fileInfo}>
          {getModeIcon()}
          <span className={styles.fileName}>{fileName}</span>
          {fileSize && <span className={styles.fileSize}>{formatFileSize(fileSize)}</span>}
        </div>
        
        <div className={styles.actions}>
          {mode !== "loading" && mode !== "error" && mode !== "binary" && mode !== "image" && (
            <button 
              className={styles.actionBtn} 
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy content"}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          )}
          
          <button 
            className={styles.actionBtn} 
            onClick={loadFile}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          
          {onToggleFullscreen && (
            <button 
              className={styles.actionBtn} 
              onClick={onToggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          
          <a 
            href={`/api/fs/read?path=${encodeURIComponent(filePath)}&download=true`}
            className={styles.actionBtn}
            title="Download"
            download={fileName}
          >
            <Download size={16} />
          </a>
          
          {onClose && (
            <button className={styles.closeBtn} onClick={onClose} title="Close">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className={styles.content}>
        {mode === "loading" && (
          <div className={styles.loadingState}>
            <RefreshCw size={24} className={styles.spinner} />
            <span>Loading file...</span>
          </div>
        )}
        
        {mode === "error" && (
          <div className={styles.errorState}>
            <span>{error}</span>
            <button onClick={loadFile}>Retry</button>
          </div>
        )}
        
        {mode === "text" && <TextPreview content={content} />}
        {mode === "code" && <CodePreview content={content} language={language} />}
        {mode === "markdown" && <MarkdownPreview content={content} />}
        {mode === "json" && <JSONPreview content={content} />}
        {mode === "csv" && <CSVPreview content={content} />}
        {mode === "binary" && <BinaryPreview filePath={filePath} fileSize={fileSize} />}
        {mode === "image" && (
          <ImagePreview 
            src={imageUrl} 
            alt={fileName}
            zoom={imageZoom}
            onZoomIn={() => setImageZoom(z => Math.min(z + 25, 400))}
            onZoomOut={() => setImageZoom(z => Math.max(z - 25, 25))}
          />
        )}
      </div>
    </div>
  );
};

export default FilePreview;
