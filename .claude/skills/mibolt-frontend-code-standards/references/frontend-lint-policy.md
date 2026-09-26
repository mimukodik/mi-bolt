# Frontend lint policy, rule by rule

The detail behind section 5 of `SKILL.md`: which block of the ESLint config
reaches which files, the options each rule runs with, which written Angular
and TypeScript rules no tool checks, and what the relax pass switched off.
Globs are quoted as the config writes them, relative to `frontend/`. The effective values were read
with `npx eslint --print-config` on 2026-09-26 (ESLint 10.10.0,
typescript-eslint 8.69.0, angular-eslint 22.5.0); when a config line has moved,
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

| Lines of `frontend/eslint.config.mjs` | Files | What the block adds |
| --- | --- | --- |
| `frontend/eslint.config.mjs:73-82` | every linted file | `security.configs.recommended`, whose rules run as warnings, minus `detect-object-injection` and `detect-non-literal-fs-filename` |
| `frontend/eslint.config.mjs:83-107` | none | the ignore list: build output, the two generated clients (`frontend/eslint.config.mjs:88-92`), the Vitest configs, `tsconfig*.json`, `docs/**`, `.angular/**`, `public/**` |
| `frontend/eslint.config.mjs:108-191` | `projects/**/*.ts` | the type-aware presets and rules of section 2, with `projectService` |
| `frontend/eslint.config.mjs:192-203` | `tests/**/*.ts` | `recommended` presets only: `tests/` belongs to no tsconfig, so no type-aware rule runs there |
| `frontend/eslint.config.mjs:204-342` | `projects/**/*.ts`, `tests/**/*.ts` | the shared rules of section 3 |
| `frontend/eslint.config.mjs:343-384` | `e2e/**/*.ts`, `playwright.config.ts` | the Playwright rules of section 5; `e2e/seed.spec.ts` is taken out of that block, so ESLint parses it with its default JavaScript parser and runs only the `security/*` warnings and the coverage-pragma ban on it |
| `frontend/eslint.config.mjs:385-437` | each app | the import boundaries of section 4, and the admin assertion ban |
| `frontend/eslint.config.mjs:438-445` | `tests/contract/admin-tags.ts`, `tests/contract/sdk-split.spec.ts` | the assertion ban |
| `frontend/eslint.config.mjs:453-472` | `projects/**/*.spec.ts`, `tests/**/*.ts` | the test policy |
| `frontend/eslint.config.mjs:473-484` | `projects/**/*.ts`, `tests/**/*.ts`, `e2e/**/*.ts` | the coverage-pragma ban |
| `frontend/eslint.config.mjs:485-531` | `projects/**/*.html` | the template rules of section 6 |
| `frontend/eslint.config.mjs:532` | all | `eslint-config-prettier`, applied last, which switches formatting rules off |

The config says which rules apply to a file; `frontend/angular.json` says which
files `ng lint` visits, per project `lintFilePatterns`:

- storefront, `frontend/angular.json:132-138`: its own `src/`, plus `tests/**/*.ts`, `e2e/**/*.ts` and `playwright.config.ts`, so the whole of `frontend/tests/` and `frontend/e2e/` is linted under the storefront's target;
- demo-payment `frontend/angular.json:229-232`, admin `frontend/angular.json:387`, `core-api` `frontend/angular.json:432`, `shop-mocks` `frontend/angular.json:494`;
- `shop-api` `frontend/angular.json:459`, where the only hand-written source is `frontend/projects/shop-api/src/public-api.ts` and the rest is ignored as generated.

## 2. Type-aware rules on `projects/**/*.ts`

