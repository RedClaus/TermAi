/**
 * File System Service
 * Client-side interface for server file system operations
 */

import { config } from "../config";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

export class FileSystemService {
  /**
   * Read file contents
   */
  static async readFile(path: string): Promise<string> {
    const response = await fetch(config.getApiUrl(config.api.fs.read), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to read file");
    }

    const data = await response.json();
    return data.content;
  }

  /**
   * Write content to a file
   */
  static async writeFile(path: string, content: string): Promise<void> {
    const response = await fetch(config.getApiUrl(config.api.fs.write), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to write file");
    }
  }

  /**
   * List files in a directory
   */
  static async listFiles(path: string = "."): Promise<FileEntry[]> {
    const response = await fetch(config.getApiUrl(config.api.fs.list), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to list files");
    }

    const data = await response.json();
    return data.files;
  }

  /**
   * Create a directory
   */
  static async createDirectory(path: string): Promise<void> {
    const response = await fetch(config.getApiUrl(config.api.fs.mkdir), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create directory");
    }
  }
}
