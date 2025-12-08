/**
 * FlowHelpModal - User manual for TermFlow automation engine
 */

import { useState } from 'react';
import { 
  X, 
  Terminal, 
  Brain, 
  GitBranch, 
  FileText, 
  Play, 
  Link2,
  ChevronRight,
  Workflow,
  Zap,
  AlertTriangle,
  Lightbulb,
  BookOpen,
} from 'lucide-react';
import styles from './FlowHelpModal.module.css';

interface FlowHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type HelpSection = 'overview' | 'nodes' | 'connections' | 'variables' | 'execution' | 'examples' | 'tips';

const sections: { id: HelpSection; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BookOpen size={16} /> },
  { id: 'nodes', label: 'Node Types', icon: <Workflow size={16} /> },
  { id: 'connections', label: 'Connections', icon: <Link2 size={16} /> },
  { id: 'variables', label: 'Variables', icon: <Zap size={16} /> },
  { id: 'execution', label: 'Execution', icon: <Play size={16} /> },
  { id: 'examples', label: 'Examples', icon: <Lightbulb size={16} /> },
  { id: 'tips', label: 'Tips & Tricks', icon: <AlertTriangle size={16} /> },
];

export const FlowHelpModal: React.FC<FlowHelpModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<HelpSection>('overview');

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className={styles.section}>
            <h2>Welcome to TermFlow</h2>
            <p>
              TermFlow is a visual automation engine that lets you create workflows by connecting 
              nodes together. Each node performs a specific action, and data flows from one node 
              to the next.
            </p>
            
            <h3>Key Concepts</h3>
            <ul>
              <li><strong>Nodes</strong> - Individual steps in your workflow (commands, AI analysis, conditions, file operations)</li>
              <li><strong>Edges</strong> - Connections between nodes that define the flow of data</li>
              <li><strong>Variables</strong> - Reference output from previous nodes using <code>{`{{nodeId.property}}`}</code> syntax</li>
              <li><strong>Execution</strong> - Flows run from entry nodes (no incoming connections) and follow the edges</li>
            </ul>

            <h3>Quick Start</h3>
            <ol>
              <li>Drag a node from the palette on the right onto the canvas</li>
              <li>Click the node to configure it in the side panel</li>
              <li>Connect nodes by dragging from one handle to another</li>
              <li>Click the <Play size={14} style={{verticalAlign: 'middle'}} /> button to run your flow</li>
            </ol>

            <div className={styles.infoBox}>
              <Lightbulb size={18} />
              <span>Flows are automatically saved to your session and persist across browser refreshes.</span>
            </div>
          </div>
        );

      case 'nodes':
        return (
          <div className={styles.section}>
            <h2>Node Types</h2>
            <p>TermFlow provides four types of nodes, each designed for specific tasks:</p>

            <div className={styles.nodeCard}>
              <div className={styles.nodeHeader}>
                <Terminal size={20} className={styles.commandIcon} />
                <h3>Command Node</h3>
              </div>
              <p>Executes shell commands in your terminal environment.</p>
              <h4>Configuration:</h4>
              <ul>
                <li><strong>Command</strong> - The shell command to execute</li>
                <li><strong>Working Directory</strong> - Optional directory to run the command in</li>
                <li><strong>Timeout</strong> - Maximum time to wait (in milliseconds)</li>
                <li><strong>Continue on Error</strong> - Whether to proceed if the command fails</li>
              </ul>
              <h4>Outputs:</h4>
              <ul>
                <li><code>stdout</code> - Standard output from the command</li>
                <li><code>stderr</code> - Error output from the command</li>
                <li><code>exitCode</code> - Exit code (0 = success)</li>
              </ul>
            </div>

            <div className={styles.nodeCard}>
              <div className={styles.nodeHeader}>
                <Brain size={20} className={styles.aiIcon} />
                <h3>AI Reasoning Node</h3>
              </div>
              <p>Sends a prompt to an LLM for analysis or decision-making.</p>
              <h4>Configuration:</h4>
              <ul>
                <li><strong>Prompt</strong> - The text prompt to send to the AI</li>
                <li><strong>System Prompt</strong> - Optional system-level instructions</li>
                <li><strong>Provider</strong> - Which AI provider to use (defaults to your selected provider)</li>
                <li><strong>Model</strong> - Specific model to use</li>
              </ul>
              <h4>Outputs:</h4>
              <ul>
                <li><code>response</code> - The AI's response text</li>
                <li><code>provider</code> - Which provider was used</li>
                <li><code>model</code> - Which model was used</li>
              </ul>
            </div>

            <div className={styles.nodeCard}>
              <div className={styles.nodeHeader}>
                <GitBranch size={20} className={styles.conditionIcon} />
                <h3>Condition Node</h3>
              </div>
              <p>Evaluates a condition and branches the flow based on true/false.</p>
              <h4>Configuration:</h4>
              <ul>
                <li><strong>Condition</strong> - Expression to evaluate (e.g., <code>{`{{prev.exitCode}} === 0`}</code>)</li>
              </ul>
              <h4>Supported Operators:</h4>
              <ul>
                <li>Comparison: <code>===</code>, <code>!==</code>, <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code></li>
                <li>String methods: <code>.includes()</code>, <code>.startsWith()</code>, <code>.endsWith()</code></li>
              </ul>
              <h4>Outputs:</h4>
              <ul>
                <li>Two output handles: <span className={styles.trueLabel}>TRUE</span> and <span className={styles.falseLabel}>FALSE</span></li>
                <li><code>conditionResult</code> - Boolean result of the evaluation</li>
              </ul>
            </div>

            <div className={styles.nodeCard}>
              <div className={styles.nodeHeader}>
                <FileText size={20} className={styles.fileIcon} />
                <h3>File Operation Node</h3>
              </div>
              <p>Performs file system operations like reading, writing, or checking files.</p>
              <h4>Operations:</h4>
              <ul>
                <li><strong>Read</strong> - Read file contents</li>
                <li><strong>Write</strong> - Write content to a file (creates or overwrites)</li>
                <li><strong>Append</strong> - Add content to the end of a file</li>
                <li><strong>Exists</strong> - Check if a file exists</li>
                <li><strong>Delete</strong> - Remove a file</li>
              </ul>
              <h4>Outputs:</h4>
              <ul>
                <li><code>content</code> - File contents (for read operations)</li>
                <li><code>exists</code> - Boolean (for exists check)</li>
                <li><code>bytesWritten</code> - Number of bytes written</li>
              </ul>
            </div>
          </div>
        );

      case 'connections':
        return (
          <div className={styles.section}>
            <h2>Creating Connections</h2>
            <p>Connections (edges) define how data flows between nodes.</p>

            <h3>How to Connect Nodes</h3>
            <ol>
              <li>Hover over a node to see its <strong>handles</strong> (small circles on the edges)</li>
              <li>Click and drag from an <strong>output handle</strong> (bottom or right side)</li>
              <li>Drop onto an <strong>input handle</strong> (top or left side) of another node</li>
            </ol>

            <h3>Handle Types</h3>
            <div className={styles.handleGuide}>
              <div className={styles.handleItem}>
                <div className={`${styles.handle} ${styles.inputHandle}`} />
                <span><strong>Input Handle</strong> - Receives data from a previous node</span>
              </div>
              <div className={styles.handleItem}>
                <div className={`${styles.handle} ${styles.outputHandle}`} />
                <span><strong>Output Handle</strong> - Sends data to the next node</span>
              </div>
            </div>

            <h3>Condition Node Handles</h3>
            <p>Condition nodes have two output handles:</p>
            <ul>
              <li><span className={styles.trueLabel}>TRUE</span> - Connected nodes execute when condition is true</li>
              <li><span className={styles.falseLabel}>FALSE</span> - Connected nodes execute when condition is false</li>
            </ul>

            <h3>Deleting Connections</h3>
            <ul>
              <li>Click on an edge to select it</li>
              <li>Press <kbd>Delete</kbd> or <kbd>Backspace</kbd> to remove it</li>
            </ul>

            <div className={styles.warningBox}>
              <AlertTriangle size={18} />
              <span>Avoid creating circular connections - they will cause infinite loops!</span>
            </div>
          </div>
        );

      case 'variables':
        return (
          <div className={styles.section}>
            <h2>Variable Interpolation</h2>
            <p>
              Variables let you reference output from previous nodes. Use the 
              <code>{`{{nodeId.property}}`}</code> syntax anywhere in your node configuration.
            </p>

            <h3>Syntax</h3>
            <pre className={styles.codeBlock}>
{`{{nodeId.property}}

Examples:
{{node_123.stdout}}      - Output from a command node
{{node_456.response}}    - AI response text
{{node_789.exitCode}}    - Exit code (number)
{{node_abc.content}}     - File contents`}
            </pre>

            <h3>Available Properties by Node Type</h3>
            <table className={styles.propsTable}>
              <thead>
                <tr>
                  <th>Node Type</th>
                  <th>Properties</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Command</td>
                  <td><code>stdout</code>, <code>stderr</code>, <code>exitCode</code></td>
                </tr>
                <tr>
                  <td>AI Reasoning</td>
                  <td><code>response</code>, <code>provider</code>, <code>model</code></td>
                </tr>
                <tr>
                  <td>Condition</td>
                  <td><code>conditionResult</code>, <code>evaluatedCondition</code></td>
                </tr>
                <tr>
                  <td>File Op</td>
                  <td><code>content</code>, <code>exists</code>, <code>bytesWritten</code>, <code>filePath</code></td>
                </tr>
              </tbody>
            </table>

            <h3>Example Usage</h3>
            <pre className={styles.codeBlock}>
{`# In a Command node, use output from a previous command:
echo "Previous output was: {{cmd1.stdout}}"

# In an AI node prompt:
Analyze this log output and identify errors:
{{readLogs.content}}

# In a Condition:
{{buildCmd.exitCode}} === 0

# In a File Write node (content field):
Build completed at: {{Date.now()}}
Result: {{buildCmd.stdout}}`}
            </pre>

            <div className={styles.infoBox}>
              <Lightbulb size={18} />
              <span>
                The node configuration panel shows available variables from other nodes 
                at the bottom when editing.
              </span>
            </div>
          </div>
        );

      case 'execution':
        return (
          <div className={styles.section}>
            <h2>Executing Flows</h2>
            
            <h3>Running a Flow</h3>
            <ol>
              <li>Click the <Play size={14} style={{verticalAlign: 'middle'}} /> <strong>Run</strong> button in the toolbar</li>
              <li>If the flow hasn't been saved, it will be saved automatically</li>
              <li>Execution starts from <strong>entry nodes</strong> (nodes with no incoming connections)</li>
              <li>Watch node status indicators change as execution progresses</li>
            </ol>

            <h3>Node Status Indicators</h3>
            <div className={styles.statusList}>
              <div className={styles.statusItem}>
                <div className={`${styles.statusDot} ${styles.pending}`} />
                <span><strong>Pending</strong> - Not yet executed</span>
              </div>
              <div className={styles.statusItem}>
                <div className={`${styles.statusDot} ${styles.running}`} />
                <span><strong>Running</strong> - Currently executing</span>
              </div>
              <div className={styles.statusItem}>
                <div className={`${styles.statusDot} ${styles.success}`} />
                <span><strong>Success</strong> - Completed successfully</span>
              </div>
              <div className={styles.statusItem}>
                <div className={`${styles.statusDot} ${styles.failed}`} />
                <span><strong>Failed</strong> - Error occurred</span>
              </div>
              <div className={styles.statusItem}>
                <div className={`${styles.statusDot} ${styles.skipped}`} />
                <span><strong>Skipped</strong> - Not executed (e.g., false branch)</span>
              </div>
            </div>

            <h3>Execution Log</h3>
            <p>
              Click the <Terminal size={14} style={{verticalAlign: 'middle'}} /> button in the toolbar to open the 
              execution log panel. This shows:
            </p>
            <ul>
              <li>Real-time stdout/stderr from command nodes</li>
              <li>AI responses</li>
              <li>Condition evaluation results</li>
              <li>File operation results</li>
              <li>Timing information</li>
            </ul>

            <h3>Stopping Execution</h3>
            <p>
              Click the <strong>Stop</strong> button to cancel a running flow. 
              Note that commands already in progress may complete before stopping.
            </p>

            <div className={styles.warningBox}>
              <AlertTriangle size={18} />
              <span>
                Be careful with flows that modify files or run destructive commands. 
                Always test with non-critical data first.
              </span>
            </div>
          </div>
        );

      case 'examples':
        return (
          <div className={styles.section}>
            <h2>Example Workflows</h2>

            <div className={styles.exampleCard}>
              <h3>1. Build and Test Pipeline</h3>
              <p>Run a build, then test only if the build succeeds.</p>
              <div className={styles.flowDiagram}>
                <span className={styles.flowNode}>npm run build</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>exitCode === 0?</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>npm test</span>
              </div>
              <pre className={styles.codeBlock}>
{`Node 1 (Command): npm run build
Node 2 (Condition): {{node1.exitCode}} === 0
Node 3 (Command): npm test  [connected to TRUE output]`}
              </pre>
            </div>

            <div className={styles.exampleCard}>
              <h3>2. Log Analysis with AI</h3>
              <p>Read logs, analyze with AI, and save the report.</p>
              <div className={styles.flowDiagram}>
                <span className={styles.flowNode}>Read logs.txt</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>AI: Analyze errors</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>Write report.md</span>
              </div>
              <pre className={styles.codeBlock}>
{`Node 1 (File Op): Read ./logs/app.log
Node 2 (AI): "Analyze these logs and list any errors:
{{node1.content}}"
Node 3 (File Op): Write ./reports/analysis.md
  Content: {{node2.response}}`}
              </pre>
            </div>

            <div className={styles.exampleCard}>
              <h3>3. Git Commit Workflow</h3>
              <p>Check for changes, generate commit message with AI, then commit.</p>
              <div className={styles.flowDiagram}>
                <span className={styles.flowNode}>git status</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>Has changes?</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>AI: Generate msg</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>git commit</span>
              </div>
              <pre className={styles.codeBlock}>
{`Node 1 (Command): git status --porcelain
Node 2 (Condition): {{node1.stdout}}.length > 0
Node 3 (AI): "Generate a concise git commit message for:
{{node1.stdout}}"
Node 4 (Command): git commit -m "{{node3.response}}"`}
              </pre>
            </div>

            <div className={styles.exampleCard}>
              <h3>4. Deployment Check</h3>
              <p>Check if deployment succeeded by verifying a health endpoint.</p>
              <div className={styles.flowDiagram}>
                <span className={styles.flowNode}>Deploy</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>curl health</span>
                <ChevronRight size={16} />
                <span className={styles.flowNode}>Status OK?</span>
              </div>
              <pre className={styles.codeBlock}>
{`Node 1 (Command): ./deploy.sh
Node 2 (Command): curl -s https://myapp.com/health
Node 3 (Condition): {{node2.stdout}}.includes("ok")`}
              </pre>
            </div>
          </div>
        );

      case 'tips':
        return (
          <div className={styles.section}>
            <h2>Tips & Best Practices</h2>

            <h3>Workflow Design</h3>
            <ul>
              <li><strong>Keep flows focused</strong> - One flow should do one thing well</li>
              <li><strong>Use meaningful labels</strong> - Name your nodes descriptively</li>
              <li><strong>Test incrementally</strong> - Build and test one node at a time</li>
              <li><strong>Use conditions wisely</strong> - Always handle both true and false branches</li>
            </ul>

            <h3>Performance</h3>
            <ul>
              <li><strong>Set timeouts</strong> - Prevent runaway commands with appropriate timeouts</li>
              <li><strong>Parallel entry nodes</strong> - Multiple entry nodes run in parallel</li>
              <li><strong>Minimize AI calls</strong> - AI nodes are slower; batch requests when possible</li>
            </ul>

            <h3>Debugging</h3>
            <ul>
              <li><strong>Check the execution log</strong> - View stdout/stderr for each node</li>
              <li><strong>Use echo commands</strong> - Add debug output to verify variable values</li>
              <li><strong>Reset and retry</strong> - Use the reset button to clear node statuses</li>
            </ul>

            <h3>Keyboard Shortcuts</h3>
            <table className={styles.shortcutsTable}>
              <tbody>
                <tr>
                  <td><kbd>Delete</kbd></td>
                  <td>Delete selected node or edge</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>S</kbd></td>
                  <td>Save flow</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td>
                  <td>Undo (coming soon)</td>
                </tr>
                <tr>
                  <td><kbd>Space</kbd> + Drag</td>
                  <td>Pan the canvas</td>
                </tr>
                <tr>
                  <td>Scroll</td>
                  <td>Zoom in/out</td>
                </tr>
              </tbody>
            </table>

            <h3>Common Pitfalls</h3>
            <div className={styles.warningBox}>
              <AlertTriangle size={18} />
              <div>
                <p><strong>Circular dependencies</strong> - Don't connect nodes in a loop</p>
                <p><strong>Missing error handling</strong> - Use "Continue on Error" or condition nodes</p>
                <p><strong>Unquoted variables</strong> - In shell commands, quote variables: <code>"{'{{node.stdout}}'}"</code></p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <BookOpen size={20} />
            <span>TermFlow User Guide</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <nav className={styles.sidebar}>
            {sections.map((section) => (
              <button
                key={section.id}
                className={`${styles.navItem} ${activeSection === section.id ? styles.active : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};
