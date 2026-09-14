---
name: model-routing
description: >-
  Picks the model and effort level for every subagent the orchestrator spawns in this workspace.
  Use before any Agent tool call, fork, or workflow agent() call, whenever choosing
  between Claude Opus 5, Claude Sonnet 5, and Claude Haiku 4.5, whenever setting an effort level,
  and whenever the user mentions model, effort, opus, sonnet, haiku, subagent cost, or speed.
scope: dev
user-invocable: true
---

# Model Routing

## Scope guard

This skill is for the orchestrating main session only.

If you are a subagent, stop here. You are a subagent when you were spawned by
the Agent tool, when you are a fork, or when a workflow `agent()` call started
you. In that case:

- Do not apply this skill.
- Do not re-delegate routing to another agent.
- Do not spawn agents to satisfy this skill.
- Do the task you were assigned and report back.

Why: routing is a budget decision. One session owns the budget, sees the whole
plan, and knows which tasks already ran and failed. A subagent sees one slice.
When subagents route too, the same work gets delegated twice, the model choice
drifts from the plan, and cost multiplies with no gain in quality.

Claude Code has no native "main session only" flag for a skill. A subagent can
still discover and invoke any project skill through the Skill tool. So this
guard is enforced two ways: by this section, and by the shipped agent
definitions in `.claude/agents/` never listing `model-routing` in their
`skills:` field. Keep it that way.

A definition whose explicit `tools` list omits `Skill` cannot invoke a skill at
all, so for that agent the guard is native; one that keeps `Skill` keeps it
because it needs the workspace's project skills, so there the guard is
instruction only. Which of the two an agent is shows in the `tools` line of its
file in `.claude/agents/`; read it there rather than from a roster here, which
goes stale the next time a definition changes. Do not close the gap with
`disallowedTools: Skill`; it would cost those agents the skills they work with.

The Agent tool is guarded by the definitions rather than by wording: an agent
whose `tools` list omits `Agent` cannot spawn anything, and each definition that
carries it argues its own grant and names its targets.
`references/claude-code-mechanics.md` has why the type list inside `Agent(...)`
is documentation rather than enforcement, and `.claude/CLAUDE.md` owns which
agents hold a grant at all.

## Why route

- Judge cost per completed task, not per request. A cheaper agent that needs two
  retries and a correction is more expensive than the right model once.
- Escalate rather than retry at the same tier. A failed run on the wrong tier
  costs a full run, and a second agent on that tier usually costs a second full
  run for the same answer. Whether a finished run may be picked up again is a
  separate question, answered in *Size the task before you route it*.
- Everything this skill routes is work the orchestrator delegates rather than
  does itself. `.claude/CLAUDE.md` ("How I work") owns that rule and its one
  exception, so read it there rather than from a copy here.
- Every spawn carries an explicit `model`. Never rely on inheritance: the
  session model is a property of the session, not a routing decision, so a spawn
  that inherits it gets whatever the orchestrator happens to be running rather
  than the tier the task argued for, and the table below stops deciding
  anything. Landing on the right tier that way is still an unrouted spawn. The
  one exception is a user-requested fork, which inherits by design.

## Model tiers

| | Claude Opus 5 | Claude Sonnet 5 | Claude Haiku 4.5 |
|---|---|---|---|
| Alias | `opus` | `sonnet` | `haiku` |
| API id | `claude-opus-5` | `claude-sonnet-5` | `claude-haiku-4-5` |
| Context / max output | 1M / 128K | 1M / 128K | 200K / 64K |
| Price in/out per MTok | $5 / $25 | $2 / $10 | $1 / $5 |
| Thinking | adaptive, on by default | adaptive, on by default | manual extended thinking only, no adaptive |
| Effort levels | low, medium, high, xhigh | low, medium, high, xhigh | not supported |
| Default effort | high | high | n/a |
| For | "For complex agentic coding and enterprise work." | "The best combination of speed and intelligence." | "The fastest model with near-frontier intelligence." |

Anthropic's own advice starts higher than this workspace does: "If you're unsure
which model to use, start with Claude Opus 5 for most workloads"
(https://platform.claude.com/docs/en/about-claude/models/overview, read
2026-09-03). The sonnet default in step 2 is a budget decision for a session
that spawns an agent per unit of work, not a claim that sonnet is the better
model.

Claude Fable 5.1 (`fable`) is a fourth model alias Claude Code accepts, outside
the three tiers above. No row targets it, so a subagent goes there only when the
user names it in the request for one specific task.

## Effort levels

Effort affects all output tokens: text, tool calls and their arguments, and
thinking. It is a behavioral signal, not a strict token budget. Lower effort
means fewer and more consolidated tool calls, no preamble, terser confirmations.

