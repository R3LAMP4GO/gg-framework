import { agentLoop, isAbortError, type AgentEvent, type AgentTool } from "@kenkaiiii/gg-agent";
import { ProviderError, type Message, type Provider, type ThinkingLevel } from "@kenkaiiii/gg-ai";
import { EventBus } from "./event-bus.js";
import {
  SlashCommandRegistry,
  createBuiltinCommands,
  type SlashCommandContext,
} from "./slash-commands.js";
import { PROMPT_COMMANDS, getPromptCommand } from "./prompt-commands.js";
import { loadCustomCommands } from "./custom-commands.js";
import { SettingsManager } from "./settings-manager.js";
import { AuthStorage } from "./auth-storage.js";
import { SessionManager, type MessageEntry, type BranchInfo } from "./session-manager.js";
import { ExtensionLoader } from "./extensions/loader.js";
import type { ExtensionContext } from "./extensions/types.js";
import { shouldCompact, compact } from "./compaction/compactor.js";
import { getContextWindow, MODELS } from "./model-registry.js";
import { discoverSkills, type Skill } from "./skills.js";
import { ensureAppDirs } from "../config.js";
import { buildSystemPrompt } from "../system-prompt.js";
import { createTools, type ProcessManager } from "../tools/index.js";
import { MCPClientManager, getMCPServers } from "./mcp/index.js";
import { log } from "./logger.js";
import { setEstimatorModel } from "./compaction/token-estimator.js";
import { discoverAgents } from "./agents.js";
import { VerificationGate } from "./verification-gate.js";
import { EditTransaction } from "./edit-transaction.js";
import { Scratchpad } from "./scratchpad.js";
import { TSLanguageService } from "./ts-language-service.js";
import { HookManager } from "./hooks/index.js";
import { CoordinatorManager, isCoordinatorMode } from "./coordinator/index.js";
import { VerificationTracker, buildVerificationPrompt, parseVerdict } from "./verification-agent.js";
import {
  runExtraction,
  buildExtractionPrompt,
  type ExtractState,
} from "./memory/extract.js";
import { getAutoMemPath } from "./memory/paths.js";
import { scanMemoryFiles, formatMemoryManifest } from "./memory/scan.js";
import {
  checkConsolidationGate,
  tryAcquireLock,
  rollbackLock,
  buildConsolidationPrompt,
} from "./memory/consolidate.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// ── Options ────────────────────────────────────────────────

export interface AgentSessionOptions {
  provider: Provider;
  model: string;
  cwd: string;
  baseUrl?: string;
  systemPrompt?: string;
  sessionId?: string;
  continueRecent?: boolean;
  maxTokens?: number;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

// ── State ──────────────────────────────────────────────────

export interface AgentSessionState {
  provider: Provider;
  model: string;
  cwd: string;
  sessionId: string;
  sessionPath: string;
  messageCount: number;
}

// ── Agent Session ──────────────────────────────────────────

export class AgentSession {
  readonly eventBus = new EventBus();
  readonly slashCommands = new SlashCommandRegistry();

  private settingsManager!: SettingsManager;
  private authStorage!: AuthStorage;
  private sessionManager!: SessionManager;
  private extensionLoader = new ExtensionLoader();

  private messages: Message[] = [];
  private tools: AgentTool[] = [];
  private skills: Skill[] = [];
  private processManager?: ProcessManager;
  private mcpManager?: MCPClientManager;
  private hookManager?: HookManager;
  public coordinatorManager?: CoordinatorManager;
  private extractState: ExtractState = { inProgress: false };
  private verificationTracker = new VerificationTracker();

  private provider: Provider;
  private model: string;
  private cwd: string;
  private baseUrl?: string;
  private maxTokens: number;
  private thinkingLevel?: ThinkingLevel;
  private customSystemPrompt?: string;

  private sessionId = "";
  private sessionPath = "";
  private lastPersistedIndex = 0;
  /** Current leaf entry ID in the session DAG — used to chain parentIds for branching. */
  private currentLeafId: string | null = null;

  private verificationGate!: VerificationGate;
  private editTransaction: EditTransaction | null = null;
  private parentContext: Record<string, unknown> | null = null;
  private tsService: TSLanguageService | null = null;
  private cachedSystemPrompt: string | null = null;
  private opts: AgentSessionOptions;

  constructor(options: AgentSessionOptions) {
    this.opts = options;
    this.provider = options.provider;
    this.model = options.model;
    this.cwd = options.cwd;
    this.baseUrl = options.baseUrl;
    this.maxTokens = options.maxTokens ?? 16384;
    this.thinkingLevel = options.thinkingLevel;
    this.customSystemPrompt = options.systemPrompt;
    this.verificationGate = new VerificationGate(options.cwd);
  }

