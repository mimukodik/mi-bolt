# Session lifecycle

Tooling, commits, retrospective, hooks, agent definitions, instruction file
review, parallel sessions, and language rules for the mi-bolt workspace.
Loaded at launch as a project rule (no `paths` scope). Referenced from
`.claude/CLAUDE.md`.

## Tools and startup

- **mise at the root, npm in `frontend/` and `tools/`, Gradle in `backend/`.**
  Every command is run from the repository root. The root commands are the
  tasks the root `mise.toml` defines, run as `mise run <task>` and listed by
  `mise tasks`; each of `frontend/`, `backend/` and `tools/` has its own
  `setup`, `lint`, `test` and `build` behind them. The Angular workspace is
  `frontend/`, with `frontend/package-lock.json` as its lockfile, and one of
  its scripts runs as `npm --prefix frontend run <script>`; the backend is the
  Gradle build under `backend/`, and one of its tasks runs as
  `backend/gradlew -p backend :services:commerce:<task>`. There is no `pnpm`.
  A command that is neither a `mise` task, nor a script in
  `frontend/package.json`, nor a Gradle task does not exist here however
  familiar it looks. Read the list rather than recalling it; several rules in
  this directory once named scripts that had never been defined, and an agent
  handed one of those fails on the user's machine rather than on mine.
- **The dev servers and the database are the orchestrator's.**
  `mise run storefront`, `mise run admin` and `mise run payment` serve one app
  each with `ng serve`, and `mise run frontend` serves all three; the
  storefront and the admin run on MSW in the browser, so nothing needs
  bringing up beside them. `mise run db` starts PostgreSQL, `mise run backend`
  and `mise run dev` start the backend with it, and `mise run stop` stops
  them. A spawned agent neither starts nor stops any of these:
  `.claude/rules/parallel-spawns.md` makes the port a shared resource, and
  `.claude/rules/browser-verification.md` puts starting and stopping with the
  orchestrator. An agent that needs a built artifact served uses
  `frontend/scripts/serve-static.mjs` on a port of its own, names the port in
  its report, and stops it when it is done.
- **A skill whose frontmatter carries `disable-model-invocation` can only be
  started by the user typing it.** A `Skill` tool call to one fails, so check
  the frontmatter before calling a skill not called before. When one is needed,
  ask the user to run it and state the exact arguments, rather than trying and
  failing first.
- **Every path in a Bash call is absolute, because the working directory the
  call runs in is not that call's to assume.** In the main session a `cd`
  outlives the call that ran it, so a bare
  `sed -n '730,760p' 05-editor-shell.md` succeeded because a compound `cd`
  into the directory holding that file, several calls earlier, was still in
  force, and the next call naming a path from the repository root failed for
  the same reason; a spawned agent's thread fails the same way from the
  opposite cause, its working directory being reset between calls, so a `cd`
  there does not carry at all. Five calls in one session failed that way and
  each was retried from an absolute base, which is the whole of the fix. A
  command that depends on the working directory rather than on a path
  argument names that directory in the same call with `cd <absolute path> &&`
  rather than inheriting it — which is also how an agent working in a git
  worktree reaches its own checkout instead of the main one. This governs the
  calls I run rather than what a file writes down: a script is named
  repository-relative because that is how a file names a path, and the call
  that runs one gives it in full; `.claude/rules/code-standards.md` bans a
  machine-specific path in a committed file, and an absolute path in a Bash
  call is not one.
