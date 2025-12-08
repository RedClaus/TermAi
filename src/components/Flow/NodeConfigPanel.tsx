/**
 * NodeConfigPanel - Side panel for editing node configuration
 */

import { useState, useEffect } from 'react';
import { X, Terminal, Brain, GitBranch, FileText, FolderOpen } from 'lucide-react';
import { FileBrowser, type SelectedFile } from '../AI/FileBrowser';
import type { 
  FlowNode, 
  FlowNodeData,
  CommandNodeData,
  AIReasoningNodeData,
  ConditionNodeData,
  FileOpNodeData,
} from '../../types/flow';
import styles from './NodeConfigPanel.module.css';

interface NodeConfigPanelProps {
  node: FlowNode;
  nodes: FlowNode[];
  onClose: () => void;
  onChange: (data: FlowNodeData) => void;
}

/**
 * Get available variables from preceding nodes for autocomplete hints
 */
const getAvailableVariables = (nodes: FlowNode[], currentNodeId: string): string[] => {
  return nodes
    .filter(n => n.id !== currentNodeId)
    .flatMap(n => [
      `{{${n.id}.stdout}}`,
      `{{${n.id}.exitCode}}`,
      `{{${n.id}.response}}`,
      `{{${n.id}.content}}`,
    ]);
};

/**
 * Command Node Config
 */
