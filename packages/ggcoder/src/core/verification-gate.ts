/**
 * Verification Gate — mechanically blocks the agent from declaring "done"
 * until verification commands (test/lint/typecheck) have been run after edits.
 *
 * Integrates into the agent loop via getSteeringMessages. When the LLM tries
 * to stop, the gate checks whether edits were made and verification was run.
 * If not, it injects a steering message forcing the agent to verify first.
 *
 * One nudge only — if the LLM tries to stop again after being nudged,
 * the gate allows exit (prevents infinite loops).
 */

export class VerificationGate {
  private editedFiles = new Set<string>();
  private verificationRan = false;
  private lastToolHadErrors = false;
  private nudgeSentForVerification = false;
  private nudgeSentForErrors = false;

  /** Record a file edit/write. Resets verification state. */
  recordEdit(filePath: string): void {
    this.editedFiles.add(filePath);
    this.verificationRan = false;
    this.nudgeSentForVerification = false;
  }

  /** Record a bash command. Detects verification patterns. */
  recordBashCommand(command: string): void {
    if (isVerificationCommand(command)) {
      this.verificationRan = true;
    }
  }

  /** Record whether the last tool result had errors or warnings. */
  recordToolResult(result: string, isError: boolean): void {
    this.lastToolHadErrors = isError || result.includes("⚠ Wiring:") || hasErrorIndicators(result);
  }

  /**
   * Get a steering message if the agent should not stop yet.
   * Returns null if the agent is clear to finish.
   */
  getSteeringMessage(): string | null {
    // Check 1: tool errors/warnings not yet addressed
    if (this.lastToolHadErrors) {
      if (this.nudgeSentForErrors) {
        // Already nudged once — allow exit
        this.nudgeSentForErrors = false;
        this.lastToolHadErrors = false;
        return null;
      }
      this.nudgeSentForErrors = true;
      return (
        "[System] Your last tool call produced errors or warnings. " +
        "Review and fix them before finishing."
      );
    }

    // Check 2: files edited but no verification run
    if (this.editedFiles.size > 0 && !this.verificationRan) {
      if (this.nudgeSentForVerification) {
        // Already nudged once — allow exit
        this.nudgeSentForVerification = false;
        return null;
      }
      this.nudgeSentForVerification = true;
      const fileCount = this.editedFiles.size;
      return (
        `[System] You modified ${fileCount} file(s) but haven't run verification ` +
        `(test, lint, or typecheck). Run the project's check commands before finishing.`
      );
    }

    return null;
  }

  /** Reset all gate state. Call at the start of each run. */
  reset(): void {
    this.editedFiles.clear();
    this.verificationRan = false;
    this.lastToolHadErrors = false;
    this.nudgeSentForVerification = false;
    this.nudgeSentForErrors = false;
  }

  /** Whether any files have been edited this session. */
  get hasEdits(): boolean {
    return this.editedFiles.size > 0;
  }
}

/** Detect verification commands from bash tool invocations. */
function isVerificationCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return VERIFICATION_PATTERNS.some((p) => p.test(lower));
}

const VERIFICATION_PATTERNS = [
  // JS/TS ecosystem
  /\btsc\b/,
  /\bvitest\b/,
  /\bjest\b/,
  /\beslint\b/,
  /\bbiome\b/,
  /\bprettier\b.*--check/,
  /\bpnpm\s+(check|test|lint)\b/,
  /\bnpm\s+(test|run\s+(lint|check|typecheck|test))\b/,
  /\byarn\s+(test|lint|check|typecheck)\b/,
  /\bbun\s+test\b/,
  /\bdeno\s+(check|test)\b/,
  // Python
  /\bpytest\b/,
  /\bmypy\b/,
  /\bpyright\b/,
  /\bruff\s+check\b/,
  /\bflake8\b/,
  /\bpylint\b/,
  /\bpython\s+-m\s+(pytest|mypy|pyright|unittest)\b/,
  // Go
  /\bgo\s+(test|vet)\b/,
  /\bgolangci-lint\b/,
  // Rust
  /\bcargo\s+(check|test|clippy)\b/,
  // Java/JVM
  /\bmvn\s+(compile|test|verify)\b/,
  /\bgradle\s*(compile|test|check)\b/,
  // C#/.NET
  /\bdotnet\s+(build|test)\b/,
  // Generic
  /\bmake\s+(test|check|lint)\b/,
];

/** Detect error indicators in bash output (non-zero exit, common error patterns). */
function hasErrorIndicators(result: string): boolean {
  // Check for non-zero exit code in bash output
  const exitMatch = result.match(/^Exit code:\s*(.+)$/m);
  if (exitMatch) {
    const code = exitMatch[1].trim();
    if (code !== "0" && code !== "KILLED") {
      return true;
    }
  }
  return false;
}
