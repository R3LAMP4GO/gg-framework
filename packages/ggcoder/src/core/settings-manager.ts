import fs from "node:fs/promises";
import { z } from "zod";
import { getAppPaths } from "../config.js";

// ── Settings Schema ────────────────────────────────────────

// ── Hook Schema ───────────────────────────────────────────
const HookConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command"), command: z.string(), timeout: z.number().optional() }),
  z.object({ type: z.literal("prompt"), prompt: z.string(), timeout: z.number().optional() }),
  z.object({ type: z.literal("http"), url: z.string(), headers: z.record(z.string(), z.string()).optional(), timeout: z.number().optional() }),
  z.object({ type: z.literal("agent"), prompt: z.string(), timeout: z.number().optional() }),
]);

const HookEntrySchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(HookConfigSchema),
});

// All 27 CC hook events
const hookEventEntry = z.array(HookEntrySchema).optional();
const HooksSchema = z.object({
  PreToolUse: hookEventEntry, PostToolUse: hookEventEntry, PostToolUseFailure: hookEventEntry,
  Stop: hookEventEntry, StopFailure: hookEventEntry,
  SessionStart: hookEventEntry, SessionEnd: hookEventEntry, Setup: hookEventEntry,
  SubagentStart: hookEventEntry, SubagentStop: hookEventEntry,
  PreCompact: hookEventEntry, PostCompact: hookEventEntry,
  UserPromptSubmit: hookEventEntry, Notification: hookEventEntry,
  PermissionRequest: hookEventEntry, PermissionDenied: hookEventEntry,
  TaskCreated: hookEventEntry, TaskCompleted: hookEventEntry,
  ConfigChange: hookEventEntry, CwdChanged: hookEventEntry, FileChanged: hookEventEntry,
  InstructionsLoaded: hookEventEntry,
  WorktreeCreate: hookEventEntry, WorktreeRemove: hookEventEntry,
  Elicitation: hookEventEntry, ElicitationResult: hookEventEntry,
  TeammateIdle: hookEventEntry,
});

// ── MCP Schema ────────────────────────────────────────────
const MCPServerSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  timeout: z.number().optional(),
  enabled: z.boolean().optional(),
});

const SettingsSchema = z.object({
  autoCompact: z.boolean().default(true),
  compactThreshold: z.number().min(0.1).max(1.0).default(0.8),
  defaultProvider: z.enum(["anthropic", "openai", "glm", "moonshot"]).default("anthropic"),
  defaultModel: z.string().optional(),
  maxTokens: z.number().int().min(256).default(16384),
  thinkingEnabled: z.boolean().default(false),
  thinkingLevel: z.enum(["low", "medium", "high", "max"]).optional(),
  theme: z.enum(["auto", "dark", "light"]).default("auto"),
  showTokenUsage: z.boolean().default(true),
  showThinking: z.boolean().default(true),
  enabledTools: z.array(z.string()).optional(),
  buddyEnabled: z.boolean().default(false),
  mcpServers: z.record(z.string(), MCPServerSchema).optional(),
  hooks: HooksSchema.optional(),
  autoMemoryExtraction: z.boolean().default(true),
  sandboxEnabled: z.boolean().default(true),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  autoCompact: true,
  compactThreshold: 0.8,
  defaultProvider: "anthropic",
  maxTokens: 16384,
  thinkingEnabled: false,
  theme: "auto",
  showTokenUsage: true,
  showThinking: true,
  buddyEnabled: false,
  autoMemoryExtraction: true,
  sandboxEnabled: true,
};

// ── Settings Manager ───────────────────────────────────────

export class SettingsManager {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private filePath: string;
  private loaded = false;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getAppPaths().settingsFile;
  }

  async load(): Promise<Settings> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const raw = JSON.parse(content);
      // Merge with defaults so new fields get default values
      this.settings = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...raw });
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this.loaded = true;
    return this.settings;
  }

  async save(): Promise<void> {
    const content = JSON.stringify(this.settings, null, 2);
    await fs.writeFile(this.filePath, content, "utf-8");
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.settings[key];
  }

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    this.settings[key] = value;
    await this.save();
  }

  getAll(): Settings {
    return { ...this.settings };
  }
}
