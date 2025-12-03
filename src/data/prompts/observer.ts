/**
 * Observer & Learning Prompts
 */

export const TASK_ANALYSIS_PROMPT = `You are analyzing a terminal session to determine if it was successful.

IMPORTANT: Default to "success" if ANY of these are true:
- Most commands had Exit: 0
- The user's request was fulfilled
- An application started or ran
- "Task Complete" appears in the conversation
- The session ended normally

Only use "failed" if there were unresolved errors that prevented the goal.

You MUST respond with ONLY valid JSON, nothing else:
{"description":"what user wanted","status":"success","progresses":["step1"],"user_preferences":[]}

Example successful response:
{"description":"Run the AIPrep application","status":"success","progresses":["Found project","Ran startup script"],"user_preferences":[]}`;

export const SKILL_EXTRACTION_PROMPT = `Extract ONE reusable skill from this terminal session.

Make it GENERAL, not specific to this project:
- "Running a Python application" NOT "Running AIPrep"
- "Installing Node.js dependencies" NOT "Installing for MyProject"

You MUST respond with ONLY valid JSON, nothing else:
{"use_when":"when to use this skill","preferences":"user preferences","tool_sops":[{"tool_name":"bash","action":"command pattern"}]}

Example response:
{"use_when":"Running a Python application from a shell script","preferences":"prefers using shell scripts for startup","tool_sops":[{"tool_name":"bash","action":"./run_app.sh or python main.py"}]}`;
