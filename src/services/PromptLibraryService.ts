/**
 * PromptLibraryService
 * 
 * Manages customizable prompts that users can override via a JSON config file.
 * Inspired by Butterfish's prompt library system.
 * 
 * Default prompts are defined here, but users can override them by creating
 * a prompts.json file at ~/.config/termai/prompts.json
 * 
 * Usage:
 *   const prompt = await PromptLibraryService.getPrompt('error_analysis', { error: 'some error' });
 */

import { config } from "../config";

// =============================================
// Prompt Template Types
// =============================================

export interface PromptTemplate {
  /** Unique identifier for the prompt */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of when this prompt is used */
  description: string;
  /** The actual prompt template with {{variable}} placeholders */
  template: string;
  /** Default values for variables (optional) */
  defaults?: Record<string, string>;
}

export interface PromptLibrary {
  version: string;
  prompts: PromptTemplate[];
}

// =============================================
// Default Prompts
// =============================================

const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: "error_analysis",
    name: "Command Error Analysis",
    description: "Analyzes a failed command and suggests fixes",
    template: `Analyze this command failure and suggest a fix:

**Command:** \`{{command}}\`
**Exit Code:** {{exitCode}}
**Error Output:**
\`\`\`
{{output}}
\`\`\`
**Working Directory:** {{cwd}}
**OS:** {{os}}

Please:
1. Identify the root cause of the error
2. Suggest a specific fix (provide the corrected command)
3. Explain why the fix should work
4. If multiple solutions exist, list them in order of preference

Keep your response concise and actionable.`,
    defaults: {
      os: "Linux",
      cwd: "~",
    },
  },
  {
    id: "command_suggestion",
    name: "Command Suggestion",
    description: "Suggests a command based on user intent",
    template: `The user wants to: {{intent}}

Current directory: {{cwd}}
OS: {{os}}
Shell: {{shell}}

Suggest the most appropriate command. Output ONLY the command in a bash code block:
\`\`\`bash
<command here>
\`\`\`

If multiple commands are needed, chain them with && or provide them one at a time.`,
    defaults: {
      os: "Linux",
      shell: "bash",
    },
  },
  {
    id: "code_explanation",
    name: "Code Explanation",
    description: "Explains what a command or script does",
    template: `Explain what this command/script does:

\`\`\`{{language}}
{{code}}
\`\`\`

Provide a clear, concise explanation including:
1. What the command does
2. What each flag/argument means
3. Any potential risks or side effects
4. Example use cases`,
    defaults: {
      language: "bash",
    },
  },
  {
    id: "task_complete_summary",
    name: "Task Completion Summary",
    description: "Generates a summary when a task is completed",
    template: `Summarize the completed task:

**Original Request:** {{request}}
**Steps Executed:**
{{steps}}

Provide a brief summary including:
1. What was accomplished
2. Any important outputs or results
3. Suggested next steps (if any)`,
  },
  {
    id: "safety_warning",
    name: "Safety Warning",
    description: "Generates a warning for potentially dangerous commands",
    template: `Analyze this command for safety concerns:

**Command:** \`{{command}}\`
**Working Directory:** {{cwd}}

Identify:
1. What this command will do
2. Potential risks (data loss, system changes, security)
3. Is this reversible?
4. Safer alternatives if available`,
  },
  {
    id: "port_conflict_fix",
    name: "Port Conflict Resolution",
    description: "Helps resolve port already in use errors",
    template: `A process is using port {{port}} and blocking the application.

OS: {{os}}

Provide commands to:
1. Find the process using port {{port}}
2. Safely terminate it
3. Verify the port is now free

Use OS-appropriate commands.`,
    defaults: {
      os: "Linux",
    },
  },
  {
    id: "permission_fix",
    name: "Permission Error Fix",
    description: "Helps resolve permission denied errors",
    template: `Permission denied error occurred:

**Command:** \`{{command}}\`
**Error:** {{error}}
**Path:** {{path}}
**OS:** {{os}}

Suggest how to:
1. Check current permissions
2. Fix the permission issue (prefer least-privilege solutions)
3. Verify the fix worked`,
    defaults: {
      os: "Linux",
    },
  },
  {
    id: "not_found_fix",
    name: "Command/File Not Found Fix",
    description: "Helps resolve command or file not found errors",
    template: `Not found error occurred:

**Command:** \`{{command}}\`
**Error:** {{error}}
**OS:** {{os}}

Determine if this is:
1. A missing command (suggest installation via package manager)
2. A missing file/directory (suggest how to find or create it)
3. A PATH issue (suggest how to fix)

Provide specific, actionable steps.`,
    defaults: {
      os: "Linux",
    },
  },
  {
    id: "git_conflict_resolution",
    name: "Git Conflict Resolution",
    description: "Helps resolve git merge conflicts",
    template: `Git conflict detected:

**Files with conflicts:**
{{files}}

**Current branch:** {{branch}}
**Merging from:** {{source}}

Guide the user through:
1. Understanding the conflict
2. Viewing the conflicting sections
3. Resolving the conflict
4. Completing the merge`,
  },
  {
    id: "dependency_error_fix",
    name: "Dependency Error Fix",
    description: "Helps resolve package/dependency errors",
    template: `Dependency error occurred:

**Package Manager:** {{packageManager}}
**Error:**
\`\`\`
{{error}}
\`\`\`
**OS:** {{os}}

Suggest:
1. The root cause of the dependency issue
2. Steps to resolve it
3. How to verify the fix`,
    defaults: {
      packageManager: "npm",
      os: "Linux",
    },
  },
];

