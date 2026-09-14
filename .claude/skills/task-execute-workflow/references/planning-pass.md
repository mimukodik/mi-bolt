# The planning pass

Read this at the decision point in `SKILL.md`, once the task and its comments
have been read and before the statement of understanding is written. It answers
two things in order: whether this task needs a plan at all, and, when it does,
how the planning pass is run. A task that skips the plan needs nothing past the
first section.

## Whether this task needs a plan

**Skip the plan when you could describe the diff in one sentence.** The test is
Anthropic's: "If you could describe the diff in one sentence, skip the plan".
The same callout says what the skip is for, "For tasks where the scope is clear
and the fix is small (like fixing a typo, adding a log line, or renaming a
variable) ask Claude to do it directly", and when a plan earns its cost,
"Planning is most useful when you're uncertain about the approach, when the
change modifies multiple files, or when you're unfamiliar with the code being
modified" (https://code.claude.com/docs/en/best-practices, read 2026-09-03).
The sentence has to describe the change, not the goal. "Add Google OAuth" names
an outcome and says nothing about the diff, while "add a `provider` column and
branch the callback on it" is the diff. When only the first kind of sentence is
available, the diff is not known yet, and that is what a plan is for.

**Where that one sentence is borderline, the conditions just quoted land close
to `model-routing`'s own, under "Step 2: read the difficulty signals".** How
many files are in scope, whether the approach has to be invented or a plan, a
research report, a skill or a precedent already names it, and whether a wrong
answer is expensive and hard to detect are that section's signals; they live
there because they also decide a spawn's tier, and that section carries the test
that keeps each of them from being overclaimed. Read them there. What gets
written twice drifts, and the tests are the half that goes missing.

**When the answer is no, nothing else here applies.** Derive the entries as
`SKILL.md` ("The derived entries") describes and run the list. A plan is not
owed to a task for being important, only for being unclear.

**The gate exists because a planning pass is expensive.** Anthropic measured
that "multi-agent systems use about 15× more tokens than chats", and in the
same account that a multi-agent research system "outperformed single-agent
Claude Opus 4 by 90.2% on our internal research eval"
(https://www.anthropic.com/engineering/built-multi-agent-research-system, read
2026-09-03). Both halves are the finding. The waste is real too: the MAST study
of 1,642 annotated multi-agent traces found step repetition to be the single
largest failure mode at 15.7% (https://arxiv.org/html/2503.13657v3, read
2026-09-03), and Anthropic's own account gives an instance: "one subagent
explored the 2021 automotive chip crisis while 2 others duplicated work
investigating current 2025 supply chains". Planners that do not know about each
other read some of the same files twice. That is the price of the independence
the pass is buying, paid knowingly, rather than a defect to design out.

## The instrument

