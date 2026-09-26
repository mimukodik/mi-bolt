---
name: mibolt-frontend-code-standards
description: >-
  Fixing lint, format or type errors under frontend/ in MiBolt, reviewing
  TypeScript diffs, or judging whether a pattern is allowed: ESLint rules such
  as strict-boolean-expressions, type assertions, any and cross-app imports,
  tsconfig and template strictness, Prettier, naming, type guards. Load it
  before answering or fixing, since which rules apply differs by folder. Not
  for Java or Gradle code.
---

# MiBolt frontend code standards

Every path here is relative to the repository root. Globs quoted from
`frontend/eslint.config.mjs` or `frontend/angular.json` are relative to
`frontend/`, the way those files write them.

## 1. Scope and hand-offs

**In scope**: every TypeScript, template and style file under `frontend/`: the
storefront, demo-payment and admin apps, the `core-api`, `shop-api` and
`shop-mocks` libraries, `frontend/tests/`, and the lint rules that reach
`frontend/e2e/` and `frontend/playwright.config.ts`.

**Out of scope**, and where each case goes:

- Java and Gradle code under `backend/`: `mibolt-backend-code-standards`.
- Which checks a change needs, the coverage floors and the CI jobs: `mibolt-verification`. This skill names only the commands in section 7.
- Area idioms, such as storefront facades, admin stores, change chains and mock handlers: `mibolt-shop-frontend` and `mibolt-admin-frontend`.
- The generated clients, the contract, and moving code into a shared library: `mibolt-cross-package-changes`.
- Writing or repairing an end-to-end spec: only the `playwright-test-*` agents do that (`.claude/rules/code-standards.md`, "Only the `playwright-test-*` agents write end-to-end tests"), through the `playwright-tests` skill.
- Colour, type, radius and recipe values: `frontend/docs/design/yettel.md`, per `.claude/CLAUDE.md` ("Design authority").

## 2. Evidence model and where the rules live

Every rule in section 5 carries a label, and the label says what breaking it
costs:

- **written**: stated in a rule file, an instruction file or a project document, and binding whether or not a tool checks it.
- **lint**, **tsc**, **prettier**: ESLint, the TypeScript and Angular compilers, or Prettier fails on it, so the gate catches it.
- **observed**: the code does it consistently and no source requires it. Follow it inside an existing file; never cite it as a rule.
- **conflict**: two sources disagree, or the code does what a written rule words differently. Read [references/conflict-register.md](references/conflict-register.md) before changing anything it names.

A rule that is only written is still a rule. The `as` ban is written for the
whole workspace and linted in the admin app alone; the narrower lint scope does
not narrow the rule.

The sources, pointed at rather than copied:

- `.claude/rules/code-standards.md`, "Modern TypeScript" through "Always use the type guards": generic interfaces, `as`, `any`, existing type guards first; `.claude/rules/code-standards.md`, "Well-documented codebase": how much to document.
- `CLAUDE.md` at the repository root: the TypeScript and Angular conventions, including the accessibility override (`CLAUDE.md`, "Accessibility Requirements").
- `frontend/docs/lint-relaxations.md`: which lint rules the user had switched off, and what stays.
- `frontend/docs/spec/execution-rules.md:9` and `contracts/commerce/openapi.yaml:25-29`: the language split.
- `.claude/rules/framework-facts.md`: how a question about Angular, typescript-eslint or Prettier behaviour is answered.

## 3. Config files to open

