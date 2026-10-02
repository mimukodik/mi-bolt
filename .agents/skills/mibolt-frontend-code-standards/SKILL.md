---
name: mibolt-frontend-code-standards
description: >-
  Fixing MiBolt lint, format or type errors under frontend/, reviewing
  TypeScript diffs, or judging whether a pattern is allowed: ESLint rules
  (strict-boolean-expressions, type assertions, any, cross-app imports),
  tsconfig and template strictness, Prettier, naming, type guards, Angular
  conventions, accessibility, framework questions, removing a feature. Load it
  before writing, answering or fixing: rules differ by folder. Not for Java or
  Gradle code.
---

# MiBolt frontend code standards

A path that starts with scripts/, references/, assets/ or agents/, or is
`SKILL.md`, is relative to this skill's directory; one that starts with a
MiBolt skill name, such as `mibolt-project-map/scripts/check-skill-references.mjs`,
is relative to the directory that holds the MiBolt skills; every other path is
relative to the repository root. Globs quoted from `frontend/eslint.config.mjs`
or `frontend/angular.json` are relative to `frontend/`, the way those files
write them.

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
- What an end-to-end spec under `frontend/e2e/` tests, and how its steps are written: outside the MiBolt skills. The lint rules that reach `frontend/e2e/` stay here, and so do `frontend/e2e/seed.spec.ts`, which is the conventions file the specs follow rather than a test, and `frontend/e2e/fixtures/`: both are ordinary code.
- Colour, type, radius and recipe values: `frontend/docs/design/yettel.md`, the design reference (`mibolt-shop-frontend` ("Design authority")).

## 2. Evidence model and where the rules live

Every rule in section 5 carries a label, and the label says what breaking it
costs:

- **written**: a project rule, stated in this skill or in a project document, and binding whether or not a tool checks it.
- **lint**, **tsc**, **prettier**: ESLint, the TypeScript and Angular compilers, or Prettier fails on it, so the gate catches it.
- **observed**: the code does it consistently and no source requires it. Follow it inside an existing file; never cite it as a rule.
- **conflict**: two sources disagree, or the code does what a written rule words differently. Read [references/conflict-register.md](references/conflict-register.md) before changing anything it names.

A rule that is only written is still a rule. The `as` ban is written for the
whole workspace and linted only in the admin app and in two contract files
(section 5, "Types"); the narrower lint scope does not narrow the rule.

Section 5 states the written rules for this code, and the lint policy
reference, section 7, marks which of the Angular and TypeScript ones a tool
checks. The project documents they draw on:

- `frontend/docs/lint-relaxations.md`: which lint rules the user had switched off, and what stays.
- `frontend/docs/spec/execution-rules.md` ("Public demo UI stays Hungarian") and `contracts/commerce/openapi.yaml` ("Error text: responses carry machine-readable codes"): the language split.

How a question about Angular, typescript-eslint or Prettier behaviour is
answered is under "Framework questions" in section 5.

## 3. Config files to open

| File | What it decides |
| --- | --- |
| `frontend/eslint.config.mjs` | every lint rule, and which files each block reaches |
| `frontend/angular.json` | which files `ng lint` visits, per project; the storefront's target also takes `tests/`, `e2e/` and `playwright.config.ts` (`frontend/angular.json`, "playwright.config.ts") |
| `frontend/tsconfig.json` | the compiler's strictness flags (`frontend/tsconfig.json`, "compilerOptions"), the `@mi-bolt/*` aliases (`frontend/tsconfig.json`, "paths") and template strictness (`frontend/tsconfig.json`, "angularCompilerOptions"); every `frontend/projects/*/tsconfig*.json` extends it, directly or through a sibling tsconfig, and overrides no strictness flag |
| `frontend/tsconfig.e2e.json` | the tsconfig that includes `e2e/**/*.ts` and `playwright.config.ts`, which the end-to-end lint block parses type-aware (`frontend/eslint.config.mjs`, "files: ['e2e/**/*.ts', 'playwright.config.ts']", `e2e/seed.spec.ts` excepted); it extends `frontend/tsconfig.json` and adds only the Node types |
| `frontend/.prettierrc`, `frontend/.prettierignore` | the formatting, and what Prettier skips: the generated clients, `docs/`, build output |
| `.editorconfig` | editor defaults: 2-space indent, single quotes in `.ts` |
| `frontend/docs/lint-relaxations.md` | the relax pass, and how a rule is put back |

