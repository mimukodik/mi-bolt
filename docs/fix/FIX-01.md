# FIX-01 — Repair the `lint` target so `npm run lint` runs at all

Status: DONE — 45edd61. Wires lintFilePatterns so ng lint reaches every source directory it must.
Severity: blocker
Source: A1 B1

## Why this is wrong

`docs/spec/testing.md:118` puts `npm run lint` in the mandatory pipeline
(`npm run lint — TS/templates/boundaries/test-policy lint`). The `lint` target in
`angular.json` omits the one option the `@angular-eslint/builder:lint` schema marks as
required, so the builder rejects the target before ESLint is ever constructed. The
consequence is not "lint is failing": **ESLint has never executed once in this
repository**, so no rule in `eslint.config.js` has ever been applied to a single file.
Under D1 the specification is right and the configuration is wrong.

This is the first task in the whole `docs/fix` package. Nothing that any other task
claims about lint can be checked until this one lands.

## Evidence

`angular.json:113-117` — the lint target as it stands:

```json
        "lint": {
          "builder": "@angular-eslint/builder:lint",
          "options": {
          }
        }
```

`node_modules/@angular-eslint/builder/dist/schema.json`, last two lines of the file —
the literal validator that produces the error:

```json
  "additionalProperties": false,
  "required": ["lintFilePatterns"]
```

Measured by the orchestrator on commit `db6d295`: `npm run lint` exits **1** and prints

```text
Data path "" must have required property 'lintFilePatterns'
```

The schema entry for the missing option, same file:

```json
    "lintFilePatterns": {
      "type": "array",
      "description": "One or more files/dirs/globs to pass directly to ESLint's `lintFiles()` method.",
      "default": [],
      "items": { "type": "string" }
    },
```

The default is `[]`, but the `required` list means the key must be present; an absent
key fails validation before the default can apply.

The three file blocks the repository's own ESLint config declares are
`eslint.config.js:9` (`files: ['**/*.ts']`), `eslint.config.js:59`
(`files: ['src/app/shared/ui/**/*.ts']`, the override **FIX-02** deletes) and
`eslint.config.js:73` (`files: ['**/*.html']`). `angular.json:14` declares
`"sourceRoot": "src"`.

**Because lint has never run, the number of violations it will report is unknown.**
No task in this package may promise a violation count for a first lint run; FIX-02 and
FIX-03 both say so in their own files.

## What to change

One file.

### `angular.json` — lines 113 to 117

Replace the whole `lint` target with:

```json
        "lint": {
          "builder": "@angular-eslint/builder:lint",
          "options": {
            "lintFilePatterns": [
              "src/**/*.ts",
              "src/**/*.html"
            ]
          }
        }
```

Keep the surrounding JSON exactly as it is: the target sits inside
`projects.mi-bolt.architect`, after the `test` target, and the file's trailing braces do
not change. Do not reformat any other part of `angular.json`.

**The decision on which globs to use, so the executor does not have to choose.** The two
patterns above and nothing more. `src` is the declared `sourceRoot` (`angular.json:14`),
and the two patterns line up one-to-one with the two `files` blocks in
`eslint.config.js`. They are deliberately **not** widened to `tests/**`, `e2e/**` or
`scripts/**`: neither `tsconfig.app.json` (`:8-13`, `include: ["src/**/*.ts"]`) nor
`tsconfig.spec.json` (`:10-13`, `include: ["src/**/*.d.ts", "src/**/*.spec.ts"]`) covers
any file outside `src/`, and FIX-02 turns on type-aware linting, which needs every
linted file to belong to a TypeScript project. Widening the patterns before that holds
would turn a first green lint into a wall of parser errors. Widening is deliberately
deferred and is named in "Out of scope" below.

**If the command now reports rule violations, do not fix them in this task and do not
silence them.** Copy the complete output into the commit body and stop. Repairing the
rule set is FIX-02's subject and those violations are its input.

## Out of scope

- **Rule severities, the type-aware configuration and the `src/app/shared/ui/**`
  override — FIX-02.** Do not edit `eslint.config.js` in this task at all.
- **Prettier, `eslint-config-prettier` and the `format` / `format:check` scripts —
  FIX-03.** Do not add a dependency in this task.
- **Any source file ESLint now complains about.** Not one `.ts` or `.html` file under
  `src/` is edited by this task.
