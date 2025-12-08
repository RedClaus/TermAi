/**
 * ConditionNode - Branching logic node (if-else)
 */

import { memo } from 'react';
import { GitBranch } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { ConditionNodeData } from '../../../types/flow';

type ConditionNodeComponentData = ConditionNodeData;

interface ConditionNodeProps {
  data: ConditionNodeComponentData;
  selected?: boolean | undefined;
}

export const ConditionNode = memo<ConditionNodeProps>(({ data, selected }) => {
  const label = data.label || 'Condition';
  const condition = data.condition || 'value === true';
  const truncatedCondition = condition.length > 50 ? condition.substring(0, 47) + '...' : condition;

  return (
    <BaseNode
      id=""
      label={label}
      icon={<GitBranch />}
      color="#f59e0b"
      status={data.status}
      selected={selected}
      hasConditionalOutputs={true}
    >
      <code title={condition}>{truncatedCondition}</code>
    </BaseNode>
  );
});

ConditionNode.displayName = 'ConditionNode';
