import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { isProtectedPath, getProtectionReason } from "./protected-paths.js";

const cwd = "/projects/myapp";

describe("isProtectedPath", () => {
  describe("blocks protected paths", () => {
    it("blocks .git/config", () => {
      expect(isProtectedPath(".git/config", cwd)).toBe(true);
    });

    it("blocks .git/hooks/pre-commit", () => {
      expect(isProtectedPath(".git/hooks/pre-commit", cwd)).toBe(true);
    });

    it("blocks .env", () => {
      expect(isProtectedPath(".env", cwd)).toBe(true);
    });

    it("blocks .env.local", () => {
      expect(isProtectedPath(".env.local", cwd)).toBe(true);
    });

    it("blocks .env.production", () => {
      expect(isProtectedPath(".env.production", cwd)).toBe(true);
    });

    it("blocks ~/.ssh/id_rsa", () => {
      const sshPath = path.join(os.homedir(), ".ssh", "id_rsa");
      expect(isProtectedPath(sshPath, cwd)).toBe(true);
    });

    it("blocks ~/.gg/auth.json", () => {
      const authPath = path.join(os.homedir(), ".gg", "auth.json");
      expect(isProtectedPath(authPath, cwd)).toBe(true);
    });
  });

  describe("allows normal files", () => {
    it("allows src/index.ts", () => {
      expect(isProtectedPath("src/index.ts", cwd)).toBe(false);
    });

    it("allows package.json", () => {
      expect(isProtectedPath("package.json", cwd)).toBe(false);
    });

    it("allows README.md", () => {
      expect(isProtectedPath("README.md", cwd)).toBe(false);
    });

    it("allows nested project files", () => {
      expect(isProtectedPath("src/components/App.tsx", cwd)).toBe(false);
    });
  });

  describe("handles path traversal", () => {
    it("resolves .. before checking", () => {
      // Trying to escape via traversal to reach .git
      expect(isProtectedPath("src/../../.git/config", cwd)).toBe(true);
    });
  });
});

describe("getProtectionReason", () => {
  it("returns reason for .git paths", () => {
    expect(getProtectionReason(".git/config", cwd)).toContain("Git internals");
  });

  it("returns reason for .env", () => {
    expect(getProtectionReason(".env", cwd)).toContain("secrets");
  });

  it("returns reason for SSH paths", () => {
    const sshPath = path.join(os.homedir(), ".ssh", "id_rsa");
    expect(getProtectionReason(sshPath, cwd)).toContain("SSH");
  });
});
