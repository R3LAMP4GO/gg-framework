import fs from "node:fs/promises";
import { getAutoMemEntrypoint, ensureMemoryDirExists } from "./paths.js";

const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25_000;
const ENTRYPOINT_NAME = "MEMORY.md";

/**
 * Truncate MEMORY.md content to stay within limits.
 */
function truncateEntrypoint(content: string): string {
  const lines = content.split("\n");
  if (lines.length > MAX_ENTRYPOINT_LINES) {
    const truncated = lines.slice(0, MAX_ENTRYPOINT_LINES).join("\n");
    return truncated + `\n\n[... ${lines.length - MAX_ENTRYPOINT_LINES} lines truncated — keep ${ENTRYPOINT_NAME} under ${MAX_ENTRYPOINT_LINES} lines]`;
  }
  if (Buffer.byteLength(content) > MAX_ENTRYPOINT_BYTES) {
    // Trim by bytes — slice lines until under limit
    let result = "";
    for (const line of lines) {
      const next = result + line + "\n";
      if (Buffer.byteLength(next) > MAX_ENTRYPOINT_BYTES) break;
      result = next;
    }
    return result + `\n[... truncated at ${MAX_ENTRYPOINT_BYTES} bytes]`;
  }
  return content;
}

/**
 * Build the memory system prompt section.
 * Returns null if memory is not set up for this project.
 */
export async function buildMemoryPromptSection(cwd: string): Promise<string | null> {
  // Read MEMORY.md if it exists
  const entrypoint = await getAutoMemEntrypoint(cwd);
  let memoryContent: string | null = null;
  try {
    memoryContent = await fs.readFile(entrypoint, "utf-8");
  } catch {
    // No MEMORY.md yet — still include instructions so agent can create one
  }

  const memDir = await ensureMemoryDirExists(cwd);
  const lines: string[] = [];

  lines.push(`## Auto Memory`);
  lines.push(``);
  lines.push(`You have a persistent, file-based memory system at \`${memDir}\`.`);
  lines.push(`This directory exists — write to it directly with the write tool.`);
  lines.push(``);

  // Memory type taxonomy
  lines.push(`### Memory Types`);
  lines.push(``);
  lines.push(`- **user**: User's role, preferences, knowledge level. Save when learning about the user.`);
  lines.push(`- **feedback**: Corrections AND confirmations of approach. Include **Why:** and **How to apply:** lines.`);
  lines.push(`- **project**: Ongoing work, goals, deadlines, decisions not derivable from code/git. Convert relative dates to absolute.`);
  lines.push(`- **reference**: Pointers to external systems (Linear, Grafana, Slack channels, etc).`);
  lines.push(``);

  // Save format
  lines.push(`### How to Save`);
  lines.push(``);
  lines.push(`1. Write a memory file to the memory directory with frontmatter:`);
  lines.push("```markdown");
  lines.push(`---`);
  lines.push(`name: descriptive name`);
  lines.push(`description: one-line relevance hint (used to decide relevance later)`);
  lines.push(`type: user | feedback | project | reference`);
  lines.push(`---`);
  lines.push(`Content here.`);
  lines.push("```");
  lines.push(`2. Update \`${ENTRYPOINT_NAME}\` index — one line per entry under ~150 chars: \`- [Title](file.md) — one-line hook\``);
  lines.push(``);

  // What NOT to save
  lines.push(`### What NOT to Save`);
  lines.push(``);
  lines.push(`- Code patterns, architecture, file paths — derivable from reading the project`);
  lines.push(`- Git history, recent changes — \`git log\` / \`git blame\` are authoritative`);
  lines.push(`- Debugging solutions — the fix is in the code; the commit message has context`);
  lines.push(`- Ephemeral task details, temporary state, current conversation context`);
  lines.push(``);

  // When to access
  lines.push(`### When to Access`);
  lines.push(``);
  lines.push(`- When memories seem relevant, or user references prior-conversation work`);
  lines.push(`- You MUST access memory when user explicitly asks to check, recall, or remember`);
  lines.push(`- Memory records can become stale. Verify against current code before acting on old memories.`);
  lines.push(`- Before recommending from memory: if it names a file path, check it exists. If it names a function, grep for it.`);
  lines.push(``);

  // Current memory content
  if (memoryContent?.trim()) {
    lines.push(`### Current Memory Index`);
    lines.push(``);
    lines.push(truncateEntrypoint(memoryContent.trim()));
  } else {
    lines.push(`*No memories saved yet. Memory index (\`${ENTRYPOINT_NAME}\`) will appear here once created.*`);
  }

  return lines.join("\n");
}
