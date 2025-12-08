/**
 * FlowBrowser - Browse and load saved flows organized by folder
 * 
 * Displays flows in a hierarchical folder structure with ability to:
 * - Browse flows by project/folder
 * - Open existing flows
 * - Delete flows
 * - Create new folders (projects)
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Trash2, 
  Play, 
  Clock,
  X 
} from 'lucide-react';
import { FlowService } from '../../services/FlowService';
import type { Flow } from '../../types/flow';
import styles from './FlowBrowser.module.css';

interface FlowBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadFlow: (flowId: string) => void;
  currentFlowId?: string | null;
}

interface FolderStructure {
  name: string;
  path: string;
  flows: Flow[];
  isExpanded: boolean;
}

export const FlowBrowser: React.FC<FlowBrowserProps> = ({
  isOpen,
  onClose,
  onLoadFlow,
  currentFlowId,
}) => {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load flows on mount
  useEffect(() => {
    if (isOpen) {
      loadFlows();
    }
  }, [isOpen]);

  const loadFlows = async () => {
    setLoading(true);
    try {
      const flowList = await FlowService.listFlows();
      setFlows(flowList);
    } catch (error) {
      console.error('Failed to load flows:', error);
    } finally {
      setLoading(false);
    }
  };

  // Organize flows by folder
  const folderStructure = useMemo(() => {
    const folders: Map<string, Flow[]> = new Map();
    folders.set('', []); // Root folder

    for (const flow of flows) {
      const folder = flow.folder || '';
      if (!folders.has(folder)) {
        folders.set(folder, []);
      }
      folders.get(folder)!.push(flow);
    }

    // Sort flows within each folder by update time
    for (const [, flowList] of folders) {
      flowList.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    // Convert to array and sort folders alphabetically (root first)
    const result: FolderStructure[] = [];
    const sortedFolders = Array.from(folders.keys()).sort((a, b) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return a.localeCompare(b);
    });

    for (const folderPath of sortedFolders) {
      result.push({
        name: folderPath || 'Unsorted Flows',
        path: folderPath,
        flows: folders.get(folderPath)!,
        isExpanded: expandedFolders.has(folderPath),
      });
    }

    return result;
  }, [flows, expandedFolders]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleDelete = async (flowId: string) => {
    try {
      await FlowService.deleteFlow(flowId);
      setFlows(prev => prev.filter(f => f.id !== flowId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete flow:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.browser} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <FolderOpen size={18} />
            Saved Flows
          </h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading flows...</div>
          ) : flows.length === 0 ? (
            <div className={styles.empty}>
              <FileText size={32} />
              <p>No saved flows yet</p>
              <span>Create and save your first flow to see it here</span>
            </div>
          ) : (
            <div className={styles.folderList}>
              {folderStructure.map(folder => (
                <div key={folder.path} className={styles.folderGroup}>
                  <button 
                    className={styles.folderHeader}
                    onClick={() => toggleFolder(folder.path)}
                  >
                    {folder.isExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    {folder.path ? (
                      <Folder size={16} className={styles.folderIcon} />
                    ) : (
                      <FolderOpen size={16} className={styles.folderIcon} />
                    )}
                    <span className={styles.folderName}>{folder.name}</span>
                    <span className={styles.flowCount}>{folder.flows.length}</span>
                  </button>

                  {folder.isExpanded && (
                    <div className={styles.flowList}>
                      {folder.flows.map(flow => (
                        <div 
                          key={flow.id} 
                          className={`${styles.flowItem} ${flow.id === currentFlowId ? styles.active : ''}`}
                        >
                          <div 
                            className={styles.flowInfo}
                            onClick={() => {
                              onLoadFlow(flow.id);
                              onClose();
                            }}
                          >
                            <FileText size={14} className={styles.flowIcon} />
                            <div className={styles.flowDetails}>
                              <span className={styles.flowName}>{flow.name}</span>
                              <span className={styles.flowMeta}>
                                <Clock size={10} />
                                {formatDate(flow.updatedAt)}
                                {flow.nodes && ` • ${flow.nodes.length} nodes`}
                              </span>
                            </div>
                          </div>
                          <div className={styles.flowActions}>
                            <button 
                              className={styles.actionBtn}
                              onClick={() => {
                                onLoadFlow(flow.id);
                                onClose();
                              }}
                              title="Open flow"
                            >
                              <Play size={14} />
                            </button>
                            {deleteConfirm === flow.id ? (
                              <>
                                <button 
                                  className={`${styles.actionBtn} ${styles.confirmDelete}`}
                                  onClick={() => handleDelete(flow.id)}
                                  title="Confirm delete"
                                >
                                  Yes
                                </button>
                                <button 
                                  className={styles.actionBtn}
                                  onClick={() => setDeleteConfirm(null)}
                                  title="Cancel"
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <button 
                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                onClick={() => setDeleteConfirm(flow.id)}
                                title="Delete flow"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
