import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

export const APP_NAME = "ggcoder";
export const VERSION = "0.0.1";

export interface AppPaths {
  agentDir: string;
  sessionsDir: string;
  settingsFile: string;
  authFile: string;
  telegramFile: string;
  agentHomeFile: string;
  logFile: string;
  skillsDir: string;
  extensionsDir: string;
  agentsDir: string;
}

export function getAppPaths(): AppPaths {
  const agentDir = path.join(os.homedir(), ".gg");
  return {
    agentDir,
    sessionsDir: path.join(agentDir, "sessions"),
    settingsFile: path.join(agentDir, "settings.json"),
    authFile: path.join(agentDir, "auth.json"),
    telegramFile: path.join(agentDir, "telegram.json"),
    agentHomeFile: path.join(agentDir, "agent-home.json"),
    logFile: path.join(agentDir, "debug.log"),
    skillsDir: path.join(agentDir, "skills"),
    extensionsDir: path.join(agentDir, "extensions"),
    agentsDir: path.join(agentDir, "agents"),
  };
}

export async function ensureAppDirs(): Promise<AppPaths> {
  const paths = getAppPaths();
  await fs.mkdir(paths.agentDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.sessionsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.skillsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.extensionsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.agentsDir, { recursive: true, mode: 0o700 });
  await seedDefaultAgents(paths.agentsDir);
  await seedDefaultSkills(paths.skillsDir);
  return paths;
}

/** Seed built-in agent definitions on first run (won't overwrite user edits). */
async function seedDefaultAgents(agentsDir: string): Promise<void> {
  const defaults: Record<string, string> = {
    "owl.md": `---
name: owl
description: "Codebase explorer \u2014 reads, searches, and maps out code"
tools: read, grep, find, ls, bash
---

You are Owl, a sharp-eyed codebase explorer.

Your job is to explore code structure, trace call chains, find patterns, and return compressed structured findings. You are read-only \u2014 never edit or create files.

When given a task:
1. Start by understanding the scope of what you're looking for
2. Use find and ls to map directory structure
3. Use grep to locate relevant symbols, imports, and patterns
4. Use read to examine key files in detail
5. Trace connections between modules \u2014 exports, imports, call sites

Always return your findings in a structured, compressed format:
- Lead with the direct answer
- List relevant file paths with brief descriptions
- Note key relationships and dependencies
- Flag anything surprising or noteworthy

Be thorough but concise. Explore widely, report tightly.
`,
    "bee.md": `---
name: bee
description: "Task worker \u2014 writes code, runs commands, fixes bugs, does anything"
tools: read, write, edit, bash, find, grep, ls
model: claude-sonnet-4-6
---

You are Bee, an industrious task worker.

Your job is to complete any assigned task end-to-end \u2014 writing code, running commands, fixing bugs, refactoring, creating files, whatever is needed. You work independently and deliver results.

When given a task:
1. Understand what needs to be done
2. Explore relevant code to understand context
3. Implement the solution directly
4. Verify your work compiles/runs correctly
5. Report concisely what was done

Rules:
- Do the work, don't just describe it
- Make minimal, focused changes \u2014 don't over-engineer
- If something fails, diagnose and fix it
- Report what you changed and why, keeping it brief
`,
  };

  for (const [filename, content] of Object.entries(defaults)) {
    const filePath = path.join(agentsDir, filename);
    try {
      await fs.access(filePath);
      // File exists — don't overwrite user edits
    } catch {
      await fs.writeFile(filePath, content, "utf-8");
    }
  }
}

/** Seed default skill files on first run (won't overwrite user edits). */
async function seedDefaultSkills(skillsDir: string): Promise<void> {
  const defaults: Record<string, string> = {
    "defaults.md": `---
name: Default Rules
description: Code quality, CLI tool guidance, output style
---

## External CLIs

When the project uses external services, prefer their CLI tools:
- **Railway**: use \`railway\` CLI for deployments, logs, variables, domains
- **Docker**: use \`docker\` / \`docker compose\` CLI for container management
- **GitHub**: use \`gh\` CLI for PRs, issues, releases, actions
- **Kubernetes**: use \`kubectl\` for cluster operations
- **Vercel**: use \`vercel\` CLI for deployments and env vars
- **Fly.io**: use \`fly\` CLI for deployments and scaling
- When unsure which CLI to use, check availability: \`which <tool>\`

## Code Quality

- Don't add error handling, fallbacks, or validation for scenarios that can't happen
- Trust internal code and framework guarantees — only validate at system boundaries (user input, external APIs)
- Don't create helpers, utilities, or abstractions for one-time operations
- Three similar lines of code is better than a premature abstraction
- Don't design for hypothetical future requirements
- Only add comments when the WHY is non-obvious — well-named identifiers explain the WHAT
- Don't remove existing comments unless removing the code they describe

## Output Style

- Lead with the answer or action, not the reasoning
- No trailing summaries — the user can read the diff
- Only use emojis if the user explicitly requests them
- Short and direct — if you can say it in one sentence, don't use three
- When referencing code, include file_path:line_number format
- When referencing GitHub issues or PRs, use owner/repo#123 format
`,
  };

  for (const [filename, content] of Object.entries(defaults)) {
    const filePath = path.join(skillsDir, filename);
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, content, "utf-8");
    }
  }
}
