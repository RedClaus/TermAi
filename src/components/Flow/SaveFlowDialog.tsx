/**
 * SaveFlowDialog - Save flow with name and folder selection
 * 
 * Allows users to:
 * - Name their flow
 * - Select an existing folder (project) or create a new one
 * - Save the flow to the selected location
 */

import { useState, useEffect } from 'react';
import { 
  Save, 
  Folder, 
  FolderPlus, 
  X, 
  Check,
  ChevronDown 
} from 'lucide-react';
import { FlowService } from '../../services/FlowService';
import styles from './SaveFlowDialog.module.css';

interface SaveFlowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, folder: string) => void;
  currentName: string;
  currentFolder?: string;
}

export const SaveFlowDialog: React.FC<SaveFlowDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  currentName,
  currentFolder = '',
}) => {
  const [name, setName] = useState(currentName);
  const [folder, setFolder] = useState(currentFolder);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [existingFolders, setExistingFolders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Load existing folders from flows
  useEffect(() => {
    if (isOpen) {
      loadFolders();
      setName(currentName);
      setFolder(currentFolder);
    }
  }, [isOpen, currentName, currentFolder]);

  const loadFolders = async () => {
    try {
      const flows = await FlowService.listFlows();
      const folders = new Set<string>();
      for (const flow of flows) {
        if (flow.folder) {
          folders.add(flow.folder);
        }
      }
      setExistingFolders(Array.from(folders).sort());
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    
    setSaving(true);
    try {
      onSave(name.trim(), folder);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    
    // Sanitize folder name
    const sanitized = newFolderName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '-');
    if (sanitized) {
      setFolder(sanitized);
      if (!existingFolders.includes(sanitized)) {
        setExistingFolders(prev => [...prev, sanitized].sort());
      }
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
    setShowFolderDropdown(false);
  };

  const handleSelectFolder = (selectedFolder: string) => {
    setFolder(selectedFolder);
    setShowFolderDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isCreatingFolder) {
        handleCreateFolder();
      } else {
        handleSave();
      }
    }
    if (e.key === 'Escape') {
      if (isCreatingFolder) {
        setIsCreatingFolder(false);
        setNewFolderName('');
      } else if (showFolderDropdown) {
        setShowFolderDropdown(false);
      } else {
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <Save size={18} />
            Save Flow
          </h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          {/* Flow Name */}
          <div className={styles.field}>
            <label className={styles.label}>Flow Name</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter flow name..."
              autoFocus
            />
          </div>

          {/* Folder Selection */}
          <div className={styles.field}>
            <label className={styles.label}>
              Project Folder
              <span className={styles.optional}>(optional)</span>
            </label>
            
            <div className={styles.folderSelector}>
              <button 
                className={styles.folderButton}
                onClick={() => setShowFolderDropdown(!showFolderDropdown)}
              >
                <Folder size={16} />
                <span>{folder || 'No folder (root)'}</span>
                <ChevronDown size={16} className={showFolderDropdown ? styles.rotated : ''} />
              </button>

              {showFolderDropdown && (
                <div className={styles.dropdown}>
                  {/* Root option */}
                  <button 
                    className={`${styles.dropdownItem} ${!folder ? styles.selected : ''}`}
                    onClick={() => handleSelectFolder('')}
                  >
                    <Folder size={14} />
                    <span>No folder (root)</span>
                    {!folder && <Check size={14} />}
                  </button>

                  {/* Existing folders */}
                  {existingFolders.map(f => (
                    <button 
                      key={f}
                      className={`${styles.dropdownItem} ${folder === f ? styles.selected : ''}`}
                      onClick={() => handleSelectFolder(f)}
                    >
                      <Folder size={14} />
                      <span>{f}</span>
                      {folder === f && <Check size={14} />}
                    </button>
                  ))}

                  <div className={styles.dropdownDivider} />

                  {/* Create new folder */}
                  {isCreatingFolder ? (
                    <div className={styles.newFolderInput}>
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        placeholder="Folder name..."
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateFolder();
                          }
                        }}
                      />
                      <button onClick={handleCreateFolder}>
                        <Check size={14} />
                      </button>
                      <button onClick={() => {
                        setIsCreatingFolder(false);
                        setNewFolderName('');
                      }}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button 
                      className={styles.createFolderBtn}
                      onClick={() => setIsCreatingFolder(true)}
                    >
                      <FolderPlus size={14} />
                      <span>Create new folder</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          {(name || folder) && (
            <div className={styles.preview}>
              <span className={styles.previewLabel}>Save location:</span>
              <code className={styles.previewPath}>
                {folder ? `${folder}/` : ''}{name || 'Untitled'}.json
              </code>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button 
            className={styles.saveBtn} 
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? 'Saving...' : 'Save Flow'}
          </button>
        </div>
      </div>
    </div>
  );
};