| Level | Use for |
|---|---|
| `xhigh` | Long-running agentic and coding tasks (over 30 minutes) with token budgets in the millions. |
| `high` | Complex reasoning, difficult coding problems, agentic tasks. This is the default. |
| `medium` | Agentic tasks that require a balance of speed, cost, and performance. |
| `low` | Simpler tasks that need the best speed and lowest cost, such as subagents. |

`low` is deliberately unused here because haiku covers that band; sonnet at low
is only for high-volume non-coding chat, which this workspace does not delegate.
`medium` is currently unused too: no shipped agent pins it, so it is not a tier
this workspace can reach. Both stay in the table because they are real API
values, not because a row uses them. `xhigh` is the top of every ladder here.

Every opus role that has a second rung has exactly two: the base name runs at
`high`, its `-xhigh` sibling is the rung above, and nothing sits above that, so
escalation inside a role is one step long. Which rung a unit starts on is
decided in *Step 3: pick the rung*, on a different basis from the model.

Haiku 4.5 takes no effort setting. The API rejects `effort` for it, and in
Claude Code the available levels depend on the model. Omit `effort` on every
haiku agent.

Effort is pinned in each agent definition, because the Agent tool has no effort
parameter. Escalation therefore means a different agent type, never the same
type at a higher effort.

## Classify the task

### Step 1: name the task type

- recon, search, grep, mapping a codebase
- web research and documentation verification
- spec-driven coding, where the change is already described
- coding where the approach must be invented
- debugging to root cause
- architecture, planning, design
- adversarial review and verification
- grading against a rubric
- mechanical bulk listing, counting, extraction
- writing docs or summaries from given material

### Step 2: read the difficulty signals

This step decides one thing, the model. Sonnet is the default and being enough
is its normal case. Opus is the exception, and the exception has to be argued
for. **Two** of these must hold before the tier goes up, and the argument goes
in the prompt's tier line so it can be checked afterwards:

- the spec is ambiguous or the acceptance check is not obvious
- more than a handful of files are in scope
- the change is cross-cutting (shared package, schema, auth, build)
- the solution has to be invented, not transcribed
- a wrong answer is expensive: data loss, security, user-visible breakage

Three of those get overclaimed, so they carry a test:

- **Invented, not transcribed** means no source names the approach. A plan, a
  research report, a skill, or a working precedent elsewhere in the repo makes
  the work transcription, however unfamiliar the subject is. Handing an agent
  an algorithm that someone else already worked out and calling it invention is
  the most common way this table gets bypassed.
- **A wrong answer is expensive** means expensive *and* hard to detect. A
  script, a gate, or a feature whose failure a test, a type check, or the next
  run catches is cheap to be wrong about, whatever it guards.
- **Cross-cutting** means the edit itself lands in more than one place: a
  shared package, a schema, an auth path, a build file. A change confined to
  one file is not cross-cutting however many routes render that file, and a
  change confined to one directory is not cross-cutting because the directory
  is imported widely. Blast radius of the file is not scope of the edit.

Three signals stand alone, needing no second signal beside them; each bullet
says what it buys:

- the area is security relevant, meaning the change itself decides whether
  someone gets in or gets access: authentication and session handling,
  authorization and org or tenant scoping, secrets and credential handling,
  input that reaches a query, a shell, or rendered markup, cryptography, and
  the permission surface of a route, an action, or an agent. Sitting in a
  subsystem that has one of those somewhere in it is not the same thing, and
  neither is touching user data that no permission decision hangs on. What the
  signal buys depends on the unit: a review of such a change starts at
  `reviewer-opus-xhigh` through step 3's exception, and any other unit keeps its
  own row, transcription included, while the diff it produces goes to
  `reviewer-opus-xhigh` before the change is reported done. Opus copying a
  sibling action's scope check does not make it correct; a reader whose job is
  to refute it is what catches a wrong one.
- a prior attempt on a lower tier already failed, and its actual output is in
  hand to pass on
- the deliverable is an instruction file. A `SKILL.md`, a rule file under
  `.claude/rules/`, a `CLAUDE.md`, an `AGENTS.md`, an agent definition, or a
  shared-memory entry goes to `instructions-opus`, never to `coder-sonnet`,
  however precisely the change is specified. This is not a difficulty
  judgement, which is why it stands outside the two-signal test. Their wording
  silently steers every session that loads them afterwards, and nothing checks
  it: no test fails on a badly worded rule, no type check complains, and the
  cost surfaces later as drift in other sessions' behaviour. Reach and the
  absence of a check are the whole argument, not how hard the edit is. A
  `/memory-review` run's fan-out phases take this signal too and go to
  `instructions-opus`, however much the mapping phase reads like recon and the
  verification phase like adversarial review: both work on the quoted claims
  that the run's replacement entry bodies are written from. The
  `memory-review` skill owns that reasoning and records that the user made the
  call, after stopping two `researcher-sonnet` spawns on the mapping phase
  mid-run.

