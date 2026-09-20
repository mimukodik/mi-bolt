# FIX-69 — Widen lintFilePatterns so ng lint reaches the test trees

Status: DONE — `angular.json`'s `lintFilePatterns` now includes `tests/**/*.ts` and `e2e/**/*.ts`, `eslint.config.js`'s first block is narrowed to `src/**/*.ts` and a non-type-aware block added for the two widened trees; commits 4f71230 and 20254c1. The widened run surfaced two files with findings and both are fixed: `tests/contract/operation-matrix.spec.ts` (dead imports/vars/functions plus an `any` cast that was removable outright, `OpenApiSpec.paths` already being typed through the existing `SpecPaths` type), and `e2e/deployment/deep-links.spec.ts:40`, where the unused `request` fixture was dropped from the destructure rather than renamed — the `^_` ignore convention lives only on the `src/**/*.ts` block, so `_request` was still flagged. `npm run lint` exits 0 with zero errors; the 27 remaining warnings are FIX-02's pre-existing unused-eslint-disable directives under `src/app/api/generated/**`.
Severity: major
Source: Review round finding **S1-4**, which named `docs/fix/FIX-01.md`'s "Widening
`lintFilePatterns`" bullet as stale (it pointed at `FIX-39` for a test-policy gate that
**D17** later deleted) and observed that the widening itself "still has no owner
anywhere." `FIX-02.md` and `FIX-06.md` each carry the same kind of "not this task's"
bullet, for their own correct reasons. This task is the owner the finding asked for.

## Why this is wrong

`docs/spec/testing.md:118` puts `npm run lint` in the mandatory pipeline as
*"TS/templates/boundaries/test-policy lint"* — one command that is supposed to cover the
test-policy rule as well as the application source. **FIX-46** gives `eslint.config.js` a
`no-restricted-syntax` block that expresses that rule, scoped to
`files: ['tests/**/*.ts', 'e2e/**/*.ts', 'src/**/*.spec.ts']`. But `angular.json`'s `lint`
target — the thing `npm run lint` actually invokes — never passes a file under `tests/` or
`e2e/` to ESLint in the first place. **FIX-01** sets `lintFilePatterns` to
`["src/**/*.ts", "src/**/*.html"]` and says so explicitly, for a reason that was correct
when it was written: neither TypeScript project covers those two trees, and **FIX-02**
turns on type-aware linting immediately afterwards, which needs every linted file to
belong to a project.

The consequence: **FIX-46**'s rule is installed over a set of files `ng lint` never opens.
Its own acceptance criterion, "`npm run lint` exits 0", passes whether or not a single
`test.skip(` call is in the tree, because ESLint is never asked to look at the file that
contains one. Nothing in the package would catch that — it is a criterion passing for the
wrong reason, not a criterion failing.

Neither of the two tasks that could have widened the patterns should have: **FIX-02**
refuses because the two trees belong to no TypeScript project and its type-aware `extends`
would fail on them; **FIX-06** refuses because it is still deciding what lives under
`tests/` at the point it runs. Both refusals stay correct. What was missing was a task
whose whole job is the widening, landing after both of those questions are settled and
before the rule that needs the reach.

## Evidence

`angular.json:113-117`, the `lint` target as it stands after `FIX-01` (measured on this
branch, `feat/mi-bolt-mvp-implementation`, working tree at the time of reading):

```json
        "lint": {
          "builder": "@angular-eslint/builder:lint",
          "options": {
          }
        }
```

`angular.json`'s `lint.options` is still empty in the repository today because nothing in
this package has been executed; the citation above is the target as **FIX-01** leaves it,
quoted from that task's own "What to change" section, and is what this task's prerequisite
check confirms before it starts.

`tsconfig.app.json`, read in full:

```json
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "src/**/*.spec.ts"
  ]
```

`tsconfig.spec.json`, read in full:

```json
  "include": [
    "src/**/*.d.ts",
    "src/**/*.spec.ts"
  ]
```

Neither includes a file under `tests/` or `e2e/`; the root `tsconfig.json` is
solution-style (`"files": []`, `references` to those two only). This is why **FIX-02**'s
type-aware `extends` cannot be pointed at those trees without a project of their own — see
"Rejected alternative" below for the option this task does not take.

