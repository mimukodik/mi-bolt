# MiBolt repair package — `docs/fix/`

Seven of the eleven commands that gate this application exit non-zero, and two of the four
that pass do so for the wrong reason. `npm run lint` has never executed: the target
is misconfigured and the command aborts before it reads a file. `npm run test` (`ng test`)
fails **14 of 14** spec files, every one with the same `ReferenceError: document is not
defined`, so the unit suite the Angular builder runs has never passed. `npx playwright
test` reports **41 failures**, most of them traced to one line: a `**` catch-all route
declared before `/primitives` and `/canary`, which makes both routes unreachable.
`npm run api:drift` exits `0` while leaving 27 tracked files rewritten, because the branch
that would report drift is unreachable. And in the browser, a reload empties the cart,
every cart line's `−`, `+` and `Törlés` control is permanently disabled, `?variant=` is
never read on either code path that claims to read it, and a declined order tells the user
nothing at all.

This directory is the plan for repairing that. **No task in it has been executed.** All 74
task files carry `Status: PLANNED — not executed.`, and no task has changed a source file,
a configuration file or a specification document. Seven tracked files outside `docs/fix/`
are nonetheless modified in the working tree: they are a deliberate brand scrub the user
asked for during this run, and section 9 names all seven and says why they are not an
executor's to touch or to undo. The working tree also shows changes this work did not
make; section 9 separates the two.

The count reached 74 in seven steps: 53 files plus the two D9 splits, then FIX-54 to
FIX-61 under decisions **D12**, **D13** and **D14**, then **FIX-62** giving the
coverage-canary deletion **D19** item 1 calls for an owner it had not had before, then
FIX-63 to FIX-68 giving decisions **D15**, **D16** and **D20** the owners they call for,
then **FIX-69** giving `lintFilePatterns`'s widening the owner review finding **S1-4**
found it lacked, then **FIX-70** to **FIX-72** under decision **D25**'s three splits.
Section 5 is the index and section 6 records every decision behind it.

---

## 1. What this package is and where it came from

Ten audits were run against commit **`db6d295`** — seven static reads of the repository
and three passes in a real Chrome — and every finding was measured against `docs/`, which
is this project's specification. The areas:

| Report | Area |
|---|---|
| A1 | Stack and tooling configuration |
| A2 | OpenAPI contract, generated SDK, MSW mock layer |
| A3 | Layouts, shared primitives, home / catalogue / product screens |
| A4 | Cart, checkout and order flow |
| A5 | Unit and E2E suites, file placement, coverage machinery |
| A6 | Angular idiom, three-file structure, SCSS/Tailwind, necessity, strict TS |
| A7 | Release, deployment, traceability, acceptance, design governance |
| B1 | Real-browser functional walkthrough (1440×900, Chrome) |
| B2 | Responsive and accessibility matrix (real browser) |
| B3 | Application against the UX prototype and the `mi-bolt-design` R01–R26 table |

The application under audit is Angular 22 with the `@angular/build:unit-test` builder,
Vitest 4, Playwright 1.63 with `@axe-core/playwright`, MSW 2.15, ng-openapi-gen 1.0.5,
ESLint 10 flat config, Tailwind 4 and TypeScript 6.0.x. **The package manager is npm
11.17.0.** There is no pnpm in this repository and no `mise` configuration, so every
command in every task file is a bare `npm run …`.

A finding is evidence, not a verdict. Where two reports disagreed, the task that owns the
subject says so, states which report it follows, and says why. Several findings were
refuted outright by direct measurement and the tasks reflect the measurement, not the
report.

---

## 2. The measured baseline

Every row below was measured by the orchestrating session on commit `db6d295`. This table
is both the reason the package exists and the yardstick an executor checks their own
progress against: a gate that was green here must still be green after your commit, and a
gate that was red here is not yours to chase unless your task says it is.

| Command | Exit | Result |
|---|---|---|
| `npm run build` | 0 | green |
| `npm run lint` | 1 | **never runs** — `Data path "" must have required property 'lintFilePatterns'` |
| `npm run test` (`ng test`) | 1 | **14/14 files fail**, 76 failed / 5 passed / 36 skipped, all `ReferenceError: document is not defined` |
| `npm run test:unit:coverage` | **0** | exits **green at 56.42%** statements / 53.02% branches / 48.57% functions / 59.3% lines — **gate removed by D17** |
| `npm run coverage:unit:check` | 1 | 193 issues — **gate removed by D17** |
| `npm run coverage:e2e:check` | 1 | `coverage/e2e/coverage-final.json` never produced — **gate removed by D17** (D19 item 1) |
| `npm run contract:validate` | 0 | green — **gate removed by D17** |
| `npm run api:drift` | 0 | green **but leaves the working tree dirty** — the gate does not detect the drift it exists for. Survives D17, rewritten: see section 6. |
| `npm run check:traceability` | 1 | 43 of 161 acceptance criteria unreached — **gate removed by D17** (section 6) |
| `npm run check:test-policy` | 1 | 6 findings in 3 locations — **gate removed by D17**, requirement moves into ESLint (FIX-46) |
| `npx playwright test` | 1 | **41 failed**, 8 skipped, 221 passed |

Every row above records what was true at `db6d295`; a measurement does not stop being true
because the gate that produced it is gone. `npm run build`, `npm run lint`, `npm run test`,
`npm run api:drift` and `npx playwright test` are the five rows still measuring a command
that exists after D17. Every other row measures a command D17 removed, and none of them is
an instruction to run it.

**Two of these dirty the working tree. Do not run either unless the task in front of you
owns it.**

- `npm run api:drift` deletes and regenerates all 56 files under `src/app/api/generated/`
  and leaves 27 of them rewritten — **FIX-11** owns it.
- `npx playwright test` with no argument rewrites 49 tracked screenshots under
  `e2e/design/screenshots/` — **FIX-09** owns it. To run one Playwright spec, name it:
  `npx playwright test e2e/design/state-matrix.spec.ts`.

`npm run test:unit:coverage` exiting `0` is not a sign of health. It runs `vitest` directly
over the 30 specs under `tests/`, with thresholds switched off; the 14 specs under `src/`
that `ng test` runs are a disjoint set, and they are the 14 that fail.

---

## 3. The rules every task obeys

These hold for all 74 files. They are stated once here so you do not have to reconstruct
them from each file.

**`docs/` is the specification.** Where the code and a specification document disagree,
the code is wrong and the task changes the code. No task edits a spec document to make it
match the implementation. This is decision **D1** in section 6, and it closes every
"arguably better as implemented" argument in the audit reports.

