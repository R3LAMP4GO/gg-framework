import { describe, it, expect } from "vitest";
import { VerificationTracker, buildVerificationPrompt, parseVerdict } from "./verification-agent.js";

describe("VerificationTracker", () => {
  it("tracks edited files", () => {
    const tracker = new VerificationTracker();
    tracker.trackEdit("/src/a.ts");
    tracker.trackEdit("/src/b.ts");
    expect(tracker.editCount).toBe(2);
  });

  it("deduplicates same file", () => {
    const tracker = new VerificationTracker();
    tracker.trackEdit("/src/a.ts");
    tracker.trackEdit("/src/a.ts");
    expect(tracker.editCount).toBe(1);
  });

  it("shouldVerify returns false below threshold", () => {
    const tracker = new VerificationTracker();
    tracker.trackEdit("/src/a.ts");
    tracker.trackEdit("/src/b.ts");
    expect(tracker.shouldVerify()).toBe(false);
  });

  it("shouldVerify returns true at threshold (3 files)", () => {
    const tracker = new VerificationTracker();
    tracker.trackEdit("/src/a.ts");
    tracker.trackEdit("/src/b.ts");
    tracker.trackEdit("/src/c.ts");
    expect(tracker.shouldVerify()).toBe(true);
  });

  it("reset clears state", () => {
    const tracker = new VerificationTracker();
    tracker.trackEdit("/src/a.ts");
    tracker.trackEdit("/src/b.ts");
    tracker.trackEdit("/src/c.ts");
    tracker.reset();
    expect(tracker.editCount).toBe(0);
    expect(tracker.shouldVerify()).toBe(false);
  });

  it("getEditedFiles returns list", () => {
    const tracker = new VerificationTracker();
    tracker.trackEdit("/a.ts");
    tracker.trackEdit("/b.ts");
    expect(tracker.getEditedFiles()).toEqual(["/a.ts", "/b.ts"]);
  });
});

describe("buildVerificationPrompt", () => {
  it("includes task description", () => {
    const prompt = buildVerificationPrompt("Add auth middleware", ["/src/auth.ts"]);
    expect(prompt).toContain("Add auth middleware");
  });

  it("includes edited files", () => {
    const prompt = buildVerificationPrompt("task", ["/a.ts", "/b.ts"]);
    expect(prompt).toContain("/a.ts");
    expect(prompt).toContain("/b.ts");
  });

  it("includes verdict instructions", () => {
    const prompt = buildVerificationPrompt("task", ["/a.ts"]);
    expect(prompt).toContain("VERDICT: PASS");
    expect(prompt).toContain("VERDICT: FAIL");
    expect(prompt).toContain("VERDICT: PARTIAL");
  });

  it("includes adversarial probe requirement", () => {
    const prompt = buildVerificationPrompt("task", ["/a.ts"]);
    expect(prompt).toContain("adversarial");
  });

  it("includes read-only constraint", () => {
    const prompt = buildVerificationPrompt("task", ["/a.ts"]);
    expect(prompt).toContain("READ-ONLY");
  });
});

describe("parseVerdict", () => {
  it("parses PASS", () => {
    expect(parseVerdict("All checks passed.\nVERDICT: PASS")).toBe("PASS");
  });

  it("parses FAIL", () => {
    expect(parseVerdict("Found issues.\nVERDICT: FAIL")).toBe("FAIL");
  });

  it("parses PARTIAL", () => {
    expect(parseVerdict("Could not run server.\nVERDICT: PARTIAL")).toBe("PARTIAL");
  });

  it("returns PARTIAL for missing verdict", () => {
    expect(parseVerdict("No verdict here")).toBe("PARTIAL");
  });

  it("case insensitive", () => {
    expect(parseVerdict("verdict: pass")).toBe("PASS");
  });
});