  async initialize(): Promise<void> {
    // Set model for accurate token estimation
    setEstimatorModel(this.model);

    const paths = await ensureAppDirs();

    // Load settings & auth
    this.settingsManager = new SettingsManager(paths.settingsFile);
    await this.settingsManager.load();

    this.authStorage = new AuthStorage(paths.authFile);
    await this.authStorage.load();

    // Session manager
    this.sessionManager = new SessionManager(paths.sessionsDir);

    // Ensure project-local .gg directories exist (parallel)
    const localGGDir = path.join(this.cwd, ".gg");
    await Promise.all([
      fs.mkdir(path.join(localGGDir, "skills"), { recursive: true }),
      fs.mkdir(path.join(localGGDir, "commands"), { recursive: true }),
      fs.mkdir(path.join(localGGDir, "agents"), { recursive: true }),
    ]);

    // Phase 8: Check for orphaned snapshots + create transaction (parallel with context read)
    const [orphanWarning] = await Promise.all([
      EditTransaction.checkOrphaned(localGGDir),
      (async () => {
        // Phase 7: Read parent context if this is a subagent
        if (process.env.GG_IS_SUBAGENT === "1" && process.env.GG_SESSION_ID) {
          const scratchpad = new Scratchpad(localGGDir, process.env.GG_SESSION_ID);
          this.parentContext = await scratchpad.readContext();
        }
      })(),
    ]);
    if (orphanWarning) {
      log("WARN", "recovery", orphanWarning);
    }
    this.editTransaction = new EditTransaction(localGGDir);

    // Discover skills + agents in parallel (both are independent filesystem reads)
    const [skills, agents] = await Promise.all([
      discoverSkills({ globalSkillsDir: paths.skillsDir, projectDir: this.cwd }),
      discoverAgents({ globalAgentsDir: paths.agentsDir, projectDir: this.cwd }),
    ]);
    this.skills = skills;

    // Build system prompt (needs skills + parentContext, so runs after discovery)
    const basePrompt =
      this.customSystemPrompt ??
      (await buildSystemPrompt(this.cwd, this.skills, undefined, undefined, this.parentContext));
    this.cachedSystemPrompt = basePrompt;
    this.messages = [{ role: "system", content: basePrompt }];
    const transactionRef = { current: this.editTransaction };
    this.tsService = new TSLanguageService(this.cwd);
    const { tools, processManager } = createTools(this.cwd, {
      agents,
      skills: this.skills,
      provider: this.provider,
      model: this.model,
      transactionRef,
      ggDir: localGGDir,
      tsService: this.tsService,
      sandboxEnabled: this.settingsManager.get("sandboxEnabled"),
    });
    this.tools = tools;
    this.processManager = processManager;

    // Load hooks
    this.hookManager = new HookManager();
    await this.hookManager.loadHooks(this.settingsManager, this.cwd);

    // Initialize coordinator mode if enabled
    if (isCoordinatorMode()) {
      this.coordinatorManager = new CoordinatorManager();
      this.coordinatorManager.activate();
    }

    // Connect MCP servers (non-blocking — failures are logged and skipped)
    this.mcpManager = new MCPClientManager();
    try {
      let apiKey: string | undefined;
      if (this.provider === "glm") {
        try {
          const glmCreds = await this.authStorage.resolveCredentials("glm");
          apiKey = glmCreds.accessToken;
        } catch {
          // GLM not configured — skip Z.AI MCP servers
        }
      }
      const userMCP = this.settingsManager.get("mcpServers");
      const mcpTools = await this.mcpManager.connectAll(getMCPServers(this.provider, apiKey, userMCP));
      this.tools.push(...mcpTools);

      // Rebuild system prompt with MCP tool metadata so the model knows about connected tools
      if (this.mcpManager.toolMeta.length > 0 && !this.customSystemPrompt) {
        const updatedPrompt = await buildSystemPrompt(
          this.cwd,
          this.skills,
          undefined,
          undefined,
          this.parentContext,
          this.mcpManager.toolMeta,
        );
        this.cachedSystemPrompt = updatedPrompt;
        this.messages[0] = { role: "system", content: updatedPrompt };
      }
    } catch (err) {
      log(
        "WARN",
        "mcp",
        `MCP initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Fire Setup + InstructionsLoaded hooks
    if (this.hookManager) {
      this.hookManager.runHooks("Setup", { cwd: this.cwd }).catch(() => {});
      this.hookManager.runHooks("InstructionsLoaded", { cwd: this.cwd }).catch(() => {});
    }

    // Check if autoDream consolidation should run (fire-and-forget)
    this.runConsolidationCheck().catch((err) => {
      log("WARN", "consolidate", `Consolidation check failed: ${err}`);
    });

    // Load or create session
    if (this.opts.sessionId) {
      await this.loadExistingSession(this.opts.sessionId);
    } else if (this.opts.continueRecent) {
      const recentPath = await this.sessionManager.getMostRecent(this.cwd);
      if (recentPath) {
        await this.loadExistingSession(recentPath);
      } else {
        await this.createNewSession();
      }
    } else {
      await this.createNewSession();
    }

    // Register slash commands
    const builtins = createBuiltinCommands();
    for (const cmd of builtins) {
      this.slashCommands.register(cmd);
    }

    // Wire up /help to show all registered + prompt + custom commands
    const helpCmd = this.slashCommands.get("help");
    if (helpCmd) {
      const registry = this.slashCommands;
      const cwd = this.cwd;
      helpCmd.execute = async () => {
        const all = registry.getAll();
        const lines = all.map(
          (c) =>
            `  /${c.name}${c.aliases.length ? ` (${c.aliases.map((a) => "/" + a).join(", ")})` : ""} — ${c.description}`,
        );

        // Add prompt-template commands
        if (PROMPT_COMMANDS.length > 0) {
          lines.push("");
          lines.push("Prompt commands:");
          for (const cmd of PROMPT_COMMANDS) {
            lines.push(
              `  /${cmd.name}${cmd.aliases.length ? ` (${cmd.aliases.map((a) => "/" + a).join(", ")})` : ""} — ${cmd.description}`,
            );
          }
        }

        // Add custom commands from .gg/commands/
        const customCmds = await loadCustomCommands(cwd);
        if (customCmds.length > 0) {
          lines.push("");
          lines.push("Custom commands:");
          for (const cmd of customCmds) {
            lines.push(`  /${cmd.name} — ${cmd.description}`);
          }
        }

        return "Available commands:\n" + lines.join("\n");
      };
    }

    // Load extensions
    const extContext: ExtensionContext = {
      eventBus: this.eventBus,
      registerTool: (tool) => this.tools.push(tool),
      registerSlashCommand: (cmd) => this.slashCommands.register(cmd),
      cwd: this.cwd,
      settingsManager: this.settingsManager,
    };
    await this.extensionLoader.loadAll(paths.extensionsDir, extContext);

    this.eventBus.emit("session_start", { sessionId: this.sessionId });
  }

  /**
   * Process user input. Handles slash commands or runs agent loop.
   */
  async prompt(content: string): Promise<void> {
    // Check for slash commands
    const parsed = this.slashCommands.parse(content);
    if (parsed) {
      // Check prompt-template commands first (built-in + custom)
      const builtinPromptCmd = getPromptCommand(parsed.name);
      const customCmds = await loadCustomCommands(this.cwd);
      const customPromptCmd = !builtinPromptCmd
        ? customCmds.find((c) => c.name === parsed.name)
        : undefined;
      const promptText = builtinPromptCmd?.prompt ?? customPromptCmd?.prompt;

      if (promptText) {
        // Inject the prompt-template command as a user message to the agent
        const fullPrompt = parsed.args
          ? `${promptText}\n\n## User Instructions\n\n${parsed.args}`
          : promptText;
        // Run as a normal prompt (push message + agent loop)
        const userMessage: Message = { role: "user", content: fullPrompt };
        this.messages.push(userMessage);
        await this.persistMessage(userMessage);
        this.lastPersistedIndex = this.messages.length;
        await this.runLoop();
        return;
      }

      const cmdContext = this.createSlashCommandContext();
      const result = await this.slashCommands.execute(content, cmdContext);
      if (result) {
        this.eventBus.emit("text_delta", { text: result + "\n" });
      }
      return;
    }

    // Push user message
    const userMessage: Message = { role: "user", content };
    this.messages.push(userMessage);
    await this.persistMessage(userMessage);
    this.lastPersistedIndex = this.messages.length;

    await this.runLoop();
  }

