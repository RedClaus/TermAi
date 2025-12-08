/**
 * Upload Step
 * Drag-and-drop file upload for conversation imports
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { IngestionService } from "../../services/IngestionService";
import type { IngestionJob } from "../../types/ingestion";
import styles from "./KnowledgeImport.module.css";

interface UploadStepProps {
  onJobCreated: (job: IngestionJob) => void;
}

interface FormatInfo {
  id: string;
  name: string;
  extensions: string[];
  description: string;
}

export function UploadStep({ onJobCreated }: UploadStepProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [formats, setFormats] = useState<FormatInfo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load supported formats on mount
  useEffect(() => {
    IngestionService.getSupportedFormats().then(setFormats);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setError(null);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = filterValidFiles(droppedFiles);

    if (validFiles.length < droppedFiles.length) {
      setError(`Some files were skipped. Supported: .json, .txt, .md, .yaml, .yml`);
    }

    setFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = filterValidFiles(selectedFiles);
      setFiles((prev) => [...prev, ...validFiles]);
      setError(null);
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback((e?: React.MouseEvent) => {
    // Prevent any default behavior
    console.log("[UploadStep] Button clicked!");
    e?.preventDefault();
    e?.stopPropagation();

    if (files.length === 0) {
      console.log("[UploadStep] No files selected");
      return;
    }

    console.log("[UploadStep] Starting upload of", files.length, "files");
    setUploading(true);
    setError(null);

    // Wrap in async IIFE to handle promise properly
    (async () => {
      try {
        const result = await IngestionService.uploadFiles(files);
        console.log("[UploadStep] Upload result:", result);

        // Fetch the full job object
        const job = await IngestionService.getJob(result.jobId);
        console.log("[UploadStep] Fetched job:", job);

        if (job) {
          onJobCreated(job);
        } else {
          // Create minimal job object if fetch fails
          onJobCreated({
            id: result.jobId,
            status: result.status as IngestionJob["status"],
            files: files.map((f) => ({
              name: f.name,
              size: f.size,
              detectedFormat: "markdown",
              status: "pending",
            })),
            progress: { current: 0, total: files.length, phase: "Starting" },
            results: { conversationsFound: 0, candidatesExtracted: 0, errors: [] },
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error("[UploadStep] Upload error:", err);
        setError(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
      }
    })();
  }, [files, onJobCreated]);

  const handleZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div>
      {/* Drop Zone */}
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dragOver : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleZoneClick}
      >
        <Upload className={styles.dropZoneIcon} />
        <p className={styles.dropZoneText}>
          Drop conversation exports here
        </p>
        <p className={styles.dropZoneHint}>
          or click to browse files
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".json,.txt,.md,.markdown,.yaml,.yml"
          onChange={handleFileSelect}
          className={styles.fileInput}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ color: "var(--error-color)", marginTop: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className={styles.fileItem}>
              <FileText className={styles.fileIcon} />
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>{formatBytes(file.size)}</span>
              <button
                type="button"
                className={styles.fileRemove}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(index);
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Supported Formats */}
      {formats.length > 0 && (
        <div className={styles.formatsInfo}>
          <div className={styles.formatsTitle}>Supported Formats</div>
          <div className={styles.formatsList}>
            {formats.map((format) => (
              <div key={format.id} className={styles.formatBadge}>
                <span>{format.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={styles.wizardFooter} style={{ marginTop: 24, padding: 0, border: "none" }}>
        <div className={styles.footerLeft}>
          {files.length > 0 && `${files.length} file${files.length > 1 ? "s" : ""} selected`}
        </div>
        <div className={styles.footerRight}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
          >
            {uploading ? (
              <>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                Uploading...
              </>
            ) : (
              "Process Files"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function filterValidFiles(files: File[]): File[] {
  const validExtensions = [".json", ".txt", ".md", ".markdown", ".yaml", ".yml"];
  return files.filter((file) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    return validExtensions.includes(ext);
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default UploadStep;
