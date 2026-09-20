# FIX-37 — Rewrite AGENTS.md

Status: DONE — b400b5c, 5791a90 (prettier formatting fixup). Rewrote AGENTS.md as a short, MiBolt-specific file carrying the design-skill mandate and pointers to the files that own the rest. Open: FIX-37-AC06's second-reader read-back was not performed by a fresh instructions-opus instance — the executing session had no Agent tool to spawn one; it performed its own re-read instead, which is named as a gap rather than presented as satisfying the criterion.
Severity: blocker
Source: A7 F3 (RQ02 unmet, T00-AC04 unreached); binding decision **D4**

## Why this is wrong

`AGENTS.md` is the file every agent working in this repository reads first, and it
contains almost nothing about this repository. Its first 432 lines are a byte-for-byte
copy of the orchestrating session's own `.claude/CLAUDE.md` — Linear conventions,
the `ListAgents` cleanup passage, the shared-memory CLI, the model-routing table — and its
last 59 lines are a byte-for-byte copy of the root `CLAUDE.md`. Nothing in it is MiBolt
guidance that is not already in another file two directories away.

The consequence is a failed acceptance criterion, not just untidiness.
`docs/tasks/T00.md:47` (**T00-AC04**) requires "AGENTS.md explicitly makes mi-bolt-design
mandatory for EVERY implementation and verification, including nonvisual tasks with
reasoned not-applicable R-rules", and `grep -n "mi-bolt-design" AGENTS.md` returns zero
hits. `docs/spec/execution-rules.md:3` asks for a file "created or carefully merged in
T00"; what landed reads as an accidental whole-file merge.

**D4** settles what happens: rewrite `AGENTS.md` as a MiBolt project file carrying the
mandatory skill clause and this project's own guidance, and nothing that belongs to the
orchestrator's operating rules.

## Evidence

### The copy, measured

```bash
$ wc -l AGENTS.md .claude/CLAUDE.md CLAUDE.md
     492 AGENTS.md
     440 .claude/CLAUDE.md
      59 CLAUDE.md

$ diff <(head -432 AGENTS.md) <(head -432 .claude/CLAUDE.md) && echo IDENTICAL
IDENTICAL

$ diff <(sed -n '434,492p' AGENTS.md) CLAUDE.md && echo IDENTICAL
IDENTICAL

$ sed -n '433p' AGENTS.md | wc -c
1
```

So `AGENTS.md` = `.claude/CLAUDE.md` lines 1–432, one blank line, then the whole of the
root `CLAUDE.md`. It is two copies joined, with no original content of its own.

`AGENTS.md:1` still carries the other file's title:

```markdown
# CLAUDE.md

My operating rules for the mi-bolt workspace, written for the orchestrating
main session. A spawned subagent also loads this file: it follows everything
here except "How I work", does its assigned task itself, and reports back.
```

That paragraph describes a session-level operating contract. It does not describe an
Angular repository, and the sections that follow it — Linear issue conventions, the
`ListAgents` cleanup passage, the shared-memory CLI, the model-routing table, the
AskUserQuestion rules — belong to whoever is orchestrating, not to whoever is writing
Angular code here.

### What the copy dropped

`.claude/CLAUDE.md` has **440** lines; the copy took **432**. The eight lines it left
behind are exactly the ones this repository needed, `.claude/CLAUDE.md:433-440`:

```markdown
## Design skill mandate

The `mi-bolt-design` skill is mandatory for every implementation and every verification
step in this workspace, including nonvisual work such as build, API and
test-infrastructure tasks. The skill is installed separately and is not part of this
repository's documentation; the resolved path, approved version and SHA-256 are recorded
in `docs/mi-bolt/execution/skill-location.json`, which is the only source of truth for
those values.
```

This is the failure `.claude/rules/session-lifecycle.md` describes under "The copy is what
drifts, not the original": a restatement loses a piece of the original and nobody notices,
because the restatement reads complete. Here the piece it lost is the whole reason
`AGENTS.md` exists.

