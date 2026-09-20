# Planning deliverables

Governs plans, phase breakdowns, and other planning documents produced in
this workspace: what numbers they may contain, what they may gate on, and
how they scope themselves against the task. Loaded at launch as a project
rule (no `paths` scope, so it reaches every subagent except the built-in
Explore and Plan agents). Referenced from `.claude/CLAUDE.md`.

- **Every number in a planning document traces to the user, to the task, or
  to a rule file.** A threshold an agent chose is not a fact about the work;
  name where each number came from, in the document, beside the number.
- **An agent-chosen number is a proposal, never a gate.** It may be recorded
  as an expectation to measure against, and it may not fail a phase, block a
  commit, or appear in an exit criterion until the user has agreed to it.
- **Where a threshold would be invented, measure and record instead.** The
  check runs, the number goes in the report, and the gate is that the
  measurement happened and someone read it.
- **The intent behind a number usually survives the number.** "Do not turn a
  bounded change into a refactor of a large file" is a rule; "under 100
  changed lines" is a guess at how to enforce it. Keep the first, drop the
  second.
- **An MVP instruction is a budget, not a mood.** When the user says MVP, or
  says there is no time, that caps the number of phases, gates, experiments
  and verification passes the plan may contain, and the cap is stated in the
  plan so the next reader can see it was applied.
- **Verification apparatus is justified per item.** A check earns its place
  by covering something the ordinary rules would not catch. A check that
  restates a workspace rule becomes a pointer to that rule. A check whose
  failure would show up in the next test run does not need its own gate.
- **A plan cites its own scope source.** Every deliverable in a plan traces
  to a line in the task; anything in the task with no coverage is listed as
  deliberately deferred, with the reason, rather than silently absent.
- **The file layout follows the unit of execution.** One file per
  independently executable unit, so a phase, a stream or a task can be picked
  up, assigned, or turned into a ticket without a second pass to extract it
  from a larger document. Splitting by theme instead reads well and costs a
  reverse engineering step every time the plan is used: one plan set put seven
  phases inside a single 769 line document, and turning them into ten tickets
  later needed a separate extraction agent. Where the user names a
  layout, that layout is the requirement, not a preference to weigh against
  tidiness.
