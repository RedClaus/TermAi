/**
 * Prompt Library Modal
 * UI for managing customizable system prompts
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Edit3,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  Save,
  FileText,
} from 'lucide-react';
import { PromptLibraryService } from '../../services/PromptLibraryService';
import type { PromptTemplate, PromptLibrary } from '../../services/PromptLibraryService';
import styles from './PromptLibraryModal.module.css';

interface PromptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PromptLibraryModal: React.FC<PromptLibraryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [isNewPrompt, setIsNewPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load prompts on mount
  const loadPrompts = useCallback(async () => {
    try {
      setLoading(true);
      const allPrompts = await PromptLibraryService.listPrompts();
      setPrompts(allPrompts);
      setError(null);
    } catch {
      setError('Failed to load prompts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPrompts();
    }
  }, [isOpen, loadPrompts]);

  // Save prompt (create or update)
  const handleSavePrompt = async (prompt: PromptTemplate) => {
    try {
      const success = await PromptLibraryService.savePrompt(prompt);
      if (success) {
        setSuccess(isNewPrompt ? 'Prompt created successfully' : 'Prompt updated successfully');
        setEditingPrompt(null);
        setIsNewPrompt(false);
        await loadPrompts();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Failed to save prompt');
      }
    } catch {
      setError('Failed to save prompt');
    }
  };

  // Delete prompt
  const handleDeletePrompt = async (id: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    try {
      // Note: The service doesn't have a delete method, so we'll need to implement it
      // For now, we'll just reload - the backend delete endpoint exists
      const response = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setSuccess('Prompt deleted successfully');
        await loadPrompts();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Failed to delete prompt');
      }
    } catch {
      setError('Failed to delete prompt');
    }
  };

  // Reset to defaults
  const handleResetDefaults = async () => {
    if (!confirm('This will reset all prompts to defaults and delete custom prompts. Continue?')) return;

    try {
      const success = await PromptLibraryService.resetToDefaults();
      if (success) {
        setSuccess('Prompts reset to defaults');
        await loadPrompts();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Failed to reset prompts');
      }
    } catch {
      setError('Failed to reset prompts');
    }
  };

  // Export prompts
  const handleExport = async () => {
    try {
      const library = await PromptLibraryService.exportPrompts();
      const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'termai-prompts.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export prompts');
    }
  };

  // Import prompts
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const library: PromptLibrary = JSON.parse(text);

      if (!library.prompts || !Array.isArray(library.prompts)) {
        throw new Error('Invalid prompt library format');
      }

      const success = await PromptLibraryService.importPrompts(library);
      if (success) {
        setSuccess('Prompts imported successfully');
        await loadPrompts();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Failed to import prompts');
      }
    } catch (e) {
      setError('Failed to import prompts: ' + (e as Error).message);
    }

    // Reset file input
    event.target.value = '';
  };

  // Start editing a prompt
  const startEditing = (prompt: PromptTemplate | null = null) => {
    if (prompt) {
      setEditingPrompt({ ...prompt });
      setIsNewPrompt(false);
    } else {
      setEditingPrompt({
        id: '',
        name: '',
        description: '',
        template: '',
        defaults: {},
      });
      setIsNewPrompt(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <FileText size={20} />
            <span>Prompt Library</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className={styles.errorBanner}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {success && (
          <div className={styles.successBanner}>
            <span>{success}</span>
            <button onClick={() => setSuccess(null)}>×</button>
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => startEditing()}>
            <Plus size={16} />
            New Prompt
          </button>
          <button className={styles.actionBtn} onClick={handleResetDefaults}>
            <RotateCcw size={16} />
            Reset to Defaults
          </button>
          <button className={styles.actionBtn} onClick={handleExport}>
            <Download size={16} />
            Export
          </button>
          <label className={styles.actionBtn}>
            <Upload size={16} />
            Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {/* Content */}
        {loading ? (
          <div className={styles.loading}>Loading prompts...</div>
        ) : editingPrompt ? (
          <PromptEditor
            prompt={editingPrompt}
            isNew={isNewPrompt}
            onSave={handleSavePrompt}
            onCancel={() => {
              setEditingPrompt(null);
              setIsNewPrompt(false);
            }}
          />
        ) : (
          <PromptList
            prompts={prompts}
            onEdit={startEditing}
            onDelete={handleDeletePrompt}
          />
        )}

        {/* Help Section */}
        <div className={styles.helpSection}>
          <h4>How to use prompts</h4>
          <p>
            Prompts are templates used by the AI agent for various tasks. Variables like &#123;&#123;variableName&#125;&#125; will be replaced with actual values when the prompt is used.
          </p>
          <ul>
            <li><strong>Template:</strong> The main prompt text with &#123;&#123;variables&#125;&#125;</li>
            <li><strong>Defaults:</strong> Fallback values for variables (one per line, format: key=value)</li>
            <li><strong>Custom prompts</strong> are saved to ~/.config/termai/prompts.json</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// Prompt List Component
