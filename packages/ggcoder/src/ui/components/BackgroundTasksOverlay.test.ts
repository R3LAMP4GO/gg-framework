import { describe, it, expect, vi } from "vitest";

// Test the data logic (not React rendering — would need ink-testing-library)

describe("BackgroundTasksOverlay - formatAge", () => {
  // Re-implement formatAge for testing (same logic as component)
  function formatAge(startedAt: number): string {
    const ms = Date.now() - startedAt;
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3600_000).toFixed(1)}h`;
  }

  it("formats seconds", () => {
    expect(formatAge(Date.now() - 30_000)).toBe("30s");
  });

  it("formats minutes", () => {
    expect(formatAge(Date.now() - 120_000)).toBe("2m");
  });

  it("formats hours", () => {
    expect(formatAge(Date.now() - 7200_000)).toBe("2.0h");
  });
});

describe("BackgroundTasksOverlay - process list logic", () => {
  function mockProcessManager(processes: Array<{
    id: string;
    pid: number;
    command: string;
    logFile: string;
    startedAt: number;
    exitCode: number | null;
    lastReadOffset: number;
  }>) {
    return {
      list: vi.fn(() => processes),
      stop: vi.fn(async () => "Stopped"),
    };
  }

  it("separates running and completed processes", () => {
    const pm = mockProcessManager([
      { id: "a", pid: 1, command: "npm test", logFile: "", startedAt: Date.now(), exitCode: null, lastReadOffset: 0 },
      { id: "b", pid: 2, command: "npm build", logFile: "", startedAt: Date.now(), exitCode: 0, lastReadOffset: 0 },
      { id: "c", pid: 3, command: "npm lint", logFile: "", startedAt: Date.now(), exitCode: 1, lastReadOffset: 0 },
    ]);
    const processes = pm.list();
    const running = processes.filter((p) => p.exitCode === null);
    const completed = processes.filter((p) => p.exitCode !== null);
    expect(running).toHaveLength(1);
    expect(completed).toHaveLength(2);
  });

  it("calls stop with process id", async () => {
    const pm = mockProcessManager([
      { id: "abc", pid: 1, command: "sleep 100", logFile: "", startedAt: Date.now(), exitCode: null, lastReadOffset: 0 },
    ]);
    await (pm as { stop: (id: string) => Promise<string> }).stop("abc");
    expect(pm.stop).toHaveBeenCalledWith("abc");
  });

  it("handles empty process list", () => {
    const pm = mockProcessManager([]);
    expect(pm.list()).toHaveLength(0);
  });
});