  /** Auto-compact if needed, run agent loop with auth retry, and persist messages. */
  private async runLoop(): Promise<void> {
    // Auto-compact if needed
    if (this.settingsManager.get("autoCompact")) {
      const contextWindow = getContextWindow(this.model);
      const threshold = this.settingsManager.get("compactThreshold");
      if (shouldCompact(this.messages, contextWindow, threshold)) {
        await this.compact();
      }
    }

    // Resolve OAuth credentials and run agent loop.
    // On 401, force-refresh the token and retry once — the provider may have
    // revoked the token server-side before the stored expiry (e.g. after a restart).
    let creds = await this.authStorage.resolveCredentials(this.provider);

    this.verificationGate.reset();

    // Fire SessionStart hook
    if (this.hookManager) {
      this.hookManager.runHooks("SessionStart", { cwd: this.cwd }).catch(() => {});
    }

    const runAgentLoop = async (apiKey: string, accountId?: string) => {
      const generator = agentLoop(this.messages, {
        provider: this.provider,
        model: this.model,
        tools: this.tools,
        webSearch: true,
        maxTokens: this.maxTokens,
        thinking: this.thinkingLevel,
        apiKey,
        baseUrl: this.baseUrl,
        signal: this.opts.signal,
        accountId,
        cacheRetention: "short",
        // clearToolUses disabled — causes model to output unsolicited context summaries
        // Single tool result shouldn't exceed 30% of context window (in chars)
        maxToolResultChars: Math.floor(getContextWindow(this.model) * 3.5 * 0.3),
        getSteeringMessages: async () => {
          const gateMsg = await this.verificationGate.getSteeringMessage();
          if (gateMsg) {
            return [{ role: "user" as const, content: gateMsg }];
          }
          return null;
        },
        // ── Hook callbacks ──
        onPreToolUse: this.hookManager
          ? async (toolName, args) => {
              const results = await this.hookManager!.runHooks("PreToolUse", {
                toolName,
                toolInput: args,
                cwd: this.cwd,
              });
              const blocked = results.find((r) => !r.ok || r.block);
              if (blocked) {
                return { allow: false, message: blocked.message ?? "Blocked by hook" };
              }
              return null;
            }
          : undefined,
        onPostToolUse: this.hookManager
          ? async (toolName, args, result, isError) => {
              const results = await this.hookManager!.runHooks("PostToolUse", {
                toolName,
                toolInput: args,
                toolOutput: result,
                isError,
                cwd: this.cwd,
              });
              const messages = results.filter((r) => r.message).map((r) => r.message!);
              if (messages.length > 0) {
                return { message: messages.join("\n") };
              }
              return null;
            }
          : undefined,
        onStop: this.hookManager
          ? async () => {
              const results = await this.hookManager!.runHooks("Stop", { cwd: this.cwd });
              const blocked = results.find((r) => r.block);
              if (blocked) {
                return { block: true, message: blocked.message ?? "Stop blocked by hook" };
              }
              return null;
            }
          : undefined,
      });

      // Track in-flight tool calls for verification gate
      const activeTools = new Map<string, { name: string; args: Record<string, unknown> }>();

      for await (const event of generator as AsyncIterable<AgentEvent>) {
        // Feed tool events to verification gate
        if (event.type === "tool_call_start") {
          activeTools.set(event.toolCallId, { name: event.name, args: event.args });
          // Coordinator: track subagent workers
          if (event.name === "subagent" && this.coordinatorManager?.isActive) {
            const task = typeof event.args.task === "string" ? event.args.task : "worker task";
            this.coordinatorManager.registerWorker(task, event.toolCallId);
          }
          // Fire hook: SubagentStart
          if (event.name === "subagent" && this.hookManager) {
            this.hookManager.runHooks("SubagentStart", { toolName: event.name, toolInput: event.args, cwd: this.cwd }).catch(() => {});
          }
        } else if (event.type === "tool_call_end") {
          const tc = activeTools.get(event.toolCallId);
          if (tc) {
            if (
              (tc.name === "edit" || tc.name === "write") &&
              !event.isError &&
              tc.args.file_path &&
              typeof tc.args.file_path === "string"
            ) {
              this.verificationGate.recordEdit(tc.args.file_path);
              this.verificationTracker.trackEdit(tc.args.file_path as string);
            }
            if (tc.name === "bash" && tc.args.command && typeof tc.args.command === "string") {
              this.verificationGate.recordBashCommand(tc.args.command);
            }
            this.verificationGate.recordToolResult(event.result, event.isError);

            // Coordinator: complete/fail worker
            if (tc.name === "subagent" && this.coordinatorManager?.isActive) {
              if (event.isError) {
                this.coordinatorManager.failWorker(event.toolCallId, event.result);
              } else {
                this.coordinatorManager.completeWorker(event.toolCallId, event.result);
              }
            }
            // Fire hook: SubagentStop
            if (tc.name === "subagent" && this.hookManager) {
              this.hookManager.runHooks("SubagentStop", { toolName: tc.name, toolOutput: event.result, isError: event.isError, cwd: this.cwd }).catch(() => {});
            }
            // Fire hook: FileChanged on successful write/edit
            if ((tc.name === "edit" || tc.name === "write") && !event.isError && this.hookManager) {
              this.hookManager.runHooks("FileChanged", { toolName: tc.name, toolInput: tc.args, cwd: this.cwd }).catch(() => {});
            }

            activeTools.delete(event.toolCallId);
          }
        }
        this.eventBus.forwardAgentEvent(event);
      }

      // ── Adversarial verification (fire-and-forget after 3+ edits) ──
      if (this.verificationTracker.shouldVerify()) {
        const editedFiles = this.verificationTracker.getEditedFiles();
        log("INFO", "verification", `Triggering adversarial verification — ${editedFiles.length} files edited`);
        this.verificationTracker.reset();
        // Verification runs as a background subagent
        this.runBackgroundVerification(editedFiles).catch((err) => {
          log("WARN", "verification", `Verification failed: ${err}`);
        });
      }

      // ── Background memory extraction (fire-and-forget) ──
      if (this.settingsManager.get("autoMemoryExtraction")) {
        this.runBackgroundExtraction().catch((err) => {
          log("WARN", "extractMemories", `Background extraction failed: ${err}`);
        });
      }
    };

    try {
      await runAgentLoop(creds.accessToken, creds.accountId);
    } catch (err) {
      // Abort errors are expected (user cancellation) — don't retry or re-throw
      if (isAbortError(err) || this.opts.signal?.aborted) {
        return;
      }
      if (err instanceof ProviderError && err.statusCode === 401) {
        // API-key providers (GLM, Moonshot) have no refresh mechanism — retrying
        // with the same key is pointless. Clear the credential and let the error
        // surface so the user knows to re-login with a valid key.
        if (this.provider === "glm" || this.provider === "moonshot") {
          log("WARN", "auth", `Got 401 for ${this.provider} — API key is invalid or revoked`);
          await this.authStorage.clearCredentials(this.provider);
          throw err;
        }
        log("INFO", "auth", "Got 401, force-refreshing token and retrying");
        creds = await this.authStorage.resolveCredentials(this.provider, { forceRefresh: true });
        await runAgentLoop(creds.accessToken, creds.accountId);
      } else {
        throw err;
      }
    }

    // Persist new messages
    for (let i = this.lastPersistedIndex; i < this.messages.length; i++) {
      await this.persistMessage(this.messages[i]);
    }
    this.lastPersistedIndex = this.messages.length;
  }

