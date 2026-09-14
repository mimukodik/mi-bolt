# Routing table reference

1. [Routing table with difficulty signals](#routing-table-with-difficulty-signals)
2. [Escalation ladders per row](#escalation-ladders-per-row)
3. [Model facts](#model-facts)
4. [Effort facts](#effort-facts)
5. [Sources](#sources)

## Routing table with difficulty signals

| Task type | Model | Effort | Agent | Signals that change the row |
|---|---|---|---|---|
| Web search, documentation verification | sonnet | high | `researcher-sonnet` | Subtle question, conflicting sources, or version-specific behavior: hand the disagreement to `reviewer-opus`, whose job is claim verification. |
| Source mapping, grep, recon | sonnet | high | `researcher-sonnet` | Recon, grep, and source mapping stay on sonnet, and a cross-cutting flow across packages is split into several `researcher-sonnet` passes rather than moved to another tier. The one unit that reads like source mapping and does not route here is a `/memory-review` run's mapping phase, which step 2 in `SKILL.md` sends to `instructions-opus`. |
| Spec-driven coding, exact scripted transforms, format conversion | sonnet | high | `coder-sonnet` | Spec turns out incomplete, or the transform has exceptions and per-file variation: `engineer-opus`. |
| Coding where the approach must be invented | opus | high | `engineer-opus` | Multi-file refactor, unclear seam, or no working precedent in the repo: stay on `engineer-opus`, those are model signals and do not buy the rung. Long or irreducibly large by the rung test, or one failed `engineer-opus` run with its output in hand: `engineer-opus-xhigh`. |
| Debugging to root cause | opus | high | `debugger-opus` | Intermittent or timing dependent behavior belongs on this row; the hunt goes to `debugger-opus-xhigh` when finding it means running the same thing many times over, and after one failed `debugger-opus` run. A known fix in a known file is not debugging: reclassify it as spec-driven coding for `coder-sonnet`. |
| Architecture, planning, design | opus | high | `architect-opus` | Touches security, data migration, or a shared package used by every app: stay on `architect-opus` and send the plan to `reviewer-opus`, on whatever rung the size of the read buys, since the security exception is bought by a change that decides access and a plan is not that change. A design surface large enough that reading it is a long run, or a second pass after a plan did not hold: `architect-opus-xhigh`. |
| Adversarial verification, code review | opus | high | `reviewer-opus` | Correctness matters more than cost: this row is already the answer, and such a diff starts here rather than on a cheaper tier. Large or long-running review surface, or a first pass that left the question open: `reviewer-opus-xhigh`. Security relevant, as the step 2 signal in `SKILL.md` defines it: `reviewer-opus-xhigh` from the first spawn whatever the size of the diff, which is the one exception to the rung being argued from size. |
| Binary rubric grading | haiku | none | `scout-haiku` | The rubric needs a judgment call rather than a yes or no: `researcher-sonnet`. |
| Listing, counting, extraction | haiku | none | `scout-haiku` | The list feeds a decision the orchestrator cannot verify cheaply: `researcher-sonnet`. |
| Docs and summaries from given material | sonnet | high | `researcher-sonnet` | The material contradicts itself and has to be reconciled: `reviewer-opus`. |
| Writing or editing an instruction file (`SKILL.md`, a rule file, `CLAUDE.md`, `AGENTS.md`, an agent definition), or drafting a shared-memory entry for `pnpm claude:memory write` to apply | opus | high | `instructions-opus` | Never down to `coder-sonnet`, however precise the spec; nothing tests the wording afterwards. Contested wording goes to `reviewer-opus` for a read-only pass, not to a second authoring run. The end-of-work read-back that `.claude/rules/session-lifecycle.md` requires of every instruction file change is not that pass and never goes to `reviewer-opus`: it is a fresh `instructions-opus` on a task of its own, because judging whether a sentence survives the case it did not anticipate is authoring work. |
| Real-browser task execution, spec verification with screenshots | sonnet | high | `real-browser-sonnet` | A defect with unknown cause found by the run: `debugger-opus` with the report path as input. A visual-only question about a static page with no interaction still stays here; nothing is verified without a browser. |

Every effort value in this table is the effort pinned in that agent's
definition, so a row is reached by naming its agent and never by changing an
agent's effort.

`researcher-sonnet` and `scout-haiku` are read-only. Their deliverable comes
back as text in the final report; the orchestrator saves it or hands it to
`coder-sonnet` when it has to land in a file.

Research-tier work must verify factual claims with `WebSearch` and `WebFetch`
and cite URLs. This is a workspace rule from `.claude/CLAUDE.md`, not a model
capability question.

## Escalation ladders per row

| Row | Ladder | Stop condition |
|---|---|---|
| Research and recon | `researcher-sonnet`, then `reviewer-opus` on the contested claim | If `reviewer-opus` cannot settle it either, report the open question to the user. |
| Spec-driven coding | `coder-sonnet`, then `engineer-opus` | After one `engineer-opus` failure, report. Do not reach for `engineer-opus-xhigh` on a spec problem, fix the spec. |
| Invent-the-approach coding | `engineer-opus`, then `engineer-opus-xhigh` | After `engineer-opus-xhigh` fails, stop and report what was tried. |
| Debugging | `debugger-opus`, then `debugger-opus-xhigh` | After `debugger-opus-xhigh` fails, hand the failure space back to the user rather than guessing a fix. |
| Architecture | `architect-opus`, then `architect-opus-xhigh` on a plan that did not hold, and `reviewer-opus` on one that did | After the review, ask the user to narrow the scope rather than redesigning again. |
| Review | `reviewer-opus`, then `reviewer-opus-xhigh`; a security-relevant review starts at `reviewer-opus-xhigh`, with no base rung below it | After `reviewer-opus-xhigh`, report the unresolved concern rather than approving. A finding is reported and not fixed: the fix is routed on its own row, and the re-review is a fresh `reviewer-opus-xhigh`. |
| Bulk mechanical | `scout-haiku`, then `researcher-sonnet` | If `researcher-sonnet` also produces inconsistent output, the task is not mechanical. Reclassify it. |
| Instruction files | `instructions-opus`, then `reviewer-opus` on contested wording. The end-of-work read-back that `.claude/rules/session-lifecycle.md` requires of every instruction file change is not a rung on this ladder: it is a fresh `instructions-opus`, spawned whether or not anything was contested. | After the review, take the disagreement to the user rather than rewording a third time. |
| Real browser | `real-browser-sonnet`, then `debugger-opus` on a found defect | After `debugger-opus` fixes it, spawn a fresh `real-browser-sonnet` on the same spec; the type repeats, the finished run is not reopened. |

Rules that apply to every ladder:

- Escalation names a different agent type, and a retry at any tier is a new
  spawn rather than the failed run picked up again. `SKILL.md` carries the
  reason.
- Every opus role that has a second rung has exactly two, `high` then its
  `-xhigh` sibling, so a ladder inside one role is one step long and nothing
  sits above it.
- Which rung a row starts on is decided by the size of the unit rather than by
  the difficulty signals, with one exception: a security-relevant review starts
  at `reviewer-opus-xhigh` whatever its size. A rung the user named beats both,
  except that lowering that one review takes the user naming that review.
  `SKILL.md`, under *Step 3: pick the rung* and *When the user names the rung*,
  carries the test, the exception, the override and its limit.
- Never downgrade a failing task.
- Carry the previous attempt's actual output into the escalated prompt.
- Batch trivial items into one haiku agent instead of one agent per item.
- Never send haiku a task whose wrong answer is expensive to detect.

## Model facts

| | Claude Opus 5 | Claude Sonnet 5 | Claude Haiku 4.5 |
|---|---|---|---|
| API id | `claude-opus-5` | `claude-sonnet-5` | `claude-haiku-4-5` (dated `claude-haiku-4-5-20251001`) |
| Claude Code alias | `opus` | `sonnet` | `haiku` |
| Context | 1M | 1M | 200K |
| Max output | 128K | 128K | 64K |
| Price in/out per MTok | $5 / $25 | $2 / $10 | $1 / $5 |
| Thinking | adaptive, on by default | adaptive, on by default | manual extended thinking only via `budget_tokens`, no adaptive |
| Effort levels | low, medium, high, xhigh | low, medium, high, xhigh | not supported, the API rejects `effort` |
| Default effort | high | high | n/a |
| Positioning | "For complex agentic coding and enterprise work." | "The best combination of speed and intelligence." | "The fastest model with near-frontier intelligence." |
| Retirement | not before 2027-07-24 | not before 2027-06-30 | not before 2026-10-15 |

Selection matrix from the choosing-a-model page:

- Opus 5: complex agentic coding and enterprise work, multihour autonomous
  coding agents, large refactors.
- Sonnet 5: speed and capability for everyday coding, agent, and enterprise
  workloads, code generation, data analysis, agentic tool use.
- Haiku 4.5: the lowest latency and price, with extended thinking, real-time
  apps, high-volume processing, sub-agent tasks.

The documented multi-model strategy is "an orchestrator that delegates bulk work
to lower-cost workers", which is exactly the shape this workspace uses.

Claude Fable 5.1 (`claude-fable-5-1`, alias `fable`, $10 / $50 per MTok) is a
fourth model Claude Code accepts as a `model` value. It is not a routing target
for subagents unless the user explicitly names it for one task.

## Effort facts

| Level | Documented use case |
|---|---|
| `xhigh` | "Long-running agentic and coding tasks (over 30 minutes) with token budgets in the millions" |
| `high` | "Complex reasoning, difficult coding problems, agentic tasks" (default) |
| `medium` | "Agentic tasks that require a balance of speed, cost, and performance" |
| `low` | "Simpler tasks that need the best speed and lowest costs, such as subagents" |

- Effort affects all output tokens: text, tool calls and arguments, and
  thinking. It is a behavioral signal, not a strict token budget.
- Lower effort produces fewer and more consolidated tool calls, no preamble, and
  terser confirmations.
- Opus 5: start at high, use xhigh for demanding coding and agentic work.
  Effort controls thinking volume, not visible length.
- Sonnet 5: high is the default, xhigh for the hardest coding and agentic tasks,
  medium as a cost step-down (roughly Sonnet 4.6 at high), low for high-volume or
  latency-sensitive non-coding work.
- Lower effort on the newest models often matches the previous generation at
  high effort.
- Judge cost per completed task, not per request. An agent that needs retries is
  not cheap.
- A level the active model does not support falls back to the highest supported
  level at or below the one that was set.
- `low` is unused in this workspace: haiku covers that band, and sonnet at low
  is only for high-volume non-coding chat, which this workspace does not
  delegate.

## Sources

- Model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Choosing a model: https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Effort parameter: https://platform.claude.com/docs/en/build-with-claude/effort
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code model configuration: https://code.claude.com/docs/en/model-config
- Claude Code costs: https://code.claude.com/docs/en/costs
