# FIX-02 — ESLint strictness: type-aware config, `no-unused-vars` back to error, the `shared/ui` override

Status: PARTIAL — f990255, <pending>. Open: the unauthorised `reportUnusedDisableDirectives: 'off'` has been removed from eslint.config.js. Without it, `npm run lint` exits 0 but does not print "All files pass linting.": it reports 27 "Unused eslint-disable directive (no problems were reported)" warnings, one per file, all at `1:1`, all under `src/app/api/generated/**` (the same 27 whose header FIX-11 restored) — `strictTypeChecked` triggers no rule in any of them, so the file-wide `/* eslint-disable */` FIX-11 put there is reported unused. Per this doc's own "do not repair, do not add an ignores entry ... stop and report against FIX-11" instruction, AC01 is not met and this is reported against FIX-11 rather than resolved here.
Severity: major
Source: A1 C1, A1 C2, A1 C3

## Why this is wrong

The user asked for this in these words: *"Lintet is állitsd be strict -re és legyen
prettierrel összekötve"*. Three separate things in `eslint.config.js` defeat that.
First, the config extends only the non-type-aware presets, so not one rule that needs
type information is active — which is the whole family of rules that catches the `any`
leakage `CLAUDE.md` and `docs/spec/architecture.md:25` (strict TS) demand. Second, the
config downgrades `@typescript-eslint/no-unused-vars` from `error` to `warn`, twice, and
the lint builder does not fail on warnings, so that rule can never fail the gate. Third,
an override switches `@angular-eslint/prefer-signals` off for a whole directory on a
justification that is **factually false** about that directory's contents, which cancels
exactly the modernization `docs/tasks/T01.md:49` (T01-AC03) exists to enforce and that
`docs/spec/acceptance.md:7` (AC03) states as a release requirement.

## Evidence

### C1 — no type-aware linting at all

`eslint.config.js:8-16`:

```js
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
```

There is no `languageOptions.parserOptions` anywhere in the file (the file is 82 lines;
read it end to end and confirm). `recommended` and `stylistic` are the presets
typescript-eslint publishes as *not* requiring type information. The installed package
ships the type-aware presets alongside them — confirmed by listing
`node_modules/@typescript-eslint/eslint-plugin/dist/configs/flat/`, which contains
`strict-type-checked.js`, `recommended-type-checked.js` and `stylistic-type-checked.js`.
None is referenced.

Installed version, read from `node_modules/typescript-eslint/package.json`: **8.69.0**.
The `projectService` parser option exists in that version —
`node_modules/@typescript-eslint/types/dist/parser-options.d.ts:62`:

```ts
    projectService?: boolean | ProjectServiceOptions;
```

### C2 — `no-unused-vars` downgraded to a warning, twice

`eslint.config.js:43-50`:

```js
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
```

and byte-for-byte the same block again at `eslint.config.js:62-69`, inside the
`src/app/shared/ui/**` override.

The installed preset ships it as an error —
`node_modules/@typescript-eslint/eslint-plugin/dist/configs/flat/recommended.js:41-42`:

```js
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'error',
```

A warning cannot fail this gate. `node_modules/@angular-eslint/builder/dist/lint.impl.js`
returns `success: options.force || (totalErrors === 0 && !tooManyWarnings)`, and
`maxWarnings` defaults to `-1` in the builder schema, which disables the warning limit
entirely. So every unused variable and unused import in `src/` is, today, permanently
invisible to `npm run lint`.

The `argsIgnorePattern: '^_'` exemptions are legitimate and stay: `CanMatchFn` and
`CanActivateFn` take parameters a guard body may not consume. Only the severity is wrong.

### C3 — the `src/app/shared/ui/**` override rests on a false statement

`eslint.config.js:53-71`:

