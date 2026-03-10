import { describe, it, expect } from "vitest";
import { extractEmbedded } from "./slash-commands.js";

const KNOWN = new Set(["scan", "verify", "research", "init", "fix", "commit", "test", "update"]);

describe("extractEmbedded", () => {
  it("returns null for input starting with /", () => {
    expect(extractEmbedded("/scan the code", KNOWN)).toBeNull();
  });

  it("returns null for plain text with no commands", () => {
    expect(extractEmbedded("just a normal message", KNOWN)).toBeNull();
  });

  it("extracts command at end of input", () => {
    const result = extractEmbedded("fix the auth flow /scan", KNOWN);
    expect(result).toEqual({
      command: "scan",
      args: "fix the auth flow",
      raw: "/scan",
    });
  });

  it("extracts command in the middle of input", () => {
    const result = extractEmbedded("please /verify the login module carefully", KNOWN);
    expect(result).toEqual({
      command: "verify",
      args: "please the login module carefully",
      raw: "/verify",
    });
  });

  it("ignores unknown commands", () => {
    expect(extractEmbedded("run /foobar on this", KNOWN)).toBeNull();
  });

  it("ignores commands inside URLs", () => {
    // The regex requires whitespace before the slash, so /scan inside a URL won't match
    expect(extractEmbedded("check https://example.com/scan for issues", KNOWN)).toBeNull();
  });

  it("picks the first matching command when multiple present", () => {
    const result = extractEmbedded("do /scan and /verify", KNOWN);
    expect(result?.command).toBe("scan");
  });

  it("handles command with no surrounding text", () => {
    // Input starts with /, so existing parser handles it
    expect(extractEmbedded("/research", KNOWN)).toBeNull();
  });

  it("trims extra whitespace from args", () => {
    const result = extractEmbedded("  check this   /scan  ", KNOWN);
    expect(result).toEqual({
      command: "scan",
      args: "check this",
      raw: "/scan",
    });
  });

  it("returns null for empty known names set", () => {
    expect(extractEmbedded("run /scan now", new Set())).toBeNull();
  });

  it("handles command with hyphenated name", () => {
    const withHyphen = new Set(["setup-lint"]);
    const result = extractEmbedded("please /setup-lint this project", withHyphen);
    expect(result).toEqual({
      command: "setup-lint",
      args: "please this project",
      raw: "/setup-lint",
    });
  });

  it("matches commands case-insensitively", () => {
    const result = extractEmbedded("fix auth /SCAN", KNOWN);
    expect(result).toEqual({
      command: "scan",
      args: "fix auth",
      raw: "/SCAN",
    });
  });

  it("matches mixed-case commands", () => {
    const result = extractEmbedded("please /Verify the code", KNOWN);
    expect(result).toEqual({
      command: "verify",
      args: "please the code",
      raw: "/Verify",
    });
  });
});