**One task is exactly one commit.** Do not bundle two FIX tasks into one commit. Every
file ends with a `## Commit` section carrying a suggested subject line in the repository's
existing `type: summary` style. Commit only after every acceptance criterion in that file
passes. **One file is the exception and says so in its own `## Commit` section**: FIX-51
is two commits, because decision **D10** landed a second, unrelated subject on the task
that had reserved the question, and `.claude/rules/session-lifecycle.md` ("One commit, one
logical change") makes a commit nobody can describe in one sentence into two. That is a
ruling about FIX-51 and not a licence to split any other task.

**Acceptance criteria are checkable by someone else.** They are numbered
`FIX-NN-AC01`, `FIX-NN-AC02`, … and each names an observable thing and the value it must
have. "The layout is correct" is not one; `getComputedStyle(…).flexDirection` returning
`row` at 1440 and at 390 is. Count them with grep rather than trusting a number written
here. Work through them as a checklist, not as a summary.

**A change that reaches a rendered surface is proved in a real browser.** The user
required this explicitly:

> "a taskokba reszletes es pontos leiras legyen es ahol szukseges elfogadasi kriterumokba
> irjuk bele a bongeszo tesztet, mert egy gyengebb nem claude model fogja majd vegre
> hajtani"

("the tasks are to carry a detailed and precise description, and where necessary we write
the browser test into the acceptance criteria, because a weaker, non-Claude model will be
executing them.")

`.claude/rules/browser-verification.md` governs how that check is run, and it also lists
what does **not** count: file existence on disk, a green typecheck, a green unit test, an
HTTP 200 from `curl`, a grep, or reading the diff back. None of those is browser
verification, for any change. A task that genuinely cannot reach a browser claims the
exemption in writing and says why; `grep -l exemption docs/fix/FIX-*.md` lists them.

**Every task records the design rules.** `.claude/CLAUDE.md` makes the `mi-bolt-design`
skill's R01–R26 table the audit checklist for every implementation in this workspace,
including non-visual ones. Each file states which R-rules apply and what the outcome was;
a non-visual task may mark a rule N/A, but each N/A carries a one-sentence reason. Those
clauses are per-task and belong in the task file: they name what that change does and
which of its acceptance criteria measures it.

**The skill's provenance is recorded here, once, and no task file restates it.** The
skill is installed at `.claude/skills/mi-bolt-design/SKILL.md`, version `1.0.1` per its
own `metadata.version` frontmatter (measured 2026-09-17).
`docs/mi-bolt/execution/skill-location.json`, which `.claude/CLAUDE.md` calls the only
source of truth for the skill's resolved path, approved version and SHA-256, **does not
exist**: `docs/mi-bolt/execution/` holds only `evidence/`. **FIX-38** owns creating it.
Until it does, every task cites the installed path above and records the gap by pointing
at this paragraph rather than by repeating it. The paragraph had been copied into all 70
files in seven different wordings, three of them describing the JSON's contents
differently, and a fact written seventy times in seven wordings is a fact no executor can
check. Two files keep a provenance sentence of their own because the gap is their
subject: **FIX-38**, which closes it, and **FIX-40**, whose record depends on whether
FIX-38 has landed when it runs.

**No invented number is a gate.** `.claude/rules/planning-deliverables.md` binds this
package: every number in it traces to the user, to a specification document, to a rule
file, or to the measured baseline in section 2. A threshold nobody measured may be
recorded as an expectation; it may not fail a task. The same holds for counts of things in
this index — acceptance criteria, severities, browser-verification exemptions: none of them
is written here as a fixed total, because that goes stale the next time a decision adds a
task. Each is measured with grep instead, for example:

```bash
grep -rhoE '^- \[ \] \*\*FIX-[0-9]+b?-AC[0-9]+\*\*' docs/fix/FIX-*.md | wc -l
```

**Do not undo work with git.** No `git restore`, `git checkout --`, `git stash`,
`git reset` or `git clean`.

---

## 4. The order

The numbering is not the order. Read this section before picking a task.

### Rule zero: Stream 1 first

Nothing in this repository can be verified until the toolchain works. `npm run lint` has
never executed a single rule, and `ng test` fails every file it runs before any assertion
is evaluated. Any task landed before those two are repaired is a change whose test cannot
run and whose lint result is unknown. **FIX-01 and FIX-04 are the two foundations, they
have no prerequisites of their own, and they can be worked in parallel.**

### Phase A — toolchain and gates

| Step | Task | Why here |
|---|---|---|
| A0 | **FIX-11** | **Required before FIX-02**, not optional. 27 of the 56 generated SDK files have had their `/* eslint-disable */` header stripped by hand, and FIX-02 turns on `strictTypeChecked` over `src/**/*.ts`, which includes that tree. With the header missing, **FIX-02-AC01** (green `npm run lint`, no `eslint-disable` added) has no legal route to pass: repairing a generated file contradicts its own `DO NOT EDIT` banner, `api:drift` reverts the repair, and `FIX-11.md:118-125` rules out an `eslint.config.js` `ignores` entry as the answer. FIX-11's own **FIX-11-AC05** needs `vitest.contract.config.ts`, which **FIX-06** creates, so the Phase A/B order is `FIX-01 ‖ FIX-04 → FIX-06 → FIX-11 → FIX-02 → FIX-03`. FIX-06's preference for FIX-02 landing first (`FIX-06.md`, "Where this sits") is a preference and gives way to this. |
| A1 | **FIX-01** ‖ **FIX-04** | No prerequisites. FIX-01 makes `npm run lint` start; FIX-04 makes `ng test` execute. Parallel is explicitly allowed. |
| A2 | **FIX-02** | Requires **FIX-01** (lint must start before a rule change can be measured) and **FIX-04** (the `@ViewChild` migration is justified by the JIT transformer FIX-04 deletes). |
| A3 | **FIX-03** | Requires **FIX-01** and **FIX-02** — it appends to the same `extends` array FIX-02 rewrites. |
| A* | **FIX-05** | No prerequisite, nothing depends on it; land it whenever. |
| A5 | **FIX-47** | Requires **FIX-01**, **FIX-03**, **FIX-04** and **FIX-06** (Phase B, below). `npm run test:unit:coverage` is D17's one currently-green unit command at baseline, and FIX-47 is what removes it; removing it before `ng test` works (FIX-01, FIX-04) and before FIX-06 has collected the specs it runs over would leave the repository with no unit command at all. FIX-03 must also have landed first, so `format` and `format:check` already exist and FIX-47's `package.json` edit only ever removes and adds, never collides with a sibling adding the same two keys (`FIX-47.md:623-634`). |

FIX-03, FIX-04 and FIX-05 each edit `package.json` under different keys. Whichever lands
second rebases trivially. **Do not merge them into one commit to avoid that rebase.**

### Phase B — the test suite, a strict chain

**FIX-04 → FIX-06 → FIX-07 → FIX-07b → FIX-08**, and each arrow is a hard dependency
stated in the file itself:

- **FIX-06** after FIX-04. Moving 24 specs into a runner that fails every one of them
  verifies nothing. FIX-01 and FIX-02 landing first is better still, because the moved
  specs are linted for the first time here.
- **FIX-07** after FIX-04 and FIX-06. FIX-06 moves the six files to the paths FIX-07
  edits.
- **FIX-07b** after FIX-07. The TestBed-plus-MSW replacement pattern is settled in FIX-07
  and applied in FIX-07b, and FIX-07b owns the repository-wide check — that no spec under
  `src/` reads its subject off disk — which belongs to whichever of the two runs second.
- **FIX-08** after all four. Turning coverage thresholds on before 368 source-text
  assertions become real executing tests would gate the branch against a number that is
  about to move a long way.

**FIX-09** has no prerequisite in this chain, and — since decision **D19** item 1 removed
the E2E coverage collector `/canary` used to feed — **no ordering constraint against
FIX-08 either.** The reason this section used to give for landing FIX-09 before FIX-08 was
that making `/canary` reachable would let that collector produce
`coverage/e2e/coverage-final.json` for the first time; D19 item 1 deletes the collector
entirely, so there is no longer a report for anything to produce and nothing for FIX-08 to
measure as a consequence of FIX-09 landing either side of it (`FIX-08.md`, "Where this
sits in the stream", says the same). Run FIX-09 when no other task is in flight — its
verification rewrites 49 tracked screenshots and would mix them into another task's diff.

**FIX-62** (delete the coverage-canary subsystem D19 removed) shares a file with FIX-09 —
both edit `src/app/app.routes.ts` — and **either order works**: FIX-09 already tolerates
the `'canary'` route block being present or already deleted when it runs, and FIX-62
tolerates the block sitting at its original position or already moved next to
`'primitives'`. FIX-62 also touches `docs/tasks/T02.md`, `tasks.json` and `docs/index.html`
in the same three places **FIX-08** does (the deleted-script file-list entries and the
T02-AC06 text), so land the two in either order and re-locate the shared lines by content
rather than by line number, exactly as both files' own "What to change" sections say.
Prefer landing **FIX-62 before FIX-06**: `FIX-06.md` rows 15 and 16 still plan to move two
files FIX-62 deletes, and FIX-62's own "Where this sits in the stream" section explains
the collision and why landing first avoids the wasted move.

### Phase C — the mock and API layer

**FIX-10 is the single most valuable task in the package and it has no prerequisites.**
Its four parts are internally ordered and that ordering *is* the dependency — the file
says so, and the executor must not reorder them:

1. The demo session id survives the reload (`demo-session.interceptor.ts` generates it at
   module evaluation today, so every reload looks in a different MSW namespace).
2. The restore path reconnects a hydrated cart to its session (`loadPersistedCart` sets
   `sessionId: ''` and `POST /carts` always mints a fresh one).
3. The mock writes its snapshot after every successful mutating response
   (`Persistence.save()` exists and is called by no application code at all).
4. The app layer stops storing business data — **last**, because deleting the receipt
   fallback before the mock persists receipts would regress what commit `e8f5b3f`
   delivered.

Any one of the four alone leaves the cart still lost on reload. **They are useless apart.**

- **FIX-51** edits `src/mocks/browser.ts`, which FIX-10 part 3 also edits. Different
  functions, but the two must never run at the same time.
- **FIX-12** and **FIX-13** are independent of everything. **FIX-08** should land after
  FIX-10 and after FIX-13, so the new `src/mocks/snapshot.ts` exists and the deleted
  `src/mocks/node.ts` is gone when the `src/mocks/**` coverage classification is turned
  on.
- **FIX-12** before **FIX-17** is mildly preferable; either order is safe and neither
  re-does the other's work.

### Phase D — structure and dead code

- **FIX-14 before FIX-15.** FIX-15 deletes `catalog-page.html` and `catalog-page.scss` as
  orphans; FIX-14 is what makes them live. In the wrong order, FIX-15 deletes the files
  FIX-14 needs. Both files say so.
- **FIX-16 before FIX-50.** FIX-16 creates the `AddToCart` call site; FIX-50 reshapes it
  to `components.md`. FIX-50 says: if FIX-16 has not landed, stop and report rather than
  building a call site.
- **FIX-16 before FIX-32**, because FIX-16 changes what a tap on that control does.
- **FIX-17 before FIX-19** is a recommendation, not a requirement: FIX-17's commit body is
  where the double-declaration pattern in the two shared primitives is written down, and
  FIX-19's executor benefits from reading it.
- **Four Stream 4 tasks each carry a hard prerequisite chain in their own file, absent
  from this section until now; each stops and reports if the chain is not met.**
  **FIX-56** requires **FIX-22**, then **FIX-44**, then **FIX-50**, in that order
  (`FIX-56.md:295-296`). **FIX-59** requires **FIX-02**, **FIX-04**, **FIX-06**,
  **FIX-07**, **FIX-07b** and **FIX-14**, all landed (`FIX-59.md:363-365`). **FIX-60**
  requires **FIX-04**, **FIX-14**, **FIX-24**, **FIX-50**, then **FIX-65**, in that order
  (`FIX-60.md:476-478`). **FIX-63** requires **FIX-20**, then **FIX-67**
  (`FIX-63.md:488-489`).
- **FIX-70 after FIX-33 and FIX-10**, and after **FIX-50** only by convention rather
  than by need: it was item 6 of FIX-50 and shares no file with it. It stops and
  reports if FIX-33 has not landed; if FIX-10 has not, it lands anyway with the
  `memory` state unit-tested and not driven, and says so in its commit body.

### Phase E — the screens

- **FIX-42 before FIX-33.** FIX-42 owns router fragment navigation outright: the
  `withInMemoryScrolling` option in `src/app/app.config.ts`, the missing target ids, and
  the dead header and footer links. FIX-33 builds two hero call-to-action buttons that
  only work once those exist. (FIX-33's own item 8 would add the same router option —
  see section 7; that item must be cut to a pointer before either task runs.)
- **FIX-18 before FIX-33**, or closed as moot by the orchestrator. FIX-33 deletes the
  element carrying the three broken quick-filter links and rebuilds two of the three; the
  third, `5G + készleten`, is not in `screens.md:35` and does not come back.
- **FIX-31 before FIX-21**, derived rather than stated: FIX-31's proof is an experiment
  that expects seven `color-contrast` violations on the cart page and watches them vanish
  when `aria-busy` is removed by hand. FIX-21 is what stops the line being busy, so once
  it has landed there are no violations left to reproduce and FIX-31's step 1 has to be
  re-derived instead of run. Neither task closes the other: FIX-21 fixes the cause (every
  line is marked busy, permanently), FIX-31 fixes the presentation rule
  (`opacity: 0.7` on a whole cart line) that would still fail AA on a genuinely busy line.
- **FIX-41 owns the whole 404 page**, styling and the catalogue link `screens.md:27`
  requires. FIX-35's copy table still carries a row for the same link — see section 7.
- **Three Stream 5 tasks each carry a hard prerequisite chain in their own file, absent
  from this section until now; each stops and reports if the chain is not met.**
  **FIX-61** requires **FIX-10**, then **FIX-25**, in that order (`FIX-61.md:353-355`).
  **FIX-64** requires **FIX-33** (`FIX-64.md:351`). **FIX-66** requires **FIX-61**
  (`FIX-66.md:463`).

**The product page is touched by five tasks.** They must be run one at a time, and each
names its boundary: **FIX-16** (wire `AddToCart` in), **FIX-23** (the `?variant=`
contract, the not-found state, the thumbnails), **FIX-45** (breadcrumb, description, stock
line, simulation note — it adds a paragraph inside the same `.cta-desktop` element FIX-16
edits), **FIX-26** (one-column collapse and the sticky rail), **FIX-50** (the component
signatures). Whichever lands second keeps both changes and says in its commit body which
order applied.

**Other one-file collisions, and who lands first:**

| File | Tasks | Ruling |
|---|---|---|
| `src/app/app.config.ts` | FIX-42 (`:27`), FIX-33 (`:27`), FIX-54 (`:8`, `:13`, `:28-31`, `:45`, `:61`) | **FIX-42 first**, and it owns `withInMemoryScrolling` outright; FIX-33 item 8 is already cut to a pointer at `FIX-33.md:501-505`, and **FIX-33-AC13** deliberately keeps its `grep -n "withInMemoryScrolling"` check, which verifies a precondition FIX-42 supplies. **FIX-54** edits disjoint lines under **D14** — it deletes `_provideBaseHref`, its `providers` entry, the two orphaned imports and the `providerManifest` key. Never concurrent |
| `scripts/check-test-policy.mjs` | FIX-46 | **FIX-46 deletes it outright, under D17.** FIX-39 no longer touches this file: D17 removed the traceability gate FIX-39 used to keep the other half of, so there is no longer a collision here — only the landing order (FIX-39 before FIX-46, section 4) |
| `angular.json` (`lint` target) | FIX-01, FIX-69 | **FIX-01 first**: it creates `lintFilePatterns` at `src/**/*.ts` + `src/**/*.html`. **FIX-69** widens it to `tests/**/*.ts` and `e2e/**/*.ts` after FIX-06 and before FIX-46, without which FIX-46's ESLint rule reaches no file. FIX-04 owns the `test` target on the same file; different keys, never concurrent |
| `eslint.config.js` | FIX-02, FIX-03, FIX-46, FIX-69 | **In that order.** FIX-02 rewrites the blocks and adds `projectService`; FIX-03 appends `eslint-config-prettier` last in the same `extends` array; FIX-69 narrows FIX-02's first block to `src/**/*.ts` and adds a non-type-aware block for the two test trees; FIX-46 appends the `no-restricted-syntax` block. Never concurrent |
| `src/app/features/not-found/not-found-page.html` | FIX-41, FIX-35 | **FIX-41 owns the whole 404 repair** |
| `src/mocks/browser.ts` | FIX-10 (part 3), FIX-51 (`installBusinessRouteBypass()`), FIX-62 (`:8`, one comment, D20) | Disjoint functions and one comment line; never concurrent |
| `e2e/a11y/keyboard.spec.ts` | FIX-39 (the six `test.skip(` guards), FIX-48 (`:34`), FIX-29 (the header comment `:23-26`), FIX-68 (`:141`) | Four disjoint regions; never concurrent. **FIX-46 is not an editor of this file** — it quotes `:77` as evidence only (`FIX-46.md:20`, `:91`). The file's own `built` field (`:53-54`, `:58-72`, `:102`) is **FIX-39's**: it deletes the field and its docstring, the eight `built: true` entries and the `step.built === false` read, in the same commit as the six skips (`FIX-39.md:526-532`, **FIX-39-AC04b** at `FIX-39.md:775-779`) |
| `e2e/design/screenshots/` (49 tracked images) | FIX-68, FIX-09 | **FIX-68 first.** FIX-68's `git rm -r e2e/design/screenshots` plus a regeneration naming only `viewport-matrix.spec.ts` and `state-matrix.spec.ts` would delete, and never rewrite, the twenty `<name>-<viewport>.png` files `e2e/design/primitives.spec.ts:45-50` writes and FIX-09 stages |
| `src/app/features/catalog/catalog-page.{ts,html,scss}` | FIX-14, FIX-15, FIX-43, FIX-24, FIX-34 (the inline `styles:` block) | **FIX-14 first, then FIX-43.** FIX-14 moves the inline `template:` and `styles:` into the two files and owns the orphaned pair under **D24**; FIX-15 deletes them as orphans only if FIX-14 has **not** landed and branches on `grep -n "templateUrl\|template:"` (`FIX-15.md:53-63`). **FIX-43 lands after FIX-14**: it deletes `catalog-page.ts:249-263` plus the blank line at `:248`, and FIX-14's byte-faithful extraction diff is pinned to the pre-change range `sed -n '67,264p'` (`FIX-14.md:240`, `FIX-14-AC05`), which those sixteen lines would push past the template's closing backtick. After FIX-14 there is one copy of the markup, so FIX-43 item 1 loses its markup half and item 2 becomes the whole of it. FIX-24 and FIX-34 edit disjoint regions; one at a time, never concurrent, and each locates its own span by content |
| `src/app/features/catalog/catalog-query.ts` | FIX-24 (`:116`), FIX-65 (the `SortMode` → `Sort` rename), FIX-60 | **FIX-65 before FIX-60**: FIX-65's change list is closed at 21 measured sites and FIX-60 creates two new components carrying the type. FIX-24 edits a different region; either order against FIX-65, never concurrent |
| `src/app/shared/ui/price-block/` | FIX-19 (template and SCSS), FIX-35 (`price-block.ts:49`), FIX-67 (`price-block.ts`'s `AsyncStatus` declaration and `price-block.spec.ts:4`) | Different regions inside one component; never concurrent |
| `src/app/shared/ui/index.ts` and `AsyncStatus`'s home | FIX-67, FIX-56, FIX-60, FIX-63 | **FIX-67 first.** It moves `AsyncStatus` to `src/app/shared/types/async-status.ts` and removes it from the barrel with no compatibility re-export, so every later importer writes the new path in its own first commit |
| `src/app/features/product/product-page.{ts,html}` | FIX-16, FIX-23, FIX-45, FIX-50 | One at a time; see above |
| `src/app/features/product/product-gallery.{ts,html,scss}` and its spec | FIX-71 (the thumbnail row), FIX-50 (item 3, the signature) | **FIX-71 first.** It rewrites the thumbnail markup, deletes `thumbLabel` and gives `.thumb-check` `position: absolute`, all inside the existing index-based component; FIX-50 item 3 then reshapes the signature to `images` / `selectedImageId` / `productName` / `imageSelected` / `zoomRequested` and rewrites the thumbnail click to emit an **id**. In the other order FIX-71's markup edits land on a template FIX-50 has just rewritten and its `:56-57` range is gone. Neither task may do the other's half: FIX-71 changes no input and no output, FIX-50 changes no `.scss`. Never concurrent |
| `src/app/features/checkout/review-step.{ts,html,scss}` and its spec | FIX-25, FIX-63 | **FIX-25 first**, and FIX-63 carries its fix forward rather than re-deriving one: FIX-63 deletes the same method's network half and four injections and moves them into a new `ReviewPage`, relocating FIX-25's `SubmitFailure`, its message computed, its CTA gate and its two `data-testid`s. Never concurrent |
| `src/app/features/checkout/checkout-form.model.ts` | FIX-56 (`CheckoutFieldTree`), FIX-63 (`CheckoutDraft`) | Two additions to the same file, disjoint; whichever lands second appends beside the first. Never concurrent |
| `src/app/core/navigation/header-nav.scss` | FIX-27 (`:219-221`), FIX-28 (`:1-5`) | Disjoint regions — a rule body and the file's header comment; never concurrent. Section 4's *"FIX-26, FIX-27, FIX-28, FIX-30 and FIX-52 are independent of each other"* is corrected by this row |
| `src/app/features/home/featured-products.scss` | FIX-28 (`:215-223`, the grid-column breakpoints), FIX-34 (`:4` and `:220`, the gutter ladder, plus `:45`'s grid gap), FIX-33 (the header and card rules its markup rewrite orphans) | **FIX-28 before FIX-34.** FIX-28 replaces `:215-223` as a **range** — a 540 grid query plus a 720 block carrying gutter, title size and column count become a 640 grid query, a 720 block keeping gutter and title size, and a 1024 grid query (`FIX-28.md:236-248`). FIX-34 then moves the **gutter** out of that surviving 720 block onto the 640/1024 ladder, which is what **FIX-34-AC04** requires and what clears FIX-28's deliberate 720 leftover. In the other order FIX-28's range no longer holds what it expects. Neither does the other's half: FIX-34 touches no `grid-template-columns`, FIX-28 creates no tablet gutter token. `.featured__title`'s `font-size` stays at 720 and is nobody's. **FIX-33** edits a disjoint region (`featured-products.html:8-15` and the rules it orphans, `FIX-33.md:394`, `:518-519`) and may run either side of both, locating its rules by selector |
| `src/app/app.routes.ts` | FIX-09, FIX-62, FIX-59 | FIX-09 and FIX-62 in either order; both read the `'canary'` block's current position rather than assume a line number. **FIX-59 last of the three**: it deletes `resolveLazyResources()` (`:44-105`) and the `ɵresolveComponentResources` call, which is the region the other two read around |
| `tests/setup-msw.ts` | FIX-06 (`:18-21`, `:23-30`, `:34`/`:38`, and `:57-130` deleted), FIX-62 (`:2`) | Either order; FIX-62's `:2` edit is one line for one line, so it preserves the line count FIX-06's absolute `:57-130` deletion depends on. **FIX-04 does not touch this file** (`grep -c setup-msw docs/fix/FIX-04.md` → `0`), so `FIX-14.md:107-110` names the wrong owner for `tests/setup-msw.ts:57-130` — it is FIX-06's, as `FIX-14.md:262-264` itself already says |
| `vitest.config.ts` | FIX-04 (replaces the whole file), FIX-62 (`:3`, conditionally) | **FIX-04 first** is preferred and FIX-62 already handles both orders: it runs `grep -c canary vitest.config.ts` first and records a no-op if FIX-04's rewrite has already removed the word |
| `tests/layouts.spec.ts` → `src/app/layouts/layouts.spec.ts` | FIX-06 (row 18, moves it), FIX-33 (`FIX-33.md:283`, `:524`, `:569` — the three places that name this file), FIX-64 (four `TestBed.createComponent(CheckoutLayout)` sites) | **FIX-06 first** — it is Phase B and the other two are Phases E and 4. FIX-33's three citations and its run command must name the new path and `npm run test`, not `npx vitest run tests/…`. **FIX-64 edits this file too and does not say so**: its `step` becomes `input.required<CheckoutStep>()`, which throws NG0950 at the four unbound call sites; FIX-64 must name the file and bind `step` at each |
| `docs/tasks/T00.md`, `tasks.json`, `docs/index.html` (T00 packet) | FIX-05, FIX-38 | Either order, never concurrent: FIX-05 removes the `scripts/verify-toolchain.mjs` entry, FIX-38 the neighbouring `scripts/verify-skill-evidence.mjs` entry, from the same three lists (`FIX-05.md:233-237`, `FIX-38.md:230-234`) |
| `docs/tasks/T02.md`, `tasks.json`, `docs/index.html` (T02 packet) | FIX-08, FIX-62 | Either order; disjoint lines (the two deleted-script file-list entries and **every** T02-AC06 mirror, `docs/index.html:2700`, `:2704`, `:2745` included, are FIX-08's; the three remaining file-list entries are FIX-62's), located by content rather than line number |
| `docs/tasks/T26.md`, `tasks.json`, `docs/index.html` (T26 packet) | FIX-13 | **FIX-13 owns the whole packet**, including all five T26-AC01 "fail CI" locations (`T26.md:41`, `tasks.json:1478`, `docs/index.html:4002`, `:4006`, `:4038`) under **D17**. FIX-47 edits none of them |
| `docs/tasks/T27.md`, `tasks.json`, `docs/index.html` (T27 packet) | FIX-39, FIX-46 | **FIX-39 first** (section 4, Phase G); the two must never run concurrently (`FIX-39.md:67-69`, and `FIX-46.md:285` gates its own edit on **FIX-46-AC00**, "Do this only after confirming `FIX-39` has already landed"). The packet edits are `FIX-39.md:545` §5 and `FIX-46.md:283` §6. FIX-36b separately owns the wrong `docs/mi-bolt/spec/` path prefix in the same packet |
| `docs/index.html` (the whole file) | thirteen tasks name it — `grep -l 'docs/index.html' docs/fix/FIX-*.md` | **One at a time, never concurrent**, and every task locates its own span with `grep -o` rather than by line number: any edit shifts every citation after it. The packet-mirror spans are ruled in the four packet rows above; `:5224` and `:5279-5301` are **FIX-47**'s and no other task's |
| `docs/spec/components.md` | FIX-60 (`:7`), FIX-50 (`:480`) | **FIX-60 owns `components.md:7` outright.** Two decisions edit that one physical line — **D16** widens `FilterIdentity`, **D21** extends `CatalogQuery` with `featured?: boolean` — and one-commit-per-task cannot split one line, so `FIX-60` carries both in its single commit. **FIX-50 owns `:480`** under **D11**, adding `error:UiProblem\|null` to `MobileBuyRail`'s signal inputs (`FIX-50.md:523-535`, item 5, and **FIX-50-AC09** at `FIX-50.md:859-864`). Those two lines are the only edits any task makes to this file |

### Phase F — responsive and accessibility

FIX-26, FIX-27, FIX-28, FIX-30 and FIX-52 are independent of each other, except that
**FIX-27** and **FIX-28** both edit `src/app/core/navigation/header-nav.scss` — disjoint
regions (`:219-221` and `:1-5`), never concurrent; see the one-file collision table
above.

- **FIX-29 and FIX-43** both change the catalogue's hidden test-only input. Whichever
  lands first, re-run axe afterwards and record the result in that commit body; FIX-43's
  file already says what each order means.
- **FIX-29** owns the unused `@axe-core/playwright` dependency and the false claim in
  `e2e/a11y/keyboard.spec.ts`'s header comment that `state-matrix.spec.ts` and the
  per-page unit suites cover axe. **FIX-48** owns line 34 of that file and nothing else.
  The two files disagree on the comment's exact line range, so read it before editing.

### Phase G — documentation and governance, last

- **FIX-36 then FIX-36b, back to back, with nothing between them.** Between the two
  commits the documentation contradicts itself, and the user accepted that window when
  they chose smaller commits (D9). FIX-36 goes first because `docs/README.md` is where a
  reader starts; FIX-36b owns the tree-wide check that no wrong `docs/mi-bolt/<x>` prefix
  survives, which cannot pass until both have landed.
- **FIX-38 before FIX-53**, so the one summary document **D19** item 4 makes FIX-53's
  deliverable (*"FIX-53: 31 helyett 1 összegző"* — "FIX-53: one summary instead of 31",
  replacing the 31 separate execution records the design first called for) can cite a real
  `skill-location.json` instead of recording the provenance gap.
- **FIX-54 before FIX-49 and before FIX-40**, because it is the one that carries decision
  **D14**: it removes the `/mi-bolt/` sub-path deployment, which includes rewriting
  T28-AC02 and the `/mi-bolt/` clause in `docs/spec/architecture.md:159`. FIX-49 builds
  `resolveAssetUrl` against that architecture line and depends on FIX-54 keeping
  `<base href="/">` in `src/index.html` — FIX-49-AC05 stops the task if it has gone.
  FIX-40 records T28-AC02 as it reads on the day it runs, so it needs FIX-54 to have
  settled what that is. **FIX-49 still lands before FIX-40**, so the release record can
  say whether `resolveAssetUrl` exists rather than guessing.
- **FIX-47 runs in Phase A, not last.** D10 had briefly pulled FIX-47 to run first, ahead
  of Stream 1, because it renamed a script every other file cited. **D17** removes that
  rename along with the script it would have renamed — see section 6 — so the reason for
  running FIX-47 first is gone, and it returns to Phase A's ordering, after FIX-01, FIX-04
  and FIX-06.
- **The closing order of this phase is `FIX-39` → `FIX-69` → `FIX-46` → … → `FIX-40` →
  `FIX-53`, and it is settled here rather than in each of the four files.** D17 removes
  `verify:traceability` along with FIX-39's old instruction to re-run it, and rewrites
  FIX-39's subject to removing the thirteen skipped specs and deleting the gate (section 6,
  D17); **writing the missing assertions is `FIX-72`**, split out of FIX-39 because a
  per-criterion judgment pass over seven packets is not the same logical change. FIX-72
  lands after FIX-39 and before FIX-40, so `traceability.md` is written with its results in
  the tree. FIX-46's `no-restricted-syntax` lint rule fails while those
  thirteen skips are still in the tree, so **FIX-46 lands after FIX-39** — the same shape
  as FIX-07 before FIX-08. **FIX-69 lands between them**, or anywhere after FIX-06 and
  before FIX-46: it widens `lintFilePatterns` to the test trees, without which FIX-46's
  rule is installed over files `ng lint` never opens. **FIX-40 lands second-to-last**,
  after every other task except FIX-53: its whole content is a record of the repository's
  state, so it is written once the repairs are in. **FIX-53 lands last**, because
  `FIX-53.md:295-304` item 5 cross-checks its summary against
  `docs/mi-bolt/execution/traceability.md`, which FIX-40 creates. One consequence is
  stated here so no file has to re-derive it: FIX-39 runs before FIX-40, so the T29
  packet FIX-40 writes does not exist when FIX-39 runs, and FIX-39 reports RQ19 and RQ20
  as unimplemented work owned by FIX-40 rather than closing them. Its honest deliverable
  is one document whose verdicts are measured and whose gaps are named — not a record of
  verified work. The closing order of this phase is therefore `FIX-39` → `FIX-72` →
  `FIX-46` → … → `FIX-40` → `FIX-53`, with FIX-72 placeable anywhere between FIX-39 and
  FIX-40.

---

## 5. The complete index

All 74 tasks. Streams 1–8 are the package's own grouping. FIX-07b and FIX-36b were created
by the D9 split; FIX-41 to FIX-53 were created by D8 after the first 40 files landed;
FIX-54 to FIX-61 by D12, D13 and D14 after the first 55 and this index landed; FIX-62 by
D19 item 1 after the first 61 and this index landed; FIX-63 to FIX-68 by D15, D16 and D20
after the first 62 and this index landed; FIX-69 by review finding S1-4 after the first 68
and this index landed; FIX-70 to FIX-72 by decision D25 after the first 69 and this index
landed. Each is placed in the stream whose subject it shares.

**Twelve of the rows below are marked ¶: eight were written by a parallel agent while this
index was being updated, and four (FIX-63, FIX-64, FIX-65, FIX-66) were written alongside
this update by sibling writer units this session did not read.** In both cases nothing in
this README has read the file its own row describes. Their subject lines come from the
decision record that commissioned them and their stream is this index's judgment, not
theirs. For the acceptance criteria, the file list and the ordering constraints, open the
file — it is authoritative and this row is not. Every `Severity` value in the table below,
¶ or not, is read from the file's own `Severity:` line with the command under the table.
**FIX-67 and FIX-68 carry no ¶: this update wrote both files itself.**

| Task | Subject | Severity | Stream |
|---|---|---|---|
| [FIX-01](FIX-01.md) | Repair the `lint` target so `npm run lint` runs at all | blocker | 1 toolchain and gates |
| [FIX-02](FIX-02.md) | ESLint strictness: type-aware config, `no-unused-vars` back to error, the `shared/ui` override | major | 1 toolchain and gates |
| [FIX-03](FIX-03.md) | Wire Prettier to ESLint and add the format scripts | major | 1 toolchain and gates |
| [FIX-04](FIX-04.md) | Delete the hand-rolled vitest plugin and make `ng test` pass | blocker | 1 toolchain and gates |
| [FIX-05](FIX-05.md) | Add the `engines` field to package.json | minor | 1 toolchain and gates |
| [FIX-47](FIX-47.md) | Prune the npm scripts to the standard commands of the stack | major | 1 toolchain and gates |
| [FIX-69](FIX-69.md) | Widen `lintFilePatterns` so `ng lint` reaches the test trees | major | 1 toolchain and gates |
| [FIX-06](FIX-06.md) | Move the feature specs out of root `tests/` and co-locate them | major | 2 test suite and coverage |
| [FIX-07](FIX-07.md) | Rewrite the six source-text-only spec files as behaviour tests | blocker | 2 test suite and coverage |
| [FIX-07b](FIX-07b.md) | Strip the source-text assertions out of the three mixed spec files | blocker | 2 test suite and coverage |
| [FIX-08](FIX-08.md) | Turn the coverage thresholds on and bring `src/mocks/**` into the gate | blocker | 2 test suite and coverage |
| [FIX-09](FIX-09.md) | Fix the 41 Playwright failures | blocker | 2 test suite and coverage |
| [FIX-48](FIX-48.md) | Stop the e2e a11y suite writing screenshots outside the repository | major | 2 test suite and coverage |
| [FIX-58](FIX-58.md) ¶ | Run the E2E suite in Firefox and WebKit as the spec requires | major | 2 test suite and coverage |
| [FIX-62](FIX-62.md) | Delete the coverage-canary subsystem D19 removed | major | 2 test suite and coverage |
| [FIX-68](FIX-68.md) | Namespace the design-suite screenshot paths by Playwright project | major | 2 test suite and coverage |
| [FIX-10](FIX-10.md) | Make a reload restore the cart | blocker | 3 mock and API layer |
| [FIX-11](FIX-11.md) | Make `api:drift` detect the drift it exists for | blocker | 3 mock and API layer |
| [FIX-12](FIX-12.md) | Stop swallowing the bootstrap failure, and remove the phantom heading it leaves behind | blocker | 3 mock and API layer |
| [FIX-13](FIX-13.md) | Remove `createNodeServer`, the hand-rolled OpenAPI validator, and the unwired operation-parity script | major | 3 mock and API layer |
| [FIX-51](FIX-51.md) | Close the MSW bypass hole, and rename `prepareMocks` to `startMocks` | blocker | 3 mock and API layer |
| [FIX-14](FIX-14.md) | Move the three inline templates and styles into their own files | major | 4 structure and dead code |
| [FIX-15](FIX-15.md) | Delete the dead components and the speculative hook | minor | 4 structure and dead code |
| [FIX-16](FIX-16.md) | Settle `AddToCart`: wire it in or delete it | blocker | 4 structure and dead code |
| [FIX-17](FIX-17.md) | Replace hardcoded colours and spacing with the existing tokens | major | 4 structure and dead code |
| [FIX-43](FIX-43.md) | Remove the test-only affordances and the dead public API from production markup | major | 4 structure and dead code |
| [FIX-50](FIX-50.md) | Bring the component signatures back to `components.md` | major | 4 structure and dead code |
| [FIX-56](FIX-56.md) ¶ | Bring `DeliveryStep`'s signature back to `components.md` | major | 4 structure and dead code |
| [FIX-59](FIX-59.md) ¶ | Finish the Angular-idiom sweep the earlier tasks left behind | major | 4 structure and dead code |
| [FIX-60](FIX-60.md) ¶ | Extract the four named components and give pagination its numbered pages | major | 4 structure and dead code |
| [FIX-63](FIX-63.md) ¶ | Give `ContactStep` and `ReviewStep` the signal inputs the specification declares | major | 4 structure and dead code |
| [FIX-64](FIX-64.md) ¶ | Give `HeroSection`, `CheckoutLayout` and `AppFooter` the signal inputs the specification declares | major | 4 structure and dead code |
| [FIX-65](FIX-65.md) ¶ | Rename `SortMode` to `Sort`, the name the specification gives it | major | 4 structure and dead code |
| [FIX-67](FIX-67.md) | Move `AsyncStatus` out of the price-block primitive into a shared home | minor | 4 structure and dead code |
| [FIX-70](FIX-70.md) | Give `DemoNotice` its `persistenceMode` input and its `memory-warning` state | major | 4 structure and dead code |
| [FIX-18](FIX-18.md) | Home quick-filter links 404 instead of filtering the catalogue | blocker | 5 screen defects |
| [FIX-19](FIX-19.md) | QuantityControl stacks vertically and PriceBlock wraps the currency | major | 5 screen defects |
| [FIX-20](FIX-20.md) | Contact step must validate on continue and must not pre-fill itself | blocker | 5 screen defects |
| [FIX-21](FIX-21.md) | Every cart line is permanently marked busy, so quantity and remove never work | blocker | 5 screen defects |
| [FIX-22](FIX-22.md) | Delivery step: a continue button that does nothing, and internal state printed at the user | blocker | 5 screen defects |
| [FIX-23](FIX-23.md) | Product page: the `?variant=` contract and the not-found state | blocker | 5 screen defects |
| [FIX-24](FIX-24.md) | Catalogue: clearing the filters leaves the URL stale, and the sort control ignores it | major | 5 screen defects |
| [FIX-25](FIX-25.md) | A declined or failed order commit is completely silent | blocker | 5 screen defects |
| [FIX-41](FIX-41.md) | Style the 404 page and give it the catalogue link the spec requires | major | 5 screen defects |
| [FIX-42](FIX-42.md) | Make router fragment navigation work at all | major | 5 screen defects |
| [FIX-44](FIX-44.md) | Stop `DeliveryStep.onConfirm()` swallowing the save failure | blocker | 5 screen defects |
| [FIX-45](FIX-45.md) | Render the product page's breadcrumb, description, stock line and simulation note | major | 5 screen defects |
| [FIX-55](FIX-55.md) ¶ | Make the checkout breadcrumbs navigate without a full page load | blocker | 5 screen defects |
| [FIX-61](FIX-61.md) ¶ | Wire `OrderSubmission` and `PaymentProgress`, and settle the idempotent-retry key | blocker | 5 screen defects |
| [FIX-66](FIX-66.md) ¶ | Consolidate the four idempotency-key generators and stop minting a fresh key per retry | blocker | 5 screen defects |
| [FIX-71](FIX-71.md) | Render real preview images in the product gallery's thumbnail row | major | 5 screen defects |
| [FIX-26](FIX-26.md) | Collapse the product page to one column on mobile and make the buy rail stick | blocker | 6 responsive and accessibility |
| [FIX-27](FIX-27.md) | Fix the three horizontal-overflow bugs | major | 6 responsive and accessibility |
| [FIX-28](FIX-28.md) | Restore the mobile search and fix the tablet featured grid | major | 6 responsive and accessibility |
| [FIX-29](FIX-29.md) | Fix the structural accessibility violations axe reports | blocker | 6 responsive and accessibility |
| [FIX-30](FIX-30.md) | Restore focus after a dialog closes and focus the drawer heading on open | major | 6 responsive and accessibility |
| [FIX-31](FIX-31.md) | Fix the secondary text that fails AA contrast on the cart page | major | 6 responsive and accessibility |
| [FIX-32](FIX-32.md) | Settle and fix add-to-cart under touch emulation | major (provisional) | 6 responsive and accessibility |
| [FIX-52](FIX-52.md) | Stop overriding the user's font size, and settle the skip link | major | 6 responsive and accessibility |
| [FIX-33](FIX-33.md) | Rebuild the home page to the prototype | major | 7 design and prototype fidelity |
| [FIX-34](FIX-34.md) | Put every page on one centerline and one spacing scale | major | 7 design and prototype fidelity |
| [FIX-35](FIX-35.md) | Correct the UI copy to the text the spec requires | major | 7 design and prototype fidelity |
| [FIX-36](FIX-36.md) | Correct docs/README.md, the asset manifest and the dead prompt references | major | 8 documentation and governance |
| [FIX-36b](FIX-36b.md) | Correct the 31 task packets' `docs/mi-bolt/…` path citations | major | 8 documentation and governance |
| [FIX-37](FIX-37.md) | Rewrite AGENTS.md | blocker | 8 documentation and governance |
| [FIX-38](FIX-38.md) | Create skill-location.json and delete the unwired verification script | blocker | 8 documentation and governance |
| [FIX-39](FIX-39.md) | Delete the traceability gate and remove the thirteen skipped specs | major | 8 documentation and governance |
| [FIX-40](FIX-40.md) | Make the static release and the handover real | blocker | 8 documentation and governance |
| [FIX-46](FIX-46.md) | Move the test-policy check into ESLint and delete the bespoke gate | blocker | 8 documentation and governance |
| [FIX-49](FIX-49.md) | Build `resolveAssetUrl` and complete the asset manifest | major | 8 documentation and governance |
| [FIX-53](FIX-53.md) | Write one honest acceptance summary instead of 31 empty-verdict files | major | 8 documentation and governance |
| [FIX-54](FIX-54.md) ¶ | Drop the `/mi-bolt/` sub-path deployment | blocker | 8 documentation and governance |
| [FIX-57](FIX-57.md) ¶ | Create the missing `design-review.md` | major | 8 documentation and governance |
| [FIX-72](FIX-72.md) | Close the reachable unreached acceptance criteria with real assertions | major | 8 documentation and governance |

Severities are counted the same way. `grep -h "^Severity:" docs/fix/FIX-*.md | sort |
uniq -c` alone returns four buckets rather than three, because FIX-32's line carries a
clause after the word; strip it first:

```bash
grep -h "^Severity:" docs/fix/FIX-*.md | sed 's/^Severity: //; s/[,.].*$//' | sort | uniq -c
```

which returned 28 blocker, 39 major and 3 minor on 2026-09-17.

FIX-32's severity is recorded as provisional in its own file: the defect it describes is
unconfirmed, and its first phase may close the task unchanged.

---

## 6. The decisions the user made

These were settled with the user before and during the writing of the package. They are
not reopened by any task.

**D1 — The specification wins, always.** Asked which side is authoritative where the code
and `docs/spec/components.md` disagree, the user answered: *"nem ertem a kerdest elmondtam
hogy a doc mappa tartalmazza a specifikaciot akkor mi kerdes?"* ("I do not understand the
question, I said the doc folder contains the specification, so what is the question?").
`docs/` is the specification; where the code differs, the code is wrong and the task
changes the code. No task may edit a spec document to match the implementation.

**D2 — The flat `docs/` layout stays; the documentation is what gets corrected.**
`docs/README.md:5-21` describes a `docs/mi-bolt/{…}` tree that does not exist, and
`docs/design/asset-manifest.json`'s four `path` values are broken the same way. Fix the
documents, do not move the directories. `docs/mi-bolt/execution/` stays exactly where it
is, because `.claude/CLAUDE.md` names that path and the files under it by name.

**D3 — Delete the references to `VEGREHAJTASI-PROMPT.hu.md`.** The file exists nowhere in
the repository. The user's answer: *"ezt torold"* ("delete this"). Three references go:
`docs/README.md:4`, `docs/tasks/README.md:5`, `docs/spec/execution-rules.md:25`. The file
is not reconstructed.

**D4 — Rewrite `AGENTS.md`.** Its first 432 lines are near-verbatim the orchestrator's own
`.claude/CLAUDE.md`, and `grep -n "mi-bolt-design" AGENTS.md` returns zero hits, so
T00-AC04 is unmet. The second half of D4 — creating `.claude/rules/` — was **withdrawn**
after the user supplied those files themselves: *"claude.md -t allitsd vissza bemasoltam a
rulest"* ("restore claude.md, I have copied the rules in"). No task is written for it.

**D5 — Cart and order storage moves out of the app layer and into the mock layer.** The
user raised it themselves: *"a cart bongeszo storage csak cache, mert backendnek kene
vissza adnia ami most mock msw server. ha nem kell a bongeszo storaget kivehetjuk, mi
legyen?"* ("the cart's browser storage is only a cache, because the backend should be
returning it, and right now that is the mock MSW server. If we do not need the browser
storage we can take it out — what should it be?"). They chose **"App-ból ki, mockba be"**
("out of the app, into the mock"). MSW is a service worker inside the browser, not a
server, so the mock itself must persist. **FIX-10** carries all three parts and they are
needed together.

**D6 — The demo strip goes back in.** Commit `8c88d45` removed it citing a user
instruction given during a browser verification, but the removed component's background
was light (`#F5F6F7`) with an orange DEMÓ badge — exactly what the reference rendering
shows — so the instruction cannot have been aimed at it. The user's answer: **"Vissza kell
tenni"** ("it has to be put back"). **FIX-33** item 2 builds it to `screens.md:33`.

**D7 — The traceability gate learns what the specification already says.** Ten of the 43
unreached criteria describe the optional 3D viewer, which `execution-rules.md:17` puts
behind separate approval and `T16-AC05` forbids in the baseline, while
`scripts/check-traceability.mjs` has no concept of `optional: true` and its
`taskRegex = /\b(T\d{2})\b/` can never match `O01`. The user's answer: **"Gate tanulja
meg"** ("let the gate learn it"). **FIX-39** teaches the gate. **The 3D viewer is not
approved and is not built.** **Decision D17, below, later deletes the gate itself rather
than teaching it** — D7's substance is still met, because with `verify:traceability` gone
nothing counts the ten optional-3D criteria as failures either; see D17.

**D8 — The 15 unowned defects get their own task files.** The user's answer: **"Kerüljenek
be taskba"** ("they go into tasks"), citing their own earlier rule: *"nem hagyunk hátra
ismert hibát"* ("we do not leave a known bug behind"). That produced FIX-41 to FIX-53.

**D9 — Both oversized tasks are split.** The user's answer: **"Mindkettő felosztva"**
("split both"). FIX-07 became FIX-07 plus FIX-07b; FIX-36 became FIX-36 plus FIX-36b. The
temporary documentation inconsistency between the FIX-36 and FIX-36b commits is accepted:
the user chose smaller commits over a consistent intermediate state. FIX-06 stays whole —
a half-moved suite is half-collected.

**D10 — The specification's name wins too, not only its behaviour.** Two D1 conflicts
turned out to be about identifiers rather than behaviour: `docs/spec/testing.md:109` says
"Implement these **exact** package scripts" and names `verify:traceability`,
`verify:skill` and `verify:budgets`, while the repository has `check:traceability` and
FIX-38 and FIX-40 were going to create `skill:verify` and `check:budgets`; and
`docs/tasks/T05.md:29` declares `startMocks(): Promise<void>` where
`src/core/bootstrap-demo.ts:36` exports `prepareMocks(): Promise<string>`. The user's
answer: **"A spec neve nyer"** ("the spec's name wins"). **D1 takes no exception for
identifiers.** **FIX-47** was going to rename `check:traceability` to `verify:traceability`
and run first for that reason (section 4); **FIX-38** was going to create `verify:skill`
and **FIX-40** `verify:budgets` — **D17**, below, deletes all three scripts outright
instead, so none of the three renames or creations happens and the "runs first" ordering
no longer applies. **FIX-51**'s Part 2 renames `prepareMocks` to `startMocks`, returning
`void`, which costs nothing because its one call site discards the value already.
`.claude/rules/code-standards.md`'s naming rule is satisfied by either spelling, so no
second rule argues against D1 here and the question is not reopened. Two script **files**
keep their names, `scripts/check-traceability.mjs` and `scripts/check-budgets.mjs`:
`testing.md:109` fixes package scripts and says nothing about file names. **Decision D17,
below, later removes `verify:traceability` and `verify:budgets` entirely, along with the
`.mjs` files behind them and the "runs first" ordering this paragraph describes** — the
ordering no longer applies because the rename it existed for no longer happens; see D17.

**D11 — `MobileBuyRail` gains an `error` input, and this is the package's one spec
edit.** `docs/spec/components.md:480` gives the rail the inputs `money`, `available` and
`pending`, and `:486` lists `error` among its required states, so no declared input can
put it in one. `AddToCartControl` carries exactly the missing input at `:450`. The user's
answer: **"Kapjon error bemenetet"** ("give it an error input"). `components.md:480` gains
`error:UiProblem|null` and **FIX-50** builds all five states. **This is a change to a
specification document and D1 is not weakened by it:** D1 forbids a *task* from bending
the specification towards the implementation, and this is the *user* repairing a document
that contradicted itself, for a component the repository does not have at all. No other
task may cite it as a precedent.

**D12 — Cross-browser E2E gets its own task.** `docs/spec/testing.md:125` requires a
`test:e2e:browsers` command while `playwright.config.ts:66-81` declares two projects that
are **both Chromium**, and FIX-47 refused to ship a Chromium-only run under that name. The
user's answer: **"Kapjon saját taskot"** ("give it its own task"). That is **FIX-58**.

**D13 — The remaining seven unowned defects get task files.** The user's answer: **"Mind
kapjon taskot"** ("all of them get a task"), on the same ground as D8: *"nem hagyunk hátra
ismert hibát"* ("we do not leave a known bug behind"). That produced **FIX-55** to
**FIX-57** and **FIX-59** to **FIX-61**, alongside D12's FIX-58 and D14's FIX-54.

**D14 — The `/mi-bolt/` sub-path deployment is dropped.** The user added, unprompted:
**"es base href-et torroljuk, nem kell"** ("and let's delete the base href, we don't need
it"). That settles a release blocker by removing the requirement rather than building it:
`src/app/app.config.ts:28-31` provides `APP_BASE_HREF` as
`environment.apiBase === '/api/v1' ? '/' : '/mi-bolt/'` and all three environment files set
`apiBase: '/api/v1'`, so the sub-path arm was unreachable in every shipped configuration.
**FIX-54** owns the removal, T28-AC02's `/mi-bolt/` half included. **`<base href="/">` in
`src/index.html:6` is not deleted, and FIX-54 states that deviation in its own words:** the
browser resolves every relative URL in the document against it, `favicon.ico` included, so
removing the tag would make a deep link request the favicon from the route's own path. What
the user does not need is the sub-path machinery. Two consequences land in existing files:
**FIX-49** loses the sub-path as a reason to build `resolveAssetUrl` but keeps the
"no untrusted remote image fetch" rule `architecture.md:159` states, so it is reduced
rather than dropped; **FIX-40** stops recording T28-AC02's `/mi-bolt/` half as an honest
failure and instead measures the criterion as it reads on the day it runs.

**D15 — Every newly surfaced unowned defect gets a task file, a third time.** Answering the
question about the 14 unowned defects the FIX-54..FIX-61 run surfaced, the user's words:
**"Mind kapjon taskot"** ("all of them get a task") — the same answer as **D8** and again as
**D13**, now a standing disposition rather than a one-off. The 14, and who owns each now:
`ContactStep` and `ReviewStep` signature drift against `components.md:555-557` and `:615`
(**FIX-63**); `HeroSection`, `CheckoutLayout` and `AppFooter` signature drift against
`components.md:255`, `:60` and `:90` (**FIX-64**); `SortMode` versus the specification's
`Sort` at `catalog-query.ts:22` (**FIX-65**); `CatalogQuery.featured` absent from
`components.md:7` — settled separately as a specification edit, see **D21** (**FIX-60**
carries it, not FIX-65); `FilterIdentity`'s self-contradiction — settled separately,
see **D16**; `freshIdempotencyKey` declared four times with two different fallbacks, the two
**FIX-61** does not already merge (**FIX-66**); `createPaymentIntent()` and two cart
mutations minting a fresh idempotency key per call (**FIX-66**); `AsyncStatus` declared
inside the `price-block` primitive (**FIX-67**); `cart-line.ts:6`'s NgOptimizedImage claim,
already a side effect of **FIX-59**; `e2e/design/screenshots/` paths carrying no project
segment (**FIX-68**); and the documented pipeline's missing browser-install stage, which
**D17** below supersedes outright by removing the documented pipeline it belonged to. Every
one of the 14 is therefore owned, superseded, or settled — none is left on the unowned list
in section 7.

**D16 — `FilterIdentity` gains the two names the specification cannot express.**
`docs/spec/components.md:7` types `FilterIdentity` as `{name: keyof CatalogFilters; …}`,
but two of the eight rendered filter chips are `q` (which belongs to `CatalogQuery`, not
`CatalogFilters`) and `featured` (which is in no specification type at all), so the
document contradicts itself about its own component. The user's words: **"Spec bővítés,
mint a D11-nél"** ("spec extension, as with D11"). `FilterIdentity` at `components.md:7`
widens to `{name: keyof CatalogFilters | 'q' | 'featured'; value?:string|number}`. **This
has exactly the standing D11 has and no more**: it is a change to a specification document,
which **D1** forbids a *task* from proposing, and it is allowed here only because the
**user** decided it, on a document that already contradicted itself. **D1 is not weakened,
and no task may cite this as a precedent for editing a spec to match an implementation.**
**FIX-60** owns `AppliedFilters` and carries the edit: all eight chips it renders now move
into the component, replacing that file's own earlier, narrower proposal — six chips into
the component, `q` and `featured` left to the page — which this decision supersedes.

**D17 — The plan is over-engineered: standard scripts, and no CI at all.** Two of the
user's sentences, in the order they arrived. First, on CI: *"semmilyen ci nem kell azokat
torold"* ("no CI of any kind is needed, delete those"). There is no `.github/workflows/`
directory to delete; CI existed only in `docs/spec/testing.md`'s text, in
`docs/tasks/T02.md`'s and `docs/tasks/T26.md`'s acceptance criteria, and in their
`tasks.json` and `docs/index.html` mirrors — all of it prose, not implementation. Second,
and wider: *"nem kell ennyi script es npm parancs sem, standardek kellenek lint, test,
coverage stb, plan tul lett tervezve javitasd"* ("this many scripts and npm commands are
not needed either; standards are what is needed — lint, test, coverage and so on; the plan
was over-engineered, fix it"). `docs/spec/testing.md:113-130` named eighteen `npm run`
scripts against `package.json`'s sixteen, overlapping in six, a 28-name union; this
decision keeps **eleven** —
`ng`, `start`, `build`, `watch`, `test`, `lint`, `format`, `format:check`, `build:e2e`,
`api:generate`, `api:drift` — the standard commands of the stack under their own names
(`ng lint`, `ng test`, `ng build`, `ng serve`, `playwright test`, `ng-openapi-gen`,
`prettier`), and removes the rest as gates this project invented for itself instead of
using what the CLI, the builder and Playwright already provide. **FIX-47** (rewritten; see
section 5) prunes `package.json` and rewrites `docs/spec/testing.md` section 7 to those
eleven; the task that owned each removed gate's reason to exist — **FIX-05**, **FIX-08**,
**FIX-11**, **FIX-13**, **FIX-38**, **FIX-39**, **FIX-40** and **FIX-46** — also deletes the
`scripts/*.mjs` file behind it in the same commit, so a removed `npm run` entry never
leaves an unreachable script on disk. **`scripts/` goes from fourteen files to one**:
`scripts/serve-static.mjs` survives, because it is a server rather than a gate —
`playwright.config.ts` names it as its `webServer` command, and it implements the SPA
fallback, the `/api/*` 404 `problem+json` policy and the `no-cache`/`immutable` split that
T28-AC02 and T28-AC03 require.

**D17 narrows D7, D10 and D12; it reverses none of them.** D10 ("a spec neve nyer" — the
spec's name wins) keeps binding every command that survives — `api:generate`, `api:drift`,
`lint` and `build:e2e` all keep exactly the spelling `testing.md:112-130` gives them — and
simply has no name left to argue about for the commands D17 removes, so no rename happens
here. D7 ("Gate tanulja meg") is *satisfied* rather than contradicted: its substance was
that the ten optional-3D criteria must not count as failures, and with
`verify:traceability` gone, nothing counts them at all; the 3D viewer remains unapproved
and unbuilt. D12 ("Kapjon saját taskot") stands in full: only the `test:e2e:browsers`
script name goes, and the Firefox and WebKit projects, the browser install and **FIX-58**
all stay.

**D18 — No `-xhigh` agent for the rest of this run.** The user's words:
*"nem kell xhigh tipusu agennt! ne allittsd le ami fut!"* ("no xhigh type agent is needed!
do not stop the one that is running!"). This governs how the D17 design and this package's
writer units were routed, not the package's content: the design that produced D17 through
D19 was produced by `architect-opus-xhigh`, already running when the instruction arrived
and left to finish, and every spawn after it used the base `opus` or `sonnet` rung instead.

**D19 — The answers that closed D17's design.** The D17 design (`architect-opus-xhigh`)
left several items open for the user; the full decision log records each answer in full,
summarised here: (1) the separate E2E source-coverage requirement is removed — the user's
answer, **"Menjen, a funkcionális suite marad"** ("let it go, the functional suite
stays") — `test:e2e:coverage`, `coverage:e2e:check`, the coverage-canary fixtures and
specs, and the `/canary` route all go, while the three-browser functional E2E suite and
**D12** are untouched; (2) `docs/spec/coverage-policy.json` **stays** — its only reader is
gone, but the user did not choose to delete the file, and **FIX-46** records that in its
own text; (3) `format:check` **stays**, which is why the survivor count above is eleven and
not the design's original ten; (4) the user's answer, **"FIX-53: 31 helyett 1 összegző"**
("FIX-53: one summary instead of 31") — **FIX-53**'s thirty-one execution records become
one summary document instead; (5) the user's answer, **"A FIX-58 törölje"** ("let FIX-58
delete it") — **FIX-58** deletes the false CI-workflow clause at
`playwright.config.ts:23` — the one edit D17 makes outside `docs/`; (6) the user's answer,
**"Négy sor a devDependencies-be"** ("four lines into devDependencies") — four packages
(`js-yaml`, `ajv`, `ajv-formats`, `@apidevtools/json-schema-ref-parser`) are declared in
`devDependencies` inside **FIX-13**, because `tests/contract/` imports them directly and
survives every deletion; `istanbul-lib-coverage` is **not** declared, because its only
importer is deleted along with `scripts/check-coverage.mjs`.

**D20 — The three consequences of deleting the coverage canary.** All three answered as
recommended, and all three are the same rule applied three times:
`.claude/rules/code-standards.md`, "A cut feature leaves nothing behind." **(1)**
`api:drift` gains a second command and stays script-free. The user chose "Egészítsük ki,
marad script nélkül" ("let us complete it, it stays script-free"). The design's
replacement, `npm run api:generate && git diff --exit-code -- src/app/api/generated`, does
not see a **new, untracked** generated file, because `git diff` reads tracked files only,
so the gate gains a second plain git command,
`git ls-files --others --exclude-standard -- src/app/api/generated`, which must print
nothing. Two standard git commands, no script. **Owner: FIX-11.** **(2)** Scenario E004
leaves the specification. The user chose "Az E004 is törlődik" ("E004 is deleted too").
`docs/spec/test-scenarios.md:10` and `docs/tasks/test-scenarios.json:65-66` name the
coverage canary as scenario E004, and **D19** item 1 deletes the subsystem, so the scenario
describes something that will not exist. This is a specification edit with the standing
**D11**, **D14** and **D16** established — the **user** decided it — and **D1** is not
weakened. The `docs/index.html` mirror goes with it. **Owner: FIX-62.** **(3)** The
open-socket assertions move rather than die. The user chose "Átköltöztetjük a megmaradó
tesztbe" ("we move them into the test that survives"). `docs/spec/testing.md:53` and
T02-AC05 require that no WebSocket stays open and no HTTP request stays pending at the end
of a run; the two assertions and their two helpers move out of the deleted
`e2e/coverage-canary.spec.ts` / `e2e/fixtures/coverage.ts` and into
`e2e/network-isolation.spec.ts`, which survives. No specification line changes; only where
the proof lives. **Owner: FIX-62.** Three further consequences needed no decision, because
an existing rule already settled them, and are routed rather than asked: **FIX-06** stops
planning to move the two coverage-canary spec files **FIX-62** deletes; **FIX-51-AC01**'s
`/canary?branch=true` fallback is retargeted at a route that survives; and three stale
comments naming the deleted subsystem (`tests/setup-msw.ts:2`, `vitest.config.ts:3`,
`src/mocks/browser.ts:8`) go with it, owned by **FIX-62**.

**D21 — `featured` stays, and `components.md:7` gains it.** The user's words, after asking
what the field actually is (**"nem ertem mi ez a mezo"** — "I do not understand what this
field is") and being shown the measurement: **"Marad, a components.md kiegészül"** ("it
stays, `components.md` is extended").

The FIX-65 brief had said `CatalogQuery.featured` was code drifting from the specification,
to be deleted under **D1**. A writer agent measured it and refuted that: `docs/api/openapi.yaml:117`
declares `featured` as a real `listProducts` query parameter; the generated SDK carries it
(`src/app/api/generated/fn/catalog/list-products.ts:40` and `:60`); the mock implements it
against the demo config's four featured slugs (`src/mocks/catalog/filter-products.ts:157-159`,
`src/mocks/catalog/catalog.handlers.ts:62`); and the app is wired end to end
(`catalog-query.ts:60`, `catalog.facade.ts:144`, `:353`, `catalog-page.ts:840-841`'s
removable "Kiemelt termékek" chip). This was never code-versus-specification, which **D1**
settles — it was **one specification document contradicting another**, `openapi.yaml`
declaring the parameter and `components.md:7`'s hand-written `CatalogQuery` type omitting
it, and **D1** does not reach that case, which is why it went to the user.

`docs/spec/components.md:7`'s `CatalogQuery` gains `featured?: boolean`, so the two
specification documents agree. This is a specification edit with exactly the standing
**D11**, **D14**, **D16**, **D17**, **D19** and **D20** have — the **user** decided it — and
**D1** is not weakened.

**Consequences:**
1. **FIX-65 loses its second half.** It becomes the `SortMode` → `Sort` rename only, which
   **D10** already settled, and its `featured` deletion is removed outright rather than
   reworded.
2. **`components.md:7` is one physical line carrying every shared type, and two decisions
   now edit it**: **D16** widens `FilterIdentity`, **D21** extends `CatalogQuery`. Two tasks
   cannot edit one line under one-commit-per-task, so **FIX-60 owns `docs/spec/components.md:7`
   outright** and carries both edits in its single commit. Every other task points at
   **FIX-60** by number.
3. **D16 is confirmed rather than narrowed.** It assumed `featured` survives as a nameable
   chip, and it does.

**One finding recorded, not acted on.** Nothing in the interface can turn the filter on:
there is no checkbox in the filter panel and no link from the home page's "Kiemelt
készülékek" section, so `?featured=true` is reachable only by a hand-typed URL or a deep
link. The user was offered a task that would add the link and did not choose it, so **no
task adds one**; this paragraph is the record that it was seen and left.

**D22 — The eight-to-thirteen acceptance-criterion band is not a gate.** Three files sit
below the band the package's own files established for themselves: **FIX-01** and
**FIX-48** with seven criteria each, and **FIX-65** with five after **D21** removed its
second half. **Nothing is padded to reach eight.**
`.claude/rules/planning-deliverables.md` settles this: "An agent-chosen number is a
proposal, never a gate… it may not fail a phase, block a commit, or appear in an exit
criterion until the user has agreed to it." The band was chosen by the agents who wrote
the first files, not by the user, not by the task and not by a rule file, so it is an
expectation and not a threshold; a small task with five honestly checkable criteria is not
padded to reach a round number, which is exactly the apparatus the user's own instruction
— *"plan tul lett tervezve javitasd"* ("the plan was over-engineered, fix it") — told this
session to remove. What the band is still good for is a smell test a review round applies:
a file far below it is asked whether it left something unverified, and a file far above it
is asked whether it is two tasks; neither question is answered by the count alone.

**D23 — One convention for the R01–R26 record: the commit body.** A review round measured
the package carrying two incompatible conventions: thirty-six task files required a
per-task record at `docs/mi-bolt/execution/tasks/FIX-NN.md`; thirty-four recorded R01–R26
in the commit body. The user was shown both readings of `.claude/CLAUDE.md` — which names
`Txx.md` and not `FIX-NN.md` — and chose: **"Commit body, mind a 70-nél"** ("the commit
body, for all seventy"). **Every task records R01–R26 in its own commit body. No task
creates a file under `docs/mi-bolt/execution/tasks/`.** The thirty-six files that required
the record-file lose that instruction and the acceptance criterion that mandated it; where
a file carried both halves — a criterion for the record file and a second criterion for
the same findings in the commit body — the commit-body half survives and the other is
deleted rather than merged. This is **D19** item 4 applied to the same shape one directory
deeper: the user had already replaced **FIX-53**'s thirty-one per-task records with a
single summary, and thirty-six record files are that same apparatus under another name.
`.claude/CLAUDE.md`'s sentence is unchanged and still binds the numbered `Txx.md` review
files it names; nothing here weakens it.

**D24 — The orphaned `catalog-page.html` / `catalog-page.scss` pair belongs to FIX-14.**
Commit `1ae1b1c` created `src/app/features/catalog/catalog-page.html` (197 lines) and
`catalog-page.scss` (325 lines), but `catalog-page.ts` still declares an inline `template:`
at `:66` and `styles:` at `:266` and no `templateUrl` / `styleUrl`, so neither extracted
file is compiled into anything; the live markup and styles are the inline copies at
`catalog-page.ts:69-73` and `:295-320`. Two task files cited the dead copy as evidence —
`FIX-55.md:72` (`catalog-page.html:4`) and `FIX-45.md:408-410` (the inline template FIX-14
will move, without mentioning the unwired extracted copy FIX-14 would land on top of).
Asked as a finding outside the package's scope, the user chose: **"FIX-14 kapja meg"**
("FIX-14 takes it"). **FIX-14 owns the orphaned pair** alongside the extraction it already
performs, and the same round corrects `FIX-55.md:72` and `FIX-45.md:408-410` so neither
cites a file nothing compiles.

**D25 — Three tasks are split, and the package ends at FIX-72.** The second ruling round
found three task files each carrying two independent pieces of work in one commit, which
`.claude/rules/session-lifecycle.md` ("One commit, one logical change") makes two commits.
The user was shown all three, with the note that the ruling itself called the last of them
the most arguable, and chose: **"Mind a három vágás"** ("all three splits"). **FIX-70**
takes **FIX-50**'s item 6, the `DemoNotice` component: a disjoint file set, a second
prerequisite chain (FIX-33, then FIX-10), and a criterion `FIX-50-AC08` currently permits
to ship unmet inside a commit that claims five components conform. **FIX-71** takes
**FIX-23**'s gallery-thumbnail half: disjoint files (`product-gallery.{html,ts,scss}` and
its spec against `product-page.*` and `product.facade.ts`) and disjoint criteria; it lands
before **FIX-50** item 3, which reshapes the same component's signature. **FIX-72** takes
**FIX-39**'s item 3, the per-criterion judgment pass over roughly twenty-four acceptance
criteria in seven packets, which today shares a commit with a gate deletion, thirteen
per-site assertion rewrites and three documentation mirrors; the Phase G chain becomes
`FIX-39` → `FIX-72` → `FIX-46` → … → `FIX-40` → `FIX-53`. **No work is added.** Each split
moves scope that already existed out of a task that could not hold it, so the package grows
from 72 files to 75 while the sum of the work is unchanged. The package now ends at
**FIX-72**; FIX-73 is the next free number.

---

## 7. What is still open

This package does not hide its gaps, and one kind of gap is left: a defect nobody owns.
Three other kinds have closed. No decision is reserved for the user any more — the three
colliding npm script names and the `startMocks` rename were put to the user and answered
as decision **D10** in section 6. No correction is owed: a review round's list of
corrections to the task files has been applied into the files themselves, so there is no
list to keep in step with them. And no question is left unsettled between two files:
`FIX-49`'s reduction under **D14** is recorded in `FIX-49.md:26-39` and in `FIX-54`'s
section 7, and `tests/layouts.spec.ts` is row 18 of `FIX-06`'s move table
(`FIX-06.md:146`), so what was written here as an unsettled question is a landing order
and lives in the one-file collision table in section 4.

### 7.3 Defects that no task owns

**This list has shrunk, and nothing that left it left by being fixed — every one was given
a number, superseded outright, or settled by the user.** Decisions **D11**, **D12**,
**D13**, **D14**, **D15**, **D16** and **D20** are why; section 6 records all seven.

| What used to be listed here | Who owns it now |
|---|---|
| `components.md:480` contradicting its own required-state line | **FIX-50**, under **D11** |
| The `/mi-bolt/` deployment being unbuildable | **FIX-54**, under **D14** — the requirement was removed rather than built |
| `DeliveryStep`'s signature drift against `components.md:570-572` | **FIX-56** |
| The checkout breadcrumbs using plain `href` instead of `routerLink` | **FIX-55** |
| `UiProblem` having no TypeScript declaration | **FIX-50** declares it at `src/app/shared/types/ui-problem.ts`; `AsyncContent` is **FIX-60**'s |
| `docs/mi-bolt/execution/design-review.md` not existing | **FIX-57** |
| `test:e2e:browsers` claiming three browsers over a Chromium-only config | **FIX-58**, under **D12** |
| `ContactStep` and `ReviewStep` signature drift against `components.md:555-557` and `:615` | **FIX-63**, under **D15** |
| `HeroSection`, `CheckoutLayout` and `AppFooter`'s `compact:boolean` signature drift against `components.md:255`, `:60` and `:90` | **FIX-64**, under **D15** |
| `SortMode` versus the specification's `Sort` (`catalog-query.ts:22`), and `CatalogQuery`'s undeclared `featured` field | **FIX-65**, under **D15** |
| `FilterIdentity` unable to name the `q` and `featured` chips | Settled by the user as **D16** — the specification itself widens; **FIX-60** carries the edit |
| `freshIdempotencyKey` declared four times, and a fresh key minted per retry | **FIX-66**, under **D15** (the two instances **FIX-61** does not already merge) |
| `AsyncStatus` declared inside the `price-block` primitive instead of a shared home | **FIX-67**, under **D15** |
| `e2e/design/screenshots/` paths carrying no Playwright project segment | **FIX-68**, under **D15** |
| The coverage-canary's three consequences (`api:drift`'s untracked-file blind spot, scenario E004, the open-socket assertions) | **FIX-11** and **FIX-62**, under **D20** |

What is left, measured against the files rather than carried over. Each is real, each was
checked in this repository, and none is repaired by this package:

1. **`HeaderNav`'s contract drift against `docs/spec/components.md:71-84`** (A3 finding
   13, the remaining half). The specification gives `AppHeader` the signal inputs
   `cartCount:number; searchQuery:string; compact:boolean` (`:75`) and the outputs
   `searchSubmitted:string; menuRequested:void` (`:77`);
   `src/app/core/navigation/header-nav.ts:39` declares one input, `variant`, and injects
   `CartCountFacade` (`:42`) and `Router` (`:45`) so it navigates itself. **AppFooter's
   half is FIX-64's**, under **D15** item 5; `FIX-42.md:268-274` and `FIX-64.md:389`
   both record the split, and no FIX number closes the `HeaderNav` half.
2. **`docs/tasks/T26.md:41`'s "fail CI", and its two mirrors.** T26-AC01 reads
   *"…missing/extra business routes fail CI."* in `docs/tasks/T26.md:41`, in
   `docs/tasks/tasks.json:1478` and, lower-cased, inside the `data-search` attribute at
   `docs/index.html:4002`. **D17** deletes CI from the specification, and no task owns
   these three: `FIX-47.md:163` assigns them to FIX-13, `FIX-13.md:314-317` refuses them
   and assigns them to a "shared CI-deletion sweep" that is no FIX number. Meanwhile
   `FIX-47.md:165` owns the rendered mirrors at `docs/index.html:4006` and `:4038`, so
   **FIX-47 landing alone leaves `docs/index.html` contradicting its own two sources.**
3. **Nothing widens `lintFilePatterns` past `src/`, so FIX-46's replacement rule never
   reaches `e2e/`.** `FIX-46.md:142` scopes its `no-restricted-syntax` block to
   `['tests/**/*.ts', 'e2e/**/*.ts', 'src/**/*.spec.ts']`, but `FIX-01.md:160-161` sets
   `lintFilePatterns` to `src/**/*.ts` and `src/**/*.html`, and `FIX-01.md:115-117`,
   `FIX-02.md:266-269`, `FIX-03.md:177` and `FIX-06.md:395` each refuse to widen it. All
   thirteen `test.skip(` call sites are under `e2e/` (`grep -rn "test\.skip(" e2e/`), so
   once `scripts/check-test-policy.mjs` is deleted **FIX-46-AC05 passes without checking
   anything** and T27-AC05/AC06 stop being enforced. Widening `lintFilePatterns` also
   needs a TypeScript project that includes `e2e/`, which `tsconfig.app.json:8-13` and
   `tsconfig.spec.json:10-13` do not.

Three items that used to sit in this list have been measured off it, none by being
fixed: **the catalogue's duplicated `.catalog` layout** is `FIX-59`'s (`FIX-59.md:251`,
AC05 and AC06); **the `ɵresolveComponentResources` workaround** is `FIX-59`'s
(`FIX-59.md:276`, AC07) for `src/app/app.routes.ts:44-105` and `FIX-06`'s
(`FIX-06.md:219-256`) for the copy at `tests/setup-msw.ts:57-130`; and **relocating
`src/core/bootstrap-demo.ts`** was not an open defect at all — `FIX-59.md:318-330`
refutes it under **D1**, because `docs/spec/architecture.md:76` puts the file exactly
where it is, and **FIX-59-AC10** requires the commit body to say so. `FIX-12.md:291-293`
and `FIX-15.md:187-189` still call it unowned and are corrected by that ruling.

Four of the first round's entries went elsewhere, and this index has now read the files
rather than their subject lines. The three explicit `ChangeDetectionStrategy.OnPush`
declarations and the two `<img>` without `NgOptimizedImage` are **FIX-59**'s
(`FIX-59.md:176` and `:187`); **the `@ViewChild` is FIX-02's, not FIX-59's** —
`FIX-59.md:307-317` says so in as many words and warns that touching it would put the two
tasks on one line. Extracting `AsyncContent`, `AppliedFilters`, `CatalogToolbar` and
`Pagination` with pagination's missing numbered pages is **FIX-60**'s
(`FIX-60.md:165`, `:209`, `:242`, `:338`). Wiring `OrderSubmission` and `PaymentProgress`
is **FIX-61**'s (`FIX-61.md:233`, `:288`). **The idempotent-retry key policy** is
**FIX-66**'s, under **D15** items 9 and 10.

---

## 8. What this package does not cover

The three browser runs listed what they did not reach, and no task in this package closes
any of it. These are gaps in the audit, not repairs that were deferred:

- **The states reachable only through MSW or network control** — loading, error, empty,
  invalid, declined, expired, price-changed and submitting. Fourteen of them exist as
  reference PNGs only. Cart 409/503, quote-expired, price-changed and payment-declined or
  pending have no UI control that triggers them deterministically without editing code or
  mock configuration. Design rule R19 was therefore judged on one state pair.
- **Dark and auto colour schemes.** Not exercised at all, at any viewport.
- **The 200% text-resize pass** that `docs/spec/testing.md` §6 requires.
- **`prefers-reduced-motion`.**
- **A full keyboard sweep** of all nine screens at all six widths. Dialog focus behaviour
  was covered; the rest was not, and design rule R20's verdict leans on that partial pass.
- **Smaller pieces:** the empty-cart S4.1 layout as its own screenshot, the R17 variant
  switch, the mobile filter drawer opened at 390, and the cart-line defect at 390 (only
  320 was captured).

---

## 9. A note on the working tree

`git status --short`, measured on 2026-09-17 on branch
`feat/mi-bolt-mvp-implementation`, shows seven paths, not the fourteen an earlier
measurement in this section recorded: the seven-file brand scrub this paragraph used to
describe as working-tree changes has since been committed, and none of the seven shows in
`git status --short` any longer. They fall into three groups and only the first is this
work's.

**Seven files this work changed, now committed — the brand scrub.** Commit `29e66f2`
on `feat/mi-bolt-mvp-implementation`, subject `docs: retire the superseded brand name`,
carries `docs/index.html`, `docs/spec/execution-rules.md`, `docs/spec/screens.md`,
`docs/spec/sources.md`, `docs/tasks/T14.md`, `docs/tasks/tasks.json` and
`tests/home-page.spec.ts` (`git show --stat 29e66f2`). That is a deliberate brand scrub
carried out on the user's instruction to rewrite the superseded brand name to "mi-bolt"
everywhere. The instruction is paraphrased here rather than quoted, because quoting it
would put the removed word back into the repository — it now appears nowhere in `docs/`,
`src/`, `tests/`, `e2e/` or `scripts/`. Every occurrence was a sentence *about* the
superseded brand, so the replacement is "a superseded brand" rather than a literal
substitution, which would have made six sentences false and inverted T14-AC01. It is not
stray work, and it is not an executor's to touch or to undo. **FIX-36 rewrites
`docs/index.html`; its replacement text must not reintroduce the old wording.**

`git show --numstat 29e66f2` does **not** return equal additions and deletions in every
file, as an earlier measurement in this paragraph claimed. Six files are line for line —
`docs/index.html` 6/6, `docs/spec/execution-rules.md` 1/1, `docs/spec/screens.md` 1/1,
`docs/spec/sources.md` 1/1, `docs/tasks/T14.md` 1/1, `docs/tasks/tasks.json` 1/1 — and one
is not: `tests/home-page.spec.ts` is **10 added against 4 removed**, and the commit's own
`--stat` totals **21 insertions(+), 15 deletions(-)** across the seven files, not
"fourteen lines in all". `tests/home-page.spec.ts` changed twice in the one commit: the
brand rewrite, and a repair to the `T14-AC01` test it sits under. That test's old
assertion guarded the criterion's absence half by matching the retired token, which cannot
survive a scrub that removes the token, so it now covers the presence half instead, the
`it` block is renamed to say so, and an **eight**-line comment records that the absence
half is guaranteed by the token being absent from the repository rather than by an
assertion (`git show 29e66f2 -- tests/home-page.spec.ts`, counted directly). The commit
body describes that comment as six lines; a reader comparing the two should take the count
measured here, not the one in the commit body.

That the six documentation files change line for line still means every `file:line`
citation elsewhere in this package into one of *those six* still resolves. It did not hold
for the seventh: the commit's one hunk replaced old lines 357–366 (10 lines) with new lines
357–372 (16 lines), a net +6, so a citation into `tests/home-page.spec.ts` at or past old
line 367 pointed six lines short of its target. Checked against every
`tests/home-page.spec.ts` citation in `docs/fix/` (`grep -rn 'home-page.spec.ts'
docs/fix/`), four were stale this way: **FIX-07b.md:131**'s `tests/home-page.spec.ts` table
row cited the last four of its five `describe`-block line numbers as `:375`, `:452`,
`:592`, `:639`. **FIX-45.md:428** cited `tests/home-page.spec.ts:465` for the
`provideRouter([], withComponentInputBinding())` call. **FIX-44.md:343** cited
`tests/home-page.spec.ts:466` for the `{ provide: Api, useValue: api }` line, and
**FIX-44.md:348** cited `tests/home-page.spec.ts:469-477` for the `styleUrl`-stripping
block. All four have since been re-measured against the file and corrected: FIX-07b.md's
row now reads `:314`, `:381`, `:458`, `:598`, `:645`; FIX-45.md now cites `:471`; and
FIX-44.md now cites `:472` and `:475-483`. Every other citation of this file in `docs/fix/`
names a line at or before 357 (FIX-15.md and FIX-18.md) or names no line number at all, and
neither kind moved or needed repair.

**Six files this work did not change.** `.claude/settings.json` shows as modified; its
whole diff is one added line, `"feedbackDrafts": false`, which is a Claude Code client
setting and has nothing to do with this package or with the brand scrub. The five files
under `.claude/rules/` — `browser-verification.md`, `code-standards.md`,
`parallel-spawns.md`, `planning-deliverables.md` and `session-lifecycle.md` — are staged
additions the **user** supplied, which is why decision **D4**'s second half was withdrawn
and no task is written for them. None of the six is an executor's to touch, to stage or
to undo either, and none of them is evidence about this package.

**`docs/fix/` itself is untracked.** `git ls-files docs/fix | wc -l` returns `0`. Every
`docs/fix/FIX-NN.md` citation inside another file in this package therefore resolves
against the working tree and not against git history, and a line number quoted from a
pre-rewrite version of one of these files resolves against nothing at all.
