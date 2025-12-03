/**
 * Observer Hook
 * Analyzes session history to extract tasks and learn skills
 */

import { useState, useCallback } from "react";
import { LLMManager } from "../services/LLMManager";
import { KnowledgeService } from "../services/KnowledgeService";
import {
  TASK_ANALYSIS_PROMPT,
  SKILL_EXTRACTION_PROMPT,
} from "../data/prompts/observer";
import type { Message } from "../types";
import { emit } from "../events";

// Minimum messages needed for meaningful analysis
const MIN_MESSAGES_FOR_ANALYSIS = 3;

export function useObserver() {
  const [isObserving, setIsObserving] = useState(false);

  const analyzeAndLearn = useCallback(
    async (messages: Message[], apiKey?: string, provider?: string) => {
      // Need at least a few exchanges to learn anything meaningful
      if (messages.length < MIN_MESSAGES_FOR_ANALYSIS) {
        console.log("[Observer] Not enough messages to analyze:", messages.length);
        return;
      }
      
      setIsObserving(true);
      console.log("[Observer] Starting analysis with", messages.length, "messages");

      // Notify start
      emit("termai-toast", {
        message: "Analyzing session for insights...",
        type: "info",
      });

      try {
        // 1. Prepare Context - format must match what LLMManager.chat expects
        // LLMManager parses "role: content" format (without brackets)
        const context = messages
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");
        
        const providerType =
          provider || localStorage.getItem("termai_provider") || "gemini";
        
        console.log("[Observer] Using provider:", providerType);

        const llm = LLMManager.getProvider(providerType, apiKey);

        // 2. Task Analysis
        console.log("[Observer] Analyzing task...");
        const taskResponse = await llm.chat(TASK_ANALYSIS_PROMPT, context);
        console.log("[Observer] Task response:", taskResponse.substring(0, 200));
        
        const taskJsonMatch = taskResponse.match(/\{[\s\S]*\}/);

        if (!taskJsonMatch) {
          console.warn("[Observer] Failed to parse task JSON from:", taskResponse);
          emit("termai-toast", {
            message: "Failed to analyze task structure",
            type: "warning",
          });
          return;
        }

        let taskData;
        try {
          taskData = JSON.parse(taskJsonMatch[0]);
        } catch (parseError) {
          console.error("[Observer] JSON parse error:", parseError, "Raw:", taskJsonMatch[0]);
          emit("termai-toast", {
            message: "Failed to parse task data",
            type: "warning",
          });
          return;
        }
        
        console.log("[Observer] Task data:", taskData);
        
        // Log task regardless of status
        try {
          await KnowledgeService.logTask(taskData);
          console.log("[Observer] Task logged successfully");
        } catch (logError) {
          console.warn("[Observer] Failed to log task:", logError);
        }

        // Check for success - be more lenient
        const isSuccess = taskData.status === "success" || 
                         taskData.status === "completed" ||
                         taskData.status === "done";

        if (isSuccess) {
          // 3. Skill Extraction (only on success)
          console.log("[Observer] Task successful, extracting skill...");
          const skillResponse = await llm.chat(
            SKILL_EXTRACTION_PROMPT,
            context,
          );
          console.log("[Observer] Skill response:", skillResponse.substring(0, 200));
          
          const skillJsonMatch = skillResponse.match(/\{[\s\S]*\}/);

          if (skillJsonMatch) {
            let skillData;
            try {
              skillData = JSON.parse(skillJsonMatch[0]);
            } catch (parseError) {
              console.error("[Observer] Skill JSON parse error:", parseError);
              emit("termai-toast", {
                message: "Failed to parse skill data",
                type: "warning",
              });
              return;
            }
            
            // Validate skill has required fields
            if (!skillData.use_when || !skillData.tool_sops) {
              console.warn("[Observer] Invalid skill data - missing required fields:", skillData);
              emit("termai-toast", {
                message: "Invalid skill format from analysis",
                type: "warning",
              });
              return;
            }
            
            console.log("[Observer] Saving skill:", skillData);
            await KnowledgeService.addSkill(skillData);

            emit("termai-toast", {
              message: `Learned Skill: ${skillData.use_when}`,
              type: "success",
            });
            console.log("[Observer] Skill saved successfully!");
          } else {
            console.warn("[Observer] No skill JSON found in response:", skillResponse);
            emit("termai-toast", {
              message: "Could not extract skill pattern",
              type: "info",
            });
          }
        } else {
          console.log("[Observer] Task not successful, status:", taskData.status);
          emit("termai-toast", {
            message: `Task analysis complete (status: ${taskData.status})`,
            type: "info",
          });
        }
      } catch (error) {
        console.error("[Observer] Error:", error);
        emit("termai-toast", {
          message: "Observer failed to analyze session",
          type: "error",
        });
      } finally {
        setIsObserving(false);
      }
    },
    [],
  );

  return { isObserving, analyzeAndLearn };
}
