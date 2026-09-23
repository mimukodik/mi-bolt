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
Which unit reaches which rung is decided in `model-routing` rather than here.
`instructions-opus` is the only opus role with no sibling, and a large
instruction job is not a reason to add one: a unit it cannot hold is split
rather than promoted. The routing skill owns that rule, and
`agent.md` says why the rung is wrong for this work.

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

The `model-routing` skill owns the routing table, the escalation ladder, and
the spawn mechanics, including which `model` a spawn must pass and why effort
is pinned in a file here rather than set on the call.
This directory owns only where the tier is written down: every definition pins
`model` in its frontmatter, plus `effort` on every non-haiku one. A new
definition pins a model and effort pair the skill's routing table already has a
row for, or it lands in the same change as that row. Update the skill whenever
an agent here is added, renamed, or retired.

## MCP servers

An agent that drives an MCP server grants its tools in `tools:`, because an
explicit `tools:` list is an allowlist. A grant names either the whole server,
`mcp__<server>`, or a single tool of it, `mcp__<server>__<tool>`; the per-tool
form is what splits a server whose tools do not all belong in the same grant.
`model-routing`'s `references/claude-code-mechanics.md` carries the measurement
behind that form. Subagents inherit the MCP tools of the main conversation, so
`mcpServers:` is only needed for a server the parent session does not have; a
string entry there references an already-configured server and shares the
parent's connection.

`.mcp.json` configures `chrome-devtools` and `angular-cli`, and those two are
the only servers any definition here grants; every other server a session
connects goes to no definition here.

`chrome-devtools` goes to `real-browser-sonnet` alone, whole-server, and that
agent must never use the `claude-in-chrome` or `computer-use` servers.
Withholding it everywhere else is what makes
`.claude/rules/browser-verification.md` enforceable rather than merely written
down: without an allowlist every code-editing tier would inherit the browser and
could verify its own UI change, which that rule forbids.

`linear-server` goes to no definition, and as of 2026-09-19 nothing in this
repository, at user level, or in managed settings defines the server either,
although the `task-execute-workflow` skill calls
`mcp__linear-server__get_issue`. Were it connected, withholding it would still
be right, because a unit that needs the tracker gets the issue text in its
prompt: that skill has the orchestrator read the issue and its comments once
into the session scratchpad and every later unit read that file, so the issue
cannot change under a running task.

Grant `angular-cli`'s `get_best_practices`, `search_documentation` and
`list_projects`, three of the nine tools it exposes on Angular CLI 22.1.8, to
every definition whose work turns on how Angular itself behaves, whether it
writes the code, reviews it, plans it, researches it or documents the rules for
it, and to no other. Today that is every definition here but two. `scout-haiku`
is out because a documentation lookup is a judgment call and the cheapest tier
takes none; with `search_documentation` out, `list_projects` goes with it,
since all it adds over the `angular.json` that tier can already open with
`Read` is the `frameworkVersion` it takes from `package.json`, and that is
useful only as `search_documentation`'s argument. `real-browser-sonnet` is out
because it exercises a rendered surface rather than writing Angular. A
definition added later is measured against that criterion rather than against
the count.

The other six go to nobody. `devserver_start` and `devserver_stop` would hand a
subagent the app, which `.claude/rules/browser-verification.md` keeps with the
orchestrator and `.claude/rules/parallel-spawns.md` ("What a batch shares")
lists as a contended resource, and `devserver_wait_for_build` is only useful
beside them; `run_target` executes a build, test, lint or e2e target, which is
not read-only. Withholding it keeps the grant read-only and restricts nothing
else: the grantees hold `Bash` and can run those targets through it, under the
rules that already govern a command. `ai_tutor` and
`onpush_zoneless_migration` are read-only and were simply not asked for, so
adding either is the user's call rather than a definition's.

A grant does nothing unless the session connects the server.
`.claude/settings.json` lists `chrome-devtools`, `angular-cli`,
`linear-server` and `spring-tools` in `enabledMcpjsonServers`, so that enablement is tracked and travels with a
clone. Where a grant here looks dead, check that the server is still named in
that tracked file rather than only in an untracked
`.claude/settings.local.json`, which enables it on one machine and nowhere
else, and that `.mcp.json` still defines it, before rewriting a definition.

