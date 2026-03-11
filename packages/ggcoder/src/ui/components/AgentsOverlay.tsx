import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";
import type { AgentDefinition } from "../../core/agents.js";
import {
  createAgentFile,
  deleteAgentFile,
  updateAgentModel,
  updateAgentTools,
  discoverAgents,
} from "../../core/agents.js";

// ── Types ────────────────────────────────────────────────

type Screen =
  | "list"
  | "agent-menu"
  | "view"
  | "edit-menu"
  | "edit-tools"
  | "edit-model"
  | "confirm-delete";

// ── Banner ───────────────────────────────────────────────

const AGENT_LOGO = [
  " ▄▀▀▀ ▄▀▀▀",
  " █ ▀█ █ ▀█",
  " ▀▄▄▀ ▀▄▄▀",
];

const GRADIENT = [
  "#818cf8",
  "#9b8bf8",
  "#b58af8",
  "#cf89f8",
  "#818cf8",
  "#cf89f8",
  "#b58af8",
  "#9b8bf8",
];

const GAP = "   ";

function AgentGradientText({ text }: { text: string }) {
  const chars: React.ReactNode[] = [];
  let colorIdx = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") {
      chars.push(ch);
    } else {
      const color = GRADIENT[colorIdx % GRADIENT.length];
      chars.push(
        <Text key={i} color={color}>
          {ch}
        </Text>,
      );
      colorIdx++;
    }
  }
  return <Text>{chars}</Text>;
}

// ── Tool categories ─────────────────────────────────────

const TOOL_CATEGORIES: { label: string; tools: string[] }[] = [
  { label: "Read-only tools", tools: ["read", "grep", "find", "ls"] },
  { label: "Edit tools", tools: ["edit", "write"] },
  { label: "Execution tools", tools: ["bash", "subagent"] },
  { label: "Other tools", tools: ["web_fetch", "web_search", "tasks", "task_output", "task_stop", "ask_user_question", "enter_plan_mode", "exit_plan_mode"] },
];

const ALL_KNOWN_TOOLS = TOOL_CATEGORIES.flatMap((c) => c.tools);

// ── Model options ────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: "sonnet", label: "Sonnet", desc: "Balanced performance — best for most agents" },
  { value: "opus", label: "Opus", desc: "Most capable for complex reasoning tasks" },
  { value: "haiku", label: "Haiku", desc: "Fast and efficient for simple tasks" },
  { value: "inherit", label: "Inherit from parent", desc: "Use the same model as the main conversation" },
];

// ── Component ────────────────────────────────────────────

export interface AgentsOverlayProps {
  agents: AgentDefinition[];
  builtinAgents?: AgentDefinition[];
  agentsDir: string;
  cwd: string;
  onClose: () => void;
  onAgentsChanged: () => void;
  onOpenEditor?: (filePath: string) => Promise<void>;
}

