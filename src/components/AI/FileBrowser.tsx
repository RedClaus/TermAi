/**
 * FileBrowser Component
 * Modal for browsing and selecting files from the server filesystem
 */
import React, { useState, useEffect, useCallback, memo } from "react";
import {
  Folder,
  File,
  ChevronRight,
  ArrowUp,
  Home,
  X,
  FileCode,
  FileText,
  FileJson,
  Image,
  Loader,
  Check,
} from "lucide-react";
import styles from "./FileBrowser.module.css";
import { FileSystemService, type FileEntry } from "../../services/FileSystemService";

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (files: SelectedFile[]) => void;
  initialPath?: string;
  multiSelect?: boolean;
  mode: "attach" | "browse" | "mention";
}

export interface SelectedFile {
  path: string;
  name: string;
  isDirectory: boolean;
}

// File icon based on extension
const getFileIcon = (name: string, isDirectory: boolean) => {
  if (isDirectory) return <Folder size={16} className={styles.folderIcon} />;
  
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "py":
    case "rb":
    case "go":
    case "rs":
    case "java":
    case "c":
    case "cpp":
    case "h":
      return <FileCode size={16} className={styles.codeIcon} />;
    case "json":
      return <FileJson size={16} className={styles.jsonIcon} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <Image size={16} className={styles.imageIcon} />;
    case "md":
    case "txt":
    case "log":
      return <FileText size={16} className={styles.textIcon} />;
    default:
      return <File size={16} className={styles.fileIcon} />;
  }
};

/**
 * File/Folder Item
 */
const FileItem = memo<{
  entry: FileEntry;
  isSelected: boolean;
  onSelect: () => void;
  onNavigate: () => void;
}>(({ entry, isSelected, onSelect, onNavigate }) => (
  <div
    className={`${styles.fileItem} ${isSelected ? styles.selected : ""}`}
    onClick={() => (entry.isDirectory ? onNavigate() : onSelect())}
    onDoubleClick={() => entry.isDirectory && onNavigate()}
  >
    <div className={styles.fileInfo}>
      {getFileIcon(entry.name, entry.isDirectory)}
      <span className={styles.fileName}>{entry.name}</span>
    </div>
    {!entry.isDirectory && (
      <div className={styles.selectIndicator}>
        {isSelected ? <Check size={14} /> : null}
      </div>
    )}
    {entry.isDirectory && (
      <ChevronRight size={14} className={styles.navArrow} />
    )}
  </div>
));

FileItem.displayName = "FileItem";

/**
 * FileBrowser Component
 */
export const FileBrowser: React.FC<FileBrowserProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialPath = "~",
  multiSelect = false,
  mode,
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load files for current path
  const loadFiles = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const entries = await FileSystemService.listFiles(path);
      // Sort: directories first, then by name
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load files when path changes
  useEffect(() => {
    if (isOpen) {
      loadFiles(currentPath);
    }
  }, [isOpen, currentPath, loadFiles]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath);
      setSelectedFiles([]);
    }
  }, [isOpen, initialPath]);

  // Navigate to directory
  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

  // Go up one level
  const goUp = useCallback(() => {
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      const newPath = parts.length > 0 ? "/" + parts.join("/") : "/";
      navigateTo(newPath === "/" && currentPath.startsWith("~") ? "~" : newPath);
    }
  }, [currentPath, navigateTo]);

  // Go to home
  const goHome = useCallback(() => {
    navigateTo("~");
  }, [navigateTo]);

  // Toggle file selection
  const toggleSelect = useCallback((entry: FileEntry) => {
    if (entry.isDirectory) {
      navigateTo(entry.path);
      return;
    }

    setSelectedFiles(prev => {
      const exists = prev.find(f => f.path === entry.path);
      if (exists) {
        return prev.filter(f => f.path !== entry.path);
      }
      if (multiSelect) {
        return [...prev, { path: entry.path, name: entry.name, isDirectory: false }];
      }
      return [{ path: entry.path, name: entry.name, isDirectory: false }];
    });
  }, [multiSelect, navigateTo]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (selectedFiles.length > 0) {
      onSelect(selectedFiles);
      onClose();
    }
  }, [selectedFiles, onSelect, onClose]);

  // Get title based on mode
  const getTitle = () => {
    switch (mode) {
      case "attach":
        return "Attach Files";
      case "mention":
        return "Select File to Mention";
      case "browse":
      default:
        return "Browse Files";
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>{getTitle()}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Path bar */}
        <div className={styles.pathBar}>
          <button className={styles.pathBtn} onClick={goHome} title="Home">
            <Home size={16} />
          </button>
          <button className={styles.pathBtn} onClick={goUp} title="Go Up">
            <ArrowUp size={16} />
          </button>
          <div className={styles.pathDisplay}>
            {currentPath}
          </div>
        </div>

        {/* File list */}
        <div className={styles.fileList}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <Loader size={24} className={styles.spinner} />
              <span>Loading...</span>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <span>{error}</span>
              <button onClick={() => loadFiles(currentPath)}>Retry</button>
            </div>
          ) : files.length === 0 ? (
            <div className={styles.emptyState}>
              <Folder size={32} />
              <span>Empty directory</span>
            </div>
          ) : (
            files.map((entry) => (
              <FileItem
                key={entry.path}
                entry={entry}
                isSelected={selectedFiles.some(f => f.path === entry.path)}
                onSelect={() => toggleSelect(entry)}
                onNavigate={() => navigateTo(entry.path)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.selectedCount}>
            {selectedFiles.length > 0 
              ? `${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""} selected`
              : "No files selected"}
          </div>
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button 
              className={styles.confirmBtn} 
              onClick={handleConfirm}
              disabled={selectedFiles.length === 0}
            >
              {mode === "attach" ? "Attach" : mode === "mention" ? "Insert" : "Select"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