| File | What it decides |
| --- | --- |
| `frontend/eslint.config.mjs` | every lint rule, and which files each block reaches |
| `frontend/angular.json` | which files `ng lint` visits, per project; the storefront's target also takes `tests/`, `e2e/` and `playwright.config.ts` (`frontend/angular.json:132-138`) |
| `frontend/tsconfig.json` | the compiler's strictness flags (`frontend/tsconfig.json:6-10`), the `@mi-bolt/*` aliases (`frontend/tsconfig.json:17-21`) and template strictness (`frontend/tsconfig.json:23-31`); every `frontend/projects/*/tsconfig*.json` extends it, directly or through a sibling tsconfig, and overrides no strictness flag |
| `frontend/tsconfig.e2e.json` | the tsconfig that includes `e2e/**/*.ts` and `playwright.config.ts`, which the end-to-end lint block parses type-aware (`frontend/eslint.config.mjs:346-350`, `e2e/seed.spec.ts` excepted); it extends `frontend/tsconfig.json` and adds only the Node types |
| `frontend/.prettierrc`, `frontend/.prettierignore` | the formatting, and what Prettier skips: the generated clients, `docs/`, build output |
| `.editorconfig` | editor defaults: 2-space indent, single quotes in `.ts` |
| `frontend/docs/lint-relaxations.md` | the relax pass, and how a rule is put back |

## 4. Fix a lint, format or type error, or review a diff

1. **Read the effective rule for the file**, with `--print-config` (section 7), instead of reasoning over the config's blocks. The blocks mislead: `curly` is set to error at `frontend/eslint.config.mjs:239` and reported as `[0,"all"]`, off, because `eslint-config-prettier` is applied last (`frontend/eslint.config.mjs:532`).
2. **Place the rule** in section 5, and look up its options and file scope in [references/frontend-lint-policy.md](references/frontend-lint-policy.md).
3. **Fix the code, not the rule.** Hand-written code holds two suppression comments, both in spec files and both naming what they suppress (the lint policy reference, section 9). A new suppression comment (`eslint-disable…`, `@ts-expect-error`, `@ts-ignore`), or an edit to `frontend/eslint.config.mjs` that makes an error go away, changes what the gate checks rather than the code. No file hands that decision to an agent: the relax pass in `frontend/docs/lint-relaxations.md:6-11` was the user's own, so a further relaxation goes to the user as a question, per `.claude/CLAUDE.md` ("Think before coding": "Any deviation from the request must be discussed with the user first").
4. **Re-run the check on the changed files only** (section 7). A `--fix` or `--write` sweep names its files explicitly, per `.claude/CLAUDE.md` ("Surgical changes").
5. **Leave a recorded conflict alone.** Where the code around your change contradicts a written rule, the register says whether that is known; do not rewrite it as a side effect.

**Reviewing a diff:** the tools catch only the rows labelled lint, tsc or
prettier, so read every changed file against the **written** rows in section
5 as well. None of the constructs the written-only Angular rules ban, such as
`standalone:`, an explicit `OnPush`, `@HostBinding` or `ngClass`, occurs in
hand-written code today (the grep is in the lint policy reference), so one in
a diff is new.

**The narrowing style the rules converge on**, in two canonical examples:

- `frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts:795-836`: `mapError` binds `err.error` to a `const body: unknown`, narrows it with `isRecord`, reads fields with bracket access and `typeof` checks, and filters an array through the local guard `isFieldError`.
- `frontend/projects/admin/src/app/core/api/problem.ts:16-34`: `isProblem` narrows with `in` and `typeof` and no assertion, and `problemOf` binds the parsed body as `unknown` and returns it only through that guard.

## 5. The rules

### Types

