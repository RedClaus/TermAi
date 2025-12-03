/**
 * Knowledge Base Types
 * Definitions for learned skills and task logs
 */

export interface ToolSop {
  tool_name: string;
  action: string;
}

export interface Skill {
  id: string;
  timestamp: number;
  use_when: string;
  preferences?: string;
  tool_sops: ToolSop[];
}

export interface TaskLog {
  id: string;
  timestamp: number;
  description: string;
  status: "success" | "failed";
  progresses?: string[];
  user_preferences?: string[];
}

export interface SearchSkillsResponse {
  skills: Skill[];
}

export interface AddSkillResponse {
  success: boolean;
  skill: Skill;
}

export interface LogTaskResponse {
  success: boolean;
  task: TaskLog;
}