const CommandConfig: React.FC<{
  data: CommandNodeData;
  onChange: (data: CommandNodeData) => void;
  variables: string[];
}> = ({ data, onChange, variables }) => {
  return (
    <div className={styles.configFields}>
      <div className={styles.field}>
        <label>Label</label>
        <input
          type="text"
          value={data.label ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="Node label"
        />
      </div>
      
      <div className={styles.field}>
        <label>Command</label>
        <textarea
          value={data.command}
          onChange={(e) => onChange({ ...data, command: e.target.value })}
          placeholder="Enter shell command..."
          rows={4}
        />
        <div className={styles.hint}>
          Use {`{{nodeId.stdout}}`} to reference output from other nodes
        </div>
      </div>

      <div className={styles.field}>
        <label>Working Directory (optional)</label>
        <input
          type="text"
          value={data.cwd ?? ''}
          onChange={(e) => onChange({ ...data, cwd: e.target.value || undefined })}
          placeholder="Leave blank for current directory"
        />
      </div>

      <div className={styles.field}>
        <label>Timeout (ms, optional)</label>
        <input
          type="number"
          value={data.timeout ?? ''}
          onChange={(e) => onChange({ ...data, timeout: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          placeholder="30000"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={data.continueOnError ?? false}
            onChange={(e) => onChange({ ...data, continueOnError: e.target.checked })}
          />
          Continue on error
        </label>
      </div>

      {variables.length > 0 && (
        <div className={styles.variableHints}>
          <div className={styles.variableHintsLabel}>Available Variables:</div>
          <div className={styles.variableList}>
            {variables.slice(0, 8).map((v, i) => (
              <code key={i} className={styles.variableChip}>{v}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * AI Reasoning Node Config
 */
const AIReasoningConfig: React.FC<{
  data: AIReasoningNodeData;
  onChange: (data: AIReasoningNodeData) => void;
  variables: string[];
}> = ({ data, onChange, variables }) => {
  return (
    <div className={styles.configFields}>
      <div className={styles.field}>
        <label>Label</label>
        <input
          type="text"
          value={data.label ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="Node label"
        />
      </div>
      
      <div className={styles.field}>
        <label>Prompt</label>
        <textarea
          value={data.prompt}
          onChange={(e) => onChange({ ...data, prompt: e.target.value })}
          placeholder="Enter prompt for AI analysis..."
          rows={6}
        />
        <div className={styles.hint}>
          Use {`{{nodeId.stdout}}`} or {`{{nodeId.response}}`} to include output from other nodes
        </div>
      </div>

      <div className={styles.field}>
        <label>System Prompt (optional)</label>
        <textarea
          value={data.systemPrompt ?? ''}
          onChange={(e) => onChange({ ...data, systemPrompt: e.target.value || undefined })}
          placeholder="Custom system prompt..."
          rows={3}
        />
      </div>

      <div className={styles.field}>
        <label>Provider (optional)</label>
        <select
          value={data.provider ?? ''}
          onChange={(e) => onChange({ ...data, provider: (e.target.value || undefined) as AIReasoningNodeData['provider'] })}
        >
          <option value="">Use default</option>
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>

      <div className={styles.field}>
        <label>Model (optional)</label>
        <input
          type="text"
          value={data.model ?? ''}
          onChange={(e) => onChange({ ...data, model: e.target.value || undefined })}
          placeholder="e.g., gpt-4, gemini-pro"
        />
      </div>

      {variables.length > 0 && (
        <div className={styles.variableHints}>
          <div className={styles.variableHintsLabel}>Available Variables:</div>
          <div className={styles.variableList}>
            {variables.slice(0, 8).map((v, i) => (
              <code key={i} className={styles.variableChip}>{v}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Condition Node Config
 */
const ConditionConfig: React.FC<{
  data: ConditionNodeData;
  onChange: (data: ConditionNodeData) => void;
  variables: string[];
}> = ({ data, onChange, variables }) => {
  return (
    <div className={styles.configFields}>
      <div className={styles.field}>
        <label>Label</label>
        <input
          type="text"
          value={data.label ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="Node label"
        />
      </div>
      
      <div className={styles.field}>
        <label>Condition</label>
        <textarea
          value={data.condition}
          onChange={(e) => onChange({ ...data, condition: e.target.value })}
          placeholder="{{nodeId.exitCode}} === 0"
          rows={3}
        />
        <div className={styles.hint}>
          Supported: ==, ===, !=, !==, &gt;, &lt;, &gt;=, &lt;=, includes(), startsWith(), endsWith()
        </div>
      </div>

      {variables.length > 0 && (
        <div className={styles.variableHints}>
          <div className={styles.variableHintsLabel}>Available Variables:</div>
          <div className={styles.variableList}>
            {variables.slice(0, 8).map((v, i) => (
              <code key={i} className={styles.variableChip}>{v}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * File Operation Node Config
 */
const FileOpConfig: React.FC<{
  data: FileOpNodeData;
  onChange: (data: FileOpNodeData) => void;
  variables: string[];
}> = ({ data, onChange, variables }) => {
  const [showFileBrowser, setShowFileBrowser] = useState(false);

  const handleFileSelect = (files: SelectedFile[]) => {
    console.log('[FileOpConfig] handleFileSelect called with:', files);
    if (files.length > 0) {
      const selectedPath = files[0].path;
      console.log('[FileOpConfig] Setting filePath to:', selectedPath);
      // Create new data object with the file path
      const newData = { ...data, filePath: selectedPath };
      console.log('[FileOpConfig] New data:', newData);
      onChange(newData);
    }
  };

  return (
    <div className={styles.configFields}>
      <div className={styles.field}>
        <label>Label</label>
        <input
          type="text"
          value={data.label ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="Node label"
        />
      </div>

      <div className={styles.field}>
        <label>Operation</label>
        <select
          value={data.operation}
          onChange={(e) => onChange({ ...data, operation: e.target.value as FileOpNodeData['operation'] })}
        >
          <option value="read">Read File</option>
          <option value="write">Write File</option>
          <option value="append">Append to File</option>
          <option value="exists">Check Exists</option>
          <option value="delete">Delete File</option>
        </select>
      </div>
      
      <div className={styles.field}>
        <label>File Path</label>
        <div className={styles.inputWithButton}>
          <input
            type="text"
            value={data.filePath ?? ''}
            onChange={(e) => onChange({ ...data, filePath: e.target.value })}
            placeholder="./path/to/file.txt"
          />
          <button 
            type="button"
            className={styles.browseBtn}
            onClick={() => setShowFileBrowser(true)}
            title="Browse files"
          >
            <FolderOpen size={16} />
          </button>
        </div>
        <div className={styles.hint}>
          Relative paths are resolved from the session working directory
        </div>
      </div>

      {(data.operation === 'write' || data.operation === 'append') && (
        <div className={styles.field}>
          <label>Content</label>
          <textarea
            value={data.content ?? ''}
            onChange={(e) => onChange({ ...data, content: e.target.value })}
            placeholder="Content to write..."
            rows={4}
          />
          <div className={styles.hint}>
            Use {`{{nodeId.stdout}}`} to write output from other nodes
          </div>
        </div>
      )}

      {variables.length > 0 && (
        <div className={styles.variableHints}>
          <div className={styles.variableHintsLabel}>Available Variables:</div>
          <div className={styles.variableList}>
            {variables.slice(0, 8).map((v, i) => (
              <code key={i} className={styles.variableChip}>{v}</code>
            ))}
          </div>
        </div>
      )}

      {/* File Browser Modal */}
      <FileBrowser
        isOpen={showFileBrowser}
        onClose={() => setShowFileBrowser(false)}
        onSelect={handleFileSelect}
        mode="browse"
        multiSelect={false}
      />
    </div>
  );
};

/**
 * Get icon for node type
 */
const getNodeIcon = (type: string): React.ReactNode => {
  switch (type) {
    case 'command': return <Terminal size={18} />;
    case 'ai-reasoning': return <Brain size={18} />;
    case 'condition': return <GitBranch size={18} />;
    case 'file-op': return <FileText size={18} />;
    default: return null;
  }
};

/**
 * Get title for node type
 */
const getNodeTitle = (type: string): string => {
  switch (type) {
    case 'command': return 'Command Node';
    case 'ai-reasoning': return 'AI Reasoning Node';
    case 'condition': return 'Condition Node';
    case 'file-op': return 'File Operation Node';
    default: return 'Node Configuration';
  }
};

/**
 * NodeConfigPanel Component
 */
export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  nodes,
  onClose,
  onChange,
}) => {
  const [localData, setLocalData] = useState<FlowNodeData>(node.data);
  const variables = getAvailableVariables(nodes, node.id);

  // Sync local state when node changes
  useEffect(() => {
    setLocalData(node.data);
  }, [node.id, node.data]);

  // Debounced onChange - propagate changes after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localData);
    }, 150);
    return () => clearTimeout(timer);
  }, [localData, onChange]);

  const renderConfig = () => {
    switch (node.type) {
      case 'command':
        return (
          <CommandConfig
            data={localData as CommandNodeData}
            onChange={setLocalData}
            variables={variables}
          />
        );
      case 'ai-reasoning':
        return (
          <AIReasoningConfig
            data={localData as AIReasoningNodeData}
            onChange={setLocalData}
            variables={variables}
          />
        );
      case 'condition':
        return (
          <ConditionConfig
            data={localData as ConditionNodeData}
            onChange={setLocalData}
            variables={variables}
          />
        );
      case 'file-op':
        return (
          <FileOpConfig
            data={localData as FileOpNodeData}
            onChange={setLocalData}
            variables={variables}
          />
        );
      default:
        return <div>Unknown node type</div>;
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.headerIcon}>{getNodeIcon(node.type)}</span>
          <span>{getNodeTitle(node.type)}</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      
      <div className={styles.content}>
        {renderConfig()}
      </div>

      <div className={styles.footer}>
        <div className={styles.nodeId}>ID: {node.id}</div>
      </div>
    </div>
  );
};
