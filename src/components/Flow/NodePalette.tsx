/**
 * NodePalette - Drag-and-drop palette for adding nodes to the flow
 * 
 * Includes:
 * - Built-in node types (Command, AI, Condition, File Op)
 * - Learned Skills section (user-saved skills with flowNode config)
 */

import { useState, useEffect, useCallback } from 'react';
import { Terminal, Brain, GitBranch, FileText, Sparkles, Loader, RefreshCw, Upload } from 'lucide-react';
import { KnowledgeService } from '../../services/KnowledgeService';
import type { FlowNodeType, LearnedSkillNodeData } from '../../types/flow';
import type { Skill } from '../../types/knowledge';
import styles from './NodePalette.module.css';

interface NodePaletteProps {
  onImportFlow?: () => void;
}

interface PaletteItem {
  type: FlowNodeType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface LearnedSkillPaletteItem {
  skill: Skill;
  label: string;
  description: string;
  command: string;
}

const builtInItems: PaletteItem[] = [
  {
    type: 'command',
    label: 'Command',
    description: 'Run shell command',
    icon: <Terminal size={18} />,
  },
  {
    type: 'ai-reasoning',
    label: 'AI Analysis',
    description: 'LLM reasoning step',
    icon: <Brain size={18} />,
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on condition',
    icon: <GitBranch size={18} />,
  },
  {
    type: 'file-op',
    label: 'File Op',
    description: 'Read/write files',
    icon: <FileText size={18} />,
  },
];

export const NodePalette: React.FC<NodePaletteProps> = ({ onImportFlow }) => {
  const [learnedSkills, setLearnedSkills] = useState<LearnedSkillPaletteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch learned skills that have flowNode config
  const fetchLearnedSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const skills = await KnowledgeService.getLatestSkills();
      // Filter to only skills with flowNode config
      const flowSkills = skills
        .filter((s) => s.flowNode)
        .map((s) => ({
          skill: s,
          label: s.flowNode!.name,
          description: s.flowNode!.description,
          command: s.flowNode!.command,
        }));
      setLearnedSkills(flowSkills);
    } catch (error) {
      console.error('Failed to fetch learned skills:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLearnedSkills();
  }, [fetchLearnedSkills]);

  // Handle drag start for built-in nodes
  const onDragStart = (event: React.DragEvent, nodeType: FlowNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag start for learned skill nodes
  const onSkillDragStart = (event: React.DragEvent, skillItem: LearnedSkillPaletteItem) => {
    // Pass learned-skill type along with the skill data
    event.dataTransfer.setData('application/reactflow', 'learned-skill');
    
    // Encode the skill data as JSON for the drop handler
    const skillData: Partial<LearnedSkillNodeData> = {
      skillId: skillItem.skill.id,
      skillName: skillItem.label,
      command: skillItem.command,
      description: skillItem.description,
      label: skillItem.label,
    };
    event.dataTransfer.setData('application/skill-data', JSON.stringify(skillData));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={styles.palette}>
      {/* Built-in Nodes */}
      <div className={styles.header}>Add Nodes</div>
      
      {onImportFlow && (
        <button 
          onClick={onImportFlow}
          className={styles.importButton}
          title="Import Flow JSON"
        >
          <Upload size={14} />
          <span>Input Flow JSON</span>
        </button>
      )}

      <div className={styles.items}>
        {builtInItems.map((item) => (
          <div
            key={item.type}
            className={styles.item}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            title={item.description}
          >
            <div className={styles.itemIcon}>{item.icon}</div>
            <div className={styles.itemInfo}>
              <div className={styles.itemLabel}>{item.label}</div>
              <div className={styles.itemDesc}>{item.description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Learned Skills Section */}
      <div className={styles.sectionDivider}>
        <Sparkles size={14} />
        <span>Learned Skills</span>
        <button
          onClick={fetchLearnedSkills}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            color: 'var(--text-secondary)',
          }}
          title="Refresh skills"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loadingState}>
          <Loader size={16} />
        </div>
      ) : learnedSkills.length === 0 ? (
        <div className={styles.emptyState}>
          No learned skills yet.
          <br />
          Save commands from the AI chat!
        </div>
      ) : (
        <div className={styles.items}>
          {learnedSkills.map((skillItem) => (
            <div
              key={skillItem.skill.id}
              className={`${styles.item} ${styles.learnedSkillItem}`}
              draggable
              onDragStart={(e) => onSkillDragStart(e, skillItem)}
              title={`${skillItem.description}\n\nCommand: ${skillItem.command}`}
            >
              <div className={styles.itemIcon}>
                <Sparkles size={18} />
              </div>
              <div className={styles.itemInfo}>
                <div className={styles.itemLabel}>{skillItem.label}</div>
                <div className={styles.itemDesc}>{skillItem.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