- **A wait is the command's own exit, never a loop I write around it.** Run
  the command and read its exit status, or start it with the Bash tool's
  `run_in_background`, which re-invokes this session when the command exits;
  both end when the work does and neither can outlive it. Polling a log for a
  string is the last shape to reach for and never the way to wait on a command
  I could have run myself: it ends only if a string I chose turns up, so a
  string that never turns up is a wait with no end, and for as long as it runs
  it reads as "running", which is what a slow command reads as too. Putting a
  counter on such a poll is not the fix, because it still leaves the session
  watching a log for work it could have waited on directly. Where a condition
  genuinely is the only observable, because the process is not mine to start,
  the poll goes into the background as a command that exits once the condition
  holds, or to `Monitor`, which carries a timeout and so ends whether or not
  the condition ever arrives. The foreground is not on offer for any of this:
  my own Bash tool blocks a foreground `sleep`, and a spawned agent's does not,
  so in a spawn prompt this rule is the only thing that stops one, measured
  2026-09-09 in a subagent where a plain `sleep 2` and an `until` loop around
  `sleep 1` both ran to completion. This binds the commands I write into a
  spawn prompt as much as the ones I run: a `coder-sonnet` prompt that
  redirected the gate's output to a log file left the session with a log to
  watch instead of a command to wait on. `.claude/CLAUDE.md`
  ("Cleanup") owns the shell that is already hanging; this is how one stops
  being started.
- **A wait keyed on success alone never ends when the thing fails.** A
  condition that matches the finish line and nothing else stays silent through
  a crash, a hung process or an unexpected exit, and that silence looks
  exactly like still running, so the question to ask before writing one is
  what it would emit if the command died right now; nothing is an answer that
  means the condition is too narrow.
- **Copy the wait's string from the program that prints it**, rather than
  typing it from memory, since one that differs in case or wording is a
  condition that can never come true. One loop polled a coverage gate's log for
  a string in the wrong case; `grep -cE` on the finished log returned 0 for
  that pattern, `ps` showed the loop at `04:43:55` elapsed, and the user had to
  raise it twice, the second time by quoting the command back. That loop did
  cover the failure states as well, and the branch that was going to fire was
  the misspelled one, so breadth is no substitute for the string being right.

## Commits

- Committing is always mandatory. I commit after every closed task, and always
  before running the retrospective, following the `git-commit` skill's rules.
- **The work goes on a branch of its own, and the orchestrator gets onto it
  before the first commit.** `git branch --show-current` is read before that
  commit, and unless it names the branch that belongs to this work, the
  orchestrator switches to that one first: `git switch -c <name>` where no
  branch of that name exists yet, and plain `git switch <name>` where one
  does, locally or on `origin`, since that form checks the existing branch out
  or creates a local branch at the remote's tip and tracks it. The `origin`
  side of that test is read live, with `git ls-remote --heads origin <name>`
  or after a fetch, and never off the remote-tracking refs already on disk:
  `git branch -a` is only as current as the last fetch, so a branch a peer
  pushed since then is absent from it, and that stale no is what sends the
  session down the `-c` path this bullet warns about below. Settling the test
  is all `ls-remote` does: it queries the remote and writes no ref, while
  plain `git switch <name>` builds the local branch out of a remote-tracking
  ref under `refs/remotes/`, so an `origin`-only hit needs a `git fetch`
  before the switch is run. Skipping that fetch fails on the very case the
  live read was added for: `ls-remote` returns the ref, and the switch then
  exits 128 with `fatal: invalid reference: <name>`. Getting the pair
  the wrong way round is how a resumed issue goes wrong: `git switch -c`
  exits 128 with `fatal: a branch named '<name>' already exists` when the
  branch is local, and when it exists only on `origin` it succeeds and quietly
  starts a second, divergent branch from the current HEAD. A `git switch -c`
  with no start point starts the new branch at whatever is checked out, so
  where the branch belongs on some other base, that base is named:
  `git switch -c <name> --no-track origin/<base>`, run after a `git fetch` so
  that ref is the base's current tip. `--no-track` is what keeps
  `origin/<base>` from becoming the new branch's upstream, which
  `branch.autoSetupMerge` sets for a remote-tracking start point and defaults
  to `true`: a branch tracking the base it was cut from reads as
  `## <name>...origin/<base> [ahead 1]` in `git status -sb` rather than as
  work with nothing published yet, measured on git 2.50.1. What disqualifies a
  branch is its relation to the work rather than its name: `main`, the branch
  this work was started from, and a branch left checked out from different
  work are none of them this work's own. `feat/mi-bolt-mvp-implementation` is
  the branch this work sits on, cut from `main`. Where an issue tracker prints
  a branch name for the issue, that name is used verbatim rather than invented;
  with no issue there is nothing to copy, so the name is one of the opening
  questions. That question may carry candidate names as its
  options: a name the user picked out of a list is not one I invented, and
  offering them makes it an ordinary choice question, which "Asking the user"
  in `.claude/CLAUDE.md` then covers unchanged. Work that has already landed
  on the wrong branch is moved rather than undone: `git switch -c <name>` from
  where it sits carries every commit onto the new branch, and
  `git branch -f <branch> <sha>` then puts the shared branch back on the
  commit it held before this session's work. Switching away first is what
  makes that force update legal, because git refuses to force a branch a
  worktree has checked out. The sha is the parent of this session's first
  commit on that branch; `origin/<branch>` names that same commit whenever the
  branch was sitting on its remote and is easier to read, and it is the wrong
  ref whenever it was not, because a branch behind its remote would be carried
  forward onto commits it never held. Every commit is kept and a pointer
  moves, so "Nothing is undone with git" below does not bar it. That repair
  works only onto a branch that does not exist yet: where this work's branch
  is already there, the commits have to be replayed onto it rather than
  carried, and that replay goes to the user. The repair is this
  session's to make only while every commit on the wrong branch beyond its
  remote is this session's own and none of them is pushed: a peer session's
  commit would ride onto the new branch and off the shared one, and moving a
  peer's work is not this session's judgment to make, for the same reason
  "Parallel sessions" below leaves undoing a peer's change to the user, who is
  the one who knows what interrupting a peer costs. A pushed commit is the
  user's call too, because putting the branch back rewrites published history.
  Otherwise the session moves nothing, says which commit is not its own or is
  already pushed, and asks the user. One session's first commit landed on the
  wrong branch and moved at no cost because that commit had not been pushed.
