import { describe, it, expect } from "vitest";
import {
  extractPlanSteps,
  findCompletedMarkers,
  findProgressMarkers,
  applyProgressMarkers,
  markStepsCompleted,
  stripDoneMarkers,
} from "./plan-steps.js";

describe("extractPlanSteps", () => {
  it("extracts numbered steps from ## Steps section", () => {
    const plan = `# Plan\n\nSome intro.\n\n## Steps\n\n1. Create types\n2. Build API\n3. Add tests\n`;
    const steps = extractPlanSteps(plan);
    expect(steps).toHaveLength(3);
    expect(steps[0].step).toBe(1);
    expect(steps[0].text).toBe("Create types");
    expect(steps[0].status).toBe("pending");
    expect(steps[0].completed).toBe(false);
  });

  it("skips short items and code snippets", () => {
    const plan = `## Steps\n\n1. Do this\n2. \`x\`\n3. Build it properly\n`;
    const steps = extractPlanSteps(plan);
    expect(steps).toHaveLength(2); // skips "`x`"
  });
});

describe("findCompletedMarkers", () => {
  it("finds DONE markers", () => {
    const completed = findCompletedMarkers("Done [DONE:1] and [DONE:3]");
    expect(completed.has(1)).toBe(true);
    expect(completed.has(3)).toBe(true);
    expect(completed.has(2)).toBe(false);
  });

  it("also counts SKIP and REVISED as completed", () => {
    const completed = findCompletedMarkers("[SKIP:2 not needed] [REVISED:4 used existing]");
    expect(completed.has(2)).toBe(true);
    expect(completed.has(4)).toBe(true);
  });
});

describe("findProgressMarkers", () => {
  it("parses DONE markers", () => {
    const markers = findProgressMarkers("[DONE:1] [DONE:2]");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toEqual({ type: "done", step: 1 });
    expect(markers[1]).toEqual({ type: "done", step: 2 });
  });

  it("parses SKIP markers with reason", () => {
    const markers = findProgressMarkers("[SKIP:3 not needed because X already exists]");
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe("skipped");
    expect(markers[0].step).toBe(3);
    expect(markers[0].detail).toBe("not needed because X already exists");
  });

  it("parses REVISED markers with approach", () => {
    const markers = findProgressMarkers("[REVISED:5 used existing util instead of creating new]");
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe("revised");
    expect(markers[0].step).toBe(5);
    expect(markers[0].detail).toContain("used existing util");
  });

  it("handles mixed markers", () => {
    const text = "[DONE:1] [SKIP:2 skipped] [REVISED:3 changed] [DONE:4]";
    const markers = findProgressMarkers(text);
    expect(markers).toHaveLength(4);
    // findProgressMarkers processes all DONEs first, then SKIPs, then REVISEDs
    expect(markers.map((m) => m.type)).toEqual(["done", "done", "skipped", "revised"]);
  });

  it("returns empty for no markers", () => {
    expect(findProgressMarkers("just regular text")).toHaveLength(0);
  });
});

describe("applyProgressMarkers", () => {
  const steps = [
    { step: 1, text: "Step 1", completed: false, status: "pending" as const },
    { step: 2, text: "Step 2", completed: false, status: "pending" as const },
    { step: 3, text: "Step 3", completed: false, status: "pending" as const },
  ];

  it("applies done markers", () => {
    const markers = [{ type: "done" as const, step: 1 }];
    const result = applyProgressMarkers(steps, markers);
    expect(result[0].status).toBe("done");
    expect(result[0].completed).toBe(true);
    expect(result[1].status).toBe("pending");
  });

  it("applies skip markers with detail", () => {
    const markers = [{ type: "skipped" as const, step: 2, detail: "not needed" }];
    const result = applyProgressMarkers(steps, markers);
    expect(result[1].status).toBe("skipped");
    expect(result[1].statusDetail).toBe("not needed");
    expect(result[1].completed).toBe(true);
  });

  it("applies revised markers with detail", () => {
    const markers = [{ type: "revised" as const, step: 3, detail: "different approach" }];
    const result = applyProgressMarkers(steps, markers);
    expect(result[2].status).toBe("revised");
    expect(result[2].statusDetail).toBe("different approach");
  });

  it("returns same array reference if no changes", () => {
    const result = applyProgressMarkers(steps, []);
    expect(result).toBe(steps);
  });
});

describe("markStepsCompleted", () => {
  it("marks steps as completed", () => {
    const steps = [
      { step: 1, text: "A", completed: false, status: "pending" as const },
      { step: 2, text: "B", completed: false, status: "pending" as const },
    ];
    const result = markStepsCompleted(steps, new Set([1]));
    expect(result[0].completed).toBe(true);
    expect(result[1].completed).toBe(false);
  });

  it("returns same reference if nothing changes", () => {
    const steps = [{ step: 1, text: "A", completed: true, status: "done" as const }];
    const result = markStepsCompleted(steps, new Set([1]));
    expect(result).toBe(steps);
  });
});

describe("stripDoneMarkers", () => {
  it("strips DONE markers", () => {
    expect(stripDoneMarkers("Step done [DONE:1] next")).toBe("Step done next");
  });

  it("strips SKIP markers", () => {
    expect(stripDoneMarkers("Step [SKIP:2 not needed] next")).toBe("Step next");
  });

  it("strips REVISED markers", () => {
    expect(stripDoneMarkers("Step [REVISED:3 changed] next")).toBe("Step next");
  });

  it("handles mixed markers", () => {
    const result = stripDoneMarkers("[DONE:1] [SKIP:2 x] [REVISED:3 y] text");
    expect(result.trim()).toBe("text");
  });
});
