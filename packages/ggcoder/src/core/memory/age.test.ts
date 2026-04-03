import { describe, it, expect } from "vitest";
import { memoryAgeDays, memoryAge, memoryFreshnessText } from "./age.js";

describe("memoryAgeDays", () => {
  it("returns 0 for today", () => {
    expect(memoryAgeDays(Date.now())).toBe(0);
    expect(memoryAgeDays(Date.now() - 3600_000)).toBe(0); // 1 hour ago
  });

  it("returns 1 for yesterday", () => {
    expect(memoryAgeDays(Date.now() - 86_400_000 - 1000)).toBe(1);
  });

  it("returns correct days for older", () => {
    expect(memoryAgeDays(Date.now() - 86_400_000 * 7)).toBe(7);
  });

  it("clamps negative (future) to 0", () => {
    expect(memoryAgeDays(Date.now() + 86_400_000)).toBe(0);
  });
});

describe("memoryAge", () => {
  it("returns 'today' for recent", () => {
    expect(memoryAge(Date.now())).toBe("today");
  });

  it("returns 'yesterday' for 1 day ago", () => {
    expect(memoryAge(Date.now() - 86_400_000 - 1000)).toBe("yesterday");
  });

  it("returns 'N days ago' for older", () => {
    expect(memoryAge(Date.now() - 86_400_000 * 5)).toBe("5 days ago");
  });
});

describe("memoryFreshnessText", () => {
  it("returns empty for fresh memories (today/yesterday)", () => {
    expect(memoryFreshnessText(Date.now())).toBe("");
    expect(memoryFreshnessText(Date.now() - 86_400_000)).toBe("");
  });

  it("returns warning for old memories", () => {
    const text = memoryFreshnessText(Date.now() - 86_400_000 * 10);
    expect(text).toContain("10 days old");
    expect(text).toContain("Verify against current code");
  });
});