// =============================================
// Service Implementation
// =============================================

class PromptLibraryServiceImpl {
  private prompts: Map<string, PromptTemplate> = new Map();
  private userPromptsLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor() {
    // Initialize with default prompts
    this.loadDefaults();
  }

  /**
   * Load default prompts into the map
   */
  private loadDefaults(): void {
    for (const prompt of DEFAULT_PROMPTS) {
      this.prompts.set(prompt.id, prompt);
    }
  }

  /**
   * Load user-customized prompts from the server
   * User prompts override defaults with the same ID
   */
  async loadUserPrompts(): Promise<void> {
    if (this.userPromptsLoaded) return;
    
    // Prevent multiple simultaneous loads
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._loadUserPrompts();
    await this.loadPromise;
    this.loadPromise = null;
  }

  private async _loadUserPrompts(): Promise<void> {
    try {
      const response = await fetch(config.getApiUrl("/api/prompts"));
      
      if (!response.ok) {
        // No user prompts file - that's okay, use defaults
        if (response.status === 404) {
          console.log("[PromptLibrary] No user prompts file found, using defaults");
          this.userPromptsLoaded = true;
          return;
        }
        throw new Error(`Failed to load prompts: ${response.statusText}`);
      }

      const data: PromptLibrary = await response.json();
      
      // Merge user prompts with defaults (user prompts override)
      for (const prompt of data.prompts) {
        this.prompts.set(prompt.id, prompt);
      }

      console.log(`[PromptLibrary] Loaded ${data.prompts.length} user prompts`);
      this.userPromptsLoaded = true;
    } catch (error) {
      console.warn("[PromptLibrary] Failed to load user prompts:", error);
      this.userPromptsLoaded = true; // Mark as loaded to prevent retries
    }
  }

  /**
   * Get a prompt by ID and interpolate variables
   */
  async getPrompt(id: string, variables?: Record<string, string>): Promise<string> {
    await this.loadUserPrompts();

    const template = this.prompts.get(id);
    if (!template) {
      console.warn(`[PromptLibrary] Prompt not found: ${id}`);
      return "";
    }

    return this.interpolate(template.template, {
      ...template.defaults,
      ...variables,
    });
  }

  /**
   * Get the raw template without interpolation
   */
  async getTemplate(id: string): Promise<PromptTemplate | undefined> {
    await this.loadUserPrompts();
    return this.prompts.get(id);
  }

  /**
   * List all available prompts
   */
  async listPrompts(): Promise<PromptTemplate[]> {
    await this.loadUserPrompts();
    return Array.from(this.prompts.values());
  }

  /**
   * Interpolate variables into a template string
   * Variables are in the format {{variableName}}
   */
  private interpolate(template: string, variables?: Record<string, string>): string {
    if (!variables) return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  /**
   * Save a custom prompt to the server
   */
  async savePrompt(prompt: PromptTemplate): Promise<boolean> {
    try {
      const response = await fetch(config.getApiUrl("/api/prompts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save prompt: ${response.statusText}`);
      }

      // Update local cache
      this.prompts.set(prompt.id, prompt);
      return true;
    } catch (error) {
      console.error("[PromptLibrary] Failed to save prompt:", error);
      return false;
    }
  }

  /**
   * Reset prompts to defaults (clear user customizations)
   */
  async resetToDefaults(): Promise<boolean> {
    try {
      const response = await fetch(config.getApiUrl("/api/prompts/reset"), {
        method: "PUT",
      });

      if (!response.ok) {
        throw new Error(`Failed to reset prompts: ${response.statusText}`);
      }

      // Reload prompts from server
      this.prompts.clear();
      this.loadDefaults();
      this.userPromptsLoaded = false;
      await this.loadUserPrompts();
      return true;
    } catch (error) {
      console.error("[PromptLibrary] Failed to reset prompts:", error);
      return false;
    }
  }

  /**
   * Export current prompts as JSON
   */
  async exportPrompts(): Promise<PromptLibrary> {
    await this.loadUserPrompts();
    return {
      version: "1.0.0",
      prompts: Array.from(this.prompts.values()),
    };
  }

  /**
   * Import prompts from a library
   */
  async importPrompts(library: PromptLibrary): Promise<boolean> {
    try {
      const response = await fetch(config.getApiUrl("/api/prompts/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library }),
      });

      if (!response.ok) {
        throw new Error(`Failed to import prompts: ${response.statusText}`);
      }

      // Reload prompts from server
      this.userPromptsLoaded = false;
      await this.loadUserPrompts();
      return true;
    } catch (error) {
      console.error("[PromptLibrary] Failed to import prompts:", error);
      return false;
    }
  }
}

// Export singleton instance
export const PromptLibraryService = new PromptLibraryServiceImpl();

// Export default prompts for reference
export { DEFAULT_PROMPTS };
