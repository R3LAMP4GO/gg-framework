import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readLastConsolidatedAt,
  tryAcquireLock,
  rollbackLock,
  countSessionsSince,
  buildConsolidationPrompt,
} from "./consolidate.js";
import { clearMemPathCache } from "./paths.js";

let tmpDir: string;
let memDir: string;
let sessDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "consolidate-test-"));
  memDir = path.join(tmpDir, "memory");
  sessDir = path.join(tmpDir, "sessions");
  await fs.mkdir(memDir, { recursive: true });
  await fs.mkdir(sessDir, { recursive: true });
  clearMemPathCache();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  clearMemPathCache();
});

describe("readLastConsolidatedAt", () => {
  it("returns 0 when no lock file", async () => {
    expect(await readLastConsolidatedAt(memDir)).toBe(0);
  });

  it("returns mtime when lock exists", async () => {
    const lockPath = path.join(memDir, ".consolidate-lock");
    await fs.writeFile(lockPath, String(process.pid));
    const stat = await fs.stat(lockPath);
    expect(await readLastConsolidatedAt(memDir)).toBeCloseTo(stat.mtimeMs, -2);
  });
});

describe("tryAcquireLock", () => {
  it("acquires when no lock exists", async () => {
    const prior = await tryAcquireLock(memDir);
    expect(prior).toBe(0);
    // Lock file should now exist with our PID
    const content = await fs.readFile(path.join(memDir, ".consolidate-lock"), "utf-8");
    expect(parseInt(content.trim())).toBe(process.pid);
  });

  it("acquires stale lock (dead PID)", async () => {
    // Write lock with a PID that doesn't exist
    await fs.writeFile(path.join(memDir, ".consolidate-lock"), "999999999");
    // Set mtime to 2 hours ago (stale)
    const twoHoursAgo = (Date.now() - 7200_000) / 1000;
    await fs.utimes(path.join(memDir, ".consolidate-lock"), twoHoursAgo, twoHoursAgo);

    const prior = await tryAcquireLock(memDir);
    expect(prior).not.toBeNull();
  });
});

describe("rollbackLock", () => {
  it("unlinks when priorMtime is 0", async () => {
    await fs.writeFile(path.join(memDir, ".consolidate-lock"), String(process.pid));
    await rollbackLock(memDir, 0);
    await expect(fs.stat(path.join(memDir, ".consolidate-lock"))).rejects.toThrow();
  });

  it("restores mtime on non-zero prior", async () => {
    const lockPath = path.join(memDir, ".consolidate-lock");
    await fs.writeFile(lockPath, String(process.pid));
    const priorMs = Date.now() - 86400_000; // 1 day ago
    await rollbackLock(memDir, priorMs);
    const stat = await fs.stat(lockPath);
    // mtime should be close to priorMs (within 2 seconds due to filesystem precision)
    expect(Math.abs(stat.mtimeMs - priorMs)).toBeLessThan(2000);
  });
});

describe("countSessionsSince", () => {
  it("counts session files modified after timestamp", async () => {
    // Create 3 session files
    await fs.writeFile(path.join(sessDir, "s1.jsonl"), "{}");
    await fs.writeFile(path.join(sessDir, "s2.jsonl"), "{}");
    await fs.writeFile(path.join(sessDir, "s3.jsonl"), "{}");

    // All should be newer than 1 hour ago
    const count = await countSessionsSince(sessDir, Date.now() - 3600_000);
    expect(count).toBe(3);
  });

  it("returns 0 for future timestamp", async () => {
    await fs.writeFile(path.join(sessDir, "s1.jsonl"), "{}");
    const count = await countSessionsSince(sessDir, Date.now() + 3600_000);
    expect(count).toBe(0);
  });

  it("ignores non-jsonl files", async () => {
    await fs.writeFile(path.join(sessDir, "readme.txt"), "hello");
    const count = await countSessionsSince(sessDir, 0);
    expect(count).toBe(0);
  });

  it("returns 0 for nonexistent directory", async () => {
    const count = await countSessionsSince("/nonexistent", 0);
    expect(count).toBe(0);
  });
});

describe("buildConsolidationPrompt", () => {
  it("includes 4 phases", () => {
    const prompt = buildConsolidationPrompt("/mem/", "/sessions/");
    expect(prompt).toContain("Phase 1");
    expect(prompt).toContain("Orient");
    expect(prompt).toContain("Phase 2");
    expect(prompt).toContain("Gather");
    expect(prompt).toContain("Phase 3");
    expect(prompt).toContain("Consolidate");
    expect(prompt).toContain("Phase 4");
    expect(prompt).toContain("Prune");
  });

  it("includes memory directory path", () => {
    const prompt = buildConsolidationPrompt("/my/memory/", "/sessions/");
    expect(prompt).toContain("/my/memory/");
  });

  it("includes transcript directory", () => {
    const prompt = buildConsolidationPrompt("/mem/", "/my/sessions/");
    expect(prompt).toContain("/my/sessions/");
  });

  it("includes MEMORY.md instructions", () => {
    const prompt = buildConsolidationPrompt("/mem/", "/sess/");
    expect(prompt).toContain("MEMORY.md");
    expect(prompt).toContain("200 lines");
  });
});