`eslint.config.js`, read in full (82 lines) as it stands before **FIX-02** and **FIX-46**
land: three `files` blocks, `**/*.ts` at `:9`, `src/app/shared/ui/**/*.ts` at `:59`,
`**/*.html` at `:73`; the file closes with `]);` at `:82`. **FIX-02**'s own "What to
change" turns the first block's `parserOptions` on and leaves its `files` value as
`['**/*.ts']`; that value is what this task narrows.

All thirteen `test.skip(` call sites the package's test-policy rule exists to catch are
under `e2e/` today: `grep -n "test\.skip(" e2e/a11y/keyboard.spec.ts
e2e/design/state-matrix.spec.ts e2e/design/viewport-matrix.spec.ts | wc -l` prints `13`.
None of the three files is under `src/`, so none of them is inside `angular.json`'s
current `lintFilePatterns` at all — the `no-restricted-syntax` rule **FIX-46** installs has
nothing to run against until this task lands.

`scripts/` holds fourteen files today (`find scripts -maxdepth 1 -type f | wc -l`). D17's
package-wide plan reduces that to one survivor, `scripts/serve-static.mjs` — a server, not
a gate — which is why `scripts/**` is never added to `lintFilePatterns` by this task.

## What to change

Three files, in this order.

### 1. `angular.json` — widen `lintFilePatterns`

Replace the `lint` target quoted in Evidence above with:

```json
        "lint": {
          "builder": "@angular-eslint/builder:lint",
          "options": {
            "lintFilePatterns": [
              "src/**/*.ts",
              "src/**/*.html",
              "tests/**/*.ts",
              "e2e/**/*.ts"
            ]
          }
        }
```

Keep the surrounding JSON exactly as it is; do not reformat any other part of
`angular.json`. `scripts/**` is deliberately absent — see Evidence above.

### 2. `eslint.config.js` — narrow the type-aware block, add a non-type-aware one

Two edits, made together so the file is never in a state where either block is missing.

**a. Narrow the first block's `files`.** By the time this task runs, **FIX-02** has turned
the first block (`eslint.config.js:8-52` in the layout quoted in Evidence) into a
type-aware configuration with `languageOptions.parserOptions.projectService: true`. Change
that block's `files` value from `['**/*.ts']` to `['src/**/*.ts']`. This is the change that
keeps the project service pointed only at files that belong to a TypeScript project; widen
`lintFilePatterns` without it and `ng lint` fails on every file under `tests/` and `e2e/`
with a project-service error before a single rule runs.

**b. Insert a new, non-type-aware block for the two widened trees.** Insert it immediately
after the first block's closing `},` and before the `src/app/shared/ui/**/*.ts` override
opens (the boundary between what is `eslint.config.js:52` and `:58` in the layout quoted in
Evidence):

```js
  {
    // FIX-69 widens `lintFilePatterns` (angular.json) to include `tests/**/*.ts`
    // and `e2e/**/*.ts`. Neither tree belongs to a TypeScript project
    // (tsconfig.app.json and tsconfig.spec.json both include only `src/`), so
    // this block gives ESLint the non-type-aware presets rather than the
    // type-aware `extends` above — without a matching block at all, ESLint
    // reports "File ignored because no matching configuration was supplied"
    // for every file in these two trees and the widening buys nothing. FIX-46
    // adds a second, later block matching these same two trees plus
    // `src/**/*.spec.ts` that carries the `no-restricted-syntax` test-policy
    // rule; this block carries no rule of its own.
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
```

No `parserOptions`, no `processor`, no `rules` key. `eslint.configs.recommended` and
`tseslint.configs.recommended` are already imported at the top of the file (`eslint` and
`tseslint`); this block adds no new import and no new dependency.

### 3. Any file under `tests/` or `e2e/` that the first widened lint run reports a violation in

**Repair the code, never the rule; do not add an `eslint-disable` anywhere.** Nobody has
run ESLint over these two trees before — `grep -rlc 'eslint-disable' tests e2e` returning
nothing today is the closest thing to a baseline, and it does not predict what the
`recommended` presets will find once they are asked to look. Draw the line on what this
task fixes itself by what kind of change the fix is, not by a count:

- **A same-shape mechanical fix** — an unused import, a variable that needs the project's
  `^_` prefix convention, a stray `console.log`, a `let` that should be `const` — is this
  task's to make, in this commit, with the file and the rule it violated named individually
  in the commit body.