interface PromptListProps {
  prompts: PromptTemplate[];
  onEdit: (prompt: PromptTemplate) => void;
  onDelete: (id: string) => void;
}

const PromptList: React.FC<PromptListProps> = ({ prompts, onEdit, onDelete }) => {
  return (
    <div className={styles.promptList}>
      {prompts.map((prompt) => (
        <div key={prompt.id} className={styles.promptCard}>
          <div className={styles.promptHeader}>
            <h3 className={styles.promptName}>{prompt.name}</h3>
            <div className={styles.promptActions}>
              <button
                className={styles.iconBtn}
                onClick={() => onEdit(prompt)}
                title="Edit prompt"
              >
                <Edit3 size={16} />
              </button>
              <button
                className={styles.iconBtn}
                onClick={() => onDelete(prompt.id)}
                title="Delete prompt"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <p className={styles.promptDescription}>{prompt.description}</p>
          <div className={styles.promptPreview}>
            <pre className={styles.templatePreview}>
              {prompt.template.length > 200
                ? prompt.template.substring(0, 200) + '...'
                : prompt.template}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
};

// Prompt Editor Component
interface PromptEditorProps {
  prompt: PromptTemplate;
  isNew: boolean;
  onSave: (prompt: PromptTemplate) => void;
  onCancel: () => void;
}

const PromptEditor: React.FC<PromptEditorProps> = ({ prompt, isNew, onSave, onCancel }) => {
  const [editedPrompt, setEditedPrompt] = useState<PromptTemplate>(prompt);
  const [defaultsText, setDefaultsText] = useState(
    Object.entries(prompt.defaults || {}).map(([k, v]) => `${k}=${v}`).join('\n')
  );

  const handleSave = () => {
    if (!editedPrompt.id || !editedPrompt.name || !editedPrompt.template) {
      alert('ID, Name, and Template are required');
      return;
    }

    // Parse defaults
    const defaults: Record<string, string> = {};
    defaultsText.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        defaults[key.trim()] = valueParts.join('=').trim();
      }
    });

    onSave({ ...editedPrompt, defaults });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.editorForm}>
        <div className={styles.formRow}>
          <label>ID:</label>
          <input
            type="text"
            value={editedPrompt.id}
            onChange={(e) => setEditedPrompt({ ...editedPrompt, id: e.target.value })}
            placeholder="unique-identifier"
            disabled={!isNew}
          />
        </div>

        <div className={styles.formRow}>
          <label>Name:</label>
          <input
            type="text"
            value={editedPrompt.name}
            onChange={(e) => setEditedPrompt({ ...editedPrompt, name: e.target.value })}
            placeholder="Human readable name"
          />
        </div>

        <div className={styles.formRow}>
          <label>Description:</label>
          <input
            type="text"
            value={editedPrompt.description}
            onChange={(e) => setEditedPrompt({ ...editedPrompt, description: e.target.value })}
            placeholder="What this prompt does"
          />
        </div>

        <div className={styles.formRow}>
          <label>Template:</label>
          <textarea
            value={editedPrompt.template}
            onChange={(e) => setEditedPrompt({ ...editedPrompt, template: e.target.value })}
            placeholder="Prompt template with {{variables}}"
            rows={10}
          />
        </div>

        <div className={styles.formRow}>
          <label>Defaults (key=value):</label>
          <textarea
            value={defaultsText}
            onChange={(e) => setDefaultsText(e.target.value)}
            placeholder="os=Linux&#10;cwd=~"
            rows={3}
          />
        </div>
      </div>

      <div className={styles.editorActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button className={styles.saveBtn} onClick={handleSave}>
          <Save size={16} />
          {isNew ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default PromptLibraryModal;