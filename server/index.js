const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3001;

app.use(cors());
app.use(express.json());

// Helper to expand ~ to home directory
const expandHome = (p) => {
    if (p.startsWith('~')) {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
};

const activeProcesses = {};

// --- REST API (Legacy/Simple Commands) ---

app.post('/api/cancel', (req, res) => {
    const { commandId } = req.body;
    if (activeProcesses[commandId]) {
        try {
            process.kill(activeProcesses[commandId].pid);
            delete activeProcesses[commandId];
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.status(404).json({ error: 'Process not found' });
    }
});

app.post('/api/execute', (req, res) => {
    const { command, cwd, commandId } = req.body;

    // Default to home dir if no cwd provided
    let currentDir = cwd ? expandHome(cwd) : os.homedir();

    // Handle "cd" command specifically
    if (command.trim().startsWith('cd ')) {
        const target = command.trim().substring(3).trim();
        let newDir = target;

        if (target === '~') {
            newDir = os.homedir();
        } else if (target === '..') {
            newDir = path.resolve(currentDir, '..');
        } else {
            newDir = path.resolve(currentDir, target);
        }

        // Verify directory exists
        if (fs.existsSync(newDir) && fs.lstatSync(newDir).isDirectory()) {
            return res.json({
                output: '',
                exitCode: 0,
                newCwd: newDir
            });
        } else {
            return res.json({
                output: `cd: no such file or directory: ${target}`,
                exitCode: 1
            });
        }
    }

    // Execute other commands
    const child = exec(command, { cwd: currentDir }, (error, stdout, stderr) => {
        if (commandId) delete activeProcesses[commandId];

        if (error) {
            return res.json({
                output: stderr || error.message,
                exitCode: error.code || 1
            });
        }

        return res.json({
            output: stdout,
            exitCode: 0
        });
    });

    if (commandId) {
        activeProcesses[commandId] = child;
    }
});

// --- Ollama Proxy ---

app.get('/api/proxy/ollama/tags', async (req, res) => {
    const { endpoint } = req.query;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });

    try {
        const response = await fetch(`${endpoint}/api/tags`);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/proxy/ollama/chat', async (req, res) => {
    const { endpoint, ...body } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });

    try {
        const response = await fetch(`${endpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // Stream the response
        response.body.pipe(res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- WebSocket / PTY (Interactive Sessions) ---

io.on('connection', (socket) => {
    let ptyProcess = null;

    socket.on('spawn', ({ command, cwd, cols, rows }) => {
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        const currentDir = cwd ? expandHome(cwd) : os.homedir();

        try {
            ptyProcess = pty.spawn(shell, ['-c', command], {
                name: 'xterm-color',
                cols: cols || 80,
                rows: rows || 24,
                cwd: currentDir,
                env: process.env
            });

            ptyProcess.onData((data) => {
                socket.emit('output', data);
            });

            ptyProcess.onExit(({ exitCode }) => {
                socket.emit('exit', { exitCode });
                ptyProcess = null;
            });

        } catch (error) {
            socket.emit('output', `\r\nError spawning PTY: ${error.message}\r\n`);
            socket.emit('exit', { exitCode: 1 });
        }
    });

    socket.on('input', (data) => {
        if (ptyProcess) {
            ptyProcess.write(data);
        }
    });

    socket.on('resize', ({ cols, rows }) => {
        if (ptyProcess) {
            ptyProcess.resize(cols, rows);
        }
    });

    socket.on('disconnect', () => {
        if (ptyProcess) {
            ptyProcess.kill();
        }
    });
});

server.listen(PORT, () => {
    console.log(`TermAI Backend running on http://localhost:${PORT}`);
});
