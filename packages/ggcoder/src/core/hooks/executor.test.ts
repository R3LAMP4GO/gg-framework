import { describe, it, expect } from "vitest";
import { executeCommandHook } from "./executor.js";
import type { HookContext } from "./types.js";
import os from "node:os";

const ctx: HookContext = { cwd: os.tmpdir() };

describe("executeCommandHook", () => {
  it("executes shell command and parses JSON stdout", async () => {
    const result = await executeCommandHook(
      { type: "command", command: 'echo \'{"ok":true,"message":"hello"}\'' },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe("hello");
  });

  it("treats non-JSON stdout as ok=true with message", async () => {
    const result = await executeCommandHook(
      { type: "command", command: "echo 'just text'" },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe("just text");
  });

  it("returns ok=false on command failure", async () => {
    const result = await executeCommandHook(
      { type: "command", command: "exit 1" },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it("replaces $TOOL_NAME placeholder", async () => {
    const result = await executeCommandHook(
      { type: "command", command: 'echo $TOOL_NAME' },
      { ...ctx, toolName: "edit" },
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe("edit");
  });

  it("replaces $TOOL_INPUT placeholder with JSON", async () => {
    const result = await executeCommandHook(
      { type: "command", command: 'echo $TOOL_INPUT' },
      { ...ctx, toolInput: { file: "test.ts" } },
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain("test.ts");
  });

  it("returns ok=true for empty stdout", async () => {
    const result = await executeCommandHook(
      { type: "command", command: "true" },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it("parses block field from JSON", async () => {
    const result = await executeCommandHook(
      { type: "command", command: 'echo \'{"ok":false,"block":true,"message":"denied"}\'' },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.block).toBe(true);
    expect(result.message).toBe("denied");
  });

  it("respects timeout", async () => {
    const result = await executeCommandHook(
      { type: "command", command: "sleep 30", timeout: 500 },
      ctx,
    );
    expect(result.ok).toBe(false);
    // Should fail due to timeout, not hang
  }, 10_000);
});

describe("executeHttpHook", () => {
  it("blocks private IP addresses (SSRF guard)", async () => {
    const { executeHttpHook } = await import("./executor.js");
    const result = await executeHttpHook(
      { type: "http", url: "http://10.0.0.1:8080/hook" },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("private IP");
  });

  it("blocks 192.168.x.x addresses", async () => {
    const { executeHttpHook } = await import("./executor.js");
    const result = await executeHttpHook(
      { type: "http", url: "http://192.168.1.1/hook" },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("private IP");
  });

  it("allows localhost for local dev", async () => {
    const { executeHttpHook } = await import("./executor.js");
    // This will fail to connect (no server) but should NOT be blocked by SSRF
    const result = await executeHttpHook(
      { type: "http", url: "http://localhost:99999/hook", timeout: 1000 },
      ctx,
    );
    // Should fail with connection error, NOT with SSRF block
    expect(result.message).not.toContain("private IP");
  });
});
