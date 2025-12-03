/**
 * Knowledge Service
 * Client-side interface for storing and retrieving learned skills
 */

import { config } from "../config";
import type {
  Skill,
  TaskLog,
  SearchSkillsResponse,
  AddSkillResponse,
} from "../types/knowledge";

export class KnowledgeService {
  /**
   * Search for skills relevant to a query
   */
  static async searchSkills(query: string): Promise<Skill[]> {
    try {
      const url = new URL(`${config.apiUrl}/api/knowledge/skills`);
      if (query) url.searchParams.append("query", query);

      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = (await res.json()) as SearchSkillsResponse;
      return data.skills || [];
    } catch (e) {
      console.error("Search skills error:", e);
      return [];
    }
  }

  /**
   * Get all learned skills, sorted by newest first
   */
  static async getLatestSkills(): Promise<Skill[]> {
    try {
      const url = new URL(`${config.apiUrl}/api/knowledge/skills`);
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = (await res.json()) as SearchSkillsResponse;
      // Sort in-memory if backend doesn't sort
      return (data.skills || []).sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      console.error("Get latest skills error:", e);
      return [];
    }
  }

  /**
   * Save a new learned skill
   */
  static async addSkill(
    skill: Omit<Skill, "id" | "timestamp">,
  ): Promise<Skill | null> {
    try {
      const res = await fetch(`${config.apiUrl}/api/knowledge/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AddSkillResponse;
      return data.skill;
    } catch (e) {
      console.error("Add skill error:", e);
      return null;
    }
  }

  /**
   * Log a completed task execution
   */
  static async logTask(
    task: Omit<TaskLog, "id" | "timestamp">,
  ): Promise<void> {
    try {
      await fetch(`${config.apiUrl}/api/knowledge/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
    } catch (e) {
      console.error("Log task error:", e);
    }
  }
}
