/**
 * FileOpNode - File operation node (read/write/etc)
 */

import { memo } from 'react';
import { FileText } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { FileOpNodeData } from '../../../types/flow';

type FileOpNodeComponentData = FileOpNodeData;

interface FileOpNodeProps {
  data: FileOpNodeComponentData;
  selected?: boolean | undefined;
}

const OPERATION_LABELS: Record<string, string> = {
  read: 'Read File',
  write: 'Write File',
  append: 'Append to File',
  exists: 'Check File Exists',
  delete: 'Delete File',
};

export const FileOpNode = memo<FileOpNodeProps>(({ data, selected }) => {
  const operation = data.operation || 'read';
  const label = data.label || OPERATION_LABELS[operation] || 'File Operation';
  const filePath = data.filePath || './file.txt';
  const truncatedPath = filePath.length > 40 ? '...' + filePath.substring(filePath.length - 37) : filePath;

  return (
    <BaseNode
      id=""
      label={label}
      icon={<FileText />}
      color="#3b82f6"
      status={data.status}
      selected={selected}
    >
      <code title={filePath}>{truncatedPath}</code>
    </BaseNode>
  );
});

FileOpNode.displayName = 'FileOpNode';
