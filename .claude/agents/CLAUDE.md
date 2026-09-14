# Agent definitions

This directory holds the project subagent definitions the orchestrator spawns
with the Agent tool: one file per agent, frontmatter plus its system prompt.

## What belongs in a definition

Read "Agent definitions and subagent prompts" in
`.claude/rules/session-lifecycle.md` before adding a line to a file here. It
owns what a definition may carry, and why a rule that already loads at launch
is not repeated in one.

## Naming

`<role>-<model>[-xhigh]`: `coder-sonnet`, `engineer-opus`,
`engineer-opus-xhigh`. The name carries the model and the effort rung, so it
alone says what a spawn costs. Where a role has two rungs, the unsuffixed file
pins `effort: high` and the `-xhigh` file beside it is that same role one rung
up: it keeps the base's order of work and report shape, and differs in the
opening paragraph that names the rung and in the rules that apply only there.
Its description names every way in, always including these two: a unit large or
long enough to need the rung, and a base run that already failed on the same
work.

The rung is a property of the unit, not of how hard the thinking is: difficulty
is what chose opus in the first place, and the rung carries size and duration.
Which unit reaches which rung is decided in
`packages/shared/.agents/skills/model-routing/SKILL.md` rather than here.
`instructions-opus` is the only opus role with no sibling, and a large
instruction job is not a reason to add one: a unit it cannot hold is split
rather than promoted. The routing skill owns that rule, and
`instructions-opus.md` says why the rung is wrong for this work.

## Tools

Every definition carries an explicit `tools` list, because a definition that
omits the field inherits every tool available to subagents, the Agent tool
included, and a new agent would silently be able to spawn agents of its own.
Which agents here hold an Agent grant at all is named in `.claude/CLAUDE.md`'s
opening paragraph; the argument for each grant is in that agent's own file.

Grant `TodoWrite` to a definition that runs a multi-step edit and verify loop,
and to no other. The five that carry it, `coder-sonnet` plus the `engineer` and
`debugger` pairs, are exactly those tiers: a read-only tier has nothing to track
between steps, `real-browser-sonnet` already carries a fixed step loop and
report format, and `instructions-opus` works over one to three files in a single
pass. That list is the agent's own working list and is unrelated to the
mandatory Todo list in `.claude/CLAUDE.md`, which is the orchestrator's and is
written for `TaskCreate`.

Grant `Monitor` to a definition that carries `Bash`, and to no other. The wait
rule in `.claude/rules/session-lifecycle.md` ("A wait is the command's own
exit") ends its ladder at `Monitor` where a condition genuinely is the only
observable, so an agent without it has no bounded rung left and falls back to
the unbounded poll that rule exists to stop. `Bash` is the qualifier because an
agent that cannot run a command has nothing to wait on, and `run_in_background`
needs no grant of its own, being a parameter of `Bash`. `SendMessage` and
`TaskStop` are absent from every definition here and stay absent: messaging a
peer session and stopping a running agent are the orchestrator's, per
`.claude/CLAUDE.md` ("Cleanup") and "Parallel sessions" in
`.claude/rules/session-lifecycle.md`.

`Grep` and `Glob` are named on every `tools` line here and no agent holds
either, because on this build they are not tools at all: Claude Code 2.1.117
replaced them on native macOS and Linux builds with embedded `bfs` and `ugrep`
reached through `Bash`
(https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md,
read 2026-09-09). That entry exempts npm-installed builds and the exemption
does not reach this workspace: since 2.1.113 the npm package spawns a
per-platform native binary, the installed 2.1.266 is a Mach-O arm64 executable,
and the orchestrator holds neither tool either. Every agent here searches
through `Bash`. The names stay on the lines because 2.1.162 made an explicit
`--tools` list provide the dedicated tools again on native builds, which may
one day extend to frontmatter; until it does they grant nothing. Both
documentation pages still list the two as ordinary built-ins with no platform
note (https://code.claude.com/docs/en/tools-reference and
https://code.claude.com/docs/en/sub-agents, read 2026-09-09), so a definition
written from the docs names tools its agent cannot reach.

Granting a tool is not holding it, which "Agent definitions and subagent
prompts" in `.claude/rules/session-lifecycle.md` owns, and a fresh grant is
where that bites. Measured on 2026-09-09, a `scout-haiku` spawned seconds after
the `Monitor` grants were written reported its held set as `Read` and `Bash`
alone, while one spawned minutes later reported `Read`, `Bash` and `Monitor`.
Claude Code watches this directory and documents that it "detects the change
within a few seconds and the next delegation uses the updated definition, with
no restart needed", listing three cases that still need a restart, none of
which applied here (https://code.claude.com/docs/en/sub-agents, read
2026-09-09); reading that lag as the cause of the two results fits them and is
unverified, no second source on watcher latency having been found. So the spawn
made right after a definition changes is the one to distrust, and anything
written on the assumption that an agent can reach a newly granted tool asks
that agent first.

## Skills

No agent lists `model-routing` in its `skills:` field, and none should. Routing
is the orchestrator's decision. An agent whose `tools` list omits `Skill` cannot
load skills at all; the rest list it because they need the workspace's project
skills.

## Where the routing rules live

`packages/shared/.agents/skills/model-routing/SKILL.md` owns the routing table,
the escalation ladder, and the spawn mechanics, including which `model` a spawn
must pass and why effort is pinned in a file here rather than set on the call.
This directory owns only where the tier is written down: every definition pins
`model` in its frontmatter, plus `effort` on every non-haiku one. A new
definition pins a model and effort pair the skill's routing table already has a
row for, or it lands in the same change as that row. Update the skill whenever
an agent here is added, renamed, or retired.

## MCP servers

An agent that drives an MCP server grants its tools with the server-level
pattern `mcp__<server>` in `tools:`, because an explicit `tools:` list is an
allowlist. Subagents inherit the MCP tools of the main conversation, so
`mcpServers:` is only needed for a server the parent session does not have;
a string entry there references an already-configured server and shares the
parent's connection. `real-browser-sonnet` is the reference: it is the only
agent allowed to drive a browser, and it must never use the
`claude-in-chrome` or `computer-use` servers.

No other definition grants a server, and the omission is deliberate for both of
the servers `.mcp.json` configures. Withholding `chrome-devtools` is what makes
`.claude/rules/browser-verification.md` enforceable rather than merely written
down: without an allowlist every code-editing tier would inherit the browser and
could verify its own UI change, which that rule forbids. Withholding
`linear-server` costs a real capability and is still right, because a unit that
needs the tracker gets the issue text in its prompt:
`packages/shared/.agents/skills/task-execute-workflow/SKILL.md` has the
orchestrator read the issue and its comments once into the session scratchpad
and every later unit read that file, so the issue cannot change under a running
task.

## Report files

The harness filters a subagent's Write by the file name rather than by what the
file holds: a path named `report.md` or `findings.md` is refused with "Subagents
should return findings as text, not write report files" (measured 2026-09-04),
while the same content under a name that does not read as one is written without
complaint. So the rule here is the workspace's to keep rather than the harness's
to enforce: an agent whose deliverable is a report returns it as its final
message, and the orchestrator saves it. `.claude/retrospectives/` is the standing
exception, and it needs that name-keying: there the file is the deliverable, and
`packages/shared/.agents/skills/retrospective/SKILL.md` has `instructions-opus`
write `<YYYY-MM-DD>-<id8>.md` itself, a name the filter passes. Screenshots and
other binary evidence written by MCP tools are not affected.
