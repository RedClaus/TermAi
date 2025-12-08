/**
 * LearnedSkillNode - User-saved skill from AI interactions
 * 
 * These nodes represent commands that the user has saved as reusable skills.
 * They can be customized with variables that get substituted at runtime.
 */

import { memo } from 'react';
import { Sparkles } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { LearnedSkillNodeData } from '../../../types/flow';

interface LearnedSkillNodeProps {
  data: LearnedSkillNodeData;
  selected?: boolean | undefined;
}

export const LearnedSkillNode = memo<LearnedSkillNodeProps>(({ data, selected }) => {
  const label = data.label || data.skillName || 'Learned Skill';
  const command = data.command || '';
  const description = data.description || '';

  // Extract variable placeholders from command (e.g., {{filename}})
  const variables = command.match(/\{\{(\w+)\}\}/g) || [];
  const hasVariables = variables.length > 0;

  return (
    <BaseNode
      id=""
      label={label}
      icon={<Sparkles />}
      color="#a855f7" // Purple for learned skills
      status={data.status}
      selected={selected}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {description && (
          <span 
            style={{ 
              fontSize: '10px', 
              color: '#9ca3af',
              fontStyle: 'italic',
              marginBottom: '2px'
            }}
          >
            {description}
          </span>
        )}
        <code 
          title={command}
          style={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '160px',
          }}
        >
          {command}
        </code>
        {hasVariables && (
          <span 
            style={{ 
              fontSize: '9px', 
              color: '#a855f7',
              marginTop: '2px'
            }}
          >
            Variables: {variables.join(', ')}
          </span>
        )}
      </div>
    </BaseNode>
  );
});

LearnedSkillNode.displayName = 'LearnedSkillNode';