- **Anything that would change what a test asserts, remove a test, or touch a file this
  task does not otherwise own** is not this task's to guess at. Stop before committing,
  list every such file with its rule and the exact ESLint message in the report, and hand
  the list to the orchestrator rather than inventing a fix. This is the same boundary
  `.claude/CLAUDE.md` ("Simplicity first", "Think before coding") draws for every task in
  this package: a config change is not licence to redesign a test.

Record, in the commit body, either the empty list ("first widened run reported zero
violations under `tests/` or `e2e/`") or the full list of files repaired, in both cases
together with the complete `npm run lint` output.

## Out of scope

- **`src/app/api/generated/**`.** Already inside `src/**/*.ts`; this task changes nothing
  about how it is linted.
- **`scripts/**`.** Never added — see Evidence.
- **Adding `eslint-plugin-vitest` or `eslint-plugin-playwright`.** Not needed for the
  `recommended` presets this task adds, and not this task's to introduce.
- **`FIX-46`'s `no-restricted-syntax` block.** This task gives that rule somewhere to run;
  it does not write the rule itself.
- **Any `tsconfig*.json`.** No new TypeScript project is created for `tests/` or `e2e/` —
  see "Rejected alternative" below for why.
- **What `ng test` or `ng build` compiles.** Unchanged; this task touches lint
  configuration only.
- **The thirteen `test.skip(` call sites under `e2e/`.** `FIX-39` removes them; this task
  neither depends on that removal nor performs any part of it — see "Where this sits in the
  stream".

## How to verify

Run from the repository root. The package manager is **npm**; there is no pnpm and no mise
in this repository.

1. **Confirm the prerequisites are on the branch** before making any change:
   `grep -c '"lintFilePatterns"' angular.json` must print `1` (FIX-01 landed);
   `grep -c 'projectService' eslint.config.js` must print a non-zero count (FIX-02 landed);
   if either prints `0`, stop and report rather than starting.
2. Apply the three edits above.
3. `npm run lint`

   Record the full output in the commit body. Exit `0` is the target; if it is non-zero,
   follow "What to change" item 3 above for every reported file before committing.
4. `npx eslint e2e/a11y/keyboard.spec.ts`

   Must exit `0` and its output must name that file, proving both `angular.json`'s widened
   patterns and `eslint.config.js`'s new block reach it. Record the command and its output
   verbatim — this is the one file in the package a reader can check by hand, since it is
   also the file `FIX-39`'s test-policy removal touches.
5. `npm run build` — must exit `0`, unchanged.
6. `npm run test` — must exit `0` or fail for a reason already attributed to another task
   (`FIX-04`, `FIX-08`); this task's own three-file diff does not change what `ng test`
   compiles.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records the
design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it). Cite
it from there; do not restate it here.

**This task edits a build-tool configuration file and a lint configuration file, and its
one conditional item repairs code only to satisfy an ESLint rule already in force
elsewhere in the repository. Nothing it touches is rendered in a browser, so
`.claude/rules/browser-verification.md`'s exemption applies and is claimed here
explicitly.** That is why no acceptance criterion below is a browser check.

- **R26 applies**: the commit body names both edited files, the exact edits made to each,
  the full `npm run lint` and `npx eslint e2e/a11y/keyboard.spec.ts` output, and either the
  empty-violation-list statement or the full list of files repaired with their rules.
  **FIX-69-AC09** requires it.
- R01–R25: N/A. The change widens which files two build tools read; it introduces no
  brand asset, imagery, layout, spacing, colour, type, copy, price, data source, state
  machine, target size, breakpoint, dialog or persistence behaviour, and renders nothing a
  person can see.

## Acceptance criteria

- [ ] **FIX-69-AC01** `grep -c '"tests/\*\*/\*.ts"' angular.json` prints `1` and
      `grep -c '"e2e/\*\*/\*.ts"' angular.json` prints `1`; `grep -c 'scripts/' angular.json`
      prints `0`.
- [ ] **FIX-69-AC02** `grep -c "files: \['src/\*\*/\*.ts'\]" eslint.config.js` prints `1`
      and `grep -c "files: \['\*\*/\*.ts'\]" eslint.config.js` prints `0`.
- [ ] **FIX-69-AC03** `grep -c "files: \['tests/\*\*/\*.ts', 'e2e/\*\*/\*.ts'\]"
      eslint.config.js` prints `1`, and the block it heads carries no `parserOptions` key:
      `sed -n '/tests\/\*\*\/\*.ts/,/^  },/p' eslint.config.js | grep -c parserOptions`
      prints `0`.
