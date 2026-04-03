/**
 * extractMemories — background agent that auto-saves memories after each query loop.
 * Ported from CC's src/services/extractMemories/extractMemories.ts.
 *
 * Runs as a lightweight forked process after the main agent produces a final response.
 * Uses cursor tracking to only process new messages since last extraction.
 */

import type { Message } from "@kenkaiiii/gg-ai";
import { getAutoMemPath } from "./paths.js";
import { scanMemoryFiles, formatMemoryManifest } from "./scan.js";
import { log } from "../logger.js";

/** State tracked across extractions within a session */
export interface ExtractState {
  lastProcessedUuid?: string;
  inProgress: boolean;
}

/** Read-only bash commands allowed for extraction agent */
const READ_ONLY_COMMANDS = new Set([
  "ls", "find", "grep", "cat", "stat", "wc", "head", "tail", "sort", "uniq",
]);

/**
 * Check if a bash command is read-only.
 */
export function isReadOnlyBashCommand(command: string): boolean {
  const firstWord = command.trim().split(/\s+/)[0]?.replace(/^.*\//, "");
  return READ_ONLY_COMMANDS.has(firstWord ?? "");
}

/**
 * Check if any assistant message after the cursor wrote to the memory directory.
 * If the main agent already wrote memories, extraction is redundant.
 */
export function hasMemoryWritesSince(
  messages: Message[],
  sinceUuid: string | undefined,
  memoryDir: string,
): boolean {
  let foundStart = sinceUuid === undefined;
  for (const msg of messages) {
    if (!foundStart) {
      if ((msg as unknown as Record<string, unknown>).uuid === sinceUuid) foundStart = true;
      continue;
    }
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as unknown as Array<Record<string, unknown>>) {
      if (block.type === "tool_use" && (block.name === "write" || block.name === "edit")) {
        const input = block.input as Record<string, unknown> | undefined;
        const filePath = input?.file_path;
        if (typeof filePath === "string" && filePath.startsWith(memoryDir)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Count model-visible messages since the cursor UUID.
 */
export function countMessagesSince(messages: Message[], sinceUuid: string | undefined): number {
  if (!sinceUuid) return messages.filter((m) => m.role === "user" || m.role === "assistant").length;
  let found = false;
  let count = 0;
  for (const msg of messages) {
    if (!found) {
      if ((msg as unknown as Record<string, unknown>).uuid === sinceUuid) found = true;
      continue;
    }
    if (msg.role === "user" || msg.role === "assistant") count++;
  }
  return found ? count : messages.filter((m) => m.role === "user" || m.role === "assistant").length;
}

/**
 * Build the extraction prompt (ported from CC's buildExtractAutoOnlyPrompt).
 */
export function buildExtractionPrompt(
  newMessageCount: number,
  existingMemories: string,
  memoryDir: string,
): string {
  return `Analyze the most recent ~${newMessageCount} messages and use them to update your persistent memory system.

## Available Tools
- read, grep, find (unrestricted)
- write, edit (ONLY within ${memoryDir})
- bash (read-only commands only: ls, find, grep, cat, stat, wc, head, tail)

## Strategy
Turn 1: Read all needed files in parallel.
Turn 2: Write all updates in parallel. Avoid interleaving reads and writes.

## Memory Directory
${memoryDir}

## Existing Memories
${existingMemories || "(none yet)"}

## Rules
- Update existing memory files rather than creating near-duplicates
- Use frontmatter format:
  ---
  name: descriptive name
  description: one-line relevance hint
  type: user | feedback | project | reference
  ---
  Content here.

- Update MEMORY.md index — one line per entry, under ~150 chars:
  - [Title](file.md) — one-line hook

- Do NOT save: code patterns, git history, architecture, file paths (derivable from code)
- Do NOT save: ephemeral task details, temporary state
- DO save: user preferences, confirmed feedback, project decisions, external references
- Convert relative dates to absolute dates (e.g., "Thursday" → actual date)

If nothing worth remembering, do nothing. That's a valid outcome.`;
}

/**
 * Main extraction orchestrator. Called after each agent_done event.
 * Returns paths of files written (for "Saved N memories" message).
 */
export async function runExtraction(
  messages: Message[],
  cwd: string,
  state: ExtractState,
): Promise<{ writtenPaths: string[]; newCursor?: string }> {
  if (state.inProgress) {
    log("INFO", "extractMemories", "Extraction already in progress — skipping");
    return { writtenPaths: [] };
  }

  const memoryDir = await getAutoMemPath(cwd);
  const newMessageCount = countMessagesSince(messages, state.lastProcessedUuid);

  if (newMessageCount < 2) {
    log("INFO", "extractMemories", "Too few new messages — skipping extraction");
    return { writtenPaths: [] };
  }

  // Mutual exclusion: if main agent already wrote to memory dir, skip
  if (hasMemoryWritesSince(messages, state.lastProcessedUuid, memoryDir)) {
    log("INFO", "extractMemories", "Main agent wrote to memory — skipping extraction");
    const lastMsg = messages.at(-1);
    return {
      writtenPaths: [],
      newCursor: (lastMsg as unknown as Record<string, unknown>)?.uuid as string | undefined,
    };
  }

  // Build manifest of existing memories
  const headers = await scanMemoryFiles(memoryDir);
  const manifest = formatMemoryManifest(headers);

  // Build extraction prompt (available for caller to pass to subagent)
  buildExtractionPrompt(newMessageCount, manifest, memoryDir);

  log("INFO", "extractMemories", `Starting extraction — ${newMessageCount} new messages`);

  // Return the prompt and metadata — the caller (agent-session) will spawn the subagent
  const lastMsg = messages.at(-1);
  return {
    writtenPaths: [], // Populated by the caller after subagent completes
    newCursor: (lastMsg as unknown as Record<string, unknown>)?.uuid as string | undefined,
  };
}