```js
  // Pre-existing shared UI primitives were authored against an earlier
  // Angular style (decorator-based `@Input()`, `ChangeDetectionStrategy.OnPush`,
  // `@ViewChild`). Carrying them over to the modern signal-based form is
  // out of scope for T01; relax the modern rules for that path so the
  // workspace lint stays green while T07/T25 rework them as a unit.
  {
    files: ['src/app/shared/ui/**/*.ts'],
    rules: {
      '@angular-eslint/prefer-signals': 'off',
      '@typescript-eslint/no-unused-vars': [ 'warn', /* … */ ],
    },
  },
```

The comment names three things. Two of them do not exist anywhere in that tree and the
third exists once. Measured with
`grep -rn "@Input()\|@Output()\|@ViewChild\|ChangeDetectionStrategy" src/app/shared/ui/`,
which returns three lines, of which two are prose inside a doc comment and one is code:

```text
src/app/shared/ui/accessible-dialog/accessible-dialog.ts:78:  @ViewChild('body', { static: true })
```

Zero `@Input()`, zero `@Output()`, zero `ChangeDetectionStrategy`. The override
suppresses a rule across **eleven spec files and their components** to accommodate a
single line.

The one line, `src/app/shared/ui/accessible-dialog/accessible-dialog.ts:70-79`:

```ts
  /**
   * `@ViewChild` is the JIT-friendly view-query API: the JIT compiler
   * (the only path available under vitest without an Angular linker)
   * reads `propDecorators` for property-level `@ViewChild` and
   * `@Input` annotations. The vitest transformer in `vitest.config.ts`
   * ensures those entries reach the JIT compiler; signal-based
   * `viewChild()` only works under AOT.
   */
  @ViewChild('body', { static: true })
  private readonly body!: TemplateRef<unknown>;
```

The stated reason is the hand-rolled JIT transformer in `vitest.config.ts`. **FIX-04
deletes that transformer and puts the suite on Angular's own AOT build pipeline**, which
is the condition the comment itself names as the one under which `viewChild()` works.
That is why FIX-04 must land before this task.

## What to change

Three files.

### 1. `eslint.config.js` — the `**/*.ts` block, lines 8 to 52

Replace the `extends` array at `:10-15` and add a `languageOptions` block. The block
header becomes:

```js
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    processor: angular.processInlineTemplates,
```

**The decision, so the executor does not have to choose.** `strictTypeChecked`, not
`recommendedTypeChecked`: the user's word was *"strict"*. `projectService: true`, not a
list of `project` paths: it is the option typescript-eslint 8 publishes for this, and it
resolves each linted file against whichever project already claims it, which here is
`tsconfig.app.json` for source and `tsconfig.spec.json` for specs. `__dirname` is
correct and available because `eslint.config.js` is a CommonJS file (`:2-5` use
`require`, `:7` uses `module.exports`).

Then, at `eslint.config.js:43-50`, change the severity and nothing else:

```js
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
```

Keep the explanatory comment at `:38-42` above it; it is still true.

### 2. `eslint.config.js` — delete the override at lines 53 to 71 entirely

Remove the comment block at `:53-57` and the whole config object at `:58-71`. The array
goes straight from the `**/*.ts` block to the `**/*.html` block. Nothing replaces it: the
narrower repair is the one in file 3, not a narrower override.

### 3. `src/app/shared/ui/accessible-dialog/accessible-dialog.ts`

Migrate the single view query to the signal API, which is what makes deleting the
override legitimate rather than merely convenient. Three edits in this file.

At `:1-11`, drop `ViewChild` from the import list and add `viewChild`:

```ts
import {
  Component,
  ElementRef,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
```

At `:70-79`, replace the doc comment and the decorated field with:

```ts
  /** The projected dialog panel, handed to the CDK when the dialog opens. */
  private readonly body = viewChild.required<TemplateRef<unknown>>('body');
```

At `:104`, the one call site, read the signal:

```ts
    this.ref = this.dialog.open(this.body(), {
```