When the two-signal count itself is genuinely uncertain, take opus: a run on the
wrong model has to be paid for again in full on the right one. Uncertain means a
signal you cannot settle either way, not a single signal you would rather count
as two, which the do-not list rules out; name the doubtful signal in the tier
line, so a later reader can tell this apart from two that held.

Keep the tier down when the spec names the files and the edits, a test, a type
check or a diff verifies the result, and the change is reversible. These do not
all have to hold. They describe the ordinary case, which is sonnet.

### Step 3: pick the rung

Only opus has two rungs, so a unit routed to sonnet or haiku skips this step:
those definitions are pinned at one effort each and have no sibling. Among the
opus roles `instructions-opus` has none either, so a unit it cannot hold is
split rather than promoted.

The rung is argued from the size of the unit rather than from its difficulty,
with one named exception at the end of this step. The step 2 signals are spent:
they bought opus, and every opus unit meets them by definition, so a rung
decided on difficulty is always `xhigh` and the `high` rung never runs. What
`xhigh` buys is a longer run of the same model with the same tools, which is
why the documentation frames the level by volume rather than by hardness:
"Long-running agentic and coding tasks (over 30 minutes) with token budgets in
the millions"
(https://platform.claude.com/docs/en/build-with-claude/effort, read
2026-09-03). That is the level's own use case, not a threshold this workspace
measured, so thirty minutes is not a gate to check a unit against.

The base agent is where an opus unit starts, and a `high` run that turns out to
be too small an allowance fails where someone can see it, which is the signal to
escalate. **One** of these moves the unit to the `-xhigh` sibling, and the one
that holds goes in the prompt's tier line so the choice can be checked
afterwards:

- **The unit is long by its own shape.** Ask what a run of it looks like rather
  than how hard it is: how many files it has to read before it can write
  anything, and whether it has to run something and react to the output more
  than once or twice. "Read two files, make the edit, run the check" is the
  `high` rung however subtle the edit is.
- **The unit is irreducibly large.** Sizing already tried to split it and could
  not, because the parts share one edit, and what is left still spans many files
  or many steps.
- **The `high` rung already ran on this unit and failed**, and that run's actual
  output is in hand to pass on. One failed run is the whole signal; a second run
  at `high` is the retry at the same tier that *Why route* rules out.

One signal is enough here, where the model needs two, because each of these
three is an observation about the unit rather than a judgement about it, and
because the cost of the wrong rung is a dearer run of the right agent while the
cost of the wrong model is the run itself.

Sizing comes first. A unit too big for one agent is split, not promoted:
*Size the task before you route it* owns that call, and the rung question is
asked only about a unit that already survived it.

**The one exception: a security-relevant review starts at
`reviewer-opus-xhigh`.** A review unit that meets the step 2 security signal,
on the definition given with that signal, goes to `reviewer-opus-xhigh` on the
first spawn whatever its size, a ten-line diff included, and the tier line names
this exception where it would otherwise name a rung signal. A missed security
defect produces no failed run: the review comes back approved, the branch
merges, and the cost arrives whenever someone outside finds it. There is nothing
to escalate from, so this rung is bought up front. It is bought with difficulty,
the one thing the rest of this step rules out, and the user set it knowing that,
so a later session tidying it back into the rule would be reversing a decision
rather than fixing an inconsistency.

Nothing else about the row changes. `reviewer-opus-xhigh` is read-only and the
top of its ladder, so a finding comes back as a finding: the orchestrator routes
the fix on its own row, and the re-review is a fresh `reviewer-opus-xhigh`
rather than the finished run reopened. A review that leaves the question open
ends the ladder, and *Escalation and de-escalation* says what follows: report to
the user what was tried, which on a review is the unresolved concern rather than
an approval.

### Step 4: pick the row

Use the routing table below. Step 2 settled the model and step 3 the rung; this
step only names the agent that carries that pair, and raises neither.

Split a mixed task into one unit per task type and route each unit on its own
row. If it cannot be split, route the whole task to the highest tier any part
of it requires. Unsplittable means the parts share an edit: the same lines, the
same new abstraction, or an ordering that a second agent cannot pick up.
Sitting in one directory, one subsystem, or one review's finding list is not
unsplittable, and bundling those into one spawn to save a round trip is how a
list of transcription fixes gets routed at the tier of its single hardest item.
Three `coder-sonnet` units in sequence beat one `engineer-opus` bundle whenever
only one item in the bundle earns the higher tier.

