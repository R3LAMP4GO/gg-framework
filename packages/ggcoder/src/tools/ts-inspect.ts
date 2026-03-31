import { z } from "zod";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import type { TSLanguageService } from "../core/ts-language-service.js";

const TSInspectParams = z.object({
  action: z
    .enum(["diagnostics", "hover", "definition"])
    .describe(
      "Action: 'diagnostics' for type errors, 'hover' for type info at position, 'definition' for go-to-definition",
    ),
  file_path: z.string().describe("File path to inspect"),
  line: z.number().optional().describe("Line number (required for hover/definition)"),
  column: z.number().optional().describe("Column number (required for hover/definition)"),
});

export function createTSInspectTool(
  tsService: TSLanguageService,
): AgentTool<typeof TSInspectParams> {
  return {
    name: "ts_inspect",
    description:
      "TypeScript language service — get type errors, hover info, or go-to-definition. " +
      "Works on any TypeScript project with a tsconfig.json.",
    parameters: TSInspectParams,
    async execute({ action, file_path, line, column }) {
      switch (action) {
        case "diagnostics": {
          const diagnostics = tsService.getDiagnostics(file_path);
          if (diagnostics.length === 0) return "No type errors found.";
          return `${diagnostics.length} error(s):\n${tsService.formatDiagnostics(diagnostics)}`;
        }
        case "hover": {
          if (!line || !column) return "Error: line and column required for hover.";
          const info = tsService.getHoverInfo(file_path, line, column);
          if (!info) return "No type info at this position.";
          let result = info.type;
          if (info.documentation) result += `\n\n${info.documentation}`;
          return result;
        }
        case "definition": {
          if (!line || !column) return "Error: line and column required for definition.";
          const defs = tsService.getDefinition(file_path, line, column);
          if (defs.length === 0) return "No definition found.";
          return defs.map((d) => `${d.file}:${d.line}:${d.column}`).join("\n");
        }
      }
    },
  };
}