- **One commit, one logical change.** The unit is the change, not the session
  and not the file count. A commit that a reviewer cannot describe in one
  sentence, or that could be reverted only by also reverting something
  unrelated, is two commits. Files that only make sense together, a new key and
  the code that renders it, belong in the same one.
- **Commit at every phase boundary.** A workflow phase that finishes, a review
  round that closes, a fix that is verified: each is a commit point, not a
  checkpoint to accumulate past. Three fix rounds across roughly forty files
  once reached the end of this branch with no intermediate commit, which made
  the work unreviewable and put every round at risk of one bad rebase.
- Before staging, `git status` is read rather than assumed. Concurrent agents
  and peer sessions put their own edits in the same tree, so every stage names
  explicit pathspecs and every commit is checked with
  `git diff --staged --name-only` before it is made.
- After the retrospective has run, I commit every file this session changed
  under `.claude/retrospectives/` as well, before the closing message: this
  run's own file, and any earlier run's file whose waiting line this session
  closed. Every proposal's outcome is recorded first, per "Retrospective"
  below. The skill itself never commits, so without this step those files stay
  untracked.
- It is not acceptable for a session's entire output to stay untracked. If
  something is deliberately left uncommitted, I state that in the closing
  response, with a reason.
- **The commit belongs to the orchestrator.** A spawned agent reports the files
  it changed and does not commit or stage unless its own task tells it to,
  because one session owns the order the commits land in. Pushing is not inside
  that exception: no task an agent is given lifts it, and "Pushing is not part
  of committing" below says why and how far it reaches.