- **Presets** (`frontend/eslint.config.mjs:110-115`): `eslint.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, `angular.configs.tsRecommended`. Among what they switch on, as `--print-config` reports it: `no-explicit-any`, `no-non-null-assertion`, `no-unsafe-assignment` and the other `no-unsafe-*` rules, `no-floating-promises`, `prefer-nullish-coalescing`, and `consistent-type-assertions` at its default options, which accept `x as T` and reject only the `<T>x` form (https://typescript-eslint.io/rules/consistent-type-assertions/).
- **From `tsRecommended`**: `@angular-eslint/prefer-inject` (constructor-parameter injection reported), `prefer-standalone` (reports `standalone: false` and leaves `standalone: true` alone), `prefer-on-push-component-change-detection` with `allowExplicitOnPush: true` (reports only an opt-out of the default `OnPush`), `no-input-rename`, `no-output-native`, `no-output-on-prefix`, `no-output-rename`, and the lifecycle rules. Those behaviours are read from the installed rule sources.
- **Selectors** (`frontend/eslint.config.mjs:127-142`): components are kebab-case elements and directives camelCase attributes, with prefix `app`, `pay` or `adm`; the rule accepts any of the three in any project, while `frontend/angular.json:15`, `frontend/angular.json:148` and `frontend/angular.json:243` give storefront, demo-payment and admin one each.
- **`@angular-eslint/prefer-signals`** (`frontend/eslint.config.mjs:146`): `input()` rather than `@Input()`, the signal query functions rather than `@ViewChild()` and the other query decorators, and every signal property `readonly`. The installed rule has no check for `@Output()`, although the comment above it (`frontend/eslint.config.mjs:143-145`) says it forbids one.
- **Unused names** (`frontend/eslint.config.mjs:152-165`): a parameter, variable or caught error named with a leading `_` is exempt; unused imports are errors.
- **`no-extraneous-class`** (`frontend/eslint.config.mjs:168`): a decorated class with no members is allowed, for a component that is only a template.
- **`no-unnecessary-condition`** and **`prefer-readonly`** (`frontend/eslint.config.mjs:175-176`).
- **`strict-boolean-expressions`** (`frontend/eslint.config.mjs:177-188`): `allowString`, `allowNumber`, `allowNullableObject`, `allowNullableBoolean`, `allowNullableString`, `allowNullableNumber` and `allowAny` are all set false; `allowNullableEnum` is not set and defaults to false. The defaults for `allowString`, `allowNumber` and `allowNullableObject` are true, so this is stricter than the preset: only `boolean` (and `never`) passes as a condition (https://typescript-eslint.io/rules/strict-boolean-expressions/).
- **`no-for-in-array`** (`frontend/eslint.config.mjs:189`).
- **Inline templates**: `processor: angular.processInlineTemplates` (`frontend/eslint.config.mjs:122`).

## 3. Rules shared by `projects/**/*.ts` and `tests/**/*.ts`

| Rule | Lines | What it asks for |
| --- | --- | --- |
| `consistent-type-imports` | `frontend/eslint.config.mjs:212-218` | a type-only import as its own `import type { X }` statement |
| `explicit-member-accessibility` | `frontend/eslint.config.mjs:219-231` | no `public` keyword on a method, accessor, constructor or parameter property; properties are not checked |
| `naming-convention` | `frontend/eslint.config.mjs:250-291` | PascalCase for types, interfaces, enums, enum members, type aliases and type parameters (`TKey`, not `T_KEY`); private members camelCase with no leading `_` |
| `array-type` | `frontend/eslint.config.mjs:292-298` | `T[]` and `readonly T[]`, never `Array<T>` or `ReadonlyArray<T>` |
| `explicit-function-return-type` | `frontend/eslint.config.mjs:299-308` | a return type on every function and method, `const f = () => 1` included; exempt are a function expression outside a declaration (a callback written inline), one whose variable is typed, and one that immediately returns another function (https://typescript-eslint.io/rules/explicit-function-return-type/) |
| `eqeqeq` | `frontend/eslint.config.mjs:241` | `===` and `!==` always |
| `require-await`, `array-callback-return` | `frontend/eslint.config.mjs:329-337` | no `async` function without an `await`; a callback such as `map`'s returns a value, never a bare `return;`, and a `forEach` callback returns none (https://eslint.org/docs/latest/rules/array-callback-return) |
| `no-else-return` | `frontend/eslint.config.mjs:315-320` | no `else` after a `return`; `else if` allowed |
| smaller rules | `frontend/eslint.config.mjs:232-243`, `frontend/eslint.config.mjs:309-328` | `prefer-for-of`, `arrow-body-style` as needed, `object-shorthand`, `class-literal-property-style` fields, `prefer-arrow-callback`, `operator-assignment`, and the `no-*` hygiene rules listed there |
| `curly` | `frontend/eslint.config.mjs:239` | set to error here and switched off by `frontend/eslint.config.mjs:532`; `--print-config` reports `[0,"all"]` |

The rules switched off in this block (`frontend/eslint.config.mjs:244-249`,
`frontend/eslint.config.mjs:338-340`) are the relax pass of section 8.

## 4. Import boundaries

- **The message and the dynamic-import selector**: `frontend/eslint.config.mjs:21-32`. The message is the fix: shared code moves into a library under `frontend/projects/` and is imported through its alias.
- **Admin** (`frontend/eslint.config.mjs:385-409`): no `@mi-bolt/api/*`, `@mi-bolt/mocks/*` or `**/shop-api/**` (`frontend/eslint.config.mjs:397`), no path with a `storefront/` or `demo-payment/` segment (`frontend/eslint.config.mjs:402`), and `consistent-type-assertions` with `assertionStyle: 'never'` (`frontend/eslint.config.mjs:391`), which still allows `as const`.
- **Storefront** (`frontend/eslint.config.mjs:410-418`): no `admin/` or `demo-payment/` segment. **Demo-payment** (`frontend/eslint.config.mjs:419-427`): no `storefront/` or `admin/` segment.
- **Dynamic `import()`** between apps: app source at `frontend/eslint.config.mjs:428-437`, app specs at `frontend/eslint.config.mjs:463-472`.
- **The libraries** have no import ban of their own. The aliases (`frontend/tsconfig.json:17-21`) are visible to every project, so the lint rules above are the only thing keeping the admin off the shop's SDK and mocks.

## 5. Tests, coverage pragmas and end-to-end files

- **Test policy** (`frontend/eslint.config.mjs:35-65`, applied at `frontend/eslint.config.mjs:453-472`): `only`, `skip`, `todo`, `fails`, `skipIf` and `runIf` are banned as a property, as a computed key, and when destructured, on `projects/**/*.spec.ts` and `tests/**/*.ts`.
- **Coverage pragmas** (`frontend/eslint.config.mjs:473-484`): a comment containing `v8 ignore`, `istanbul ignore` or `c8 ignore` anywhere is an error in `projects/`, `tests/` and `e2e/`.
- **`frontend/tests/`** keeps `no-explicit-any` (from `recommended`) but runs no type-aware rule, so `strict-boolean-expressions` and the `no-unsafe-*` rules do not reach it.
- **`frontend/e2e/` and `frontend/playwright.config.ts`** (`frontend/eslint.config.mjs:343-384`): `recommended` presets, type-aware parsing, `playwright/no-focused-test`, `playwright/no-skipped-test` allowing the conditional `test.skip(condition, reason)`, `test` imported from `e2e/fixtures/coverage` rather than `@playwright/test` (lifted inside `e2e/fixtures/**`), and no `page.reload()` or `waitForTimeout()`. `e2e/seed.spec.ts` is the conventions file the specs follow rather than a test.

## 6. Templates

`projects/**/*.html` (`frontend/eslint.config.mjs:485-531`), and every inline template, which the processor at `frontend/eslint.config.mjs:122` hands to ESLint as a virtual `.html` file under that glob:

- `templateRecommended`: `banana-in-box`, template `eqeqeq`, `no-negated-async`, `prefer-control-flow` (also set at `frontend/eslint.config.mjs:498`).
- `templateAccessibility` (`frontend/eslint.config.mjs:493`): `alt-text`, `click-events-have-key-events`, `elements-content`, `interactive-supports-focus`, `label-has-associated-control`, `mouse-events-have-key-events`, `no-autofocus`, `no-distracting-elements`, `role-has-required-aria`, `table-scope`, `valid-aria`, all at error. How these sit beside the accessibility rule is recorded as a conflict; `SKILL.md` links the register.
- Set in the block (`frontend/eslint.config.mjs:509-529`): `attributes-order` (alphabetical, structural directives first, then template references, attributes, inputs, two-way bindings, outputs), `no-duplicate-attributes`, `no-interpolation-in-attributes`, `prefer-self-closing-tags`, `prefer-static-string-properties`, `prefer-template-literal`, `button-has-type`, and `no-any`, which bans `$any()`.

## 7. Written Angular and TypeScript rules: enforced or written only

| Written rule | Checked by |
| --- | --- |
| strict type checking (`SKILL.md`, "Types") | tsc: `strict` and the flags at `frontend/tsconfig.json:6-10` |
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
`.html`, 2026-09-26): `prefer-host-metadata-property` (`@HostBinding`,
`@HostListener`), `prefer-output-emitter-ref` (`@Output()`),
`prefer-signal-model` (an `input()` paired with an `output()` for a two-way
binding), `prefer-service-decorator` (`@Injectable({ providedIn: 'root' })`),
and the template rules `prefer-class-binding` and `prefer-style-binding`
(`ngClass`, `ngStyle`), each glossed in brackets from its own
`meta.docs.description`. Enabling one is a rule change, not part of a fix.

`git grep -nE 'standalone:|ChangeDetectionStrategy|@HostBinding|@HostListener|@Input\(|@Output\(|ngClass|ngStyle|CommonModule' -- frontend/projects ':!**/generated/**'`,
run from the repository root on 2026-09-26, printed nothing and exited 1, so
any of them in a diff is new rather than a local habit. Re-run it before
relying on the sentence.

## 8. The relax pass, and what stays

`frontend/docs/lint-relaxations.md` records the user's decision of 2026-09-20
to relax the adopted baseline, in their own words, with a before and after
count per rule. Switched off: every `unicorn/*` and `sonarjs/*` rule (both
plugins removed), `no-magic-numbers`, `no-restricted-syntax`, `id-length`, two
`security/*` rules, `no-void`, `max-lines-per-function` and `max-lines`.
`no-restricted-syntax` has since come back for the three narrow uses above:
the test policy, the dynamic-import ban and the end-to-end bans. What stays is
listed under "What stays" (`frontend/docs/lint-relaxations.md:49-57`), and
"How to reinstate" (`frontend/docs/lint-relaxations.md:59-62`) is the
procedure for putting a rule back.

Two statements no longer match the tree. The paragraph at
`frontend/docs/lint-relaxations.md:13-17` names three lint scopes, where
`frontend/angular.json` now gives six projects a lint target; and the config's
comments at `frontend/eslint.config.mjs:72` and
`frontend/eslint.config.mjs:506` refer to an `eslint-inventory.md` that no
tracked file matches.

## 9. Suppression comments in the tree

On 2026-09-26 hand-written code carried two: `eslint-disable-next-line
@typescript-eslint/no-deprecated` at
`frontend/projects/admin/src/app/shared/image-upload/media-uploader.spec.ts:54`
and `@ts-expect-error` with its reason at
`frontend/projects/storefront/src/app/shared/ui/price-block/price-block.spec.ts:146`,
both in spec files and both naming what they suppress. The
`/* eslint-disable */` at the top of
`frontend/projects/storefront/public/mockServiceWorker.js` belongs to MSW's
generated worker file.
