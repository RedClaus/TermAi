/**
 * FlowCanvas - Main React Flow canvas component for TermFlow
 * 
 * Provides:
 * - Drag and drop node placement
 * - Visual node connections
 * - Real-time execution status
 * - Node selection and configuration
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  Panel,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Play, Square, Save, FolderOpen, Plus, Trash2, RotateCcw, Terminal, HelpCircle, Folder } from 'lucide-react';
import { nodeTypes } from './nodes';
import { NodePalette } from './NodePalette';
import { NodeConfigPanel } from './NodeConfigPanel';
import { ExecutionPanel } from './ExecutionPanel';
import { FlowHelpModal } from './FlowHelpModal';
import { ImportSkillsDialog } from './ImportSkillsDialog';
import { FlowImportModal } from './FlowImportModal';
import { FlowBrowser } from './FlowBrowser';
import { SaveFlowDialog } from './SaveFlowDialog';
import { FlowService, flowExecutionManager, type FlowExecutionEvent } from '../../services/FlowService';
import { KnowledgeService } from '../../services/KnowledgeService';
import type { 
  Flow, 
  FlowNode, 
  FlowEdge, 
  FlowNodeType, 
  NodeStatus,
  FlowNodeData,
  CommandNodeData,
  AIReasoningNodeData,
  ConditionNodeData,
  FileOpNodeData,
  LearnedSkillNodeData,
} from '../../types/flow';
import styles from './FlowCanvas.module.css';

interface FlowCanvasProps {
  initialFlowId?: string;
  sessionId?: string;
  onFlowChange?: (flow: Flow) => void;
}

/**
 * Generate a unique node ID
 */
