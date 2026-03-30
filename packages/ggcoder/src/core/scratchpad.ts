import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STALE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * File-based scratchpad for subagent coordination.
 *
 * Layout:
 *   .gg/.scratchpad/<session-id>/
 *     _context.json   — parent context, written before spawning subagents
 *     <agent-id>.json — per-agent findings, one file per agent (no contention)
 */
export class Scratchpad {
  private readonly dir: string;

  constructor(
    private readonly baseDir: string,
    private readonly sessionId: string,
  ) {
    this.dir = path.join(baseDir, ".scratchpad", sessionId);
  }

  /** Write parent context that subagents can read. */
  async writeContext(context: Record<string, unknown>): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, "_context.json"), JSON.stringify(context, null, 2));
  }

  /** Read parent context. Returns null if not yet written. */
  async readContext(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(path.join(this.dir, "_context.json"), "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Write findings for a specific agent. Each agent writes its own file — no lock needed. */
  async writeFindings(agentId: string, findings: Record<string, unknown>): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = path.join(this.dir, `${sanitizeId(agentId)}.json`);
    await fs.writeFile(filePath, JSON.stringify(findings, null, 2));
  }

  /** Read all agent findings for this session. */
  async readAllFindings(): Promise<Map<string, Record<string, unknown>>> {
    const results = new Map<string, Record<string, unknown>>();
    let entries: string[];
    try {
      entries = await fs.readdir(this.dir);
    } catch {
      return results;
    }

    for (const entry of entries) {
      if (entry === "_context.json" || !entry.endsWith(".json")) continue;
      const agentId = entry.slice(0, -5); // strip .json
      try {
        const raw = await fs.readFile(path.join(this.dir, entry), "utf-8");
        results.set(agentId, JSON.parse(raw) as Record<string, unknown>);
      } catch {
        // Skip corrupt files
      }
    }
    return results;
  }

  /** Delete this session's scratchpad directory. */
  async cleanup(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true });
  }

  /** Remove scratchpad directories older than maxAgeMs (default 24h). Returns count removed. */
  static async cleanupStale(
    baseDir: string,
    maxAgeMs: number = DEFAULT_STALE_AGE_MS,
  ): Promise<number> {
    const scratchpadRoot = path.join(baseDir, ".scratchpad");
    let entries: string[];
    try {
      entries = await fs.readdir(scratchpadRoot);
    } catch {
      return 0;
    }

    const now = Date.now();
    let removed = 0;

    for (const entry of entries) {
      const sessionDir = path.join(scratchpadRoot, entry);
      try {
        const stat = await fs.stat(sessionDir);
        if (!stat.isDirectory()) continue;
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.rm(sessionDir, { recursive: true, force: true });
          removed++;
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    return removed;
  }
}

/** Sanitize an ID for use as a filename — allow alphanumeric, dash, underscore. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}
