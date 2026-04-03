/**
 * Plan approval dialog — CC-style numbered options with inline feedback.
 *
 * Replaces the old [A]pprove / [R]eject / [C]ancel button layout with:
 *   1. Yes, and auto-accept edits
 *   2. Yes, manually approve edits
 *   3. No, keep planning █
 *      shift+tab to approve with this feedback
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Markdown } from "./Markdown.js";
import { PermissionPrompt, type PermissionOption } from "./PermissionPrompt.js";

type ApprovalDecision = "yes-accept-edits" | "yes-default" | "no";

const PLAN_APPROVAL_OPTIONS: PermissionOption<ApprovalDecision>[] = [
  {
    value: "yes-accept-edits",
    label: "Yes, and auto-accept edits",
  },
  {
    value: "yes-default",
    label: "Yes, manually approve edits",
  },
  {
    value: "no",
    label: "No, keep planning",
    feedbackConfig: {
      placeholder: "Tell GG what to change",
      hint: "shift+tab to approve with this feedback",
    },
  },
];

interface PlanApprovalProps {
  planPath: string;
  planContent: string;
  onDecision: (decision: "approve" | "reject" | "cancel", feedback?: string) => void;
}

export function PlanApproval({ planPath, planContent, onDecision }: PlanApprovalProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const markdownWidth = Math.max(40, columns - 4);

  function handleSelect(value: ApprovalDecision, feedback?: string) {
    switch (value) {
      case "yes-accept-edits":
      case "yes-default":
        onDecision("approve", value === "yes-accept-edits" ? "auto-accept" : undefined);
        break;
      case "no":
        if (feedback?.trim()) {
          onDecision("reject", feedback.trim());
        }
        // Empty feedback on "No" = no-op (stay on this option)
        break;
    }
  }

  return (
    <Box flexDirection="column" marginTop={1} width={columns}>
      {/* Plan path */}
      <Box>
        <Text dimColor>{"Plan: "}</Text>
        <Text color={theme.planPrimary}>{planPath}</Text>
      </Box>

      {/* Plan content in dashed border */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={theme.planBorder}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
      >
        <Markdown width={markdownWidth}>{planContent}</Markdown>
      </Box>

      {/* CC-style approval prompt */}
      <Box marginTop={1} flexDirection="column">
        <PermissionPrompt<ApprovalDecision>
          question="GG has written up a plan and is ready to execute. Would you like to proceed?"
          options={PLAN_APPROVAL_OPTIONS}
          onSelect={handleSelect}
          onCancel={() => onDecision("cancel")}
        />
      </Box>
    </Box>
  );
}
