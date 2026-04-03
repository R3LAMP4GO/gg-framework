import fs from "node:fs/promises";
import path from "node:path";
import { parseMemoryType, type MemoryType } from "./types.js";

export interface MemoryHeader {
  filename: string;
  filePath: string;
  mtimeMs: number;
  description: string | null;
  type: MemoryType | undefined;
}

const MAX_MEMORY_FILES = 200;
const FRONTMATTER_MAX_BYTES = 2048;

/**
 * Parse YAML-like frontmatter from a markdown file's first bytes.
 * Returns extracted key-value pairs. Lightweight — no YAML parser dependency.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content.startsWith("---")) return result;

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return result;

  const block = content.slice(3, endIdx);
  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && val) result[key] = val;
  }
  return result;
}

/**
 * Scan a memory directory for .md files, read their frontmatter, and return
 * a header list sorted newest-first (capped at MAX_MEMORY_FILES).
 */
export async function scanMemoryFiles(memoryDir: string): Promise<MemoryHeader[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(memoryDir);
  } catch {
    return [];
  }

  const mdFiles = entries.filter((f) => f.endsWith(".md") && f !== "MEMORY.md");

  const headerResults = await Promise.allSettled(
    mdFiles.map(async (filename): Promise<MemoryHeader> => {
      const filePath = path.join(memoryDir, filename);
      const stat = await fs.stat(filePath);
      // Read only the frontmatter portion (first ~2KB)
      const fd = await fs.open(filePath, "r");
      const buf = Buffer.alloc(FRONTMATTER_MAX_BYTES);
      const { bytesRead } = await fd.read(buf, 0, FRONTMATTER_MAX_BYTES, 0);
      await fd.close();
      const content = buf.toString("utf-8", 0, bytesRead);
      const fm = parseFrontmatter(content);

      return {
        filename,
        filePath,
        mtimeMs: stat.mtimeMs,
        description: fm.description || null,
        type: parseMemoryType(fm.type),
      };
    }),
  );

  return headerResults
    .filter((r): r is PromiseFulfilledResult<MemoryHeader> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_MEMORY_FILES);
}

/**
 * Format memory headers as a text manifest for prompts.
 * One line per file: `- [type] filename (timestamp): description`
 */
export function formatMemoryManifest(memories: MemoryHeader[]): string {
  return memories
    .map((m) => {
      const tag = m.type ? `[${m.type}] ` : "";
      const ts = new Date(m.mtimeMs).toISOString().split("T")[0];
      return m.description
        ? `- ${tag}${m.filename} (${ts}): ${m.description}`
        : `- ${tag}${m.filename} (${ts})`;
    })
    .join("\n");
}