- **Pushing is not part of committing**: the push and the pull request belong
  to one entry of the `task-execute-workflow` skill's task list, which owns
  the command, its flags, and what a rejected push means, and nothing pushes
  outside what that entry allows, other than a push the user asks for
  directly, which is their instruction rather than the workflow's and is run
  as they asked rather than by loading that skill for one git step. Either way
  the push is the orchestrator's own command rather than something a spawned
  agent can be handed, and it is never aimed at a throwaway or test
  repository, since the permission prompt lands on the user wherever a push is
  aimed. What the rule turns on is who runs the command rather than how far it
  reaches, so a spawned agent runs no `git push` at all: not at this
  repository, not at a clone of it, not at one the agent created in the
  scratchpad to measure something in, and not at one whose remote is another
  local directory. Pushing is the operation that publishes, the one whose
  effect can land outside this machine, and an agent is not the party that can
  tell a local stand-in from a real remote at the moment it runs the command,
  while the orchestrator is the session holding the whole picture and the
  permission prompt named above lands on the user rather than on the agent that
  raised it. A push the user asks for directly is asked of the session they are
  talking to, so it is no more a spawned agent's to run than the workflow
  entry's push is. A fact that only a push would settle is left unsettled: the
  agent reports it as unmeasured and says what it would have run, and the
  orchestrator measures it or decides the work goes on without it. One
  read-back agent built a repository and a second directory to act as its
  remote, both inside the session scratchpad, and pushed between them to see
  how a remote-tracking ref behaved; the user's reply was "Nem ugy volt hogy
  csak te pusholhatsz? mert aki dolgozik eppen agent pusholt" ("Wasn't it that
  only you may push? Because the agent that is currently working pushed").
- **Nothing is undone with git.** No `git checkout --`, `git restore`,
  `git stash`, `git reset`, or `git clean` to remove work, mine or anyone
  else's, however out of scope it turned out to be. Work that does not belong
  in this branch's commits is written to a diff and left in the working tree;
  the commits stay clean because every stage names explicit pathspecs, not
  because the tree was emptied. If a change really has to leave the tree, the
  user says so first.

## Retrospective

The `/retrospective` skill runs three ways:

1. Offered at the start of the next session: the SessionStart hook lists
   finished previous transcripts with at least 40 main-agent tool calls that
   no retrospective covers and no declined offer rules out, and I ask the user
   once with AskUserQuestion whether to run it. An existing retrospective file
   does not close a transcript forever: a session that kept working after its
   file was written comes back on the list for that later work, so that offer
   goes to the user like any other rather than being dismissed as a stale
   marker; `.claude/hooks/CLAUDE.md` owns the exact conditions.
2. Manually with `/retrospective` at any time; recommended at the end of a
   session.
3. Automatically, without asking, when a task series is fully completed,
   meaning every task in the TaskCreate list is completed, before the closing
   message.

The Stop hook does not nudge retrospectives; it only enforces the Todo list.
The skill runs as a forked background agent, proposes a new skill, a skill
change, or a CLAUDE.md/AGENTS.md change only when warranted, and always writes
a file under `.claude/retrospectives/`, even with no proposal, because that
file is what tells the SessionStart hook the session is covered up to the
point it was written. Applying a proposal requires AskUserQuestion approval
first; an approved new or modified skill must be written and tested with the
`skill-creator` skill (plugin). Skills live under `.agents/skills/<name>/SKILL.md`.
`.claude/skills/` holds a second, independent copy of the same tree — two real
directories, not a symlink pair — so an edit applied to one reaches half its
readers; `.claude/rules/code-standards.md` owns that check.

Every proposal's outcome goes back into the retrospective file, and writing it
is the orchestrator's rather than the skill's: the skill runs as a fork that
finishes before the user has been asked anything, so it cannot know what was
decided. I record what became of each proposal in the shape the skill's
`## Output` section defines, and that write sits between two commits: after any
change this session applied has been committed, because an applied proposal's
line names the commit that carries it, and before the retrospective file itself
is committed. A declined proposal that leaves no trace is indistinguishable
from an approved one that was lost on the way to being applied, and an audit of
this archive spent a full investigation on exactly that ambiguity without being
able to tell which had happened.

The skill scans the archive on every run for proposals an earlier run left
approved and never applied, and returns what it found. Each of those goes to
the user as a question of its own, in the same AskUserQuestion call as this
run's new proposals and never as an option inside another question, because a
yes to this run's work is not a yes to something a previous session left open,
and an approval nobody is told to look at again is exactly the lost proposal
the record exists to prevent. Applying one is not a new entry: it closes the
line the earlier run wrote, in that earlier file, and the skill's `## Output`
section says how.

