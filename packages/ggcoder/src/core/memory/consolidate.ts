/**
 * autoDream — periodic memory consolidation.
 * Ported from CC's src/services/autoDream/.
 *
 * Fires when: 24+ hours since last consolidation AND 5+ sessions since then.
 * Uses a lock file whose mtime IS the lastConsolidatedAt timestamp.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getAutoMemPath } from "./paths.js";
import { log } from "../logger.js";

const LOCK_FILE = ".consolidate-lock";
const MIN_HOURS = 24;
const MIN_SESSIONS = 5;
const STALE_LOCK_MS = 60 * 60 * 1000; // 1 hour

// ── Lock management ──────────────────────────────────────

function lockPath(memoryDir: string): string {
  return path.join(memoryDir, LOCK_FILE);
}

/** Read mtime of lock file = lastConsolidatedAt. Returns 0 if missing. */
export async function readLastConsolidatedAt(memoryDir: string): Promise<number> {
  try {
    const s = await fs.stat(lockPath(memoryDir));
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Acquire consolidation lock. Returns prior mtime for rollback, or null if locked.
 */
export async function tryAcquireLock(memoryDir: string): Promise<number | null> {
  const lp = lockPath(memoryDir);
  let mtimeMs: number | undefined;
  let holderPid: number | undefined;

  try {
    const [s, raw] = await Promise.all([fs.stat(lp), fs.readFile(lp, "utf-8")]);
    mtimeMs = s.mtimeMs;
    const parsed = parseInt(raw.trim(), 10);
    holderPid = Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    // No prior lock
  }

  // Check if lock is held by a live process
  if (mtimeMs !== undefined && Date.now() - mtimeMs < STALE_LOCK_MS) {
    if (holderPid !== undefined && isProcessRunning(holderPid)) {
      log("INFO", "consolidate", `Lock held by PID ${holderPid}`);
      return null;
    }
  }

  // Acquire: write our PID
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(lp, String(process.pid));

  // Verify we won the race
  try {
    const verify = await fs.readFile(lp, "utf-8");
    if (parseInt(verify.trim(), 10) !== process.pid) return null;
  } catch {
    return null;
  }

  return mtimeMs ?? 0;
}

/** Rollback lock mtime after failed consolidation. */
export async function rollbackLock(memoryDir: string, priorMtime: number): Promise<void> {
  const lp = lockPath(memoryDir);
  try {
    if (priorMtime === 0) {
      await fs.unlink(lp);
      return;
    }
    await fs.writeFile(lp, "");
    const t = priorMtime / 1000;
    await fs.utimes(lp, t, t);
  } catch (e) {
    log("WARN", "consolidate", `Rollback failed: ${(e as Error).message}`);
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Session counting ─────────────────────────────────────

/** Count session files modified since a timestamp. */
export async function countSessionsSince(sessionsDir: string, sinceMs: number): Promise<number> {
  try {
    const entries = await fs.readdir(sessionsDir);
    let count = 0;
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      try {
        const s = await fs.stat(path.join(sessionsDir, entry));
        if (s.mtimeMs > sinceMs) count++;
      } catch {
        // Skip unreadable files
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ── Gate check ───────────────────────────────────────────

export interface ConsolidationGateResult {
  shouldRun: boolean;
  reason?: string;
  hoursSince?: number;
  sessionsSince?: number;
}

/**
 * Check if consolidation should run.
 * Three gates (cheapest first): time → sessions → lock.
 */
export async function checkConsolidationGate(
  cwd: string,
  sessionsDir: string,
): Promise<ConsolidationGateResult> {
  const memoryDir = await getAutoMemPath(cwd);
  const lastAt = await readLastConsolidatedAt(memoryDir);
  const hoursSince = (Date.now() - lastAt) / 3_600_000;

  if (hoursSince < MIN_HOURS) {
    return { shouldRun: false, reason: `Only ${hoursSince.toFixed(1)}h since last (need ${MIN_HOURS}h)` };
  }

  const sessionCount = await countSessionsSince(sessionsDir, lastAt);
  if (sessionCount < MIN_SESSIONS) {
    return { shouldRun: false, reason: `Only ${sessionCount} sessions since last (need ${MIN_SESSIONS})` };
  }

  return { shouldRun: true, hoursSince, sessionsSince: sessionCount };
}

// ── Consolidation prompt ─────────────────────────────────

/**
 * Build the 4-phase consolidation prompt (ported from CC's consolidationPrompt.ts).
 */
export function buildConsolidationPrompt(
  memoryDir: string,
  transcriptDir: string,
): string {
  return `# Dream: Memory Consolidation

You are performing a dream — a reflective pass over your memory files. Synthesize what you've learned recently into durable, well-organized memories so that future sessions can orient quickly.

Memory directory: \`${memoryDir}\`
Session transcripts: \`${transcriptDir}\` (large JSONL files — grep narrowly, don't read whole files)

---

## Phase 1 — Orient

- \`ls\` the memory directory to see what already exists
- Read \`MEMORY.md\` to understand the current index
- Skim existing topic files so you improve them rather than creating duplicates

## Phase 2 — Gather recent signal

Look for new information worth persisting. Sources in rough priority order:

1. **Existing memories that drifted** — facts that contradict something you see in the codebase now
2. **Transcript search** — if you need specific context, grep the JSONL transcripts for narrow terms:
   \`grep -rn "<narrow term>" ${transcriptDir}/ --include="*.jsonl" | tail -50\`

Don't exhaustively read transcripts. Look only for things you already suspect matter.

## Phase 3 — Consolidate

For each thing worth remembering, write or update a memory file at the top level of the memory directory. Use the frontmatter format:

\`\`\`markdown
---
name: descriptive name
description: one-line relevance hint
type: user | feedback | project | reference
---
Content here.
\`\`\`

Focus on:
- Merging new signal into existing topic files rather than creating near-duplicates
- Converting relative dates to absolute dates
- Deleting contradicted facts — if today's investigation disproves an old memory, fix it

## Phase 4 — Prune and index

Update \`MEMORY.md\` so it stays under 200 lines AND under ~25KB. It's an **index**, not a dump — each entry should be one line under ~150 characters: \`- [Title](file.md) — one-line hook\`. Never write memory content directly into it.

- Remove pointers to memories that are now stale, wrong, or superseded
- Add pointers to newly important memories
- Resolve contradictions — if two files disagree, fix the wrong one

---

Return a brief summary of what you consolidated, updated, or pruned. If nothing changed, say so.`;
}
