const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
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

app.listen(PORT, () => {
    console.log(`TermAI Backend running on http://localhost:${PORT}`);
});
