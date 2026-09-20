# FIX-53 — Write one honest acceptance summary instead of 31 empty-verdict files

Status: DONE — 5162b86. Created docs/mi-bolt/execution/acceptance-summary.md with all 161 criteria; found the repository far ahead of every FIX document's cited db6d295 baseline (build/lint/test all green). Zero criteria are marked "met" — no per-criterion browser or targeted-test verification was performed (no Agent tool available to spawn real-browser-sonnet), so nearly every row reads "not verified" with that reason stated, per the reason honestly stated in the document itself.
Severity: major
Source: A7 (release, traceability and governance sweep), `.claude/CLAUDE.md` ("Design skill mandate"), every task packet's own `## Independent test/review cycle` and `## Evidence record` sections; decision **D19 item 4**

## Why this is wrong

`.claude/CLAUDE.md` makes one record per task mandatory:

> The skill's `## 26 Verifiable Rules` table (R01–R26) is the audit checklist for
> every implementation. Each task records the applicability and outcome of every
> relevant R-rule in its review file under `docs/mi-bolt/execution/tasks/Txx.md`. A
> nonvisual task may mark individual visual R-rules N/A, but each N/A carries a
> one-sentence reason in the same file; silent omission is not a reason.

Every one of the 31 task packets repeats the requirement in its own words, and every
one names its own file. None of the 31 files exists. The directory they belong in
does not exist either.

That is not a paperwork gap. Without a record there is no statement of which
acceptance criteria were actually met, which commands were actually run, and which
R-rules were checked against a rendered screen — and `docs/spec/execution-rules.md:19`
is explicit about what that absence means:

> Never claim a planned test has run. Evidence must name commands, revisions,
> viewports, outputs and remaining limitations.

**This task is execution work, not a documentation chore, and the distinction decides
how it is done.** A record is a statement about what was measured. It cannot be
written from the task packet, from the source, or from this file; it can only be
written from commands that were run and screens that were looked at. Most of this
repository's gates are red at baseline, so most of these entries will say that a
criterion is **not met** and name the FIX number that owns it. That register — 161
acceptance criteria, each with a measured verdict and an owner — is the deliverable,
and it is the thing nobody in this project can currently produce.

**Decision D19 item 4 changes the shape of that deliverable, not its content.** This
file originally specified 31 separate record files plus a template — one per task,
matching `.claude/CLAUDE.md`'s literal wording above. This file's own earlier text
already conceded the honest reading of that shape: *"the honest deliverable of this
task is 31 records whose verdicts are measured and whose gaps are named — not 31
records of verified work."* Thirty-one mostly-red files, each carrying its own copy of
an eight-section template, is the apparatus `.claude/rules/planning-deliverables.md`
warns against: "A check that restates a workspace rule becomes a pointer to that
rule." The user's answer, given directly — **"FIX-53: 31 helyett 1 összegző"**
("FIX-53: one summary instead of 31") — keeps every criterion, every verdict and every
owner, and removes only the file-per-task packaging. **This is a decision about this
task's own deliverable shape, not an edit to `.claude/CLAUDE.md` or to any of the 31
packets**, and it does not relieve a task that is genuinely, individually implemented
and verified later from writing its own real
`docs/mi-bolt/execution/tasks/Txx.md` per `.claude/CLAUDE.md`'s rule — this summary is
the audit-time gap register that exists because none of the 31 tasks has that real
record yet, not a permanent substitute for it.

## Evidence

### Nothing exists under the execution directory

```
$ find docs/mi-bolt -type d -o -type f
docs/mi-bolt
docs/mi-bolt/execution
docs/mi-bolt/execution/evidence
docs/mi-bolt/execution/evidence/screenshots
$ find docs/mi-bolt -type f | wc -l
       0
```

Four empty directories. There is no `tasks/` directory, no record, no screenshot and
no `skill-location.json`.

### All 31 packets require it, each naming its own file

```
$ grep -ln "docs/mi-bolt/execution/tasks/" docs/tasks/*.md | wc -l
      31
$ grep -h -o "docs/mi-bolt/execution/tasks/[A-Z0-9]*\.md" docs/tasks/*.md | sort -u | wc -l
      31
```

Thirty-one packets, thirty-one distinct record paths: `T00.md` through `T29.md` plus
`O01.md`. This task's summary carries the content each of those thirty-one citations
asks for; it does not create thirty-one files at the paths they literally name. Say so
in the summary's own preamble, so a reader who follows one of those 31 citations is
told where the content actually is rather than finding nothing.

