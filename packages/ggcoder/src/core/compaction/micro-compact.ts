/**
 * Microcompaction — surgically removes stale tool results without full re-summarization.
 *
 * Replaces old tool_result message content with a short placeholder,
 * reclaiming tokens cheaply (no LLM call needed). Full compaction remains
 * as fallback when microcompaction doesn't reclaim enough.
 */

import type { Message } from "@kenkaiiii/gg-ai";
import { estimateMessageTokens } from "./token-estimator.js";
import { log } from "../logger.js";

const CLEARED_PLACEHOLDER = "[Tool result cleared — ";

export interface MicroCompactOptions {
  /** Preserve this many most-recent tool results (default: 5) */
  keepRecent?: number;
  /** Only clear results older than this many messages from the end (default: 10) */
  minAge?: number;
}

export interface MicroCompactResult {
  messages: Message[];
  reclaimedTokens: number;
  clearedCount: number;
}

/**
 * Surgically clear old tool result content, preserving message structure.
 *
 * Walks messages from start, finds tool_result roles, and replaces content
 * for those older than `minAge` messages from the end and beyond the
 * `keepRecent` most-recent tool results.
 */
export function microCompact(
  messages: Message[],
  options: MicroCompactOptions = {},
): MicroCompactResult {
  const keepRecent = Math.max(1, options.keepRecent ?? 5);
  const minAge = options.minAge ?? 10;

  // Find all tool_result indices
  const toolResultIndices: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user" && typeof msg.content === "string" && isToolResult(messages, i)) {
      toolResultIndices.push(i);
    }
    // Also handle array content with tool_result blocks
    if (msg.role === "tool" || (msg.role as string) === "tool_result") {
      toolResultIndices.push(i);
    }
  }

  if (toolResultIndices.length === 0) {
    return { messages, reclaimedTokens: 0, clearedCount: 0 };
  }

  // Determine which to clear: those beyond keepRecent from the end AND older than minAge
  const ageThreshold = messages.length - minAge;
  const recentCutoff = toolResultIndices.length - keepRecent;

  const indicesToClear = new Set<number>();
  for (let i = 0; i < toolResultIndices.length; i++) {
    const msgIdx = toolResultIndices[i];
    // Must be older than minAge messages from end AND beyond keepRecent
    if (msgIdx < ageThreshold && i < recentCutoff) {
      indicesToClear.add(msgIdx);
    }
  }

  if (indicesToClear.size === 0) {
    return { messages, reclaimedTokens: 0, clearedCount: 0 };
  }

  // Create new messages array with cleared content
  let reclaimedTokens = 0;
  const result = messages.map((msg, idx): Message => {
    if (!indicesToClear.has(idx)) return msg;

    const originalTokens = estimateMessageTokens(msg);
    const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    const charCount = contentStr.length;
    const placeholder = `${CLEARED_PLACEHOLDER}${charCount} chars]`;
    // Preserve the original role but replace content with placeholder
    const newMsg: Message = { role: "user", content: placeholder } as Message;
    const newTokens = estimateMessageTokens(newMsg);
    reclaimedTokens += Math.max(0, originalTokens - newTokens);

    return newMsg;
  });

  log(
    "INFO",
    "microcompact",
    `Cleared ${indicesToClear.size} tool results, reclaimed ~${reclaimedTokens} tokens (kept ${keepRecent} recent)`,
  );

  return {
    messages: result,
    reclaimedTokens,
    clearedCount: indicesToClear.size,
  };
}

/**
 * Check if message at index looks like a tool result.
 * Tool results typically follow a tool_use message from the assistant.
 */
function isToolResult(messages: Message[], idx: number): boolean {
  if (idx <= 0) return false;
  const prev = messages[idx - 1];
  // If previous is assistant with tool_use content blocks, this is likely a tool result
  if (prev.role === "assistant" && typeof prev.content !== "string") {
    const blocks = prev.content as Array<{ type: string }>;
    return blocks?.some?.((b) => b.type === "tool_use") ?? false;
  }
  return false;
}

// ── Time-based trigger (CC parity) ──────────────────────

/** Default gap threshold in minutes — matches CC's server cache TTL alignment */
const DEFAULT_GAP_THRESHOLD_MINUTES = 30;

/**
 * Check if enough time has passed since the last assistant message to trigger
 * microcompaction. When idle for 30+ minutes, stale tool results are unlikely
 * to be relevant and can be cleared before the next LLM call.
 *
 * Returns true if microcompaction should be triggered based on time gap.
 */
export function shouldTimeBasedMicroCompact(
  lastAssistantTime: number | undefined,
  gapThresholdMinutes = DEFAULT_GAP_THRESHOLD_MINUTES,
): boolean {
  if (!lastAssistantTime) return false;
  const gapMs = Date.now() - lastAssistantTime;
  const gapMinutes = gapMs / 60_000;
  if (gapMinutes >= gapThresholdMinutes) {
    log("INFO", "microcompact", `Time-based trigger: ${gapMinutes.toFixed(1)}min gap (threshold: ${gapThresholdMinutes}min)`);
    return true;
  }
  return false;
}
