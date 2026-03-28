import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";
import type { PlanStep } from "../../utils/plan-steps.js";

interface PlanProgressProps {
  steps: PlanStep[];
}

export function PlanProgress({ steps }: PlanProgressProps) {
  const theme = useTheme();

  if (steps.length === 0) return null;

  const done = steps.filter((s) => s.completed).length;
  const total = steps.length;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={0}>
      <Box>
        <Text color={theme.planPrimary} bold>
          {"Plan Progress "}
        </Text>
        <Text color={theme.textDim}>
          {"("}
          {done}/{total}
          {")"}
        </Text>
      </Box>
      {steps.map((step) => (
        <Box key={step.step}>
          <Text color={step.completed ? theme.success : theme.textDim}>
            {step.completed ? " \u2713 " : " \u2500 "}
          </Text>
          <Text color={step.completed ? theme.textDim : theme.text} strikethrough={step.completed}>
            {step.step}. {step.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
