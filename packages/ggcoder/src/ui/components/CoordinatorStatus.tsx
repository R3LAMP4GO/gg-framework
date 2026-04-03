/**
 * Coordinator mode status indicator — shows in footer when coordinator is active.
 * Displays worker count and phase.
 */
import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";

interface CoordinatorStatusProps {
  workerCount: number;
  runningCount: number;
  completedCount: number;
  phase: string;
}

export function CoordinatorStatus({
  workerCount,
  runningCount,
  completedCount,
  phase,
}: CoordinatorStatusProps) {
  const theme = useTheme();

  if (workerCount === 0) {
    return (
      <Box>
        <Text color={theme.accent} bold>
          {"⚡ Coordinator"}
        </Text>
        <Text color={theme.textDim}>{" · idle"}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={theme.accent} bold>
        {"⚡ Coordinator"}
      </Text>
      <Text color={theme.textDim}>
        {" · "}
        {phase}
        {" · "}
      </Text>
      {runningCount > 0 && (
        <Text color={theme.planPrimary}>
          {runningCount} running
        </Text>
      )}
      {runningCount > 0 && completedCount > 0 && (
        <Text color={theme.textDim}>{" · "}</Text>
      )}
      {completedCount > 0 && (
        <Text color={theme.success}>
          {completedCount}/{workerCount} done
        </Text>
      )}
    </Box>
  );
}
