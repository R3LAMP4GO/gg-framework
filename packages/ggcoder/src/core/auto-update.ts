import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PACKAGE_NAME = "@kenkaiiii/ggcoder";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const FETCH_TIMEOUT_MS = 3000;

interface UpdateState {
  lastCheckedAt: number;
  lastSeenVersion?: string;
}

interface SyncState {
  lastSyncAt: number;
  lastResult: string;
  version?: string;
  conflictOriginHead?: string;
}

function getStateFilePath(): string {
  return path.join(os.homedir(), ".gg", "update-state.json");
}

function getSyncStateFilePath(): string {
  return path.join(os.homedir(), ".gg", "sync-state.json");
}

function readState(): UpdateState | null {
  try {
    const raw = fs.readFileSync(getStateFilePath(), "utf-8");
    return JSON.parse(raw) as UpdateState;
  } catch {
    return null;
  }
}

function readSyncState(): SyncState | null {
  try {
    const raw = fs.readFileSync(getSyncStateFilePath(), "utf-8");
    return JSON.parse(raw) as SyncState;
  } catch {
    return null;
  }
}

function writeState(state: UpdateState): void {
  try {
    const dir = path.dirname(getStateFilePath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getStateFilePath(), JSON.stringify(state));
  } catch {
    // Non-fatal
  }
}

function shouldCheck(): boolean {
  const state = readState();
  if (!state) return true;
  return Date.now() - state.lastCheckedAt > CHECK_INTERVAL_MS;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Detect whether ggcoder is running from an npm-linked local repo
 * (i.e. the binary resolves into the local git checkout, not node_modules).
 */
function isLinkedLocalRepo(): string | null {
  try {
    const scriptPath = (process.argv[1] ?? "").replace(/\\/g, "/");
    // The linked path looks like: /Users/.../ggcoder/packages/ggcoder/dist/cli.js
    const match = scriptPath.match(/^(.+\/ggcoder)\/packages\/ggcoder\/dist\/cli\.js$/);
    if (!match) return null;
    const repoRoot = match[1];
    // Verify it's actually a git repo with origin pointing at Ken's repo
    if (!fs.existsSync(path.join(repoRoot, ".git"))) return null;
    return repoRoot;
  } catch {
    return null;
  }
}

/**
 * For linked local repos: kick off the sync script in the background.
 * The script handles fetch, merge, rebuild, and re-link.
 * Non-blocking — fires and forgets.
 */
function triggerGitSync(repoRoot: string): string | null {
  const syncScript = path.join(repoRoot, "scripts", "sync-upstream.sh");
  if (!fs.existsSync(syncScript)) return null;

  // Check sync state for recent conflict warnings
  const syncState = readSyncState();
  if (syncState?.lastResult === "conflict") {
    return `⚠️  Upstream merge has conflicts — run: cd ${repoRoot} && git merge origin/main`;
  }

  // Run sync in background (detached, no waiting)
  try {
    const child = spawnSync("bash", [syncScript], {
      cwd: repoRoot,
      stdio: "ignore",
      timeout: 90_000, // 90s max for fetch+merge+build
    });
    if (child.status === 0) {
      // Check if it actually updated
      const newSyncState = readSyncState();
      if (newSyncState?.lastResult === "updated" && newSyncState.version) {
        return `Synced upstream → v${newSyncState.version}`;
      }
    }
  } catch {
    // Non-fatal
  }

  return null;
}

// ── npm-based update (for non-linked installs) ───────────────

enum PackageManager {
  NPM = "npm",
  PNPM = "pnpm",
  YARN = "yarn",
  UNKNOWN = "unknown",
}

interface InstallInfo {
  packageManager: PackageManager;
  updateCommand: string | null;
}

function detectInstallInfo(): InstallInfo {
  const scriptPath = (process.argv[1] ?? "").replace(/\\/g, "/");

  if (scriptPath.includes("/_npx/")) {
    return { packageManager: PackageManager.UNKNOWN, updateCommand: null };
  }
  if (scriptPath.includes("/.pnpm") || scriptPath.includes("/pnpm/global")) {
    return {
      packageManager: PackageManager.PNPM,
      updateCommand: `pnpm add -g ${PACKAGE_NAME}@latest`,
    };
  }
  if (scriptPath.includes("/.yarn/") || scriptPath.includes("/yarn/global")) {
    return {
      packageManager: PackageManager.YARN,
      updateCommand: `yarn global add ${PACKAGE_NAME}@latest`,
    };
  }
  return {
    packageManager: PackageManager.NPM,
    updateCommand: `npm install -g ${PACKAGE_NAME}@latest`,
  };
}

function fetchLatestVersionSync(): string | null {
  try {
    const script = `
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), ${FETCH_TIMEOUT_MS});
      fetch("${REGISTRY_URL}", { signal: c.signal })
        .then(r => r.json())
        .then(d => { clearTimeout(t); process.stdout.write(d.version || ""); })
        .catch(() => { clearTimeout(t); process.exit(1); });
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf-8",
      timeout: FETCH_TIMEOUT_MS + 1000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const version = result.stdout?.trim();
    return version && /^\d+\.\d+\.\d+/.test(version) ? version : null;
  } catch {
    return null;
  }
}

function performUpdate(command: string): boolean {
  try {
    execSync(command, {
      stdio: "pipe",
      timeout: 60_000,
      env: { ...process.env, npm_config_loglevel: "silent" },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check for updates and auto-update if a newer version is available.
 * Called at CLI startup. Non-blocking on failure — the CLI always proceeds.
 *
 * For npm-linked local repos: uses git fetch + merge + rebuild.
 * For standard npm installs: uses npm registry + npm install -g.
 *
 * Returns a message to display if an update happened, or null.
 */
export function checkAndAutoUpdate(currentVersion: string): string | null {
  try {
    if (!shouldCheck()) return null;

    // If running from a linked local repo, use git-based sync
    const repoRoot = isLinkedLocalRepo();
    if (repoRoot) {
      writeState({ lastCheckedAt: Date.now() });
      return triggerGitSync(repoRoot);
    }

    // Standard npm-based update for published installs
    const latestVersion = fetchLatestVersionSync();

    writeState({
      lastCheckedAt: Date.now(),
      lastSeenVersion: latestVersion ?? undefined,
    });

    if (!latestVersion) return null;
    if (compareVersions(latestVersion, currentVersion) <= 0) return null;

    const info = detectInstallInfo();
    if (!info.updateCommand) return null;

    const success = performUpdate(info.updateCommand);

    if (success) {
      return `Updated ${PACKAGE_NAME} ${currentVersion} \u2192 ${latestVersion}`;
    }

    return `Update available: ${currentVersion} \u2192 ${latestVersion}\nRun: ${info.updateCommand}`;
  } catch {
    // Never block CLI startup
    return null;
  }
}
