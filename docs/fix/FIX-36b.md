# FIX-36b — Correct the 31 task packets' `docs/mi-bolt/…` path citations

Status: PLANNED — not executed.
Severity: major
Source: A7 F7; binding decisions **D2** and **D9**

## Why this is wrong

The 31 task packets under `docs/tasks/` cite a directory tree that does not exist. Every
one of them tells its executor to read `docs/mi-bolt/spec/acceptance.md`,
`docs/mi-bolt/spec/testing.md`, `docs/mi-bolt/api/openapi.yaml` and
`docs/mi-bolt/tasks/test-scenarios.json`. The real layout is flat —
`docs/{spec,api,design,tasks,index.html}` plus `docs/mi-bolt/execution/` — so **226 path
citations across 31 files point at directories that are not there**. A packet is a
work order handed to an executor who has never seen this repository; a citation that
resolves to nothing is the first instruction that executor cannot follow.

This is a settled decision, not an open question:

- **D2 — keep the flat layout and correct the documentation.** Do not move `spec/`,
  `api/`, `design/`, `tasks/` or `index.html`. `docs/mi-bolt/execution/` stays exactly
  where it is, because `.claude/CLAUDE.md` names that path and the files under it by name.
  The citations are what change, not the directories.

**This task is the second of two.** The user split the original single task:
*"Mindkettő felosztva"* ("split both"). `FIX-36` owns the documentation half —
`docs/README.md`'s tree description, `docs/index.html`, the four broken `path` values in
`docs/design/asset-manifest.json`, the six other documentation files carrying the same
wrong prefix, and every reference to the missing `VEGREHAJTASI-PROMPT.hu.md`. This file
owns the 31 packets and nothing else. The two commits leave a window in which the two
halves of the package disagree; "Where this sits in the stream" below names it and says
why the order is what it is.

## Evidence

### The tree that is cited, and the tree that exists

```bash
$ ls docs/
api  design  fix  index.html  mi-bolt  README.md  spec  tasks
$ find docs/mi-bolt -type f | wc -l
0
$ find docs/mi-bolt -type d
docs/mi-bolt
docs/mi-bolt/execution
docs/mi-bolt/execution/evidence
docs/mi-bolt/execution/evidence/screenshots
```

`docs/mi-bolt/` contains only an empty `execution/` chain. Every piece of content the
packets cite under `docs/mi-bolt/` is one level higher, at `docs/`.

### What a packet citation looks like

`docs/tasks/T21.md:27`:

```text
The full wire contract is `docs/mi-bolt/api/openapi.yaml`; UI/domain interfaces are in
`docs/mi-bolt/spec/components.md` and `docs/mi-bolt/spec/architecture.md`.
```

`docs/tasks/T21.md:31`, `:33` and `:35`:

```text
- [ ] Read this packet, dependency outputs, `docs/mi-bolt/spec/acceptance.md`,
      `docs/mi-bolt/spec/testing.md`, and mi-bolt-design with relevant references.
- [ ] … Use the exact scenarios for test groups: delivery, payment in
      `docs/mi-bolt/tasks/test-scenarios.json`.
- [ ] Run the focused tests, then the project gates documented in
      `docs/mi-bolt/spec/testing.md`; …
```

Each of those five targets exists — at `docs/api/openapi.yaml`,
`docs/spec/components.md`, `docs/spec/architecture.md`, `docs/spec/acceptance.md`,
`docs/spec/testing.md` and `docs/tasks/test-scenarios.json`. Only the prefix is wrong.

### The occurrences that are correct and must survive

`docs/tasks/T21.md:7` and `:37` are **not** defects:

```text
Read the externally installed `mi-bolt-design` skill entrypoint recorded in
`docs/mi-bolt/execution/skill-location.json` (approved version 1.0.1) …
- [ ] Record actual commands, failures/fixes and final outputs in
      `docs/mi-bolt/execution/tasks/T21.md`; …
```

`docs/mi-bolt/execution/` is the one prefix that is right, and `.claude/CLAUDE.md` names
that path and the files under it by name. **72 occurrences across the 31 packets are of
that form and every one of them stays**, including the 33 that name
`skill-location.json`. A sweep that takes them out breaks `FIX-38` and `FIX-40`, which
own creating files at exactly those paths.

### The counts, measured

Measured on commit `db6d295`, the commit the repository is still on:

```bash
$ grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/tasks/T*.md docs/tasks/O01.md \
    | grep -v "docs/mi-bolt/execution" | wc -l
226
$ grep -ro "docs/mi-bolt/execution" docs/tasks/T*.md docs/tasks/O01.md | wc -l
72
```

