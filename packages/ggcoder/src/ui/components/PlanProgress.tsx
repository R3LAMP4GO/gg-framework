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
  const total = steps.length;
  const current = steps.find((s) => !s.completed);

  // Compact progress bar
  const barWidth = Math.min(total, 20);
  const filledWidth = Math.round((done / total) * barWidth);
  const bar = "\u2588".repeat(filledWidth) + "\u2591".repeat(barWidth - filledWidth);

  // Calculate available space for current step text
  // "Plan " (5) + bar (barWidth) + " " (1) + "n/n" (count) + " \u2500 n. " (prefix ~6)
  const countStr = `${done}/${total}`;
  const fixedWidth = 5 + barWidth + 1 + countStr.length + 1;
  const stepPrefix = current ? `\u2500 ${current.step}. ` : "";
  const availableForText = columns - fixedWidth - stepPrefix.length - 1;

  let stepText = current?.text ?? "";
  if (stepText.length > availableForText) {
    stepText = availableForText > 4 ? stepText.slice(0, availableForText - 3) + "..." : "";
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={0}>
      <Box gap={1}>
        <Text color={theme.planPrimary} bold>
          Plan
        </Text>
        <Text color={done === total ? theme.success : theme.planPrimary}>{bar}</Text>
        <Text color={theme.textDim}>{countStr}</Text>
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
