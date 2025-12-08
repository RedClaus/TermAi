/**
 * RAPID System Prompt Builder
 *
 * Part of the RAPID Framework (Reduce AI Prompt Iteration Depth)
 *
 * Builds context-aware system prompts that enable first-shot accuracy.
 * The prompt includes:
 * - Core RAPID principles (assume, don't ask repeatedly)
 * - Full gathered context (env, project, errors, git)
 * - Intent classification results
 * - Response strategy guidance
 */

/**
 * Core RAPID principles - these never change
 */
const RAPID_CORE_PROMPT = `You are TermAI, an expert terminal assistant. Your goal is to solve problems in ONE response whenever possible.

## CORE PRINCIPLE: Front-load context, minimize questions

Before responding, you MUST:
1. Use ALL provided context (don't ask for what you already have)
2. Make reasonable assumptions and STATE them clearly
3. If you must ask, ask EVERYTHING at once in a structured format
4. Provide your best answer EVEN IF uncertain (with confidence level)

## RESPONSE DECISION TREE:

\`\`\`
IF you have enough context (error messages, project info):
  → Execute/answer directly
  → State key assumptions made
  → Include verification command

IF context is partial but usable:
  → Provide best answer with [ASSUMPTION] markers
  → Add: "If this doesn't work, the likely cause is X. Try Y instead."

IF critical info is missing (no error message, unclear goal):
  → Ask ONE compound question covering all needs
  → Include preliminary analysis while waiting
  → Suggest most likely solution
\`\`\`

## NEVER:
- Ask one question at a time (wastes user time)
- Ask for information visible in the provided context
- Say "I need more information" without providing preliminary analysis
- Ask permission to proceed (just proceed with stated assumptions)

## ALWAYS:
- Lead with action, follow with explanation
- State assumptions inline: "[Assuming Node 18+]..."
- Provide fallback: "If that fails, try..."
- Include verification: "Run X to confirm it worked"
- Use \`command\` for executable terminal commands`;

/**
 * Build a context section for the prompt
 */
function buildContextSection(context) {
  if (!context) return '';

  const sections = [];

  // Environment
  sections.push(`## ENVIRONMENT:
- OS: ${context.os || 'unknown'}
- Shell: ${context.shell || 'unknown'}
- CWD: ${context.cwd || 'unknown'}
- User: ${context.user || 'unknown'}`);

  // Runtime versions
  if (context.runtimeVersions && Object.keys(context.runtimeVersions).length > 0) {
    const versions = Object.entries(context.runtimeVersions)
      .map(([name, version]) => `${name}: ${version}`)
      .join(', ');
    sections.push(`- Runtime Versions: ${versions}`);
  }

  // Project info
  if (context.projectType || context.framework || context.packageManager) {
    let projectInfo = `\n## PROJECT:`;
    if (context.projectType) projectInfo += `\n- Type: ${context.projectType}`;
    if (context.packageManager) projectInfo += `\n- Package Manager: ${context.packageManager}`;
    if (context.framework) projectInfo += `\n- Framework: ${context.framework}`;
    if (context.language) projectInfo += `\n- Language: ${context.language}`;
    sections.push(projectInfo);
  }

  // Git context
  if (context.gitContext) {
    const git = context.gitContext;
    sections.push(`\n## GIT:
- Branch: ${git.branch}
- Status: ${git.hasChanges ? `${git.changedFilesCount} changed files (${git.staged} staged, ${git.unstaged} unstaged, ${git.untracked} untracked)` : 'clean'}
- Remote: ${git.hasRemote ? 'configured' : 'none'}`);
  }

  // Recent errors (CRITICAL for problem-solving)
  if (context.recentErrors && context.recentErrors.length > 0) {
    const errors = context.recentErrors.slice(-3).map(e => {
      const patterns = (e.patterns || []).slice(0, 3).map(p => p.message || p.fullMatch).join(', ');
      return `Command: \`${e.command}\`\nPatterns: ${patterns}\nOutput:\n\`\`\`\n${(e.output || '').slice(0, 500)}\n\`\`\``;
    }).join('\n\n');

    sections.push(`\n## RECENT ERRORS (CRITICAL - use these to solve the problem):
${errors}`);
  }

  // Recent commands (for context)
  if (context.recentCommands && context.recentCommands.length > 0) {
    const commands = context.recentCommands.slice(-5).map(c =>
      `\`${c.command}\` (exit: ${c.exitCode})`
    ).join('\n');
    sections.push(`\n## RECENT COMMANDS:
${commands}`);
  }

  // Config files (abbreviated)
  if (context.configFiles && context.configFiles.length > 0) {
    const files = context.configFiles.slice(0, 3).map(f => {
      const content = f.content.slice(0, 500);
      return `### ${f.name}\n\`\`\`\n${content}${f.truncated || f.content.length > 500 ? '\n... (truncated)' : ''}\n\`\`\``;
    }).join('\n\n');

    sections.push(`\n## RELEVANT CONFIG FILES:
${files}`);
  }

  return sections.join('\n');
}

