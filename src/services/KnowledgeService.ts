/**
 * Knowledge Service
 * Client-side interface for storing and retrieving learned skills
 * and performing semantic search (RAG) across the codebase
 */

import { config } from "../config";
import type {
  Skill,
  TaskLog,
  SearchSkillsResponse,
  AddSkillResponse,
  VectorSearchResult,
  VectorSearchResponse,
  ContextResponse,
  KnowledgeEngineStatus,
  IndexDirectoryResponse,
} from "../types/knowledge";

export class KnowledgeService {
  // ===========================================
  // Skills API
  // ===========================================

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
   * Delete a skill by ID
   */
  static async deleteSkill(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${config.apiUrl}/api/knowledge/skills/${id}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch (e) {
      console.error("Delete skill error:", e);
      return false;
    }
  }

  // ===========================================
  // Tasks API
  // ===========================================

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

  // ===========================================
  // Vector Search API (RAG)
  // ===========================================

  /**
   * Semantic search across indexed codebase
   */
  static async vectorSearch(
    query: string,
    limit = 5,
  ): Promise<VectorSearchResult[]> {
    try {
      const res = await fetch(`${config.apiUrl}/api/knowledge/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit }),
      });

      if (!res.ok) return [];
      const data = (await res.json()) as VectorSearchResponse;
      return data.results || [];
    } catch (e) {
      console.error("Vector search error:", e);
      return [];
    }
  }

  /**
   * Get formatted context for RAG (ready for prompt injection)
   */
  static async getContext(
    query: string,
    limit = 5,
  ): Promise<ContextResponse> {
    try {
      const res = await fetch(`${config.apiUrl}/api/knowledge/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit }),
      });

      if (!res.ok) {
        return { context: "", sources: [], count: 0 };
      }

      return (await res.json()) as ContextResponse;
    } catch (e) {
      console.error("Get context error:", e);
      return { context: "", sources: [], count: 0 };
    }
  }

  /**
   * Get knowledge engine status
   */
  static async getStatus(): Promise<KnowledgeEngineStatus | null> {
    try {
      const res = await fetch(`${config.apiUrl}/api/knowledge/status`);
      if (!res.ok) return null;
      return (await res.json()) as KnowledgeEngineStatus;
    } catch (e) {
      console.error("Get status error:", e);
      return null;
    }
  }

  /**
   * Trigger indexing of a directory
   */
  static async indexDirectory(
    directory: string,
  ): Promise<IndexDirectoryResponse | null> {
    try {
      const res = await fetch(`${config.apiUrl}/api/knowledge/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory }),
      });

      if (!res.ok) return null;
      return (await res.json()) as IndexDirectoryResponse;
    } catch (e) {
      console.error("Index directory error:", e);
      return null;
    }
  }

  /**
   * Update Knowledge Engine configuration
   */
  static async updateConfig(
    provider: string,
    ollamaEndpoint?: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(`${config.apiUrl}/api/knowledge/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          provider, 
          endpoint: ollamaEndpoint 
        }),
      });
      return res.ok;
    } catch (e) {
      console.error("Update config error:", e);
      return false;
    }
  }
}
