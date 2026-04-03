/**
 * Adversarial Verification Agent — ported from CC.
 *
 * After 3+ file edits, spawns an independent read-only subagent that
 * tries to break the implementation. Returns PASS/FAIL/PARTIAL verdict.
 * The main agent cannot self-assign PASS.
 */

import { log } from "./logger.js";

const FILE_EDIT_THRESHOLD = 3;

/** Track edited files during a session for verification trigger */
export class VerificationTracker {
  private editedFiles = new Set<string>();

  trackEdit(filePath: string): void {
    this.editedFiles.add(filePath);
  }

  get editCount(): number {
    return this.editedFiles.size;
  }

  shouldVerify(): boolean {
    return this.editedFiles.size >= FILE_EDIT_THRESHOLD;
  }

  getEditedFiles(): string[] {
    return [...this.editedFiles];
  }

  reset(): void {
    this.editedFiles.clear();
  }
}

/**
 * Build the verification agent prompt.
 * The verifier is read-only — cannot edit project files.
 * Must return VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL.
 */
export function buildVerificationPrompt(
  task: string,
  editedFiles: string[],
): string {
  return `# Adversarial Verification

You are a verification agent. Your job is to independently verify that recent changes are correct. You are READ-ONLY — you cannot edit project files.

## Task that was implemented
${task}

## Files that were modified
${editedFiles.map((f) => `- ${f}`).join("\n")}

## Your verification process

1. **Read the modified files** — understand what changed
2. **Run tests** — execute the project's test suite via bash
3. **Run type checks** — if available (tsc, pyright, go vet, etc.)
4. **Adversarial probing** — try at least ONE thing to break the implementation:
   - Boundary values, edge cases, empty inputs
   - Concurrent access, race conditions
   - Missing error handling
   - Incorrect wiring (imports, exports, route registration)

## Verdict rules

- **VERDICT: PASS** — all checks pass, at least one adversarial probe attempted, no issues found
- **VERDICT: FAIL** — detected broken behavior with evidence and reproduction steps
- **VERDICT: PARTIAL** — environmental limitations prevent full verification (e.g., can't start server, missing deps)

## Constraints
- Do NOT create, modify, or delete project files
- Do NOT install dependencies or run git operations
- You MAY run tests, type checks, and read-only bash commands
- You MAY write ephemeral scripts to /tmp for testing

## Output
End your response with exactly one of:
\`VERDICT: PASS\`
\`VERDICT: FAIL\`
\`VERDICT: PARTIAL\`

If FAIL, include evidence and reproduction steps before the verdict.`;
}

export type Verdict = "PASS" | "FAIL" | "PARTIAL" | "SKIPPED";

/** Parse a verdict from verification agent output */
export function parseVerdict(output: string): Verdict {
  const upper = output.toUpperCase();
  if (upper.includes("VERDICT: PASS")) return "PASS";
  if (upper.includes("VERDICT: FAIL")) return "FAIL";
  if (upper.includes("VERDICT: PARTIAL")) return "PARTIAL";
  log("WARN", "verification", "No verdict found in verification output");
  return "PARTIAL"; // Default to partial if no verdict found
}
