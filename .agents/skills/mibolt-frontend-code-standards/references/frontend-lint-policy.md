# Frontend lint policy, rule by rule

The detail behind section 5 of `SKILL.md`: which block of the ESLint config
reaches which files, the options each rule runs with, which written Angular
and TypeScript rules no tool checks, and what the relax pass switched off.
Globs are quoted as the config writes them, relative to `frontend/`. The effective values were read
with `npx eslint --print-config`; when the config has changed,
read the rule again with that command rather than trusting this file. In that
output the severity is 0 off, 1 warn, 2 error, and only 2 changes the exit code
(https://eslint.org/docs/latest/use/configure/rules).

## Contents

1. Which block reaches which files
2. Type-aware rules on `projects/**/*.ts`
3. Rules shared by `projects/**/*.ts` and `tests/**/*.ts`
4. Import boundaries
5. Tests, coverage pragmas and end-to-end files
6. Templates
7. Written Angular and TypeScript rules: enforced or written only
8. The relax pass, and what stays
9. Suppression comments in the tree

## 1. Which block reaches which files

| Block of `frontend/eslint.config.mjs` | Files | What the block adds |
| --- | --- | --- |
| `frontend/eslint.config.mjs` ("security.configs.recommended") | every linted file | `security.configs.recommended`, whose rules run as warnings, minus `detect-object-injection` and `detect-non-literal-fs-filename` |
| `frontend/eslint.config.mjs` ("dist/**") | none | the ignore list: build output, the two generated clients (`frontend/eslint.config.mjs`, "Generated OpenAPI client"), the Vitest configs, `tsconfig*.json`, `docs/**`, `.angular/**`, `public/**` |
| `frontend/eslint.config.mjs` ("files: ['projects/**/*.ts']") | `projects/**/*.ts` | the type-aware presets and rules of section 2, with `projectService` |
| `frontend/eslint.config.mjs` ("files: ['tests/**/*.ts']") | `tests/**/*.ts` | `recommended` presets only: `tests/` belongs to no tsconfig, so no type-aware rule runs there |
| `frontend/eslint.config.mjs` ("files: ['projects/**/*.ts', 'tests/**/*.ts']") | `projects/**/*.ts`, `tests/**/*.ts` | the shared rules of section 3 |
| `frontend/eslint.config.mjs` ("files: ['e2e/**/*.ts', 'playwright.config.ts']") | `e2e/**/*.ts`, `playwright.config.ts` | the Playwright rules of section 5; `e2e/seed.spec.ts` is taken out of that block, so ESLint parses it with its default JavaScript parser and runs only the `security/*` warnings and the coverage-pragma ban on it |
| `frontend/eslint.config.mjs` ("const CROSS_APP_IMPORT_MESSAGE =") | each app | the import boundaries of section 4, and the admin assertion ban |
| `frontend/eslint.config.mjs` ("files: ['tests/contract/admin-tags.ts', 'tests/contract/sdk-split.spec.ts']") | `tests/contract/admin-tags.ts`, `tests/contract/sdk-split.spec.ts` | the assertion ban |
| `frontend/eslint.config.mjs` ("Test policy: a focused") | `projects/**/*.spec.ts`, `tests/**/*.ts` | the test policy |
| `frontend/eslint.config.mjs` ("no-warning-comments") | `projects/**/*.ts`, `tests/**/*.ts`, `e2e/**/*.ts` | the coverage-pragma ban |
| `frontend/eslint.config.mjs` ("files: ['projects/**/*.html']") | `projects/**/*.html` | the template rules of section 6 |
| `frontend/eslint.config.mjs` ("eslintConfigPrettier,") | all | `eslint-config-prettier`, applied last, which switches formatting rules off |

The config says which rules apply to a file; `frontend/angular.json` says which
files `ng lint` visits, per project `lintFilePatterns`:

- storefront, `frontend/angular.json` ("playwright.config.ts"): its own `src/`, plus `tests/**/*.ts`, `e2e/**/*.ts` and `playwright.config.ts`, so the whole of `frontend/tests/` and `frontend/e2e/` is linted under the storefront's target;
- demo-payment `frontend/angular.json` ("projects/demo-payment/**/*.ts"), admin `frontend/angular.json` ("projects/admin/**/*.ts"), `core-api` `frontend/angular.json` ("projects/core-api/**/*.ts"), `shop-mocks` `frontend/angular.json` ("projects/shop-mocks/**/*.ts");
- `shop-api` `frontend/angular.json` ("projects/shop-api/**/*.ts"), where the only hand-written source is `frontend/projects/shop-api/src/public-api.ts` and the rest is ignored as generated.

## 2. Type-aware rules on `projects/**/*.ts`

- **Presets** (`frontend/eslint.config.mjs`, "tseslint.configs.strictTypeChecked"): `eslint.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, `angular.configs.tsRecommended`. Among what they switch on, as `--print-config` reports it: `no-explicit-any`, `no-non-null-assertion`, `no-unsafe-assignment` and the other `no-unsafe-*` rules, `no-floating-promises`, `prefer-nullish-coalescing`, and `consistent-type-assertions` at its default options, which accept `x as T` and reject only the `<T>x` form (https://typescript-eslint.io/rules/consistent-type-assertions/).
- **From `tsRecommended`**: `@angular-eslint/prefer-inject` (constructor-parameter injection reported), `prefer-standalone` (reports `standalone: false` and leaves `standalone: true` alone), `prefer-on-push-component-change-detection` with `allowExplicitOnPush: true` (reports only an opt-out of the default `OnPush`), `no-input-rename`, `no-output-native`, `no-output-on-prefix`, `no-output-rename`, and the lifecycle rules. Those behaviours are read from the installed rule sources.
- **Selectors** (`frontend/eslint.config.mjs`, "prefix: ['app', 'pay', 'adm']"): components are kebab-case elements and directives camelCase attributes, with prefix `app`, `pay` or `adm`; the rule accepts any of the three in any project, while `frontend/angular.json` ("prefix") gives storefront, demo-payment and admin one each.
- **`@angular-eslint/prefer-signals`** (`frontend/eslint.config.mjs`, "@angular-eslint/prefer-signals"): `input()` rather than `@Input()`, the signal query functions rather than `@ViewChild()` and the other query decorators, and every signal property `readonly`. The installed rule has no check for `@Output()`, although the comment above it (`frontend/eslint.config.mjs`, "Forbid legacy") says it forbids one.
- **Unused names** (`frontend/eslint.config.mjs`, "'@typescript-eslint/no-unused-vars': ["): a parameter, variable or caught error named with a leading `_` is exempt; unused imports are errors.
- **`no-extraneous-class`** (`frontend/eslint.config.mjs`, "@typescript-eslint/no-extraneous-class"): a decorated class with no members is allowed, for a component that is only a template.
- **`no-unnecessary-condition`** and **`prefer-readonly`** (`frontend/eslint.config.mjs`, "@typescript-eslint/no-unnecessary-condition").
- **`strict-boolean-expressions`** (`frontend/eslint.config.mjs`, "@typescript-eslint/strict-boolean-expressions"): `allowString`, `allowNumber`, `allowNullableObject`, `allowNullableBoolean`, `allowNullableString`, `allowNullableNumber` and `allowAny` are all set false; `allowNullableEnum` is not set and defaults to false. The defaults for `allowString`, `allowNumber` and `allowNullableObject` are true, so this is stricter than the preset: only `boolean` (and `never`) passes as a condition (https://typescript-eslint.io/rules/strict-boolean-expressions/).
- **`no-for-in-array`** (`frontend/eslint.config.mjs`, "@typescript-eslint/no-for-in-array").
- **Inline templates**: `processor: angular.processInlineTemplates` (`frontend/eslint.config.mjs`, "processor: angular.processInlineTemplates").

## 3. Rules shared by `projects/**/*.ts` and `tests/**/*.ts`

| Rule | Set at | What it asks for |
| --- | --- | --- |
| `consistent-type-imports` | `frontend/eslint.config.mjs` ("@typescript-eslint/consistent-type-imports") | a type-only import as its own `import type { X }` statement |
| `explicit-member-accessibility` | `frontend/eslint.config.mjs` ("@typescript-eslint/explicit-member-accessibility") | no `public` keyword on a method, accessor, constructor or parameter property; properties are not checked |
| `naming-convention` | `frontend/eslint.config.mjs` ("@typescript-eslint/naming-convention") | PascalCase for types, interfaces, enums, enum members, type aliases and type parameters (`TKey`, not `T_KEY`); private members camelCase with no leading `_` |
| `array-type` | `frontend/eslint.config.mjs` ("@typescript-eslint/array-type") | `T[]` and `readonly T[]`, never `Array<T>` or `ReadonlyArray<T>` |
| `explicit-function-return-type` | `frontend/eslint.config.mjs` ("@typescript-eslint/explicit-function-return-type") | a return type on every function and method, `const f = () => 1` included; exempt are a function expression outside a declaration (a callback written inline), one whose variable is typed, one that immediately returns another function, an arrow function that immediately returns an `as const` value, and a concise arrow function that starts with `void`, the five options at `frontend/eslint.config.mjs` ("allowExpressions: true") (https://typescript-eslint.io/rules/explicit-function-return-type/) |
| `eqeqeq` | `frontend/eslint.config.mjs` ("eqeqeq: ['error', 'always']") | `===` and `!==` always |
| `require-await`, `array-callback-return` | `frontend/eslint.config.mjs` ("require-await") | no `async` function without an `await`; a callback such as `map`'s returns a value, never a bare `return;`, and a `forEach` callback returns none (https://eslint.org/docs/latest/rules/array-callback-return) |
| `no-else-return` | `frontend/eslint.config.mjs` ("no-else-return") | no `else` after a `return`; `else if` allowed |
| smaller rules | `frontend/eslint.config.mjs` ("@typescript-eslint/prefer-for-of"), `frontend/eslint.config.mjs` ("no-constructor-return") | `prefer-for-of`, `arrow-body-style` as needed, `object-shorthand`, `class-literal-property-style` fields, `prefer-arrow-callback`, `operator-assignment`, and the `no-*` hygiene rules listed there |
| `curly` | `frontend/eslint.config.mjs` ("curly: ['error']") | set to error here and switched off by `frontend/eslint.config.mjs` ("eslintConfigPrettier,"); `--print-config` reports `[0,"all"]` |

The rules switched off in this block (`frontend/eslint.config.mjs`, "no-magic-numbers",
`frontend/eslint.config.mjs`, "id-length") are the relax pass of section 8.

## 4. Import boundaries

- **The message and the dynamic-import selector**: `frontend/eslint.config.mjs` ("const CROSS_APP_IMPORT_MESSAGE") and `frontend/eslint.config.mjs` ("const CROSS_APP_DYNAMIC_IMPORT"). The message is the fix: shared code moves into a library under `frontend/projects/` and is imported through its alias.
- **Admin** (`frontend/eslint.config.mjs`, "files: ['projects/admin/**/*.ts']"): no `@mi-bolt/api/*`, `@mi-bolt/mocks/*` or `**/shop-api/**` (`frontend/eslint.config.mjs`, "The shop SDK and mocks are not for the admin"), no path with a `storefront/` or `demo-payment/` segment (`frontend/eslint.config.mjs`, "(^|/)(storefront|demo-payment)/"), and `consistent-type-assertions` with `assertionStyle: 'never'` (`frontend/eslint.config.mjs`, "also takes no type assertion at all"), which still allows `as const`.
- **Storefront** (`frontend/eslint.config.mjs`, "files: ['projects/storefront/**/*.ts']"): no `admin/` or `demo-payment/` segment. **Demo-payment** (`frontend/eslint.config.mjs`, "files: ['projects/demo-payment/**/*.ts']"): no `storefront/` or `admin/` segment.
- **Dynamic `import()`** between apps: app source at `frontend/eslint.config.mjs` ("Dynamic imports between apps, for app source"), app specs at `frontend/eslint.config.mjs` ("app spec files take the test policy and the dynamic-import ban together").
- **The libraries** have no import ban of their own. The aliases (`frontend/tsconfig.json`, "paths") are visible to every project, so the lint rules above are the only thing keeping the admin off the shop's SDK and mocks.

## 5. Tests, coverage pragmas and end-to-end files

- **Test policy** (`frontend/eslint.config.mjs`, "const TEST_POLICY_SYNTAX", applied at `frontend/eslint.config.mjs` ("Test policy: a focused")): `only`, `skip`, `todo`, `fails`, `skipIf` and `runIf` are banned as a property, as a computed key, and when destructured, on `projects/**/*.spec.ts` and `tests/**/*.ts`.
- **Coverage pragmas** (`frontend/eslint.config.mjs`, "no-warning-comments"): a comment containing `v8 ignore`, `istanbul ignore` or `c8 ignore` anywhere is an error in `projects/`, `tests/` and `e2e/`.
- **`frontend/tests/`** keeps `no-explicit-any` (from `recommended`) but runs no type-aware rule, so `strict-boolean-expressions` and the `no-unsafe-*` rules do not reach it.
- **`frontend/e2e/` and `frontend/playwright.config.ts`** (`frontend/eslint.config.mjs`, "files: ['e2e/**/*.ts', 'playwright.config.ts']"): `recommended` presets, type-aware parsing, `playwright/no-focused-test`, `playwright/no-skipped-test` allowing the conditional `test.skip(condition, reason)`, `test` imported from `e2e/fixtures/coverage` rather than `@playwright/test` (lifted inside `e2e/fixtures/**`), and no `page.reload()` or `waitForTimeout()`. `e2e/seed.spec.ts` is the conventions file the specs follow rather than a test.

## 6. Templates

`projects/**/*.html` (`frontend/eslint.config.mjs`, "files: ['projects/**/*.html']"), and every inline template, which the processor at `frontend/eslint.config.mjs` ("processor: angular.processInlineTemplates") hands to ESLint as a virtual `.html` file under that glob:

- `templateRecommended`: `banana-in-box`, template `eqeqeq`, `no-negated-async`, `prefer-control-flow` (also set at `frontend/eslint.config.mjs` ("@angular-eslint/template/prefer-control-flow")).
- `templateAccessibility` (`frontend/eslint.config.mjs`, "angular.configs.templateAccessibility"): `alt-text`, `click-events-have-key-events`, `elements-content`, `interactive-supports-focus`, `label-has-associated-control`, `mouse-events-have-key-events`, `no-autofocus`, `no-distracting-elements`, `role-has-required-aria`, `table-scope`, `valid-aria`, all at error. How these sit beside the accessibility rule is recorded as a conflict; `SKILL.md` links the register.
- Set in the block (`frontend/eslint.config.mjs`, "@angular-eslint/template/attributes-order"): `attributes-order` (alphabetical, structural directives first, then template references, attributes, inputs, two-way bindings, outputs), `no-duplicate-attributes`, `no-interpolation-in-attributes`, `prefer-self-closing-tags`, `prefer-static-string-properties`, `prefer-template-literal`, `button-has-type`, and `no-any`, which bans `$any()`.

## 7. Written Angular and TypeScript rules: enforced or written only

| Written rule | Checked by |
| --- | --- |
| strict type checking (`SKILL.md`, "Types") | tsc: `strict` and the flags at `frontend/tsconfig.json` ("compilerOptions") |
| infer a type where it is obvious (`SKILL.md`, "Types") | `no-inferrable-types` under `projects/`, for an annotation on a number, string or boolean initialiser; `explicit-function-return-type` requires return types, a recorded conflict |
| avoid `any`, `unknown` when the type is uncertain (`SKILL.md`, "Types") | `no-explicit-any` in every linted TypeScript file except `e2e/seed.spec.ts` (section 1); `$any()` by the template `no-any` |
| no `as`, `satisfies` only where the value already matches (`SKILL.md`, "Types") | `consistent-type-assertions` with `assertionStyle: 'never'` in `projects/admin/**/*.ts` and two contract files only; elsewhere written only, a recorded conflict (register C1) |
| existing type guards first, one written when none fits; generic interfaces (`SKILL.md`, "Types") | written only |
| standalone, no `standalone: true` (`SKILL.md`, "Angular") | `prefer-standalone` reports `standalone: false` only; `standalone: true` is written only |
| no explicit `OnPush` (`SKILL.md`, "Angular") | written only: `allowExplicitOnPush` is true |
| no `@HostBinding` or `@HostListener`, the `host` object instead (`SKILL.md`, "Angular") | written only |
| `input()` and `output()` (`SKILL.md`, "Angular") | `@Input()` by `prefer-signals`; `@Output()` written only |
| `model()` for a two-way binding (`SKILL.md`, "Angular") | written only |
| inline templates for small components (`SKILL.md`, "Angular") | written only, and a recorded conflict with the code |
| small components and services with one responsibility each (`SKILL.md`, "Angular") | written only |
| no `ngClass`, `ngStyle` or `CommonModule` (`SKILL.md`, "Angular") | written only |
| native control flow (`SKILL.md`, "Angular") | `template/prefer-control-flow` |
| simple templates, no globals or `new` in one (`SKILL.md`, "Angular") | no lint rule; `$any()` by the template `no-any` |
| the `async` pipe for an observable a template reads (`SKILL.md`, "Angular") | written only, and a recorded conflict with the code |
| `signal()`, `computed()`, `linkedSignal()`, changed through `set()` or `update()` (`SKILL.md`, "Angular") | written only; `WritableSignal` has no `mutate()`, so tsc rejects a call to one |
| Signal Forms, else reactive forms (`SKILL.md`, "Angular") | written only |
| `@Service` for new singletons (`SKILL.md`, "Angular") | written only |
| `inject()` (`SKILL.md`, "Angular") | `prefer-inject` |
| lazy feature routes (`SKILL.md`, "Angular") | written only |

The installed angular-eslint 22.5.0 ships rules that would check several of
the written-only rows, and the config enables none of them (`--print-config`
on `frontend/projects/storefront/src/app/features/cart/cart-page.ts` and its
`.html`): `prefer-host-metadata-property` (`@HostBinding`,
`@HostListener`), `prefer-output-emitter-ref` (`@Output()`),
`prefer-signal-model` (an `input()` paired with an `output()` for a two-way
binding), `prefer-service-decorator` (`@Injectable({ providedIn: 'root' })`),
and the template rules `prefer-class-binding` and `prefer-style-binding`
(`ngClass`, `ngStyle`), each glossed in brackets from its own
`meta.docs.description`. Enabling one is a rule change, not part of a fix.

`git grep -nE 'standalone:|ChangeDetectionStrategy|@HostBinding|@HostListener|@Input\(|@Output\(|ngClass|ngStyle|CommonModule' -- frontend/projects ':!**/generated/**'`,
run from the repository root, finds any of them in the tree; where it prints
nothing and exits 1, any of them in a diff is new rather than a local habit.

## 8. The relax pass, and what stays

`frontend/docs/lint-relaxations.md` records the user's decision of 2026-09-20
to relax the adopted baseline, in their own words, with a before and after
count per rule. Switched off: every `unicorn/*` and `sonarjs/*` rule (both
plugins removed), `no-magic-numbers`, `no-restricted-syntax`, `id-length`, two
`security/*` rules, `no-void`, `max-lines-per-function` and `max-lines`.
`no-restricted-syntax` has since come back for the three narrow uses above:
the test policy, the dynamic-import ban and the end-to-end bans. What stays is
listed under "What stays" (`frontend/docs/lint-relaxations.md`, "What stays"), and
"How to reinstate" (`frontend/docs/lint-relaxations.md`, "How to reinstate") is the
procedure for putting a rule back.

Two statements no longer match the tree. The paragraph at
`frontend/docs/lint-relaxations.md` ("Since the MIM-209 switch") names three lint scopes, where
`frontend/angular.json` now gives six projects a lint target; and the config's
comments at `frontend/eslint.config.mjs` ("eslint-inventory.md for the full adaptation notes") and
`frontend/eslint.config.mjs` ("eslint-inventory.md. The remaining rules") refer to an `eslint-inventory.md` that no
tracked file matches.

## 9. Suppression comments in the tree

Hand-written code carries `eslint-disable-next-line
@typescript-eslint/no-deprecated` at
`frontend/projects/admin/src/app/shared/image-upload/media-uploader.spec.ts` ("eslint-disable-next-line @typescript-eslint/no-deprecated")
and `@ts-expect-error` with its reason at
`frontend/projects/storefront/src/app/shared/ui/price-block/price-block.spec.ts` ("@ts-expect-error"),
both in spec files and both naming what they suppress. The
`/* eslint-disable */` at the top of
`frontend/projects/storefront/public/mockServiceWorker.js` belongs to MSW's
generated worker file.
