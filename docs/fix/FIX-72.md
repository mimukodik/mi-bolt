# FIX-72 — Close the reachable unreached acceptance criteria with real assertions

Status: BLOCKED — not executed. This task's own "How to verify" step 1 requires FIX-39 to have landed first (`test -f scripts/check-traceability.mjs` must fail; the thirteen `test.skip(` sites must be gone). Measured on this run's final commit: `scripts/check-traceability.mjs` still exists and all thirteen `test.skip(` sites are still present. FIX-39 is out of scope for this session (e2e is out of scope per the user's own instruction), so this task was not started, per its own instruction to "stop and report rather than starting on a worklist FIX-39 has not yet produced."
Severity: major
Source: Split out of FIX-39 item 3 by RULINGS-B2 (finding S7b-15): a judgment pass over
roughly 24 criteria in seven packets is not the same logical change as deleting the
traceability gate and rewriting thirteen skipped guards.

## Why this is wrong

`FIX-39` used to carry, in one commit, four unrelated pieces of work: deleting
`scripts/check-traceability.mjs`, editing `package.json` to remove the script entry,
rewriting thirteen `test.skip(` call sites across three e2e files into real assertions,
editing three documentation mirrors (`docs/tasks/T27.md`, `docs/tasks/tasks.json`,
`docs/index.html`) — and a fifth, separate piece: an open-ended judgment pass over
**roughly 24 acceptance criteria in seven task packets**, deciding for each one whether the
behaviour it describes exists in the application today and, where it does, writing a real
test for it.

The first four are bounded and fully prescribed: the file to delete is named, the
`package.json` entry is named, and the thirteen skip sites each have their exact
replacement code given verbatim. The fifth is not bounded in the same way — it is a
per-criterion judgment call repeated roughly two dozen times, each one needing a new test
plus a deliberate break-and-restore proof that the test is real. `.claude/rules/
session-lifecycle.md` ("One commit, one logical change") calls a commit two commits when a
reviewer cannot describe it in one sentence; `.claude/rules/planning-deliverables.md`
("The file layout follows the unit of execution") asks for "one file per independently
executable unit, so a phase, a stream or a task can be picked up, assigned, or turned into
a ticket without a second pass to extract it from a larger document." A judgment pass over
seven packets is such a unit, and bundling it inside the commit that deletes the one
automated check which would have caught a shortcut taken in it — pasting an identifier
into a comment, a bare `describe` with no `expect`, `expect(true).toBe(true)`, a
snapshot-only assertion — removes the backstop in the same breath as the work it was
watching.

**This is the closest of the three splits in this ruling round to a judgment call, and the
argument against it is recorded rather than omitted.** `FIX-39-AC05` (now moved here as
`FIX-72-AC01`/`AC02`) explicitly permits closing nothing and reporting every criterion as
unimplemented work; an honest minimum execution of the judgment pass is therefore no larger
than the four bounded items in scope and cost. What the split buys is not a smaller worst
case — it is that the bounded half (delete a gate, rewrite thirteen guards) becomes
reviewable as its own unit, and that an executor facing roughly two dozen judgment calls
cannot reach for the shortcuts the prohibition list below names inside the same commit that
removes the check that would have caught them.

**What does not change.** The `FIX-39 → FIX-46` order survives untouched: `FIX-46`'s
`no-restricted-syntax` ESLint rule fails while any of the thirteen `test.skip(` sites still
exist, and those sites are `FIX-39`'s item 4, which stays in `FIX-39`. This task does not
touch that dependency.

## Evidence

**The worklist this task works from is `FIX-39`'s own Evidence section**, which quotes the
`check-traceability` gate's output verbatim at the moment it was measured
(43 unreached acceptance criteria, 3 unreached requirements, 3 unreached scenarios) and
explains which of those are excluded and why: the ten 3D-viewer items (`O01-AC01`…`AC06`,
`E125`, `E126`, `E127`, `RQ18`) are excluded entirely under decision **D7** and
`docs/spec/execution-rules.md:17` ("Only O01 (3D) is optional and requires explicit
approval"); `RQ19` and `RQ20` are excluded because the `T29` packet they depend on is
**FIX-40**'s to write and `FIX-40` runs after this task. That leaves roughly two dozen
criteria across the packets `FIX-39`'s Evidence section lists — `T01`, `T05`, `T06`, `T10`,
`T13`, `T15`, `T25`, `T28` — as this task's worklist. `FIX-39`'s Evidence section is not
edited by this task and stays exactly where it is, because it is where the worklist is
measured.

**Every identifier must be re-checked before it is worked**, because a task that landed
after `FIX-39.md` was written may already have added the citation:

```bash
grep -rn "<identifier>" tests e2e src
```

**`docs/spec/execution-rules.md:13`** binds every test this task writes: *"Do not
substitute a component fixture, SDK spy or HttpTestingController for network-level MSW in
business tests."* A UI criterion is asserted against rendered DOM after a user action; an
API criterion is asserted against a real SDK request intercepted by MSW.

**Ordering: this task lands after `FIX-39` and before `FIX-40`.** `FIX-39` removes the
thirteen skips and deletes the gate; this task's worklist comes from `FIX-39`'s own
Evidence section, which exists only once `FIX-39` has been written (it already is, so the
dependency is on `FIX-39` having *landed*, not merely existing as a file). `FIX-40` writes
`docs/mi-bolt/execution/traceability.md` from the repository's state, so this task's
results must be in the tree before `FIX-40` runs, or the human record it produces
undercounts what was actually closed.

## What to change

### 1. Build the worklist

Work the worklist in `FIX-39.md`'s Evidence section, **minus** the ten 3D items
(`O01-AC01`…`O01-AC06`, `E125`, `E126`, `E127`, `RQ18`) and minus whatever any landed FIX
task has already closed. Check each identifier with `grep -rn "<identifier>" tests e2e src`
before starting on it.

### 2. For each identifier still unreached — the four steps, moved from `FIX-39` item 3 verbatim

1. Open the task packet (`docs/tasks/T01.md` … `docs/tasks/T29.md`) and read the
   criterion's full text.
2. Decide whether the behaviour it describes exists in the application today. If it does
   not, **the criterion is not closed by writing a test — it is reported as unimplemented
   work**, with the packet line quoted, and left unreached.
3. If it does exist, write a test that fails when the behaviour is removed. The identifier
   goes in the `describe` or `it` title so a later reader can find it, but the title is
   not the work: the assertion is. A UI criterion asserts against rendered DOM after a
   user action; an API criterion asserts against a real SDK request intercepted by MSW —
   `docs/spec/execution-rules.md:13` forbids substituting "a component fixture, SDK spy or
   HttpTestingController for network-level MSW in business tests".
4. Prove the test is real before moving on: break the behaviour it covers, watch the test
   fail, restore it, watch it pass. Record that you did so.

### 3. The prohibitions — moved from `FIX-39` item 3 verbatim and unchanged

**Explicitly forbidden**, because a weaker executor handed "close the unreached
criteria" will reach for them: writing the identifier into a comment; adding a `describe`
block with no `expect`; adding an `expect(true).toBe(true)`; a test whose only assertion
is a snapshot; adding the identifier to a file that already asserts something unrelated.
Each of these would have turned the old gate green while leaving the criterion unmet, and
none of them is any less wrong with the gate gone — a criterion "closed" this way is
simply reported as met with nothing behind it, which no reader can catch later.
`docs/spec/coverage-policy.json`'s `forbidden` list ends with exactly this failure mode:
"using 100% passing tests as a synonym for 100% source coverage".

These prohibitions are the reason this task exists as its own commit, separate from the
one that deletes the gate that used to catch them.

### 4. The network-level rule that binds every test written here

`docs/spec/execution-rules.md:13`: no component fixture, SDK spy or
`HttpTestingController` substituted for network-level MSW in a business test.

## Out of scope

- **`scripts/check-traceability.mjs`, `package.json`, the thirteen `test.skip(` sites,
  `docs/tasks/T27.md`, `docs/tasks/tasks.json` and `docs/index.html`.** All **FIX-39**'s.
- **The 3D viewer.** Not approved and not built (**D7**). `O01-AC01`…`AC06`, `E125`,
  `E126`, `E127` and `RQ18` are not in this task's worklist and are not touched.
- **Repairing any application defect a new test exposes.** That belongs to whichever FIX
  number owns the surface, or is reported as unowned if none does. This task asserts
  behaviour; it does not repair it.

## How to verify

Run these from the repository root. The package manager is **npm**; there is no pnpm and
no mise in this repository.

1. **Confirm the prerequisite is on the branch.** `FIX-39` must have landed —
   `test -f scripts/check-traceability.mjs` must fail, and
   `grep -c "test\.skip(" e2e/a11y/keyboard.spec.ts e2e/design/state-matrix.spec.ts
   e2e/design/viewport-matrix.spec.ts` must print `0` for each. If either check fails, stop
   and report rather than starting on a worklist `FIX-39` has not yet produced.
2. Build the worklist per "What to change" item 1.
3. Work each identifier per item 2, proving the break-and-restore for every test added.
4. `npm run test`

   Record the exit code.
5. `npx playwright test -g "<the tests this task added>"`

   Record the exit code. Run it targeted at the new tests rather than the whole suite:
   the full Playwright run rewrites 49 tracked screenshots under
   `e2e/design/screenshots/` and leaves the working tree dirty.
6. `npm run build`

   Expected exit `0`.
7. `git status --short`

   Must list only spec files this task added or modified.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task writes assertions for behaviour that is repaired and verified in a browser by
whichever FIX task owns the surface; this task only asserts it, it does not change what
renders — with one exception, when a criterion's subject is user-visible and reachable, in
which case that specific criterion needs its own real-browser pass, per AC06 below.**

- **R26 applies**: the commit body names every criterion closed, its spec file, its
  assertion, the break/restore proof, and every criterion reported as unimplemented work
  with its packet line quoted and its owner named.
- R01–R25: N/A for the task as a whole; a criterion this task closes may individually
  engage a visual or interaction rule, in which case AC06's browser pass names it. Nothing
  in this task's own scope — writing tests, not building surfaces — introduces a new
  colour, token, layout or component.

## Acceptance criteria

- [ ] **FIX-72-AC01** Every criterion this task closes is closed by an **assertion**, not a
      citation. For each, the commit body names the spec file, the assertion, and the
      result of deliberately breaking the behaviour and watching that test fail. A
      criterion whose identifier appears only in a comment, a bare `describe`, an
      `expect(true)` or a snapshot-only assertion fails this criterion. *(This is
      `FIX-39-AC05`, moved.)*
- [ ] **FIX-72-AC02** Every criterion **not** closed is listed by name with its packet line
      quoted, under the heading "reported as unimplemented work", with the FIX number that
      owns it or `unowned`. Closing nothing and reporting everything is a legitimate
      outcome of this task; closing something without the proof in AC01 is not.
- [ ] **FIX-72-AC03** The ten 3D items are not in this task's worklist and none is closed:
      `grep -rn "O01-AC0\|E125\|E126\|E127" tests e2e src` returns nothing this commit
      added. The commit body records that the 3D viewer remains unapproved and unbuilt,
      per **D7** and `docs/spec/execution-rules.md:17`.
- [ ] **FIX-72-AC04** `npm run test` and
      `npx playwright test -g "<the tests this task added>"` are run and their exit codes
      recorded. A test this task added that does not run under either is not a test; name
      it and fix its placement.
- [ ] **FIX-72-AC05** `npm run build` exits `0`; `git status --short` lists only spec files
      — nothing under `scripts/`, nothing under `docs/`, no `package.json`.
- [ ] **FIX-72-AC06** **Browser verification.** Any criterion this task closes whose
      subject a person can see or click is closed with a `real-browser-sonnet` pass, per
      `.claude/rules/browser-verification.md`, and the criterion names the route and the
      interaction. If this task closes no such criterion, the exemption is claimed in
      writing with that as its reason.
- [ ] **FIX-72-AC07** The `mi-bolt-design` R01–R26 record is in the commit body, per
      **D23**, each N/A with its one-sentence reason.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-39`, `FIX-40`, `FIX-46` or any
other FIX task.

**This task runs after `FIX-39` and before `FIX-40`.** Nothing in `FIX-39`'s own commit
waits on this task, and this task does not change the `FIX-39 → FIX-46` order, which exists
because `FIX-46`'s `no-restricted-syntax` rule fails while the thirteen skips are in the
tree — the skips are `FIX-39` item 4, not this task's. `FIX-40` writes
`docs/mi-bolt/execution/traceability.md` from the repository's state, so this task must
land before it. The package's closing order for this phase is therefore
`FIX-39` → `FIX-72` → `FIX-46` → … → `FIX-40` → `FIX-53`, with this task placeable anywhere
between `FIX-39` and `FIX-40`.

The commit body opens with the worklist this task started from (quoting `FIX-39`'s Evidence
section's count), states which criteria this task closed with their assertions and which
it reported as unimplemented work with their packet lines quoted, and records that the ten
3D items were excluded and remain unapproved and unbuilt.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```text
test: close the reachable unreached acceptance criteria with real assertions
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
