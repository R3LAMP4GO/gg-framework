/** All 27 hook lifecycle events — full CC parity */
export type HookEvent =
  // Tool execution
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  // Agent lifecycle
  | "Stop"
  | "StopFailure"
  | "SessionStart"
  | "SessionEnd"
  | "Setup"
  // Sub-agent coordination
  | "SubagentStart"
  | "SubagentStop"
  // Compaction
  | "PreCompact"
  | "PostCompact"
  // User interaction
  | "UserPromptSubmit"
  | "Notification"
  // Permissions (fire point deferred — need permission system)
  | "PermissionRequest"
  | "PermissionDenied"
  // Task management
  | "TaskCreated"
  | "TaskCompleted"
  // Configuration & environment
  | "ConfigChange"
  | "CwdChanged"
  | "FileChanged"
  | "InstructionsLoaded"
  // Git worktree (fire point deferred)
  | "WorktreeCreate"
  | "WorktreeRemove"
  // MCP elicitation (fire point deferred)
  | "Elicitation"
  | "ElicitationResult"
  // Teammate (fire point deferred)
  | "TeammateIdle";

/** Complete list for iteration */
export const ALL_HOOK_EVENTS: HookEvent[] = [
  "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "Stop", "StopFailure", "SessionStart", "SessionEnd", "Setup",
  "SubagentStart", "SubagentStop",
  "PreCompact", "PostCompact",
  "UserPromptSubmit", "Notification",
  "PermissionRequest", "PermissionDenied",
  "TaskCreated", "TaskCompleted",
  "ConfigChange", "CwdChanged", "FileChanged", "InstructionsLoaded",
  "WorktreeCreate", "WorktreeRemove",
  "Elicitation", "ElicitationResult",
  "TeammateIdle",
];

/** Shell command hook */
export interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

/** LLM prompt hook */
export interface HookPrompt {
  type: "prompt";
  prompt: string;
  timeout?: number;
}

/** HTTP POST hook */
export interface HookHttp {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/** Agent hook — spawns sub-agent */
export interface HookAgent {
  type: "agent";
  prompt: string;
  timeout?: number;
}

export type HookConfig = HookCommand | HookPrompt | HookHttp | HookAgent;

export interface HookEntry {
  matcher?: string;
  hooks: HookConfig[];
}

/** Full 27-event hook configuration */
export interface HooksConfig {
  PreToolUse?: HookEntry[];
  PostToolUse?: HookEntry[];
  PostToolUseFailure?: HookEntry[];
  Stop?: HookEntry[];
  StopFailure?: HookEntry[];
  SessionStart?: HookEntry[];
  SessionEnd?: HookEntry[];
  Setup?: HookEntry[];
  SubagentStart?: HookEntry[];
  SubagentStop?: HookEntry[];
  PreCompact?: HookEntry[];
  PostCompact?: HookEntry[];
  UserPromptSubmit?: HookEntry[];
  Notification?: HookEntry[];
  PermissionRequest?: HookEntry[];
  PermissionDenied?: HookEntry[];
  TaskCreated?: HookEntry[];
  TaskCompleted?: HookEntry[];
  ConfigChange?: HookEntry[];
  CwdChanged?: HookEntry[];
  FileChanged?: HookEntry[];
  InstructionsLoaded?: HookEntry[];
  WorktreeCreate?: HookEntry[];
  WorktreeRemove?: HookEntry[];
  Elicitation?: HookEntry[];
  ElicitationResult?: HookEntry[];
  TeammateIdle?: HookEntry[];
}

export interface HookContext {
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  isError?: boolean;
  cwd: string;
  /** Extra metadata for specific events */
  meta?: Record<string, unknown>;
}

export interface HookResult {
  ok: boolean;
  message?: string;
  block?: boolean;
}
