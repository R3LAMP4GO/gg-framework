import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { visualWidth } from "../utils/table-text.js";

interface PlanBannerProps {
  status?: "researching" | "drafting" | "awaiting_approval";
}

const ART_LINE_1 = " ▀█▀ █ █ █▀▀   █▀█ █   █▀█ █▄ █";
const ART_LINE_2 = "  █  █▀█ ██▄   █▀▀ █▄▄ █▀█ █ ▀█";

// Use visual width (not .length) so padding is correct on all terminals
const ART_VISUAL_WIDTH = visualWidth(ART_LINE_1);

// ║ + space on each side = 4
const FRAME_OVERHEAD = 4;

function frameLine(content: string, innerWidth: number): string {
  const contentVisual = visualWidth(content);
  const pad = Math.max(0, innerWidth - contentVisual);
  return "║ " + content + " ".repeat(pad) + " ║";
}

export function PlanBanner({ status = "researching" }: PlanBannerProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();

  const statusText =
    status === "awaiting_approval"
      ? "Awaiting approval..."
      : status === "drafting"
        ? "Drafting plan..."
        : "Researching...";

  // Scale the frame to terminal width, but never narrower than the ASCII art
  const innerWidth = Math.max(ART_VISUAL_WIDTH, columns - FRAME_OVERHEAD);

  const statusContent = "Read-only mode · " + statusText;

  return (
    <Box flexDirection="column" marginTop={1} width={columns}>
      <Text color={theme.planPrimary}>{"╔" + "═".repeat(innerWidth + 2) + "╗"}</Text>
      <Text color={theme.planPrimary}>{frameLine(ART_LINE_1, innerWidth)}</Text>
      <Text color={theme.planPrimary}>{frameLine(ART_LINE_2, innerWidth)}</Text>
      <Text color={theme.planPrimary}>{"╠" + "═".repeat(innerWidth + 2) + "╣"}</Text>
      <Text color={theme.planPrimary}>{frameLine(statusContent, innerWidth)}</Text>
      <Text color={theme.planPrimary}>{"╚" + "═".repeat(innerWidth + 2) + "╝"}</Text>
    </Box>
  );
}