- [ ] **FIX-69-AC04** `npm run lint` exits `0`, and its full output is in the commit body.
      If it exits non-zero, every reported file and rule is listed in the commit body per
      "What to change" item 3 and repaired in this same commit where the fix is a
      same-shape mechanical one; a `parserOptions` / project-service error naming a file
      under `tests/` or `e2e/` means the narrowing in AC02 was not applied — fix that
      rather than adding a `tsconfig`.
- [ ] **FIX-69-AC05** `npx eslint e2e/a11y/keyboard.spec.ts` exits `0` and its output names
      that file, proving `ng lint`'s new patterns and ESLint's own config both reach it.
      Record the command and its output.
- [ ] **FIX-69-AC06** `npm run build` exits `0` and `npm run test` exits `0` or fails only
      for a reason already attributed to `FIX-04` or `FIX-08`, both unchanged from
      immediately before this commit. `git status --short` lists only `angular.json`,
      `eslint.config.js` and the files named in the commit body under `tests/` or `e2e/`.
      No `tsconfig*.json` appears.
- [ ] **FIX-69-AC07** The commit body records why no `tsconfig` was added: the only rule
      that needs this reach is `FIX-46`'s `no-restricted-syntax`, a syntactic rule
      requiring no type information, so the two trees are linted without the project
      service rather than being given a TypeScript project of their own.
- [ ] **FIX-69-AC08** Browser-verification exemption claimed in writing, with its reason:
      this task edits a build-tool configuration and a lint configuration and reaches no
      rendered surface, so `.claude/rules/browser-verification.md`'s exemption applies.
- [ ] **FIX-69-AC09** The commit body carries the R01–R26 table with every N/A reason, the
      exemption from AC08, and the full command output for AC04 and AC05, per **D23**: the
      record lives in the commit body and no file is created under
      `docs/mi-bolt/execution/tasks/`.

## Commit

This task is exactly one commit: the `angular.json` and `eslint.config.js` edits, plus
whichever files under `tests/` or `e2e/` the first widened lint run required a same-shape
mechanical fix in. Do not bundle it with `FIX-01`, `FIX-02`, `FIX-06`, `FIX-46` or any other
FIX task. Commit only after every acceptance criterion above passes.

The commit body carries: the full `npm run lint` output, the `npx eslint
e2e/a11y/keyboard.spec.ts` output, the reason no `tsconfig` was added, and either the
empty-violation-list statement or the full list of repaired files with their rules.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```text
chore: widen lintFilePatterns so ng lint reaches the test trees
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**Prerequisites, in this order: `FIX-01`, `FIX-02`, `FIX-03`, `FIX-04`, `FIX-06`.** `FIX-01`
creates `lintFilePatterns`; `FIX-02` adds the type-aware block this task narrows; `FIX-03`
places `eslint-config-prettier` last in the same `extends` array, which this task's new
block must not disturb; `FIX-04` makes `ng test` pass, which AC06 checks is undisturbed;
`FIX-06` settles what lives under `tests/` before this task decides to lint all of it. If
any prerequisite is missing, stop and report.

**This task lands before `FIX-46`.** `FIX-46`'s `no-restricted-syntax` block is scoped to
`tests/**/*.ts`, `e2e/**/*.ts` and `src/**/*.spec.ts`; until this task has widened
`lintFilePatterns`, `ng lint` never opens a file under `tests/` or `e2e/` and that rule
would be installed over files nothing lints. It can land anywhere after `FIX-06` and
before `FIX-46` — it does not need `FIX-39` to have landed first, because it adds no rule
of its own that the thirteen `test.skip(` sites under `e2e/` would trip.

## Rejected alternative

Give `tests/` and `e2e/` a TypeScript project of their own — a new `tsconfig.lint.json`
extending `./tsconfig.json` with `include: ["tests/**/*.ts", "e2e/**/*.ts"]`, added to the
root `tsconfig.json`'s `references`, and keep `eslint.config.js`'s first block as
`files: ['**/*.ts']` with its type-aware `extends` reaching both trees directly. Rejected
on two counts: it buys type-aware linting of two trees nobody asked for, and whether
`typescript-eslint`'s `projectService` resolves a referenced project for a file outside
every `include` for the project it already knows about is not settled by reading — the
command that would settle it is `npx eslint e2e/a11y/keyboard.spec.ts` after the change,
which is exactly **FIX-69-AC05** above, run against the narrower design instead.