## 4. Fix a lint, format or type error, or review a diff

1. **Read the effective rule for the file**, with `--print-config` (section 7), instead of reasoning over the config's blocks. The blocks mislead: `curly` is set to error at `frontend/eslint.config.mjs` ("curly: ['error']") and reported as `[0,"all"]`, off, because `eslint-config-prettier` is applied last (`frontend/eslint.config.mjs`, "eslintConfigPrettier,").
2. **Place the rule** in section 5, and look up its options and file scope in [references/frontend-lint-policy.md](references/frontend-lint-policy.md).
3. **Fix the code, not the rule.** Hand-written code holds two suppression comments, both in spec files and both naming what they suppress (the lint policy reference, section 9). A new suppression comment (`eslint-disable…`, `@ts-expect-error`, `@ts-ignore`), or an edit to `frontend/eslint.config.mjs` that makes an error go away, changes what the gate checks rather than the code. No file makes that decision for you: the relax pass in `frontend/docs/lint-relaxations.md` ("The user decided on 2026-09-20") was the user's own, so a further relaxation is a question for the user, never part of a fix.
4. **Re-run the check on the changed files only** (section 7). A `--fix` or `--write` sweep names its files explicitly, and names only files the change touched.
5. **Leave a recorded conflict alone.** Where the code around your change contradicts a written rule, the register says whether that is known; do not rewrite it as a side effect.

**Reviewing a diff:** the tools catch only the rows labelled lint, tsc or
prettier, so read every changed file against the **written** rows in section
5 as well. None of the constructs the written-only Angular rules ban, such as
`standalone:`, an explicit `OnPush`, `@HostBinding` or `ngClass`, occurs in
hand-written code today (the grep is in the lint policy reference), so one in
a diff is new.

**The narrowing style the rules converge on**, in two canonical examples:

- `frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts` ("function mapError"): `mapError` binds `err.error` to a `const body: unknown`, narrows it with `isRecord`, reads fields with bracket access and `typeof` checks, and filters an array through the local guard `isFieldError`.
- `frontend/projects/admin/src/app/core/api/problem.ts` ("function isProblem"): `isProblem` narrows with `in` and `typeof` and no assertion, and `problemOf` binds the parsed body as `unknown` and returns it only through that guard.

## 5. The rules

### Types

