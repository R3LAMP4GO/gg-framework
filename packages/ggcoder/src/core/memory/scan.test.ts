import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanMemoryFiles, formatMemoryManifest } from "./scan.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mem-scan-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeMemFile(name: string, frontmatter: Record<string, string>, body = "") {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const content = `---\n${fm}\n---\n\n${body}`;
  await fs.writeFile(path.join(tmpDir, name), content, "utf-8");
}

describe("scanMemoryFiles", () => {
  it("reads frontmatter from .md files", async () => {
    await writeMemFile("user_role.md", {
      name: "User Role",
      description: "Data scientist focused on observability",
      type: "user",
    });

    const headers = await scanMemoryFiles(tmpDir);
    expect(headers).toHaveLength(1);
    expect(headers[0].filename).toBe("user_role.md");
    expect(headers[0].description).toBe("Data scientist focused on observability");
    expect(headers[0].type).toBe("user");
  });

  it("excludes MEMORY.md", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "# Index\n");
    await writeMemFile("note.md", { name: "Note", type: "project" });

    const headers = await scanMemoryFiles(tmpDir);
    expect(headers).toHaveLength(1);
    expect(headers[0].filename).toBe("note.md");
  });

  it("sorts newest first", async () => {
    await writeMemFile("old.md", { name: "Old" });
    // Wait a tiny bit so mtimes differ
    await new Promise((r) => setTimeout(r, 50));
    await writeMemFile("new.md", { name: "New" });

    const headers = await scanMemoryFiles(tmpDir);
    expect(headers[0].filename).toBe("new.md");
  });

  it("handles missing/corrupt frontmatter gracefully", async () => {
    await fs.writeFile(path.join(tmpDir, "no_fm.md"), "Just text, no frontmatter");

    const headers = await scanMemoryFiles(tmpDir);
    expect(headers).toHaveLength(1);
    expect(headers[0].description).toBeNull();
    expect(headers[0].type).toBeUndefined();
  });

  it("returns empty for nonexistent directory", async () => {
    const headers = await scanMemoryFiles("/nonexistent/path");
    expect(headers).toHaveLength(0);
  });

  it("caps at 200 files", async () => {
    // Create 205 files
    await Promise.all(
      Array.from({ length: 205 }, (_, i) =>
        writeMemFile(`mem_${String(i).padStart(3, "0")}.md`, { name: `Memory ${i}` }),
      ),
    );

    const headers = await scanMemoryFiles(tmpDir);
    expect(headers).toHaveLength(200);
  });
});

describe("formatMemoryManifest", () => {
  it("formats headers as one-line entries", () => {
    const headers = [
      {
        filename: "user_role.md",
        filePath: "/tmp/user_role.md",
        mtimeMs: new Date("2026-03-15").getTime(),
        description: "Data scientist",
        type: "user" as const,
      },
    ];
    const manifest = formatMemoryManifest(headers);
    expect(manifest).toContain("[user]");
    expect(manifest).toContain("user_role.md");
    expect(manifest).toContain("Data scientist");
    expect(manifest).toContain("2026-03-15");
  });

  it("handles entries without description", () => {
    const headers = [
      {
        filename: "note.md",
        filePath: "/tmp/note.md",
        mtimeMs: Date.now(),
        description: null,
        type: undefined,
      },
    ];
    const manifest = formatMemoryManifest(headers);
    expect(manifest).toContain("note.md");
    expect(manifest).not.toContain("null");
  });
});