Each packet asks for it twice. `docs/tasks/T21.md:37`, in its
`## Independent test/review cycle`:

> - [ ] Record actual commands, failures/fixes and final outputs in
>   `docs/mi-bolt/execution/tasks/T21.md`; commit a single independently reviewable
>   deliverable after acceptance.

and `docs/tasks/T21.md:49`, its shared criterion **T21-G01**:

> Read the resolved external mi-bolt-design/SKILL.md and its task-relevant references
> before implementation AND independently before verification. Record skill version,
> R01–R26 applicability, files, viewports and evidence in the task review.

and `docs/tasks/T21.md:56-58`, which is the shape the content has to fill:

> ## Evidence record (must be populated by the implementer)
>
> Record source revision, exact dependency versions, skill hash, input scenarios,
> command and exit status, independent unit/E2E metrics, applicable
> screenshots/viewports, defect list and reviewer decision. This planning package
> deliberately contains no invented passing metrics or completed-task status.

Every packet carries all three, with its own number substituted.

### The scale, measured

```
$ python3 -c "
import glob,re
print(sum(len(re.findall(r'\*\*(T\d\d|O01)-AC\d\d\*\*', open(f).read())) for f in sorted(glob.glob('docs/tasks/[TO]*.md'))))"
161
```

161 task-specific acceptance criteria across the 31 packets. Six shared criteria
(`G01`–`G06`) apply to each packet on top of those. Under decision **D17** there is no
`npm run` gate left that measures this same 161 for comparison — the citation-based
traceability script is deleted rather than repaired, argued in `FIX-39` — so this
task's own count is the only register of the 161 until `docs/mi-bolt/execution/
traceability.md` (`FIX-40`'s deliverable, a different numbering: `RQ01`–`RQ20` and
`docs/spec/acceptance.md`'s global `AC01`–`AC28`, not the per-task `Txx-ACnn` set this
task measures) is cross-read against it — see "Cross-check" in What to change, item 5.

### The dependency order is the numeric order — measured

```
$ for f in docs/tasks/T*.md docs/tasks/O01.md; do grep -m1 "^Depends on:" $f; done
Depends on: none.
Depends on: T00.
Depends on: T01.
…
Depends on: T27, T28.
Depends on: T02, T16.
```

Every packet's `Depends on:` line names only lower-numbered tasks, and `O01` depends
on `T02` and `T16`. So `T00 … T29` followed by `O01` is a valid topological order and
no separate ordering has to be derived. Re-run that loop and confirm it before
relying on it.

### One entry is already decided and is not a status report

`O01` is the optional 3D viewer. `docs/spec/execution-rules.md:17` says *"Only O01
(3D) is optional and requires explicit approval"*, `docs/tasks/T16.md:46`
(**T16-AC05**) requires that *"Baseline has no 3D script and no inactive fake 3D
button"*, and decision **D7** records the user's answer: the 3D viewer is **not
approved and is not built**. Under decision **D17**, D7's substance is satisfied by
the traceability gate's own deletion rather than by teaching it a new rule: with no
gate counting `O01`'s criteria as failures, nothing needs to learn that they are
optional. `O01`'s entry in the summary therefore states that outcome and nothing
else; see item 4.

## What to change

Five things, in this order.

### 1. Create `docs/mi-bolt/execution/acceptance-summary.md`

One file, at the top level of `docs/mi-bolt/execution/` — a sibling of
`deployment.md`, `acceptance-report.md`, `traceability.md` and `runbook.md`, which
`FIX-40` creates. Not a `tasks/` subdirectory: with the content consolidated into one
document, a subdirectory holding a single file has no reason to exist. Its opening
section carries, once, what the old per-file template repeated 31 times:

```markdown
# Execution acceptance summary — T00–T29, O01

Recorded: <ISO date>
Source revision: <git rev-parse HEAD>
Recorded by: <agent or person>

This document consolidates the 31 per-task execution records
`.claude/CLAUDE.md` and every task packet's `## Independent test/review cycle` call
for, into one file, per decision D19 item 4 ("FIX-53: 31 helyett 1 összegző"). It
carries the same content each packet's own citation asks for — a verdict, its
evidence and, where unmet, an owner, for every `Txx-ACnn` and `Txx-G0n` criterion —
under one heading per task instead of one file per task. When a task is later
genuinely implemented and independently verified, that task still writes its own real
`docs/mi-bolt/execution/tasks/Txx.md` per `.claude/CLAUDE.md`'s rule; this document is
the audit-time gap register that exists because none of the 31 tasks has that record
yet.

