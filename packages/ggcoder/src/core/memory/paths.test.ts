import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAutoMemPath, isAutoMemPath, ensureMemoryDirExists, clearMemPathCache } from "./paths.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mem-paths-test-"));
  clearMemPathCache();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  clearMemPathCache();
});

describe("getAutoMemPath", () => {
  it("returns a path containing 'memory'", async () => {
    const memPath = await getAutoMemPath(tmpDir);
    expect(memPath).toContain("memory");
    expect(memPath).toContain("projects");
  });

  it("returns consistent path for same cwd", async () => {
    const p1 = await getAutoMemPath(tmpDir);
    const p2 = await getAutoMemPath(tmpDir);
    expect(p1).toBe(p2);
  });

  it("ends with path separator", async () => {
    const memPath = await getAutoMemPath(tmpDir);
    expect(memPath.endsWith(path.sep)).toBe(true);
  });
});

describe("isAutoMemPath", () => {
  it("returns true for paths inside memory dir", async () => {
    const memPath = await getAutoMemPath(tmpDir);
    const filePath = path.join(memPath, "user_role.md");
    expect(await isAutoMemPath(filePath, tmpDir)).toBe(true);
  });

  it("returns false for paths outside memory dir", async () => {
    expect(await isAutoMemPath("/tmp/random/file.md", tmpDir)).toBe(false);
  });
});

describe("ensureMemoryDirExists", () => {
  it("creates the memory directory", async () => {
    const memPath = await ensureMemoryDirExists(tmpDir);
    const stat = await fs.stat(memPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent", async () => {
    await ensureMemoryDirExists(tmpDir);
    await ensureMemoryDirExists(tmpDir); // second call should not throw
  });
});