const generateNodeId = (): string => {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Default data for each node type
 */
const getDefaultNodeData = (type: FlowNodeType, skillData?: Partial<LearnedSkillNodeData>): FlowNodeData => {
  switch (type) {
    case 'command':
      return { command: 'echo "Hello World"', label: 'Command' } as CommandNodeData;
    case 'ai-reasoning':
      return { prompt: 'Analyze the output...', label: 'AI Analysis' } as AIReasoningNodeData;
    case 'condition':
      return { condition: '{{prev.exitCode}} === 0', label: 'Check Result' } as ConditionNodeData;
    case 'file-op':
      return { operation: 'read', filePath: './file.txt', label: 'Read File' } as FileOpNodeData;
    case 'learned-skill':
      return {
        skillId: skillData?.skillId ?? '',
        skillName: skillData?.skillName ?? 'Learned Skill',
        command: skillData?.command ?? '',
        description: skillData?.description,
        label: skillData?.label ?? 'Learned Skill',
      } as LearnedSkillNodeData;
  }
};

/**
 * FlowCanvas Component
 */
export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  initialFlowId,
  sessionId = 'default',
  onFlowChange,
}) => {
  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  // Flow metadata
  const [flowId, setFlowId] = useState<string | null>(initialFlowId || null);
  const [flowName, setFlowName] = useState('New Flow');
  const [flowFolder, setFlowFolder] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  
  // UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [showExecution, setShowExecution] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  
  // Import state
  const [pendingImportFlow, setPendingImportFlow] = useState<Flow | null>(null);
  const [newSkillsToImport, setNewSkillsToImport] = useState<LearnedSkillNodeData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // ===========================================================================
  // Load Flow
  // ===========================================================================
  
  useEffect(() => {
    if (initialFlowId) {
      loadFlow(initialFlowId);
    }
  }, [initialFlowId]);

  const loadFlow = async (id: string) => {
    try {
      const flow = await FlowService.getFlow(id);
      if (flow) {
        setFlowId(flow.id);
        setFlowName(flow.name);
        setFlowFolder(flow.folder || '');
        setNodes(flow.nodes as Node[]);
        setEdges(flow.edges as Edge[]);
        setIsDirty(false);
        setNodeStatuses({});
      }
    } catch (error) {
      console.error('Failed to load flow:', error);
    }
  };

  // ===========================================================================
  // Execution Status Updates
  // ===========================================================================

  useEffect(() => {
    const unsubscribe = flowExecutionManager.subscribe((event: FlowExecutionEvent) => {
      switch (event.type) {
        case 'started':
          setIsExecuting(true);
          setNodeStatuses({});
          break;
        case 'node-update':
          setNodeStatuses(prev => ({
            ...prev,
            [event.nodeId]: event.status,
          }));
          // Update node data with status
          setNodes(nds => nds.map(node => {
            if (node.id === event.nodeId) {
              return {
                ...node,
                data: { ...node.data, status: event.status },
              };
            }
            return node;
          }));
          break;
        case 'completed':
        case 'error':
          setIsExecuting(false);
          break;
      }
    });

    return () => unsubscribe();
  }, [setNodes]);

  // ===========================================================================
  // Node Selection
  // ===========================================================================

  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setShowConfig(true);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setShowConfig(false);
  }, []);

  // ===========================================================================
  // Edge Connection
  // ===========================================================================

  const onConnect = useCallback((params: Connection) => {
    const newEdge: Edge = {
      ...params,
      id: `edge_${params.source}_${params.target}`,
      animated: false,
      style: { stroke: '#6366f1', strokeWidth: 2 },
    } as Edge;
    setEdges(eds => addEdge(newEdge, eds));
    setIsDirty(true);
  }, [setEdges]);

  // ===========================================================================
  // Node Changes
  // ===========================================================================

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    setIsDirty(true);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    setIsDirty(true);
  }, [onEdgesChange]);

  // ===========================================================================
  // Drag and Drop
  // ===========================================================================

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const type = event.dataTransfer.getData('application/reactflow') as FlowNodeType;
    if (!type) return;

    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;

    const position = {
      x: event.clientX - bounds.left - 90, // Center the node
      y: event.clientY - bounds.top - 30,
    };

    // For learned-skill nodes, extract the skill data from the transfer
    let skillData: Partial<LearnedSkillNodeData> | undefined;
    if (type === 'learned-skill') {
      const skillDataJson = event.dataTransfer.getData('application/skill-data');
      if (skillDataJson) {
        try {
          skillData = JSON.parse(skillDataJson) as Partial<LearnedSkillNodeData>;
        } catch (e) {
          console.error('Failed to parse skill data:', e);
        }
      }
    }

    const newNode: Node = {
      id: generateNodeId(),
      type,
      position,
      data: getDefaultNodeData(type, skillData),
    };

    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
    setSelectedNodeId(newNode.id);
    setShowConfig(true);
  }, [setNodes]);

  // ===========================================================================
  // Flow Actions
  // ===========================================================================

  const handleSave = async () => {
    // If no flowId, show the save dialog to let user name and select folder
    if (!flowId) {
      setShowSaveDialog(true);
      return;
    }

    // Otherwise just save with existing metadata
    const flowData: Partial<Flow> & { id?: string | undefined } = {
      name: flowName,
      nodes: nodes as FlowNode[],
      edges: edges as FlowEdge[],
      id: flowId,
    };
    if (flowFolder) {
      flowData.folder = flowFolder;
    }

    try {
      const savedFlow = await FlowService.updateFlow(flowId, flowData);
      setFlowId(savedFlow.id);
      setFlowFolder(savedFlow.folder || '');
      setIsDirty(false);
      onFlowChange?.(savedFlow);
    } catch (error) {
      console.error('Failed to save flow:', error);
    }
  };

  const handleSaveAs = () => {
    setShowSaveDialog(true);
  };

  const handleSaveWithDetails = async (name: string, folder: string) => {
    const flowData: Partial<Flow> & { id?: string | undefined } = {
      name,
      nodes: nodes as FlowNode[],
      edges: edges as FlowEdge[],
    };
    if (folder) {
      flowData.folder = folder;
    }
    if (flowId) {
      flowData.id = flowId;
    }

    try {
      const savedFlow = flowId 
        ? await FlowService.updateFlow(flowId, flowData)
        : await FlowService.createFlow(flowData);
      
      setFlowId(savedFlow.id);
      setFlowName(savedFlow.name);
      setFlowFolder(savedFlow.folder || '');
      setIsDirty(false);
      onFlowChange?.(savedFlow);
    } catch (error) {
      console.error('Failed to save flow:', error);
    }
  };

  const handleExecute = async () => {
    // Save first if needed (new flow)
    if (!flowId) {
      setShowSaveDialog(true);
      return;
    }
    
    // Always save current state before executing
    if (isDirty) {
      const flowData: Partial<Flow> & { id?: string | undefined } = {
        name: flowName,
        nodes: nodes as FlowNode[],
        edges: edges as FlowEdge[],
        id: flowId,
      };
      if (flowFolder) {
        flowData.folder = flowFolder;
      }
      try {
        await FlowService.updateFlow(flowId, flowData);
        setIsDirty(false);
      } catch (error) {
        console.error('Failed to save flow before execution:', error);
        // Continue with execution anyway - the server has the last saved version
      }
    }
    
    // Open execution panel to show progress
    setShowExecution(true);
    setIsExecuting(true);
    
    // Reset node statuses before execution
    setNodeStatuses({});
    setNodes(nds => nds.map(node => ({
      ...node,
      data: { ...node.data, status: 'pending' },
    })));
    
    // Start execution tracking
    flowExecutionManager.startExecution(flowId);
    
    try {
      // Execute flow and get results
      const result = await FlowService.executeFlowSync(flowId, sessionId);
      
      // Process results and update node statuses
      if (result && result.results) {
        for (const [nodeId, nodeResult] of Object.entries(result.results)) {
          // Update via flowExecutionManager to trigger UI updates
          flowExecutionManager.handleNodeStatus({
            nodeId,
            status: nodeResult.status,
            result: nodeResult,
            timestamp: Date.now(),
          });
          
          // Also update local node state
          setNodeStatuses(prev => ({
            ...prev,
            [nodeId]: nodeResult.status,
          }));
          
          setNodes(nds => nds.map(node => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: { ...node.data, status: nodeResult.status },
              };
            }
            return node;
          }));
        }
        
        // Signal completion or error based on status
        if (result.status === 'failed') {
          flowExecutionManager.handleFlowError({
            flowId,
            message: result.error || 'Flow execution failed',
          });
        } else {
          flowExecutionManager.handleFlowComplete({
            flowId,
            executionId: result.executionId,
            status: result.status,
            duration: result.endTime ? result.endTime - result.startTime : 0,
            results: result.results,
          });
        }
      }
      
      setIsExecuting(false);
    } catch (error) {
      console.error('Flow execution failed:', error);
      flowExecutionManager.handleFlowError({
        flowId,
        message: error instanceof Error ? error.message : 'Execution failed',
      });
      setIsExecuting(false);
    }
  };

  const handleStop = () => {
    // Cancel via FlowService
    setIsExecuting(false);
    flowExecutionManager.reset();
  };

  const handleNew = () => {
    setFlowId(null);
    setFlowName('New Flow');
    setFlowFolder('');
    setNodes([]);
    setEdges([]);
    setIsDirty(false);
    setSelectedNodeId(null);
    setNodeStatuses({});
  };

  const handleDeleteSelected = () => {
    if (selectedNodeId) {
      setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
      setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
      setIsDirty(true);
    }
  };

  // ===========================================================================
  // Node Config Update
  // ===========================================================================

  const handleNodeConfigChange = useCallback((nodeId: string, data: FlowNodeData) => {
    setNodes(nds => nds.map(node => {
      if (node.id === nodeId) {
        return { ...node, data };
      }
      return node;
    }));
    setIsDirty(true);
  }, [setNodes]);

  // ===========================================================================
  // Import Logic
  // ===========================================================================

  const handleImportClick = () => {
    setShowImport(true);
  };

  const handleImportContent = async (text: string) => {
    try {
      const flow = JSON.parse(text) as Flow;

      // Basic validation
      if (!flow.nodes || !Array.isArray(flow.nodes)) {
        throw new Error('Invalid flow file format');
      }

      // Check for new skills
      const learnedSkillNodes = flow.nodes.filter(n => n.type === 'learned-skill') as FlowNode[];
      if (learnedSkillNodes.length > 0) {
        const existingSkills = await KnowledgeService.getLatestSkills();
        const existingSkillIds = new Set(existingSkills.map(s => s.id));
        
        const missingSkills: LearnedSkillNodeData[] = [];
        const seenIds = new Set<string>();

        for (const node of learnedSkillNodes) {
          const data = node.data as LearnedSkillNodeData;
          if (data.skillId && !existingSkillIds.has(data.skillId) && !seenIds.has(data.skillId)) {
            missingSkills.push(data);
            seenIds.add(data.skillId);
          }
        }

        if (missingSkills.length > 0) {
          setPendingImportFlow(flow);
          setNewSkillsToImport(missingSkills);
          return;
        }
      }

      // No new skills, load directly
      loadImportedFlow(flow);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import flow. Please check the file format.');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      handleImportContent(text);
    } catch (error) {
      console.error('File read failed:', error);
      alert('Failed to read file.');
    }
    
    // Clear input
    event.target.value = '';
  };

  const loadImportedFlow = (flow: Flow) => {
    setFlowId(null); // Treat as new flow
    setFlowName(flow.name || 'Imported Flow');
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setIsDirty(true);
    setPendingImportFlow(null);
    setNewSkillsToImport([]);
  };

  const handleImportSkillsConfirm = async (skillsToSave: LearnedSkillNodeData[]) => {
    if (!pendingImportFlow) return;

    // Save skills
    for (const skillData of skillsToSave) {
      await KnowledgeService.addSkill({
        use_when: skillData.description || `Imported skill: ${skillData.skillName}`,
        tool_sops: [{ tool_name: 'bash', action: skillData.command }],
        flowNode: {
          name: skillData.skillName,
          description: skillData.description || '',
          command: skillData.command,
          timeout: skillData.timeout || 60000,
          variables: skillData.variables || {}
        }
      });
    }

    loadImportedFlow(pendingImportFlow);
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <div className={styles.container} ref={reactFlowWrapper}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".json"
        onChange={handleFileChange}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          animated: false,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#313244" />
        <Controls className={styles.controls} />
        <MiniMap 
          className={styles.minimap}
          nodeColor={(node) => {
            const status = nodeStatuses[node.id];
            if (status === 'running') return '#3b82f6';
            if (status === 'success') return '#22c55e';
            if (status === 'failed') return '#ef4444';
            return '#6366f1';
          }}
        />

        {/* Top Toolbar */}
        <Panel position="top-left" className={styles.toolbar}>
          <div className={styles.flowName}>
            {flowFolder && (
              <span className={styles.folderBadge} title={`Project: ${flowFolder}`}>
                {flowFolder}
              </span>
            )}
            <input
              type="text"
              value={flowName}
              onChange={(e) => { setFlowName(e.target.value); setIsDirty(true); }}
              className={styles.flowNameInput}
              placeholder="Flow name..."
            />
            {isDirty && <span className={styles.dirtyIndicator}>*</span>}
          </div>
          
          <div className={styles.toolbarDivider} />
          
          <button onClick={handleNew} className={styles.toolbarBtn} title="New Flow">
            <Plus size={16} />
          </button>
          <button onClick={() => setShowBrowser(true)} className={styles.toolbarBtn} title="Open Flow">
            <FolderOpen size={16} />
          </button>
          <button onClick={handleSave} className={styles.toolbarBtn} title="Save Flow">
            <Save size={16} />
          </button>
          <button onClick={handleSaveAs} className={styles.toolbarBtn} title="Save As...">
            <Folder size={16} />
          </button>
          <button onClick={() => setShowPalette(!showPalette)} className={`${styles.toolbarBtn} ${showPalette ? styles.activeBtn : ''}`} title="Toggle Node Palette">
            <Plus size={16} />
          </button>
          
          <div className={styles.toolbarDivider} />
          
          {!isExecuting ? (
            <button onClick={handleExecute} className={`${styles.toolbarBtn} ${styles.runBtn}`} title="Run Flow">
              <Play size={16} />
            </button>
          ) : (
            <button onClick={handleStop} className={`${styles.toolbarBtn} ${styles.stopBtn}`} title="Stop">
              <Square size={16} />
            </button>
          )}
          
          <div className={styles.toolbarDivider} />
          
          <button 
            onClick={handleDeleteSelected} 
            className={styles.toolbarBtn} 
            disabled={!selectedNodeId}
            title="Delete Selected"
          >
            <Trash2 size={16} />
          </button>
          <button 
            onClick={() => setNodeStatuses({})} 
            className={styles.toolbarBtn} 
            title="Reset Status"
          >
            <RotateCcw size={16} />
          </button>
          
          <div className={styles.toolbarDivider} />
          
          <button 
            onClick={() => setShowExecution(!showExecution)} 
            className={`${styles.toolbarBtn} ${showExecution ? styles.activeBtn : ''}`}
            title="Toggle Execution Log"
          >
            <Terminal size={16} />
          </button>
          <button 
            onClick={() => setShowHelp(true)} 
            className={styles.toolbarBtn}
            title="Help"
          >
            <HelpCircle size={16} />
          </button>
        </Panel>

        {/* Node Palette */}
        {showPalette && (
          <Panel position="top-right" className={styles.palettePanel}>
            <NodePalette onImportFlow={handleImportClick} />
          </Panel>
        )}
      </ReactFlow>

      {/* Node Config Panel */}
      {showConfig && selectedNode && (
        <NodeConfigPanel
          node={selectedNode as unknown as FlowNode}
          nodes={nodes as unknown as FlowNode[]}
          onClose={() => setShowConfig(false)}
          onChange={(data: FlowNodeData) => handleNodeConfigChange(selectedNode.id, data)}
        />
      )}

      {/* Execution Panel */}
      <ExecutionPanel
        isOpen={showExecution}
        onClose={() => setShowExecution(false)}
        nodeLabels={Object.fromEntries(
          nodes.map(n => [n.id, (n.data as FlowNodeData).label || n.id])
        )}
        nodeTypes={Object.fromEntries(
          nodes.map(n => [n.id, n.type || 'command'])
        )}
      />

      {/* Help Modal */}
      <FlowHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Import Modal */}
      {showImport && (
        <FlowImportModal
          onImport={handleImportContent}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Import Skills Dialog */}
      {newSkillsToImport.length > 0 && (
        <ImportSkillsDialog
          skills={newSkillsToImport}
          onConfirm={handleImportSkillsConfirm}
          onCancel={() => {
            setNewSkillsToImport([]);
            setPendingImportFlow(null);
          }}
        />
      )}

      {/* Flow Browser */}
      <FlowBrowser
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onLoadFlow={loadFlow}
        currentFlowId={flowId}
      />

      {/* Save Flow Dialog */}
      <SaveFlowDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSaveWithDetails}
        currentName={flowName}
        currentFolder={flowFolder}
      />
    </div>
  );
};