Read the row's "Escalate to" cell before you accept the row. Some triggers are
failure conditions you cannot know yet, but others are properties of the task
that are visible up front, and those decide the starting tier rather than a
later promotion. A docs task whose material has to be reconciled against a
contradicting source starts at the escalation target; it does not start on
`researcher-sonnet` and get promoted after it ships a wrong claim. Same for a
security-relevant diff, whose review starts on `reviewer-opus-xhigh` through
step 3's one exception rather than being promoted there after a cheaper pass
missed something.

## Routing table

| Task type | Model | Effort | Agent | Escalate to |
|---|---|---|---|---|
| Web search, documentation verification, source mapping, grep and recon | sonnet | high | `researcher-sonnet` | `reviewer-opus` when sources disagree; verifying a contested claim is its job. |
| Spec-driven coding, exact scripted transforms, format conversion | sonnet | high | `coder-sonnet` | `engineer-opus` when the spec proves incomplete. |
| Coding where the approach must be invented | opus | high | `engineer-opus` | `engineer-opus-xhigh` when step 3 gives the unit the higher rung, or once after one failed `engineer-opus` run with its output in hand. |
| Debugging to root cause | opus | high | `debugger-opus` | `debugger-opus-xhigh` when the hunt is long, a reproduction loop that runs the suite many times being the ordinary case, or after one failed `debugger-opus` run. |
| Architecture, planning, design | opus | high | `architect-opus` | `architect-opus-xhigh` when the surface to read is large, or for a second pass after a plan did not hold; a plan that holds and carries security or migration weight goes to `reviewer-opus` instead, review rather than redesign, on whatever rung its size buys. |
| Adversarial verification, code review | opus | high | `reviewer-opus` | `reviewer-opus-xhigh` when the review surface is large or long-running, when a first pass left the question open, and, through step 3's one exception, for a security-relevant diff whatever its size. |
| Binary rubric grading, listing, counting, extraction | haiku | none | `scout-haiku` | `researcher-sonnet` as soon as an item needs a judgment call. |
| Docs and summaries from given material | sonnet | high | `researcher-sonnet` | `reviewer-opus` when the material contradicts itself and has to be reconciled. |
| Writing or editing an instruction file (`SKILL.md`, a rule file, `CLAUDE.md`, `AGENTS.md`, an agent definition), or drafting a shared-memory entry for `pnpm claude:memory write` to apply | opus | high | `instructions-opus` | Never down to `coder-sonnet`, however precise the spec; when the wording itself is contested, `reviewer-opus` reviews it instead of a second authoring pass. The end-of-work read-back that `.claude/rules/session-lifecycle.md` requires is a fresh `instructions-opus` on a task of its own, not that second pass. |
| Real-browser task execution or spec verification with screenshots | sonnet | high | `real-browser-sonnet` | `debugger-opus` when the run exposes a bug with an unknown cause; the browser report is its input. |

Each row's effort is the effort pinned in that agent's definition. There is no
row you can reach by changing the effort of an agent.

A workflow `agent()` call without `agentType` still has to name one of those
pinned pairs. The complete set, read from the definitions in `.claude/agents/`:

| Pair | Agent |
|---|---|
| `haiku`, no effort | `scout-haiku` |
| `sonnet` + `high` | `researcher-sonnet`, `coder-sonnet`, `real-browser-sonnet` |
| `opus` + `high` | `reviewer-opus`, `instructions-opus`, `architect-opus`, `debugger-opus`, `engineer-opus` |
| `opus` + `xhigh` | `reviewer-opus-xhigh`, `architect-opus-xhigh`, `debugger-opus-xhigh`, `engineer-opus-xhigh` |

`researcher-sonnet` and `scout-haiku` are read-only. They return the deliverable
as text in their final report; the orchestrator saves it, or hands it to
`coder-sonnet` when it has to land in a file.

