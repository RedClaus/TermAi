/**
 * SessionLogsModal
 * Modal to view session logs from the backend
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  RefreshCw,
  FileText,
  Clock,
  HardDrive,
  ChevronRight,
  Download,
  Search,
  Trash2,
  Circle,
} from "lucide-react";
import styles from "./SessionLogsModal.module.css";
import {
  SessionLogService,
  type SessionLogMetadata,
} from "../../services/SessionLogService";
import { SessionManager } from "../../services/SessionManager";

interface EnhancedSessionLog extends SessionLogMetadata {
  name?: string;
  isActive?: boolean;
}

interface SessionLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SessionLogsModal: React.FC<SessionLogsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [logs, setLogs] = useState<EnhancedSessionLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sessionLogs = await SessionLogService.getSessionLogs();
      const savedSessions = SessionManager.getSessions();
      
      // Enhance logs with session names from SessionManager
      const enhancedLogs: EnhancedSessionLog[] = sessionLogs.map((log) => {
        const savedSession = savedSessions.find((s) => s.id === log.sessionId);
        return {
          ...log,
          name: savedSession?.name || log.sessionId,
          isActive: SessionManager.isSessionActive(log.sessionId),
        };
      });
      
      setLogs(enhancedLogs);
    } catch (err) {
      setError("Failed to load session logs");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadLogContent = useCallback(async (sessionId: string) => {
    setIsLoadingContent(true);
    setError(null);
    try {
      const content = await SessionLogService.getSessionLog(sessionId);
      setLogContent(content);
      setSelectedLog(sessionId);
    } catch (err) {
      setError("Failed to load log content");
      console.error(err);
    } finally {
      setIsLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      setSelectedLog(null);
      setLogContent(null);
    }
  }, [isOpen, loadLogs]);

  const handleDownload = useCallback(() => {
    if (!logContent || !selectedLog) return;

    const blob = new Blob([logContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session_${selectedLog}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logContent, selectedLog]);

  const handleDelete = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete the log for session "${sessionId}"?`)) {
      return;
    }

    try {
      const success = await SessionLogService.deleteSessionLog(sessionId);
      if (success) {
        // Clear selection if we deleted the selected log
        if (selectedLog === sessionId) {
          setSelectedLog(null);
          setLogContent(null);
        }
        // Reload the logs list
        loadLogs();
      } else {
        setError("Failed to delete session log");
      }
    } catch (err) {
      setError("Failed to delete session log");
      console.error(err);
    }
  }, [selectedLog, loadLogs]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <FileText size={20} />
            Session Logs
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {/* Sidebar with log list */}
          <div className={styles.sidebar}>
            <div className={styles.searchBar}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.toolbar}>
              <button
                className={styles.refreshBtn}
                onClick={loadLogs}
                disabled={isLoading}
              >
                <RefreshCw size={14} className={isLoading ? styles.spin : ""} />
                Refresh
              </button>
              <span className={styles.logCount}>{logs.length} logs</span>
            </div>

            <div className={styles.logList}>
              {isLoading ? (
                <div className={styles.loading}>Loading logs...</div>
              ) : filteredLogs.length === 0 ? (
                <div className={styles.empty}>
                  {searchQuery ? "No matching logs" : "No session logs found"}
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.sessionId}
                    className={`${styles.logItem} ${
                      selectedLog === log.sessionId ? styles.selected : ""
                    }`}
                    onClick={() => loadLogContent(log.sessionId)}
                  >
                    <div className={styles.logItemHeader}>
                      <div className={styles.sessionInfo}>
                        {log.isActive && (
                          <Circle size={8} className={styles.activeIndicator} fill="var(--success)" />
                        )}
                        <span className={styles.sessionName}>
                          {log.name || log.sessionId}
                        </span>
                      </div>
                      <div className={styles.logItemActions}>
                        <button
                          className={styles.deleteBtn}
                          onClick={(e) => handleDelete(e, log.sessionId)}
                          title="Delete log"
                        >
                          <Trash2 size={12} />
                        </button>
                        <ChevronRight size={14} />
                      </div>
                    </div>
                    <div className={styles.logItemMeta}>
                      <span className={styles.sessionIdSmall}>
                        {log.sessionId.substring(0, 10)}...
                      </span>
                      <span>
                        <Clock size={12} />
                        {formatDate(log.modified)}
                      </span>
                      <span>
                        <HardDrive size={12} />
                        {formatFileSize(log.size)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main content area */}
          <div className={styles.mainContent}>
            {error && <div className={styles.error}>{error}</div>}

            {!selectedLog ? (
              <div className={styles.placeholder}>
                <FileText size={48} />
                <p>Select a session log to view its contents</p>
              </div>
            ) : isLoadingContent ? (
              <div className={styles.loading}>Loading log content...</div>
            ) : (
              <>
                <div className={styles.contentHeader}>
                  <h3>Session: {selectedLog}</h3>
                  <button
                    className={styles.downloadBtn}
                    onClick={handleDownload}
                    title="Download log file"
                  >
                    <Download size={14} />
                    Download
                  </button>
                </div>
                <pre className={styles.logContent}>
                  {logContent || "No content available"}
                </pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