```bash
$ grep -c "mi-bolt-design" AGENTS.md CLAUDE.md .claude/CLAUDE.md
AGENTS.md:0
CLAUDE.md:0
.claude/CLAUDE.md:1
```

### Why the fix is not "paste the missing section in"

Adding the eight lines would satisfy T00-AC04 and leave 491 lines of duplicated text
behind, which is the defect this task is here to remove. Two of the three rule files that
`AGENTS.md` copies are already loaded by any Claude session from their own location, so
the copy adds a second text that drifts and never adds a rule. And a non-Claude agent
reading `AGENTS.md` is handed a session-management contract it cannot act on — Linear
comments, `ListAgents`, `TaskStop`, spawn routing — in place of the Angular and MiBolt
guidance it came for.

## What to change

Replace the whole of `AGENTS.md`. The new file is short, and it points rather than copies.
It must contain these five things and no more.

### 1. What this file is

One paragraph: `AGENTS.md` is the entry point for any agent doing work in the MiBolt
repository; the specification lives under `docs/`; the file states the rules that are
specific to this repository and names the file that owns each of the others.

### 2. The design-skill mandate — the clause T00-AC04 requires

This is the reason the file exists and it is written out here in full rather than pointed
at, because T00-AC04 requires `AGENTS.md` itself to say it:

> Using the separately installed **`mi-bolt-design`** skill is strictly mandatory for
> every implementation and for every verification or review in this repository, without
> exception. This includes nonvisual work — build, API, mock, test-infrastructure and
> documentation tasks. Read the skill and its task-relevant references before
> implementation, and independently again before acceptance.
>
> The skill's `## 26 Verifiable Rules` table (R01–R26) is the audit checklist for every
> task. Each task records the applicability and outcome of every relevant R-rule. A
> nonvisual task may mark individual visual rules **not applicable**, but each N/A carries
> a one-sentence reason; silent omission is not a reason.
>
> The resolved path, approved version and SHA-256 of the installed skill are recorded in
> `docs/mi-bolt/execution/skill-location.json`, which is the only source of truth for
> those three values. Do not copy, reinstall, recreate or embed the skill inside this
> repository. A missing skill is a blocker, not permission to invent its content.

Add one sentence of fact, not of aspiration: **that file does not exist yet, and `FIX-38`
creates it.** Until it does, name `.claude/skills/mi-bolt-design/` as the installed
location and say the provenance is unverified. Writing "recorded in skill-location.json"
with no such file is the kind of claim `docs/spec/execution-rules.md:19` forbids: "Never
claim a planned test has run." If `FIX-38` has already landed when this task runs, drop
the caveat and keep the pointer.

### 3. Pointers, one line each, to the files that own the rest

| Subject | Owner |
|---|---|
| TypeScript, Angular, component, state, template and service conventions | the root `CLAUDE.md` |
| The execution contract and the non-negotiable engineering boundaries | `docs/spec/execution-rules.md` |
| Architecture, screens, components, testing, acceptance | `docs/spec/` |
| The wire contract | `docs/api/openapi.yaml` |
| Task packets and the dependency graph | `docs/tasks/` |
| The repair package for the defects found in the audit | `docs/fix/` |
| Visual references and the clickable prototype | `docs/design/` |

Do **not** restate what any of those say. The root `CLAUDE.md` is in the same directory as
`AGENTS.md`, so a pointer to it resolves for any agent, Claude or not.

### 4. The three repository facts that no document owns

- The package manager is **npm**, pinned by `package.json`'s `packageManager` field
  (`npm@11.17.0`). There is no pnpm and no `mise` configuration in this repository, so
  every command in every document here is a bare `npm run …`.
- The mock API is **MSW running as a service worker in the browser**, not a server.
  `src/mocks/repository.ts` is page-side memory; there is no backend to ask.
- The demo persists nothing real: no order is placed, no payment is taken, no email is
  sent, and every product and price is fictional demo data that must stay labelled as such.