- **No `as`** (written: `.claude/rules/code-standards.md`, "Strict generics. `as` is forbidden; use `satisfies`"); what replaces one depends on what it did. First check whether a generic already carries the type, and where one does, the `as` simply goes: the generated clients' `invoke<P, R>` returns the operation's own response type, and `invoke$Response<P, R>` returns it inside `StrictHttpResponse<R>` (`frontend/projects/admin/src/app/api/generated/admin-api.ts:45-57`, `frontend/projects/shop-api/src/generated/api.ts:45-57`). Otherwise an `as` that narrows becomes a type guard, with a response body, an `HttpErrorResponse.error` or a `JSON.parse` result bound to `unknown` first, as the two narrowing examples in section 4 do. `satisfies` replaces an `as` only where the value already matches the type, such as an object literal that should match an interface, or a test double that implements the whole interface (`frontend/projects/admin/src/app/core/api/transport.interceptor.spec.ts:31-36`): it checks a type "without changing the resulting type of that expression" (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator), so it never narrows. The rule file names `satisfies` without that condition; the condition comes from the operator, not from a narrower reading of the rule. **Conflict** in enforcement: lint forbids assertions, all but `as const`, only in `projects/admin/**/*.ts` (`frontend/eslint.config.mjs:389-391`) and in two contract files (`frontend/eslint.config.mjs:441-443`).
- **No `any`** (written: `.claude/rules/code-standards.md`, "Strict generics"; lint: `no-explicit-any` in every linted TypeScript file except `frontend/e2e/seed.spec.ts`, which ESLint parses as plain JavaScript, the `no-unsafe-*` rules under `projects/`, and `$any()` in templates at `frontend/eslint.config.mjs:529`). Bind a value typed `any`, such as `HttpErrorResponse.error` or the result of `JSON.parse`, to `unknown` at once and narrow it.
- **Use the guard that exists before writing one** (written: `.claude/rules/code-standards.md`, "Always use the type guards that already exist in the project"). `isRecord` has three copies: `frontend/projects/storefront/src/app/shared/utils/is-record.ts`, `frontend/projects/admin/src/app/core/is-record.ts` and `frontend/projects/shop-mocks/src/is-record.ts`. The admin may not import the mocks' copy (`frontend/eslint.config.mjs:397`), and the storefront's copy says in its header that it exists so app code never imports from `projects/shop-mocks/src`. Others include `isProblem` (`frontend/projects/admin/src/app/core/api/problem.ts:16`), `isSort` and `isStorageBucket` (`frontend/projects/storefront/src/app/features/catalog/catalog-query.ts:48-54`) and the DOM guards in `frontend/projects/storefront/src/app/shared/utils/event-target.ts`. List them all, generated code and specs left out, with `git grep -nE '\): [A-Za-z.]+ is ' -- frontend/projects ':!**/generated/**' ':!**/*.spec.ts'`.
- **Only a `boolean` goes in a condition** (lint: `strict-boolean-expressions`, `frontend/eslint.config.mjs:177-188`, every allow option false, in `projects/**/*.ts` including specs and not in `tests/` or `e2e/`). It is a TypeScript rule and reports nothing in a template, external or inline, so the condition it flags is in the `.ts` file the report names. Compare explicitly with `!== null`, `!== undefined`, `.length > 0` or `typeof x === 'string'`, as `frontend/projects/storefront/src/app/features/cart/cart-page.ts:188` does.
- **Compiler strictness** (tsc: `frontend/tsconfig.json:6-10`): `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `noPropertyAccessFromIndexSignature`, which makes a `Record<string, unknown>` field read as `body['code']` rather than `body.code` (https://www.typescriptlang.org/tsconfig/#noPropertyAccessFromIndexSignature).
- **Template strictness** (tsc: `frontend/tsconfig.json:24-30`): `strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers`, and every extended template diagnostic raised to an error, which fails the compilation (https://angular.dev/extended-diagnostics#configuration).
- **Further type-aware lint under `projects/`** includes `no-unnecessary-condition`, `prefer-readonly`, `no-non-null-assertion`, `no-floating-promises` and `prefer-nullish-coalescing`; read any of them for a file with `--print-config`.

### Imports and boundaries

- **One app never imports another**, statically or through `import()` (lint: `frontend/eslint.config.mjs:385-437`, `frontend/eslint.config.mjs:463-472`). The fix is to move the shared code into a library under `frontend/projects/` and import it through its alias (`frontend/tsconfig.json:17-21`); that move belongs to `mibolt-cross-package-changes`.
- **The admin takes neither the shop SDK nor the shop mocks** (lint: `frontend/eslint.config.mjs:397`); its client is `frontend/projects/admin/src/app/api/generated/`.
- **A type-only import is its own `import type { X }` statement** (lint: `frontend/eslint.config.mjs:212-218`).
- **The generated clients are neither linted nor formatted** (`frontend/eslint.config.mjs:88-92`, `frontend/.prettierignore:1-3`) and never edited by hand; they belong to `mibolt-cross-package-changes`.

### Angular

- **`inject()`, not constructor-parameter injection** (lint: `@angular-eslint/prefer-inject`, from `angular.configs.tsRecommended` at `frontend/eslint.config.mjs:114`).
- **`input()`, the signal query functions, and `readonly` signal properties** (lint: `@angular-eslint/prefer-signals`, `frontend/eslint.config.mjs:146`). `output()` instead of `@Output()` is written only (`CLAUDE.md`, "Components"): the rule does not look at `@Output()`.
- **Native control flow** in templates (lint: `frontend/eslint.config.mjs:498`).
- **Selector prefix per app**: `app` for the storefront, `pay` for demo-payment, `adm` for the admin (`frontend/angular.json:15`, `frontend/angular.json:148`, `frontend/angular.json:243`). Lint accepts any of the three in any project (`frontend/eslint.config.mjs:127-142`), so only review keeps each app on its own.
- **The rest of the Angular rules in the root `CLAUDE.md` are written only**: no `standalone: true`, no explicit `OnPush`, no `@HostBinding` or `@HostListener` (`CLAUDE.md`, "Angular Best Practices"), `model()` for two-way binding, Signal Forms, no `ngClass`, `ngStyle` or `CommonModule` (`CLAUDE.md`, "Components"), `@Service` for new singletons (`CLAUDE.md`, "Services"). The lint policy reference shows which lint rule, if any, comes near each.
- **Templates inline or external**, and **the zoneless provider**, are recorded conflicts. Do not convert a component's template, and do not add or remove `provideZonelessChangeDetection()`, as a side change.

### Members and naming

- **PascalCase** for types, interfaces, enums, enum members, type aliases and type parameters, and **camelCase with no leading `_`** for private members (lint: `frontend/eslint.config.mjs:250-291`).
- **A leading `_`** marks a parameter, variable or caught error as intentionally unused (lint: `frontend/eslint.config.mjs:152-159`).
- **No `public` keyword** on a method, accessor, constructor or parameter property (lint: `frontend/eslint.config.mjs:219-231`).
- **`T[]` and `readonly T[]`**, never `Array<T>` (lint: `frontend/eslint.config.mjs:292-298`).
- **A return type on every function and method**, an arrow function assigned to an untyped `const` included; a callback written inline as an argument, or a function whose variable is already typed, needs none (lint: `frontend/eslint.config.mjs:299-308`, https://typescript-eslint.io/rules/explicit-function-return-type/).
- **File names** (observed): `x-page.ts` for a page, `x.routes.ts`, `x.guard.ts` or `x.guards.ts`, `x.facade.ts` exporting `XFacade` in the storefront, `x.store.ts` in the admin. Which pattern a new unit follows is the area skill's call.
- **A script or `package.json` script** is named after what it acts on (written: `.claude/rules/code-standards.md`, "A name says what it operates on, and who owns it"); wiring one in belongs to `mibolt-workspace-ops`.

### Tests

- **No `.only`, `.skip`, `.todo`, `.fails`, `.skipIf` or `.runIf`**, in any syntactic form (lint: `frontend/eslint.config.mjs:35-65`, applied at `frontend/eslint.config.mjs:453-472` to `projects/**/*.spec.ts` and `tests/**/*.ts`).
- **No coverage-ignore pragma** (`v8 ignore`, `istanbul ignore`, `c8 ignore`) in any comment (lint: `frontend/eslint.config.mjs:473-484`, over `projects/`, `tests/` and `e2e/`; written: `.claude/rules/code-standards.md`, "never by ignore comments scattered through the source").
- **`frontend/tests/` runs no type-aware rule** (`frontend/eslint.config.mjs:192-203`), because no tsconfig includes it.

### Formatting and styles

- **Prettier decides layout** (prettier: `frontend/.prettierrc`, print width 100, single quotes, `.html` parsed with the `angular` parser), and `eslint-config-prettier` switches ESLint's formatting rules off (`frontend/eslint.config.mjs:532`). `npm --prefix frontend run format` rewrites the whole workspace, so format only the files you changed, with `npx prettier --write` and their paths.
- **Storefront component styles are `.scss` files written as CSS, three of them with Sass `//` line comments**, while the admin's theme file uses Sass `@use` (observed, and a recorded conflict). Design values come from `frontend/docs/design/yettel.md`.

