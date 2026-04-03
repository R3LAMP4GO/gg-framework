import { describe, it, expect } from "vitest";
import { parseMemoryType, MEMORY_TYPES } from "./types.js";

describe("MEMORY_TYPES", () => {
  it("contains exactly 4 types", () => {
    expect(MEMORY_TYPES).toHaveLength(4);
    expect(MEMORY_TYPES).toContain("user");
    expect(MEMORY_TYPES).toContain("feedback");
    expect(MEMORY_TYPES).toContain("project");
    expect(MEMORY_TYPES).toContain("reference");
  });
});

describe("parseMemoryType", () => {
  it("returns correct type for valid strings", () => {
    expect(parseMemoryType("user")).toBe("user");
    expect(parseMemoryType("feedback")).toBe("feedback");
    expect(parseMemoryType("project")).toBe("project");
    expect(parseMemoryType("reference")).toBe("reference");
  });

  it("returns undefined for invalid strings", () => {
    expect(parseMemoryType("invalid")).toBeUndefined();
    expect(parseMemoryType("")).toBeUndefined();
    expect(parseMemoryType("User")).toBeUndefined(); // case-sensitive
  });

  it("returns undefined for non-string values", () => {
    expect(parseMemoryType(undefined)).toBeUndefined();
    expect(parseMemoryType(null)).toBeUndefined();
    expect(parseMemoryType(42)).toBeUndefined();
    expect(parseMemoryType({})).toBeUndefined();
  });
});
