/**
 * AskUserQuestion tool — Structured multi-choice questions and MCP-style
 * form elicitation for the agent.
 *
 * Supports two modes:
 *   1. Options mode: Multiple-choice questions with predefined options + "Other"
 *   2. Elicitation mode: MCP-compatible typed form fields (boolean, string,
 *      number, enum, array) — mirrors Claude Code's elicitation/create schema
 *
 * The tool pauses the agent loop until the UI collects answers, then returns
 * them as a tool result with 3-way response: accept, decline, or cancel.
 */

import { z } from "zod";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { log } from "../core/logger.js";

// ── Options-mode Schema (original) ──────────────────────

const OptionSchema = z.object({
  label: z.string().describe("Concise option text (1-5 words)"),
  description: z.string().describe("Explanation of implications and trade-offs"),
});

const QuestionSchema = z.object({
  question: z.string().describe('Clear, specific question ending with "?"'),
  header: z.string().describe("Very short label shown as chip/tag (max 12 chars)"),
  options: z
    .array(OptionSchema)
    .min(2)
    .max(4)
    .describe(
      "Available choices (2-4 options). Do NOT include an 'Other' option — it is auto-generated.",
    ),
  multiSelect: z.boolean().describe("Set to true for non-mutually-exclusive choices"),
});

// ── MCP-compatible field schemas ────────────────────────

const BooleanFieldSchema = z.object({
  type: z.literal("boolean"),
  title: z.string().optional(),
  description: z.string().optional(),
  default: z.boolean().optional(),
});

const StringFieldSchema = z.object({
  type: z.literal("string"),
  title: z.string().optional(),
  description: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  format: z.enum(["email", "uri", "date", "date-time"]).optional(),
  default: z.string().optional(),
  // When enum is present, it's an EnumField rendered as a dropdown
  enum: z.array(z.string()).optional(),
  enumNames: z.array(z.string()).optional(),
});

const NumberFieldSchema = z.object({
  type: z.union([z.literal("number"), z.literal("integer")]),
  title: z.string().optional(),
  description: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  default: z.number().optional(),
});

const MultiSelectFieldSchema = z.object({
  type: z.literal("array"),
  title: z.string().optional(),
  description: z.string().optional(),
  items: z.object({
    type: z.literal("string"),
    enum: z.array(z.string()),
  }),
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
  default: z.array(z.string()).optional(),
});

const FieldDefinitionSchema = z.union([
  BooleanFieldSchema,
  StringFieldSchema,
  NumberFieldSchema,
  MultiSelectFieldSchema,
]);

// ── Elicitation schema (MCP-style form) ─────────────────

const ElicitationSchema = z.object({
  message: z.string().describe("Message/prompt shown above the form"),
  requestedSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.string(), FieldDefinitionSchema),
    required: z.array(z.string()).optional(),
  }),
});

// ── Tool params (supports both modes) ───────────────────

const AskUserQuestionParams = z
  .object({
    questions: z
      .array(QuestionSchema)
      .min(1)
      .max(4)
      .describe("1-4 structured questions (option-based)")
      .optional(),
    elicitation: ElicitationSchema.optional().describe(
      "MCP-style form with typed fields (boolean, string, number, enum, array)",
    ),
    metadata: z
      .object({
        source: z.string().optional().describe('Source identifier, e.g. "remember"'),
      })
      .optional(),
  })
  .refine((d) => d.questions || d.elicitation, {
    message: "Must provide questions or elicitation",
  });

// ── Exported types ──────────────────────────────────────

export type QuestionOption = z.infer<typeof OptionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;
export type ElicitationRequest = z.infer<typeof ElicitationSchema>;
export type AskUserQuestionInput = z.infer<typeof AskUserQuestionParams>;

/** 3-way response matching MCP elicitation protocol */
export type QuestionResult = {
  action: "accept" | "decline" | "cancel";
  answers: Record<string, string>;
};

/**
 * Callback the UI registers to handle incoming questions.
 * Returns a promise that resolves with action + answer map.
 */
export type QuestionHandler = (
  questions: Question[],
  elicitation?: ElicitationRequest,
) => Promise<QuestionResult>;

// ── Shared handler registry ─────────────────────────────

let _questionHandler: QuestionHandler | null = null;

/** Called by App.tsx to register the question handler. */
export function setQuestionHandler(handler: QuestionHandler | null): void {
  _questionHandler = handler;
}

// ── Tool factory ────────────────────────────────────────

export function createAskUserQuestionTool(): AgentTool<typeof AskUserQuestionParams> {
  return {
    name: "ask_user_question",
    description:
      "Ask the user 1-4 structured multiple-choice questions to gather information, " +
      "clarify ambiguity, understand preferences, or offer choices. " +
      "Users can select from the provided options OR type a custom answer (an 'Other' " +
      "option is always auto-generated by the UI — do NOT include one yourself).\n\n" +
      "Supports two modes:\n" +
      "1. **options** — Pass `questions` with predefined choices\n" +
      "2. **elicitation** — Pass `elicitation` with typed form fields " +
      "(boolean, string, number, enum, multi-select array)\n\n" +
      "The user can accept (answer), decline (skip), or cancel.\n\n" +
      "When to use:\n" +
      "- Clarifying requirements before implementation\n" +
      "- Choosing between multiple valid approaches\n" +
      "- Understanding user preferences (styling, naming, patterns)\n" +
      "- Confirming scope or constraints\n\n" +
      "When NOT to use:\n" +
      "- Simple yes/no confirmations\n" +
      "- Asking if a plan is ready (use exit_plan_mode instead)\n" +
      "- Questions with obvious answers from context",
    parameters: AskUserQuestionParams,
    async execute({ questions, elicitation, metadata }) {
      if (!_questionHandler) {
        log("WARN", "ask-user-question", "No question handler registered — returning placeholder");
        return "No UI handler available to display questions. The user cannot answer right now.";
      }

      const qCount =
        questions?.length ?? Object.keys(elicitation?.requestedSchema.properties ?? {}).length;
      log("INFO", "ask-user-question", `Asking ${qCount} question(s)`, {
        mode: questions ? "options" : "elicitation",
        source: metadata?.source ?? "agent",
      });

      const startTime = Date.now();
      const result = await _questionHandler(questions ?? [], elicitation);
      const durationMs = Date.now() - startTime;

      if (result.action === "cancel") {
        log("INFO", "ask-user-question", "User cancelled", {
          durationMs: String(durationMs),
        });
        return "User cancelled the question dialog. Do not ask again unless the user explicitly requests it.";
      }

      if (result.action === "decline") {
        log("INFO", "ask-user-question", "User declined", {
          durationMs: String(durationMs),
        });
        return "User declined to answer. Proceed with reasonable defaults or your best judgment.";
      }

      // action === "accept"
      const parts = Object.entries(result.answers).map(([q, a]) => `"${q}"="${a}"`);
      log(
        "INFO",
        "ask-user-question",
        `Got answers for ${Object.keys(result.answers).length} question(s)`,
        { durationMs: String(durationMs) },
      );
      return `User has answered your questions: ${parts.join(", ")}. You can now continue with the user's answers in mind.`;
    },
  };
}
