/**
 * CC-style permission prompt with numbered options and inline feedback input.
 *
 * Renders a question with selectable options (numbered 1., 2., 3., etc.).
 * Options can optionally include a text input field for feedback.
 * Tab toggles input mode on the focused option; Shift+Tab submits with feedback.
 */
import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";

export interface PermissionOption<T extends string = string> {
  value: T;
  label: string;
  /** When set, this option becomes an inline text input field */
  feedbackConfig?: {
    placeholder?: string;
    /** Hint shown below the options when this option is focused */
    hint?: string;
  };
}

interface PermissionPromptProps<T extends string = string> {
  question: string;
  options: PermissionOption<T>[];
  onSelect: (value: T, feedback?: string) => void;
  onCancel?: () => void;
}

export function PermissionPrompt<T extends string = string>({
  question,
  options,
  onSelect,
  onCancel,
}: PermissionPromptProps<T>) {
  const theme = useTheme();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [inputMode, setInputMode] = useState(false);
  const [feedback, setFeedback] = useState("");

  const focused = options[focusedIndex];
  const hasFeedbackConfig = !!focused?.feedbackConfig;

  const handleSelect = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt) return;
      if (opt.feedbackConfig && inputMode) {
        // Submit with feedback text
        onSelect(opt.value, feedback.trim() || undefined);
      } else {
        onSelect(opt.value);
      }
    },
    [options, onSelect, inputMode, feedback],
  );

  useInput((input, key) => {
    // ── Input mode (typing feedback) ──
    if (inputMode) {
      if (key.return) {
        handleSelect(focusedIndex);
        return;
      }
      // Shift+Tab = submit with feedback (CC pattern)
      if (key.shift && key.tab) {
        handleSelect(focusedIndex);
        return;
      }
      if (key.escape) {
        setInputMode(false);
        setFeedback("");
        return;
      }
      if (key.backspace || key.delete) {
        setFeedback((prev) => prev.slice(0, -1));
        return;
      }
      if (key.tab && !key.shift) {
        // Tab without shift = collapse input mode
        setInputMode(false);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setFeedback((prev) => prev + input);
      }
      return;
    }

    // ── Navigation mode ──
    if (key.escape) {
      onCancel?.();
      return;
    }

    if (key.upArrow) {
      setFocusedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      setFocusedIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }

    // Tab toggles input mode on feedback-enabled option
    if (key.tab && hasFeedbackConfig) {
      setInputMode(true);
      return;
    }

    // Enter selects
    if (key.return) {
      handleSelect(focusedIndex);
      return;
    }

    // Number keys for quick selection
    const num = parseInt(input, 10);
    if (num >= 1 && num <= options.length) {
      setFocusedIndex(num - 1);
      handleSelect(num - 1);
    }
  });

  // Compute max index width for padding
  const maxIndexWidth = String(options.length).length;

  return (
    <Box flexDirection="column">
      <Text dimColor>{question}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => {
          const isFocused = i === focusedIndex;
          const indexStr = `${i + 1}.`.padEnd(maxIndexWidth + 1);
          const pointer = isFocused ? "❯ " : "  ";
          const isInputOpt = !!opt.feedbackConfig;
          const showInput = isFocused && inputMode && isInputOpt;

          return (
            <Box key={opt.value} flexDirection="column">
              <Box>
                <Text color={isFocused ? theme.planPrimary : theme.textDim}>
                  {pointer}
                  {indexStr}{" "}
                </Text>
                <Text color={isFocused ? theme.text : theme.textDim} bold={isFocused}>
                  {opt.label}
                </Text>
                {/* Show cursor block when focused on input option but not in input mode */}
                {isFocused && isInputOpt && !inputMode && (
                  <Text color={theme.textDim}>{" █"}</Text>
                )}
              </Box>
              {/* Inline input field */}
              {showInput && (
                <Box marginLeft={maxIndexWidth + 4}>
                  <Text color={theme.text}>
                    {feedback || ""}
                    {"\u258D"}
                  </Text>
                </Box>
              )}
              {/* Feedback hint */}
              {isFocused && isInputOpt && opt.feedbackConfig?.hint && (
                <Box marginLeft={maxIndexWidth + 4}>
                  <Text dimColor>{opt.feedbackConfig.hint}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {"Esc to cancel"}
          {hasFeedbackConfig && !inputMode && " · Tab to amend"}
          {inputMode && " · shift+tab to approve with this feedback"}
        </Text>
      </Box>
    </Box>
  );
}
