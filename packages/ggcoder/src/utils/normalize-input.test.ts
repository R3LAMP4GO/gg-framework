import { describe, it, expect } from "vitest";
import {
  normalizeUserInput,
  shouldCreatePasteReference,
  truncateForDisplay,
  formatPasteRef,
  parsePasteReferences,
  parseImageReferences,
  PASTE_THRESHOLD,
  TRUNCATION_THRESHOLD,
} from "./normalize-input.js";

describe("normalizeUserInput", () => {
  it("strips ANSI escape codes", () => {
    // Bold + red + reset
    expect(normalizeUserInput("\x1b[1m\x1b[31mError\x1b[0m")).toBe("Error");
  });

  it("strips cursor movement sequences", () => {
    expect(normalizeUserInput("\x1b[2J\x1b[HHello")).toBe("Hello");
  });

  it("normalizes CRLF to LF", () => {
    expect(normalizeUserInput("line1\r\nline2\r\nline3")).toBe("line1\nline2\nline3");
  });

  it("normalizes CR to LF", () => {
    expect(normalizeUserInput("line1\rline2")).toBe("line1\nline2");
  });

  it("expands tabs to 4 spaces", () => {
    expect(normalizeUserInput("a\tb")).toBe("a    b");
  });

  it("removes control characters but preserves newlines", () => {
    expect(normalizeUserInput("hello\x00world\x07\n")).toBe("helloworld\n");
  });

  it("applies Unicode NFC normalization", () => {
    // e + combining acute accent → é (precomposed)
    const decomposed = "e\u0301";
    const result = normalizeUserInput(decomposed);
    expect(result).toBe("\u00e9");
  });

  it("passes clean text through unchanged", () => {
    expect(normalizeUserInput("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(normalizeUserInput("")).toBe("");
  });

  it("handles combined ANSI + CRLF + tabs + control chars", () => {
    const messy = "\x1b[32mgreen\x1b[0m\r\ntab\there\x00";
    expect(normalizeUserInput(messy)).toBe("green\ntab    here");
  });
});

describe("shouldCreatePasteReference", () => {
  it("returns false for short text", () => {
    expect(shouldCreatePasteReference("hello")).toBe(false);
  });

  it("returns true for text exceeding paste threshold", () => {
    const long = "a".repeat(PASTE_THRESHOLD + 1);
    expect(shouldCreatePasteReference(long)).toBe(true);
  });

  it("returns true for text with many lines", () => {
    const multiline = "line1\nline2\nline3";
    expect(shouldCreatePasteReference(multiline, 2)).toBe(true);
  });

  it("returns false for text within both limits", () => {
    expect(shouldCreatePasteReference("line1\nline2", 3)).toBe(false);
  });
});

describe("truncateForDisplay", () => {
  it("returns reference badge for text under truncation threshold", () => {
    const text = "a".repeat(900);
    const result = truncateForDisplay(text, 1);
    expect(result.display).toContain("Pasted text #1");
    expect(result.full).toBe(text);
    expect(result.lineCount).toBe(1);
  });

  it("truncates text exceeding threshold with head+tail", () => {
    const text = "a".repeat(TRUNCATION_THRESHOLD + 1000);
    const result = truncateForDisplay(text, 2);
    expect(result.display).toContain("Truncated text #2");
    expect(result.display.length).toBeLessThan(text.length);
    // Full text preserved
    expect(result.full).toBe(text);
    expect(result.full.length).toBe(TRUNCATION_THRESHOLD + 1000);
  });

  it("preserves line count", () => {
    const text = "line1\nline2\nline3\nline4\nline5";
    const result = truncateForDisplay(text, 1);
    expect(result.lineCount).toBe(5);
  });
});

describe("formatPasteRef", () => {
  it("formats badge with id, lines, and chars", () => {
    const ref = formatPasteRef(3, 15, 1200);
    expect(ref).toBe("[Pasted text #3 +15 lines, 1200 chars]");
  });
});

describe("parsePasteReferences", () => {
  it("extracts paste reference IDs", () => {
    const text = "before [Pasted text #1 +5 lines, 200 chars] after [Pasted text #2 +3 lines, 100 chars]";
    expect(parsePasteReferences(text)).toEqual([1, 2]);
  });

  it("extracts truncated reference IDs", () => {
    const text = "[...Truncated text #5 +100 lines...]";
    expect(parsePasteReferences(text)).toEqual([5]);
  });

  it("returns empty for no references", () => {
    expect(parsePasteReferences("just regular text")).toEqual([]);
  });
});

describe("parseImageReferences", () => {
  it("extracts image reference IDs", () => {
    const text = "See [Image #1] and [Image #2]";
    expect(parseImageReferences(text)).toEqual([1, 2]);
  });

  it("returns empty for no images", () => {
    expect(parseImageReferences("no images here")).toEqual([]);
  });
});
