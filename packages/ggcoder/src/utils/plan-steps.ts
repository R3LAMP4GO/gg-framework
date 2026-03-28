/**
 * Plan step extraction and [DONE:n] progress tracking.
 *
 * The agent outputs [DONE:n] markers in its text to signal that step n
 * of the approved plan has been completed.  The UI parses these markers
 * and renders a progress widget.
 */

export interface PlanStep {
  /** 1-based step number */
  step: number;
  /** Short description extracted from the plan */
  text: string;
  completed: boolean;
}

/**
 * Extract numbered steps from a plan markdown string.
 *
 * Looks for lines like:
 *   1. Do something
 *   2) Do something else
 *   3. **Bold step**
 *
 * Only top-level numbered items are extracted (not nested sub-items).
 */
export function extractPlanSteps(planContent: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const pattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

  for (const match of planContent.matchAll(pattern)) {
    let text = match[2]
      .trim()
      .replace(/\*{1,2}$/, "")
      .trim();
    // Skip very short items, code snippets, or sub-items
    if (text.length <= 5 || text.startsWith("`") || text.startsWith("/") || text.startsWith("-")) {
      continue;
    }
    // Truncate long step descriptions
    if (text.length > 80) {
      text = text.slice(0, 77) + "...";
    }
    steps.push({ step: steps.length + 1, text, completed: false });
  }

  return steps;
}

/**
 * Scan text for [DONE:n] markers and return the set of completed step numbers.
 */
export function findCompletedMarkers(text: string): Set<number> {
  const completed = new Set<number>();
  const pattern = /\[DONE:(\d+)\]/gi;
  for (const match of text.matchAll(pattern)) {
    completed.add(parseInt(match[1], 10));
  }
  return completed;
}

/**
 * Apply completed markers to a steps array (immutable — returns new array).
 */
export function markStepsCompleted(steps: PlanStep[], completed: Set<number>): PlanStep[] {
  let changed = false;
  const result = steps.map((s) => {
    if (completed.has(s.step) && !s.completed) {
      changed = true;
      return { ...s, completed: true };
    }
    return s;
  });
  return changed ? result : steps;
}
