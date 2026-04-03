import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Write full content to a temp file for overflow access.
 * Returns the file path. Caller uses it in truncation notices.
 */
export async function writeOverflow(content: string, prefix: string): Promise<string> {
  const filePath = path.join(os.tmpdir(), `gg-${prefix}-${Date.now()}.txt`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}
