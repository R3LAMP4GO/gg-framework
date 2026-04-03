import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { getAppPaths } from "../../config.js";

/**
 * Sanitize a path for use as a directory name.
 * Replaces path separators and special chars with underscores.
 */
function sanitizePath(p: string): string {
  return p.replace(/^\//, "").replace(/[/\\:*?"<>|]/g, "-");
}

/**
 * Find the canonical git root for a path. Returns undefined if not in a git repo.
 * This ensures worktrees of the same repo share one memory directory.
 */
function findCanonicalGitRoot(cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--show-toplevel"], { cwd }, (err, stdout) => {
      if (err) {
        resolve(undefined);
        return;
      }
      resolve(stdout.trim() || undefined);
    });
  });
}

/** Cached result to avoid repeated git calls within a session. */
let cachedMemPath: string | undefined;
let cachedForCwd: string | undefined;

/**
 * Returns the auto-memory directory path for the current project.
 * Uses git root when available so worktrees share memory.
 *
 * Shape: ~/.gg/projects/<sanitized-project-root>/memory/
 */
export async function getAutoMemPath(cwd: string): Promise<string> {
  if (cachedMemPath && cachedForCwd === cwd) return cachedMemPath;

  const projectRoot = (await findCanonicalGitRoot(cwd)) ?? cwd;
  const projectsDir = path.join(getAppPaths().agentDir, "projects");
  const memPath = path.join(projectsDir, sanitizePath(projectRoot), "memory") + path.sep;

  cachedMemPath = memPath;
  cachedForCwd = cwd;
  return memPath;
}

/** Returns the MEMORY.md entrypoint path inside the memory directory. */
export async function getAutoMemEntrypoint(cwd: string): Promise<string> {
  return path.join(await getAutoMemPath(cwd), "MEMORY.md");
}

/** Check if an absolute path is within the auto-memory directory. */
export async function isAutoMemPath(absolutePath: string, cwd: string): Promise<boolean> {
  const memPath = await getAutoMemPath(cwd);
  return path.normalize(absolutePath).startsWith(memPath);
}

/** Create the memory directory if it doesn't exist. */
export async function ensureMemoryDirExists(cwd: string): Promise<string> {
  const memPath = await getAutoMemPath(cwd);
  await fs.mkdir(memPath, { recursive: true });
  return memPath;
}

/** Clear the cached memory path (for testing). */
export function clearMemPathCache(): void {
  cachedMemPath = undefined;
  cachedForCwd = undefined;
}
