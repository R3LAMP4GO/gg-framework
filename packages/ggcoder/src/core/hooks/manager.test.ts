import { describe, it, expect, vi, beforeEach } from "vitest";
import { HookManager } from "./manager.js";

// Mock settings manager
function mockSettings(hooks: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key: string) => (key === "hooks" ? hooks : undefined)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("HookManager", () => {
  let manager: HookManager;

  beforeEach(() => {
    manager = new HookManager();
  });

  describe("getMatchingHooks", () => {
    it("matches by tool name pattern", async () => {
      await manager.loadHooks(
        mockSettings({
          PostToolUse: [
            { matcher: "edit|write", hooks: [{ type: "command", command: "echo test" }] },
          ],
        }),
        "/tmp",
      );

      expect(manager.getMatchingHooks("PostToolUse", "edit")).toHaveLength(1);
      expect(manager.getMatchingHooks("PostToolUse", "write")).toHaveLength(1);
      expect(manager.getMatchingHooks("PostToolUse", "read")).toHaveLength(0);
    });

    it("empty matcher matches all tools", async () => {
      await manager.loadHooks(
        mockSettings({
          Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
        }),
        "/tmp",
      );

      expect(manager.getMatchingHooks("Stop")).toHaveLength(1);
      expect(manager.getMatchingHooks("Stop", "anything")).toHaveLength(1);
    });

    it("returns empty for non-matching event", async () => {
      await manager.loadHooks(
        mockSettings({
          PreToolUse: [
            { matcher: "bash", hooks: [{ type: "command", command: "echo pre" }] },
          ],
        }),
        "/tmp",
      );

      expect(manager.getMatchingHooks("PostToolUse", "bash")).toHaveLength(0);
    });

    it("case-insensitive matching", async () => {
      await manager.loadHooks(
        mockSettings({
          PreToolUse: [
            { matcher: "Edit", hooks: [{ type: "command", command: "echo test" }] },
          ],
        }),
        "/tmp",
      );

      expect(manager.getMatchingHooks("PreToolUse", "edit")).toHaveLength(1);
      expect(manager.getMatchingHooks("PreToolUse", "EDIT")).toHaveLength(1);
    });
  });

  describe("runHooks", () => {
    it("executes hooks sequentially", async () => {
      await manager.loadHooks(
        mockSettings({
          PostToolUse: [
            {
              matcher: "edit",
              hooks: [
                { type: "command", command: 'echo \'{"ok":true,"message":"first"}\'' },
                { type: "command", command: 'echo \'{"ok":true,"message":"second"}\'' },
              ],
            },
          ],
        }),
        "/tmp",
      );

      const results = await manager.runHooks("PostToolUse", { toolName: "edit", cwd: "/tmp" });
      expect(results).toHaveLength(2);
      expect(results[0].message).toBe("first");
      expect(results[1].message).toBe("second");
    });

    it("stops chain on block", async () => {
      await manager.loadHooks(
        mockSettings({
          PreToolUse: [
            {
              matcher: "bash",
              hooks: [
                { type: "command", command: 'echo \'{"ok":false,"block":true,"message":"blocked"}\'' },
                { type: "command", command: 'echo \'{"ok":true,"message":"should not run"}\'' },
              ],
            },
          ],
        }),
        "/tmp",
      );

      const results = await manager.runHooks("PreToolUse", { toolName: "bash", cwd: "/tmp" });
      expect(results).toHaveLength(1); // Second hook not executed
      expect(results[0].block).toBe(true);
    });

    it("returns empty for no matching hooks", async () => {
      await manager.loadHooks(mockSettings({}), "/tmp");
      const results = await manager.runHooks("Stop", { cwd: "/tmp" });
      expect(results).toHaveLength(0);
    });
  });
});