/**
 * Build intent section for the prompt
 */
function buildIntentSection(intent) {
  if (!intent) return '';

  const confidenceLabel = intent.confidence >= 0.7 ? 'HIGH' :
                          intent.confidence >= 0.5 ? 'MEDIUM' : 'LOW';

  return `\n## CLASSIFIED INTENT:
- Category: ${intent.category}
- Confidence: ${Math.round(intent.confidence * 100)}% (${confidenceLabel})
- Signals: ${(intent.signals || []).slice(0, 5).join(', ') || 'none'}
${intent.gaps && intent.gaps.length > 0 ? `- Missing Info: ${intent.gaps.map(g => g.field).join(', ')}` : '- Missing Info: none (all context available)'}`;
}

/**
 * Build strategy section for the prompt
 */
function buildStrategySection(strategy) {
  if (!strategy) return '';

  const approaches = {
    direct: 'DIRECT - You have enough context. Provide a complete solution.',
    assumed: 'WITH ASSUMPTIONS - Partial context. State assumptions clearly and provide fallbacks.',
    ask: 'ASK ONCE - Missing critical info. Ask everything needed in one compound question, but also provide preliminary analysis.'
  };

  let section = `\n## YOUR TASK:
Response Mode: ${approaches[strategy.approach] || 'DIRECT'}`;

  if (strategy.assumptions && strategy.assumptions.length > 0) {
    section += `\n\n### Assumptions to state:
${strategy.assumptions.map(a => `- ${a.assumption}`).join('\n')}`;
  }

  if (strategy.gaps && strategy.gaps.length > 0) {
    section += `\n\n### Information still needed (ask in ONE question):
${strategy.gaps.map(g => `- ${g.field}: ${g.question}`).join('\n')}`;
  }

  return section;
}

/**
 * Build complete RAPID prompt
 */
function buildRAPIDPrompt(context, intent, strategy) {
  const sections = [
    RAPID_CORE_PROMPT,
    buildContextSection(context),
    buildIntentSection(intent),
    buildStrategySection(strategy)
  ];

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Build a minimal prompt for quick responses
 */
function buildMinimalPrompt(context) {
  return `${RAPID_CORE_PROMPT}

## QUICK CONTEXT:
- OS: ${context?.os || 'unknown'}, CWD: ${context?.cwd || 'unknown'}
- Project: ${context?.projectType || 'unknown'}, PM: ${context?.packageManager || 'unknown'}
${context?.lastError ? `- Last Error: ${context.lastError.patterns?.[0]?.message || 'see output'}` : ''}

Provide a direct, actionable response.`;
}

/**
 * Build a context summary for display in UI
 */
function buildContextSummary(context) {
  if (!context) return { items: [], completeness: 0 };

  const items = [];

  // Environment
  if (context.os) {
    items.push({ type: 'env', label: 'OS', value: context.os });
  }
  if (context.shell) {
    items.push({ type: 'env', label: 'Shell', value: context.shell });
  }

  // Project
  if (context.projectType) {
    items.push({ type: 'project', label: 'Project', value: context.projectType });
  }
  if (context.framework) {
    items.push({ type: 'project', label: 'Framework', value: context.framework });
  }
  if (context.packageManager) {
    items.push({ type: 'project', label: 'PM', value: context.packageManager });
  }

  // Runtime versions
  if (context.runtimeVersions) {
    for (const [name, version] of Object.entries(context.runtimeVersions)) {
      if (['node', 'python', 'go', 'rustc'].includes(name)) {
        items.push({ type: 'runtime', label: name, value: version });
      }
    }
  }

  // Git
  if (context.gitContext) {
    items.push({
      type: 'git',
      label: 'Git',
      value: `${context.gitContext.branch}${context.gitContext.hasChanges ? '*' : ''}`
    });
  }

  // Errors
  if (context.recentErrors?.length > 0) {
    items.push({
      type: 'error',
      label: 'Errors',
      value: `${context.recentErrors.length} recent`
    });
  }

  // Commands
  if (context.recentCommands?.length > 0) {
    items.push({
      type: 'commands',
      label: 'History',
      value: `${context.recentCommands.length} commands`
    });
  }

  return {
    items,
    completeness: context.contextCompleteness || 0,
    gatherTime: context.gatherTime || 0
  };
}

module.exports = {
  buildRAPIDPrompt,
  buildMinimalPrompt,
  buildContextSection,
  buildIntentSection,
  buildStrategySection,
  buildContextSummary,
  RAPID_CORE_PROMPT
};
