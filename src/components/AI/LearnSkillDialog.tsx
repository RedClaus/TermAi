/**
 * LearnSkillDialog - Prompts user to save a successful command as a reusable skill
 * 
 * Appears after commands execute successfully (exitCode === 0)
 * Allows customization of:
 * - Skill name
 * - Description (when to use)
 * - Command (with optional variable substitution)
 * - Option to make it a flow node
 */

import React, { useState, useCallback } from 'react';
import { Sparkles, X, Save, Workflow } from 'lucide-react';
import { KnowledgeService } from '../../services/KnowledgeService';
import type { SkillFlowNode } from '../../types/knowledge';
import styles from './dialogs.module.css';

interface LearnSkillDialogProps {
  command: string;
  output?: string | undefined;
  onSave?: ((skillId: string) => void) | undefined;
  onDismiss: () => void;
}

export const LearnSkillDialog: React.FC<LearnSkillDialogProps> = ({
  command,
  output,
  onSave,
  onDismiss,
}) => {
  const [skillName, setSkillName] = useState(() => {
    // Generate a default name from the command
    const firstWord = command.split(' ')[0];
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1) + ' Skill';
  });
  const [description, setDescription] = useState('');
  const [editableCommand, setEditableCommand] = useState(command);
  const [addToFlow, setAddToFlow] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect potential variables in command (paths, filenames, etc.)
  const suggestVariables = useCallback((cmd: string): string => {
    // Replace common patterns with variable placeholders
    let result = cmd;
    
    // File paths with extensions
    result = result.replace(/(\S+\.(ts|tsx|js|jsx|json|css|md|py|go|rs|sh|yaml|yml))/g, '{{filename}}');
    
    // Directory paths (starting with ./ or /)
    result = result.replace(/(?<!\{)\b(\.\/[\w\-/]+|\/[\w\-/]+)\b(?!\})/g, '{{path}}');
    
    return result;
  }, []);

  const handleSuggestVariables = useCallback(() => {
    setEditableCommand(suggestVariables(editableCommand));
  }, [editableCommand, suggestVariables]);

  const handleSave = async () => {
    if (!skillName.trim()) {
      setError('Please enter a skill name');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Build flowNode config if user wants to add to flow
      const flowNode: SkillFlowNode | undefined = addToFlow ? {
        name: skillName,
        description: description || `Runs: ${editableCommand.substring(0, 50)}...`,
        command: editableCommand,
        color: '#a855f7', // Purple for learned skills
      } : undefined;

      const skill = await KnowledgeService.addSkill({
        use_when: description || skillName,
        preferences: output ? `Last output: ${output.substring(0, 200)}` : undefined,
        tool_sops: [{
          tool_name: 'bash',
          action: editableCommand,
        }],
        flowNode,
      });

      if (skill) {
        onSave?.(skill.id);
        onDismiss();
      } else {
        setError('Failed to save skill. Please try again.');
      }
    } catch (err) {
      console.error('Error saving skill:', err);
      setError('An error occurred while saving the skill.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.dialogOverlay}>
      <div className={`${styles.dialog} ${styles.infoDialog}`}>
        {/* Header */}
        <div className={styles.dialogHeader}>
          <Sparkles size={16} style={{ color: '#a855f7' }} />
          <span className={styles.dialogTitle}>Save as Learned Skill?</span>
          <button 
            onClick={onDismiss}
            style={{ 
              marginLeft: 'auto', 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.dialogBody}>
          <p className={styles.dialogDescription}>
            This command ran successfully. Save it as a reusable skill to use in future sessions or in TermFlow automations.
          </p>

          {/* Skill Name */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Skill Name
            </label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g., Build Project"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              When to use (description)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., When building the TypeScript project"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Command */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Command
              </label>
              <button
                onClick={handleSuggestVariables}
                style={{
                  fontSize: '10px',
                  color: '#a855f7',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Suggest variables
              </button>
            </div>
            <textarea
              value={editableCommand}
              onChange={(e) => setEditableCommand(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '11px',
                fontFamily: 'monospace',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                outline: 'none',
                resize: 'vertical',
              }}
            />
            <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Tip: Use {'{{variable}}'} syntax for dynamic values
            </p>
          </div>

          {/* Add to Flow Toggle */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              padding: '8px',
              background: addToFlow ? 'rgba(168, 85, 247, 0.1)' : 'var(--bg-tertiary)',
              borderRadius: '6px',
              cursor: 'pointer',
              border: addToFlow ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid var(--border-color)',
            }}
            onClick={() => setAddToFlow(!addToFlow)}
          >
            <Workflow size={16} style={{ color: addToFlow ? '#a855f7' : 'var(--text-secondary)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Add to TermFlow
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                Make this skill available as a drag-and-drop node
              </div>
            </div>
            <div 
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                background: addToFlow ? '#a855f7' : 'var(--bg-secondary)',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div 
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '2px',
                  left: addToFlow ? '18px' : '2px',
                  transition: 'left 0.2s',
                }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '8px' }}>
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className={styles.dialogActions}>
          <button
            onClick={onDismiss}
            className={`${styles.dialogButton} ${styles.secondaryButton}`}
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`${styles.dialogButton} ${styles.primaryButton}`}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '6px',
              background: '#a855f7',
            }}
          >
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <Save size={14} />
                Save Skill
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