  async switchModel(provider: string, model: string): Promise<void> {
    const prevProvider = this.provider;
    if (provider) this.provider = provider as Provider;
    this.model = model;
    setEstimatorModel(model);
    this.eventBus.emit("model_change", { provider: this.provider, model: this.model });

    // Reconnect MCP servers when provider changes (e.g. GLM needs Z.AI tools, others don't)
    if (provider && provider !== prevProvider && this.mcpManager) {
      // Remove old MCP tools
      this.tools = this.tools.filter((t) => !t.name.startsWith("mcp__"));

      // Disconnect old MCP servers
      await this.mcpManager.dispose();

      // Connect new MCP servers for the new provider
      try {
        let apiKey: string | undefined;
        if (this.provider === "glm") {
          try {
            const glmCreds = await this.authStorage.resolveCredentials("glm");
            apiKey = glmCreds.accessToken;
          } catch {
            // GLM not configured — skip Z.AI MCP servers
          }
        }
        const userMCP = this.settingsManager.get("mcpServers");
        const mcpTools = await this.mcpManager.connectAll(getMCPServers(this.provider, apiKey, userMCP));
        this.tools.push(...mcpTools);
      } catch (err) {
        log(
          "WARN",
          "mcp",
          `MCP reconnection failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async compact(): Promise<void> {
    const contextWindow = getContextWindow(this.model);
    this.eventBus.emit("compaction_start", { messageCount: this.messages.length });

    const creds = await this.authStorage.resolveCredentials(this.provider);

    const result = await compact(this.messages, {
      provider: this.provider,
      model: this.model,
      apiKey: creds.accessToken,
      contextWindow,
      signal: this.opts.signal,
    });

    this.messages = result.messages;

    // Persist compacted messages to a new session file so `ggcoder continue`
    // picks up the compacted state instead of the full original history.
    const session = await this.sessionManager.create(this.cwd, this.provider, this.model);
    this.sessionId = session.id;
    this.sessionPath = session.path;

    // Write compacted messages (skip system — it's rebuilt on load)
    for (const msg of this.messages) {
      if (msg.role === "system") continue;
      await this.persistMessage(msg);
    }
    this.lastPersistedIndex = this.messages.length;

    this.eventBus.emit("compaction_end", {
      originalCount: result.result.originalCount,
      newCount: result.result.newCount,
    });
  }

  async newSession(): Promise<void> {
    const basePrompt =
      this.cachedSystemPrompt ??
      this.customSystemPrompt ??
      (await buildSystemPrompt(this.cwd, this.skills));
    this.messages = [{ role: "system", content: basePrompt }];
    await this.createNewSession();
    this.eventBus.emit("session_start", { sessionId: this.sessionId });
  }

  async loadSession(sessionPath: string): Promise<void> {
    await this.loadExistingSession(sessionPath);
    this.eventBus.emit("session_start", { sessionId: this.sessionId });
  }

  /**
   * Create a branch at a specific point in the conversation.
   * Rewinds the message history to the given entry and sets the leaf
   * so new messages fork from that point.
   *
   * @param stepsBack Number of messages to rewind (default: 2 — backs up past last assistant + tool)
   */
  async branch(stepsBack = 2): Promise<{ branchedFrom: number; messagesKept: number }> {
    // Load the full session to access the DAG
    const loaded = await this.sessionManager.load(this.sessionPath);
    const branch = this.sessionManager.getBranch(loaded.entries, this.currentLeafId);

    // Walk back stepsBack message entries
    const messageEntries = branch.filter((e) => e.type === "message");
    const targetIndex = Math.max(0, messageEntries.length - stepsBack);

    if (targetIndex === 0) {
      throw new Error("Cannot branch — already at the start of the conversation.");
    }

    // Set leaf to the entry just before the branch point
    const newLeafEntry = messageEntries[targetIndex - 1]!;
    this.currentLeafId = newLeafEntry.id;
    await this.sessionManager.updateLeaf(this.sessionPath, newLeafEntry.id);

    // Rebuild messages from the new branch
    const branchMessages = this.sessionManager.getMessages(loaded.entries, this.currentLeafId);
    const systemMsg = this.messages[0];
    this.messages = [systemMsg, ...branchMessages];
    this.lastPersistedIndex = this.messages.length;

    this.eventBus.emit("branch_created", {
      leafId: this.currentLeafId,
      messagesKept: branchMessages.length,
    });

    return {
      branchedFrom: messageEntries.length,
      messagesKept: branchMessages.length,
    };
  }

  /**
   * List all branches in the current session.
   */
  async listBranches(): Promise<BranchInfo[]> {
    const loaded = await this.sessionManager.load(this.sessionPath);
    return this.sessionManager.listBranches(loaded.entries);
  }

  getState(): AgentSessionState {
    return {
      provider: this.provider,
      model: this.model,
      cwd: this.cwd,
      sessionId: this.sessionId,
      sessionPath: this.sessionPath,
      messageCount: this.messages.length,
    };
  }

  getMessages(): Message[] {
    return this.messages;
  }

  /** Replace the abort signal (e.g. after cancellation). */
  setSignal(signal: AbortSignal): void {
    this.opts = { ...this.opts, signal };
  }

  /**
   * Spawn adversarial verification agent after 3+ file edits.
   */
  private async runBackgroundVerification(editedFiles: string[]): Promise<void> {
    const prompt = buildVerificationPrompt("Recent implementation changes", editedFiles);
    const { spawn } = await import("node:child_process");
    const binPath = process.argv[1];
    const child = spawn(
      process.execPath,
      [binPath, "--json", "--provider", this.provider, "--model", this.model, "--max-turns", "10", prompt],
      {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GG_IS_SUBAGENT: "1", GG_DISALLOWED_TOOLS: "write,edit,subagent" },
      },
    );
    let output = "";
    child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
    child.on("close", (code) => {
      const verdict = parseVerdict(output);
      log("INFO", "verification", `Verification complete: ${verdict} (exit ${code})`);
      if (verdict === "FAIL") {
        log("WARN", "verification", `VERIFICATION FAILED — agent found issues in edited files`);
      }
    });
    setTimeout(() => { if (!child.killed) child.kill("SIGTERM"); }, 120_000);
  }

  /**
   * Check consolidation gates and spawn autoDream if needed.
   * Fire-and-forget at session start.
   */
  private async runConsolidationCheck(): Promise<void> {
    const sessionsDir = path.join(
      (await import("../config.js")).getAppPaths().sessionsDir,
      // Sessions are stored per-cwd
    );
    const gate = await checkConsolidationGate(this.cwd, sessionsDir);
    if (!gate.shouldRun) {
      log("INFO", "consolidate", `Skipping: ${gate.reason}`);
      return;
    }

    const memoryDir = await getAutoMemPath(this.cwd);
    const priorMtime = await tryAcquireLock(memoryDir);
    if (priorMtime === null) {
      log("INFO", "consolidate", "Lock held by another process — skipping");
      return;
    }

    log(
      "INFO",
      "consolidate",
      `Firing autoDream — ${gate.hoursSince?.toFixed(1)}h since last, ${gate.sessionsSince} sessions`,
    );

    try {
      const { spawn } = await import("node:child_process");
      const prompt = buildConsolidationPrompt(memoryDir, sessionsDir);
      const binPath = process.argv[1];
      const child = spawn(
        process.execPath,
        [
          binPath,
          "--json",
          "--provider", this.provider,
          "--model", this.model,
          "--max-turns", "10",
          prompt,
        ],
        {
          cwd: this.cwd,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            GG_IS_SUBAGENT: "1",
            GG_DISALLOWED_TOOLS: "subagent",
            GG_MEMORY_DIR: memoryDir,
          },
        },
      );

      child.on("close", (code) => {
        if (code === 0) {
          log("INFO", "consolidate", "autoDream completed successfully");
        } else {
          log("WARN", "consolidate", `autoDream exited with code ${code} — rolling back lock`);
          rollbackLock(memoryDir, priorMtime).catch(() => {});
        }
      });

      // Safety timeout — kill after 5 minutes
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGTERM");
          setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 3000);
          rollbackLock(memoryDir, priorMtime).catch(() => {});
        }
      }, 300_000);
    } catch (err) {
      await rollbackLock(memoryDir, priorMtime);
      throw err;
    }
  }

  /**
   * Spawn a background extraction agent to auto-save memories.
   * Fire-and-forget — does not block the main conversation.
   */
  private async runBackgroundExtraction(): Promise<void> {
    const result = await runExtraction(this.messages, this.cwd, this.extractState);

    // If extraction determined there's nothing to do, just advance cursor
    if (!result.newCursor) return;

    // Check if there's actually work to do (runExtraction returns early for <2 messages, mutual exclusion, etc.)
    const memoryDir = await getAutoMemPath(this.cwd);
    const headers = await scanMemoryFiles(memoryDir);
    const manifest = formatMemoryManifest(headers);
    const newMessageCount = this.messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    ).length;
    const prompt = buildExtractionPrompt(newMessageCount, manifest, memoryDir);

    this.extractState.inProgress = true;
    log("INFO", "extractMemories", `Spawning extraction agent — ${newMessageCount} messages`);

    try {
      const { spawn } = await import("node:child_process");
      const binPath = process.argv[1];
      const child = spawn(
        process.execPath,
        [
          binPath,
          "--json",
          "--provider", this.provider,
          "--model", this.model,
          "--max-turns", "5",
          prompt,
        ],
        {
          cwd: this.cwd,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            GG_IS_SUBAGENT: "1",
            GG_DISALLOWED_TOOLS: "subagent",
            GG_MEMORY_DIR: memoryDir,
          },
        },
      );

      let output = "";
      child.stdout?.on("data", (d: Buffer) => {
        output += d.toString();
      });

      await new Promise<void>((resolve) => {
        child.on("close", (code) => {
          this.extractState.inProgress = false;
          this.extractState.lastProcessedUuid = result.newCursor;

          if (code === 0) {
            // Count memory files written by scanning for write/edit tool uses in output
            const writeCount = (output.match(/"name"\s*:\s*"(?:write|edit)"/g) ?? []).length;
            if (writeCount > 0) {
              log("INFO", "extractMemories", `Extraction complete — ${writeCount} memory operations`);
            } else {
              log("INFO", "extractMemories", "Extraction complete — no memories saved");
            }
          } else {
            log("WARN", "extractMemories", `Extraction agent exited with code ${code}`);
          }
          resolve();
        });

        // Safety timeout — kill after 60s
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGTERM");
            setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 3000);
          }
        }, 60_000);
      });
    } catch (err) {
      this.extractState.inProgress = false;
      throw err;
    }
  }

  async dispose(): Promise<void> {
    // Fire SessionEnd hook
    if (this.hookManager) {
      await this.hookManager.runHooks("SessionEnd", { cwd: this.cwd }).catch(() => {});
    }
    this.processManager?.shutdownAll();
    await this.mcpManager?.dispose();
    await this.extensionLoader.deactivateAll();
    await this.editTransaction?.commit();
    this.tsService?.dispose();
    this.eventBus.removeAllListeners();
    this.messages = [];
    this.tools = [];
  }

  // ── Private ────────────────────────────────────────────

  private async createNewSession(): Promise<void> {
    const session = await this.sessionManager.create(this.cwd, this.provider, this.model);
    this.sessionId = session.id;
    this.sessionPath = session.path;
    this.lastPersistedIndex = this.messages.length;
  }

  private async loadExistingSession(sessionPath: string): Promise<void> {
    const loaded = await this.sessionManager.load(sessionPath);
    // Use the leaf from the header to walk the correct branch
    const loadedMessages = this.sessionManager.getMessages(loaded.entries, loaded.header.leafId);

    // Track the current leaf for subsequent entries
    this.currentLeafId = loaded.header.leafId;

    // Rebuild messages: keep system, add loaded
    const systemMsg = this.messages[0]; // Already built
    this.messages = [systemMsg, ...loadedMessages];

    // Auto-compact on load if the restored session exceeds the context window.
    // Without this, huge sessions (1M+ tokens) get loaded into memory and OOM.
    const contextWindow = getContextWindow(this.model);
    if (shouldCompact(this.messages, contextWindow, 0.8)) {
      log("INFO", "session", `Restored session exceeds context — auto-compacting`);
      const creds = await this.authStorage.resolveCredentials(this.provider);
      const compacted = await compact(this.messages, {
        provider: this.provider,
        model: this.model,
        apiKey: creds.accessToken,
        contextWindow,
        signal: this.opts.signal,
      });
      this.messages = compacted.messages;
      log("INFO", "session", `Auto-compaction complete`, {
        before: String(compacted.result.originalCount),
        after: String(compacted.result.newCount),
      });
    }

    // Create new session file for continuation
    const session = await this.sessionManager.create(this.cwd, this.provider, this.model);
    this.sessionId = session.id;
    this.sessionPath = session.path;

    // Re-persist (compacted) messages — skip system, it's rebuilt on load
    for (const msg of this.messages) {
      if (msg.role === "system") continue;
      await this.persistMessage(msg);
    }
    this.lastPersistedIndex = this.messages.length;
  }

  private async persistMessage(message: Message): Promise<void> {
    const entryId = crypto.randomUUID();
    const entry: MessageEntry = {
      type: "message",
      id: entryId,
      parentId: this.currentLeafId,
      timestamp: new Date().toISOString(),
      message,
    };
    await this.sessionManager.appendEntry(this.sessionPath, entry);
    this.currentLeafId = entryId;
    await this.sessionManager.updateLeaf(this.sessionPath, entryId);
  }

  private createSlashCommandContext(): SlashCommandContext {
    return {
      switchModel: (provider, model) => this.switchModel(provider, model),
      compact: () => this.compact(),
      newSession: () => this.newSession(),
      listSessions: async () => {
        const sessions = await this.sessionManager.list(this.cwd);
        if (sessions.length === 0) return "No sessions found.";
        return sessions
          .map((s) => `  ${s.id.slice(0, 8)} — ${s.timestamp} (${s.messageCount} messages)`)
          .join("\n");
      },
      getSettings: () => this.settingsManager.getAll() as unknown as Record<string, unknown>,
      setSetting: async (key, value) => {
        await this.settingsManager.set(
          key as keyof ReturnType<SettingsManager["getAll"]>,
          value as never,
        );
      },
      getModelList: () => {
        const current = `Current: ${this.provider}:${this.model}\n\nAvailable models:\n`;
        const list = MODELS.map((m) => `  ${m.provider}:${m.id} — ${m.name} (${m.costTier})`).join(
          "\n",
        );
        return current + list;
      },
      quit: () => {
        process.exit(0);
      },
      branch: async (stepsBack?: number) => {
        const result = await this.branch(stepsBack);
        return `Branched: rewound from ${result.branchedFrom} to ${result.messagesKept} messages. New messages will fork from here.`;
      },
      listBranches: async () => {
        const branches = await this.listBranches();
        if (branches.length <= 1) return "No branches — conversation is linear.";
        const lines = branches.map(
          (b, i) =>
            `  ${i + 1}. ${b.leafId.slice(0, 8)} — ${b.entryCount} entries (${b.leafId === this.currentLeafId ? "active" : "inactive"})`,
        );
        return `${branches.length} branch(es):\n${lines.join("\n")}`;
      },
    };
  }
}