Web validation is a workspace rule `.claude/CLAUDE.md` ("Verification and
evidence") owns. Say so in every research spawn's prompt, and when the
deliverable is a routing plan, put the citation requirement in the row itself.

## Escalation and de-escalation

Escalation names a different agent type. It is never the same type at a higher
effort, because effort is pinned per definition. A type is a definition in
`.claude/agents/`, an instance is one spawned run of it; escalation picks the
type, and *Size the task before you route it* covers the instance.

- `coder-sonnet` whose spec turns out incomplete goes to `engineer-opus`. Fix
  the spec, do not reach for an `-xhigh` sibling for a spec problem.
- `engineer-opus` goes to `engineer-opus-xhigh` once, after one failed run, with
  that run's output in hand. A second attempt at the base rung is the retry at
  the same tier that *Why route* rules out.
- `architect-opus` goes to `architect-opus-xhigh` when the surface to read is
  large, and for a second pass after a plan did not hold. A plan that holds and
  carries security or migration weight goes to `reviewer-opus` instead of a
  second design pass, on the rung its own size buys: step 3's exception is
  bought by a change that decides who gets in, a plan is not that change, and
  the code the plan produces is reviewed under the exception when it lands.
- `reviewer-opus` goes to `reviewer-opus-xhigh` when the surface is large or a
  first pass left the question open. A security-relevant diff starts there
  however small it is, so on that unit there is no base rung to escalate from.
- Hand the escalated agent the failed run's actual output, not a paraphrase of
  it.
- A retry is a new spawn, never the failed run picked up again. What changes is
  the tier, the prompt, or both.
- If an `-xhigh` agent fails, stop and report to the user with what was tried.
  Nothing sits above that rung, so another attempt is the same run at the same
  tier.
- Never downgrade a failing task. A cheaper model does not fix a hard problem.
- Batch obviously trivial items into one `scout-haiku` with a list, not one
  agent per item.
- Never send `scout-haiku` a task where a wrong answer is expensive to detect.
  Silent wrong output costs more than the tokens saved.

## When the user names the rung

The user's instruction decides the rung, in both directions. Asked for `xhigh`,
a spawn goes to its row's `-xhigh` sibling whatever step 3 concluded; told that
`xhigh` is not needed here, it goes to the base agent even when a rung signal
holds. Neither answer is argued back against the signals, because the signals
estimate what a unit will cost and the user is the one paying for it.

Only four roles have a sibling to move to: engineer, debugger, architect, and
reviewer. On every other row, the sonnet and haiku ones and `instructions-opus`,
an `xhigh` instruction has nowhere to move, so the spawn stays on its own agent
and the reply says so. Promoting the model instead, or inventing an `-xhigh`
name for a row that has none, produces a spawn no definition backs; the model
comes from step 2 whatever rung the user names. For an instruction file, step 3
already gives the answer: `instructions-opus` has no sibling, so a unit it
cannot hold is split into units it can.

One case a downward instruction does not reach is step 3's security exception.
"No xhigh needed" drops every other unit to its base agent; a security-relevant
review stays on `reviewer-opus-xhigh` until the user lowers that review by name.
A blanket instruction is about the session's cost and was given without that
review in front of the user, and nothing later surfaces what a lowered rung
missed there, so this one rung is never dropped by implication.

The instruction stands for the rest of the session unless the user says
otherwise, so later spawns of the same kind follow it without being asked again.
The tier line names the user rather than a signal, and the run's report says the
rung was the user's decision. That distinction is what a later reader needs: a
rung this table chose can be checked against the signals and corrected, a rung
the user chose cannot, and an unmarked override is what the next session quietly
"fixes" back.

## When the user asks to inherit the session model, or to route to fable

Refuse both, say why in the reply itself, then give the plan anyway.

State both reasons in plain words. Do not answer by citing this skill:

- Inheritance is refused because the session model is not a routing decision.
  Whatever the orchestrator happens to be running, a subagent that inherits it
  was never tiered, so every spawn names its model.
- Fable is refused as a routing target because the targets here are Opus 5,
  Sonnet 5, and Haiku 4.5, and no row names anything else. One task the user has
  explicitly put on fable still runs there; what is refused is fable standing in
  for the table.

Then produce the routing plan that was asked for, with an explicit model on
every row. Refusing the shortcut is not refusing the work. Neither refusal
reaches a user who names an effort rung for a spawn: that request is granted, on
the terms the section above sets out.

## How to spawn with the right model and effort

Three mechanisms. Pick by what the work is.

**Agent tool.** Set `subagent_type` to one of the shipped definitions in
`.claude/agents/`. Their effort is pinned in frontmatter, because the Agent tool
has no effort parameter. Still pass `model` explicitly so the routing decision is
visible in the call. The `model` you pass must match the model in the agent's
name: `scout-haiku` with `haiku`, `coder-sonnet` with `sonnet`, and every name
carrying `-opus` with `opus`, `engineer-opus-xhigh` included. A trailing
`-xhigh` is the rung rather than a model, and there is nothing to pass for it,
because effort comes from the definition. A mismatch wins over the definition
and produces an untiered agent: the definition's pinned effort running on the
wrong model.

```
Agent(
  subagent_type: "debugger-opus",
  model: "opus",
  description: "Find intermittent auth test failure",
  prompt: "Deliverable: root cause plus a regression test. ..."
)
```

**Workflow `agent()`.** Use it for pipelines where several routed steps run in
sequence or parallel. It accepts both `model` and `effort`, and it can run any
effort level. Workflows are only available when the user has opted into them, so
treat the `effort` option as an optional shortcut, never the required path. The
precedence between an `agentType` definition's pinned effort and the `effort`
option is not documented, so when a workflow needs a non-default effort, call
`agent()` without `agentType` and put the role instructions in the prompt.

The built-in `workflow-authoring` reference states the opposite of this skill on
both options. On `model`: "Default to omitting it ... the agent inherits the
main-loop model (the resolved session model), which is almost always correct."
On `effort`: "omit to inherit the session effort". That guidance does not hold
here and loses to the project rule, because inheriting the session model and
effort produces an untiered subagent whatever the session is running. The
conflict matters because `workflow-authoring` is the document read immediately
before a script is written, while this table is loaded earlier, so the
permissive wording is the one in front of you at the moment you type the `opts`
object. Both fields go on every `agent()` call in every workflow.

```js
await agent("Map every call site of resolveCredential and list the files.", {
  model: "sonnet",
  effort: "high",
  label: "recon",
  phase: "discover",
});
```

**Never `subagent_type: "fork"` for routed work.** A fork inherits the whole
conversation, model, and tools of the main session, and a `model` override is
ignored. Forks are only for context-heavy continuation the user asked for.

A per-invocation `model` on the Agent tool beats the definition's frontmatter
`model`, and the frontmatter beats letting the spawn fall through to the main
conversation's model, the inheritance *Why route* rules out. That is what this
skill can guarantee rather than everything that can decide a spawn's model:
configuration outside its reach has a say too, so every spawn names its own.

## Size the task before you route it

Routing picks the tier. Sizing decides whether the agent can hold the job at
all, and it is the earlier decision. One agent gets one deliverable with one
acceptance check. When the check has parts that pass and fail independently,
that is more than one agent.

Split before spawning when any of these holds:

- the acceptance check has independently verifiable parts
- the work spans file clusters that do not have to change together
- discovery and change are both in scope: send a reader first, then hand its
  conclusion to a writer, rather than one agent doing both
- you expect more than roughly fifty tool calls

The fifty is a rule of thumb chosen here, not a measured threshold, and nothing
fails on crossing it; it is an estimate to check a task's shape against. What
was measured is this, both runs successful and both too big: one "cover these 59
lines" task ran to 374k tokens over 186 tool calls, and one "wire up the
coverage gate" task to 288k over 121. A large-context agent drifts from the
constraints it was given at the top of its own prompt, cannot be parallelised,
and loses the whole run instead of one slice when it fails. The cost of a bad
split is a second spawn; the cost of no split is the run.

**An implementation and the tests that cover it are two spawns.** That is the
first split condition above: the tests pass or fail on their own, and the
implementation typechecks or does not. They also carry a reason none of the
other conditions does: a test written by the agent that wrote the code is
written against what the code does rather than what it should do, so it passes
the bug through. The rule binds a unit that adds or changes lines a test has to
cover, so a rename or a dependency bump has no test half to split off. It binds
one order only. A test written before the implementation exists is written
against the observed failure rather than against the code, so it cannot pass the
bug through: a debug unit whose reproduction test comes first and fails before
the fix, the order `.claude/agents/debugger-opus.md` prescribes, stays one
spawn.

Give the implementation spawn the written specification as another agent's
deliverable. The test spawn's source of truth is that same specification and the
unit's acceptance check; the finished implementation's `file:line` surface goes
in only to say what the tests have to reach, never as what they are checked
against, because an agent given the code as its source of truth writes down
what the code does and the split has bought nothing. Route the test half on its
own row, from step 1's task type through step 2's signals, rather than
inheriting the implementation's tier: a suite written from a specification is
spec-driven coding however the implementation was routed.

The commit does not move: one unit is still one commit carrying both agents'
files, and a commit boundary is not an agent boundary. One session gave a single
agent a transport unit's implementation and both its suites because the unit was
one commit, and the user stopped it: „tul nagy feladatot adtal egy agentnek,
testeket kulon agentnek kellett volna irnia".

Split along a boundary that can be verified on its own, not along whatever is
convenient to describe. Two agents whose results cannot be checked separately
are one agent with extra handoff.

Pass the conclusion forward, never the transcript. The next agent's prompt
carries the finding and the `file:line`, not the reasoning that produced it.

A read-only review, verification, or translation of an N-part deliverable is
N units of work, not one. The instinct that reading is cheaper than writing,
so one agent can read it all, is wrong: the reader still has to hold every
part in context to judge any part. A ten-document plan set gets ten
reviewers, or five, not one. Sizing does not become optional because nothing
is being written.

Every review round is sized on its own. A second or third pass over the same
material does not inherit the first pass's shape, because what changed is the
material, not the reviewer's earlier headcount. One session ran three review
rounds over the same eleven documents and gave each of them to a single
agent, three times, because the first one had been shaped that way. A single
fact-verification agent over those eleven documents produced 2.2 MB of output
across 135 tool calls and 439k tokens; the same material split across eight
agents later ran in parallel and each part stayed reviewable. The user
corrected the same one-agent-per-whole-plan-set mistake three separate times
in that session.

**A finished agent is never continued.** More work of the same kind gets a new
agent, and the type can be the same one. Reopening a finished run with
`SendMessage` resumes it carrying everything it accumulated, so the next task
starts at that run's context size instead of zero and the pair drifts toward the
size this section exists to prevent, while a fresh instance of the same type
costs nothing and starts clean. Correcting or unblocking an agent while it is
still working on its task is a different thing, which this rule does not touch.

Work already in flight is never spawned a second time. Before spawning, check
what is running. A user asking whether it would have been better to split a
task is a question about a past decision, not an instruction to start a
parallel copy of work that is still running. One session spawned a duplicate
verification this way and had to kill it.

## Prompt shape for routed agents

Every prompt to a routed agent states, in this order:

1. The deliverable, in one sentence.
2. The acceptance check: what makes it done and how it is verified.
3. The files, paths, or URLs in scope.
4. The tier it was given and why, in one line. This tells the agent how much
   depth is expected.
5. For an agent whose definition carries `Agent`, whether this task authorises a
   spawn and of what. On every other agent the line is wasted, because it cannot
   spawn whatever a prompt tells it.
6. For a split unit, which half this spawn is. The implementation half is told
   it does not write the tests: the changed-line coverage rule in
   `.claude/rules/code-standards.md` is loaded into that agent and binds the
   commit rather than its own run, so without this line it reads that rule as an
   instruction to write the tests *Size the task before you route it* gave to
   the other spawn. The test half is told the implementation is finished and is
   not its to change, so a failing assertion comes back as a finding instead of
   being edited away in the code the test was written to check.
7. That it does not run an `@agent-native/*` update and, if it concludes one is
   needed, says so and stops. `AGENTS.md` owns the rule and names the commands,
   and the root `CLAUDE.md` symlinks to it, so every agent spawned from
   `.claude/agents/` has already loaded it and this line is a deliberate second
   copy of a rule that `.claude/rules/session-lifecycle.md` ("Agent definitions
   and subagent prompts") would otherwise keep out of the prompt. The issue
   owner asked for the copy in those words, „mindig ird bele a promptba",
   because an upgrade rewrites dependencies and scaffolded skills across the
   whole workspace before anyone can review it; the shared-memory topic
   `agent-native-fork-updates` records the decision. Removing the line as a
   redundant restatement would be reversing that decision rather than tidying
   one.
8. For a spawn that runs while a sibling agent is writing into the same working
   tree, which files are this agent's, item 3's list written out file by file
   rather than as an area, and that this agent fixes only a red typecheck, test,
   or lint result that is inside that list and caused by its own change. It
   reports every other one, saying whether its own change could have caused it
   and never writing it off as the sibling's or as pre-existing, because a
   changed export, type, or fixture breaks tests in files nobody assigned it.
   Only the orchestrator knows where that line falls, because an agent cannot
   see what a sibling was spawned to write. Disjoint lists keep the agents off
   each other's files and settle nothing else, so the pre-flight in
   `.claude/rules/parallel-spawns.md` covers what a batch shares beyond them and
   runs before this prompt is written. Reads collide even where writes do not:
   `tsc` covers the whole project and `vitest` the whole suite, so a sibling's
   half-finished file comes back as a genuine failure in this agent's run, and
   what settles the branch is the orchestrator's own gate run once both agents
   have finished (`.claude/rules/code-standards.md`, "A subagent's green report
   is not a run"). An area is not a list: one prompt in a measured run said
   "`plan-mdx.ts` and its specs" without naming them, and one of those specs had
   already been assigned to another spawn by name, an overlap the orchestrator
   found mid-run and had to correct to both agents. A second unit in that run
   reported failures in `plan-block-adapter.spec.tsx` while a sibling was
   editing it, and the suite came back green once that work landed; it got that
   right because its prompt happened to name its own files file by file, which
   nothing in this list asked for at the time.

Keep it short. A routed agent that has to guess the deliverable burns its whole
budget on discovery.

## Worked examples

- "Where is `resolveCredential` called from?" -> `researcher-sonnet` at sonnet
  high; the file list comes back as text and the orchestrator keeps it.
- "Is the Drizzle migration API we use still current?" -> `researcher-sonnet`,
  with primary-source URLs required in the report.
- "Rename one submit label, file and line already known" -> `coder-sonnet` at
  sonnet high, because it is transcription.
- "Pull the auth bridge into the shared package, the split is undecided" ->
  `engineer-opus` at opus high. Having to invent the approach is a model signal,
  so it buys opus and not the rung; `engineer-opus-xhigh` gets it only if that
  run fails.
- "Split the document store behind a new seam: every reader and writer moves
  with it, and the suite passes only once they all have" ->
  `engineer-opus-xhigh` at opus xhigh. The parts share one edit, so sizing
  cannot split them, and what is left is a long read-edit-recheck loop.
- "One test in the pult suite fails about every fifth run" ->
  `debugger-opus-xhigh` at opus xhigh, because reproducing it means running the
  suite many times over. The rung came from the length of the hunt, not from the
  bug being hard.
- "Go through the new org-scope check in the A2A handler" ->
  `reviewer-opus-xhigh` at opus xhigh. One handler is not a long read; the rung
  is step 3's security exception rather than the size of the diff.
- "Add the org-scope check to this action, copying the sibling action's, file
  and line named" -> `coder-sonnet` at sonnet high, then `reviewer-opus-xhigh`
  on the diff; the security signal buys the review, not the writer's tier.
- "Review the refactor that moved the plans list into a shared hook" ->
  `reviewer-opus` at opus high. Review is an opus row by task type, and with no
  security surface and two files to read, neither a rung signal nor the
  exception applies.
- "Use xhigh for this one" -> the `-xhigh` sibling where the row has one,
  whatever step 3 concluded, tier line naming the user rather than a signal; a
  row with no sibling stays where it is and the reply says why.
- "Forty files, one yes-or-no question about each" -> `scout-haiku` with no
  effort set, one agent for the whole batch.
- "Check that the plans page renders and the runtime-mode toggle works in a
  real browser" -> `real-browser-sonnet` at sonnet high; the screenshots land
  in `.visual-screenshots/` and the report comes back as its final message.

## Do not

- Do not omit `model` and let a spawn inherit the session model, in a workflow
  `agent()` call least of all, whatever `workflow-authoring` says about
  defaulting to omission.
- Do not invent a model and effort combination. Every spawn names one of the
  pinned pairs above, and each of those is a definition in `.claude/agents/`.
- Do not decide the rung from the difficulty signals. They bought opus and are
  spent; the rung is argued from the size of the unit. The security-relevant
  review in step 3 is the one exception, and it is not a template for a second
  one.
- Do not treat an escalation trigger as a promotion that happens after a
  failure when the task already meets it.
- Do not pass a `model` that contradicts the model in the agent's name.
- Do not route a subagent to `fable` unless the user names it.
- Do not send research or recon to haiku. Those belong to sonnet.
- Do not send grep, listing, or counting to opus.
- Do not send instruction-file authoring or editing to `coder-sonnet`, whatever
  the file: a skill, a rule file, a `CLAUDE.md`, an `AGENTS.md`, an agent
  definition, a memory entry. A precise spec does not make it safe, because
  nothing tests the wording afterwards.
- Do not route to opus on one difficulty signal, and do not claim "the solution
  has to be invented" for work whose approach a plan or a research report has
  already established. Start it on `coder-sonnet` and let the ladder escalate
  it if the spec turns out to be incomplete.
- Do not hand one agent a job with several independently verifiable parts.
  Size the task before picking its tier.
- Do not set `effort` on a haiku agent.
- Do not send more work to a finished agent, failed or successful. Spawn a new
  one, the same type when the type was right.
- Do not let subagents apply this skill or make routing decisions.

## Related

- `references/routing-table.md` - the full table with difficulty signals, the
  per-row escalation ladder, and the model and effort facts with sources.
- `references/claude-code-mechanics.md` - agent frontmatter fields, model
  resolution, Agent tool versus workflow `agent()`, spawning from a subagent,
  fork behavior, session effort, and skill visibility.
- `.claude/agents/` - the shipped agent definitions this table names, and their
  `CLAUDE.md` naming and pinning rules.
