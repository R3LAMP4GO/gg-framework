/**
 * Structured telemetry tracking — mirrors Claude Code's event patterns.
 *
 * Uses the existing log() infrastructure for output. Events are logged
 * with structured data for querying and analysis.
 */

import { log } from "./logger.js";

// ── Question/elicitation events ───────────────────────────

export interface QuestionEvent {
  event: "question_asked" | "question_answered" | "question_declined" | "question_cancelled";
  questionCount: number;
  source?: string;
  fieldTypes?: string[];
  outcome: "accept" | "decline" | "cancel";
  durationMs?: number;
}

export function trackQuestion(data: QuestionEvent): void {
  log("INFO", "telemetry:question", data.event, data as unknown as Record<string, unknown>);
}
