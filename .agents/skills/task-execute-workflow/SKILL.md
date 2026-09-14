---
name: task-execute-workflow
description: >-
  Runs one task end to end: spawns, gates, commits, tracker comments, push,
  pull request. Load at the start of a task, given as a Linear issue id, a
  branch carrying one, or free text. Not for a question or one git or tracker
  step.
argument-hint: "<LINEAR-ISSUE-ID> | <free-text description of the task>"
user-invocable: true
scope: dev
---

# Task execution workflow

This skill owns three things: the order a task runs in, the task list it starts
from, and the two ways a task arrives. Everything the workflow leans on beyond
that is owned by a rule file or another skill and is pointed at here rather
than repeated, so each rule has one place to change.

## Scope guard

This is for the orchestrating main session. If you are a subagent, stop here:
you were spawned to deliver one unit of this workflow, so do that unit and
report back. Do not run the workflow, create the task list, route anything, or
write to the tracker.

## Two ways in

A task arrives either as a tracker issue or as free text. The two runs are
identical except for the tracker steps, and the difference is stated rather
than left to judgment.

### A Linear issue id

An issue key such as `PX-609`, a Linear URL, or a branch name carrying one.

**Load `linear-conventions` before the first thing this run writes to the
tracker**, which is the first of entry 1's contradiction comment, entry 7's
decisions comment, entry 8's related-issue comment and entry 10's how-to-test
comment that this run actually has. The single read below writes nothing, and
that skill's own description says a read does not need it, so loading it at the
read would spend the context at the very start of the session on a step that
cannot use it.

**Read the issue and every comment on it exactly once.**
`mcp__linear-server__get_issue` with `includeRelations` set to `true`, so the
relations the closing check needs are already in hand, plus
`mcp__linear-server__list_comments` for the comments.

**Write everything that came back into one file in the session scratchpad
directory**, named after the issue key. Use the scratchpad directory the
harness names for this session. Not the repository, because the file is not a
deliverable and must never be committed, and not `/tmp`, which nothing cleans
up. The rest of the run reads that file and never calls the tracker again for
the same content: a second read costs a round trip, and worse, the issue can
change under a running task so that two units get built against two different
versions of it.

**Attachments and other issues the issue points at are pulled in during that
same read**, appended to the same file under their own headings. When one
cannot be fetched, write a line in the file saying which one and why, and put
it in the opening questions. Nothing is fetched later.

**Documents that live in this repository are read from the repository**, at the
moment a unit needs them, and are not copied into the file. The file exists to
remove a second network read, not to duplicate the plan set. Where the issue
and one of those documents disagree, that contradiction is the first thing the
run reports, not an end-of-run finding.

**Delete the file when the work is done.** It is one of the temporary files
`.claude/CLAUDE.md` ("Cleanup") makes this session responsible for. When the
run stops early, delete it before the closing message all the same and say in
that message that the task did not finish: the scratchpad directory belongs to
this session, so whoever picks the task up next cannot read the file anyway and
does the single read again.

### A free-text description of the task

There is no ticket, so the tracker steps do not run at all: no run file, no
contradiction comment, no decisions comment, no closing comments, no
related-issue check. Say so in the closing report, so nobody goes looking for a
comment that was never going to exist. Everything else is unchanged.

The task as the user wrote it is the scope source and does the run file's job.
Quote it verbatim in the statement of understanding, and treat that quote as
what gets re-read whenever the run has to check itself against the task.

## The fixed steps, before the list exists

1. **Do the single read** described above; the `linear-conventions` load waits
   for the first tracker write. Issue way only.
2. **Decide whether the task needs a planning pass**, before the statement of
   understanding is written, so that statement, the opening questions and the
   list itself carry the answer instead of being revised around it later.
   `references/planning-pass.md` owns the gate, the agent a pass runs on, and
   the shape it takes; read it here, and stop at its first section when the
   gate says no.
