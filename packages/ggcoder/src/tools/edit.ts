import path from "node:path";
import { z } from "zod";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { resolvePath, rejectSymlink } from "./path-utils.js";
import { fuzzyFindText, countOccurrences, generateDiff } from "./edit-diff.js";
import { localOperations, type ToolOperations } from "./operations.js";
import { checkImportsResolve, checkMissingImports, formatWarnings } from "./wiring-checks.js";
import type { EditTransaction } from "../core/edit-transaction.js";
import type { TSLanguageService } from "../core/ts-language-service.js";

const EditParams = z.object({
  file_path: z.string().describe("The file path to edit"),
  old_text: z.string().describe("The exact text to find and replace"),
  new_text: z.string().describe("The replacement text"),
});

export function createEditTool(
  cwd: string,
  readFiles?: Set<string>,
  ops: ToolOperations = localOperations,
  planModeRef?: { current: boolean },
  transactionRef?: { current: EditTransaction | null },
  tsService?: TSLanguageService,
): AgentTool<typeof EditParams> {
  return {
    name: "edit",
    description:
      "Replace a specific text string in a file. The file must be read first before editing. " +
      "The old_text must uniquely match exactly one location in the file. Returns a unified diff of the change.",
    parameters: EditParams,
    async execute({ file_path, old_text, new_text }) {
      if (planModeRef?.current) {
        return "Error: edit is restricted in plan mode. Use read-only tools to explore the codebase, then write your plan to .gg/plans/.";
      }
      const resolved = resolvePath(cwd, file_path);
      await rejectSymlink(resolved);

      if (readFiles && !readFiles.has(resolved)) {
        throw new Error("File must be read first before editing. Use the read tool first.");
      }

      const content = await ops.readFile(resolved);

      // Detect line endings
      const hasCRLF = content.includes("\r\n");

      // Normalize for matching
      const normalized = hasCRLF ? content.replace(/\r\n/g, "\n") : content;
      const normalizedOld = hasCRLF ? old_text.replace(/\r\n/g, "\n") : old_text;
      const normalizedNew = hasCRLF ? new_text.replace(/\r\n/g, "\n") : new_text;

      // Check uniqueness
      const occurrences = countOccurrences(normalized, normalizedOld);
      if (occurrences === 0) {
        throw new Error(
          `old_text not found in ${path.basename(resolved)}. ` +
            "Make sure the text matches exactly, including whitespace and indentation.",
        );
      }
      if (occurrences > 1) {
        throw new Error(
          `old_text found ${occurrences} times in ${path.basename(resolved)}. ` +
            "Include more surrounding context to make the match unique.",
        );
      }

      // Find and replace
      const match = fuzzyFindText(normalized, normalizedOld);
      if (!match.found) {
        throw new Error(`old_text not found in ${path.basename(resolved)}.`);
      }

      const newContent =
        normalized.slice(0, match.index) +
        normalizedNew +
        normalized.slice(match.index + match.matchLength);

      // Restore line endings if needed
      const finalContent = hasCRLF ? newContent.replace(/\n/g, "\r\n") : newContent;

      if (transactionRef?.current) {
        await transactionRef.current.recordSnapshot(resolved);
      }
      await ops.writeFile(resolved, finalContent);

      const relPath = path.relative(cwd, resolved);
      const diff = generateDiff(normalized, newContent, relPath);

      // Collect all warnings (parallel — independent checks)
      const allWarnings: string[] = [];
      const ext = path.extname(resolved).toLowerCase();
      const isCodeFile = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"].includes(ext);
      const isTsFile = tsService && /\.tsx?$/.test(resolved);

      if (isTsFile) tsService!.notifyFileChanged(resolved);

      const [wiringWarnings, tsDiags] = await Promise.all([
        isCodeFile ? checkImportsResolve(newContent, resolved, cwd, ops) : Promise.resolve([]),
        isTsFile
          ? Promise.resolve(tsService!.getDiagnostics(resolved))
          : Promise.resolve(
              [] as { file: string; line: number; column: number; message: string; code: number }[],
            ),
      ]);

      const wiringText = formatWarnings(wiringWarnings);
      if (wiringText) allWarnings.push(wiringText);

      const importWarnings = isCodeFile ? checkMissingImports(resolved, new_text, newContent) : [];
      if (importWarnings.length > 0) allWarnings.push(importWarnings.join("\n"));

      if (tsDiags.length > 0) {
        const tsDiagText = tsService!.formatDiagnostics(tsDiags);
        if (tsDiagText) allWarnings.push(tsDiagText);
      }

      const warningsSuffix = allWarnings.length > 0 ? `\n\n${allWarnings.join("\n")}` : "";
      return {
        content: `Successfully replaced text in ${relPath}.${warningsSuffix}`,
        details: { diff },
      };
    },
  };
}