### Language

- **UI copy and user-facing route paths are Hungarian in all three apps, the admin included, and everything else is English** (written: `frontend/docs/spec/execution-rules.md:9`, "Public demo UI stays Hungarian; everything else committed to this repository is English"; observed for the admin and demo-payment: their templates carry Hungarian copy, and `frontend/projects/admin/src/app/app.config.ts:51` sets `LOCALE_ID` to `hu-HU`). Route paths are observed rather than written, and `mibolt-project-map` ("Routes are Hungarian") lists them. The base hrefs follow suit: demo-payment's is `/demo-fizetes/` (`frontend/angular.json:156`), and the admin's, `/admin/` (`frontend/angular.json:251`), is the stem of its own Hungarian route `adminok` (`frontend/projects/admin/src/app/app.routes.ts:32`). The storefront's one English path, `primitives`, sits under "Internal routes" (`frontend/projects/storefront/src/app/app.routes.ts:123-125`). The copy is hard-coded in templates and components, with no `@angular/localize` or `i18n` markup in the tree (observed). API `title` and `detail` are English diagnostics that are never shown; the UI composes its text from the `code` (written: `contracts/commerce/openapi.yaml:25-29`), as `frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts:54-58` describes.

### Accessibility

- **The root `CLAUDE.md` overrides generic accessibility guidance** (written: `CLAUDE.md`, "Accessibility Requirements"), in the user's words: "in the frontend app keyboard and ARIA events are not of interest, and focus only minimally, because it will never be a live app! no screen reader will ever read it!"
- **Existing ARIA and focus code is neither extended nor removed as a side change** (written: extending it is the work `CLAUDE.md` ("Accessibility Requirements") rules out, and removing it is a change nothing asked for, which `.claude/CLAUDE.md` ("Surgical changes") rules out). It leaves with an element or a feature the task itself removes, per `.claude/rules/code-standards.md` ("A cut feature leaves nothing behind"). The code already carries some, such as `frontend/projects/storefront/src/app/a11y-structure.spec.ts`.
- **The template lint block still extends `angular.configs.templateAccessibility`** (`frontend/eslint.config.mjs:493`), so its rules fail `lint` like any other. The register records how the two sit together.