226 to change, 72 to preserve, across 31 files carrying 7 to 12 wrong citations each;
`docs/tasks/T03.md` is the head at 12. Those 226 are part of the 499 that reach the whole
`docs/` tree: `docs/index.html` holds 253 and six other markdown files hold 20, and both
of those groups are **`FIX-36`'s**.

### Two files that look as though they belong here and do not

1. **`docs/tasks/README.md` carries no wrong prefix at all.** Its only `docs/mi-bolt`
   string is `docs/mi-bolt/execution/progress.json` at `:9`, which is correct and stays.
   It had been listed among the task-directory files to sweep; the measurement says
   otherwise. It is edited by `FIX-36`, for one reason only — the dead prompt link at
   `:5` — and it is not opened here. That is why this task's set is 31 files and not 32.
2. **`docs/fix/**` is excluded from every command in this file.** These task files quote
   the wrong prefix as evidence, so a grep that includes them can never reach `0` and
   would report the package's own evidence as an unfixed defect. Measured with
   `/usr/bin/grep` (BSD grep 2.6.0-FreeBSD): the tree-wide wrong-prefix count is 499 with
   `--exclude-dir=fix` and 516 without it. The flag is available on GNU grep as well.

## What to change

### 1. Scope: the documentation half is `FIX-36`'s

This task edits the 31 task packets and nothing else. `docs/README.md`,
`docs/index.html`, `docs/design/asset-manifest.json`, `docs/tasks/README.md`,
`docs/spec/execution-rules.md`, `docs/spec/architecture.md`, `docs/spec/testing.md`,
`docs/spec/screens.md`, `docs/spec/sources.md` and `docs/api/README.md` belong to
`FIX-36` and are already corrected by the time this runs.

### 2. Sweep the wrong prefix out of the 31 packets

The rule: **`docs/mi-bolt/` becomes `docs/` everywhere except where the next segment is
`execution`.** Applied to `docs/tasks/T00.md`–`T29.md` and `docs/tasks/O01.md`.

A three-step substitution does it, protecting the exclusion first. Run it **per file**,
and read the result before moving on:

```bash
sed -i '' \
  -e 's|docs/mi-bolt/execution|@@KEEP@@|g' \
  -e 's|docs/mi-bolt/|docs/|g' \
  -e 's|@@KEEP@@|docs/mi-bolt/execution|g' \
  <file>
```

Three things the executor needs before running it:

- **The `-i ''` form is macOS/BSD `sed`. GNU `sed` wants `-i` with no argument.** Check
  which one is on the machine before running it over 31 files.
- **The command has not been run in place against any file.** Its substitution logic was
  dry-run on 2026-09-17 against `docs/tasks/T03.md` without `-i`, printing to stdout and
  writing nothing: the result held 0 wrong prefixes, both of that file's `…/execution`
  strings survived, no `@@KEEP@@` marker was left behind, and `git status --short` stayed
  empty afterwards. The logic is checked; the in-place run is not. AC01 and AC02 below are
  the gate, not the command.
- **Not every occurrence is inside backticks.** `docs/tasks/T00.md:46` writes
  `docs/mi-bolt/execution/skill-location.json` as bare prose inside an acceptance
  criterion. The substitution is on plain text and catches it; a hand-edit that only looks
  at code spans would not.

Nothing else in these files changes. No requirement, no acceptance criterion, no
dependency, no task title, no Hungarian copy. **The prefix is the entire diff.**

### Files this change touches

`docs/tasks/T00.md` through `docs/tasks/T29.md` and `docs/tasks/O01.md` — 31 files.

No source file, no configuration file, no file under `docs/fix/`, and no file under
`src/`, `tests/`, `e2e/`, `scripts/` or `public/` is touched.

## Out of scope

- **The documentation half — `FIX-36`.** `docs/README.md`, `docs/index.html`,
  `docs/design/asset-manifest.json`, `docs/tasks/README.md` and the five `docs/spec` and
  `docs/api` files are that task's. Do not edit one of them here, and do not re-run the
  sweep over the whole `docs/` tree "to be safe": it would put this task's commit on top
  of the other's files.
- **Do not move any directory.** D2 settles this. `spec/`, `api/`, `design/`, `tasks/` and
  `index.html` stay where they are, and `docs/mi-bolt/execution/` stays where it is.
- **Do not touch a `docs/mi-bolt/execution/…` string.** `FIX-38` owns creating
  `docs/mi-bolt/execution/skill-location.json` and `FIX-40` owns
  `docs/mi-bolt/execution/deployment.md` and the T29 handover files. Every one of those
  citations is a correct forward reference to a file another task creates. Leaving them
  untouched is what makes those two tasks possible.
