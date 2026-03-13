import { describe, it, expect, vi } from "vitest";

const mockLog = vi.fn();
vi.mock("./logger.js", () => ({ log: (...args: unknown[]) => mockLog(...args) }));

const { trackQuestion } = await import("./telemetry.js");

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