## Skill provenance

Resolved path, version and hash of the `mi-bolt-design` skill used for every
measurement in this document — stated once, here, rather than 31 times. If
`docs/mi-bolt/execution/skill-location.json` (`FIX-38`'s deliverable) exists when
this document is written, cite it. If it does not, cite the installed path
`.claude/skills/mi-bolt-design/SKILL.md` and version `1.0.1` from its own
frontmatter, and state plainly that the file `.claude/CLAUDE.md` calls the only
source of truth for that path, version and hash is absent, naming `FIX-38`.

## Per-task index

| Task | Status | ACs met | ACs not met | ACs not verified | Primary blocking FIX(es) |
|---|---|---|---|---|---|
| T00 | … | … | … | … | … |

One row per task, `T00`–`T29` then `O01`, in that order (see "dependency order" in
Evidence). `Status` is one of: not started / partially delivered / delivered,
unverified / delivered and verified.
```

Then one `## Txx` heading per task (`## T00` through `## T29`, then `## O01`),
holding that task's own criteria table, in the shape:

```markdown
## T00

Files: every file `docs/tasks/T00.md`'s `## Files` section names, with one of:
exists / missing / exists under a different path (naming it).

| Criterion | Verdict | Evidence | Owner of the gap |
|---|---|---|---|
| T00-AC01 | met / not met / not verified | command + exit code, or the browser measurement, or "no evidence" | FIX number, or `—` |

Defects surfaced here that no FIX number owns: <list, or "none">.
Remaining limitations: <what is not known, and what would settle it>.
```

No separate R01–R26 table per task. A full R-rule audit needs the task's own
implementation reviewed at real viewports, which most of these 31 tasks do not have
yet; fabricating 31 tables against work that mostly does not exist would be exactly
the falsified-record failure `docs/spec/execution-rules.md:19` forbids. Where an
audit report (A1–A7) already surfaced an R-rule-shaped defect for a task, cite it by
report and finding number in that task's "Defects" line; do not invent a new
judgement beyond what was already measured. This document's own R01–R26 outcome —
for the commit that writes it, not for the 31 tasks it describes — is recorded in the
commit body, the same way every other `docs/fix` task records it; see "How to verify."

### 2. Write the 161 criteria, in dependency order, from measurement only

Work `T00` first and `O01` last, per Evidence. For each task:

1. Read `docs/tasks/<TASK-ID>.md` — its `## Files`, its `ACnn` list and its `G01`–`G06`.
2. Check each named file on disk and record the result.
3. For every criterion, record a verdict **and the evidence that produced it**. The
   three verdicts mean exactly this and nothing else:
   - **met** — a command was run and its exit code recorded, or a browser measurement
     was taken and recorded. Nothing else counts.
   - **not met** — the same, and the result contradicts the criterion. Name the FIX
     number that owns the gap; if none does, write `unowned` and it goes into that
     task's "Defects" line too.
   - **not verified** — no evidence was gathered. Say why in one clause: the gate is
     red for another reason, the screen cannot be reached, the browser pass was not
     run.
4. Record the defects and the remaining limitations for that task.

**The rules that decide whether this task was done or faked:**

- **Never write a verdict you did not measure.** `docs/spec/execution-rules.md:19`:
  *"Never claim a planned test has run."* A criterion with no evidence is
  **not verified**, and a document full of honest "not verified" rows is a correct
  document. A row that says "met" because the code looks right is a falsified one.
- **Do not run a gate to make the summary greener.** Every gate's baseline is in "How
  to verify"; where a gate is red for a reason another FIX task owns, record the red
  result and the owner. Do not fix anything in `src/`, `tests/`, `e2e/`, `scripts/`
  or `docs/spec/` while writing this document.
- **Do not copy an acceptance criterion's text as its own evidence.** The Evidence
  column holds a command and an exit code, or a measured value, or `no evidence`.

### 3. `O01`'s section is a decision record, not a status report

Write it last and write it short. It records that the optional 3D viewer is **not
approved and not built**, citing `docs/spec/execution-rules.md:17`,
`docs/tasks/T16.md:46` (**T16-AC05**) and decision **D7**; and that `O01-AC01`–`AC06`,
`E125`–`E127` and `RQ18` are therefore **deliberately unreached** rather than failed.
Every `ACnn` row's verdict is `not met — deliberately, O01 is not approved`, with `D7`
in the evidence column.

### 4. What this task does **not** deliver, and must say so in its own output

The full R-rule outcome for a visual task needs a browser pass at the viewports
`docs/spec/testing.md:103` names — 320, 390, 768, 1024, 1440 and 1920 — with a
screenshot per state. Thirty-one of those is not one commit's work and most of them
cannot pass today, because `npx playwright test` has 41 failures and several screens
have defects that other FIX tasks own.

**So the honest deliverable of this task is one document whose 161 verdicts are
measured and whose gaps are named — not a claim that the 31 tasks are verified.** The
per-task index's `Status` column says which state each task is in, using the four
values item 1 declares. A row marked `delivered, unverified` is a true statement; the
same row marked `delivered and verified` without a browser pass behind it is the
exact failure `execution-rules.md:19` forbids.

Say this in the commit body, in one sentence, so the next reader does not mistake the
document's existence for evidence of a verified project.

### 5. Cross-check against the two registers `FIX-40` writes

**`docs/mi-bolt/execution/traceability.md`** is the `RQ01`–`RQ20` and
`docs/spec/acceptance.md` `AC01`–`AC28` mapping — a different numbering from this
task's 161 `Txx-ACnn` criteria, not a duplicate of it. Compare the two registers'
overall pictures in one paragraph: roughly how many are unmet in each, and whether the
same FIX numbers turn up as owners in both. Note any real disagreement as a finding.

**`docs/mi-bolt/execution/acceptance-report.md`** is the one that **is** a duplicate,
and it is the one that must not be left unchecked. `FIX-40.md:327-331` writes it as
"every one of T00–T29 and O01 with its real status and the evidence behind it", which
is the same per-task status this document's own "Per-task index" table carries, reached
by a separate measurement. Two registers of one fact, written by two commits, can
disagree with nothing to catch it. So, task by task, `T00` through `T29` and then
`O01`, compare that file's status against this document's row and record:

- the tasks where the two agree — a count is enough;
- **every** task where they disagree, by name, with both verdicts quoted and one
  sentence on which measurement produced each and why they differ.

**Do not edit `acceptance-report.md` to make it agree.** It is **FIX-40**'s file and its
own commit; `docs/tasks/T29.md:20` names it in the T29 packet's `## Files` list, so
under **D1** it is a deliverable the specification requires and this task neither
replaces nor absorbs it. A disagreement is a finding for the user, recorded here.
`docs/mi-bolt/execution/progress.json` needs no separate pass: `FIX-40.md:353-360`
derives it from the acceptance report, so checking the report checks it.

**If `FIX-40` has not landed** when this document is written, say so and name it for
each of the two files; do not invent numbers from a document that does not exist yet.
In the package's settled order it will have landed: `README.md` section 4, Phase G puts
**FIX-40 second-to-last and FIX-53 last**, precisely so both registers exist by now.

## Out of scope

- **Fixing anything this document surfaces.** This task measures and writes. Every
  defect it finds goes into that task's "Defects" line with its owner, and into the
  report; none is repaired here. If a defect no FIX number owns turns up, write
  `unowned` and report it — that is the outcome this task exists to produce.
- **`docs/mi-bolt/execution/skill-location.json` — `FIX-38`.** Do not create it and
  do not guess the hash.
- **`docs/mi-bolt/execution/deployment.md`, `acceptance-report.md`, `runbook.md`,
  `traceability.md` and `release-manifest.json` — `FIX-40`.** This task's item 5
  **reads** two of them and **writes** none. The distinction from this document is worth
  stating rather than asserting, because one of the five overlaps it:
  `acceptance-report.md` is `docs/tasks/T29.md:20`'s own named deliverable and records,
  per task, whether the release accepts it and on what evidence — the release decision.
  `acceptance-summary.md` is the audit-time register of all **161** `Txx-ACnn`
  criteria, one verdict each, with the FIX number that owns every gap. The second is
  finer-grained and is not a replacement for the first: under **D1** a task may not
  delete a file the specification names, and **D19 item 4** collapsed this task's
  thirty-one **per-task record files**, not FIX-40's T29 deliverable. Where their
  per-task pictures disagree, item 5 records both and neither file is edited to match
  the other.
- **`docs/mi-bolt/execution/design-review.md`**, which `e2e/a11y/keyboard.spec.ts:19-21`
  names as where the keyboard suite's skipped-step count is recorded. No FIX number
  owns that file. Do not create it; report it.
- **`scripts/check-traceability.mjs`.** **`FIX-39`** owns deleting it under decision
  **D17**, along with the citation-based count it used to produce. This task's
  summary is what survives in the gate's place for the 161 task-specific criteria;
  it does not repair, recreate or reference a deleted script.
- **`docs/tasks/*.md` — no edit.** Under **D1** the packets are the specification.
  **`FIX-36b`** owns correcting their `docs/mi-bolt/spec/…` path prefix; this task
  reads them and changes nothing, including the 31 citations each packet makes to its
  own `docs/mi-bolt/execution/tasks/Txx.md` — those citations stay as written, and
  this document's own preamble is where the redirection to the consolidated file is
  stated, not an edit to the packets. If a packet cites a path that does not resolve,
  that is a finding for this document, not an edit.
- **Screenshots.** `docs/mi-bolt/execution/evidence/screenshots/` exists and is
  empty. This document cites a screenshot only if one was taken for it in this run;
  do not populate that directory speculatively and do not copy the design references
  from `docs/design/screenshots/` into it — those are design artefacts, and
  `docs/design/README.md` says in as many words that fresh images from the real
  Angular application are needed.
- **Running `npx playwright test` with no argument.** It rewrites 49 tracked
  screenshots under `e2e/design/screenshots/` and has 41 baseline failures
  (**FIX-09**). This document may cite the measured baseline instead; see "How to
  verify".

## How to verify

Run these from the repository root. The package manager is **npm 11.17.0**; there is
no pnpm and no mise in this repository.

**The measured baseline, taken on commit `db6d295`.** This document may cite these
rather than re-running every gate for all 31 tasks; when it does, it says which
commit it is citing and that it did not re-run the command itself. That distinction
is the difference between a record and a rumour.

| Command | Exit | Result |
|---|---|---|
| `npm run build` | 0 | green |
| `npm run lint` | 1 | never runs — `Data path "" must have required property 'lintFilePatterns'` (**FIX-01**) |
| `npm run test` | 1 | 14/14 files fail, all `ReferenceError: document is not defined` (**FIX-04**), and it carries the coverage thresholds (**FIX-08**) |
| `npx playwright test` | 1 | 41 failed, 8 skipped, 221 passed (**FIX-09**) |

**`npm run api:drift` and `npx playwright test` (with no argument) both dirty the
working tree**, and a summary is not worth a dirty tree: `api:drift` regenerates 27
files under `src/app/api/generated/`, and a full `playwright test` rewrites 49
screenshots under `e2e/design/screenshots/`. If you run either, read
`git status --short` afterwards, record what changed, and leave it out of this
commit's staged paths. Do not use `git restore`, `git checkout --`, `git stash`,
`git reset` or `git clean` (`.claude/rules/session-lifecycle.md`).

**Commands this task does run, for itself:**

```bash
git rev-parse HEAD                              # the source revision this document cites
find docs/mi-bolt -type f | wc -l               # 0 before, 1 after
for f in docs/tasks/T*.md docs/tasks/O01.md; do grep -m1 "^Depends on:" $f; done
```

Where an entry needs a browser measurement, it is taken in a real browser driven
through `mcp__chrome-devtools__*` with the dev server started by `npm start`, per
`.claude/rules/browser-verification.md`. Stop the server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task produces documentation and changes nothing a person can see or click, so
`.claude/rules/browser-verification.md`'s exemption applies to the commit itself and
is claimed here explicitly: no route changes and no rendered surface is altered.**
That exemption covers the commit, not the document's content: an entry that asserts
an R-rule-shaped outcome for a task is asserting a browser measurement, and it may
only do so if that measurement was taken, or if it is citing a specific finding an
audit report (A1–A7) already made. Where neither holds, the row reads
**not verified**.

- **R26 applies and is the rule this whole task serves**: *"At handoff, identify the
  files, checks, deviations and actual remaining limitations."* One document naming
  161 verdicts and their owners is that handoff.
- R01–R25: N/A for the commit itself — it adds one Markdown file and touches no brand
  asset, imagery, layout, spacing, colour, type, copy, price, data source, state
  machine, target size, breakpoint, dialog, persistence or offer.

## Acceptance criteria

- [ ] **FIX-53-AC01** `docs/mi-bolt/execution/acceptance-summary.md` exists, is
      non-empty, and contains one `## Txx` heading for each of `T00`–`T29` and `O01`
      — 31 headings — plus the "Skill provenance" and "Per-task index" sections.
      `test -f docs/mi-bolt/execution/acceptance-summary.md` fails before this task and
      succeeds after.
- [ ] **FIX-53-AC02** The "Per-task index" table has exactly 31 rows, one per task in
      dependency order (`T00`…`T29`, `O01`), and every `Status` value is one of the
      four declared values.
- [ ] **FIX-53-AC03** Every one of the **161** task-specific acceptance criteria
      appears exactly once across the 31 `## Txx` sections, each with a verdict.
      Verify the count against the same command Evidence uses, and verify that no
      criterion id appears twice.
- [ ] **FIX-53-AC04** Every criterion whose verdict is **met** cites a command with
      its exit code, or a browser measurement with its value. Sample ten at random,
      re-run or re-measure each, and record the result. If any one of the ten does not
      reproduce, the document is wrong and must be corrected before this task is
      complete.
- [ ] **FIX-53-AC05** Every criterion whose verdict is **not met** names either a FIX
      number or the literal `unowned`. Every `unowned` also appears in that task's
      "Defects" line and in the final report.
- [ ] **FIX-53-AC06** No `## Txx` section contains a fabricated R01–R26 table.
      `grep -c "^## " docs/mi-bolt/execution/acceptance-summary.md` returns the count
      of top-level sections (preamble headings plus 31 task headings); a per-task
      R-rule table would need 26 rows each and none does — check with
      `grep -c "^| R[0-9]" docs/mi-bolt/execution/acceptance-summary.md`, which must
      print `0`. Any R-rule-shaped defect a task's section names cites an audit
      report finding (`A[1-7] F[0-9]+` or similar), not an invented judgement.
- [ ] **FIX-53-AC07** `## O01` records the 3D viewer as not approved and not built,
      citing `docs/spec/execution-rules.md:17`, `docs/tasks/T16.md:46` and decision
      **D7**, and marks `O01-AC01`–`AC06` as deliberately unreached rather than
      failed.
- [ ] **FIX-53-AC08** The "Skill provenance" section states, once, either the resolved
      `skill-location.json` values (if `FIX-38` has landed) or the installed path with
      the provenance gap named (if it has not). `grep -c "skill-location.json"
      docs/mi-bolt/execution/acceptance-summary.md` returns exactly `1`.
- [ ] **FIX-53-AC09** The cross-check in item 5 was run against **both** of `FIX-40`'s
      registers, or their absence was recorded. (a) If
      `docs/mi-bolt/execution/traceability.md` exists, the document carries the
      one-paragraph comparison of the two registers' overall pictures; if it does not,
      the document says so and names **FIX-40**. (b) If
      `docs/mi-bolt/execution/acceptance-report.md` exists, the document carries a
      per-task comparison covering all thirty-one entries `T00`–`T29` and `O01`: a count
      of the tasks where the two agree, and **every** disagreement named, with both
      verdicts quoted and one sentence on which measurement produced each. If it does
      not exist, the document says so and names **FIX-40**. Neither of FIX-40's files is
      modified by this commit — **FIX-53-AC10**'s `git status --short` check is what
      proves it — and a disagreement is reported, never reconciled by editing.
- [ ] **FIX-53-AC10** `git status --short` shows no modified file outside
      `docs/mi-bolt/execution/acceptance-summary.md`. No file under `src/`, `tests/`,
      `e2e/`, `scripts/`, `docs/spec/` or `docs/tasks/` changed, and no `git restore`,
      `git checkout --`, `git stash`, `git reset` or `git clean` was used.
- [ ] **FIX-53-AC11** `npm run build` exits `0` — a no-regression check confirming
      this task touched no source.

## Commit

This task is exactly one commit. One document is one change because it is one
requirement, produced from one sweep of the same measured baseline in one dependency
order, and a partial document would be indistinguishable from one that had lost
sections. Do not bundle it with any other FIX task, and do not commit until every
acceptance criterion above has passed.

**Where this task sits in the package.** A record is a statement about work that has
been verified, so a document written today mostly says "not met" or "not verified"
and names an owner. That is the correct output now, and it is also why this task is
worth re-running after the other FIX tasks land: the same document then gets honest
"met" verdicts. Running it now is what produces the gap register nobody currently
has. Whether it is re-run later is the orchestrator's call and is not written into
this file as a second task.

The commit body carries the one sentence from "What to change" item 4 — that this is
a document of measured status, not of verified work — plus item 5's cross-check
against both `traceability.md` and `acceptance-report.md`, and the list of every
`unowned` defect the sweep surfaced.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
docs: add the acceptance summary the workspace rules require
```

Nothing in this package is pushed by the executor. The push and the pull request
belong to the orchestrating session.
