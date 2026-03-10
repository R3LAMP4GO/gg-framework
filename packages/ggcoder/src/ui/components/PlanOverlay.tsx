/**
 * Plan review overlay — shown when the agent submits a plan for user review.
 *
 * The user can:
 *   [a] approve — execute the plan
 *   [r] reject  — provide feedback, agent revises
 *   [c] cancel  — discard the plan entirely
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";

interface PlanOverlayProps {
  planContent: string;
  planFilePath: string | null;
  onApprove: () => void;
  onReject: (feedback: string) => void;
  onCancel: () => void;
  onEdit: () => Promise<void>;
}

type Phase = "review" | "feedback" | "editing";

export function PlanOverlay({
  planContent,
  planFilePath,
  onApprove,
  onReject,
  onCancel,
  onEdit,
}: PlanOverlayProps) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>("review");
  const [feedback, setFeedback] = useState("");
  const [cursor, setCursor] = useState(0);

  useInput(
    useCallback(
      (
        input: string,
        key: {
          return?: boolean;
          backspace?: boolean;
          delete?: boolean;
          escape?: boolean;
          leftArrow?: boolean;
          rightArrow?: boolean;
          ctrl?: boolean;
        },
      ) => {
        if (phase === "review") {
          const lower = input.toLowerCase();
          if (lower === "a") {
            onApprove();
            return;
          }
          if (lower === "r") {
            setPhase("feedback");
            return;
          }
          if (lower === "g") {
            setPhase("editing");
            onEdit().then(() => {
              setPhase("review");
            });
            return;
          }
          if (lower === "c" || key.escape) {
            onCancel();
            return;
          }
          return;
        }

        // Feedback input phase
        if (key.escape) {
          setPhase("review");
          setFeedback("");
          setCursor(0);
          return;
        }
        if (key.return) {
          if (feedback.trim()) {
            onReject(feedback.trim());
          }
          return;
        }
        if (key.backspace || key.delete) {
          if (cursor > 0) {
            setFeedback((f) => f.slice(0, cursor - 1) + f.slice(cursor));
            setCursor((c) => c - 1);
          }
          return;
        }
        if (key.leftArrow) {
          setCursor((c) => Math.max(0, c - 1));
          return;
        }
        if (key.rightArrow) {
          setCursor((c) => Math.min(feedback.length, c + 1));
          return;
        }
        if (key.ctrl && input === "c") {
          onCancel();
          return;
        }
        if (input) {
          setFeedback((f) => f.slice(0, cursor) + input + f.slice(cursor));
          setCursor((c) => c + input.length);
        }
      },
      [phase, feedback, cursor, onApprove, onReject, onCancel, onEdit],
    ),
  );

  // Show at most 30 lines of the plan to keep the overlay manageable
  const planLines = planContent.split("\n");
  const maxLines = 30;
  const truncatedPlan =
    planLines.length > maxLines
      ? planLines.slice(0, maxLines).join("\n") +
        `\n\n... (${planLines.length - maxLines} more lines)`
      : planContent;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.accent}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={theme.accent} bold>
          {"📋 Plan Ready for Review"}
        </Text>
      </Box>

      {/* Plan content */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text} wrap="wrap">
          {truncatedPlan}
        </Text>
      </Box>

      {/* File path */}
      {planFilePath && (
        <Box marginBottom={1}>
          <Text color={theme.textDim}>Saved to: {planFilePath}</Text>
        </Box>
      )}

      {/* Actions or feedback input */}
      {phase === "review" ? (
        <Box>
          <Text color={theme.success} bold>
            [a]
          </Text>
          <Text color={theme.text}>pprove </Text>
          <Text color={theme.warning} bold>
            [r]
          </Text>
          <Text color={theme.text}>eject </Text>
          <Text color={theme.accent} bold>
            [g]
          </Text>
          <Text color={theme.text}> edit </Text>
          <Text color={theme.error} bold>
            [c]
          </Text>
          <Text color={theme.text}>ancel</Text>
        </Box>
      ) : phase === "editing" ? (
        <Box>
          <Text color={theme.accent}>Opening in editor…</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color={theme.warning}>
            Feedback for revision (Enter to submit, Esc to go back):
          </Text>
          <Box>
            <Text color={theme.inputPrompt} bold>
              {"❯ "}
            </Text>
            <Text color={theme.text}>{feedback}</Text>
            <Text inverse> </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
