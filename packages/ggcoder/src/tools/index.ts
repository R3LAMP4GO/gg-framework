import path from "node:path";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { ProcessManager } from "../core/process-manager.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createEditTool } from "./edit.js";
import { createBashTool } from "./bash.js";
import { createFindTool } from "./find.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";
import { createSubAgentTool } from "./subagent.js";
import { createWebFetchTool } from "./web-fetch.js";
import { createTaskOutputTool } from "./task-output.js";
import { createTaskStopTool } from "./task-stop.js";
import { createTasksTool } from "./tasks.js";
import { createSkillTool } from "./skill.js";
import { createTypecheckTool } from "./typecheck.js";
import { createEnterPlanTool } from "./enter-plan.js";
import { createExitPlanTool } from "./exit-plan.js";
import { localOperations, type ToolOperations } from "./operations.js";
import type { AgentDefinition } from "../core/agents.js";
import type { Skill } from "../core/skills.js";

export interface CreateToolsOptions {
  agents?: AgentDefinition[];
  skills?: Skill[];
  provider?: string;
  model?: string;
  /** Custom I/O operations for remote execution (SSH, Docker, etc.). Defaults to local filesystem. */
  operations?: ToolOperations;
  /** Ref for checking plan mode state inside tool execute functions. */
  planModeRef?: { current: boolean };
  /** Callback when the LLM enters plan mode. */
  onEnterPlan?: (reason?: string) => void;
  /** Callback when the LLM exits plan mode. Returns approval result string. */
  onExitPlan?: (planPath: string) => Promise<string>;
  /** Project-local .gg directory for scratchpad coordination. Defaults to `${cwd}/.gg`. */
  ggDir?: string;
}

export interface CreateToolsResult {
  tools: AgentTool[];
  processManager: ProcessManager;
}

export function createTools(cwd: string, opts?: CreateToolsOptions): CreateToolsResult {
  const readFiles = new Set<string>();
  const processManager = new ProcessManager();
  const ops = opts?.operations ?? localOperations;
  const planModeRef = opts?.planModeRef;

  const tools: AgentTool[] = [
    createReadTool(cwd, readFiles, ops),
    createWriteTool(cwd, readFiles, ops, planModeRef),
    createEditTool(cwd, readFiles, ops, planModeRef),
    createBashTool(cwd, processManager, ops, planModeRef),
    createFindTool(cwd),
    createGrepTool(cwd, ops),
    createLsTool(cwd, ops),
    createWebFetchTool(),
    createTaskOutputTool(processManager),
    createTaskStopTool(processManager),
    createTasksTool(cwd),
    createTypecheckTool(cwd),
  ];

  if (opts?.agents && opts.agents.length > 0 && opts.provider && opts.model) {
    const ggDir = opts.ggDir ?? path.join(cwd, ".gg");
    tools.push(createSubAgentTool(cwd, opts.agents, opts.provider, opts.model, planModeRef, ggDir));
  }

  if (opts?.skills && opts.skills.length > 0) {
    tools.push(createSkillTool(opts.skills));
  }

  if (opts?.onEnterPlan) {
    tools.push(createEnterPlanTool(opts.onEnterPlan));
  }

  if (opts?.onExitPlan) {
    tools.push(createExitPlanTool(cwd, opts.onExitPlan));
  }

  // Filter out disallowed tools when running as a subagent with tool restrictions
  const disallowed = process.env.GG_DISALLOWED_TOOLS;
  if (disallowed) {
    const blocked = new Set(disallowed.split(",").map((t) => t.trim()));
    const filtered = tools.filter((t) => !blocked.has(t.name));
    return { tools: filtered, processManager };
  }

  return { tools, processManager };
}

export { createReadTool } from "./read.js";
export { createWriteTool } from "./write.js";
export { createEditTool } from "./edit.js";
export { createBashTool } from "./bash.js";
export { createFindTool } from "./find.js";
export { createGrepTool } from "./grep.js";
export { createLsTool } from "./ls.js";
export { createWebFetchTool } from "./web-fetch.js";
export { createTaskOutputTool } from "./task-output.js";
export { createTaskStopTool } from "./task-stop.js";
export { createTasksTool } from "./tasks.js";
export { createSkillTool } from "./skill.js";
export { createTypecheckTool } from "./typecheck.js";
export { createEnterPlanTool } from "./enter-plan.js";
export { createExitPlanTool } from "./exit-plan.js";
export { ProcessManager } from "../core/process-manager.js";
export { localOperations, type ToolOperations } from "./operations.js";
