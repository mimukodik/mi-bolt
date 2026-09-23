# Parallel spawns

Governs a batch of agents that run at the same time: the check that runs before
the batch goes out, what it covers beyond the file lists, and what a collision
it finds is answered with. A batch is any two agents whose runs overlap,
whether they were spawned in one message or one was spawned while another was
still working. Loaded at launch as a project rule (no `paths` scope, so it
reaches every subagent except the built-in Explore and Plan agents). Referenced
from `.claude/CLAUDE.md`.

This binds whoever issues the batch, which is the orchestrator in almost every
case, since delegation is withheld from most agents (`.claude/CLAUDE.md`). An
agent whose own definition carries `Agent` and spawns two at once runs the same
check over its own batch, and for such an agent the check is the only
protection there is: none of the three definitions that carry `Agent` names
`SendMessage` or `TaskStop` (measured 2026-09-09), so the repair route at the
end of this file is closed to them and a crossed instruction one of them has
already sent can be neither corrected nor stopped.

## The pre-flight

**Before a batch goes out, one pre-flight runs over the whole batch, and the
prompts are written from what it finds.** It runs before any spawn that will
overlap an agent already working, and it covers the new agent against every
agent still running, so a batch that grew one spawn at a time gets the check
once per spawn rather than once at the start. It is a step with an output, not
a disposition to be careful that each prompt is written under, and no sentence
inside a prompt can stand in for it, because an agent cannot see what a sibling
was spawned to write.