3. **Write a plain statement of what was understood, and ask permission to
   start.** It says what the task is taken to mean and what will be produced,
   and it is not a narration of the plan. `.claude/CLAUDE.md` ("Think before
   coding", "Non-negotiables") owns how it is written.
4. **Read the current branch before anything lands on it, and settle the
   name.** A run inherits whatever branch the last one left checked out, and
   every commit it makes lands there without anyone having decided that.
   `.claude/rules/session-lifecycle.md` ("Commits") owns which branches are
   not this run's to commit on, where the name comes from, and how work that
   has already landed on the wrong branch is moved; this step only pulls that
   reading forward, while there is still nothing to repair. On the issue way
   the name came out of the single read; on the free-text way there is nothing
   to take a name from, so that question goes into the batch below. **The
   switch waits for the batch either way**, because step 5 settles what this
   branch is cut from as well as what it merges into, and a branch cut before
   that answer is cut from whatever the last run left checked out. That answer
   is also the start point the switch names, in the form
   `.claude/rules/session-lifecycle.md` ("Commits") gives. Nothing is written
   between here and the answers, so waiting costs the run nothing, while a
   branch already cut is one to be moved rather than chosen.
5. **Ask the opening questions as one batch** through AskUserQuestion, so the
   run is not interrupted question by question. `.claude/CLAUDE.md` ("Asking
   the user") owns what may be asked and how an outward-facing action has to
   appear in the question. **One of those questions is the branch the pull
   request in entry 9 merges back into**, on the issue way as much as on the
   free-text way: nothing in the tracker names a merge target, so no run can
   read one off a ticket. Settle it before the work starts rather than at the
   pull request, because the branch a pull request merges into is normally the
   branch it was cut from, so that answer is also this run's start point unless
   the user names a different one in the same batch, which is why step 4 holds
   the switch until this batch comes back. On the free-text way it joins the
   branch-name question step 4 already sends into this batch. **Both answers
   are written into the list as it is created**, the merge target into entry
   9's `description` and the start point into entry 12's, whether or not the
   two are the same answer, since entry 12 is where `linear-conventions` reads
   the start point: it builds the commit list from what the branch was cut from
   rather than from the pull request's base. Both are settled here, before the
   list exists, and are read at the very end of the run, so the entry that uses
   one is the only place it survives a compaction. On the free-text way entry
   12 is not in the list and nothing after the branch is cut reads the start
   point, so there the merge target is the one to write down. **Another of
   those questions is whether the user wants to check the finished work by
   hand**, on both ways in: a yes puts entry 11 in the list and a no leaves it
   out. A no is an answer rather than a postponement, because the user who
   asked for this gate called it "ez egy gate, de nincs ra mindig szukseg"
   ("this is a gate, but it isn't always needed"), so no run adds the entry on
   its own reading of how risky the change looks. Marking an option here would
   be that reading, so this question reserves its decision in the sense
   `.claude/CLAUDE.md` ("Asking the user") means. What is being asked for is
   the user's own hands-on check, and it is a different thing from the
   real-browser pass `.claude/rules/browser-verification.md` requires of
   everything a person can see: that one is mandatory, it runs inside the units
   and is confirmed at entry 6, and a no here leaves it exactly where it was.
   **A path the task itself names is not this run's to drop.** Where one turns
   out to be closed only by configuration nobody has set, whether to open it or
   route around it is the user's to make, asked with the measurement that
   settles it: the command that was run, what it answered, and what it would
   take to make it answer differently. The answer changes what the task
   delivers rather than the route to it, and a deliverable short of what was
   asked for is the user's to accept. The question goes in this batch where the
   block is already known, and on its own the moment it surfaces later, because
   the closing report is where a decision the user never made turns into a note
   about one the run made for them. The measured run dropped one that way:
   PX-612's second exit criterion named the `/mcp` machine JWT path, and
   `MUHELY_MCP_SERVER=on` on its own answered every request with HTTP 500 and
   "Reader auth configuration was requested in legacy mode", the plugin
   wanting `MUHELY_AUTH_MODE=reader` and six further environment variables
   besides. The run measured that, routed around it through another write
   path, and recorded the decision in its report and in a tracker comment;
   the user's reply was "nem értem miért nem kérted, miért dobtad el" ("I do
   not understand why you did not ask for it, why you dropped it").
   **Make the switch step 4 held, where the branch step 4 read is not this
   work's own, as soon as these answers come back**, cutting a branch that has
   to be created from the start point those answers settled, and before the
   list below is created, so that every commit from here on lands where someone
   decided it should land rather than where the last run left the tree.

## The fixed task list

These entries are knowable before anything about the task has been read, which
is why they are written here. **Every entry below is one TaskCreate call, in
the order they appear, apart from entry 3**, which is a slot rather than a
step: the derived entries are inserted there, one TaskCreate call each. The
whole list is created in one burst before any file is touched, which is why
creating it is not an entry in itself; `.claude/CLAUDE.md` ("Task tracking")
owns the requirement to have a list and to keep its statuses current. The
free-text way drops the five entries marked *issue only* and nothing else;
separately, the entry marked *only on a yes in fixed step 5* is in the list on
either way in when the user asked for that check, and on neither when they did
not.
Which comment a tracker entry lands in, a fresh one or the running summary
extended in place, is `linear-conventions`'s call and not this list's. An entry
is never dropped because the task looks too small for it.

**The subject is the entry's first sentence, copied verbatim, and the rest of
the entry goes into that entry's `description`.** A subject is a label in a
list and holds one line, so an entry that runs to two or three sentences would
lose everything after the first if the description did not take it. The
`description` therefore carries two things. The first is the remainder of the
entry as written below; where that remainder is mostly the reasoning behind the
step, as entry 9's is, the `description` takes the instruction, meaning the
command, its flags, the guards and what to do when one of them fires, and the
reasoning stays here for whoever needs to know why. The second is the detail
that makes the entry checkable, written in as the entry is created: the rule or
skill that owns the step, the files, and the check that closes it. The *issue
only* and *only on a yes in fixed step 5* markers are notes to whoever builds
this list and go into neither field. Detail written nowhere is detail held in
the orchestrator's head, where a compaction, a later session, or anyone else
reading the list cannot reach it; the entry's own field is the one place it
survives all three.

**Where one entry truly cannot start before another finishes, wire it with
TaskUpdate**, `addBlockedBy` / `addBlocks`, as the list is created. In this
list that is entry 2 before every unit in entry 3, because the memory search
shapes the prompts those spawns are written from; every unit in entry 3 before
entry 4, because that review round is over finished units; entry 4 before
entry 5, which runs after the findings are applied; entry 5 before entry 6,
because entry 5 changes files too and entry 6's confirmation is about the state
that ships; entry 6 before entry 9, because entry 9 publishes the branch
and entry 6 is where the browser gate is settled, so a push that ran first
would publish work nothing had yet passed; and, issue way
only, entry 8 before entry 13, because entry 13 deletes the run file that
holds the relations entry 8 checks, and a second tracker read to get them back
is the one thing the single read exists to prevent. From entry 9 on, the list
is a chain and every link in it is real: the how-to-test comment cannot name a
branch that has not been pushed, the user cannot run the manual check before
that comment says what to run, the summary cannot report a verdict that has
not come back, and the retrospective cannot weigh a check that has not
happened. Block each of those entries on the one before it that this run
actually has, since the free-text way drops entries 10 and 12 and a no in
fixed step 5 drops entry 11. Numbering is not a dependency, so leave the rest
unblocked: a block then tells the run what is holding it up instead of
repeating the order.

**A status moves when the run moves.** An entry goes `in_progress` as its work
starts and `completed` as it closes, one TaskUpdate at each edge; for a derived
entry those two edges are the spawn going out and the unit's commit landing
(the unit loop below). Swept up at the end instead, the list becomes a record
of what happened, when what it was needed for was deciding what to do next.

1. Report a contradiction between the issue and its linked documents in a
   comment on the issue, the moment one turns up rather than at the end. When
   none turns up there is nothing to post, and this entry closes with "none
   found". *Issue only.*
2. Before the first spawn, load `model-routing` and search the shared memory
   once for each subsystem the derived entries touch, so a hit shapes the
   prompts instead of surfacing after the work is built. `.claude/CLAUDE.md`
   ("Shared memory") owns the command, which subsystems qualify, and what a hit
   obliges.
3. **The derived entries go here**, one per unit of work, each carrying its own
   spawns, its own gates and its own commit. See the next two sections.
4. Review round over the finished units, sized on its own headcount rather than
   inherited from the units (`model-routing`, "Size the task before you route
   it"), then apply its findings and re-run the gates each finding touched. The
   apply half is routed and split the same way (`model-routing`, "Step 4: pick
   the row"), rather than going to one agent because the findings arrived in
   one report. One run handed a single `coder-sonnet` all three findings of a
   review round, and the user asked why: "megint azt látom hogy egy coder agent
   kapott minden review finding javitást" ("again I see that one coder agent
   got every review finding fix").
5. Final review of the whole change, after the findings are applied, spawned as
   its own unit and never skipped because the round before it passed. The
   measured run closed this entry with `/code-review xhigh --fix`, which
   reviews the diff and applies what it finds to the working tree. No rule file
   requires that command; a routed reviewer spawn closes the entry as well.
6. Confirm that every unit either passed its browser gate or carries a stated
   exemption, and say for each which of the two it was.
7. Post the consolidated decisions comment where the issue's plan set asks for
   one. It keeps its place ahead of the closing comments in entries 10 and 12,
   because it records decisions taken while the work was running and waits on
   nothing the pull request settles. *Issue only.*
8. Check the related issues, and where one warrants a comment follow
   `linear-conventions` ("Check the related issues before closing") for who
   asks and who writes it. *Issue only.*
9. Push this run's branch and open the pull request, once every commit the work
   itself produced has landed. **A push is allowed from this entry onward, and
   at no point before it**, other than a push the user asks for directly, which
   `.claude/rules/session-lifecycle.md` ("Pushing is not part of committing")
   covers. What the user granted is narrow in when rather than in how many
   times: "ezentúl a legvégén engedi ezzel van a push de csak a legvégén"
   ("from now on a push is allowed at the very end, that is what this is about,
   but only at the very end"). Nothing goes up part-way through the work, and
   the tail of the run is where the branch is published, so the pushes the
   entries below can still need, one for each fix entry 11's manual check
   turned up and one for what entry 13 commits, are this same permission
   exercised again on the same branch rather than new ones: each runs the
   command and the guards this entry gives, and the open pull request picks the
   new commit up on its own. Nothing beyond what entries 11 and 13 commit is
   made after this entry, so anything of this run's own that is still
   uncommitted is committed first, through the `git-commit` skill; a peer
   session's edits sitting in the same working tree are not this run's to sweep
   up. The push is not delegated and is never aimed at a throwaway or test
   repository (`.claude/rules/session-lifecycle.md`, "Pushing is not part of
   committing"). The `git-commit` skill refuses `git push`, so the push is the
   orchestrator's own command, and a plain one: `git push -u origin <branch>`,
   with no `--force`, no `--force-with-lease`, and no refspec that moves
   anything but this run's own branch. A push git rejects as non-fast-forward
   usually means that commits which are not its own sit on that branch, and
   `.claude/rules/session-lifecycle.md` ("Commits") leaves those with the user:
   report the rejection and stop, rather than reaching for the flag that makes
   it go through. Then open the pull request with `gh pr create --base <the
   target settled in fixed step 5> --title "<subject>" --body-file <absolute
   path in the session scratchpad>`. On the issue way the subject carries the
   issue key and the body says what changed and how to test it, the same two
   things entries 10 and 12 put in the tracker; on the free-text way the body
   says those same two things, written from this run's own commits and checked
   against the statement of understanding from fixed step 3, which was written
   before the work existed and so says what the run set out to do rather than
   what it did. Every run opens one, whatever the size of the change, because a
   branch with no pull request is work nobody reviews and nothing merges. A run
   that resumed an existing branch can arrive here with one already open, and
   that requirement is then met: where `gh pr create` reports that one already
   exists, read it with `gh pr view --json url,baseRefName`, report the URL
   rather than opening a second, and where the base is not the target settled
   in fixed step 5, say so rather than retargeting it. All three flags are
   passed every time. With `--base` left off, `gh` takes the base from the
   `gh-merge-base` branch config and otherwise from the repository's default
   branch, so an unstated target quietly becomes the wrong one (`gh pr create
   --help`, gh 2.97.0, read 2026-09-05). With `--title` and `--body-file` left
   off, `gh` has nothing to fall back on but a prompt, short of the `--fill`
   family this run does not use, and the shell this run's commands go through
   is not a terminal, so the command exits non-zero instead of opening
   anything. The body goes in a file rather than in `--body` for the reason the
   `git-commit` skill gives under "A message too awkward for `-m`", and that
   file is one of the temporary files `.claude/CLAUDE.md` ("Cleanup") makes
   this session responsible for deleting. **What the entries after this one
   wait on is read from `.github/workflows/` rather than remembered**: where a
   workflow triggers on `pull_request`, they wait on its result as well as on
   the push, because a pull request whose checks have not run is not yet in a
   mergeable state. No workflow there does as of 2026-09-05: the repository's
   one workflow, `.github/workflows/deploy.yaml`, triggers on a push to `main`
   and on manual dispatch, so nothing waits on a check today and no run invents
   one that does not exist. **The pull request's URL goes into the closing
   report**, whether `gh pr create` printed it or `gh pr view` read it back
   from a pull request already open, and on both ways in: on the free-text way
   entry 12 is not in the list, so the closing report is the only place this
   run tells the user where the pull request is.
10. Post the how-to-test comment, now that the branch is pushed and the pull
    request is open, so it can name what the user checks out;
    `linear-conventions` ("The how-to-test comment") owns what goes in it. It
    comes before entry 11 rather than after it because it is what the user
    reads in order to run that check, and a how-to-test comment written once
    the testing is over is a record of it rather than an instruction for it.
    The run file is still on disk here, since entry 13 is what deletes it, and
    neither this comment nor entry 12 is written out of it: what that file
    holds is the issue as it was read at the start, which is what the work was
    built from rather than an account of what the work turned out to be. Both
    are written from this run's own branch and from what `linear-conventions`
    has the closing check re-read with `list_comments`. *Issue only.*
11. Hand the finished branch to the user for the manual check and wait for
    their verdict. It sits after the push because what the user tests is the
    branch as pushed. On the issue way entry 10's comment is what they test it
    from; on the free-text way, there being no tracker to put one in, the
    handover message carries the same thing that comment would have: each step,
    the result to expect at it, and what the finished state looks like. **The
    steps and the verdict question go out in the same turn**: the message says
    what to test, and the AskUserQuestion that follows it is the stop, so the
    run resumes on the answer rather than on the user remembering there was one
    to give. Keep the entry `in_progress` until the verdict arrives, so that
    nothing reads the run as finished while the gate is open; this is the run
    handing over rather than the interim narration `.claude/CLAUDE.md`
    ("Non-negotiables") rules out. That question is one this entry reserves in
    the sense `.claude/CLAUDE.md` ("Asking the user") means: the user ran the
    check and the orchestrator did not. A defect that comes back is a late
    entry with its own spawns, gates and commit, the way "Entries that only
    exist once the work runs" below describes, and its commit is pushed under
    entry 9, which owns that push and the guards on it. **This entry then
    reopens and runs again over the fixed branch**, because the verdict the
    gate exists for is a verdict on what ships, and the state the user checked
    is no longer that. Entry 10's comment is brought current before that second
    handover rather than at entry 12, since it is what the user tests from, and
    the pull request's body is brought current in the same move, on both ways
    in, with `gh pr edit --body-file <absolute path in the session
    scratchpad>`, which with no pull request named edits the one that belongs
    to the current branch (`gh pr edit --help`, gh 2.97.0, read 2026-09-05).
    After a fix that body still describes the branch as it stood before the
    fix, and on the free-text way, where entries 10 and 12 are not in the list,
    it is the only account of what changed and how to test it that outlives the
    conversation this run happened in. *Only on a yes in fixed step 5.*
12. Finish the summary comment: extend it in place to its final state, carrying
    the pull request URL and whatever the manual check found. It waits until
    here because neither of those exists any earlier in the run, and it waits
    on the checks entry 9 names as well, since a summary posted before they
    have run reports a branch that may not be mergeable. Where this run never
    had cause to open a summary comment, this is where the first one is posted
    instead, which `linear-conventions` ("Workflow for the summary comment",
    step 3) covers. That skill's "Two current comments at the end" owns what
    closes this entry. Both comments have to be current at that point; where
    entry 11 sent a defect back, entry 10's comment was brought current there,
    before the second handover, so what this entry does with it is check it
    rather than write it. Where fixed step 5 got a no there was no manual
    check to report, and nothing else about this entry changes. *Issue only.*
13. Run `/retrospective`, commit every file it leaves to be committed, and
    delete the run file when the task came in as an issue.
    `.claude/rules/session-lifecycle.md` ("Commits" and "Retrospective") owns
    which files those are and the order the commits land in. Nothing here is a
    second retrospective: this entry is the automatic run that
    `.claude/CLAUDE.md` ("Task tracking") and
    `.claude/rules/session-lifecycle.md` ("Retrospective", the third of the
    three ways it runs) start once the rest of the list is finished, and the
    two coincide because this entry is last, which is deliberate rather than
    luck. It is last because what the user's own check turned up in entry 11 is
    the one kind of finding no agent in the run ever sees, and a retrospective
    that closed before that verdict could not carry it. The skill runs the
    shared memory status check itself, so that is not an entry here. What this
    entry commits is published like the rest of the branch, by entry 9's push
    run again, because a retrospective committed and never pushed is work the
    pull request does not carry. It changes nothing the tracker or the pull
    request's body reports, so the two comments entries 10 and 12 left current
    and that body stay current: what this commit records is how the session
    ran, not what the branch changed for the issue's reader. The commit list
    entry 12 finalised therefore ends short of the branch by whatever this
    entry commits, which is what its place at the end costs rather than a
    comment left stale.

## The derived entries

**Entry 3 is computed from the task, never from this file.** The one exception
is a planning pass: that entry comes from this skill, and it also changes when
the rest of the slot can be created at all, both of which
`references/planning-pass.md` ("Where the pass sits in the run") owns. Reading
the run file, or the free-text description, yields three things:

- **One entry per unit of work**, where a unit is one deliverable with one
  acceptance check that can be verified on its own. `model-routing` ("Size the
  task before you route it") owns where the split falls;
  `.claude/rules/planning-deliverables.md` owns the same rule for the files a
  plan is written into.
- **The files each unit commits**, named explicitly in that entry's
  `description`, alongside that unit's own acceptance check. A commit boundary
  that is not written down before the work starts turns into one mixed commit
  at the end. `.claude/rules/session-lifecycle.md` ("Commits") owns what makes
  a boundary.
- **The acceptance gate the whole task hangs on**, written in the words of the
  task. When the task does not define one, that is the first opening question,
  not something to invent; `.claude/rules/planning-deliverables.md` says why an
  invented threshold may not gate anything.

**Entries that only exist once the work runs get their own TaskCreate call the
moment they are found**, not carried in the orchestrator's head: a
contradiction between the issue and a document, a bug a gate exposes, a finding
a review produces. A late entry gets the same treatment as a planned one, its
own memory search, its own spawns, its own gates and its own commit. One thing
found this way is a question before it is an entry: a path the task itself
names that turns out to be closed only by configuration nobody has set. Fixed
step 5 owns that question and the measurement it carries; it is asked the
moment the block surfaces, and the answer decides which route the list gets an
entry for.

## The unit loop

For each derived entry, in order:

1. **Spawn the unit's agents**, with the model, effort and prompt shape
   `model-routing` prescribes, and split the unit where that skill says to
   split it rather than treating the commit boundary as the agent boundary.
   Where two of them will be running at the same time, or one starts while an
   earlier agent is still working, `.claude/rules/parallel-spawns.md` owns the
   pre-flight that runs over the batch first, and these prompts are written from
   what it finds.
2. **Run the gates yourself when they return**, and read the exit codes rather
   than the agent's account of them (`.claude/rules/code-standards.md`, "A
   subagent's green report is not a run", which carries the case this came
   from).
3. **A failed gate is answered with a fresh spawn.** Escalate on
   `model-routing`'s ladder rather than re-prompting the agent that failed, and
   hold a new requirement for that spawn's prompt rather than sending it to an
   agent that is still building against the prompt it started with: a late
   requirement either lands on a half-built change or is dropped, and the run
   pays for both. **What separates a repair from a new requirement is whether
   the instruction can be carried out at all.** A message that repairs an
   instruction that cannot be, including one that makes a sibling's instruction
   carry out, is a repair and goes now, since an agent working from an
   impossible instruction is building nothing worth waiting for and every
   minute it runs on is more to throw away; a requirement added to a change the
   agent is already building correctly waits for the next spawn. Messaging is
   otherwise ordinary, which `model-routing` ("A finished agent is never
   continued") says in its own terms, and directing an agent this session
   spawned is this session's own job: "amit te inditasz azoknak barmikor
   szolhatsz ha ugy veled hogy kell vagy en kerem, mivel azok iranyitasaert te
   vagy a felelos" ("the ones you spawn you may message at any time if you
   judge it necessary or I ask for it, since you are responsible for directing
   them"). On 2026-09-09 an orchestrator crossed two of its own spawns, one of
   them told to import `stateVectorCovers` from a file it was forbidden to edit
   while that symbol was still module-private, and the two messages that
   repaired it, one asking the owner to export the symbol and one telling the
   importer the import would now resolve, were the only fix short of stopping
   both runs. Whether a message reaches a given agent at all has an answer
   rather than a guess: `.claude/CLAUDE.md` ("Cleanup") owns that answer and
   the recovery for an agent a message cannot reach. What this session never
   messages on its own judgment is another Claude session, which
   `.claude/rules/session-lifecycle.md` ("Parallel sessions") owns.
4. **Commit the unit** through the `git-commit` skill, with the file list from
   its entry.

## The gates

The orchestrator runs these in the workspace's mise environment
(`.claude/rules/session-lifecycle.md`, "Tools and startup", which also owns the
scripts that start the app and the database).

- **Typecheck.** `mise exec -- pnpm typecheck` at the root, or
  `mise exec -- pnpm --filter <package> typecheck` for one package.
- **The package suite.** `mise exec -- pnpm --filter <package> test`.
- **Changed-line coverage.** `mise exec -- pnpm coverage:changed-lines`.
  `.claude/rules/code-standards.md` owns the bar, what counts as covered, and
  the `--skip-run` path for a suite that was already red.
- **A real browser run for anything a person can see.** This is the one gate
  the orchestrator does not drive personally:
  `.claude/rules/browser-verification.md` puts the browser steps in the
  `real-browser-sonnet` agent and leaves the server start and stop with the
  orchestrator, and it owns the loop, what does not count as verification, and
  how an exemption is declared. What comes back is evidence to read, not a
  verdict to accept, and the pass condition has to be the thing the change is
  supposed to do rather than a status the transport reports about itself. In
  the run this workflow was measured from, an HTTP 101 and a client reporting
  itself connected had been written down as the success condition and neither
  discriminated anything; what proved the change was the synced state and the
  persisted row.

## What wasted the measured run

- **A new requirement messaged into a running agent**, instead of being held
  for the fresh spawn that answers the failed gate. Covered in the unit loop
  above, which also says why messaging an agent this session spawned is
  otherwise ordinary; it is the single most expensive habit this workflow
  removes.
- **A gate believed from a report.** `.claude/CLAUDE.md` ("Verification and
  evidence") already requires a measurement this session ran; the workflow's
  contribution is putting that measurement between the spawn and the commit.
- **A managed resource reached directly.** The app and the database have
  wrapper scripts and no other entry point. See
  `.claude/rules/session-lifecycle.md` ("Tools and startup").
- **Instruction-file work routed to a coding tier.** `model-routing` ("Do not")
  lists which files count as one and where they go instead.
