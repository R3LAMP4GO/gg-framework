import fs from "node:fs/promises";
import path from "node:path";
import { log } from "../logger.js";
import type { SettingsManager } from "../settings-manager.js";
import { executeCommandHook, executeHttpHook, executePromptHook } from "./executor.js";
import { ALL_HOOK_EVENTS } from "./types.js";
import type { HookConfig, HookContext, HookEntry, HookEvent, HookResult, HooksConfig } from "./types.js";

/**
 * Manages hook loading, matching, and execution.
 */
export class HookManager {
  private hooks: HooksConfig = {};

  /**
   * Load hooks from global settings + project-local .gg/hooks.json.
   * Project hooks override global (later entries win).
   */
  async loadHooks(settingsManager: SettingsManager, projectDir: string): Promise<void> {
    // Global hooks from settings
    const globalHooks = (settingsManager.get("hooks") as HooksConfig | undefined) ?? {};

    // Project hooks from .gg/hooks.json
    let projectHooks: HooksConfig = {};
    try {
      const hookPath = path.join(projectDir, ".gg", "hooks.json");
      const raw = JSON.parse(await fs.readFile(hookPath, "utf-8"));
      projectHooks = raw as HooksConfig;
    } catch {
      // No project hooks — fine
    }

    // Merge: project entries appended after global (processed later = higher priority)
    const events = ALL_HOOK_EVENTS;
    const merged: HooksConfig = {};
    for (const event of events) {
      const global = (globalHooks as Record<string, HookEntry[] | undefined>)[event] ?? [];
      const project = (projectHooks as Record<string, HookEntry[] | undefined>)[event] ?? [];
      if (global.length > 0 || project.length > 0) {
        (merged as Record<string, HookEntry[]>)[event] = [...global, ...project];
      }
    }
    this.hooks = merged;

    const total =
      (this.hooks.PreToolUse?.length ?? 0) +
      (this.hooks.PostToolUse?.length ?? 0) +
      (this.hooks.Stop?.length ?? 0);
    if (total > 0) {
      log("INFO", "hooks", `Loaded ${total} hook entries`);
    }
  }

  /**
   * Get hook configs matching an event and optional tool name.
   */
  getMatchingHooks(event: HookEvent, toolName?: string): HookConfig[] {
    const entries = this.hooks[event] ?? [];
    const matched: HookConfig[] = [];

    for (const entry of entries) {
      if (matchesPattern(entry.matcher, toolName)) {
        matched.push(...entry.hooks);
      }
    }

    return matched;
  }

  /**
   * Run all matching hooks for an event. Sequential execution.
   * Returns aggregated results. Stops on first block=true.
   */
  async runHooks(event: HookEvent, ctx: HookContext): Promise<HookResult[]> {
    const hooks = this.getMatchingHooks(event, ctx.toolName);
    if (hooks.length === 0) return [];

    log("INFO", "hooks", `Running ${hooks.length} ${event} hook(s) for ${ctx.toolName ?? "all"}`);

    const results: HookResult[] = [];
    for (const hook of hooks) {
      let result: HookResult;
      switch (hook.type) {
        case "command":
          result = await executeCommandHook(hook, ctx);
          break;
        case "prompt":
          result = await executePromptHook(hook, ctx);
          break;
        case "http":
          result = await executeHttpHook(hook, ctx);
          break;
        case "agent":
          // Agent hooks are complex — for v1, treat as a prompt hook
          log("INFO", "hooks", "Agent hook type — executing as prompt evaluation");
          result = await executePromptHook({ type: "prompt", prompt: hook.prompt, timeout: hook.timeout }, ctx);
          break;
        default:
          result = { ok: true };
      }

      log(
        "INFO",
        "hooks",
        `Hook result: ok=${result.ok}${result.message ? `, message="${result.message}"` : ""}${result.block ? ", BLOCK" : ""}`,
      );

      results.push(result);

      // Stop chain on block
      if (result.block) break;
    }

    return results;
  }
}

/**
 * Check if a tool name matches a matcher pattern.
 * Empty/undefined matcher matches everything.
 * Pattern is "|" separated, case-insensitive.
 */
function matchesPattern(matcher: string | undefined, toolName: string | undefined): boolean {
  if (!matcher || matcher.trim() === "") return true;
  if (!toolName) return true;

  const patterns = matcher.split("|").map((p) => p.trim().toLowerCase());
  return patterns.includes(toolName.toLowerCase());
}
