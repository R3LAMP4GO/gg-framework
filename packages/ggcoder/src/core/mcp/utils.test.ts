import { describe, it, expect } from "vitest";
import { ensureConfigScope, getScopeLabel, truncateDescription, MAX_MCP_DESCRIPTION_LENGTH } from "./utils.js";

describe("ensureConfigScope", () => {
  it("returns valid scopes", () => {
    expect(ensureConfigScope("project")).toBe("project");
    expect(ensureConfigScope("local")).toBe("local");
    expect(ensureConfigScope("user")).toBe("user");
  });

  it("defaults to user when undefined", () => {
    expect(ensureConfigScope(undefined)).toBe("user");
  });

  it("throws on invalid scope", () => {
    expect(() => ensureConfigScope("global")).toThrow('Invalid scope "global"');
    expect(() => ensureConfigScope("")).toThrow();
  });
});

describe("getScopeLabel", () => {
  it("returns human-readable labels", () => {
    expect(getScopeLabel("project")).toContain(".mcp.json");
    expect(getScopeLabel("local")).toContain("settings.local");
    expect(getScopeLabel("user")).toContain("~/.gg");
  });
});

describe("truncateDescription", () => {
  it("passes through short text unchanged", () => {
    expect(truncateDescription("hello")).toBe("hello");
  });

  it("truncates text exceeding max length", () => {
    const long = "a".repeat(3000);
    const result = truncateDescription(long);
    expect(result.length).toBeLessThanOrEqual(MAX_MCP_DESCRIPTION_LENGTH);
    expect(result).toContain("truncated");
  });

  it("respects custom max length", () => {
    const result = truncateDescription("a".repeat(100), 50);
    expect(result.length).toBeLessThanOrEqual(50);
  });
});
