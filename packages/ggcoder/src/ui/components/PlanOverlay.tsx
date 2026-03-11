/**
 * Plan review — Claude Code-style inline plan display.
 *
 * Shows the full plan content inline, followed by a numbered option selector:
 *   1. Yes, clear context and bypass permissions
 *   2. Yes, and bypass permissions
 *   3. Yes, manually approve edits
 *   4. Type here to tell GG Coder what to change
 *
 * Option 4 supports inline typing — just arrow down to it and start typing.
 * Arrow up/down always navigates between options (even with text entered).
 * Enter on option 4 submits the feedback. Text is preserved when navigating away.
 */

import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";
import path from "node:path";

const BORDER_COLORS = ["#60a5fa", "#818cf8", "#a78bfa", "#818cf8", "#60a5fa"];

export interface PlanOverlayProps {
  planContent: string;
  planFilePath: string | null;
  onApprove: (options: { clearContext: boolean }) => void;
  onReject: (feedback: string) => void;
  onCancel: () => void;
  onEdit: () => Promise<void>;
}

const FEEDBACK_IDX = 3;

const OPTIONS = [
  "Yes, clear context and bypass permissions",
  "Yes, and bypass permissions",
  "Yes, manually approve edits",
  "Type here to tell GG Coder what to change",
] as const;

export function PlanOverlay({
  planContent,
  planFilePath,
  onApprove,
  onReject,
  onCancel,
  onEdit,
}: PlanOverlayProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false); // only for external editor
  const [selected, setSelected] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [cursor, setCursor] = useState(0);

  const isOnFeedback = selected === FEEDBACK_IDX;

  // Animated border color cycle — same as thinking border in InputArea
  const [borderFrame, setBorderFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setBorderFrame((f) => (f + 1) % BORDER_COLORS.length);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
        if (editing) return;

        // ctrl-g opens editor
        if (key.ctrl && input === "g") {
          setEditing(true);
          onEdit().then(() => setEditing(false));
          return;
        }

        if (key.ctrl && input === "c") {
          onCancel();
          return;
        }

        if (key.escape) {
          if (isOnFeedback && feedback) {
            // Clear feedback text first, then Esc again cancels
            setFeedback("");
            setCursor(0);
            return;
          }
          onCancel();
          return;
        }

        // ── Arrow up/down always navigates options ──
        if (key.downArrow) {
          setSelected((i) => Math.min(OPTIONS.length - 1, i + 1));
          return;
        }
        if (key.upArrow) {
          setSelected((i) => Math.max(0, i - 1));
          return;
        }

        // ── Enter: act on current selection ──
        if (key.return) {
          switch (selected) {
            case 0:
              onApprove({ clearContext: true });
              break;
            case 1:
              onApprove({ clearContext: false });
              break;
            case 2:
              onApprove({ clearContext: false });
              break;
            case FEEDBACK_IDX:
              if (feedback.trim()) {
                onReject(feedback.trim());
              }
              break;
          }
          return;
        }

        // ── When on the feedback option, handle inline text editing ──
        if (isOnFeedback) {
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
          if (input && !key.ctrl) {
            setFeedback((f) => f.slice(0, cursor) + input + f.slice(cursor));
            setCursor((c) => c + input.length);
            return;
          }
        }

        // ── Number keys for quick selection (only when not on feedback or feedback is empty) ──
        if (!isOnFeedback || !feedback) {
          if (input >= "1" && input <= "4") {
            const idx = parseInt(input, 10) - 1;
            setSelected(idx);
            return;
          }
        }
      },
      [feedback, cursor, selected, isOnFeedback, editing, onApprove, onReject, onCancel, onEdit],
    ),
  );

  const planFileName = planFilePath ? path.basename(planFilePath) : null;

  // Render the feedback text with cursor for option 4
  const renderFeedbackText = () => {
    if (!feedback && !isOnFeedback) return null;
    const before = feedback.slice(0, cursor);
    const after = feedback.slice(cursor);
    return (
      <Box>
        <Text color={theme.textDim}>{"     "}</Text>
        <Text color={theme.text}>{before}</Text>
        {isOnFeedback ? <Text inverse>{after[0] ?? " "}</Text> : null}
        {isOnFeedback && after.length > 1 ? <Text color={theme.text}>{after.slice(1)}</Text> : null}
        {!isOnFeedback && after ? <Text color={theme.text}>{after}</Text> : null}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {/* Plan content in animated border box */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={BORDER_COLORS[borderFrame]}
        paddingLeft={1}
        paddingRight={1}
        marginBottom={1}
      >
        {/* Header */}
        <Box marginBottom={1}>
          <Text color={theme.accent} bold>
            Here is GG Coder&apos;s plan:
          </Text>
        </Box>

        {/* Full plan content */}
        <Box flexDirection="column">
          <Text color={theme.text} wrap="wrap">
            {planContent}
          </Text>
        </Box>
      </Box>

      {/* Prompt */}
      <Box marginBottom={1}>
        <Text color={theme.text}>
          GG Coder has written up a plan and is ready to execute. Would you like to proceed?
        </Text>
      </Box>

      {/* Options with inline feedback */}
      {editing ? (
        <Box>
          <Text color={theme.accent}>Opening in editor…</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {OPTIONS.map((label, i) => {
            const isSelected = i === selected;
            const showFeedbackLabel = i === FEEDBACK_IDX && feedback;
            return (
              <Box key={i} flexDirection="column">
                <Box>
                  <Text color={isSelected ? theme.accent : theme.textDim}>
                    {isSelected ? "❯ " : "  "}
                  </Text>
                  <Text color={isSelected ? theme.text : theme.textDim} bold={isSelected}>
                    {`${i + 1}. ${showFeedbackLabel ? "Tell GG Coder what to change:" : label}`}
                  </Text>
                </Box>
                {i === FEEDBACK_IDX && (feedback || isOnFeedback) ? renderFeedbackText() : null}
              </Box>
            );
          })}
          {isOnFeedback && (
            <Box marginTop={0}>
              <Text color={theme.textDim}>
                {"  "}
                {feedback ? "Enter to submit · " : ""}Esc to {feedback ? "clear" : "cancel"} ·
                ↑↓ to pick another option
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Footer — file path + edit hint */}
      {planFilePath && !editing && (
        <Box marginTop={1}>
          <Text color={theme.textDim}>
            ctrl-g to edit in VS Code · {planFileName}
          </Text>
        </Box>
      )}
    </Box>
  );
}