- **The content of any packet.** A packet whose acceptance criteria are wrong, whose
  dependencies are wrong, or whose scenarios do not exist is not this task's to repair.
  `FIX-39` owns writing the missing assertions and removing the skipped specs that leave
  acceptance criteria unreached. Record what you notice in the commit body and change
  nothing but the prefix.
- **`docs/tasks/tasks.json`, `requirements.json`, `test-scenarios.json` and
  `project-acceptance.json`.** `tests/checkout-state.spec.ts` and other specs read these
  directly, they carry no `docs/mi-bolt/` prefix, and a change to one of them would move
  numbers other tasks and tests depend on. Do not open them.
- **Under D1 no task may edit a spec document to match the implementation.** This task
  edits planning documents, and that is not a breach: D2 is one of the two carve-outs the
  user settled individually, and it is "about where files sit and which links exist, not
  about what the product does".

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm. Every grep
excludes `docs/fix/` for the reason given in the Evidence section.

```bash
grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/ --include="*.md" --include="*.html" \
  --exclude-dir=fix | grep -v "docs/mi-bolt/execution" | wc -l
```

Expected: `0`. `docs/spec/testing.md:9`, the one occurrence `FIX-36` deliberately leaves
in place, is not part of this residue: **FIX-47** runs in Phase A, before either
path-sweep task's Phase G, and rewrites that line first (`FIX-47 — Prune the npm scripts
to the standard commands of the stack`). Measured at `499` on `db6d295`; `FIX-47` removes
1, `FIX-36` removes 272 and this task removes the remaining 226. **This is the check that
neither path-sweep commit can pass alone**, which is why it lives here, in the one that
runs second.

```bash
grep -ro "docs/mi-bolt/execution" docs/tasks/T*.md docs/tasks/O01.md | wc -l
grep -ro "docs/mi-bolt/execution/skill-location.json" docs/tasks/ --include="*.md" | wc -l
```

Expected: `72` and `33`, both unchanged from the baseline. This is the guard that proves
the exclusion held and no correct forward reference was swept away with the wrong ones.

```bash
for f in docs/tasks/T*.md docs/tasks/O01.md; do
  grep -o 'docs/[A-Za-z0-9._/-]*' "$f" | grep -v '^docs/mi-bolt/execution' | sort -u \
  | while read -r t; do [ -e "$t" ] || echo "MISSING $f -> $t"; done
done
```

Expected: no output. Every `docs/…` path the packets cite, other than the deliberate
`…/execution` forward references, resolves to a file or directory that exists. This
command was dry-run on `db6d295` against the substituted text and printed nothing, so a
correct sweep reaches this state; run it after the sweep to confirm the sweep was correct.

There is no citation-based traceability gate to run: decision **D17** removes it. Nothing
in this task's diff reaches `docs/tasks/requirements.json`, `docs/tasks/test-scenarios.json`
or `docs/tasks/tasks.json` — only the 31 `docs/tasks/Txx.md` / `O01.md` packets — so no
command is needed to prove those files untouched; FIX-36b-AC06's `git status --short` check
below is what proves it.

```bash
npm run build
```

Expected: `0`, unchanged from the `db6d295` baseline. It does not read the task packets;
it is here to prove this commit touched nothing that builds.

Gates that are red for reasons this task does not fix, so the executor does not chase them:
`npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the
coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do
not run `npm run api:drift` or `npx playwright test` while working on this task: both
rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-36b-AC01** `grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/tasks/T*.md
      docs/tasks/O01.md | grep -v "docs/mi-bolt/execution" | wc -l` prints `0`, down from
      the measured baseline of `226`.
- [ ] **FIX-36b-AC02** The tree-wide check reaches `0`:
      `grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/ --include="*.md" --include="*.html"
      --exclude-dir=fix | grep -v "docs/mi-bolt/execution" | wc -l` prints `0`. `grep -rn
      "docs/mi-bolt\([^/]\|$\)" docs/ --include="*.md" --include="*.html"
      --exclude-dir=fix` prints nothing. `--exclude-dir=fix` is load-bearing: without it
      the first count is non-zero and always will be, because the `docs/fix` task files
      quote the wrong prefix as evidence of the defect they exist to remove. This
      criterion requires `FIX-36` to have landed first, and **FIX-47** to have already
      rewritten `docs/spec/testing.md:9` — true by construction, since FIX-47 runs in
      Phase A and both path-sweep tasks run in Phase G.
- [ ] **FIX-36b-AC03** `grep -ro "docs/mi-bolt/execution" docs/tasks/T*.md
      docs/tasks/O01.md | wc -l` prints `72` and
      `grep -ro "docs/mi-bolt/execution/skill-location.json" docs/tasks/ --include="*.md"
      | wc -l` prints `33` — both unchanged from the baseline. No correct forward
      reference was swept away.
