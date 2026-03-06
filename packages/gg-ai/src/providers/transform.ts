import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type {
  ContentPart,
  Message,
  TextContent,
  ThinkingLevel,
  Tool,
  ToolChoice,
} from "../types.js";
import { zodToJsonSchema } from "../utils/zod-to-json-schema.js";

// ── Anthropic Transforms ───────────────────────────────────

export function toAnthropicMessages(messages: Message[]): {
  system: string | undefined;
  messages: Anthropic.MessageParam[];
} {
  let system: string | undefined;
  const out: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content;
      continue;
    }
    if (msg.role === "user") {
      out.push({
        role: "user",
        content:
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map((part) => {
                if (part.type === "text") return { type: "text" as const, text: part.text };
                return {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: part.mediaType as
                      | "image/jpeg"
                      | "image/png"
                      | "image/gif"
                      | "image/webp",
                    data: part.data,
                  },
                };
              }),
      });
      continue;
    }
    if (msg.role === "assistant") {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((part): Anthropic.ContentBlockParam => {
              if (part.type === "text") return { type: "text", text: part.text };
              if (part.type === "thinking")
                return { type: "thinking", thinking: part.text, signature: "" };
              if (part.type === "tool_call")
                return {
                  type: "tool_use",
                  id: part.id,
                  name: part.name,
                  input: part.args,
                };
              if (part.type === "server_tool_call")
                return {
                  type: "server_tool_use",
                  id: part.id,
                  name: part.name,
                  input: part.input,
                } as unknown as Anthropic.ContentBlockParam;
              if (part.type === "server_tool_result")
                return part.data as unknown as Anthropic.ContentBlockParam;
              // image content shouldn't appear in assistant messages
              return { type: "text", text: "" };
            });
      out.push({ role: "assistant", content });
      continue;
    }
    if (msg.role === "tool") {
      for (const result of msg.content) {
        out.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: result.toolCallId,
              content: result.content,
              is_error: result.isError,
            },
          ],
        });
      }
    }
  }

  return { system, messages: out };
}

export function toAnthropicTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: (tool.rawInputSchema ??
      zodToJsonSchema(tool.parameters)) as Anthropic.Tool["input_schema"],
  }));
}

export function toAnthropicToolChoice(choice: ToolChoice): Anthropic.ToolChoice {
  if (choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "auto" }; // Anthropic has no "none" — omit tools instead
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.name };
}

export function toAnthropicThinking(
  level: ThinkingLevel,
  maxTokens: number,
): { thinking: Anthropic.ThinkingConfigParam; maxTokens: number } {
  const budgetMap: Record<ThinkingLevel, number> = {
    low: Math.max(1024, Math.floor(maxTokens * 0.25)),
    medium: Math.max(2048, Math.floor(maxTokens * 0.5)),
    high: Math.max(4096, maxTokens),
  };
  const budget = budgetMap[level];
  return {
    thinking: { type: "enabled", budget_tokens: budget },
    maxTokens: maxTokens + budget,
  };
}

// ── OpenAI Transforms ──────────────────────────────────────

export function toOpenAIMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
  const out: OpenAI.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      out.push({ role: "system", content: msg.content });
      continue;
    }
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        out.push({ role: "user", content: msg.content });
      } else {
        out.push({
          role: "user",
          content: msg.content.map(
            (
              part,
            ): OpenAI.ChatCompletionContentPartImage | OpenAI.ChatCompletionContentPartText => {
              if (part.type === "text") return { type: "text", text: part.text };
              return {
                type: "image_url",
                image_url: {
                  url: `data:${part.mediaType};base64,${part.data}`,
                },
              };
            },
          ),
        });
      }
      continue;
    }
    if (msg.role === "assistant") {
      const parts = typeof msg.content === "string" ? msg.content : undefined;
      const toolCalls =
        typeof msg.content !== "string"
          ? msg.content
              .filter(
                (p): p is Extract<ContentPart, { type: "tool_call" }> => p.type === "tool_call",
              )
              .map(
                (tc): OpenAI.ChatCompletionMessageToolCall => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: JSON.stringify(tc.args) },
                }),
              )
          : undefined;
      const textParts =
        typeof msg.content !== "string"
          ? msg.content
              .filter((p): p is TextContent => p.type === "text")
              .map((p) => p.text)
              .join("")
          : undefined;

      out.push({
        role: "assistant",
        content: parts ?? textParts ?? null,
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    if (msg.role === "tool") {
      for (const result of msg.content) {
        out.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: result.content,
        });
      }
    }
  }

  return out;
}

export function toOpenAITools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.rawInputSchema ?? zodToJsonSchema(tool.parameters),
    },
  }));
}

export function toOpenAIToolChoice(choice: ToolChoice): OpenAI.ChatCompletionToolChoiceOption {
  if (choice === "auto") return "auto";
  if (choice === "none") return "none";
  if (choice === "required") return "required";
  return { type: "function", function: { name: choice.name } };
}

export function toOpenAIReasoningEffort(level: ThinkingLevel): "low" | "medium" | "high" {
  return level;
}

// ── Response Normalization ─────────────────────────────────

export function normalizeAnthropicStopReason(
  reason: string | null,
): "end_turn" | "tool_use" | "max_tokens" {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

export function normalizeOpenAIStopReason(
  reason: string | null,
): "end_turn" | "tool_use" | "max_tokens" {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "end_turn";
  }
}
