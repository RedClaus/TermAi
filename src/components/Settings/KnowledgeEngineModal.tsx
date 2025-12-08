/**
 * Knowledge Engine Modal
 * UI for managing the RAG-based code search engine
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Brain,
  RefreshCw,
  FolderSearch,
  CheckCircle2,
  AlertCircle,
  Loader,
  Search,
  FileCode,
  Database,
  Zap,
} from 'lucide-react';
import { KnowledgeService } from '../../services/KnowledgeService';
import type { KnowledgeEngineStatus, VectorSearchResult } from '../../types/knowledge';
import styles from './KnowledgeEngineModal.module.css';

interface KnowledgeEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCwd: string;
}

export const KnowledgeEngineModal: React.FC<KnowledgeEngineModalProps> = ({
  isOpen,
  onClose,
  currentCwd,
}) => {
  const [status, setStatus] = useState<KnowledgeEngineStatus | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexResults, setIndexResults] = useState<{ indexed: number; skipped: number; errors: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VectorSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch status on mount and periodically
  const fetchStatus = useCallback(async (): Promise<void> => {
    try {
      const s = await KnowledgeService.getStatus();
      setStatus(s);
      setError(null);
    } catch {
      setError('Failed to connect to Knowledge Engine');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 5000); // Refresh every 5s
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isOpen, fetchStatus]);

  // Index current directory
  const handleIndex = async () => {
    setIsIndexing(true);
    setIndexResults(null);
    setError(null);

    try {
      const result = await KnowledgeService.indexDirectory(currentCwd);
      if (result) {
        setIndexResults(result.results);
      } else {
        setError('Indexing failed - check server logs');
      }
    } catch (e) {
      setError('Failed to start indexing');
    } finally {
      setIsIndexing(false);
      fetchStatus();
    }
  };

  // Search codebase
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      const results = await KnowledgeService.vectorSearch(searchQuery, 10);
      setSearchResults(results);
    } catch (e) {
      setError('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Brain size={20} />
            <span>Knowledge Engine</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Status Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Database size={16} />
            Engine Status
          </h3>
          
          <div className={styles.statusGrid}>
            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>
                {status?.initialized ? (
                  <CheckCircle2 size={20} className={styles.statusOk} />
                ) : (
                  <AlertCircle size={20} className={styles.statusError} />
                )}
              </div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Status</span>
                <span className={styles.statusValue}>
                  {status?.initialized ? 'Running' : 'Not Initialized'}
                </span>
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>
                <FileCode size={20} />
              </div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Index</span>
                <span className={styles.statusValue}>
                  {status?.hasTable ? 'Ready' : 'Empty'}
                </span>
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>
                <Zap size={20} />
              </div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Model</span>
                <span className={styles.statusValue}>
                  {status?.model || 'N/A'}
                </span>
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>
                <Loader size={20} className={status?.processingCount ? styles.spinning : ''} />
              </div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Processing</span>
                <span className={styles.statusValue}>
                  {status?.processingCount || 0} files
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className={styles.errorBanner}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!status?.initialized && (
            <div className={styles.warningBanner}>
              <AlertCircle size={16} />
              <div>
                <strong>Knowledge Engine not available</strong>
                <p>The Knowledge Engine requires an embedding model. You have two options:</p>
                <div style={{ marginTop: '8px' }}>
                  <strong>Option 1: Ollama (Local, Free)</strong>
                  <ol style={{ margin: '4px 0 8px 16px', fontSize: '12px' }}>
                    <li>Install Ollama from <a href="https://ollama.ai" target="_blank" rel="noreferrer" style={{ color: '#89b4fa' }}>ollama.ai</a></li>
                    <li>Run: <code>ollama pull nomic-embed-text</code></li>
                    <li>Make sure Ollama is running</li>
                  </ol>
                </div>
                <div>
                  <strong>Option 2: OpenAI Embeddings</strong>
                  <ol style={{ margin: '4px 0 0 16px', fontSize: '12px' }}>
                    <li>Set your OpenAI API key in Settings</li>
                    <li>Restart the server - it will auto-detect the key</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Indexing Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <FolderSearch size={16} />
            Index Codebase
          </h3>
          
          <div className={styles.indexArea}>
            <div className={styles.indexPath}>
              <span className={styles.pathLabel}>Directory:</span>
              <code className={styles.pathValue}>{currentCwd}</code>
            </div>

            <div className={styles.indexActions}>
              <button
                className={styles.indexBtn}
                onClick={handleIndex}
                disabled={isIndexing || !status?.initialized}
              >
                {isIndexing ? (
                  <>
                    <Loader size={16} className={styles.spinning} />
                    Indexing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Index Directory
                  </>
                )}
              </button>
            </div>

            {indexResults && (
              <div className={styles.indexResults}>
                <div className={styles.resultItem}>
                  <CheckCircle2 size={14} className={styles.resultOk} />
                  <span>{indexResults.indexed} files indexed</span>
                </div>
                <div className={styles.resultItem}>
                  <span className={styles.resultSkipped}>{indexResults.skipped} skipped</span>
                </div>
                {indexResults.errors > 0 && (
                  <div className={styles.resultItem}>
                    <AlertCircle size={14} className={styles.resultError} />
                    <span>{indexResults.errors} errors</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Search size={16} />
            Semantic Search
          </h3>

          <div className={styles.searchArea}>
            <div className={styles.searchInput}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search your codebase semantically..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!status?.initialized || !status?.hasTable}
              />
              <button
                className={styles.searchBtn}
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim() || !status?.initialized}
              >
                {isSearching ? <Loader size={16} className={styles.spinning} /> : <Search size={16} />}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map((result, idx) => (
                  <div key={idx} className={styles.searchResult}>
                    <div className={styles.resultHeader}>
                      <FileCode size={14} />
                      <span className={styles.resultPath}>{result.path}</span>
                      <span className={styles.resultLines}>
                        L{result.lineStart}-{result.lineEnd}
                      </span>
                    </div>
                    <pre className={styles.resultCode}>
                      {result.text.length > 300
                        ? result.text.substring(0, 300) + '...'
                        : result.text}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {searchQuery && searchResults.length === 0 && !isSearching && (
              <div className={styles.noResults}>
                No results found. Try a different query or index your codebase first.
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className={styles.helpSection}>
          <h4>How it works</h4>
          <p>
            The Knowledge Engine uses vector embeddings to understand your code semantically.
            When you ask questions, it retrieves relevant code snippets to provide context-aware answers.
          </p>
          <ul>
            <li><strong>Index</strong> - Scans your codebase and creates searchable embeddings</li>
            <li><strong>Watch</strong> - Automatically updates when files change</li>
            <li><strong>Search</strong> - Find code by meaning, not just keywords</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeEngineModal;
