import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createAskUserQuestionTool,
  setQuestionHandler,
  type Question,
  type QuestionHandler,
  type QuestionResult,
} from "./ask-user-question.js";

// Mock logger
vi.mock("../core/logger.js", () => ({ log: vi.fn() }));

describe("createAskUserQuestionTool", () => {
  const tool = createAskUserQuestionTool();

  afterEach(() => {
    setQuestionHandler(null);
  });

  it("has correct name and description", () => {
    expect(tool.name).toBe("ask_user_question");
    expect(tool.description).toContain("structured multiple-choice questions");
  });

  it("returns fallback when no handler is registered", async () => {
    const result = await tool.execute(
      {
        questions: [
          {
            question: "Which library?",
            header: "Library",
            options: [
              { label: "Day.js", description: "Lightweight" },
              { label: "date-fns", description: "Tree-shakeable" },
            ],
            multiSelect: false,
          },
        ],
      },
      { signal: new AbortController().signal, toolCallId: "test-1" },
    );
    expect(result).toContain("No UI handler available");
  });

  // ── Accept (3-way) ──────────────────────────────────────

  it("calls handler and formats accept answers", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "accept",
      answers: { "Which library?": "Day.js" },
    } satisfies QuestionResult);
    setQuestionHandler(handler);

    const result = await tool.execute(
      {
        questions: [
          {
            question: "Which library?",
            header: "Library",
            options: [
              { label: "Day.js", description: "Lightweight" },
              { label: "date-fns", description: "Tree-shakeable" },
            ],
            multiSelect: false,
          },
        ],
      },
      { signal: new AbortController().signal, toolCallId: "test-2" },
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toContain('"Which library?"="Day.js"');
    expect(result).toContain("You can now continue");
  });

  it("handles multiple questions with accept", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "accept",
      answers: {
        "Which library?": "Day.js",
        "What scope?": "Small (1-2 files)",
      },
    } satisfies QuestionResult);
    setQuestionHandler(handler);

    const questions: Question[] = [
      {
        question: "Which library?",
        header: "Library",
        options: [
          { label: "Day.js", description: "Lightweight" },
          { label: "date-fns", description: "Tree-shakeable" },
        ],
        multiSelect: false,
      },
      {
        question: "What scope?",
        header: "Scope",
        options: [
          { label: "Small (1-2 files)", description: "Quick change" },
          { label: "Medium (3-5 files)", description: "Moderate effort" },
        ],
        multiSelect: false,
      },
    ];

    const result = await tool.execute(
      { questions },
      { signal: new AbortController().signal, toolCallId: "test-3" },
    );

    expect(result).toContain('"Which library?"="Day.js"');
    expect(result).toContain('"What scope?"="Small (1-2 files)"');
  });

  // ── Decline (3-way) ─────────────────────────────────────

  it("handles decline response", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "decline",
      answers: {},
    } satisfies QuestionResult);
    setQuestionHandler(handler);

    const result = await tool.execute(
      {
        questions: [
          {
            question: "Which library?",
            header: "Library",
            options: [
              { label: "Day.js", description: "Lightweight" },
              { label: "date-fns", description: "Tree-shakeable" },
            ],
            multiSelect: false,
          },
        ],
      },
      { signal: new AbortController().signal, toolCallId: "test-decline" },
    );

    expect(result).toContain("User declined to answer");
    expect(result).toContain("reasonable defaults");
  });

  // ── Cancel (3-way) ──────────────────────────────────────

  it("handles cancel response", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "cancel",
      answers: {},
    } satisfies QuestionResult);
    setQuestionHandler(handler);

    const result = await tool.execute(
      {
        questions: [
          {
            question: "Which library?",
            header: "Library",
            options: [
              { label: "Day.js", description: "Lightweight" },
              { label: "date-fns", description: "Tree-shakeable" },
            ],
            multiSelect: false,
          },
        ],
      },
      { signal: new AbortController().signal, toolCallId: "test-cancel" },
    );

    expect(result).toContain("User cancelled");
    expect(result).toContain("Do not ask again");
  });

  // ── Blocking behavior ───────────────────────────────────

  it("pauses until handler resolves (simulates UI interaction)", async () => {
    let resolveHandler!: (result: QuestionResult) => void;
    const handler: QuestionHandler = vi.fn().mockImplementation(
      () =>
        new Promise<QuestionResult>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    setQuestionHandler(handler);

    const resultPromise = tool.execute(
      {
        questions: [
          {
            question: "Which library?",
            header: "Library",
            options: [
              { label: "Day.js", description: "Lightweight" },
              { label: "date-fns", description: "Tree-shakeable" },
            ],
            multiSelect: false,
          },
        ],
      },
      { signal: new AbortController().signal, toolCallId: "test-4" },
    );

    let resolved = false;
    void Promise.resolve(resultPromise).then(() => {
      resolved = true;
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    resolveHandler({ action: "accept", answers: { "Which library?": "date-fns" } });

    const result = await resultPromise;
    expect(result).toContain('"Which library?"="date-fns"');
  });

  // ── Handler receives questions ──────────────────────────

  it("handler receives exact questions passed by agent", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "accept",
      answers: { "Preferred pattern?": "Factory" },
    } satisfies QuestionResult);
    setQuestionHandler(handler);

    const questions: Question[] = [
      {
        question: "Preferred pattern?",
        header: "Pattern",
        options: [
          { label: "Factory", description: "Encapsulated creation" },
          { label: "Builder", description: "Step-by-step construction" },
          { label: "Singleton", description: "Global instance" },
        ],
        multiSelect: false,
      },
    ];

    await tool.execute(
      { questions },
      { signal: new AbortController().signal, toolCallId: "test-5" },
    );

    const [passedQuestions] = (handler as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(passedQuestions).toHaveLength(1);
    expect(passedQuestions[0].question).toBe("Preferred pattern?");
    expect(passedQuestions[0].header).toBe("Pattern");
    expect(passedQuestions[0].options).toHaveLength(3);
    expect(passedQuestions[0].multiSelect).toBe(false);
  });

  // ── Multi-select ────────────────────────────────────────

  it("handles multi-select answers", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "accept",
      answers: { "Which features?": "Auth, Logging, Caching" },
    } satisfies QuestionResult);
    setQuestionHandler(handler);

    const result = await tool.execute(
      {
        questions: [
          {
            question: "Which features?",
            header: "Features",
            options: [
              { label: "Auth", description: "Authentication" },
              { label: "Logging", description: "Structured logs" },
              { label: "Caching", description: "Redis-based" },
            ],
            multiSelect: true,
          },
        ],
      },
      { signal: new AbortController().signal, toolCallId: "test-6" },
    );

    expect(result).toContain('"Which features?"="Auth, Logging, Caching"');
  });

  // ── Handler cleanup ─────────────────────────────────────

  it("cleans up handler on setQuestionHandler(null)", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "accept",
      answers: {},
    });
    setQuestionHandler(handler);
    setQuestionHandler(null);

    const result = await tool.execute(
      {
        questions: [
          {
            question: "Test?",
            header: "Test",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" },
            ],
            multiSelect: false,
          },
        ],
      },
      { signal: new AbortController().signal, toolCallId: "test-7" },
    );

    expect(handler).not.toHaveBeenCalled();
    expect(result).toContain("No UI handler available");
  });

  // ── Elicitation mode ────────────────────────────────────

  it("passes elicitation to handler when provided", async () => {
    const handler: QuestionHandler = vi.fn().mockResolvedValue({
      action: "accept",
      answers: { name: "my-project", useTypeScript: "true" },
    } satisfies QuestionResult);
    setQuestionHandler(handler);

    const result = await tool.execute(
      {
        elicitation: {
          message: "Configure your project",
          requestedSchema: {
            type: "object" as const,
            properties: {
              name: { type: "string" as const, title: "Project name" },
              useTypeScript: {
                type: "boolean" as const,
                title: "Use TypeScript?",
                default: true,
              },
            },
            required: ["name"],
          },
        },
      },
      { signal: new AbortController().signal, toolCallId: "test-elicit" },
    );

    expect(handler).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        message: "Configure your project",
        requestedSchema: expect.objectContaining({
          properties: expect.objectContaining({
            name: expect.objectContaining({ type: "string" }),
          }),
        }),
      }),
    );
    expect(result).toContain('"name"="my-project"');
  });
});
