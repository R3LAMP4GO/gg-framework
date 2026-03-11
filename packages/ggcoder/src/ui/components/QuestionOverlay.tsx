/**
 * QuestionOverlay — Wizard-style multi-step question UI with MCP elicitation support.
 *
 * Renders structured questions from the ask_user_question tool as a step wizard:
 *   - Tab bar: ← □ Stack □ Features □ Output ✓ Submit → with highlighted current tab
 *   - Numbered option list with indented descriptions
 *   - "Type something" free-text option on each question
 *   - "Chat about this" and "Skip interview and plan immediately" meta-options
 *   - Dedicated Submit tab with review screen and unanswered warning
 *   - Navigation: Enter to select, Tab/Arrow for tabs, number keys, Esc to cancel
 */

import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";
import type { Question, ElicitationRequest } from "../../tools/ask-user-question.js";

// ── Types ─────────────────────────────────────────────────

interface QuestionOverlayProps {
  questions: Question[];
  elicitation?: ElicitationRequest;
  onAccept: (answers: Record<string, string>) => void;
  onDecline: () => void;
  onCancel: () => void;
  /** Called when user chooses "Submit & New Chat" — clears context and starts fresh with plan */
  onClearContext?: (answers: Record<string, string>, planSummary: string) => void;
}

interface QuestionState {
  /** Index of selected option in the full list (including Type something) */
  selectedIdx: number;
  /** Set of selected indices for multi-select */
  selectedSet: Set<number>;
  /** Text for free-text input */
  otherText: string;
  /** Whether the user is typing in the free-text field */
  editingOther: boolean;
  /** Cursor position in free-text */
  otherCursor: number;
  /** Whether this question has been explicitly answered */
  answered: boolean;
}

// Special option indices (relative to end of real options)
const TYPE_SOMETHING_LABEL = "Type something.";
const CHAT_LABEL = "Chat about this";
const SKIP_LABEL = "Skip interview and plan immediately";

// ── Component ─────────────────────────────────────────────

