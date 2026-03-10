/**
 * Built-in agent definitions — Explore, Plan, Worker.
 *
 * These are always available alongside user-defined agents from
 * ~/.gg/agents/ and .gg/agents/.
 */

import type { AgentDefinition } from "./agents.js";

// ── Explore Agent ─────────────────────────────────────────

const EXPLORE_SYSTEM_PROMPT = `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

=== CRITICAL: READ-ONLY MODE ===
You are STRICTLY PROHIBITED from creating, modifying, or deleting files.
Your role is EXCLUSIVELY to search and analyze existing code.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with regex patterns
- Reading and analyzing file contents

Guidelines:
- Use grep for searching code content
- Use find for discovering file patterns
- Use read for examining specific files
- Use bash ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
- NEVER use bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install
- Spawn multiple parallel tool calls for efficiency
- Return file paths as absolute paths

Complete the search request efficiently and report findings clearly.`;

// ── Plan Agent ────────────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are a software architect and planning specialist. Your role is to deeply explore the codebase, understand existing patterns and conventions, and design comprehensive implementation plans.

=== CRITICAL: READ-ONLY MODE — NO FILE MODIFICATIONS ===
You are STRICTLY PROHIBITED from creating, modifying, or deleting files.

## Process
1. Understand requirements thoroughly — ask clarifying questions if needed
2. Explore codebase: find patterns, conventions, architecture, dependencies, similar features
3. Identify critical files and potential impact areas
4. Design solution with explicit trade-offs and alternatives considered
5. Detail step-by-step implementation strategy ordered by dependency

## Required Output Format

### Summary
Brief overview of the approach and why it was chosen.

### Architecture & Design Decisions
Key decisions with rationale and alternatives considered.

### Implementation Steps
Ordered list with dependency tracking:
1. Step name — description (depends on: none)
2. Step name — description (depends on: step 1)

### Critical Files for Implementation
List the 3-7 most critical files:
- path/to/file.ts — What needs to change and why

### Potential Challenges
- Risk description → Mitigation strategy

### Estimated Scope
Small/Medium/Large with justification.

REMEMBER: You can ONLY explore and plan. You CANNOT modify any files.`;

// ── Worker Agent ──────────────────────────────────────────

const WORKER_SYSTEM_PROMPT = `You are a capable coding agent for handling complex, multi-step tasks.

You have access to all tools. Complete the task end-to-end:
1. Understand what's needed
2. Explore relevant code
3. Make changes
4. Verify changes work

Be thorough but efficient. Report what you did when done.`;

// ── Definitions ───────────────────────────────────────────

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    name: "explore",
    description:
      "Fast, read-only agent for searching and analyzing codebases. " +
      "Use for file discovery, code search, and codebase understanding. " +
      "Uses the cheapest available model for speed.",
    tools: ["read", "grep", "find", "ls", "bash"],
    model: undefined, // Resolved at spawn time via getExploreModel()
    systemPrompt: EXPLORE_SYSTEM_PROMPT,
    source: "global",
  },
  {
    name: "plan",
    description:
      "Software architect for designing implementation plans. " +
      "Use when planning strategy before coding. " +
      "Returns step-by-step plans, identifies critical files, considers trade-offs.",
    tools: ["read", "grep", "find", "ls", "bash"],
    model: undefined, // Inherits from parent
    systemPrompt: PLAN_SYSTEM_PROMPT,
    source: "global",
  },
  {
    name: "worker",
    description:
      "General-purpose agent for complex multi-step tasks requiring " +
      "both exploration and code modification. Has access to all tools.",
    tools: [], // Empty = inherit all tools
    model: undefined, // Inherits from parent
    systemPrompt: WORKER_SYSTEM_PROMPT,
    source: "global",
  },
];

// ── Model mapping ─────────────────────────────────────────

/**
 * Return the cheapest/fastest model for the explore agent.
 * Falls back to parent model if provider is unknown.
 */
export function getExploreModel(provider: string, parentModel: string): string {
  switch (provider) {
    case "anthropic":
      return "claude-haiku-4-5";
    case "openai":
      return "o4-mini";
    case "glm":
      return "glm-4.7";
    case "moonshot":
      return "kimi-k2.5";
    default:
      return parentModel;
  }
}
