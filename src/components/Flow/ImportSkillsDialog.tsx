
import React, { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import type { LearnedSkillNodeData } from '../../types/flow';
import styles from '../AI/dialogs.module.css';

interface ImportSkillsDialogProps {
  skills: LearnedSkillNodeData[];
  onConfirm: (selectedSkills: LearnedSkillNodeData[]) => void;
  onCancel: () => void;
}

export const ImportSkillsDialog: React.FC<ImportSkillsDialogProps> = ({
  skills,
  onConfirm,
  onCancel,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(skills.map(s => s.skillId))
  );

  const toggleSkill = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleConfirm = () => {
    const selected = skills.filter(s => selectedIds.has(s.skillId));
    onConfirm(selected);
  };

  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className={styles.dialogHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
            <Sparkles size={20} />
            <h3 className={styles.dialogTitle}>Import New Skills</h3>
          </div>
          <button 
            onClick={onCancel}
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
            This flow contains {skills.length} skills that are not in your library. 
            Select the ones you want to save for future use.
          </p>
          
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px', 
            maxHeight: '300px', 
            overflowY: 'auto', 
            paddingRight: '4px' 
          }}>
            {skills.map(skill => (
              <div 
                key={skill.skillId}
                onClick={() => toggleSkill(skill.skillId)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: selectedIds.has(skill.skillId) ? 'rgba(168, 85, 247, 0.1)' : '#1a1a1a',
                  borderColor: selectedIds.has(skill.skillId) ? 'rgba(168, 85, 247, 0.5)' : '#333'
                }}
              >
                <div style={{
                  marginTop: '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  border: '1px solid',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backgroundColor: selectedIds.has(skill.skillId) ? '#a855f7' : 'transparent',
                  borderColor: selectedIds.has(skill.skillId) ? '#a855f7' : '#666'
                }}>
                  {selectedIds.has(skill.skillId) && <Check size={12} color="white" />}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: '#e5e7eb', fontSize: '14px' }}>{skill.skillName}</span>
                  </div>
                  <p style={{ 
                    fontSize: '12px', 
                    color: '#9ca3af', 
                    fontFamily: 'monospace', 
                    backgroundColor: 'rgba(0,0,0,0.3)', 
                    padding: '4px 6px', 
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {skill.command}
                  </p>
                  {skill.description && (
                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{skill.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className={styles.dialogActions}>
          <button className={styles.secondaryButton} onClick={onCancel} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
            Skip Import
          </button>
          <button 
            className={styles.primaryButton} 
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            style={{ 
              flex: 1, 
              padding: '8px', 
              borderRadius: '6px', 
              border: 'none', 
              cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedIds.size === 0 ? 0.5 : 1,
              background: '#a855f7',
              color: 'white'
            }}
          >
            Import {selectedIds.size} Skills
          </button>
        </div>
      </div>
    </div>
  );
};
