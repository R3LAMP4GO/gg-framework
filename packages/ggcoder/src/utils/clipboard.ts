/**
 * Clipboard utilities for copying text to the system clipboard.
 * Platform-specific: macOS (pbcopy), Linux (xclip/xsel), Windows (clip.exe).
 */

import { spawn } from "node:child_process";
import { log } from "../core/logger.js";

/**
 * Copy text to the system clipboard.
 * Throws if no clipboard command is available.
 */
export async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "darwin") {
    cmd = "pbcopy";
    args = [];
  } else if (platform === "linux") {
    // Try xclip first, then xsel
    const result = await tryClipboardCommand("xclip", ["-selection", "clipboard"], text);
    if (result) return;
    const result2 = await tryClipboardCommand("xsel", ["--clipboard", "--input"], text);
    if (result2) return;
    throw new Error("No clipboard command found. Install xclip or xsel.");
  } else if (platform === "win32") {
    cmd = "clip.exe";
    args = [];
  } else {
    throw new Error(`Unsupported platform for clipboard: ${platform}`);
  }

  const success = await tryClipboardCommand(cmd, args, text);
  if (!success) {
    throw new Error(`Failed to copy to clipboard using ${cmd}`);
  }

  log("INFO", "clipboard", `Copied ${text.length} chars to clipboard`);
}

async function tryClipboardCommand(cmd: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });

      proc.on("error", () => {
        resolve(false);
      });

      proc.on("close", (code) => {
        resolve(code === 0);
      });

      proc.stdin.write(text);
      proc.stdin.end();
    } catch {
      resolve(false);
    }
  });
}
