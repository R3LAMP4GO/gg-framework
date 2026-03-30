// edit-transaction.ts — snapshot-based file rollback

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TRANSACTION_SIZE = 100 * 1024 * 1024; // 100 MB

export class EditTransaction {
  private snapshots = new Map<string, string>(); // filePath -> original content
  private totalSize = 0;
  private snapshotDir: string;
  private sessionId: string;
  private active = false;

  constructor(ggDir: string, sessionId?: string) {
    this.sessionId = sessionId ?? crypto.randomUUID();
    this.snapshotDir = path.join(ggDir, ".snapshots", this.sessionId);
  }

  /** Record a snapshot of a file before modifying it. No-op if already snapshotted. */
  async recordSnapshot(filePath: string): Promise<void> {
    if (this.snapshots.has(filePath)) return; // already snapshotted

    let content: string;
    let size: number;
    try {
      const stat = await fs.stat(filePath);
      size = stat.size;
      if (size > MAX_FILE_SIZE) return; // skip large files silently
      if (this.totalSize + size > MAX_TRANSACTION_SIZE) return; // transaction limit
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      // File doesn't exist yet (new file) — snapshot as empty marker
      content = "";
      size = 0;
    }

    this.snapshots.set(filePath, content);
    this.totalSize += size;

    // Also persist to disk for crash recovery
    if (!this.active) {
      await fs.mkdir(this.snapshotDir, { recursive: true });
      this.active = true;
    }
    await this.persistManifest();
  }

  /** Rollback all modified files to their original content. Returns list of rolled-back files. */
  async rollback(): Promise<string[]> {
    const rolledBack: string[] = [];
    for (const [filePath, originalContent] of this.snapshots) {
      try {
        if (originalContent === "") {
          // File was new — delete it
          await fs.unlink(filePath).catch(() => {});
        } else {
          await fs.writeFile(filePath, originalContent, "utf-8");
        }
        rolledBack.push(filePath);
      } catch {
        // Best effort
      }
    }
    await this.cleanup();
    return rolledBack;
  }

  /** Commit the transaction — discard snapshots. */
  async commit(): Promise<void> {
    await this.cleanup();
  }

  /** Number of files in this transaction. */
  get fileCount(): number {
    return this.snapshots.size;
  }

  /** Whether this transaction has any snapshots. */
  get hasSnapshots(): boolean {
    return this.snapshots.size > 0;
  }

  /** Clean up snapshot directory. */
  private async cleanup(): Promise<void> {
    this.snapshots.clear();
    this.totalSize = 0;
    this.active = false;
    try {
      await fs.rm(this.snapshotDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }

  /** Persist manifest to disk for crash recovery. */
  private async persistManifest(): Promise<void> {
    const manifest: Record<string, string> = {};
    for (const [filePath, content] of this.snapshots) {
      const hash = crypto.createHash("sha256").update(filePath).digest("hex").slice(0, 16);
      manifest[hash] = filePath;
      // Write snapshot content
      await fs.writeFile(path.join(this.snapshotDir, hash), content, "utf-8");
    }
    await fs.writeFile(
      path.join(this.snapshotDir, "_manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
  }

  /** Check for orphaned snapshots from crashed sessions. Returns warning message or null. */
  static async checkOrphaned(ggDir: string): Promise<string | null> {
    const snapshotsDir = path.join(ggDir, ".snapshots");
    try {
      const entries = await fs.readdir(snapshotsDir);
      if (entries.length === 0) return null;
      return `Found ${entries.length} orphaned snapshot(s) from a previous session. Use the rollback tool to restore or discard.`;
    } catch {
      return null;
    }
  }

  /** Load a transaction from disk (crash recovery). */
  static async loadFromDisk(ggDir: string, sessionId: string): Promise<EditTransaction | null> {
    const snapshotDir = path.join(ggDir, ".snapshots", sessionId);
    try {
      const manifestPath = path.join(snapshotDir, "_manifest.json");
      const manifestJson = await fs.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestJson) as Record<string, string>;

      const tx = new EditTransaction(ggDir, sessionId);
      for (const [hash, filePath] of Object.entries(manifest)) {
        const content = await fs.readFile(path.join(snapshotDir, hash), "utf-8");
        tx.snapshots.set(filePath, content);
      }
      tx.active = true;
      return tx;
    } catch {
      return null;
    }
  }
}
