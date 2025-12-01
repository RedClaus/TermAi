export interface BlockData {
    id: string;
    command: string;
    output: string;
    timestamp: number;
    cwd: string;
    exitCode: number;
    isLoading?: boolean;
}

export interface CommandResult {
    output: string;
    exitCode: number;
}
