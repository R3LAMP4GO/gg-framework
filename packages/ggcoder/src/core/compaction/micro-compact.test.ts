import { describe, it, expect } from "vitest";
import { microCompact, shouldTimeBasedMicroCompact } from "./micro-compact.js";
import type { Message } from "@kenkaiiii/gg-ai";

function msg(role: "system" | "user" | "assistant", content: string): Message {
  return { role, content } as Message;
}

function toolUseAssistant(): Message {
  return {
    role: "assistant",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: [{ type: "tool_use", id: "t1", name: "read", input: {} }] as any,
  };
}

/** Build a conversation with N tool result pairs. */
function buildConversation(toolResultCount: number): Message[] {
  const messages: Message[] = [msg("system", "System prompt")];
  for (let i = 0; i < toolResultCount; i++) {
    messages.push(toolUseAssistant());
    messages.push(msg("user", `Tool result content #${i} — ${"x".repeat(500)}`));
  }
  // Add a recent assistant response
  messages.push(msg("assistant", "Here's what I found..."));
  return messages;
}

describe("microCompact", () => {
  it("preserves system message", () => {
    const messages = buildConversation(10);
    const result = microCompact(messages, { keepRecent: 3, minAge: 5 });
    expect(result.messages[0].content).toBe("System prompt");
  });

  it("clears old tool results beyond keepRecent", () => {
    const messages = buildConversation(15);
    const result = microCompact(messages, { keepRecent: 5, minAge: 5 });
    expect(result.clearedCount).toBeGreaterThan(0);
    expect(result.reclaimedTokens).toBeGreaterThan(0);
  });

  it("preserves recent K tool results", () => {
    const messages = buildConversation(10);
    const result = microCompact(messages, { keepRecent: 5, minAge: 3 });

    // Count how many tool results are still full (not cleared)
    let fullResults = 0;
    for (const m of result.messages) {
      if (
        m.role === "user" &&
        typeof m.content === "string" &&
        m.content.startsWith("Tool result content")
      ) {
        fullResults++;
      }
    }
    expect(fullResults).toBeGreaterThanOrEqual(5);
  });

  it("reports correct reclaimedTokens", () => {
    const messages = buildConversation(12);
    const result = microCompact(messages, { keepRecent: 3, minAge: 3 });
    expect(result.reclaimedTokens).toBeGreaterThan(0);
    expect(typeof result.reclaimedTokens).toBe("number");
  });

  it("returns same reference if nothing to clear", () => {
    const messages = buildConversation(3); // Only 3 results, keepRecent=5
    const result = microCompact(messages, { keepRecent: 5, minAge: 5 });
    expect(result.messages).toBe(messages); // Same reference
    expect(result.clearedCount).toBe(0);
  });

  it("respects minAge parameter", () => {
    const messages = buildConversation(8);
    // Set minAge very high so nothing is old enough to clear
    const result = microCompact(messages, { keepRecent: 2, minAge: 100 });
    expect(result.clearedCount).toBe(0);
  });

  it("handles empty messages array", () => {
    const result = microCompact([msg("system", "sys")]);
    expect(result.clearedCount).toBe(0);
    expect(result.messages).toHaveLength(1);
  });

  it("cleared messages contain placeholder with char count", () => {
    const messages = buildConversation(15);
    const result = microCompact(messages, { keepRecent: 3, minAge: 3 });

    const cleared = result.messages.filter(
      (m) => typeof m.content === "string" && m.content.startsWith("[Tool result cleared"),
    );
    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared[0].content).toMatch(/\[Tool result cleared — \d+ chars\]/);
  });
});

describe("shouldTimeBasedMicroCompact", () => {
  it("returns false when no last assistant time", () => {
    expect(shouldTimeBasedMicroCompact(undefined)).toBe(false);
  });

  it("returns false when gap is short", () => {
    // 5 minutes ago
    expect(shouldTimeBasedMicroCompact(Date.now() - 5 * 60_000)).toBe(false);
  });

  it("returns true when gap exceeds threshold", () => {
    // 35 minutes ago (default threshold is 30)
    expect(shouldTimeBasedMicroCompact(Date.now() - 35 * 60_000)).toBe(true);
  });

  it("respects custom threshold", () => {
    // 15 minutes ago, threshold 10
    expect(shouldTimeBasedMicroCompact(Date.now() - 15 * 60_000, 10)).toBe(true);
    // 15 minutes ago, threshold 20
    expect(shouldTimeBasedMicroCompact(Date.now() - 15 * 60_000, 20)).toBe(false);
  });
});
