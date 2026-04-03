import { describe, it, expect } from "vitest";
import {
  isReadOnlyBashCommand,
  hasMemoryWritesSince,
  countMessagesSince,
  buildExtractionPrompt,
} from "./extract.js";
import type { Message } from "@kenkaiiii/gg-ai";

function msg(role: "user" | "assistant" | "system", content: unknown, uuid?: string): Message {
  const m = { role, content } as Message;
  if (uuid) (m as unknown as Record<string, unknown>).uuid = uuid;
  return m;
}

describe("isReadOnlyBashCommand", () => {
  it("allows read-only commands", () => {
    expect(isReadOnlyBashCommand("ls -la")).toBe(true);
    expect(isReadOnlyBashCommand("find . -name '*.ts'")).toBe(true);
    expect(isReadOnlyBashCommand("grep -r 'import' src/")).toBe(true);
    expect(isReadOnlyBashCommand("cat file.ts")).toBe(true);
    expect(isReadOnlyBashCommand("wc -l file.ts")).toBe(true);
    expect(isReadOnlyBashCommand("head -20 file.ts")).toBe(true);
    expect(isReadOnlyBashCommand("tail -5 file.ts")).toBe(true);
    expect(isReadOnlyBashCommand("stat file.ts")).toBe(true);
  });

  it("blocks write commands", () => {
    expect(isReadOnlyBashCommand("rm -rf /")).toBe(false);
    expect(isReadOnlyBashCommand("echo 'hello' > file.txt")).toBe(false);
    expect(isReadOnlyBashCommand("npm install")).toBe(false);
    expect(isReadOnlyBashCommand("git push")).toBe(false);
    expect(isReadOnlyBashCommand("mkdir test")).toBe(false);
  });
});

describe("hasMemoryWritesSince", () => {
  it("detects write to memory dir", () => {
    const messages = [
      msg("user", "hello", "u1"),
      msg("assistant", [
        { type: "tool_use", id: "t1", name: "write", input: { file_path: "/mem/dir/note.md" } },
      ], "a1"),
    ];
    expect(hasMemoryWritesSince(messages, undefined, "/mem/dir/")).toBe(true);
  });

  it("returns false for writes outside memory dir", () => {
    const messages = [
      msg("assistant", [
        { type: "tool_use", id: "t1", name: "write", input: { file_path: "/src/file.ts" } },
      ], "a1"),
    ];
    expect(hasMemoryWritesSince(messages, undefined, "/mem/dir/")).toBe(false);
  });

  it("respects cursor — only checks after sinceUuid", () => {
    const messages = [
      msg("assistant", [
        { type: "tool_use", id: "t1", name: "write", input: { file_path: "/mem/dir/old.md" } },
      ], "a1"),
      msg("user", "new message", "u2"),
      msg("assistant", "just text", "a2"),
    ];
    // After u2, no memory writes
    expect(hasMemoryWritesSince(messages, "u2", "/mem/dir/")).toBe(false);
  });
});

describe("countMessagesSince", () => {
  it("counts all model-visible messages when no cursor", () => {
    const messages = [
      msg("system", "sys"),
      msg("user", "hello", "u1"),
      msg("assistant", "hi", "a1"),
      msg("user", "bye", "u2"),
    ];
    expect(countMessagesSince(messages, undefined)).toBe(3); // user + assistant + user
  });

  it("counts only messages after cursor", () => {
    const messages = [
      msg("user", "old", "u1"),
      msg("assistant", "old reply", "a1"),
      msg("user", "new", "u2"),
      msg("assistant", "new reply", "a2"),
    ];
    expect(countMessagesSince(messages, "a1")).toBe(2); // u2 + a2
  });
});

describe("buildExtractionPrompt", () => {
  it("includes message count", () => {
    const prompt = buildExtractionPrompt(5, "", "/mem/");
    expect(prompt).toContain("~5 messages");
  });

  it("includes existing memories manifest", () => {
    const manifest = "- [user] role.md: Data scientist";
    const prompt = buildExtractionPrompt(3, manifest, "/mem/");
    expect(prompt).toContain("Data scientist");
  });

  it("includes memory directory path", () => {
    const prompt = buildExtractionPrompt(3, "", "/home/.gg/memory/");
    expect(prompt).toContain("/home/.gg/memory/");
  });

  it("includes memory type taxonomy", () => {
    const prompt = buildExtractionPrompt(3, "", "/mem/");
    expect(prompt).toContain("user | feedback | project | reference");
  });

  it("includes what NOT to save", () => {
    const prompt = buildExtractionPrompt(3, "", "/mem/");
    expect(prompt).toContain("Do NOT save");
  });
});
