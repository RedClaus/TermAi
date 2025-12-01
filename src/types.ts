export interface BlockData {
    id: string;
    command: string;
    output: string;
    cwd: string;
    timestamp: number;
    exitCode: number;
    isLoading: boolean;
    isInteractive?: boolean;
}

export interface CommandResult {
    output: string;
    exitCode: number;
}