### 5. What must not be in the file

State it, in the file, so the next merge does not undo this task:

> This file carries repository guidance only. Session-management rules — model routing,
> subagent spawning, task tracking, Linear conventions, shared memory, retrospectives —
> belong to the harness configuration that owns them and are not copied here. A rule that
> already lives in another file is pointed at, never restated: a second copy drifts from
> the original and the drift is invisible.

### Files this change touches

`AGENTS.md`, and nothing else.

## Out of scope

- **Do not edit `.claude/CLAUDE.md`, the root `CLAUDE.md`, or anything under
  `.claude/rules/`.** They are correct where they are. This task removes a copy; it does
  not touch the originals.
- **The second half of D4 is withdrawn and no task covers it.** The `.claude/rules/` files
  were supplied by the user directly and all five exist. Do not create them, do not
  mention them as outstanding, and do not treat their absence as a finding.
- **`FIX-38`** owns creating `docs/mi-bolt/execution/skill-location.json`. This task names
  the file and states honestly that it is absent; it does not create it.
- **`FIX-39`** owns the deletion of `scripts/check-traceability.mjs` under decision
  **D17**. Under D1 this task does not touch `docs/tasks/T00.md`, so T00-AC04's own text is
  not this task's to change; this task only makes the fact that text describes true of
  `AGENTS.md`, which is what AC01 checks.
- **`FIX-05`** owns adding the `engines` field to `package.json`. This task mentions the
  package manager in prose and changes no JSON.
- Do not add a style rule, a lint rule or an architectural constraint that is not already
  in the root `CLAUDE.md` or in `docs/spec/`. This task copies less; it invents nothing.

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm.

```bash
grep -c "mi-bolt-design" AGENTS.md
```

Expected: at least `1`. Measured at `0` on commit `db6d295`.

```bash
diff <(head -432 AGENTS.md) <(head -432 .claude/CLAUDE.md)
```

Expected: a diff, and a large one. This command exited `0` — meaning identical — on
`db6d295`.

```bash
grep -n "Linear\|ListAgents\|TaskStop\|AskUserQuestion\|model-routing\|shared-memory\|retrospective" AGENTS.md
```

Expected: no output, other than a line inside the "What must not be in the file" paragraph
that names those subjects in order to exclude them.

```bash
wc -l AGENTS.md
```

Record the number. There is no target: a line count nobody measured would be an invented
gate, which `.claude/rules/planning-deliverables.md` forbids. What is measured is that the
duplication is gone, by the `diff` above.

```bash
npm run build
```

Expected: `0`, unchanged from the `db6d295` baseline. `AGENTS.md` is prose; the build does
not read it, and there is no citation-based traceability gate left to run alongside it —
decision **D17** removes it.

## Acceptance criteria

- [ ] **FIX-37-AC01** `grep -c "mi-bolt-design" AGENTS.md` returns a number greater than
      `0`, and the file states in its own words that the skill is mandatory for **every**
      implementation and **every** verification, that nonvisual tasks are included, and
      that an N/A R-rule carries a one-sentence reason. Those three clauses together are
      what `docs/tasks/T00.md:47` (T00-AC04) asks for; a reader checking this criterion
      reads that line and then reads `AGENTS.md`.