**A planning pass runs on `architect-opus`, never on Claude Code's built-in
`Plan` agent.** The built-in Explore and Plan agents "skip your CLAUDE.md files
and the parent session's git status to keep research fast and inexpensive"
(https://code.claude.com/docs/en/sub-agents, read 2026-09-03), so a plan drafted
through `Plan` would be drafted without `.claude/CLAUDE.md`, without
`.claude/rules/planning-deliverables.md`, and without `model-routing`: without,
that is, the rules the plan has to satisfy. `architect-opus` loads all of them,
and it is the agent `model-routing`'s architecture row names for planning and
design.

**The rung is decided per spawn, not once for the pass.** Each planner starts on
`architect-opus`, and `model-routing`, "Step 3: pick the rung", moves that one
planner to `architect-opus-xhigh` when its own unit meets a rung signal, a large
surface to read being the usual one. A pass does not become `xhigh` for having
several planners in it, because the rung is argued from the size of one unit.

## The shape of the pass

**Several planners draft the same plan independently, and one more merges what
comes back.** Anthropic's documentation lists "a hard plan worth drafting from
several independent angles before you commit to one" among the tasks that earn a
multi-agent run, and describes the merge step's job as to "draft a plan from
several angles and weigh them against each other"
(https://code.claude.com/docs/en/workflows, read 2026-09-03).

**The split is by angle, not by file.** An angle is a stance the whole task can
be planned from, never a part of the task to plan, so every planner gets the
undivided task and plans all of it from its own point of view. This is a
different split from the one in `SKILL.md` ("The derived entries"), which cuts
the work into units that each own a deliverable, a gate and a commit: that one
partitions, this one duplicates everything except the angle. Confusing them
leaves you with planners holding a slice each, which is the unit split done a
second time and gives them nothing to disagree about, and disagreement is what
this pass is for.

**Spawn as many planners as you can name and justify as genuinely distinct
angles, and no more.** Write each angle down as one sentence before spawning
anything; when the second sentence turns out to be the first one reworded, there
is one angle, one planner runs, and the pattern does not apply to this task.
That single plan has nothing to merge, so it goes straight to the review at the
end of this section. There is no headcount to reach for.
`.claude/rules/planning-deliverables.md` rules out a number an agent chose
gating anything, and the published numbers belong to other mechanisms: "Start
with 3-5 teammates for most workflows"
(https://code.claude.com/docs/en/agent-teams, read 2026-09-03) is about
experimental agent teams, which are separate sessions rather than subagents, and
the dynamic-workflow size guideline's "Fewer than 15 agents" is sent "to Claude
as advice, not a cap" (https://code.claude.com/docs/en/workflows, read
2026-09-03). Neither says how many angles a plan has, so do not go looking for a
number that transfers.

**Each planner is told the task and its own angle, and not the others'.** Give
it the task statement verbatim, its angle in one sentence, and the rest of the
prompt shape `model-routing` ("Prompt shape for routed agents") requires,
including the line saying whether this spawn may spawn anything of its own.
Independence is the whole product: planners that know each other's angles write
around them and converge, and a convergent pass has paid for several runs and
bought one plan.

**Each planner returns its normal `architect-opus` final report, and nothing
else crosses.** `model-routing` ("Size the task before you route it") already
rules that a conclusion moves between agents and a transcript never does. The
merge waits for all of them: the post introducing dynamic workflows in Claude
Code calls the synthesize step "a barrier" that "waits for all the fan-out
agents, then merges their structured outputs into one result"
(https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code,
read 2026-09-03). Nothing is merged while a planner is still running.

**A fresh planner synthesises.** Once every planner has returned, spawn one more
`architect-opus` and hand it the original task and all the reports as text. Ask
it for three things: the merged plan it recommends, every place the planners
disagreed, and how it resolved each disagreement. The list of disagreements is
what the review reads next, so a merge that reports none is either a pass that
had one angle or a merge that hid something. The synthesiser is a new spawn and
never one of the planners carrying on. Two different things keep it that way,
and only one of them is enforced. `architect-opus`'s `tools` line lists no
`SendMessage`, so a planner cannot reach a sibling at all. The names inside the
same line's `Agent(...)`, `researcher-sonnet` and `scout-haiku`, are instruction
rather than enforcement, because Claude Code ignores that list in a subagent
definition, which `model-routing` ("Scope guard") and
`.claude/agents/architect-opus.md` both record; a planner is therefore told not
to spawn a planner of its own rather than stopped from doing it, and the prompt
line above, saying whether the spawn may spawn anything of its own, is where it
is told. Reopening a planner instead of spawning the synthesiser is ruled out
by `model-routing` ("A finished agent is never continued") in any case.

**The merged plan is reviewed before anything is derived from it.** Review, not
a second design pass, is the escalation `model-routing`'s architecture row names
for a plan that holds. Send it to `reviewer-opus`, and to `reviewer-opus-xhigh`
only where the review row's own rung condition holds, a large or long-running
review surface. The plan's security or migration weight is what buys it a review
rather than a second design pass; it does not buy the rung, because step 3's
exception is bought by a change that decides who gets in and a plan is not that
change. Tell the reviewer what to hunt for, which is a disagreement the
synthesiser smoothed over instead of resolving, because that is the failure this
shape produces and in the merged plan it reads as agreement. The MAST study
attributes 23.5% of its annotated failures to verification and concludes that
"sole reliance on final-stage, low-level checks is inadequate"
(https://arxiv.org/html/2503.13657v3, read 2026-09-03), which is why the
reviewer is given something to look for rather than a plan to approve.

**Where the pass sits in the run.** It is one entry in the entry 3 slot of the
fixed task list, ahead of the derived entries, because those entries come out of
the merged plan rather than straight out of the task. Its acceptance check is
the reviewed merged plan. Where the plan is written to files rather than kept as
text, `.claude/rules/planning-deliverables.md` owns what those files contain,
how they are laid out, and what may gate on them.

**On this run the up-front burst carries this entry alone in the slot.**
`SKILL.md` ("The fixed task list") has the whole list created before any file is
touched, and the derived entries cannot be part of that burst here: they are
read out of a plan that does not exist until this entry closes. Create them the
moment the reviewed merged plan is in hand, one TaskCreate call each, the way
`SKILL.md` ("The derived entries") creates any entry the work turns up later.
Nothing else about the burst changes: every other entry in the fixed list,
before the slot and after it, is created with the burst as usual.

**Wire the dependency rather than leaving it to the order.** Each derived entry
is created with TaskUpdate `addBlockedBy` naming this entry, which is what
`SKILL.md` ("The fixed task list") asks for wherever one entry truly cannot
start before another finishes, and no pair in the list is more literal than this
one. That block is satisfied the moment it is written, since the plan has
already landed; what it records is why those entries arrived after the burst,
which a reader would otherwise take for entries someone forgot to create. Entry
4 gains its block on each derived entry at that same moment, because the review
round waits on every unit in the slot and at burst time there was none to name.
