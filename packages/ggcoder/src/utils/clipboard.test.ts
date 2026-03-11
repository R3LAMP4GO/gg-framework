import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock logger to prevent file writes in tests
vi.mock("../core/logger.js", () => ({
  log: vi.fn(),
}));

// Import after mocks
const { copyToClipboard } = await import("./clipboard.js");

function createMockProcess(exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  };
  proc.stdin = { write: vi.fn(), end: vi.fn() } as unknown as typeof proc.stdin;
  // Auto-emit close after a tick
  setTimeout(() => proc.emit("close", exitCode), 5);
  return proc;
}

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls pbcopy on macOS", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });

    mockSpawn.mockReturnValue(createMockProcess(0));

    await copyToClipboard("hello world");

    expect(mockSpawn).toHaveBeenCalledWith(
      "pbcopy",
      [],
      expect.objectContaining({ stdio: ["pipe", "ignore", "ignore"] }),
    );

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("pipes text to stdin", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });

    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc);

    await copyToClipboard("test text");

    expect(proc.stdin!.write).toHaveBeenCalledWith("test text");
    expect(proc.stdin!.end).toHaveBeenCalled();

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("throws on unsupported platform", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "freebsd" });

    await expect(copyToClipboard("test")).rejects.toThrow("Unsupported platform");

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("throws when command fails (non-zero exit)", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });

    mockSpawn.mockReturnValue(createMockProcess(1));

    await expect(copyToClipboard("test")).rejects.toThrow("Failed to copy");

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });
});
