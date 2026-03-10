import { describe, it, expect, vi } from "vitest";

const mockLog = vi.fn();
vi.mock("./logger.js", () => ({ log: (...args: unknown[]) => mockLog(...args) }));

const { trackPlanMode, trackQuestion } = await import("./telemetry.js");

describe("trackPlanMode", () => {
  it("logs to telemetry:plan category", () => {
    mockLog.mockClear();
    trackPlanMode({
      event: "plan_enter",
      entryMethod: "hotkey",
      interviewPhaseEnabled: true,
    });
    expect(mockLog).toHaveBeenCalledWith(
      "INFO",
      "telemetry:plan",
      "plan_enter",
      expect.objectContaining({ event: "plan_enter", entryMethod: "hotkey" }),
    );
  });

  it("includes all optional fields when provided", () => {
    mockLog.mockClear();
    trackPlanMode({
      event: "plan_approve",
      entryMethod: "command",
      planLengthChars: 1500,
      outcome: "approved",
      interviewPhaseEnabled: true,
      questionCount: 3,
      durationMs: 45000,
    });
    expect(mockLog).toHaveBeenCalledWith(
      "INFO",
      "telemetry:plan",
      "plan_approve",
      expect.objectContaining({
        planLengthChars: 1500,
        outcome: "approved",
        questionCount: 3,
        durationMs: 45000,
      }),
    );
  });
});

describe("trackQuestion", () => {
  it("logs to telemetry:question category", () => {
    mockLog.mockClear();
    trackQuestion({
      event: "question_answered",
      questionCount: 2,
      outcome: "accept",
    });
    expect(mockLog).toHaveBeenCalledWith(
      "INFO",
      "telemetry:question",
      "question_answered",
      expect.objectContaining({ questionCount: 2, outcome: "accept" }),
    );
  });

  it("includes source and field types", () => {
    mockLog.mockClear();
    trackQuestion({
      event: "question_asked",
      questionCount: 3,
      source: "mcp_elicitation",
      fieldTypes: ["boolean", "string", "enum"],
      outcome: "accept",
      durationMs: 12000,
    });
    expect(mockLog).toHaveBeenCalledWith(
      "INFO",
      "telemetry:question",
      "question_asked",
      expect.objectContaining({
        source: "mcp_elicitation",
        fieldTypes: ["boolean", "string", "enum"],
      }),
    );
  });
});