`viewChild.required` is the correct replacement for `@ViewChild('body', { static: true })`
here because `#body` is the root element of the template
(`src/app/shared/ui/accessible-dialog/accessible-dialog.html:1`, `<ng-template #body>`)
and is not inside any `@if` / `@for` block, so the query always resolves. There is
exactly one read of the field; `grep -n "this.body" src/app/shared/ui/accessible-dialog/accessible-dialog.ts`
returns one line and it is `:104`.

### Expect to touch more source files than these three, and do not promise a number

`npm run lint` has never executed in this repository (see FIX-01). Turning on
`strictTypeChecked` on top of first execution will report violations across `src/`, and
**nobody knows how many.** Do not write a count into this file, into the plan or into the
commit body before running the command. When the command runs, every violation it
reports inside `src/` is this task's to repair, **with one tree excepted and with these
rules:**

**The exception is `src/app/api/generated/**`, and it is not a suppression.** Those 56
files are machine-written and their second line reads
`/* Code generated by ng-openapi-gen DO NOT EDIT. */`; what keeps them out of the rule
set is the `/* eslint-disable */` header on line 1, which 27 of the 56 have lost by
hand. **`FIX-11` restores it and must have landed before this task runs** — see "Where
this sits in the stream". If `npm run lint` reports a violation under that path, do not
repair the file, do not add an `ignores` entry to `eslint.config.js` and do not add an
`eslint-disable` comment: FIX-11 has not landed, or its regeneration is incomplete.
Stop, record the reported `file:line` list, and report it against FIX-11.
`FIX-11.md:118-125` rules out the `ignores` route in its own words, so this task must
not take it either.

- Repair the code, never the rule. Do not add `eslint-disable`, do not lower a severity,
  do not add a new `files:` override, do not add an entry to any ignore list. Those are
  the "silent relaxations" `docs/spec/testing.md:11-18` forbids.
- `as` is forbidden by `.claude/rules/code-standards.md`; use `satisfies`. `any` is
  forbidden; use `unknown` plus a type guard, and write a type guard if none of the
  project's existing ones fits.
- If a violation can only be fixed by changing behaviour a different FIX task owns, do
  not fix it here. Record the `file:line`, the rule, and the owning FIX number in the
  commit body, and leave it. Do not suppress it.

## Out of scope

- **Adding `lintFilePatterns` — FIX-01.** That must already be in place.
- **Prettier, `eslint-config-prettier`, `format` / `format:check` — FIX-03.** Do not add
  any dependency to `package.json` in this task. FIX-03 places
  `eslint-config-prettier` **last** in this same array; leave room for it by not
  reordering the array beyond what is written above.
- **`vitest.config.ts`, `angular.json`'s `test` target, and making the suite run —
  FIX-04.**
- **Widening `lintFilePatterns` to `tests/**` or `e2e/**` — `FIX-69`.** Those trees
  belong to no TypeScript project today (`tsconfig.app.json:8-13` and
  `tsconfig.spec.json:10-13` both include only `src/`), so the `projectService` this task
  turns on would fail on them. **FIX-69** owns the widening and narrows this task's
  `files: ['**/*.ts']` block to `files: ['src/**/*.ts']` when it does, so the type-aware
  configuration keeps exactly the reach it has here. Not this task's to widen, and nothing
  here is written so as to be undone there. `scripts/**` is never widened to.
- **The other nine components under `src/app/shared/ui/`.** They contain no legacy
  decorator; deleting the override does not require editing them. If lint reports a
  `prefer-signals` violation in one of them, that is a real finding — fix it here, since
  this task is what turned the rule back on for that tree.
- **`@angular-eslint/template/*` rules and the `**/*.html` block at `:72-81`.** Unchanged.

## How to verify

From the repository root, npm only.

1. `npm run lint`

   Must exit **0** and print `All files pass linting.` A non-zero exit means violations
   remain; repair them under the rules above and run it again. This is the task's
   primary gate and it is a real loop, not a single pass.

2. `npm run build`

   Must exit **0**. This proves the `viewChild()` migration compiles under the real
   Angular compiler with `strictTemplates` (`tsconfig.json:19`).

