# Claude Code Deobfuscated Analysis

## 1. Plan Mode Architecture

### State Machine
- **Modes**: `"default"` | `"plan"` | `"bypassPermissions"` | `"delegate"`
- Stored in `toolPermissionContext.mode`
- Toggled via `/plan` slash command or `Ctrl+P`-style keybind
- State transitions: `default → plan → (reviewing → approved/rejected → default)`

### Plan Mode Entry
```
/plan command → sets toolPermissionContext.mode = "plan"
→ "Enabled plan mode" message
→ Agent gets plan_mode attachment with reminderType ("full" | "sparse")
→ Plan is written to a file at planFilePath (nG() helper)
```

### Plan Mode Exit
- `ExitPlanMode` tool called by agent → "Exit plan mode?" prompt
- User can approve → mode reverts to "default", plan_mode_exit attachment added
- `SI(!1)` and `CN(!1)` clear the plan mode flags
- Message: "You can now proceed with implementation. Your plan mode restrictions have been lifted."

### Plan File Management
- `nG(agentId)` → returns the plan file path
- `ID(agentId)` → reads plan content (returns null if no plan)
- Plans are written to `.claude/plans/` or similar directory
- Plan content is markdown
- `/plan open` opens the plan in the user's editor (via `aB(planFilePath)`)

### Plan Mode Attachments
Claude Code uses an **attachment system** (not a tool) to inject plan context:
- `plan_mode` attachment: Reminds agent it's in read-only mode
- `plan_mode_reentry` attachment: When re-entering plan mode
- `plan_mode_exit` attachment: When exiting plan mode
- Attachments are injected via `oW1()` generator before each API call

### Tool Restrictions in Plan Mode
Plan mode **disallows** these tools:
- Write (YK)
- Edit (pq)
- Execute/Bash (m5) 
- ExitPlanMode (fH6) — only available IN plan mode
- Some unknown tool (Uj)

## 2. Agent System

### Built-in Agents

#### Explore Agent
```js
{
  agentType: "Explore",
  model: "haiku",  // Always fast/cheap
  whenToUse: "Fast agent for exploring codebases...",
  disallowedTools: [Write, ExitPlanMode, Edit, Execute, ...],
  source: "built-in",
  getSystemPrompt: () => "You are a file search specialist...",
  criticalSystemReminder: "CRITICAL: This is a READ-ONLY task."
}
```

#### Plan Agent
```js
{
  agentType: "Plan", 
  model: "inherit",  // Uses parent session's model
  whenToUse: "Software architect for designing implementation plans...",
  disallowedTools: [Write, ExitPlanMode, Edit, Execute, ...],
  tools: exploreAgent.tools,  // Same read-only tools as Explore
  source: "built-in",
  getSystemPrompt: () => "You are a software architect and planning specialist...",
  criticalSystemReminder: "CRITICAL: This is a READ-ONLY task."
}
```

### Agent Spawning
- Via `AgentTool` (the `Agent` tool name)
- Creates unique `agentId`, resolves model, creates task in AppState
- Can run sync or async (background)
- Results collected via tool use results in messages

### Custom Agents
- Loaded from `.claude/agents/` directory
- Frontmatter format with agentType, model, tools, disallowedTools, etc.
- System prompt is the markdown body

## 3. Elicitation System (Claude Code's "ask_user_question")

### How It Works
- **NOT a tool** — it's a **queue-based dialog system**
- State: `appState.elicitation = { queue: [] }`
- MCP servers and the main loop can push elicitation requests to the queue
- UI renders `tOq` component when `j1.queue[0]` exists (j1 = elicitation state)
- Supports both "form" mode and "url" mode

### Elicitation UI Component
```jsx
// In the main REPL:
_Y === "elicitation" && <tOq 
  serverName={j1.queue[0].serverName}
  request={j1.queue[0].request}
  onResponse={(action, content) => {
    // Dequeue and respond
    v1(state => ({
      ...state,
      elicitation: { queue: state.elicitation.queue.slice(1) }
    }));
    request.respond({ action, content });
  }}
  signal={j1.queue[0].signal}
/>
```

### Interview Phase (Plan Mode Q&A)
- `h0()` → `interviewPhaseEnabled` check
- When plan mode is active, agent can ask interview questions
- Questions have options with labels/descriptions
- Answers are collected as `{...K.input, answers: s}` where s = answer map
- After Q&A, outcomes include:
  - `clearContext: true` → clears conversation and starts fresh
  - `clearContext: false` → continues with plan + answers
- Telemetry: `questionCount`, `answerCount`, `isInPlanMode`, `interviewPhaseEnabled`

### "Clear Context" Flow (Copy Plan to New Chat)
The key discovery: When `clearContext: true`:
1. Plan content is preserved
2. `CN(!0)` and `SI(!0)` set flags
3. `q()` clears current context
4. `A.onAllow($1, Ip1(s, D))` starts fresh with plan+answers
5. The plan is carried forward via attachments, NOT clipboard copy

So Claude Code doesn't literally "copy to clipboard" — it **clears the conversation** 
but preserves the plan file and injects it as an attachment in the fresh context.

## 4. Copy/Export Features

### /copy Command
```js
{
  name: "copy",
  description: "Copy Claude's last response to clipboard as markdown",
  call: async (done, context) => {
    const lastAssistant = rV(context.messages); // find last assistant message
    const text = ngY(content); // extract text from content array
    await dW(text); // copy to clipboard (pbcopy/xclip)
    done(`Copied to clipboard (${text.length} characters, ${lines} lines)`);
  }
}
```

### /export Command
- Exports full conversation to file or clipboard
- Options: "Copy to clipboard" or "Save to file"
- Uses `o9q()` to render messages to text
- File naming: `YYYY-MM-DD-slug.txt`

### Screenshot Copy (for /stats)
- SVG → PNG conversion using resvg WASM
- Copies to clipboard via platform-specific commands
- macOS: `osascript` with PNGf class
- Linux: `xclip` or `xsel`

## 5. Key Differences from Our Implementation

### What Claude Code Does That We Don't (Yet)
1. **Attachment system** — injects context before API calls (plan mode, file changes, etc.)
2. **Plan agent** as a built-in agent type with `model: "inherit"`
3. **Interview phase** — structured Q&A within plan mode approval flow
4. **clearContext flow** — clears conversation but preserves plan as attachment
5. **Plan file persistence** — writes plan to `.claude/plans/` directory
6. **ExitPlanMode tool** — agent can request to exit plan mode
7. **Elicitation queue** — UI queue for dialog prompts (not a tool response)
8. **Plan mode attachments** with reminder frequency (full vs sparse)

### What We Have That's Similar
1. ✅ `ask_user_question` tool (our equivalent of elicitation)
2. ✅ `QuestionOverlay` UI with tab navigation, multi-select
3. ✅ Plan mode toggle (Ctrl+P, /plan command)
4. ✅ Plan mode system prompt updates
5. ✅ Plan file path management
6. ✅ PlanOverlay for review/approval

### Recommended Additions
1. **Plan Agent** — Add as built-in agent type (read-only, inherits model)
2. **clearContext flow** — After Q&A completes, option to clear conversation and inject plan
3. **ExitPlanMode tool** — Let agent request to leave plan mode
4. **Plan mode attachments** — Inject plan context before each API call
5. **/copy command** — Copy last response to clipboard
6. **/export command** — Export conversation to file