- **Widening `lintFilePatterns` to `tests/**` or `e2e/**` — `FIX-69`.** FIX-06 changes
  what lives under `tests/`, and under **D17** the bespoke test-policy gate is deleted and
  its requirement moves into ESLint as **FIX-46**'s `no-restricted-syntax` block, which is
  scoped to `tests/**/*.ts`, `e2e/**/*.ts` and `src/**/*.spec.ts`. That rule reaches
  nothing until the patterns are widened, and **FIX-69** owns the widening, after FIX-06
  and before FIX-46. `scripts/**` is never added: D17 leaves one file there.
- The `test` target immediately above the lint target in `angular.json` — FIX-04.

## How to verify

Run these in order, from the repository root. The package manager is **npm**; there is
no pnpm and no mise in this repository.

1. `npm run lint`

   The exit code may be `0` or `1`. What must be true either way: the output no longer
   contains the string `lintFilePatterns`, and it contains the line

   ```text
   Linting "mi-bolt"...
   ```

   Exit `0` prints `All files pass linting.` Exit `1` prints
   `Lint errors found in the listed files.` above a list of `path:line:column` results
   whose paths start with `src/`. Both of those are a successful outcome **for this
   task**: they prove ESLint ran. (Source for the three strings:
   `node_modules/@angular-eslint/builder/dist/lint.impl.js:34`, `:147` and `:152`.)

2. `npm run build`

   Must exit `0`. This was measured green on `db6d295` and this task must not change it.

3. Save the full stdout and stderr of step 1 into the commit body. If step 1 exits `1`,
   the commit body must also carry the sentence: *"Lint executed for the first time;
   the violations listed are FIX-02's input and are not repaired here."*

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). `npm run lint` is this task's own subject, not a gate deferred elsewhere: whether it exits `0` or `1` once `lintFilePatterns` is added is recorded in the commit body per step 3 above. Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-01-AC01** `npm run lint` produces no occurrence of the string
      `lintFilePatterns` in its combined stdout and stderr. Check with
      `npm run lint 2>&1 | grep -c lintFilePatterns`, which must print `0`.
- [ ] **FIX-01-AC02** `npm run lint` output contains the line `Linting "mi-bolt"...` and
      then either `All files pass linting.` or at least one result line whose path
      starts with `src/`. This is the criterion that proves ESLint executed rather than
      the target merely validating.
- [ ] **FIX-01-AC03** `angular.json`'s `projects.mi-bolt.architect.lint.options` object
      contains exactly one key, `lintFilePatterns`, whose value is the two-element array
      `["src/**/*.ts", "src/**/*.html"]`. No other key is added.
- [ ] **FIX-01-AC04** `npm run build` exits `0`, unchanged from the `db6d295` baseline.
- [ ] **FIX-01-AC05** `git status --short` lists exactly one modified file,
      `angular.json`. No source file, no `eslint.config.js`, no `package.json` and no
      lockfile is touched.
- [ ] **FIX-01-AC06** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change edits one build-configuration key and
      reaches no rendered surface, which is the exemption
      `.claude/rules/browser-verification.md` grants to a build script or a
      configuration file. Per that rule the exemption is stated explicitly rather than
      left out silently.
- [ ] **FIX-01-AC07** The `mi-bolt-design` skill's R01–R26 table is recorded in the
      commit body with R01 through R25 marked **N/A — this task changes one JSON key in
      a build configuration and renders nothing a person can see**, and **R26 applicable
      and met**: the commit body identifies the file changed, the command run, its exit
      code, and the violations left for FIX-02 as a stated remaining limitation. Skill
      provenance is stated once in `docs/fix/README.md` section 3, "Every task records
      the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with FIX-02, FIX-03 or any other FIX
task, however small the diff looks. Commit only after every acceptance criterion above
passes.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `fix: F3 success page receipt fallback
(sessionStorage)`):

```text
fix: add lintFilePatterns so ng lint can run
```

Nothing in this package is pushed by the executor. The push and the pull request belong
to the orchestrating session.

## Where this sits in the stream

**Nothing has to land before this one.** FIX-01 is the first commit of the repair
package.

Of the nine tasks in this stream, **FIX-02 and FIX-03 both depend on FIX-01** and cannot
be verified until it has landed, because neither can measure a rule change through a
command that refuses to start.
