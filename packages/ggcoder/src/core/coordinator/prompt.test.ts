import { describe, it, expect, afterEach } from "vitest";
import { buildCoordinatorPrompt, isCoordinatorMode } from "./prompt.js";

describe("buildCoordinatorPrompt", () => {
  it("includes coordinator mode header", () => {
    const prompt = buildCoordinatorPrompt();
    expect(prompt).toContain("Coordinator Mode (ACTIVE)");
  });

  it("includes workflow phases", () => {
    const prompt = buildCoordinatorPrompt();
    expect(prompt).toContain("Phase 1");
    expect(prompt).toContain("Research");
    expect(prompt).toContain("Phase 2");
    expect(prompt).toContain("Synthesis");
    expect(prompt).toContain("Phase 3");
    expect(prompt).toContain("Implementation");
    expect(prompt).toContain("Phase 4");
    expect(prompt).toContain("Verification");
  });

  it("includes key rules", () => {
    const prompt = buildCoordinatorPrompt();
    expect(prompt).toContain("Never fabricate results");
    expect(prompt).toContain("Workers are async");
    expect(prompt).toContain("Do not use one worker to check on another");
  });

  it("restricts direct mutation tools", () => {
    const prompt = buildCoordinatorPrompt();
    expect(prompt).toContain("Do NOT use: write, edit, bash");
  });

  it("recommends subagent as primary tool", () => {
    const prompt = buildCoordinatorPrompt();
    expect(prompt).toContain("subagent");
    expect(prompt).toContain("primary tool");
  });
});

describe("isCoordinatorMode", () => {
  const original = process.env.GG_COORDINATOR_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GG_COORDINATOR_MODE;
    } else {
      process.env.GG_COORDINATOR_MODE = original;
    }
  });

  it("returns false by default", () => {
    delete process.env.GG_COORDINATOR_MODE;
    expect(isCoordinatorMode()).toBe(false);
  });

  it('returns true when env is "1"', () => {
    process.env.GG_COORDINATOR_MODE = "1";
    expect(isCoordinatorMode()).toBe(true);
  });

  it('returns true when env is "true"', () => {
    process.env.GG_COORDINATOR_MODE = "true";
    expect(isCoordinatorMode()).toBe(true);
  });

  it('returns false when env is "0"', () => {
    process.env.GG_COORDINATOR_MODE = "0";
    expect(isCoordinatorMode()).toBe(false);
  });
});
