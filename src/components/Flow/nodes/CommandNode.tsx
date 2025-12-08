/**
 * CommandNode - Shell command execution node
 */

import { memo } from 'react';
import { Terminal } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { CommandNodeData } from '../../../types/flow';

type CommandNodeComponentData = CommandNodeData;

interface CommandNodeProps {
  data: CommandNodeComponentData;
  selected?: boolean | undefined;
}

export const CommandNode = memo<CommandNodeProps>(({ data, selected }) => {
  const label = data.label || 'Command';
  const command = data.command || 'echo "Hello"';

  return (
    <BaseNode
      id=""
      label={label}
      icon={<Terminal />}
      color="#22c55e"
      status={data.status}
      selected={selected}
    >
      <code title={command}>{command}</code>
    </BaseNode>
  );
});

CommandNode.displayName = 'CommandNode';
