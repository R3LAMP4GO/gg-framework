// typecheck.ts — voluntary typecheck tool

import { z } from "zod";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { detectProjectTypes, runDiagnostics, formatDiagnostics } from "./diagnostics.js";

const TypecheckParams = z.object({
  scope: z
    .enum(["project", "auto"])
    .optional()
    .describe("Scope: 'project' for full project check, 'auto' to detect (default: auto)"),
});

export function createTypecheckTool(cwd: string): AgentTool<typeof TypecheckParams> {
  return {
    name: "typecheck",
    description:
      "Run type checking / static analysis for the project. " +
      "Auto-detects the project type (TypeScript, Python, Go, Rust, Java, C#) and runs " +
      "the appropriate diagnostic command. Returns errors found.",
    parameters: TypecheckParams,
    async execute(_args, context) {
      const projectTypes = await detectProjectTypes(cwd);
      if (projectTypes.length === 0) {
        return "No recognized project type found (no tsconfig.json, pyproject.toml, go.mod, Cargo.toml, etc.)";
      }

      const results: string[] = [];
      for (const pt of projectTypes) {
        const diagnostics = await runDiagnostics(pt, context.signal);
        if (diagnostics.length === 0) {
          results.push(`${pt.language}: no errors`);
        } else {
          const formatted = formatDiagnostics(diagnostics);
          results.push(`${pt.language} (${diagnostics.length} error(s)):\n${formatted}`);
        }
      }

      return results.join("\n\n");
    },
  };
}
