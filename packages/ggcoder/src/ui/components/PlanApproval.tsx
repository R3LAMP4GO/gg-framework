import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { useTheme } from "../theme/theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Markdown } from "./Markdown.js";
import { visualWidth } from "../utils/table-text.js";

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

interface PlanApprovalProps {
  planPath: string;
  planContent: string;
  onDecision: (decision: "approve" | "reject" | "cancel", feedback?: string) => void;
}

export function PlanApproval({ planPath, planContent, onDecision }: PlanApprovalProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const [mode, setMode] = useState<"prompt" | "feedback">("prompt");
  const [feedback, setFeedback] = useState("");

  useInput((input, key) => {
    if (mode === "feedback") {
      if (key.return) {
        onDecision("reject", feedback);
        return;
      }
      if (key.escape) {
        setMode("prompt");
        setFeedback("");
        return;
      }
      if (key.backspace || key.delete) {
        setFeedback((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setFeedback((prev) => prev + input);
      }
      return;
    }

    // Prompt mode
    const lower = input.toLowerCase();
    if (lower === "a") {
      onDecision("approve");
    } else if (lower === "r") {
      setMode("feedback");
    } else if (lower === "c" || key.escape) {
      onDecision("cancel");
    }
  });

  const innerWidth = Math.max(ART_VISUAL_WIDTH, columns - FRAME_OVERHEAD);
  const statusContent = "Review plan · Awaiting your decision";

  return (
    <Box flexDirection="column" marginTop={1} width={columns}>
      {/* ASCII art header — pure strings, no nested <Text> */}
      <Text color={theme.planPrimary}>{"╔" + "═".repeat(innerWidth + 2) + "╗"}</Text>
      <Text color={theme.planPrimary}>{frameLine(ART_LINE_1, innerWidth)}</Text>
      <Text color={theme.planPrimary}>{frameLine(ART_LINE_2, innerWidth)}</Text>
      <Text color={theme.planPrimary}>{"╠" + "═".repeat(innerWidth + 2) + "╣"}</Text>
      <Text color={theme.planPrimary}>{frameLine(statusContent, innerWidth)}</Text>
      <Text color={theme.planPrimary}>{"╚" + "═".repeat(innerWidth + 2) + "╝"}</Text>

      {/* Plan path */}
      <Box marginTop={1}>
        <Text color={theme.textDim}>{"Plan: "}</Text>
        <Text color={theme.planPrimary}>{planPath}</Text>
      </Box>

      {/* Plan content */}
      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={theme.planBorder}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
      >
        <Markdown>{planContent}</Markdown>
      </Box>

      {/* Action prompt */}
      {mode === "prompt" ? (
        <Box marginTop={1}>
          <Text color={theme.planPrimary} bold>
            {"[A]"}
          </Text>
          <Text color={theme.text}>{"pprove  "}</Text>
          <Text color={theme.planPrimary} bold>
            {"[R]"}
          </Text>
          <Text color={theme.text}>{"eject with feedback  "}</Text>
          <Text color={theme.planPrimary} bold>
            {"[C]"}
          </Text>
          <Text color={theme.text}>{"ancel"}</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.planPrimary}>{"Feedback (Enter to submit, Esc to cancel):"}</Text>
          <Box>
            <Text color={theme.text}>
              {"> "}
              {feedback}
              {"\u258D"}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
