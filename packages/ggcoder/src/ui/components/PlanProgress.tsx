import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { PlanStep } from "../../utils/plan-steps.js";

interface PlanProgressProps {
  steps: PlanStep[];
}

export function PlanProgress({ steps }: PlanProgressProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();

  if (steps.length === 0) return null;

  const done = steps.filter((s) => s.completed).length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const revised = steps.filter((s) => s.status === "revised").length;
  const total = steps.length;
  const current = steps.find((s) => !s.completed);

  // Compact progress bar with per-step colors
  const barWidth = Math.min(total, 20);
  const barChars: string[] = [];
  for (let i = 0; i < barWidth; i++) {
    const stepIdx = Math.floor((i / barWidth) * total);
    const step = steps[stepIdx];
    if (step?.completed) {
      barChars.push("\u2588"); // Filled block
    } else {
      barChars.push("\u2591"); // Empty block
    }
  }

  const countStr = `${done}/${total}`;
  const fixedWidth = 5 + barWidth + 1 + countStr.length + 1;
  const stepPrefix = current ? `\u2500 ${current.step}. ` : "";
  const availableForText = columns - fixedWidth - stepPrefix.length - 1;

  let stepText = current?.text ?? "";
  if (stepText.length > availableForText) {
    stepText = availableForText > 4 ? stepText.slice(0, availableForText - 3) + "..." : "";
  }

  // Status summary for skips/revisions
  const statusParts: string[] = [];
  if (skipped > 0) statusParts.push(`${skipped} skipped`);
  if (revised > 0) statusParts.push(`${revised} revised`);
  const statusSuffix = statusParts.length > 0 ? ` (${statusParts.join(", ")})` : "";

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={0}>
      <Box gap={1}>
        <Text color={theme.planPrimary} bold>
          Plan
        </Text>
        <Text color={done === total ? theme.success : theme.planPrimary}>
          {barChars.join("")}
        </Text>
        <Text color={theme.textDim}>
          {countStr}
          {statusSuffix}
        </Text>
        {current && stepText && (
          <Text color={theme.textDim}>
            {stepPrefix}
            {stepText}
          </Text>
        )}
        {done === total && (
          <Text color={theme.success} bold>
            {"\u2713 Done"}
          </Text>
        )}
      </Box>
    </Box>
  );
}
