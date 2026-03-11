/**
 * Plan review overlay — shown when the agent submits a plan for user review.
 *
 * Arrow-navigable actions (Claude Code-style):
 *   Approve  — execute the plan
 *   Edit     — open in editor
 *   Reject   — provide feedback, agent revises
 *   Cancel   — discard the plan entirely
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

const ACTIONS = ["approve", "edit", "reject", "cancel"] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_LABELS: Record<Action, string> = {
  approve: "Approve",
  edit: "Edit",
  reject: "Reject",
  cancel: "Cancel",
};

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
  const [selectedAction, setSelectedAction] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [cursor, setCursor] = useState(0);

  const actionColors: Record<Action, string> = {
    approve: theme.success,
    edit: theme.accent,
    reject: theme.warning,
    cancel: theme.error,
  };

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
          upArrow?: boolean;
          downArrow?: boolean;
          ctrl?: boolean;
        },
      ) => {
        if (phase === "review") {
          // Arrow navigation between actions
          if (key.rightArrow || key.downArrow) {
            setSelectedAction((i) => Math.min(ACTIONS.length - 1, i + 1));
            return;
          }
          if (key.leftArrow || key.upArrow) {
            setSelectedAction((i) => Math.max(0, i - 1));
            return;
          }

          // Enter to execute selected action
          if (key.return) {
            const action = ACTIONS[selectedAction];
            switch (action) {
              case "approve":
                onApprove();
                break;
              case "edit":
                setPhase("editing");
                onEdit().then(() => setPhase("review"));
                break;
              case "reject":
                setPhase("feedback");
                break;
              case "cancel":
                onCancel();
                break;
            }
            return;
          }

          if (key.escape) {
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
      [phase, feedback, cursor, selectedAction, onApprove, onReject, onCancel, onEdit],
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

      {/* Actions */}
      {phase === "review" ? (
        <Box flexDirection="column">
          <Box>
            {ACTIONS.map((action, i) => {
              const isSelected = i === selectedAction;
              const color = actionColors[action];
              return (
                <Text
                  key={action}
                  color={isSelected ? theme.text : color}
                  backgroundColor={isSelected ? color : undefined}
                  bold={isSelected}
                >
                  {i > 0 ? "  " : ""}
                  {` ${ACTION_LABELS[action]} `}
                </Text>
              );
            })}
          </Box>
          <Box marginTop={0}>
            <Text color={theme.textDim}>
              {"← → to navigate · Enter to select · Esc to cancel"}
            </Text>
          </Box>
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