**A batch already running with no pre-flight behind it gets one now**, over
what is running rather than over what was planned, and its findings go to the
repair route under "What a collision is answered with", the resolutions
available before a spawn having gone by. Late is how this check is usually
reached: the user has asked for it fourteen times across six sessions, most
recently "ellenorizted hogy a 6 agent nem utkozik sehol sem?" ("did you check
that the 6 agents do not collide anywhere?"), each time after the batch was
already running.

Making it a step is the whole of the fix, because the content was never
missing: every collision measured here was decidable before the spawn from one
`grep` for a symbol, one `rg` for a caller, one glob expanded instead of the
word "specs". Writing the step down is the part that had never been done. On
2026-09-08 a session caught by the user invented this pre-flight for itself and
put a `## Concurrency pre-flight` heading into ten spawn prompts, all ten
inside the 47 minutes that followed; the next morning's parallel batch carried
none of it and one agent in it collided, nothing having changed except that no
file named the step. Every count in this file was taken on 2026-09-09, from
`.claude/retrospectives/` and that day's own transcript.

## What it covers

For each agent in the batch, settle these three before its prompt is written.
Only the first is an answer the prompt carries, and where the other two are
answered says as much as the answers do.

- **The files it will write, named one at a time and never as an area.** This
  is the one that goes into the prompt: `model-routing` ("Prompt shape for
  routed agents", item 8) owns what the prompt then tells the agent about that
  boundary, and carries the run where "and its specs" put one spec file into
  two agents' hands.
- **The shared resources its work reaches**, from the list below. This is the
  half a file list does not cover, and the half that gets skipped. Its answer
  is the resolution rather than a line in a prompt: an authorisation withheld,
  a step held back, two units put in sequence.
- **Everything it is told to use that a sibling owns.** Where a prompt names a
  symbol, an export, a fixture, a script, or a file another agent in the batch
  is writing, confirm the thing exists in the form the instruction assumes,
  before the prompt goes out. Its answer is go or no-go on the prompt's own
  premise: a no means the prompt is rewritten or held back, not annotated.

**Disjoint file lists are not the test.** Four of the eight collisions measured
here contended over something that was in nobody's list: a coverage report on
disk, a running server, a port, a live browser session. Two agents whose file
lists were perfectly disjoint were both authorised to run the same coverage
gate, which writes and reads one report file. File ownership is necessary and
it settles file writes and nothing else.

**The symbol case is the cheapest to check and the most expensive to miss.**
One prompt in a measured run told an agent to import a helper by name from a
module it was forbidden to edit; the
symbol was module-private at the time, so the instruction could not have
compiled. The agent had no way to know, and that prompt was `model-routing`'s
item 8 performed correctly: it named the file, named the sibling, and froze the
export surface. One `grep -n stateVectorCovers` on that path settles it, and
the orchestrator ran exactly that command eleven minutes after the spawn,
because the user asked.

## What a batch shares

This list is here so no batch has to recall it. Each entry is something more
than one agent can reach at once while their file lists stay disjoint.

- **The coverage report.** `frontend/coverage/unit/coverage-final.json` is
  written by every `npm --prefix frontend run test` run and read by the next, so
  two agents running the suite in the same checkout overwrite each other's
  evidence. **A git worktree removes this one**: measured 2026-09-19, a worktree
  made with `git worktree add` plus a `node_modules` symlink to the main
  checkout builds and tests with its own `coverage/`, so agents in separate
  worktrees do not contend here at all. Two agents in the same checkout still
  do, and there the resolution is that only one of them runs the suite.
- **The generated API client.** `mise run api:generate` rewrites
  `frontend/projects/storefront/src/app/api/generated/`, and
  `mise run api:drift` fails when that output
  differs from what is committed. One agent regenerating underneath another's
  build is the same contention the coverage report has, and a worktree does not
  escape it when both work from the same `frontend/ng-openapi-gen.json`.
- **The dev server and its port.** `mise run storefront` (`ng serve`) binds one
  port, and a browser verification driving it is invalidated by any restart
  underneath. Name the server rather than one command that touches it: a
  restart, a rebuild and a second `ng serve` on the same port all break the same
  thing. An agent that needs a built artifact served uses
  `frontend/scripts/serve-static.mjs` on a port of its own, names that port in
  its report, and stops it. Ports leak: measured 2026-09-20, a static server
  started three days earlier was still holding one, its own script file already
  deleted from disk.
- **The database, once the backend runs.** The frontend's own backend is MSW,
  served in-process, so a frontend suite shares no container and no rows, and
  `frontend/projects/storefront/src/mocks/` state lives and dies with each
  suite run. Every root task that starts PostgreSQL, which
  `.claude/rules/session-lifecycle.md` ("Tools and startup") lists, shares one
  container and its data, which the orchestrator starts and stops.
- **The live browser session** a `real-browser-sonnet` agent is driving, which
  any restart of the app underneath it invalidates.
- **A leftover spec file, which the suite collects and the gate does not.** A
  `*.spec.*` file a finished agent left behind matches the `include` glob in
  `frontend/angular.json`'s unit-test target, so the next suite run executes it,
  while `coverageExclude` in that same target excludes `**/*.spec.ts`, so the
  coverage figures never account for it.
- **The session scratchpad directory**, which every agent in the session writes
  into, under names each chooses without seeing what its siblings chose.
  `.claude/CLAUDE.md` ("Cleanup") makes a temporary file its author's to
  remove, and the resolution here bounds the scope of that removal: only paths
  the agent can name as its own, never a glob over the directory and never a
  time window, which takes in whatever a sibling wrote in the same minutes. One
  agent cleaning up its own working copies by timestamp deleted a sibling's
  `glob-check.mjs` while that sibling was still running; it reported the
  deletion and had nothing to restore the file from. Such a loss leaves nothing
  in the tree, so the `git status --short` read after the batch cannot find it.
- **The dependency files**: `frontend/package.json` and
  `frontend/package-lock.json`. An install
  rewrites them for everyone, and every worktree here shares one `node_modules`
  through a symlink, so an install in one reaches all of them. They are one
  agent's at a time whatever files that agent otherwise owns.
- **An exported symbol crossing an ownership boundary**, and its callers outside
  the owning agent's files. One agent rebuilt the internals of
  `applyPlanContentUpdate`, which had four callers outside the files it owned,
  while a sibling was about to import from the same module.

## What a collision is answered with

A collision the pre-flight finds is resolved before the batch goes out, and
there are three ways to resolve one: the contended resource goes to a single
agent and comes out of every other prompt; the units run in sequence rather than
at once; or the orchestrator performs the contending step itself, between the
two halves of the batch. The third is not a general licence to take work back
from an agent, since `.claude/CLAUDE.md` ("How I work") leaves the orchestrator
only the exceptions it names; it is available
for a step another rule has already put there, which covers most of the list
above: the gates (`.claude/rules/code-standards.md`, "A subagent's green report
is not a run") and starting and stopping the app and the database
(`.claude/rules/browser-verification.md`). Which of the three fits is a
judgment about the work. What is never the answer is a warning about a
contended resource added to each prompt, since the agent reading it cannot see
the thing it is being warned about; the file boundary is the opposite case and
does belong in the prompt, per `model-routing` item 8.

An instruction already sent that this check would have caught is repaired by
messaging the agent rather than by letting it run on. `task-execute-workflow`
("The unit loop", step 3) owns that repair and the test that separates it from
a new requirement, and the `stateVectorCovers` crossing above is the case it
was written from.

## After the batch returns

Before the gates run, read `git status --short` against the file lists the
pre-flight produced. A modified or untracked file no prompt named is a leftover
from the batch rather than a mystery, and the two collectors above pick such
files up between them: one finished agent's `__probe-ssr.spec.tsx` and four
`zz-probe*.mts` files sat in the tree, the spec waiting for the suite and the
probes for the coverage gate. Having the lists already written is what makes
that read one line of work instead of an investigation.