3. The scoped spec — must exit **0**:

   ```bash
   npx ng test --include=src/app/shared/ui/accessible-dialog/accessible-dialog.spec.ts
   ```

   That spec opens the dialog through the host component and asserts on
   `data-testid="dialog-body"`, so it is the direct proof that `viewChild.required`
   resolves and the CDK still receives the template. **This step is only meaningful
   after FIX-04 has landed**; if it is still failing with
   `ReferenceError: document is not defined`, FIX-04 has not landed and this task must
   not be started.

   Separately, run `npm run test` for the whole suite and record its exit code and
   failure list in the commit body per **FIX-02-AC05**. Its exit code is not gated:
   **FIX-04** owns the 14-of-14 baseline failure that makes the whole suite red today.

4. Confirm the override is gone:
   `grep -c "shared/ui" eslint.config.js` must print `0`.

5. Confirm the decorator is gone:
   `grep -rn "@ViewChild" src/` must print nothing.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npx playwright test` (**FIX-09**). `npm run lint` is this task's own subject, not a gate deferred elsewhere: FIX-01 makes the command run at all and this task is what makes it exit `0`, per step 1 above. `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — is not gated by this task: **FIX-04** owns the 14-of-14 baseline failure that makes the whole suite red today, and this task's own gate is the scoped run in step 3 below / **FIX-02-AC05**, which requires FIX-04 to have landed first. Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-02-AC01** `npm run lint` exits `0` and prints `All files pass linting.` with
      no `eslint-disable` comment added anywhere in `src/` by this commit. Check the
      second half with `git diff --staged | grep -c "eslint-disable"`, which must print
      `0`. This criterion requires **FIX-11** to have landed; until it does, the generated
      SDK is linted without its `/* eslint-disable */` header and no legal edit makes the
      command green. If `FIX-11` has not landed, do not report AC01 as met and do not
      commit.
- [ ] **FIX-02-AC02** `eslint.config.js`'s `**/*.ts` block extends
      `tseslint.configs.strictTypeChecked` and `tseslint.configs.stylisticTypeChecked`,
      and carries `languageOptions.parserOptions.projectService: true` with
      `tsconfigRootDir: __dirname`. Neither `tseslint.configs.recommended` nor
      `tseslint.configs.stylistic` appears in the file any more.
- [ ] **FIX-02-AC03** `grep -n "no-unused-vars" eslint.config.js` returns exactly one
      line, and the severity on the following line is `'error'`. The duplicate
      declaration is gone with the override.
- [ ] **FIX-02-AC04** `grep -c "shared/ui" eslint.config.js` prints `0`, and
      `grep -rn "@ViewChild" src/` prints nothing.
- [ ] **FIX-02-AC05** `npm run build` exits `0`, and the one spec this task's `viewChild()`
      migration touches is collected and green:
      ```bash
      npx ng test --include=src/app/shared/ui/accessible-dialog/accessible-dialog.spec.ts
      ```
      must exit `0` with that file reported as passing. `npm run test`'s **whole-suite** exit
      code is recorded in the commit body, not gated: **FIX-04** owns the 14-of-14 baseline
      failure that makes the suite red today and states in its own words (`FIX-04.md:383-398`)
      that its remaining failures are recorded and attributed rather than repaired, so
      requiring a green suite here would be requiring something no landed task delivers. List
      every remaining failure as `file — test name — one-line symptom` with its owning FIX
      number.

      This criterion requires **FIX-04** to have landed; until it does, the scoped run fails
      with `ReferenceError: document is not defined` like every other `src/**` spec
      (`BASELINE.md:10`) and this task must not report AC05 as met.