### Framework questions

- **Answer a question about how Angular, typescript-eslint or Prettier behaves from its documentation** (written: `.claude/rules/framework-facts.md`), with the instruments that file names, never with a probe, and put the URL beside the claim.
- **The `angular-developer` skill is generic Angular guidance**: commit `5f5b6392` copied it unchanged from https://github.com/angular/skills. This skill records what this repository enforces and does.

## 6. What a change here reaches

- **A cross-app lint error means the code is in the wrong place.** The fix moves it into a library, which every consuming app then imports; that is `mibolt-cross-package-changes`' work, not a lint fix.
- **Moving a file moves it between config blocks.** A helper moved out of `projects/admin/` loses the assertion ban, and one moved into `tests/` loses every type-aware rule.
- **An edit to `frontend/eslint.config.mjs`** reaches every file each project's lint target visits. A relaxed rule gets its row in `frontend/docs/lint-relaxations.md`, and "How to reinstate" there (`frontend/docs/lint-relaxations.md:59-62`) is how one comes back.
- **An edit to `frontend/tsconfig.json`** reaches every project, since the twelve tsconfigs it references (`frontend/tsconfig.json:33-70`) all extend it.

## 7. Commands

The `npm --prefix` command runs from the repository root. The `npx` commands
need `frontend/` as their working directory, because the Angular workspace's
`node_modules` is there and `npx` looks for a local binary from where it runs,
and a command that depends on its working directory names it in full
(`.claude/rules/session-lifecycle.md`, "Tools and startup"). So `<repo-root>`
below stands for the checkout's absolute path, and the file arguments after the
`cd` are relative to `frontend/`. Every command below needs that
`node_modules`, which `mise run //frontend:setup` installs with `npm ci`
(`frontend/mise.toml:2-3`).

