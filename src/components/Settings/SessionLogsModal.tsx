/**
 * SessionLogsModal
 * Modal to view session logs from the backend
 * Also shows persisted sessions that can be restored
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
  RotateCcw,
  MessageSquare,
  Terminal,
  Cloud,
  Copy,
  Check,
} from "lucide-react";
import styles from "./SessionLogsModal.module.css";
import {
  SessionLogService,
  type SessionLogMetadata,
} from "../../services/SessionLogService";
import { SessionManager } from "../../services/SessionManager";
import { SessionPersistenceService } from "../../services/SessionPersistenceService";
import { emit } from "../../events";

interface EnhancedSessionLog extends SessionLogMetadata {
  name?: string;
  isActive?: boolean;
}

interface PersistedSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  metadata?: {
    messageCount: number;
    commandCount: number;
    lastUserMessage?: string | undefined;
  } | undefined;
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
  const [persistedSessions, setPersistedSessions] = useState<PersistedSession[]>([]);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'sessions'>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyToClipboard = useCallback(async () => {
    if (!logContent) return;
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(logContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        console.warn("Clipboard API failed, trying fallback:", err);
      }
    }
    
    // Fallback for non-HTTPS contexts (e.g., accessing over local network)
    try {
      const textArea = document.createElement("textarea");
      textArea.value = logContent;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setError("Failed to copy to clipboard");
      }
    } catch (err) {
      console.error("Fallback copy failed:", err);
      setError("Failed to copy to clipboard");
    }
  }, [logContent]);

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

  const loadPersistedSessions = useCallback(() => {
    try {
      const sessions = SessionPersistenceService.getSavedSessions();
      setPersistedSessions(sessions);
    } catch (err) {
      console.error("Failed to load persisted sessions:", err);
    }
  }, []);

  const loadLogContent = useCallback(async (sessionId: string) => {
    console.log("[SessionLogsModal] Loading log content for:", sessionId);
    setIsLoadingContent(true);
    setError(null);
    setSelectedLog(sessionId);
    try {
      const content = await SessionLogService.getSessionLog(sessionId);
      console.log("[SessionLogsModal] Log content loaded:", content ? `${content.length} chars` : "null");
      setLogContent(content);
    } catch (err) {
      setError("Failed to load log content");
      console.error("[SessionLogsModal] Error loading log:", err);
    } finally {
      setIsLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      loadPersistedSessions();
      setSelectedLog(null);
      setLogContent(null);
      setSelectedSessionId(null);
    }
  }, [isOpen, loadLogs, loadPersistedSessions]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    // Also load the raw log content if available
    loadLogContent(sessionId);
  }, [loadLogContent]);

  const handleRestoreSession = useCallback((sessionId: string) => {
    // Emit event to restore session in a new tab
    emit('termai-restore-session', { sessionId });
    onClose();
  }, [onClose]);

  const handleDeletePersistedSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete the saved session state for "${sessionId}"?`)) {
      return;
    }
    SessionPersistenceService.deleteSession(sessionId);
    loadPersistedSessions();
  }, [loadPersistedSessions]);

  const handleExportSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const json = SessionPersistenceService.exportSession(sessionId);
    if (!json) return;
    
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session_${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

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

  const filteredPersistedSessions = persistedSessions.filter(
    (session) =>
      session.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (session.metadata?.lastUserMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const storageInfo = SessionPersistenceService.getStorageInfo();

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <FileText size={20} />
            Sessions & Logs
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabNav}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'sessions' ? styles.active : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            <Cloud size={14} />
            Saved Sessions
            <span className={styles.tabBadge}>{persistedSessions.length}</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'logs' ? styles.active : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={14} />
            Raw Logs
            <span className={styles.tabBadge}>{logs.length}</span>
          </button>
        </div>

        <div className={styles.content}>
          {/* Sidebar with list */}
          <div className={styles.sidebar}>
            <div className={styles.searchBar}>
              <Search size={16} />
              <input
                type="text"
                placeholder={activeTab === 'sessions' ? "Search sessions..." : "Search logs..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.toolbar}>
              <button
                className={styles.refreshBtn}
                onClick={() => { loadLogs(); loadPersistedSessions(); }}
                disabled={isLoading}
              >
                <RefreshCw size={14} className={isLoading ? styles.spin : ""} />
                Refresh
              </button>
              <span className={styles.logCount}>
                {activeTab === 'sessions' ? `${persistedSessions.length} sessions` : `${logs.length} logs`}
              </span>
            </div>

            {/* Persisted Sessions Tab Content */}
            {activeTab === 'sessions' && (
              <div className={styles.logList}>
                {filteredPersistedSessions.length === 0 ? (
                  <div className={styles.empty}>
                    {searchQuery ? "No matching sessions" : "No saved sessions found"}
                  </div>
                ) : (
                  filteredPersistedSessions.map((session) => (
                    <div
                      key={session.id}
                      className={`${styles.logItem} ${styles.sessionItem} ${selectedSessionId === session.id ? styles.selected : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSession(session.id);
                      }}
                    >
                      <div className={styles.logItemHeader}>
                        <div className={styles.sessionInfo}>
                          <MessageSquare size={14} className={styles.sessionIcon} />
                          <span className={styles.sessionName}>
                            {session.name}
                          </span>
                        </div>
                        <div className={styles.logItemActions}>
                          <button
                            className={styles.exportBtn}
                            onClick={(e) => handleExportSession(session.id, e)}
                            title="Export session"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={(e) => handleDeletePersistedSession(session.id, e)}
                            title="Delete session"
                          >
                            <Trash2 size={12} />
                          </button>
                          <RotateCcw size={14} className={styles.restoreIcon} />
                        </div>
                      </div>
                      <div className={styles.logItemMeta}>
                        <span>
                          <MessageSquare size={12} />
                          {session.metadata?.messageCount || 0} messages
                        </span>
                        <span>
                          <Terminal size={12} />
                          {session.metadata?.commandCount || 0} commands
                        </span>
                        <span>
                          <Clock size={12} />
                          {formatTimeAgo(session.updatedAt)}
                        </span>
                      </div>
                      {session.metadata?.lastUserMessage && (
                        <div className={styles.sessionPreview}>
                          "{session.metadata.lastUserMessage}"
                        </div>
                      )}
                    </div>
                  ))
                )}
                {storageInfo.sessionCount > 0 && (
                  <div className={styles.storageInfo}>
                    <HardDrive size={12} />
                    <span>{storageInfo.estimatedSize} used</span>
                  </div>
                )}
              </div>
            )}

            {/* Raw Logs Tab Content */}
            {activeTab === 'logs' && (
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
                      onClick={(e) => {
                        e.stopPropagation();
                        loadLogContent(log.sessionId);
                      }}
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
            )}
          </div>

          {/* Main content area */}
          <div className={styles.mainContent}>
            {error && <div className={styles.error}>{error}</div>}

            {!selectedLog && !selectedSessionId ? (
              <div className={styles.placeholder}>
                {activeTab === 'sessions' ? (
                  <>
                    <Cloud size={48} />
                    <p>Click a saved session to preview it</p>
                    <span className={styles.placeholderHint}>Sessions are auto-saved as you work</span>
                  </>
                ) : (
                  <>
                    <FileText size={48} />
                    <p>Select a session log to view its contents</p>
                  </>
                )}
              </div>
            ) : isLoadingContent ? (
              <div className={styles.loading}>Loading log content...</div>
            ) : (
              <>
                <div className={styles.contentHeader}>
                  <h3>Session: {selectedLog || selectedSessionId}</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {selectedSessionId && activeTab === 'sessions' && (
                      <button
                        className={styles.downloadBtn}
                        onClick={() => handleRestoreSession(selectedSessionId)}
                        title="Restore this session"
                        style={{ background: 'var(--success)' }}
                      >
                        <RotateCcw size={14} />
                        Restore
                      </button>
                    )}
                    <button
                      className={styles.downloadBtn}
                      onClick={handleCopyToClipboard}
                      title="Copy to clipboard"
                      style={{ background: copied ? 'var(--success)' : undefined }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      className={styles.downloadBtn}
                      onClick={handleDownload}
                      title="Download log file"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
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