export function AgentsOverlay({
  agents: initialAgents,
  builtinAgents = [],
  agentsDir,
  cwd,
  onClose,
  onAgentsChanged,
}: AgentsOverlayProps) {
  const theme = useTheme();

  // ── State ──────────────────────────────────────────────

  const [screen, setScreen] = useState<Screen>("list");
  const [cursor, setCursor] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>(initialAgents);
  const [status, setStatus] = useState("");
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit tools state
  const [editToolsSelection, setEditToolsSelection] = useState<Set<string>>(new Set());

  // New agent name input
  const [isNaming, setIsNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const showStatus = useCallback((msg: string) => {
    setStatus(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 2500);
  }, []);

  // Reload agents from disk
  const reloadAgents = useCallback(async () => {
    try {
      const newAgents = await discoverAgents({
        globalAgentsDir: agentsDir,
        projectDir: cwd,
      });
      setAgents(newAgents);
      onAgentsChanged();
    } catch {
      // Ignore reload errors
    }
  }, [agentsDir, cwd, onAgentsChanged]);

  // Sync with props
  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);

  // ── Computed ───────────────────────────────────────────

  const userAgents = agents.filter((a) => a.source === "global" || a.source === "project");
  const userAgentNames = new Set(userAgents.map((a) => a.name));

  // List items: [Create new] + user agents + builtin agents
  const listItems: { kind: "create" | "user" | "builtin"; agent?: AgentDefinition; label: string }[] = [
    { kind: "create", label: "Create new agent" },
    ...userAgents.map((a) => ({
      kind: "user" as const,
      agent: a,
      label: `${a.name} · ${a.model || "inherit"}`,
    })),
    ...builtinAgents.map((a) => ({
      kind: "builtin" as const,
      agent: a,
      label: `${a.name} · ${a.model || "inherit"}${userAgentNames.has(a.name) ? " ⚠ shadowed by user" : ""}`,
    })),
  ];

  // Agent menu items
  const agentMenuItems = selectedAgent?.source === "builtin"
    ? ["View agent", "Back"]
    : ["View agent", "Edit agent", "Delete agent", "Back"];

  // ── Keyboard ───────────────────────────────────────────

  useInput((input, key) => {
    // ── Name input mode ──
    if (isNaming) {
      if (key.escape) {
        setIsNaming(false);
        setNameInput("");
        return;
      }
      if (key.return) {
        const name = nameInput.trim().toLowerCase().replace(/\s+/g, "-");
        if (name) {
          void (async () => {
            try {
              await createAgentFile(agentsDir, name);
              await reloadAgents();
              // Find the newly created agent
              const newAgents = await discoverAgents({ globalAgentsDir: agentsDir, projectDir: cwd });
              const created = newAgents.find((a) => a.name === name);
              if (created) {
                setSelectedAgent(created);
                setScreen("edit-menu");
                setCursor(0);
              }
              showStatus(`Created agent "${name}"`);
            } catch (err) {
              showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
          })();
        }
        setIsNaming(false);
        setNameInput("");
        return;
      }
      if (key.backspace || key.delete) {
        setNameInput((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setNameInput((prev) => prev + input);
      }
      return;
    }

    // ── Screen-specific input ──

    if (screen === "list") {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow || input === "k") {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => Math.min(listItems.length - 1, c + 1));
        return;
      }
      if (key.return) {
        const item = listItems[cursor];
        if (!item) return;
        if (item.kind === "create") {
          setIsNaming(true);
          setNameInput("");
          return;
        }
        if (item.agent) {
          setSelectedAgent(item.agent);
          setScreen("agent-menu");
          setCursor(0);
        }
        return;
      }
      return;
    }

    if (screen === "agent-menu") {
      if (key.escape) {
        setScreen("list");
        setCursor(0);
        return;
      }
      if (key.upArrow || input === "k") {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => Math.min(agentMenuItems.length - 1, c + 1));
        return;
      }
      if (key.return) {
        const action = agentMenuItems[cursor];
        if (action === "View agent") {
          setScreen("view");
          setCursor(0);
        } else if (action === "Edit agent") {
          setScreen("edit-menu");
          setCursor(0);
        } else if (action === "Delete agent") {
          setScreen("confirm-delete");
          setCursor(0);
        } else {
          setScreen("list");
          setCursor(0);
        }
        return;
      }
      return;
    }

    if (screen === "view") {
      if (key.escape || key.return) {
        setScreen("agent-menu");
        setCursor(0);
      }
      return;
    }

    if (screen === "confirm-delete") {
      if (key.escape || input === "n") {
        setScreen("agent-menu");
        setCursor(0);
        return;
      }
      if (input === "y" && selectedAgent?.filePath) {
        void (async () => {
          try {
            await deleteAgentFile(selectedAgent.filePath!);
            await reloadAgents();
            showStatus(`Deleted agent "${selectedAgent.name}"`);
            setSelectedAgent(null);
            setScreen("list");
            setCursor(0);
          } catch (err) {
            showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
            setScreen("agent-menu");
            setCursor(0);
          }
        })();
        return;
      }
      return;
    }

    if (screen === "edit-menu") {
      const editMenuItems = ["Open in editor", "Edit tools", "Edit model", "Back"];
      if (key.escape) {
        setScreen("agent-menu");
        setCursor(0);
        return;
      }
      if (key.upArrow || input === "k") {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => Math.min(editMenuItems.length - 1, c + 1));
        return;
      }
      if (key.return) {
        const action = editMenuItems[cursor];
        if (action === "Open in editor") {
          if (!selectedAgent?.filePath) {
            showStatus("No file path for this agent");
            return;
          }
          void (async () => {
            const editor = process.env.VISUAL || process.env.EDITOR || "vi";
            const { spawnSync } = await import("node:child_process");
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(false);
            }
            process.stdout.write("\x1b[?1049h");
            spawnSync(editor, [selectedAgent.filePath!], {
              stdio: "inherit",
              shell: true,
            });
            process.stdout.write("\x1b[?1049l");
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(true);
              process.stdin.resume();
            }
            await reloadAgents();
            // Refresh selectedAgent
            const newAgents = await discoverAgents({ globalAgentsDir: agentsDir, projectDir: cwd });
            const updated = newAgents.find((a) => a.name === selectedAgent.name);
            if (updated) setSelectedAgent(updated);
            showStatus("Reloaded agent after editing");
          })();
        } else if (action === "Edit tools") {
          // Initialize tool selection from current agent
          const tools = new Set(selectedAgent?.tools ?? []);
          setEditToolsSelection(tools);
          setScreen("edit-tools");
          setCursor(0);
        } else if (action === "Edit model") {
          setScreen("edit-model");
          // Set cursor to current model
          const currentModel = selectedAgent?.model || "inherit";
          const idx = MODEL_OPTIONS.findIndex((o) => o.value === currentModel);
          setCursor(idx >= 0 ? idx : MODEL_OPTIONS.length - 1);
        } else {
          setScreen("agent-menu");
          setCursor(0);
        }
        return;
      }
      return;
    }

    if (screen === "edit-tools") {
      if (key.escape) {
        setScreen("edit-menu");
        setCursor(0);
        return;
      }

      // Items: [Save & back] + "All tools" + categories
      const toolItems = ["Save & go back", "All tools (empty = inherit all)", ...TOOL_CATEGORIES.map((c) => c.label)];

      if (key.upArrow || input === "k") {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => Math.min(toolItems.length - 1, c + 1));
        return;
      }
      if (key.return || input === " ") {
        if (cursor === 0) {
          // Save
          if (selectedAgent?.filePath) {
            void (async () => {
              try {
                await updateAgentTools(selectedAgent.filePath!, [...editToolsSelection]);
                await reloadAgents();
                const newAgents = await discoverAgents({ globalAgentsDir: agentsDir, projectDir: cwd });
                const updated = newAgents.find((a) => a.name === selectedAgent.name);
                if (updated) setSelectedAgent(updated);
                showStatus("Tools updated");
              } catch (err) {
                showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
              }
            })();
          }
          setScreen("edit-menu");
          setCursor(0);
          return;
        }
        if (cursor === 1) {
          // Toggle all tools
          if (editToolsSelection.size === ALL_KNOWN_TOOLS.length) {
            setEditToolsSelection(new Set());
          } else {
            setEditToolsSelection(new Set(ALL_KNOWN_TOOLS));
          }
          return;
        }
        // Toggle category
        const category = TOOL_CATEGORIES[cursor - 2];
        if (category) {
          const allSelected = category.tools.every((t) => editToolsSelection.has(t));
          setEditToolsSelection((prev) => {
            const next = new Set(prev);
            for (const t of category.tools) {
              if (allSelected) {
                next.delete(t);
              } else {
                next.add(t);
              }
            }
            return next;
          });
        }
        return;
      }
      return;
    }

    if (screen === "edit-model") {
      if (key.escape) {
        setScreen("edit-menu");
        setCursor(0);
        return;
      }
      if (key.upArrow || input === "k") {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => Math.min(MODEL_OPTIONS.length - 1, c + 1));
        return;
      }
      if (key.return) {
        const option = MODEL_OPTIONS[cursor];
        if (option && selectedAgent?.filePath) {
          void (async () => {
            try {
              await updateAgentModel(selectedAgent.filePath!, option.value);
              await reloadAgents();
              const newAgents = await discoverAgents({ globalAgentsDir: agentsDir, projectDir: cwd });
              const updated = newAgents.find((a) => a.name === selectedAgent.name);
              if (updated) setSelectedAgent(updated);
              showStatus(`Model set to ${option.label}`);
            } catch (err) {
              showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
          })();
          setScreen("edit-menu");
          setCursor(0);
        }
        return;
      }
      return;
    }
  });

  // ── Render ─────────────────────────────────────────────

  const home = process.env.HOME ?? "";
  const displayAgentsDir = home && agentsDir.startsWith(home) ? "~" + agentsDir.slice(home.length) : agentsDir;

  // ── List screen ──
  if (screen === "list") {
    // Compute section boundaries for visual separators
    const firstBuiltinIdx = listItems.findIndex((item) => item.kind === "builtin");

    return (
      <Box flexDirection="column">
        {/* Banner */}
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Box>
            <AgentGradientText text={AGENT_LOGO[0]} />
            <Text>{GAP}</Text>
            <Text color={theme.accent} bold>
              Agents
            </Text>
          </Box>
          <Box>
            <AgentGradientText text={AGENT_LOGO[1]} />
            <Text>{GAP}</Text>
            <Text color={theme.textDim}>
              {userAgents.length} user · {builtinAgents.length} built-in
            </Text>
          </Box>
          <Box>
            <AgentGradientText text={AGENT_LOGO[2]} />
          </Box>
        </Box>

        {/* Name input */}
        {isNaming && (
          <Box marginBottom={1}>
            <Text color={theme.accent}>  Agent name: </Text>
            <Text>{nameInput}</Text>
            <Text color={theme.textDim}>█</Text>
          </Box>
        )}

        {/* List */}
        {!isNaming && listItems.map((item, idx) => {
          const selected = idx === cursor;
          const prefix = selected ? "❯ " : "  ";

          // Section headers
          const sectionHeaders: React.ReactNode[] = [];
          if (idx === 1 && userAgents.length > 0) {
            sectionHeaders.push(
              <Text key="user-header" color={theme.textDim} bold>
                {"  User agents (" + displayAgentsDir + ")"}
              </Text>,
            );
          }
          if (idx === firstBuiltinIdx && firstBuiltinIdx > 0) {
            sectionHeaders.push(
              <Text key="builtin-header" color={theme.textDim} bold>
                {"\n  Built-in agents (always available)"}
              </Text>,
            );
          }

          if (item.kind === "create") {
            return (
              <React.Fragment key="create">
                <Text color={selected ? theme.accent : theme.textDim} bold={selected}>
                  {prefix}+ Create new agent
                </Text>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={`${item.kind}-${item.agent?.name}`}>
              {sectionHeaders}
              <Text color={selected ? theme.primary : theme.text} bold={selected}>
                {prefix}{item.label}
              </Text>
            </React.Fragment>
          );
        })}

        {status && <Text color={theme.success}>{" " + status}</Text>}

        <Box marginTop={1}>
          <Text color={theme.textDim}>
            <Text color={theme.primary}>↑↓</Text>
            {" navigate · "}
            <Text color={theme.primary}>Enter</Text>
            {" select · "}
            <Text color={theme.primary}>Esc</Text>
            {" close"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Agent menu screen ──
  if (screen === "agent-menu") {
    return (
      <Box flexDirection="column">
        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.accent} bold>
            {"  "}{selectedAgent?.name ?? "Agent"}
          </Text>
          <Text color={theme.textDim}>
            {" · "}{selectedAgent?.source === "builtin" ? "built-in" : selectedAgent?.source}
          </Text>
        </Box>

        {agentMenuItems.map((item, idx) => {
          const selected = idx === cursor;
          const prefix = selected ? "❯ " : "  ";
          return (
            <Text key={item} color={selected ? theme.primary : theme.text} bold={selected}>
              {prefix}{item}
            </Text>
          );
        })}

        {status && <Text color={theme.success}>{" " + status}</Text>}

        <Box marginTop={1}>
          <Text color={theme.textDim}>
            <Text color={theme.primary}>↑↓</Text>
            {" navigate · "}
            <Text color={theme.primary}>Enter</Text>
            {" select · "}
            <Text color={theme.primary}>Esc</Text>
            {" back"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── View screen ──
  if (screen === "view") {
    const agent = selectedAgent;
    if (!agent) {
      return (
        <Box flexDirection="column">
          <Text color={theme.error}>No agent selected</Text>
        </Box>
      );
    }

    const toolsDisplay = agent.tools.length > 0 ? agent.tools.join(", ") : "All tools (inherit)";
    const modelDisplay = agent.model || "Inherit from parent";
    const promptLines = agent.systemPrompt.split("\n");
    const maxPromptLines = 20;
    const truncatedPrompt = promptLines.length > maxPromptLines
      ? [...promptLines.slice(0, maxPromptLines), `... (${promptLines.length - maxPromptLines} more lines)`].join("\n")
      : agent.systemPrompt;

    return (
      <Box flexDirection="column">
        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.accent} bold>
            {"  "}{agent.name}
          </Text>
        </Box>

        {agent.filePath && (
          <Text color={theme.textDim}>{"  File: "}{agent.filePath}</Text>
        )}

        <Box marginTop={1}>
          <Text>
            <Text bold color={theme.text}>{"  Description: "}</Text>
            <Text color={theme.text}>{agent.description || "(none)"}</Text>
          </Text>
        </Box>

        <Box>
          <Text>
            <Text bold color={theme.text}>{"  Tools: "}</Text>
            <Text color={theme.text}>{toolsDisplay}</Text>
          </Text>
        </Box>

        <Box>
          <Text>
            <Text bold color={theme.text}>{"  Model: "}</Text>
            <Text color={theme.text}>{modelDisplay}</Text>
          </Text>
        </Box>

        {agent.maxTurns && (
          <Box>
            <Text>
              <Text bold color={theme.text}>{"  Max turns: "}</Text>
              <Text color={theme.text}>{String(agent.maxTurns)}</Text>
            </Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text}>{"  System prompt:"}</Text>
          <Text color={theme.textDim}>{"  " + truncatedPrompt.split("\n").join("\n  ")}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color={theme.textDim}>
            {"  Press "}
            <Text color={theme.primary}>Enter</Text>
            {" or "}
            <Text color={theme.primary}>Esc</Text>
            {" to go back"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Confirm delete screen ──
  if (screen === "confirm-delete") {
    return (
      <Box flexDirection="column">
        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.error} bold>
            {"  Delete agent: "}{selectedAgent?.name}?
          </Text>
        </Box>
        <Text color={theme.text}>
          {"  This will delete the file: "}{selectedAgent?.filePath}
        </Text>
        <Box marginTop={1}>
          <Text color={theme.textDim}>
            {"  Press "}
            <Text color={theme.success}>y</Text>
            {" to confirm or "}
            <Text color={theme.primary}>n</Text>
            {"/"}
            <Text color={theme.primary}>Esc</Text>
            {" to cancel"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Edit menu screen ──
  if (screen === "edit-menu") {
    const editMenuItems = ["Open in editor", "Edit tools", "Edit model", "Back"];

    if (selectedAgent?.source === "builtin") {
      return (
        <Box flexDirection="column">
          <Box marginTop={1} marginBottom={1}>
            <Text color={theme.accent} bold>
              {"  Edit agent: "}{selectedAgent.name}
            </Text>
          </Box>
          <Text color={theme.warning}>{"  Cannot edit built-in agents."}</Text>
          <Text color={theme.textDim}>
            {"  Create a user agent with the same name to override it."}
          </Text>
          <Box marginTop={1}>
            <Text color={theme.textDim}>
              {"  Press "}
              <Text color={theme.primary}>Esc</Text>
              {" to go back"}
            </Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.accent} bold>
            {"  Edit agent: "}{selectedAgent?.name}
          </Text>
          <Text color={theme.textDim}>
            {" · Source: "}{selectedAgent?.source}
          </Text>
        </Box>

        {editMenuItems.map((item, idx) => {
          const selected = idx === cursor;
          const prefix = selected ? "❯ " : "  ";
          return (
            <Text key={item} color={selected ? theme.primary : theme.text} bold={selected}>
              {prefix}{item}
            </Text>
          );
        })}

        {status && <Text color={theme.success}>{" " + status}</Text>}

        <Box marginTop={1}>
          <Text color={theme.textDim}>
            <Text color={theme.primary}>↑↓</Text>
            {" navigate · "}
            <Text color={theme.primary}>Enter</Text>
            {" select · "}
            <Text color={theme.primary}>Esc</Text>
            {" back"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Edit tools screen ──
  if (screen === "edit-tools") {
    const allSelected = ALL_KNOWN_TOOLS.every((t) => editToolsSelection.has(t));
    const noneSelected = editToolsSelection.size === 0;

    const toolItems = [
      { label: "Save & go back", isAction: true },
      { label: `All tools (empty = inherit all)`, isAction: false, checked: allSelected },
      ...TOOL_CATEGORIES.map((cat) => ({
        label: `${cat.label} (${cat.tools.join(", ")})`,
        isAction: false,
        checked: cat.tools.every((t) => editToolsSelection.has(t)),
        partial: cat.tools.some((t) => editToolsSelection.has(t)) && !cat.tools.every((t) => editToolsSelection.has(t)),
      })),
    ];

    return (
      <Box flexDirection="column">
        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.accent} bold>
            {"  Edit tools: "}{selectedAgent?.name}
          </Text>
        </Box>

        {toolItems.map((item, idx) => {
          const selected = idx === cursor;
          const prefix = selected ? "❯ " : "  ";

          if (item.isAction) {
            return (
              <Text key={item.label} color={selected ? theme.accent : theme.textDim} bold={selected}>
                {prefix}[ {item.label} ]
              </Text>
            );
          }

          const check = item.checked ? "⊠" : (item as { partial?: boolean }).partial ? "⊟" : "☐";
          return (
            <Text key={item.label} color={selected ? theme.primary : theme.text} bold={selected}>
              {prefix}{check} {item.label}
            </Text>
          );
        })}

        {status && <Text color={theme.success}>{" " + status}</Text>}

        <Box marginTop={1}>
          <Text color={theme.textDim}>
            {noneSelected
              ? "  No tools selected (agent inherits all parent tools)"
              : `  ${editToolsSelection.size} tool(s) selected`}
          </Text>
        </Box>

        <Box>
          <Text color={theme.textDim}>
            <Text color={theme.primary}>↑↓</Text>
            {" navigate · "}
            <Text color={theme.primary}>Space</Text>
            {"/"}
            <Text color={theme.primary}>Enter</Text>
            {" toggle · "}
            <Text color={theme.primary}>Esc</Text>
            {" cancel"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Edit model screen ──
  if (screen === "edit-model") {
    const currentModel = selectedAgent?.model || "inherit";

    return (
      <Box flexDirection="column">
        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.accent} bold>
            {"  Edit model: "}{selectedAgent?.name}
          </Text>
        </Box>

        <Text color={theme.textDim}>
          {"  Model determines the agent's reasoning capabilities and speed."}
        </Text>

        <Box marginTop={1} flexDirection="column">
          {MODEL_OPTIONS.map((option, idx) => {
            const selected = idx === cursor;
            const prefix = selected ? "❯ " : "  ";
            const isCurrent = currentModel === option.value;

            return (
              <Box key={option.value} flexDirection="column">
                <Text color={selected ? theme.primary : theme.text} bold={selected}>
                  {prefix}{option.label}
                  {isCurrent && <Text color={theme.success}> ✓</Text>}
                </Text>
                <Text color={theme.textDim}>
                  {"    "}{option.desc}
                </Text>
              </Box>
            );
          })}
        </Box>

        {status && <Text color={theme.success}>{" " + status}</Text>}

        <Box marginTop={1}>
          <Text color={theme.textDim}>
            <Text color={theme.primary}>↑↓</Text>
            {" navigate · "}
            <Text color={theme.primary}>Enter</Text>
            {" select · "}
            <Text color={theme.primary}>Esc</Text>
            {" back"}
          </Text>
        </Box>
      </Box>
    );
  }

  return null;
}