## Hooks

`.claude/settings.json` wires them: SessionStart injects the shared memory
index and a pending retrospectives scan, and no longer restates rules; Stop
runs the Todo guard only. Source is in `.claude/hooks/`, a package of its own
that the frontend's unit runner does not reach: `mise run claude:hooks:test`
and `mise run claude:hooks:typecheck` are its gates. A change there is also
verified by running the hook itself and reading its output, and the commit body
records that command.

A hook never restates a rule. Rules live in `.claude/CLAUDE.md` and
`.claude/rules/`, and those files are already loaded at launch; a hook that
repeats them creates a second copy that drifts. A hook injects only what the
launch-time files cannot know: session-specific state, scan results, and
pointers to where the durable text lives.

## Agent definitions and subagent prompts

What the Hooks section says about a hook holds for the definitions in
`.claude/agents/` and for the prompt I write when I spawn one.

- **An agent definition carries only what is specific to that agent**: what it
  is for, what it must not do, and how it reports. A rule that already lives in
  `.claude/CLAUDE.md` or `.claude/rules/` is in that agent's context from the
  start, so restating it in the definition adds a copy without adding a rule.
- **A subagent prompt carries everything `model-routing`'s prompt-shape list
  asks for**, and that list is read from the skill rather than remembered: it
  grows as spawns turn up things a prompt has to say, and any subset restated
  here would freeze on the day it was copied while the spawns kept relying on
  it. An agent spawned from `.claude/agents/` has already loaded the rule
  files, so repeating those there costs context and invites the same drift;
  the built-in Explore and Plan agents have not, and what those two need is
  restated for them.
- **A correction the user made goes into the prompt as their own words,
  quoted.** A paraphrase is my reading of a sentence that was already precise,
  and the agent works from the reading rather than the correction: one session
  paraphrased the same correction into four spawn prompts, and each paraphrase
  lost the part that made it a correction.