- `npm --prefix frontend run lint`: `ng lint` over every project's lint target. It passes no `--fix` and the builder's cache is off by default, so it writes nothing.
- `cd <repo-root>/frontend && npx eslint <files>` and `cd <repo-root>/frontend && npx prettier --check <files>`: the pre-commit form from `.claude/rules/code-standards.md` ("A subagent's green report is not a run"). Neither writes without `--fix` or `--write`. Exit 0 from `npx eslint` means no error-level finding; the `security/*` rules report as warnings, which print without changing the exit code.
- `cd <repo-root>/frontend && npx eslint --print-config <file> | grep -A12 '"<rule-id>"'`: the rule as it applies to that one file, as JSON. `-A12` shows the whole entry for most rules, but not for `@typescript-eslint/naming-convention` (60 lines), `no-restricted-imports` in an admin file (19) or `no-restricted-syntax` in a spec file (23), counted 2026-09-26; raise `-A` for those. `<rule-id>` is the full id with its plugin prefix, the form a lint report prints, for example `"@typescript-eslint/strict-boolean-expressions"`; the bare `"strict-boolean-expressions"` matches nothing, and `grep` then prints nothing and exits 1. A rule the output does not list at all is not configured for that file. The first number is the severity: 0 off, 1 warn, 2 error, and only 2 fails the run (https://eslint.org/docs/latest/use/configure/rules).

There is no separate typecheck script in `frontend/package.json`: a type or
template error surfaces when the project is compiled, and `mibolt-verification`
says which command compiles which project.

## 8. References

- [references/frontend-lint-policy.md](references/frontend-lint-policy.md): which config block reaches which files, every rule's options and anchor, the root `CLAUDE.md` rules marked enforced or written only, the relax pass, and the suppressions in the tree. Read when fixing a specific lint error, when reviewing a diff, or when a rule's scope matters.
- [references/conflict-register.md](references/conflict-register.md): the `as` enforcement scope, the two `Api` construction idioms, inline versus external templates, the zoneless provider, `.scss` files written as CSS with Sass line comments in three, how far the design reference reaches, the accessibility override beside the lint preset, and two checks nothing runs, each with its sources and what is left alone. Read when code contradicts a written rule, when two idioms coexist, or before changing anything the register names.

## 9. Keep this skill current

The skill goes stale when any of these changes: `frontend/eslint.config.mjs`,
`frontend/tsconfig.json`, `frontend/tsconfig.e2e.json` or a `frontend/projects/*/tsconfig*.json`,
`frontend/.prettierrc`, `frontend/.prettierignore`, the `lintFilePatterns` in
`frontend/angular.json`, the lint tool versions or the `lint`, `format` and
`format:check` scripts in `frontend/package.json`,
`frontend/docs/lint-relaxations.md`, the root `CLAUDE.md`, `.claude/CLAUDE.md` or
a file under `.claude/rules/`, or any file an anchor or a quoted section name
here points into. A change that settles a register entry takes the entry out
and states the rule in section 5.

After such a change, run
`node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs .claude/skills/mibolt-frontend-code-standards`.
It reports every path, anchor and command here that no longer resolves; with
`--show-anchors` it also prints the text now at each anchored line, and only
reading that text shows an anchor that still resolves but has come to point at
something else. Its check (e) reports a section name quoted after a path, such
as `.claude/CLAUDE.md` ("Surgical changes"), once the name occurs nowhere in
that file, so a heading renamed while the file still mentions the old name
elsewhere is not reported. The counts and greps dated 2026-09-26, here and in
the references, are re-run, not trusted, once the code they counted has changed.