export function QuestionOverlay({
  questions,
  elicitation,
  onAccept,
  onDecline,
  onCancel,
  onClearContext,
}: QuestionOverlayProps) {
  const theme = useTheme();

  // Convert elicitation schema to Question[] format if needed
  const effectiveQuestions = useMemo<Question[]>(() => {
    if (questions.length > 0) return questions;
    if (!elicitation) return [];

    const props = elicitation.requestedSchema.properties;
    return Object.entries(props).map(([key, field]) => {
      const f = field as Record<string, unknown>;
      const title = (f.title as string) || (f.description as string) || key;
      const enumValues = f.enum as string[] | undefined;
      const enumNames = f.enumNames as string[] | undefined;

      if (enumValues && enumValues.length > 0) {
        return {
          question: title + "?",
          header: key.slice(0, 12),
          options: enumValues.map((v, i) => ({
            label: enumNames?.[i] ?? v,
            description: "",
          })),
          multiSelect: f.type === "array",
        };
      }

      if (f.type === "boolean") {
        return {
          question: title + "?",
          header: key.slice(0, 12),
          options: [
            { label: "Yes", description: "" },
            { label: "No", description: "" },
          ],
          multiSelect: false,
        };
      }

      if (f.type === "array" && f.items && typeof f.items === "object") {
        const items = f.items as Record<string, unknown>;
        const itemEnum = items.enum as string[] | undefined;
        if (itemEnum) {
          return {
            question: title + "?",
            header: key.slice(0, 12),
            options: itemEnum.map((v) => ({ label: v, description: "" })),
            multiSelect: true,
          };
        }
      }

      return {
        question: title + (title.endsWith("?") ? "" : "?"),
        header: key.slice(0, 12),
        options: [],
        multiSelect: false,
      };
    });
  }, [questions, elicitation]);

  // totalTabs = question tabs + submit tab
  const totalTabs = effectiveQuestions.length + 1;
  const submitTabIdx = effectiveQuestions.length;

  const [currentTab, setCurrentTab] = useState(0);
  const [submitSelectedIdx, setSubmitSelectedIdx] = useState(0); // 0 = Submit, 1 = Cancel

  const [states, setStates] = useState<QuestionState[]>(() =>
    effectiveQuestions.map((q) => ({
      selectedIdx: 0,
      selectedSet: new Set<number>(),
      otherText: "",
      editingOther: q.options.length === 0, // Auto-edit for text-only fields
      otherCursor: 0,
      answered: false,
    })),
  );

  const isOnSubmitTab = currentTab === submitTabIdx;
  const question = isOnSubmitTab ? null : effectiveQuestions[currentTab];
  const state = isOnSubmitTab ? null : states[currentTab];

  // For each question: real options + "Type something" + separator + "Chat" + "Skip"
  // "Type something" idx = options.length
  // "Chat about this" idx = options.length + 1
  // "Skip interview" idx = options.length + 2
  const typeIdx = question ? question.options.length : 0;
  const chatIdx = question ? question.options.length + 1 : 1;
  const skipIdx = question ? question.options.length + 2 : 2;
  const totalOptions = question ? question.options.length + 3 : 3;

  // Check which questions have answers
  const answeredQuestions = useMemo(() => {
    return states.map((s) => s.answered);
  }, [states]);

  const allAnswered = answeredQuestions.every(Boolean);
  const answeredCount = answeredQuestions.filter(Boolean).length;

  const updateState = useCallback(
    (idx: number, patch: Partial<QuestionState>) => {
      setStates((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      });
    },
    [],
  );

  // Navigate to next unanswered question (or submit tab)
  const advanceToNext = useCallback(() => {
    for (let i = currentTab + 1; i < effectiveQuestions.length; i++) {
      if (!answeredQuestions[i]) {
        setCurrentTab(i);
        return;
      }
    }
    // All remaining answered — go to submit
    setCurrentTab(submitTabIdx);
  }, [currentTab, effectiveQuestions.length, answeredQuestions, submitTabIdx]);

  const buildAnswers = useCallback((): Record<string, string> => {
    const answers: Record<string, string> = {};
    for (let i = 0; i < effectiveQuestions.length; i++) {
      const q = effectiveQuestions[i];
      const s = states[i];
      if (!q || !s) continue;

      if (!s.answered) {
        answers[q.question] = "No answer";
        continue;
      }

      if (q.options.length === 0) {
        answers[q.question] = s.otherText.trim() || "No answer";
      } else if (q.multiSelect) {
        const selected = [...s.selectedSet]
          .sort()
          .map((idx) => {
            if (idx === q.options.length) return s.otherText.trim();
            return q.options[idx]?.label;
          })
          .filter(Boolean);
        answers[q.question] = selected.join(", ") || "No selection";
      } else if (s.selectedIdx === q.options.length) {
        // "Type something" was selected
        answers[q.question] = s.otherText.trim() || "No answer";
      } else if (s.selectedIdx >= 0 && s.selectedIdx < q.options.length) {
        answers[q.question] = q.options[s.selectedIdx]!.label;
      } else {
        answers[q.question] = "No selection";
      }
    }
    return answers;
  }, [effectiveQuestions, states]);

  useInput(
    useCallback(
      (input: string, key: {
        return?: boolean;
        backspace?: boolean;
        delete?: boolean;
        escape?: boolean;
        upArrow?: boolean;
        downArrow?: boolean;
        leftArrow?: boolean;
        rightArrow?: boolean;
        ctrl?: boolean;
        tab?: boolean;
        shift?: boolean;
      }) => {
        // ── Escape: cancel entire wizard ──
        if (key.escape) {
          if (state?.editingOther) {
            // Exit text editing first
            updateState(currentTab, { editingOther: false });
            return;
          }
          onCancel();
          return;
        }

        if (key.ctrl && input === "c") {
          onCancel();
          return;
        }

        // ── Submit tab handling ──
        if (isOnSubmitTab) {
          if (key.upArrow) {
            setSubmitSelectedIdx((i) => Math.max(0, i - 1));
            return;
          }
          if (key.downArrow) {
            setSubmitSelectedIdx((i) => Math.min(1, i + 1));
            return;
          }
          if (key.return) {
            if (submitSelectedIdx === 0) {
              // Submit answers
              onAccept(buildAnswers());
            } else {
              // Cancel
              onCancel();
            }
            return;
          }
          // Tab navigation from submit
          if ((key.tab && key.shift) || key.leftArrow) {
            setCurrentTab((t) => Math.max(0, t - 1));
            return;
          }
          // Number keys on submit tab
          if (input === "1") {
            onAccept(buildAnswers());
            return;
          }
          if (input === "2") {
            onCancel();
            return;
          }
          return;
        }

        // ── Free-text editing mode ──
        if (state?.editingOther) {
          if (key.return) {
            // Confirm text and mark answered
            if (state.otherText.trim()) {
              updateState(currentTab, { editingOther: false, answered: true });
              advanceToNext();
            } else {
              updateState(currentTab, { editingOther: false });
            }
            return;
          }
          if (key.backspace || key.delete) {
            if (state.otherCursor > 0) {
              const t = state.otherText;
              updateState(currentTab, {
                otherText: t.slice(0, state.otherCursor - 1) + t.slice(state.otherCursor),
                otherCursor: state.otherCursor - 1,
              });
            }
            return;
          }
          if (key.leftArrow) {
            updateState(currentTab, { otherCursor: Math.max(0, state.otherCursor - 1) });
            return;
          }
          if (key.rightArrow) {
            updateState(currentTab, {
              otherCursor: Math.min(state.otherText.length, state.otherCursor + 1),
            });
            return;
          }
          if (input && !key.ctrl) {
            const t = state.otherText;
            updateState(currentTab, {
              otherText: t.slice(0, state.otherCursor) + input + t.slice(state.otherCursor),
              otherCursor: state.otherCursor + input.length,
            });
          }
          return;
        }

        // ── Tab / arrow navigation between tabs ──
        if (key.tab && !key.shift) {
          setCurrentTab((t) => Math.min(totalTabs - 1, t + 1));
          return;
        }
        if (key.tab && key.shift) {
          setCurrentTab((t) => Math.max(0, t - 1));
          return;
        }
        // Left/Right arrow also navigate tabs (when not editing)
        if (key.rightArrow) {
          setCurrentTab((t) => Math.min(totalTabs - 1, t + 1));
          return;
        }
        if (key.leftArrow) {
          setCurrentTab((t) => Math.max(0, t - 1));
          return;
        }

        if (!question || !state) return;

        // ── Up/Down: navigate options within question ──
        if (key.upArrow) {
          updateState(currentTab, {
            selectedIdx: Math.max(0, state.selectedIdx - 1),
          });
          return;
        }
        if (key.downArrow) {
          updateState(currentTab, {
            selectedIdx: Math.min(totalOptions - 1, state.selectedIdx + 1),
          });
          return;
        }

        // ── Number keys: quick-select ──
        const num = parseInt(input, 10);
        if (num >= 1 && num <= totalOptions) {
          const idx = num - 1;
          handleOptionSelect(idx);
          return;
        }

        // ── Space: toggle in multi-select mode ──
        if (input === " " && question.multiSelect && state.selectedIdx < typeIdx) {
          const newSet = new Set(state.selectedSet);
          if (newSet.has(state.selectedIdx)) {
            newSet.delete(state.selectedIdx);
          } else {
            newSet.add(state.selectedIdx);
          }
          updateState(currentTab, { selectedSet: newSet, answered: newSet.size > 0 });
          return;
        }

        // ── Enter: select current option ──
        if (key.return) {
          handleOptionSelect(state.selectedIdx);
          return;
        }

        function handleOptionSelect(idx: number) {
          if (!question || !state) return;

          // "Chat about this"
          if (idx === chatIdx) {
            onDecline();
            return;
          }

          // "Skip interview and plan immediately"
          if (idx === skipIdx) {
            onAccept(buildAnswers());
            return;
          }

          // "Type something"
          if (idx === typeIdx) {
            updateState(currentTab, {
              selectedIdx: typeIdx,
              editingOther: true,
              otherCursor: state.otherText.length,
            });
            return;
          }

          // Regular option
          if (question.multiSelect) {
            const newSet = new Set(state.selectedSet);
            if (newSet.has(idx)) {
              newSet.delete(idx);
            } else {
              newSet.add(idx);
            }
            updateState(currentTab, { selectedSet: newSet, answered: newSet.size > 0 });
          } else {
            updateState(currentTab, { selectedIdx: idx, answered: true });
            advanceToNext();
          }
        }
      },
      [
        state, currentTab, question, totalOptions, typeIdx, chatIdx, skipIdx,
        isOnSubmitTab, submitSelectedIdx, totalTabs,
        effectiveQuestions, updateState, onAccept, onDecline, onCancel,
        buildAnswers, advanceToNext,
      ],
    ),
  );

  if (effectiveQuestions.length === 0) return null;

  // ── Render ─────────────────────────────────────────────

  return (
    <Box
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      marginTop={1}
    >
      {/* Tab bar: ← □ Stack □ Features ... ✓ Submit → */}
      <Box marginBottom={1} gap={0}>
        <Text color={theme.textDim}>{"← "}</Text>
        {effectiveQuestions.map((q, i) => {
          const isCurrent = currentTab === i;
          const isAnswered = answeredQuestions[i];
          const check = isAnswered ? "⊠" : "□";
          const label = ` ${check} ${q.header} `;
          return (
            <Box key={i}>
              {isCurrent ? (
                <Text backgroundColor={theme.accent} color="#000000" bold>
                  {label}
                </Text>
              ) : (
                <Text color={isAnswered ? theme.text : theme.textDim}>
                  {label}
                </Text>
              )}
              <Text color={theme.textDim}>{" "}</Text>
            </Box>
          );
        })}
        {/* Submit tab */}
        <Box>
          {isOnSubmitTab ? (
            <Text backgroundColor={theme.accent} color="#000000" bold>
              {" ✓ Submit "}
            </Text>
          ) : (
            <Text color={allAnswered ? theme.success : theme.textDim} bold={allAnswered}>
              {" ✓ Submit "}
            </Text>
          )}
        </Box>
        <Text color={theme.textDim}>{" →"}</Text>
      </Box>

      {/* ── Submit tab content ── */}
      {isOnSubmitTab ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={theme.text} bold>Review your answers</Text>
          </Box>

          {/* Answer summary — question → answer pairs */}
          <Box flexDirection="column" marginBottom={1}>
            {effectiveQuestions.map((q, i) => {
              const s = states[i];
              let answerText = "No answer";
              if (s.answered) {
                if (q.options.length === 0) {
                  answerText = s.otherText.trim() || "No answer";
                } else if (q.multiSelect) {
                  const selected = [...s.selectedSet]
                    .sort()
                    .map((idx) => idx === q.options.length ? s.otherText.trim() : q.options[idx]?.label)
                    .filter(Boolean);
                  answerText = selected.join(", ") || "No selection";
                } else if (s.selectedIdx === q.options.length) {
                  answerText = s.otherText.trim() || "No answer";
                } else if (s.selectedIdx >= 0 && s.selectedIdx < q.options.length) {
                  answerText = q.options[s.selectedIdx]!.label;
                }
              }
              return (
                <Box key={i} flexDirection="column" marginLeft={2}>
                  <Box>
                    <Text color={theme.textDim}>{"● "}</Text>
                    <Text color={theme.text}>{q.question}</Text>
                  </Box>
                  <Box marginLeft={2}>
                    <Text color={theme.textDim}>{"→ "}</Text>
                    <Text color={s.answered ? theme.success : theme.warning} bold={s.answered}>
                      {answerText}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {!allAnswered && (
            <Box marginBottom={1}>
              <Text color={theme.warning}>⚠ You have not answered all questions</Text>
            </Box>
          )}

          <Box marginBottom={1}>
            <Text color={theme.text}>Ready to submit your answers?</Text>
          </Box>

          {/* Submit options */}
          <Box flexDirection="column">
            <Box>
              <Text color={submitSelectedIdx === 0 ? theme.accent : theme.textDim}>
                {submitSelectedIdx === 0 ? "❯ " : "  "}
              </Text>
              <Text color={submitSelectedIdx === 0 ? theme.accent : theme.text} bold={submitSelectedIdx === 0}>
                1. Submit answers
              </Text>
            </Box>
            <Box>
              <Text color={submitSelectedIdx === 1 ? theme.accent : theme.textDim}>
                {submitSelectedIdx === 1 ? "❯ " : "  "}
              </Text>
              <Text color={submitSelectedIdx === 1 ? theme.accent : theme.text} bold={submitSelectedIdx === 1}>
                2. Cancel
              </Text>
            </Box>
          </Box>
        </Box>
      ) : question && state ? (
        /* ── Question tab content ── */
        <Box flexDirection="column">
          {/* Question text */}
          <Box marginBottom={1}>
            <Text color={theme.text} bold wrap="wrap">
              {question.question}
            </Text>
          </Box>

          {/* Numbered options with descriptions */}
          {question.options.map((opt, i) => {
            const isFocused = state.selectedIdx === i;
            const num = i + 1;

            return (
              <Box key={i} flexDirection="column">
                <Box>
                  <Text color={isFocused ? theme.accent : theme.textDim}>
                    {isFocused ? "❯ " : "  "}
                  </Text>
                  <Text color={isFocused ? theme.accent : theme.text} bold={isFocused}>
                    {num}. {opt.label}
                  </Text>
                </Box>
                {opt.description && (
                  <Box marginLeft={5}>
                    <Text color={theme.textMuted} wrap="wrap">
                      {opt.description}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}

          {/* "Type something." option */}
          <Box flexDirection="column">
            <Box>
              <Text color={state.selectedIdx === typeIdx ? theme.accent : theme.textDim}>
                {state.selectedIdx === typeIdx ? "❯ " : "  "}
              </Text>
              <Text
                color={state.selectedIdx === typeIdx ? theme.accent : theme.text}
                bold={state.selectedIdx === typeIdx}
              >
                {typeIdx + 1}. {TYPE_SOMETHING_LABEL}
              </Text>
            </Box>
            {state.editingOther && (
              <Box marginLeft={5}>
                <Text color={theme.inputPrompt} bold>{"❯ "}</Text>
                <Text color={theme.text}>{state.otherText.slice(0, state.otherCursor)}</Text>
                <Text inverse>
                  {state.otherCursor < state.otherText.length
                    ? state.otherText[state.otherCursor]
                    : " "}
                </Text>
                <Text color={theme.text}>{state.otherText.slice(state.otherCursor + 1)}</Text>
              </Box>
            )}
          </Box>

          {/* Separator */}
          <Box marginTop={1} />

          {/* "Chat about this" */}
          <Box>
            <Text color={state.selectedIdx === chatIdx ? theme.accent : theme.textDim}>
              {state.selectedIdx === chatIdx ? "❯ " : "  "}
            </Text>
            <Text
              color={state.selectedIdx === chatIdx ? theme.accent : theme.text}
              bold={state.selectedIdx === chatIdx}
            >
              {chatIdx + 1}. {CHAT_LABEL}
            </Text>
          </Box>

          {/* "Skip interview and plan immediately" */}
          <Box>
            <Text color={state.selectedIdx === skipIdx ? theme.accent : theme.textDim}>
              {state.selectedIdx === skipIdx ? "❯ " : "  "}
            </Text>
            <Text
              color={state.selectedIdx === skipIdx ? theme.accent : theme.text}
              bold={state.selectedIdx === skipIdx}
            >
              {skipIdx + 1}. {SKIP_LABEL}
            </Text>
          </Box>
        </Box>
      ) : null}

      {/* Navigation hint bar */}
      <Box marginTop={1}>
        <Text color={theme.textDim}>
          Enter to select · Tab/Arrow keys to navigate · Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}

// ── Helpers ───────────────────────────────────────────────

export function formatPlanSummary(questions: Question[], answers: Record<string, string>): string {
  const lines = ["## Planning Context (from Q&A)", ""];
  for (const q of questions) {
    const answer = answers[q.question] ?? "No answer";
    lines.push(`**${q.header}**: ${q.question}`);
    lines.push(`> ${answer}`);
    lines.push("");
  }
  lines.push("---");
  lines.push("Continue implementing based on the decisions above.");
  return lines.join("\n");
}
