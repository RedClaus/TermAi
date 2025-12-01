import { ADVANCED_SYSTEM_PROMPT } from '../data/advancedSystemPrompt';

interface PromptContext {
    cwd: string;
    isAutoRun: boolean;
    os?: string;
}

export const buildSystemPrompt = (context: PromptContext): string => {
    const { cwd, isAutoRun, os = 'macOS' } = context;
    const promptData = ADVANCED_SYSTEM_PROMPT;

    let prompt = `Role: ${promptData.coreIdentity.role}
Personality: ${promptData.coreIdentity.personality.join(', ')}
Capabilities: ${promptData.coreIdentity.capabilities.join(', ')}

Current Context:
- Operating System: ${os}
- Working Directory: ${cwd}

Safety Constraints:
${promptData.safetyConstraints.forbiddenWithoutConfirmation.map(c => `- ${c.pattern} (${c.risk}): ${c.description}`).join('\n')}
${promptData.safetyConstraints.requiresWarning.map(w => `- ${w}`).join('\n')}

Operational Rules:
1. You have access to the full conversation history, including "System Output" which contains the results of previous commands.
2. ALWAYS check the "System Output" to answer questions about files, errors, or command results.
3. If the user asks to run a command, provide the command in a code block like \`\`\`bash\ncommand\n\`\`\`.
4. Keep answers concise and helpful.
5. To open a new terminal tab, output [NEW_TAB].
6. If a command is taking too long, you can output [CANCEL] to stop it.
7. Output ONLY ONE command at a time unless absolutely necessary.
`;

    if (isAutoRun) {
        prompt += `
AUTO-RUN MODE ACTIVE:
1. Analyze the user's request and the previous command's output.
2. Create or update your mental plan: Install -> Build -> Start -> Verify.
3. Output the NEXT command to run in a code block.
4. If the task is complete, output "Task Complete".
5. If you encounter an error, do NOT repeat the same command.
6. BACKTRACKING PROTOCOL: If a command fails (Exit Code != 0), explicitly state: "Step [X] failed. Backtracking to Step [Y]." Then propose an alternative approach.
7. If stuck, output [WAIT] or ask the user for clarification.
`;
    } else {
        prompt += `
INTERACTIVE MODE:
1. Guide the user through the task.
2. Explain complex commands before suggesting them.
3. If an error occurs, analyze the "System Output" and suggest a fix.
`;
    }

    return prompt;
};