The two paragraphs below record what the `angular-cli` grant is for, written
for whoever edits a definition here. Neither is an instruction to a grantee,
and neither can be: this file is a subdirectory `CLAUDE.md`, and a
subdirectory's `CLAUDE.md` is "included when Claude reads files in those
subdirectories" instead of loading at launch
(https://code.claude.com/docs/en/memory, read 2026-09-19), so an agent spawned
from a definition here does not have this file while it writes Angular. What
reaches that agent instead is the server's own usage instructions, which the
server injects into every session that connects it, and copying either
paragraph into the definitions to close that gap is the drift
`.claude/rules/session-lifecycle.md` ("The copy is what drifts, not the
original") exists to stop.

`search_documentation` is the one of the three that adds a capability nothing
else here has, and it is why `list_projects` is granted beside it. It searches
angular.dev at the major version its own `version` argument names and never
reads `angular.json`; with the argument left off it falls back to the CLI's
latest known index, 22 on 22.1.8 (`version ?? LATEST_KNOWN_DOCS_VERSION`,
clamped to a floor of 17, in
`node_modules/@angular/cli/src/commands/mcp/tools/doc-search.js`, read
2026-09-19). That fallback is silent, so an answer about the wrong Angular
reads exactly like a right one: measured 2026-09-19, one `linkedSignal` query
returned `"searchedVersion":22` with the argument omitted and
`"searchedVersion":20` with `version: 20` passed. `list_projects` supplies the
argument but not in the form the call takes: its `frameworkVersion` is an
optional string, `"22"` here, taken from the nearest `package.json`'s
`@angular/core` range, while `version` is a number, so what crosses is the
major as an integer rather than that string or a `22.1.8`, and where the walk
up finds no range there is no `frameworkVersion` and nothing to pass.

`get_best_practices` returns, in this workspace on 2026-09-19, a byte-for-byte
copy of the whole root `CLAUDE.md`, 2971 bytes, which every agent already loads
at launch, so today it adds nothing a grantee does not have. That is a reason
to measure before calling the grant redundant, not a reason to withdraw it or
to have a grantee skip the call: the server's injected instructions say the
grantee MUST call it before writing or modifying code.

## Report files

The harness filters a subagent's Write by the file name rather than by what the
file holds: a path named `report.md` or `findings.md` is refused with "Subagents
should return findings as text, not write report files" (measured 2026-09-04),
while the same content under a name that does not read as one is written without
complaint. So the rule here is the workspace's to keep rather than the harness's
to enforce: an agent whose deliverable is a report returns it as its final
message, and the orchestrator saves it. `.claude/retrospectives/` is the standing
exception, and it needs that name-keying: there the file is the deliverable, and
the `retrospective` skill has `instructions-opus` write `<YYYY-MM-DD>-<id8>.md`
itself, a name the filter passes. Screenshots and other binary evidence written
by MCP tools are not affected.

## Report shape

**Every definition here names the report its agent returns, and every one of
them answers the same three sections, whatever else its template adds.**
What was done: what the agent changed, found or decided, with absolute paths.
What was verified: each claim with the command, path or URL that settles it.
What is uncertain: what the agent could not settle, and any decision that is
the user's to make.

**"What was verified" is the section that does the work.** A claim with no
command, path or URL behind it is what this shape exists to make visible, and
it is visible only because a heading promised one. Only the agent's final
message crosses back: "intermediate tool calls and results stay inside the
subagent; only its final message returns to the parent"
(https://code.claude.com/docs/en/agent-sdk/subagents, read 2026-09-18), so a
measurement left out of the report is one the orchestrator can reach again only
by spawning the work a second time.

**"What is uncertain" is not a politeness, and an empty one is a claim.** An
agent with nothing uncertain says so under the heading rather than dropping the
heading, because an absent section reads exactly like a section nobody thought
about, and the orchestrator cannot tell which of the two it was handed.

**A tier may require more; no tier may require less.** `real-browser-sonnet` is
the superset rather than the exception: its template opens with a header
carrying the verdict and the viewport read-backs, and adds sections for console
errors, failed network requests, scripts run and what went uncovered, because
that evidence has no textual substitute. It answers all three regardless, under
`## What was verified`, under `## Uncertain`, and with the done half spread
across `## Summary`, `## Steps` and `## Findings`. A floor is not a length:
each section is answered as briefly as its answer allows, since a report that
hands back everything the agent read re-floods the context the spawn existed to
protect, and what the parent is owed is "a concise summary, not every file the
subagent read" (same page).

**This section states the requirement once and no definition restates it.** A
definition names the three sections and gives the tier's own line under
each, in whatever form its template uses, and carries none of the rest:
not that they are mandatory, not what each is for, not the paragraph
above about an empty section. Thirteen copies of a
requirement are thirteen things that drift apart, which is the reason "The copy
is what drifts, not the original" in `.claude/rules/session-lifecycle.md`
gives. Nothing enforces the shape either. The harness imposes no shape on a
subagent's final message, the `AgentDefinition` field table carrying `tools`,
`model`, `effort` and `skills` and nothing for an output format or schema (same
page), and the parent "may summarize it in its own response" whatever arrives.
So the reader who checks these sections is the orchestrator. Whether naming
them also makes a report survive that summary intact is unmeasured; what it
buys is that a missing one shows at a glance.
