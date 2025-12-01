const API_BASE = 'http://localhost:3001/api/fs';

export class FileSystemService {
    static async readFile(path: string): Promise<string> {
        const response = await fetch(`${API_BASE}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to read file');
        }
        const data = await response.json();
        return data.content;
    }

    static async writeFile(path: string, content: string): Promise<void> {
        const response = await fetch(`${API_BASE}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to write file');
        }
    }

    static async listFiles(path: string = '.'): Promise<{ name: string; isDirectory: boolean; path: string }[]> {
        const response = await fetch(`${API_BASE}/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to list files');
        }
        const data = await response.json();
        return data.files;
    }

    static async createDirectory(path: string): Promise<void> {
        const response = await fetch(`${API_BASE}/mkdir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create directory');
        }
    }
}