- [ ] **FIX-37-AC02** The new `AGENTS.md` is written, not copied, and both halves of this
      criterion are deterministic — nothing is picked "at random" and no line-count
      threshold is asserted, because no such number comes from the user, this task or a
      rule file (`.claude/rules/planning-deliverables.md`).

      **(a) No section of it is lifted.** Take the **first sentence** of each of the four
      sections "What to change" items 1–4 prescribe — *What this file is*, *The
      design-skill mandate*, *Pointers to the files that own the rest*, and *The three
      repository facts that no document owns* — and run, for each,
      `grep -Fc "<that sentence>" .claude/CLAUDE.md CLAUDE.md`. All eight counts are
      `0`. Quote the four sentences and the eight counts in the commit body.

      **(b) The overlap is measured and recorded, not gated.** Run
      ```bash
      comm -12 <(grep -vE '^[[:space:]]*$' AGENTS.md | sort -u) \
               <(grep -vE '^[[:space:]]*$' .claude/CLAUDE.md | sort -u)
      ```
      and put its full output and its line count in the commit body, then the same
      against the root `CLAUDE.md`. There is no pass/fail number here on purpose: the
      criterion is that the measurement was run and that a reader can see what the two
      files still share. A heading, a bullet marker or a fence that appears in both is
      not evidence of a copy; a run of prose sentences is, and this output is what makes
      that visible to whoever reads the commit.

      The old `head -432` diff is deliberately gone: this task shrinks the file, so
      `head -432` is the whole of it and the diff exits non-zero whatever the content is.
- [ ] **FIX-37-AC03** `AGENTS.md` contains no section about model routing, subagent
      spawning, task tracking, Linear, shared memory, retrospectives, `ListAgents`,
      `TaskStop` or `AskUserQuestion`, other than the single paragraph that names them in
      order to exclude them.
- [ ] **FIX-37-AC04** Every path `AGENTS.md` names resolves. Run `ls` on each one; the
      list must include `CLAUDE.md`, `docs/spec/execution-rules.md`, `docs/api/openapi.yaml`,
      `docs/tasks/`, `docs/fix/`, `docs/design/` and `.claude/skills/mi-bolt-design/`. The
      one path that is allowed not to resolve is
      `docs/mi-bolt/execution/skill-location.json`, and the file says so in the same
      sentence that names it.
- [ ] **FIX-37-AC05** `AGENTS.md` names no npm script outside the eleven survivors of
      decision **D17**/**D19 item 3**: `ng`, `start`, `build`, `watch`, `test`, `lint`,
      `format`, `format:check`, `build:e2e`, `api:generate`, `api:drift`. Check with
      `grep -oE 'npm (run [a-z0-9:_-]+|start\b)' AGENTS.md | sort -u`, whose every line
      names one of those eleven or is bare `npm run` with no script name. `npm run build`
      exits `0`, unchanged from the `db6d295` baseline.
- [ ] **FIX-37-AC06** **A second reader reads the file back before it is accepted.** The
      deliverable is an instruction file whose wording steers every later session and
      nothing tests it, so `.claude/rules/session-lifecycle.md` ("Instruction file review")
      applies: a reader who did **not** write the file reads it cold, end to end, as the
      next agent will, and reports what it found. The read-back is not the author going
      over the draft again. Two questions decide it: does the file, read with no other
      context, tell an agent that the skill is mandatory and what to do about a rule that
      does not apply; and is there any sentence in it whose rule already lives in another
      file. Record the reader's report, or its verdict and who gave it, in the commit body.
- [ ] **FIX-37-AC07** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** `AGENTS.md` is a markdown instruction file at the
      repository root with no rendered surface: it is not served, not imported, not built
      into `dist/`, and no route displays it. That is the exemption
      `.claude/rules/browser-verification.md` grants to "a doc with no rendered output".
      Per that rule the exemption is stated explicitly rather than left out silently.
- [ ] **FIX-37-AC08** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body. **R26** is applicable and met: the commit body identifies the file
      changed, every command in "How to verify" and their outputs, the second reader's
      verdict, and the missing `skill-location.json` as a stated remaining limitation
      handed to `FIX-38`. **R01–R25 are N/A**, and one sentence covers them all: this task
      rewrites a markdown instruction file and changes no application surface, token,
      component, state, label or data source. Record that sentence rather than omitting
      the rules. There is a particular irony in this task's own R-rule record, and it is
      the point: the file being written is the one that makes this record mandatory for
      everyone else.
      Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
      the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-36`, `FIX-38` or any other FIX
task. Commit only after every acceptance criterion above passes, including the second
reader's read-back.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
docs: rewrite AGENTS.md as MiBolt project guidance with the skill mandate
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
