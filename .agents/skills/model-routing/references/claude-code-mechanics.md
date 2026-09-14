# Claude Code mechanics for routing

How model and effort actually get applied to a spawned agent, and what cannot be
enforced natively.

## Agent definitions

Project definitions live in `.claude/agents/<name>.md`, user definitions in
the user-level Claude Code agents directory. Frontmatter fields Claude Code reads:

`name`, `description`, `model`, `tools`, `disallowedTools`, `color`, `effort`,
`permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `skills`, `initialPrompt`,
`memory`, `background`, `isolation`, `observer`, `observerMessage`,
`observeSubagents`, `experimental`. That is the whole schema as of 2026-09-03,
read from the installed `@anthropic-ai/claude-code` bundle rather than from the
docs page; a version bump can add a field, so check the installed bundle before
relying on the list being closed.

- `model` accepts `sonnet`, `opus`, `haiku`, `fable`, a full model id, or
  `inherit`.
- `effort` accepts a named level or an integer, and which named levels a model
  supports varies by model. The levels this workspace routes on are the ones in
  `SKILL.md`'s effort table. The setting overrides the session effort while that
  subagent runs.
- `observer` names an agent type Claude Code auto-spawns as a background
  observer whenever this agent runs; it receives read-only activity digests and
  reports through the `ObserverReport` tool without taking part in the task.
  That spawn is not routed by this skill and takes its model from the observer
  definition, so setting the field on a shipped agent puts an unrouted agent on
  every run of it. No definition in `.claude/agents/` sets it. `observerMessage`
  appends to each digest, and `observeSubagents: false` stops the agents this
  one spawns from inheriting its observer; it defaults to true.
- `mcpServers` is a YAML list; each item is either a string naming a server
  already configured in the session (shares the parent's connection) or an
  inline definition keyed by server name with the same schema as `.mcp.json`.
  Subagents already inherit the parent's MCP tools, so the field is for servers
  the parent does not have. `tools` and `disallowedTools` accept `mcp__<server>`
  or `mcp__<server>__*` to grant or remove every tool of one server.

## Model resolution order

For a subagent, the per-invocation `model` parameter on the Agent tool beats the
agent definition's frontmatter `model`, and the frontmatter beats letting the
spawn fall through to the main conversation's model. Route on that order. It is
not a closed list of everything that can set a spawn's model: configuration
outside the call and the definition can supply a default or override all three,
and this skill does not cover it, which is why every spawn names its own model
rather than relying on what it would otherwise resolve to.

Because the per-invocation parameter beats the frontmatter, the `model` passed
on the call must be the model the agent's name carries; a trailing `-xhigh` is
the effort rung rather than a model, and there is nothing on the call to pass
for it. `SKILL.md`, under *How
to spawn with the right model and effort*, owns that rule and names which model
each agent takes. A mismatch produces an untiered agent: the definition's
pinned effort running on the wrong model.

## Agent tool versus workflow agent()

| | Agent tool | Workflow `agent(prompt, opts)` |
|---|---|---|
| Model | per-call `model` parameter | `model` option |
| Effort | no parameter, comes only from the definition's `effort` frontmatter | `effort` option: a named level or an integer |
| Agent type | `subagent_type` | `agentType` |
| Other | `description`, `prompt`, `isolation` | `label`, `phase`, `schema`, `isolation` |
| If omitted | model falls through the resolution order above | inherits the session model and effort |

Consequence: to pin effort on an Agent tool spawn, spawn a custom agent type
whose definition carries the `effort` field. Passing effort in the prompt text
does nothing.

Workflows are only available when the user has opted into them, so the `effort`
option is an optional shortcut and never the required path. The precedence
between an `agentType` definition's pinned effort and the `effort` option is not
documented. When a workflow needs a non-default effort, call `agent()` without
`agentType` and put the role instructions in the prompt.

## Spawning from a subagent

A subagent spawns subagents of its own only when its `tools` list carries
`Agent`; omitting `Agent` from the list leaves it unable to spawn anything. The
nesting runs "up to three layers below the main conversation", a limit
configured outside this skill's reach rather than a fixed property of the tool.
The `Agent(type, type)` allowlist form is enforced only for an agent running as
the main thread with `claude --agent`: "In a subagent definition, listing
`Agent` in `tools` lets that subagent spawn subagents of its own while the depth
limit allows it, but any type list inside the parentheses is ignored"
(https://code.claude.com/docs/en/sub-agents, read 2026-09-03). In a definition
here the names in the parentheses are therefore documentation of intent, and
what actually caps the nesting is whether the named targets carry `Agent`
themselves.

## Fork behavior

`subagent_type: "fork"` inherits the whole conversation, the model, and the tools
of the main session. A `model` override is ignored for forks. Never use a fork
for routed work. Use it only for context-heavy continuation the user asked for.

## Session effort

Session-level effort is set with `/effort <level>` or the `--effort` flag.
Writing `ultrathink` in a prompt requests deeper reasoning for that turn only. A
level the active model does not support falls back to "the highest supported
level at or below the one you set", so `xhigh` runs as `high` on Opus 4.6
(https://code.claude.com/docs/en/model-config, read 2026-09-03).

## Why orchestrator-only cannot be enforced natively

- Subagents do not receive skill bodies automatically.
- By default a subagent can still discover and invoke any project or user skill
  through the Skill tool.
- There is no per-skill "main session only" flag.
- `disable-model-invocation: true` blocks auto-invocation everywhere, including
  the main session, so it is not a usable guard for a skill the orchestrator
  needs to fire automatically.
- The only fully native way to keep a skill away from a subagent is to omit
  `Skill` from that subagent's `tools` list.

A shipped agent whose explicit `tools` list omits `Skill` gets that native guard
for free, because it cannot invoke a skill at all. One that keeps `Skill` keeps
it because it needs the workspace's project skills, and for that agent the guard
is instruction only. The `tools` line in `.claude/agents/<name>.md` is where
which-is-which is recorded, and it is the only copy of that fact worth keeping.

So orchestrator-only scoping here is enforced by instruction: the scope guard at
the top of `SKILL.md`, plus the shipped agent definitions never listing
`model-routing` in their `skills:` field.

## Skill frontmatter fields Claude Code honors

`name`, `description`, `when_to_use`, `argument-hint`, `arguments`,
`disable-model-invocation`, `user-invocable`, `allowed-tools`,
`disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`,
`hooks`, `paths`, `shell`, `metadata`.

## Anthropic cost guidance

"Sonnet handles most coding tasks well and costs less than Opus. Reserve Opus
for complex architectural decisions or multi-step reasoning... For simple
subagent tasks, specify `model: haiku`."

## Sources

- Subagents: https://code.claude.com/docs/en/sub-agents
- Model configuration: https://code.claude.com/docs/en/model-config
- Skills: https://code.claude.com/docs/en/skills
- Workflows: https://code.claude.com/docs/en/workflows
- Costs: https://code.claude.com/docs/en/costs
- Effort parameter: https://platform.claude.com/docs/en/build-with-claude/effort