- [ ] **FIX-36b-AC04** The path-resolution loop in "How to verify" prints nothing: every
      non-`execution` `docs/…` path cited by the 31 packets resolves on disk.
- [ ] **FIX-36b-AC05** `git diff -- docs/tasks/T00.md docs/tasks/T01.md … docs/tasks/T29.md
      docs/tasks/O01.md` (all 31 packets) shows only lines in which a `docs/mi-bolt/…`
      string became a `docs/…` string: no line naming a `Txx-ACyy` acceptance criterion, a
      dependency, a task title, a wave number or any Hungarian prose text changes. A path
      sweep must move no requirement content.
- [ ] **FIX-36b-AC06** `git status --short` lists exactly 31 files, all of them
      `docs/tasks/T00.md`–`T29.md` or `docs/tasks/O01.md`. `docs/tasks/README.md`,
      `docs/tasks/*.json`, every file under `docs/fix/`, every file `FIX-36` owns, and
      every file under `src/`, `tests/`, `e2e/`, `scripts/` and `public/` is unmodified.
      `git diff --stat` shows only lines in which a path string changed; quote the diff
      of one packet in full in the commit body as the sample.
- [ ] **FIX-36b-AC07** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change edits 31 markdown planning documents.
      None of them is served, imported, routed to, or built into `dist/`, and no rendered
      surface changes. That is the exemption `.claude/rules/browser-verification.md`
      grants to a documentation edit, and per that rule it is stated explicitly rather
      than left out silently. The check was made rather than assumed: `docs/index.html`
      **is** a rendered surface and it carries the same wrong prefix, but this task does
      not touch it — `FIX-36` does, and that task carries the real-browser criterion for
      it.
- [ ] **FIX-36b-AC08** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body. **R26** is applicable and met: the commit body identifies all 31
      files, every verification command with its measured output, the before-and-after
      counts 226 → 0 and 72 → 72, and any packet-content problem noticed and deliberately
      left to `FIX-39` as a stated remaining limitation. **R01–R25 are N/A**, and one
      sentence covers them all: this task rewrites path strings inside planning documents
      and changes no application surface, token, component, state, label or data source.
      Record that sentence rather than omitting the rules. Skill provenance is stated once
      in `docs/fix/README.md` section 3, "Every task records the design rules": the
      installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit across the 31 task packets. Do not bundle it with
`FIX-36`, `FIX-38`, `FIX-40` or any other FIX task. `FIX-36` in particular is a separate
commit because the user asked for the original task to be split — *"Mindkettő felosztva"*
("split both") — so folding the two back together undoes the decision this file exists to
carry out. It is a large diff and it is still one logical change: every edit is the same
correction, applied everywhere it applies. Commit only after every acceptance criterion
above passes.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
docs: correct the task packets' docs/mi-bolt path citations
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**`FIX-36` must land first, and this task depends on it.**

Between the two commits the package contradicts itself: `docs/README.md` and
`docs/index.html` describe the flat layout that exists, while these 31 packets still tell
their executor to read `docs/mi-bolt/spec/architecture.md`, which does not. The user
accepted that window when they chose smaller commits over a consistent intermediate state.
It is not pretended away, and it is not a reason to widen either task.

The order is what makes the window least harmful, and the reason is which document a
reader opens first. `docs/README.md` is the package's entry point and `docs/index.html` is
its rendered report; once those tell the truth, a reader is correctly oriented and can
recognise a packet's `docs/mi-bolt/spec/…` citation as the stale form. The reverse order
leaves the entry point lying while the packets are right, so a reader who starts where
readers start is misled and then mistrusts the half that is already correct. The packets'
wrong paths are also the state the repository has been in all along, so leaving them one
commit longer breaks nothing that was not already broken.

AC02 above is the second, harder dependency: the tree-wide check that no wrong prefix
survives anywhere under `docs/` outside `docs/fix/` cannot pass until both commits have
landed. It belongs to whichever runs second, and that is this one. `FIX-36` deliberately
leaves one occurrence, `docs/spec/testing.md:9`, untouched — see `FIX-36`'s Evidence
section, "One line this task deliberately does not sweep" — but that line is not part of
AC02's residue: **FIX-47** runs in Phase A, before either path-sweep task's Phase G, and
has already rewritten it (`FIX-47 — Prune the npm scripts to the standard commands of the
stack`). AC02 above is written to expect `0` for exactly this reason.

The two commits should land back to back. Nothing else in the package needs to run
between them.
