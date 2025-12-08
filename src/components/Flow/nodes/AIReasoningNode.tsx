/**
 * AIReasoningNode - LLM reasoning/analysis node
 */

import { memo } from 'react';
import { Brain } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { AIReasoningNodeData } from '../../../types/flow';

type AIReasoningNodeComponentData = AIReasoningNodeData;

interface AIReasoningNodeProps {
  data: AIReasoningNodeComponentData;
  selected?: boolean | undefined;
}

export const AIReasoningNode = memo<AIReasoningNodeProps>(({ data, selected }) => {
  const label = data.label || 'AI Reasoning';
  const prompt = data.prompt || 'Analyze this...';
  const truncatedPrompt = prompt.length > 60 ? prompt.substring(0, 57) + '...' : prompt;

  return (
    <BaseNode
      id=""
      label={label}
      icon={<Brain />}
      color="#8b5cf6"
      status={data.status}
      selected={selected}
    >
      <code title={prompt}>{truncatedPrompt}</code>
    </BaseNode>
  );
});

AIReasoningNode.displayName = 'AIReasoningNode';
