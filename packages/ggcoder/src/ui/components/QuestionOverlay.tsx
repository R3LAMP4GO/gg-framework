/**
 * QuestionOverlay — Interactive multi-choice question UI with MCP elicitation support.
 *
 * Renders structured questions from the ask_user_question tool with:
 *   - Tab navigation between questions (header chips with ☐/☑ status)
 *   - Arrow key option selection with descriptions
 *   - Auto-generated "Other" option with inline text editor
 *   - Multi-select support with checkboxes (Space to toggle)
 *   - Field-based form rendering for MCP elicitation (boolean, string, enum, array)
 *   - 3-way response: Accept (^S), Decline (^D), Cancel (Esc)
 *   - Smart auto-advance to next unanswered question
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

type SubmitPhase = "answering" | "confirm";

interface QuestionState {
  /** Index of selected option (-1 = none, options.length = "Other") */
  selectedIdx: number;
  /** Set of selected indices for multi-select */
  selectedSet: Set<number>;
  /** Text for "Other" option */
  otherText: string;
  /** Whether the user is typing in the "Other" field */
  editingOther: boolean;
  /** Cursor position in Other text */
  otherCursor: number;
}

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

      // Enum field → options
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

      // Boolean field → Yes/No options
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

      // Array field with items.enum → multi-select
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

      // String/number fields → just "Other" text input (empty options)
      return {
        question: title + (title.endsWith("?") ? "" : "?"),
        header: key.slice(0, 12),
        options: [],
        multiSelect: false,
      };
    });
  }, [questions, elicitation]);

  const [currentQ, setCurrentQ] = useState(0);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("answering");
  const [states, setStates] = useState<QuestionState[]>(() =>
    effectiveQuestions.map((q) => ({
      selectedIdx: q.options.length === 0 ? 0 : 0, // If no options, "Other" is idx 0
      selectedSet: new Set<number>(),
      otherText: "",
      editingOther: q.options.length === 0, // Auto-edit for text-only fields
      otherCursor: 0,
    })),
  );

  const question = effectiveQuestions[currentQ];
  const state = states[currentQ];
  if (!question || !state) return null;

  const otherIdx = question.options.length;
  const hasOtherOption = true; // Always show "Other" unless it's a text-only field
  const isTextOnlyField = question.options.length === 0;
  const totalOptions = isTextOnlyField ? 1 : otherIdx + 1;

  // Check which questions have answers
  const answeredQuestions = useMemo(() => {
    return states.map((s, i) => {
      const q = effectiveQuestions[i];
      if (!q) return false;
      if (q.options.length === 0) return s.otherText.trim().length > 0;
      if (q.multiSelect) {
        return s.selectedSet.size > 0 || s.otherText.trim().length > 0;
      }
      if (s.selectedIdx === q.options.length) return s.otherText.trim().length > 0;
      return s.selectedIdx >= 0 && s.selectedIdx < q.options.length;
    });
  }, [states, effectiveQuestions]);

  const allAnswered = answeredQuestions.every(Boolean);

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

  // Navigate to next unanswered question
  const nextUnanswered = useCallback(() => {
    for (let i = currentQ + 1; i < effectiveQuestions.length; i++) {
      if (!answeredQuestions[i]) {
        setCurrentQ(i);
        return;
      }
    }
    // All remaining answered — just go to next
    if (currentQ < effectiveQuestions.length - 1) {
      setCurrentQ(currentQ + 1);
    }
  }, [currentQ, effectiveQuestions.length, answeredQuestions]);

  const prevQuestion = useCallback(() => {
    setCurrentQ((q) => Math.max(0, q - 1));
  }, []);

  const buildAnswers = useCallback((): Record<string, string> => {
    const answers: Record<string, string> = {};
    for (let i = 0; i < effectiveQuestions.length; i++) {
      const q = effectiveQuestions[i];
      const s = states[i];
      if (!q || !s) continue;

      if (q.options.length === 0) {
        // Text-only field
        answers[q.question] = s.otherText.trim() || "No answer";
      } else if (q.multiSelect) {
        const selected = [...s.selectedSet]
          .sort()
          .map((idx) =>
            idx === q.options.length ? s.otherText.trim() : q.options[idx]?.label,
          )
          .filter(Boolean);
        answers[q.question] = selected.join(", ") || "No selection";
      } else if (s.selectedIdx === q.options.length) {
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
        // ── Other text editing mode ──
        if (state.editingOther) {
          if (key.escape && !isTextOnlyField) {
            updateState(currentQ, { editingOther: false });
            return;
          }
          if (key.return) {
            if (isTextOnlyField) {
              // For text-only fields, Enter confirms and advances
              nextUnanswered();
            } else {
              updateState(currentQ, { editingOther: false });
            }
            return;
          }
          if (key.backspace || key.delete) {
            if (state.otherCursor > 0) {
              const t = state.otherText;
              updateState(currentQ, {
                otherText: t.slice(0, state.otherCursor - 1) + t.slice(state.otherCursor),
                otherCursor: state.otherCursor - 1,
              });
            }
            return;
          }
          if (key.leftArrow) {
            updateState(currentQ, { otherCursor: Math.max(0, state.otherCursor - 1) });
            return;
          }
          if (key.rightArrow) {
            updateState(currentQ, {
              otherCursor: Math.min(state.otherText.length, state.otherCursor + 1),
            });
            return;
          }
          // Ctrl+S/Ctrl+Enter: submit from editing mode
          if ((key.ctrl && input === "s") || (key.ctrl && key.return)) {
            if (!allAnswered) return;
            if (onClearContext && submitPhase === "answering") {
              setSubmitPhase("confirm");
              return;
            }
            onAccept(buildAnswers());
            return;
          }
          // Ctrl+D: decline from editing mode
          if (key.ctrl && input === "d") {
            onDecline();
            return;
          }
          if (key.ctrl && input === "c") {
            onCancel();
            return;
          }
          if (input && !key.ctrl) {
            const t = state.otherText;
            updateState(currentQ, {
              otherText: t.slice(0, state.otherCursor) + input + t.slice(state.otherCursor),
              otherCursor: state.otherCursor + input.length,
            });
          }
          return;
        }

        // ── Normal selection mode ──

        // Tab / Shift+Tab: navigate between questions
        if (key.tab && !key.shift && currentQ < effectiveQuestions.length - 1) {
          setCurrentQ((q) => q + 1);
          return;
        }
        if (key.tab && key.shift && currentQ > 0) {
          prevQuestion();
          return;
        }

        // Arrow navigation
        if (key.upArrow) {
          updateState(currentQ, {
            selectedIdx: Math.max(0, state.selectedIdx - 1),
          });
          return;
        }
        if (key.downArrow) {
          updateState(currentQ, {
            selectedIdx: Math.min(totalOptions - 1, state.selectedIdx + 1),
          });
          return;
        }

        // Space: toggle in multi-select mode (matches Claude Code's Confirmation context)
        if (input === " " && question.multiSelect) {
          if (state.selectedIdx === otherIdx) {
            const newSet = new Set(state.selectedSet);
            newSet.add(otherIdx);
            updateState(currentQ, {
              editingOther: true,
              otherCursor: state.otherText.length,
              selectedSet: newSet,
            });
          } else {
            const newSet = new Set(state.selectedSet);
            if (newSet.has(state.selectedIdx)) {
              newSet.delete(state.selectedIdx);
            } else {
              newSet.add(state.selectedIdx);
            }
            updateState(currentQ, { selectedSet: newSet });
          }
          return;
        }

        // Enter: select option
        if (key.return) {
          if (question.multiSelect) {
            // Toggle selection
            if (state.selectedIdx === otherIdx) {
              const newSet = new Set(state.selectedSet);
              newSet.add(otherIdx);
              updateState(currentQ, {
                editingOther: true,
                otherCursor: state.otherText.length,
                selectedSet: newSet,
              });
            } else {
              const newSet = new Set(state.selectedSet);
              if (newSet.has(state.selectedIdx)) {
                newSet.delete(state.selectedIdx);
              } else {
                newSet.add(state.selectedIdx);
              }
              updateState(currentQ, { selectedSet: newSet });
            }
          } else {
            // Single-select
            if (state.selectedIdx === otherIdx) {
              updateState(currentQ, {
                editingOther: true,
                otherCursor: state.otherText.length,
              });
            } else {
              // Option selected — auto-advance to next unanswered
              nextUnanswered();
            }
          }
          return;
        }

        // Ctrl+Enter or Ctrl+S: Submit all answers (accept)
        if ((key.ctrl && input === "s") || (key.ctrl && key.return)) {
          if (!allAnswered) return;
          if (onClearContext && submitPhase === "answering") {
            setSubmitPhase("confirm");
            return;
          }
          onAccept(buildAnswers());
          return;
        }

        // Ctrl+D: Decline to answer
        if (key.ctrl && input === "d") {
          onDecline();
          return;
        }

        // In confirm phase, handle s/n/Esc
        if (submitPhase === "confirm") {
          if (input === "s") {
            onAccept(buildAnswers());
            return;
          }
          if (input === "n" && onClearContext) {
            const answers = buildAnswers();
            const summary = formatPlanSummary(effectiveQuestions, answers);
            onClearContext(answers, summary);
            return;
          }
          if (key.escape) {
            setSubmitPhase("answering");
            return;
          }
          return;
        }

        // Escape: cancel
        if (key.escape) {
          onCancel();
          return;
        }

        if (key.ctrl && input === "c") {
          onCancel();
          return;
        }
      },
      [
        state, currentQ, question, totalOptions, otherIdx, isTextOnlyField,
        effectiveQuestions, allAnswered, updateState, onAccept, onDecline, onCancel,
        buildAnswers, onClearContext, submitPhase, nextUnanswered, prevQuestion,
      ],
    ),
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingLeft={1}
      paddingRight={1}
      marginTop={1}
    >
      {/* Elicitation message */}
      {elicitation?.message && (
        <Box marginBottom={1}>
          <Text color={theme.text} bold wrap="wrap">
            {elicitation.message}
          </Text>
        </Box>
      )}

      {/* Tab bar — question chips */}
      {effectiveQuestions.length > 1 && (
        <Box marginBottom={1} gap={1}>
          {effectiveQuestions.map((q, i) => {
            const isCurrent = i === currentQ;
            const isAnswered = answeredQuestions[i];
            const check = isAnswered ? "☑" : "☐";
            return (
              <Box key={i}>
                <Text
                  color={isCurrent ? theme.accent : isAnswered ? theme.success : theme.textDim}
                  bold={isCurrent}
                >
                  {check} {q.header}
                </Text>
              </Box>
            );
          })}
          <Box>
            <Text color={allAnswered ? theme.success : theme.textDim} bold={allAnswered}>
              {"→ Submit"}
            </Text>
          </Box>
        </Box>
      )}

      {/* Question text */}
      <Box marginBottom={1}>
        <Text color={theme.primary} bold wrap="wrap">
          {question.question}
        </Text>
      </Box>

      {/* Options (if any) */}
      {question.options.map((opt, i) => {
        const isFocused = state.selectedIdx === i;
        const isChecked = question.multiSelect
          ? state.selectedSet.has(i)
          : state.selectedIdx === i && !state.editingOther;
        const bullet = question.multiSelect
          ? isChecked ? "☑" : "☐"
          : isFocused ? "●" : "○";

        return (
          <Box key={i} flexDirection="column">
            <Box>
              <Text color={isFocused ? theme.accent : theme.textDim}>
                {isFocused ? "❯ " : "  "}
              </Text>
              <Text color={isFocused ? theme.accent : theme.text} bold={isFocused}>
                {bullet} {opt.label}
              </Text>
            </Box>
            {isFocused && opt.description && (
              <Box marginLeft={5}>
                <Text color={theme.textMuted} wrap="wrap">
                  {opt.description}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* "Other" option (or text-only input for string/number fields) */}
      {isTextOnlyField ? (
        <Box flexDirection="column">
          <Box marginLeft={0} marginTop={0}>
            <Text color={theme.inputPrompt} bold>{"❯ "}</Text>
            <Text color={theme.text}>{state.otherText.slice(0, state.otherCursor)}</Text>
            <Text inverse>
              {state.otherCursor < state.otherText.length
                ? state.otherText[state.otherCursor]
                : " "}
            </Text>
            <Text color={theme.text}>{state.otherText.slice(state.otherCursor + 1)}</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text color={state.selectedIdx === otherIdx ? theme.accent : theme.textDim}>
              {state.selectedIdx === otherIdx ? "❯ " : "  "}
            </Text>
            <Text
              color={state.selectedIdx === otherIdx ? theme.accent : theme.text}
              bold={state.selectedIdx === otherIdx}
            >
              {question.multiSelect
                ? state.selectedSet.has(otherIdx) ? "☑" : "☐"
                : state.selectedIdx === otherIdx ? "●" : "○"}{" "}
              Other
            </Text>
          </Box>
          {state.editingOther && (
            <Box marginLeft={5} marginTop={0}>
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
      )}

      {/* Hints / Confirm bar */}
      {submitPhase === "confirm" ? (
        <Box marginTop={1}>
          <Text color={theme.accent} bold>{"Submit: "}</Text>
          <Text color={theme.success} bold>{"[s]"}</Text>
          <Text color={theme.text}>{" Continue "}</Text>
          <Text color={theme.accent} bold>{"[n]"}</Text>
          <Text color={theme.text}>{" New Chat + Copy Plan "}</Text>
          <Text color={theme.textDim}>{"[Esc] back"}</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={theme.textDim}>
            {"↑↓ navigate · Enter select"}
            {question.multiSelect ? " · Space toggle" : ""}
            {effectiveQuestions.length > 1 ? " · Tab/⇧Tab questions" : ""}
            {" · "}
          </Text>
          <Text color={allAnswered ? theme.success : theme.textDim} bold={allAnswered}>
            ^S accept
          </Text>
          <Text color={theme.textDim}>{" · ^D decline · Esc cancel"}</Text>
        </Box>
      )}
    </Box>
  );
}

// ── Helpers ───────────────────────────────────────────────

function formatPlanSummary(questions: Question[], answers: Record<string, string>): string {
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
