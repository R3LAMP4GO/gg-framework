/**
 * Protected paths — prevents writes to sensitive files/directories.
 */

import path from "node:path";
import os from "node:os";

/** Path patterns that should never be written by the agent */
const PROTECTED_PATTERNS = [
  ".git/",         // Git internals (config, hooks, objects)
  ".env",          // Environment secrets
  ".env.local",
  ".env.production",
];

/** Absolute paths that should never be written */
function getProtectedAbsolutePaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".ssh"),
    path.join(home, ".gg", "auth.json"),
    path.join(home, ".gnupg"),
    path.join(home, ".npmrc"),     // npm tokens
    path.join(home, ".pypirc"),    // PyPI tokens
  ];
}

/**
 * Check if a file path is protected from agent writes.
 * Resolves relative paths and traversal (..) before checking.
 */
export function isProtectedPath(filePath: string, cwd: string): boolean {
  // Resolve to absolute, eliminating .. traversal
  const resolved = path.resolve(cwd, filePath);

  // Check absolute protected paths
  for (const protectedPath of getProtectedAbsolutePaths()) {
    if (resolved === protectedPath || resolved.startsWith(protectedPath + path.sep)) {
      return true;
    }
  }

  // Check pattern-based protection (relative to cwd)
  const relative = path.relative(cwd, resolved);
  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.endsWith("/")) {
      // Directory pattern — check if path is inside
      if (relative.startsWith(pattern) || relative.includes(`/${pattern}`)) {
        return true;
      }
    } else {
      // Exact file pattern
      const basename = path.basename(resolved);
      if (basename === pattern) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get a human-readable reason why a path is protected.
 */
export function getProtectionReason(filePath: string, cwd: string): string {
  const resolved = path.resolve(cwd, filePath);
  const relative = path.relative(cwd, resolved);

  if (relative.startsWith(".git/")) return "Git internals — modifying .git/ can corrupt the repository";
  if (path.basename(resolved).startsWith(".env")) return "Environment file — may contain secrets";
  if (resolved.includes(".ssh")) return "SSH directory — contains authentication keys";
  if (resolved.includes("auth.json")) return "Auth credentials file";
  if (resolved.includes(".gnupg")) return "GPG keyring — contains encryption keys";
  if (resolved.includes(".npmrc")) return "npm config — may contain auth tokens";
  if (resolved.includes(".pypirc")) return "PyPI config — may contain auth tokens";
  return "Protected path";
}
