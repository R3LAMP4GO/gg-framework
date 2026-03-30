// rollback.ts — tool for rolling back transactional edits

import path from "node:path";
import { z } from "zod";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import type { EditTransaction } from "../core/edit-transaction.js";

const RollbackParams = z.object({
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set to true to confirm rollback. Without confirmation, shows what would be rolled back.",
    ),
});

export function createRollbackTool(
  cwd: string,
  transactionRef: { current: EditTransaction | null },
): AgentTool<typeof RollbackParams> {
  return {
    name: "rollback",
    description:
      "Roll back file changes made in this session to their original state. " +
      "Use when edits have gone wrong and you want to start fresh. " +
      "Call without confirm=true first to preview what will be rolled back.",
    parameters: RollbackParams,
    async execute({ confirm }) {
      const tx = transactionRef.current;
      if (!tx || !tx.hasSnapshots) {
        return "No active transaction — nothing to roll back.";
      }

      if (!confirm) {
        return `Transaction has ${tx.fileCount} file(s) that can be rolled back. Set confirm=true to restore originals.`;
      }

      const rolledBack = await tx.rollback();
      const relPaths = rolledBack.map((f) => path.relative(cwd, f));
      return `Rolled back ${rolledBack.length} file(s):\n${relPaths.map((f) => `  - ${f}`).join("\n")}`;
    },
  };
}