- **No `as`** (written; lint: `@typescript-eslint/consistent-type-assertions` with `assertionStyle: 'never'` forbids every assertion but `as const` in `projects/admin/**/*.ts` at `frontend/eslint.config.mjs` ("files: ['projects/admin/**/*.ts']") and in two contract files at `frontend/eslint.config.mjs` ("files: ['tests/contract/admin-tags.ts', 'tests/contract/sdk-split.spec.ts']"); everywhere else the ban is written only, a recorded conflict); what replaces one depends on what it did. First check whether a generic already carries the type, and where one does, the `as` simply goes: the generated clients' `invoke<P, R>` returns an `Observable<R>`, and `invoke$Response<P, R>` an `Observable<StrictHttpResponse<R>>` (`frontend/projects/admin/src/app/api/generated/admin-api.ts`, "invoke$Response", `frontend/projects/shop-api/src/generated/api.ts`, "invoke$Response"). Otherwise an `as` that narrows becomes a type guard, with a response body, an `HttpErrorResponse.error` or a `JSON.parse` result bound to `unknown` first, as the two narrowing examples in section 4 do. An `as` that widens, such as `null as MockSnapshot | null` (`frontend/projects/shop-mocks/src/mocks-handlers.spec.ts`, "const d05 = { captured: null as MockSnapshot | null }"), becomes a type annotation on the declaration: `const state: { captured: MockSnapshot | null } = { captured: null };`. `satisfies` replaces an `as` only where the value already matches the type, such as an object literal that should match an interface, or a test double that implements the whole interface (`frontend/projects/admin/src/app/core/api/transport.interceptor.spec.ts`, "satisfies HttpBackend"): it checks a type "without changing the resulting type of that expression" (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator), so it neither narrows nor widens. The rule's short form, "`as` is forbidden; use `satisfies`", carries no such condition; the condition comes from the operator, not from a narrower reading of the rule.
- **No `any`** (written; lint: `no-explicit-any` in every linted TypeScript file except `frontend/e2e/seed.spec.ts`, which ESLint parses as plain JavaScript, the `no-unsafe-*` rules under `projects/`, and `$any()` in templates at `frontend/eslint.config.mjs` ("@angular-eslint/template/no-any")). A type that is uncertain is `unknown` narrowed by a type guard, or a generic parameter. Bind a value typed `any`, such as `HttpErrorResponse.error` or the result of `JSON.parse`, to `unknown` at once and narrow it.
- **Use the guard that exists before writing one, and write one when none fits** (written). `isRecord` has three copies: `frontend/projects/storefront/src/app/shared/utils/is-record.ts`, `frontend/projects/admin/src/app/core/is-record.ts` and `frontend/projects/shop-mocks/src/is-record.ts`. The admin may not import the mocks' copy (`frontend/eslint.config.mjs`, "The shop SDK and mocks are not for the admin"), and the storefront's copy says in its header that it exists so app code never imports from `projects/shop-mocks/src`. Others include `isProblem` (`frontend/projects/admin/src/app/core/api/problem.ts`, "function isProblem"), `isSort` and `isStorageBucket` (`frontend/projects/storefront/src/app/features/catalog/catalog-query.ts`, "function isSort") and the DOM guards in `frontend/projects/storefront/src/app/shared/utils/event-target.ts`. List them all, generated code and specs left out, with `git grep -nE '\): [A-Za-z.]+ is ' -- frontend/projects ':!**/generated/**' ':!**/*.spec.ts'`.
- **Generic interfaces** (written): a shape whose field types depend on how it is used is generic in them, which is also how a cast is avoided. `CheckoutMutation<T>` (`frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts`, "interface CheckoutMutation") is generic so that `serialize<T>` can return a `CheckoutResult<T>` without one.
- **Infer a type where it is obvious** (written; lint under `projects/`: `no-inferrable-types` rejects an annotation on a variable, parameter or property initialised to a number, string or boolean, https://typescript-eslint.io/rules/no-inferrable-types/). A function's return type is where this meets the return-type rule under "Members and naming", a recorded conflict.
- **Only a `boolean` goes in a condition** (lint: `strict-boolean-expressions`, `frontend/eslint.config.mjs`, "@typescript-eslint/strict-boolean-expressions", every allow option false, in `projects/**/*.ts` including specs and not in `tests/` or `e2e/`). It is a TypeScript rule and reports nothing in a template, external or inline, so the condition it flags is in the `.ts` file the report names. Compare explicitly with `!== null`, `!== undefined`, `.length > 0` or `typeof x === 'string'`, as `frontend/projects/storefront/src/app/features/cart/cart-page.ts` ("this.facade.error() !== null || this.facade.cartExpired()") does.
- **Strict type checking** (written; tsc: `frontend/tsconfig.json`, "compilerOptions"): `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `noPropertyAccessFromIndexSignature`, which makes a `Record<string, unknown>` field read as `body['code']` rather than `body.code` (https://www.typescriptlang.org/tsconfig/#noPropertyAccessFromIndexSignature).
- **Template strictness** (tsc: `frontend/tsconfig.json`, "angularCompilerOptions"): `strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers`, and every extended template diagnostic raised to an error, which fails the compilation (https://angular.dev/extended-diagnostics#configuration).
- **Further type-aware lint under `projects/`** includes `no-unnecessary-condition`, `prefer-readonly`, `no-non-null-assertion`, `no-floating-promises` and `prefer-nullish-coalescing`; read any of them for a file with `--print-config`.

### Imports and boundaries

- **One app never imports another**, statically or through `import()` (lint: `frontend/eslint.config.mjs`, "const CROSS_APP_IMPORT_MESSAGE =", `frontend/eslint.config.mjs`, "app spec files take the test policy and the dynamic-import ban together"). The fix is to move the shared code into a library under `frontend/projects/` and import it through its alias (`frontend/tsconfig.json`, "paths"); that move belongs to `mibolt-cross-package-changes`.
- **The admin takes neither the shop SDK nor the shop mocks** (lint: `frontend/eslint.config.mjs`, "The shop SDK and mocks are not for the admin"); its client is `frontend/projects/admin/src/app/api/generated/`.
- **A type-only import is its own `import type { X }` statement** (lint: `frontend/eslint.config.mjs`, "@typescript-eslint/consistent-type-imports").
- **The generated clients are neither linted nor formatted** (`frontend/eslint.config.mjs`, "Generated OpenAPI client", `frontend/.prettierignore`, "Generated by ng-openapi-gen") and never edited by hand; they belong to `mibolt-cross-package-changes`.

### Angular

Most of these rules come from Angular's own best-practices file for version 22
(https://angular.dev/assets/context/best-practices.md, linked from
https://angular.dev/ai/develop-with-ai), with two departures: its accessibility
section is replaced by "Accessibility" below, and its rule to use
`NgOptimizedImage` for every static image is not a rule here. That rule was
dropped from the project's rules on purpose in commit `e2dfcbf6`, so new code
does not introduce `NgOptimizedImage`, and `frontend/projects/` holds none
(observed).

Components:

- **Standalone components only, and no `standalone: true`** (written; lint: `prefer-standalone` reports only `standalone: false`). Standalone is the default (https://angular.dev/api/core/Component), and no `@NgModule` exists in hand-written code (observed).
- **No explicit `changeDetection: ChangeDetectionStrategy.OnPush`** (written). `OnPush` is the default in Angular 22 (https://angular.dev/api/core/Component); lint reports only an opt-out of it, because `allowExplicitOnPush` is true.
- **`input()`, the signal query functions, and `readonly` signal properties** (lint: `@angular-eslint/prefer-signals`, `frontend/eslint.config.mjs`, "@angular-eslint/prefer-signals"). `output()` instead of `@Output()`, and `model()` for a property bound two-way with `[(prop)]` instead of an `input()` paired with an `output()`, are written only: the rule does not look at `@Output()`.
- **No `@HostBinding` or `@HostListener`** (written): host bindings and listeners go in the `host` object of the `@Component` or `@Directive` decorator, as `frontend/projects/storefront/src/app/features/checkout/checkout-step-header.ts` ("host: { class: 'block' }") does.
- **`class` and `style` bindings, never `ngClass` or `ngStyle`, and no `CommonModule`** (written): a component imports only the directives and pipes its template uses, such as `AsyncPipe` or `DatePipe`.
- **Small components with one responsibility, and inline templates for the small ones** (written). An external template or stylesheet is named by a path relative to the component file (written), as every `templateUrl` and `styleUrl` in the tree is (observed). Inline against external is a recorded conflict: do not convert a component's template as a side change.
- **Selector prefix per app**: `app` for the storefront, `pay` for demo-payment, `adm` for the admin (`frontend/angular.json`, "prefix"). Lint accepts any of the three in any project (`frontend/eslint.config.mjs`, "prefix: ['app', 'pay', 'adm']"), so only review keeps each app on its own.

Templates:

- **Native control flow**, `@if`, `@for` and `@switch` rather than `*ngIf`, `*ngFor` and `*ngSwitch` (lint: `frontend/eslint.config.mjs`, "@angular-eslint/template/prefer-control-flow").
- **Simple templates, with no complex logic** (written). A template expression has `undefined` and `$any` as its only globals and no `new` operator (https://angular.dev/guide/templates/expression-syntax#globals, https://angular.dev/guide/templates/expression-syntax#unsupported-operators), so a value such as the current date comes from the component class; `$any()` is a lint error here besides (`frontend/eslint.config.mjs`, "@angular-eslint/template/no-any").
- **An observable a template reads goes through the `async` pipe** (written). No template reads one today: class code subscribes instead, a recorded conflict.

State and forms:

- **Signals for state** (written): `signal()` for local state, `computed()` for derived state, and `linkedSignal()` for state derived from several reactive sources that must stay in step. A signal changes through `set()` or `update()`, with an update function that is pure; `WritableSignal` in the installed `@angular/core` 22.1.6 has no `mutate()`, so a call to one does not compile (tsc).
- **Signal Forms from `@angular/forms/signals` for a new form** (written), stable since Angular 22 (https://angular.dev/events/v22); where a form does not use them, reactive forms are preferred over template-driven ones. Outside the specs, every forms import is from `@angular/forms/signals` and none is from `@angular/forms` (observed).

Services and routes:

- **`inject()`, not constructor-parameter injection** (lint: `@angular-eslint/prefer-inject`, from `angular.configs.tsRecommended` at `frontend/eslint.config.mjs` ("angular.configs.tsRecommended")).
- **A service has one responsibility, and `@Service()` is preferred over `@Injectable({ providedIn: 'root' })` for a new singleton service** (written). `@Service` provides the class in the root injector by default and takes its dependencies through `inject()` only (https://angular.dev/guide/di/creating-and-using-services#using-the-service-vs-injectable-decorator). Outside the specs, every root singleton class is `@Service()` (observed, such as `frontend/projects/storefront/src/app/features/cart/cart.facade.ts` ("@Service()")); `providedIn: 'root'` appears only on `InjectionToken` factories, such as `frontend/projects/storefront/src/app/core/persistence-mode.ts` ("export const PERSISTENCE_MODE"), and a bare `@Injectable()` marks a store a component provides, such as `frontend/projects/admin/src/app/features/admins/admins.store.ts` ("@Injectable()").
- **Feature routes load lazily**, through `loadComponent` or `loadChildren` (written). The storefront and the admin load every feature page that way (observed, for example `frontend/projects/storefront/src/app/app.routes.ts` ("./features/home/home-page")); demo-payment, a single page, routes to it directly.
- **The zoneless provider** is a recorded conflict: do not add or remove `provideZonelessChangeDetection()` as a side change.

### Members and naming

- **Document the code, without over-explaining it** (written). A comment says what the code cannot say for itself, such as the reason for a choice that is not obvious: `frontend/projects/storefront/src/app/features/cart/cart.facade.ts` ("relies on Angular decorator metadata") gives the reason the `Api` is constructed by hand.
- **PascalCase** for types, interfaces, enums, enum members, type aliases and type parameters, and **camelCase with no leading `_`** for private members (lint: `frontend/eslint.config.mjs`, "@typescript-eslint/naming-convention").
- **A leading `_`** marks a parameter, variable or caught error as intentionally unused (lint: `frontend/eslint.config.mjs`, "'@typescript-eslint/no-unused-vars': [").
- **No `public` keyword** on a method, accessor, constructor or parameter property (lint: `frontend/eslint.config.mjs`, "@typescript-eslint/explicit-member-accessibility").
- **`T[]` and `readonly T[]`**, never `Array<T>` (lint: `frontend/eslint.config.mjs`, "@typescript-eslint/array-type").
- **A return type on every function and method**, an arrow function assigned to an untyped `const` included; a callback written inline as an argument, or a function whose variable is already typed, needs none, and neither do the three narrower cases the lint policy reference lists in section 3 (lint: `frontend/eslint.config.mjs`, "@typescript-eslint/explicit-function-return-type", https://typescript-eslint.io/rules/explicit-function-return-type/). It sits beside the written preference for inferred types, a recorded conflict.
- **File names** (observed): `x-page.ts` for a page, `x.routes.ts`, `x.guard.ts` or `x.guards.ts`, `x.facade.ts` exporting `XFacade` in the storefront, `x.store.ts` in the admin. Which pattern a new unit follows is the area skill's call.
- **A script or `package.json` script** is named after what it acts on (`mibolt-workspace-ops` ("Naming")), and `mibolt-workspace-ops` owns wiring one in.

### Tests

- **No `.only`, `.skip`, `.todo`, `.fails`, `.skipIf` or `.runIf`**, in any syntactic form (lint: `frontend/eslint.config.mjs`, "const TEST_POLICY_SYNTAX", applied at `frontend/eslint.config.mjs` ("Test policy: a focused") to `projects/**/*.spec.ts` and `tests/**/*.ts`).
- **No coverage-ignore pragma** (`v8 ignore`, `istanbul ignore`, `c8 ignore`) in any comment (lint: `frontend/eslint.config.mjs`, "no-warning-comments", over `projects/`, `tests/` and `e2e/`; written: code a unit test cannot reach is left out through the test target's `coverageExclude` in `frontend/angular.json`, such as `frontend/angular.json` ("coverageExclude"), never line by line in the source).
- **`frontend/tests/` runs no type-aware rule** (`frontend/eslint.config.mjs`, "files: ['tests/**/*.ts']"), because no tsconfig includes it.

### Formatting and styles

- **Prettier decides layout** (prettier: `frontend/.prettierrc`, print width 100, single quotes, `.html` parsed with the `angular` parser), and `eslint-config-prettier` switches ESLint's formatting rules off (`frontend/eslint.config.mjs`, "eslintConfigPrettier,"). `npm --prefix frontend run format` rewrites the whole workspace, so format only the files you changed, with `npx prettier --write` and their paths.
- **Storefront component styles are `.scss` files written as CSS, three of them with Sass `//` line comments**, while the admin's theme file uses Sass `@use` (observed, and a recorded conflict). Design values come from `frontend/docs/design/yettel.md`.

### Language

- **UI copy and user-facing route paths are Hungarian in all three apps, the admin included, and everything else is English** (written: `frontend/docs/spec/execution-rules.md`, "Public demo UI stays Hungarian; everything else committed to this repository is English"; observed for the admin and demo-payment: their templates carry Hungarian copy, and `frontend/projects/admin/src/app/app.config.ts` ("provide: LOCALE_ID") sets `LOCALE_ID` to `hu-HU`). Route paths are observed rather than written, and `mibolt-project-map` ("Routes are Hungarian") lists them. The base hrefs follow suit: demo-payment's is `/demo-fizetes/` (`frontend/angular.json`, "baseHref"), and the admin's, `/admin/` (`frontend/angular.json`, "baseHref"), is the stem of its own Hungarian route `adminok` (`frontend/projects/admin/src/app/app.routes.ts`, "adminok"). The storefront's one English path, `primitives`, sits under "Internal routes" (`frontend/projects/storefront/src/app/app.routes.ts`, "Internal routes"). The copy is hard-coded in templates and components, with no `@angular/localize` or `i18n` markup in the tree (observed). API `title` and `detail` are English diagnostics that are never shown; the UI composes its text from the `code` (written: `contracts/commerce/openapi.yaml`, "Error text: responses carry machine-readable codes"), as `frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts` ("is an English developer diagnostic") describes.

### Accessibility

- **No work goes into AXE checks, WCAG AA minimums, keyboard handling, or ARIA attributes and events, and focus handling stays minimal** (written): what a native element gives on its own is enough, and nothing is spent on focus management. The reason, in the user's words: "in the frontend app keyboard and ARIA events are not of interest, and focus only minimally, because it will never be a live app! no screen reader will ever read it!" This replaces generic accessibility guidance, including the accessibility section of Angular's best-practices file, which asks for every AXE check and every WCAG AA minimum (https://angular.dev/assets/context/best-practices.md).
- **Existing ARIA and focus code is neither extended nor removed as a side change** (written: extending it and removing it are both work on ARIA and focus, which the rule above rules out). It leaves with an element or a feature that a change removes on purpose, as "Removed features" below requires. The code already carries some, such as `frontend/projects/storefront/src/app/a11y-structure.spec.ts`.
- **The template lint block still extends `angular.configs.templateAccessibility`** (`frontend/eslint.config.mjs`, "angular.configs.templateAccessibility"), so its rules fail `lint` like any other. The register records how the two sit together.

### Framework questions

- **How Angular, Angular Material, the Angular CLI, the `@angular/build` builders, Vitest, MSW, Playwright, typescript-eslint or Prettier behaves is read from that tool's documentation, never found out with a throwaway experiment** (written), and the URL goes beside every claim it supports. This workspace runs Angular 22, TypeScript 6 and ESLint 10 (`frontend/package.json`, "@angular/core", `frontend/package.json`, "~6.0.2", `frontend/package.json`, "^10.9.1"), all newer than a model's training data, so recall is no evidence either. Angular is read in its version 22 documentation, at https://v22.angular.dev, which redirects to https://angular.dev while 22 is the current major. Angular Material is read in its version 22 documentation, at https://v22.material.angular.dev, the major that `frontend/package.json` ("@angular/material") pins with `^22.1.6`. Playwright is read at https://playwright.dev/docs, and release notes, issues and changelogs cover what those pages do not.
- **Measuring this repository is not an experiment**: running its checks and reading their exit codes, grepping the tree, reading `frontend/angular.json`, `frontend/package.json` and `frontend/eslint.config.mjs`, running `git log -S` to find when a line arrived, and reading the installed source under `node_modules/` in `frontend/` to settle what a version actually ships. The test is whose behaviour the question is about: this repository's, or the framework's.

### Removed features

- **A cut component, route, filter or feature leaves every layer in the same change** (written): its type-union member, template, SCSS, handler, fixture and tests, end-to-end specs included. No compatibility shim, no tolerance kept because the old payload still parses, and no code parked for a later rebuild. Mock data under `frontend/projects/shop-mocks/src/` is not a reason to keep any of it: a fixture in a shape the code no longer knows goes out with the rest, and so does a handler that tolerates it.
- **This binds the code the change itself makes dead.** Dead code the change does not touch stays where it is.

## 6. What a change here reaches

- **A cross-app lint error means the code is in the wrong place.** The fix moves it into a library, which every consuming app then imports; that is `mibolt-cross-package-changes`' work, not a lint fix.
- **Moving a file moves it between config blocks.** A helper moved out of `projects/admin/` loses the assertion ban, and one moved into `tests/` loses every type-aware rule.
- **An edit to `frontend/eslint.config.mjs`** reaches every file each project's lint target visits. A relaxed rule gets its row in `frontend/docs/lint-relaxations.md`, and "How to reinstate" there (`frontend/docs/lint-relaxations.md`, "How to reinstate") is how one comes back.
- **An edit to `frontend/tsconfig.json`** reaches every project, since the twelve tsconfigs it references (`frontend/tsconfig.json`, "references") all extend it.

## 7. Commands

The `npm --prefix` command runs from the repository root. The `npx` commands
need `frontend/` as their working directory (`mibolt-workspace-ops` ("Where
commands run")), because the Angular workspace's `node_modules` is there and
`npx` looks for a local binary from where it runs. Each is written with its
`cd`: `<repo-root>` stands for the checkout's absolute path, and the file
arguments after the `cd` are relative to `frontend/`. Every command below
needs that `node_modules`, which `mise run //frontend:setup` installs with
`npm ci` (`frontend/mise.toml`, "[tasks.setup]").

- `npm --prefix frontend run lint`: `ng lint` over every project's lint target. It passes no `--fix` and the builder's cache is off by default, so it writes nothing.
- `cd <repo-root>/frontend && npx eslint <files>` and `cd <repo-root>/frontend && npx prettier --check <files>`: the form in which the checks before a commit run them (`mibolt-verification` ("Gates before a commit")). Neither writes without `--fix` or `--write`. Exit 0 from `npx eslint` means no error-level finding; the `security/*` rules report as warnings, which print without changing the exit code.
- `cd <repo-root>/frontend && npx eslint --print-config <file> | grep -A12 '"<rule-id>"'`: the rule as it applies to that one file, as JSON. `-A12` shows the whole entry for most rules, but not for `@typescript-eslint/naming-convention`, `no-restricted-imports` in an admin file or `no-restricted-syntax` in a spec file; raise `-A` for those. `<rule-id>` is the full id with its plugin prefix, the form a lint report prints, for example `"@typescript-eslint/strict-boolean-expressions"`; the bare `"strict-boolean-expressions"` matches nothing, and `grep` then prints nothing and exits 1. A rule the output does not list at all is not configured for that file. The first number is the severity: 0 off, 1 warn, 2 error, and only 2 fails the run (https://eslint.org/docs/latest/use/configure/rules).

There is no separate typecheck script in `frontend/package.json`: a type or
template error surfaces when the project is compiled, and `mibolt-verification`
says which command compiles which project.

## 8. References

- [references/frontend-lint-policy.md](references/frontend-lint-policy.md): which config block reaches which files, every rule's options and the config entry that sets it, the written Angular and TypeScript rules marked enforced or written only, the installed lint rules the config leaves off, the relax pass, and the suppressions in the tree. Read when fixing a specific lint error, when reviewing a diff, or when a rule's scope matters.
- [references/conflict-register.md](references/conflict-register.md): the `as` enforcement scope, the two `Api` construction idioms, inline versus external templates, the zoneless provider, `.scss` files written as CSS with Sass line comments in three, how far the design reference reaches, the accessibility rule beside the lint preset, two checks nothing runs, inferred types beside required return types, and the `async` pipe beside subscriptions into signals, each with its sources and what is left alone. Read when code contradicts a written rule, when two idioms coexist, or before changing anything the register names.

## 9. Keep this skill current

The skill goes stale when any of these changes: `frontend/eslint.config.mjs`,
`frontend/tsconfig.json`, `frontend/tsconfig.e2e.json` or a `frontend/projects/*/tsconfig*.json`,
`frontend/.prettierrc`, `frontend/.prettierignore`, the `lintFilePatterns` in
`frontend/angular.json`, the Angular, TypeScript or lint tool versions or the
`lint`, `format` and `format:check` scripts in `frontend/package.json`,
`frontend/docs/lint-relaxations.md`, a section this skill quotes from
`mibolt-shop-frontend`, `mibolt-verification`, `mibolt-workspace-ops` or
`mibolt-project-map`, or any other file that a quoted name, here or in the
references, points into. A change that settles a register
entry takes the entry out and states the rule in section 5.

After such a change, run
`node mibolt-project-map/scripts/check-skill-references.mjs mibolt-frontend-code-standards`
from the directory that holds the MiBolt skills. It reports every path, quoted
name and command here or in the references that no longer resolves. A citation
names its target, a heading, a rule id, a key, a function or a short phrase
copied from the cited lines, and never gives a line number.

The checker's check (e) reports a section name quoted after a path or a skill
name, such as `mibolt-verification` ("Gates before a commit"), only once the
name occurs nowhere in the target, so a heading renamed while the target still
mentions the old name elsewhere passes. After an edit to a file a quoted name
points into, open each section this skill or its references quote from it and
confirm it still says what they use it for. The counts and greps here and in
the references are re-run, not trusted, once the code they counted has
changed.
