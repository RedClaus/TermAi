/**
 * Flow Node Components - Export all custom node types
 */

import { CommandNode } from './CommandNode';
import { AIReasoningNode } from './AIReasoningNode';
import { ConditionNode } from './ConditionNode';
import { FileOpNode } from './FileOpNode';
import { LearnedSkillNode } from './LearnedSkillNode';

export { BaseNode } from './BaseNode';
export { CommandNode } from './CommandNode';
export { AIReasoningNode } from './AIReasoningNode';
export { ConditionNode } from './ConditionNode';
export { FileOpNode } from './FileOpNode';
export { LearnedSkillNode } from './LearnedSkillNode';

// Node type registry for React Flow
export const nodeTypes = {
  command: CommandNode,
  'ai-reasoning': AIReasoningNode,
  condition: ConditionNode,
  'file-op': FileOpNode,
  'learned-skill': LearnedSkillNode,
};