- [ ] **FIX-02-AC06** **Real-browser check, mandatory.** The `viewChild()` migration
      changes how the dialog panel reaches the CDK, which is something a person can see.
      Per `.claude/rules/browser-verification.md` this is done in a real Chrome through
      the `real-browser-sonnet` agent, not by reading the diff and not by a green unit
      test. Route: `/primitives`, at viewport width **1440**. Interaction: inside
      the card `data-testid="showcase-accessibledialog"`
      (`src/app/features/primitives-showcase/primitives-showcase.html:98`), click the
      button labelled `Dialógus megnyitása` (`:102`). Proof required: `take_snapshot`
      shows an element with `role="dialog"`, `aria-modal="true"` and the accessible name
      `Megerősítés`; its body text reads
      `A dialógus tárolja a fókuszt és a háttér kizárásra kerül.` (`:111`); a close
      button `data-testid="dialog-close"` with the accessible name `Bezárás` is inside it
      (`src/app/shared/ui/accessible-dialog/accessible-dialog.html:11-17`); pressing
      `Escape` removes the dialog from the snapshot and returns focus to the trigger;
      `list_console_messages` reports **zero** errors, before and after. Capture a
      screenshot of the open state.
      **Note:** `/primitives` does not render today — the route is declared after the
      `**` wildcard (`src/app/app.routes.ts:181` vs `:194`) and FIX-09 owns that. If
      FIX-09 has not landed, run this criterion against `/` instead and drive whichever
      dialog the page opens; if no dialog is reachable from any working route, record
      that in the commit body as an unmet criterion and do not mark the task accepted —
      do not substitute a unit test for it.
- [ ] **FIX-02-AC07** The `mi-bolt-design` R01–R26 record is in the commit body. **R20
      (keyboard operation, visible focus, meaningful accessible name) and R23 (focus,
      background exclusion, dismissal and focus restoration in modals) are applicable**
      and are what AC06 measures. **R26 applicable and met.** R01–R19, R21, R22, R24 and
      R25 are marked N/A, each with the one-sentence reason that this task changes a lint
      configuration and one view query, and alters no layout, colour, copy, price field
      or commercial claim. Skill provenance is stated once in `docs/fix/README.md`
      section 3, "Every task records the design rules": the installed path, the version,
      and the fact that `docs/mi-bolt/execution/skill-location.json` does not exist yet
      (**FIX-38** owns it). Cite it from there; do not restate it here.
- [ ] **FIX-02-AC08** Any violation left unrepaired is listed in the commit body as
      `file:line — rule — owning FIX number`, and none of them is suppressed in the
      config or in the source.

## Commit

This task is exactly one commit. Do not bundle it with FIX-01, FIX-03 or FIX-04.
Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's `type: summary` style:

```text
fix: type-aware strict ESLint and drop the shared/ui suppression
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**FIX-11 must land first**, and this is a hard prerequisite rather than a preference.
27 of the 56 tracked files under `src/app/api/generated/` have lost the
`/* eslint-disable */` header that keeps generated output out of the rule set
(`FIX-11.md:19`, `FIX-11-AC03`). This task turns on `strictTypeChecked` over
`src/**/*.ts`, which includes that tree, and **FIX-02-AC01** requires a green
`npm run lint` with no `eslint-disable` added — a combination with no legal route to
pass while the header is missing, because repairing the files contradicts their own
`DO NOT EDIT` banner and `api:drift` reverts the repair on its next run. Confirm before
starting: `for f in $(git ls-files src/app/api/generated); do head -1 "$f"; done | sort
| uniq -c` must print one row with count `56`. If it prints two rows, FIX-11 has not
landed — stop and report.

**FIX-01 must land first** — without `lintFilePatterns` the lint command refuses to
start, so nothing in this task can be measured.

**FIX-04 must also land first** — the `@ViewChild` this task migrates is justified in its
own doc comment by the hand-rolled JIT transformer in `vitest.config.ts`, and FIX-04 is
what removes that transformer and puts the suite on the AOT pipeline under which
`viewChild()` works. Starting this task while `npm run test` still fails with
`ReferenceError: document is not defined` means FIX-02-AC05 cannot be checked at all.

**FIX-03 must land after this one**, because it appends `eslint-config-prettier` to the
end of the same array this task rewrites.
