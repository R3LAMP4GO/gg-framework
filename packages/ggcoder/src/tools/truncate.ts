export const MAX_LINES = 2000;
export const MAX_BYTES = 50 * 1024; // 50KB

/** @deprecated Use MAX_BYTES instead. Kept for backwards compatibility with tests. */
export const MAX_CHARS = MAX_BYTES;

export interface TruncateResult {
  content: string;
  truncated: boolean;
  totalLines: number;
  keptLines: number;
}

/**
 * Truncate from the end — keep the first N lines.
 * Used by the read tool.
 */
export function truncateHead(
  content: string,
  maxLines = MAX_LINES,
  maxBytes = MAX_BYTES,
): TruncateResult {
  const lines = content.split("\n");
  const totalLines = lines.length;

  // Limit by line count
  let kept = lines.slice(0, maxLines);

  // Limit by byte count
  let size = 0;
  let cutIndex = kept.length;
  for (let i = 0; i < kept.length; i++) {
    size += Buffer.byteLength(kept[i], "utf-8") + 1; // +1 for newline
    if (size > maxBytes) {
      cutIndex = i;
      break;
    }
  }
  kept = kept.slice(0, cutIndex);

  const truncated = kept.length < totalLines;
  return {
    content: kept.join("\n"),
    truncated,
    totalLines,
    keptLines: kept.length,
  };
}

/**
 * Truncate from the beginning — keep the last N lines.
 * Used by the bash tool.
 */
export function truncateTail(
  content: string,
  maxLines = MAX_LINES,
  maxBytes = MAX_BYTES,
): TruncateResult {
  const lines = content.split("\n");
  const totalLines = lines.length;

  // Limit by line count — keep last N
  let kept = lines.slice(-maxLines);

  // Limit by byte count — keep last N bytes
  let size = 0;
  let cutIndex = 0;
  for (let i = kept.length - 1; i >= 0; i--) {
    size += Buffer.byteLength(kept[i], "utf-8") + 1;
    if (size > maxBytes) {
      cutIndex = i + 1;
      break;
    }
  }
  kept = kept.slice(cutIndex);

  const truncated = kept.length < totalLines;
  return {
    content: kept.join("\n"),
    truncated,
    totalLines,
    keptLines: kept.length,
  };
}
