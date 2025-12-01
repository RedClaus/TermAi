import type { CommandResult } from '../types';





export const executeCommand = async (command: string, cwd: string, commandId?: string): Promise<CommandResult & { newCwd?: string }> => {
    try {
        const response = await fetch('http://localhost:3001/api/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ command, cwd, commandId }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Command execution failed:', error);
        return {
            output: `Error connecting to local terminal: ${(error as Error).message}. Make sure the backend server is running on port 3001.`,
            exitCode: 1
        };
    }
};

export const cancelCommand = async (commandId: string): Promise<void> => {
    try {
        await fetch('http://localhost:3001/api/cancel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ commandId }),
        });
    } catch (error) {
        console.error('Failed to cancel command:', error);
    }
};
