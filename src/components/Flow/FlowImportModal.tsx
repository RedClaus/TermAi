
import React, { useState } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';
import styles from '../AI/dialogs.module.css';

interface FlowImportModalProps {
  onImport: (content: string) => void;
  onClose: () => void;
}

export const FlowImportModal: React.FC<FlowImportModalProps> = ({ onImport, onClose }) => {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    if (!jsonText.trim()) {
      setError('Please enter JSON content');
      return;
    }

    try {
      // Validate JSON
      JSON.parse(jsonText);
      onImport(jsonText);
      onClose();
    } catch (e) {
      setError('Invalid JSON format');
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()} style={{ width: '600px', maxWidth: '90vw' }}>
        <div className={styles.dialogHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
            <Upload size={20} />
            <h3 className={styles.dialogTitle}>Import Flow</h3>
          </div>
          <button 
            onClick={onClose}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            <X size={16} />
          </button>
        </div>
        
        <div className={styles.dialogBody}>
          <p className={styles.dialogDescription}>
            Paste your flow JSON below to import it.
          </p>
          
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setError(null);
            }}
            placeholder='{ "name": "My Flow", "nodes": [...] }'
            style={{
              width: '100%',
              height: '300px',
              background: '#1a1a1a',
              border: `1px solid ${error ? '#ef4444' : '#333'}`,
              borderRadius: '6px',
              padding: '12px',
              color: '#e5e7eb',
              fontFamily: 'monospace',
              fontSize: '12px',
              resize: 'vertical',
              outline: 'none'
            }}
          />

          {error && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: '#ef4444', 
              fontSize: '12px', 
              marginTop: '8px' 
            }}>
              <AlertCircle size={12} />
              <span>{error}</span>
            </div>
          )}
        </div>
        
        <div className={styles.dialogActions}>
          <button className={styles.secondaryButton} onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button 
            className={styles.primaryButton} 
            onClick={handleImport}
            style={{ 
              flex: 1, 
              padding: '8px', 
              borderRadius: '6px', 
              border: 'none', 
              cursor: 'pointer',
              background: '#a855f7',
              color: 'white'
            }}
          >
            Import JSON
          </button>
        </div>
      </div>
    </div>
  );
};
