import type { Message, ContentPart, ToolResult } from "@kenkaiiii/gg-ai";

const CHARS_PER_TOKEN = 4;
const PER_MESSAGE_OVERHEAD = 4; // tokens

/**
 * Approximate token cost for an image content block.
 * Anthropic charges based on pixel count; a typical 1000×1000 image ≈ 1600 tokens.
 * We estimate ~1 token per 750 bytes of decoded base64 data as a rough proxy.
 */
const IMAGE_BASE_TOKENS = 800;
const IMAGE_BYTES_PER_TOKEN = 750;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimate tokens for an image from its base64 data length. */
function estimateImageTokens(base64Length: number): number {
  const decodedBytes = Math.ceil(base64Length * 0.75);
  return Math.max(IMAGE_BASE_TOKENS, Math.ceil(decodedBytes / IMAGE_BYTES_PER_TOKEN));
}

export function estimateMessageTokens(message: Message): number {
  let tokens = PER_MESSAGE_OVERHEAD;

  if (typeof message.content === "string") {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if ("text" in part && typeof part.text === "string") {
        tokens += estimateTokens(part.text);
      } else if ("type" in part && part.type === "image") {
        const img = part as { data?: string };
        tokens += estimateImageTokens(img.data?.length ?? 0);
      } else if ("type" in part && part.type === "tool_call") {
        const tc = part as ContentPart & { type: "tool_call" };
        tokens += estimateTokens(tc.name);
        tokens += estimateTokens(JSON.stringify(tc.args));
      } else if ("type" in part && part.type === "tool_result") {
        const tr = part as unknown as ToolResult;
        tokens += estimateTokens(tr.content);
        // Count images in tool results
        if (tr.images?.length) {
          for (const img of tr.images) {
            tokens += estimateImageTokens(img.data?.length ?? 0);
          }
        }
      }
    }
  }

  return tokens;
}

export function estimateConversationTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}