- **A prompt does not ask an agent for a fact about a tool it does not hold.**
  The tools an agent holds are at most the ones its definition's `tools` line
  in `.claude/agents/` names: that line is an allowlist applied over a set the
  harness has already narrowed by two filters of its own
  (https://code.claude.com/docs/en/sub-agents, read 2026-09-05), so it settles
  what an agent does not hold rather than what it does. Naming a tool there is
  no evidence of holding it, and what accounts for the gap is not always one of
  those two filters: the `instructions-opus` definition names `Grep` and
  `Glob`, which no agent on this build holds, because Claude Code removed both
  from native builds entirely; `.claude/agents/CLAUDE.md` ("Tools") owns that
  finding and its sources. What the line does settle is
  load-bearing: a tool it leaves out is not in that agent's context at all,
  schema included, so the agent has nothing there to check an answer against.
  Where the work needs such a fact, the orchestrator measures it first and the
  prompt carries the measurement, the same way it carries every other fact the
  agent cannot reach for itself. An agent asked for one anyway reports back
  without the fact and names the tool it does not hold, unless published
  documentation settles the point, in which case it answers from there and
  cites the URL, an answer the orchestrator can go and check. What it does not
  do is read the fact out of the program that ships the tool, infer it from how
  other tools behave, or recall the schema from memory, because an answer from
  any of those arrives in the report looking exactly like a checked one and the
  orchestrator cannot tell them apart. An `instructions-opus` read-back holding
  no AskUserQuestion was caught grepping the shipped Claude Code binary for
  that tool's schema, and the orchestrator, which did hold it, settled the
  question in one message.
- **A claim about this branch's history is measured before it goes into a
  prompt.** `.claude/CLAUDE.md` ("Verification and evidence") already requires
  that of anything I write; a prompt is where it gets skipped, because the
  sentence is someone else's and arrives with a review's authority. Quoting an
  unchecked finding into a spawn turns it into an instruction the agent has no
  way to doubt: a review named the commit that had added an assertion, that
  claim went into a spawn prompt as it stood, the agent wrote it into a
  committed report as told, and the next reviewer found the assertion had been
  on the branch since its first commit. One
  `git log --oneline -L <start>,<end>:<file>` names every commit that touched
  those lines and settles that kind of question.
- **The copy is what drifts, not the original.** The `as` / `any` rule in
  `.claude/rules/code-standards.md` was restated in five definitions under
  `.claude/agents/`, and all five had lost the same half of it, the clause that
  says to write a type guard when none of the existing ones fits. Each copy
  taught a prohibition with no way out of it.

## Instruction file review

- **A new or changed instruction file is read back by a second
  `instructions-opus` before the orchestrator reports the work done.** The
  scope is the class of files `.claude/agents/instructions-opus.md` says that
  agent writes, so there is no second list of file types to keep in step; the
  prompt text of a single spawn is not a file and is not in it. The reviewer is
  spawned fresh at the end of the work, gets the paths and what the change was
  meant to achieve, and reports what it found rather than rewriting unless the
  spawn prompt asks for the fix, so the orchestrator owns what lands either
  way. The read-back goes to an authoring tier and not to a review tier
  because judging whether a sentence survives the case it did not anticipate
  is the same work as writing one.
- **The reviewer is never the instance that wrote the file.** An author reads
  its own sentence with the intent still in mind and supplies the missing half
  without noticing, so it cannot see the gap it wrote past; a fresh instance
  loads the file cold, the way the next session will, and that is the reading
  that decides whether the file works. Going over the draft again at the end of
  the authoring run is not this check, and reading a file back is a different
  task from writing it rather than a second attempt at the same one. If the two
  passes disagree about wording rather than about a defect, that is the
  contested wording `model-routing` has an escalation for, and running it is
  the orchestrator's call rather than this agent's; it never becomes a third
  authoring pass.
- **No change is too small to be read back.** Size does not predict reach: one
  "may" turned into a "must" changes what every later session is allowed to do,
  while a long skill can add nothing that steers anything. A floor would be a
  number nobody measured. What the size of a change decides is how long the
  read takes, not whether it happens.

## Parallel sessions

- More than one Claude session can work in this workspace at once. Shared
  surfaces are `.claude/settings.json`, `.claude/hooks/`, `.claude/rules/`,
  `.claude/CLAUDE.md`, `.claude/agents/`, and both skill trees.
- **I never message another session on my own judgment.** Changing a shared
  surface is not a reason to send anything. A SendMessage to a peer session
  goes out only when the user asks for it, and then it states what changed,
  that this session did it, and which of their errors to ignore. This is the
  user's call because a message interrupts someone else's work, and the user
  is the one who knows whether that is wanted.
- I do not re-fix or revert another session's shared-surface change without
  messaging first, which means asking the user first.

## Language

Hooks, hook messages, skills, prompts, rule sections, and memory files are
written in English. Commit messages are English as well (git-commit skill).

Everything the user reads in the conversation is written in the language the
user is writing in. That covers my replies and, above all, AskUserQuestion:
its header, its question text, and every option label and description. The
repository stays English; the conversation follows the user.

**English material quoted into a reply written in the user's language is shown
in the original and in translation, never one instead of the other.** An
agent's report, a review finding, a document heading and a commit body all
arrive in English, and quoting them untranslated leaves the reasoning in a
language the user did not ask for, while replacing them with a translation
takes away the wording they would search for or quote back. Both appear,
original first and its translation immediately after: in parentheses right
behind a quoted fragment, and as a separate paragraph directly under a block
quote or a code block. A path, an identifier, a command and a commit subject
stay exactly as they are, with no second copy, because a translated one no
longer matches anything a search would find. One session had to be told twice
in the same run, "forditsd le magyarra mert nem ertem" ("translate it into
Hungarian because I do not understand it") and then "magyarul ird le a
valaszban angolul irt reszeket mert nem ertem igy az indoklast" ("write the
parts of the reply that are in English in Hungarian, because I cannot follow
the reasoning this way").
