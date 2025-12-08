import React, { useState, useRef } from 'react';
import { useSystem } from '@termai/ui-core';

const App: React.FC = () => {
  const { isElectron, platform, pty } = useSystem();
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  const handleSpawnPTY = async () => {
    setIsRunning(true);
    setTerminalOutput((prev) => [...prev, 'Spawning PTY...']);

    try {
      const result = await pty.spawn({
        shell: '/bin/bash',
        args: ['-c', 'echo "Hello from PTY!"'],
        cwd: '~',
        cols: 80,
        rows: 24,
      });

      sessionIdRef.current = result.id;

      setTerminalOutput((prev) => [
        ...prev,
        `Session ID: ${result.id}`,
        `PID: ${result.pid}`,
        'PTY spawned successfully!',
      ]);

      // Listen for data
      const unsubscribeData = pty.onData(result.id, (data: string) => {
        setTerminalOutput((prev) => [...prev, data]);
      });

      // Listen for exit
      const unsubscribeExit = pty.onExit(result.id, (exitCode: number) => {
        setTerminalOutput((prev) => [...prev, `Process exited with code: ${exitCode}`]);
        setIsRunning(false);
        unsubscribeData();
        unsubscribeExit();
      });
    } catch (error) {
      setTerminalOutput((prev) => [
        ...prev,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      ]);
      setIsRunning(false);
    }
  };

  const handleClearOutput = () => {
    setTerminalOutput([]);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>TermAI Electron App</h1>
        <div style={styles.statusBar}>
          <span style={styles.badge}>
            {isElectron ? 'Electron' : 'Web'}
          </span>
          <span style={styles.badge}>
            Platform: {platform}
          </span>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>PTY Test</h2>
          <div style={styles.buttonGroup}>
            <button
              onClick={handleSpawnPTY}
              disabled={isRunning}
              style={{
                ...styles.button,
                ...(isRunning ? styles.buttonDisabled : {}),
              }}
            >
              {isRunning ? 'Running...' : 'Test PTY Spawn'}
            </button>
            <button
              onClick={handleClearOutput}
              disabled={terminalOutput.length === 0}
              style={{
                ...styles.button,
                ...styles.buttonSecondary,
                ...(terminalOutput.length === 0 ? styles.buttonDisabled : {}),
              }}
            >
              Clear Output
            </button>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Terminal Output</h2>
          <div style={styles.terminal}>
            {terminalOutput.length === 0 ? (
              <div style={styles.terminalEmpty}>
                No output yet. Click "Test PTY Spawn" to start.
              </div>
            ) : (
              terminalOutput.map((line, index) => (
                <div key={index} style={styles.terminalLine}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <footer style={styles.footer}>
        <p style={styles.footerText}>
          This is a placeholder UI. Full TermAI interface will be integrated later.
        </p>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  header: {
    padding: '20px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #3e3e42',
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '24px',
    fontWeight: 600,
    color: '#ffffff',
  },
  statusBar: {
    display: 'flex',
    gap: '10px',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: '#0e639c',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
  },
  main: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
  },
  section: {
    marginBottom: '30px',
  },
  sectionTitle: {
    margin: '0 0 15px 0',
    fontSize: '18px',
    fontWeight: 500,
    color: '#cccccc',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonSecondary: {
    backgroundColor: '#3e3e42',
  },
  buttonDisabled: {
    backgroundColor: '#2d2d30',
    color: '#6c6c6c',
    cursor: 'not-allowed',
  },
  terminal: {
    backgroundColor: '#1e1e1e',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    padding: '15px',
    minHeight: '200px',
    maxHeight: '400px',
    overflowY: 'auto',
    fontFamily: '"Cascadia Code", "Courier New", monospace',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  terminalEmpty: {
    color: '#6c6c6c',
    fontStyle: 'italic',
  },
  terminalLine: {
    marginBottom: '4px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  footer: {
    padding: '15px 20px',
    backgroundColor: '#252526',
    borderTop: '1px solid #3e3e42',
    textAlign: 'center',
  },
  footerText: {
    margin: 0,
    fontSize: '12px',
    color: '#858585',
  },
};

export default App;
