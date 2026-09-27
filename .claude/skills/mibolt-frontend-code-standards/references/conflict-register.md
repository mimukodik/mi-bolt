# Frontend conflict register

Places where two sources disagree, or where the code does something a written
rule words differently. Each entry gives the sources, the state measured on
2026-09-26, and what is left alone. None of them is a defect report, and none
records a decision: where no source decides, the entry says so rather than
choosing. A change that would settle one is a rule change for the user, never a
side effect of other work, and once the user settles one, its entry leaves this
file and the rule goes into section 5 of `SKILL.md`.

## Contents

- C1. The `as` ban: written for every file, linted in admin and two contract files
- C2. Two ways to construct the shop `Api`
- C3. Inline templates preferred, external templates in use
- C4. The zoneless provider, explicit in two apps and omitted in one
- C5. `.scss` files written as CSS, with Sass line comments in three
- C6. How far the design reference reaches
- C7. The accessibility rule beside the template accessibility lint rules
- C8. Two checks that exist and that nothing runs
- C9. Inferred types preferred, return types required
- C10. The `async` pipe written, subscriptions into signals observed

## C1. The `as` ban: written for every file, linted in admin and two contract files

- **Written**: `as` is forbidden for the whole workspace, and what replaces one depends on what it did (`SKILL.md`, "Types").
- **Linted as written**: `consistent-type-assertions` with `assertionStyle: 'never'` covers `projects/admin/**/*.ts` (`frontend/eslint.config.mjs:389-391`) and two contract files (`frontend/eslint.config.mjs:441-443`), and the comment beside the second says "the older contract suites are not covered yet" (`frontend/eslint.config.mjs:440`). Everywhere else in `projects/` the rule runs at its default options, which accept `x as T` (https://typescript-eslint.io/rules/consistent-type-assertions/), and the rest of `frontend/tests/` and all of `frontend/e2e/` do not run it at all.
- **Observed**: counted with the TypeScript parser over the tracked `.ts` files, generated clients excluded and `as const` not counted, no non-spec file under `frontend/projects/` holds an assertion. They sit in spec and test code: 2 in storefront specs (for example `frontend/projects/storefront/src/app/features/catalog/catalog-page.spec.ts:1813`), 52 in `shop-mocks` specs (for example `frontend/projects/shop-mocks/src/active-scenario.spec.ts:52`), 55 under `frontend/tests/` (for example `frontend/tests/contract/response-validation.ts:127` and `frontend/tests/contract/operation-matrix.spec.ts:124`), 3 in end-to-end specs and 2 in `frontend/playwright.config.ts`.
- **Left alone**: the existing assertions, and the lint scope. New code follows the written rule wherever it is, because the narrower lint scope does not narrow the rule.

## C2. Two ways to construct the shop `Api`

- **`inject(Api)`**, in four storefront units, among them `frontend/projects/storefront/src/app/features/catalog/catalog.facade.ts:197`, `frontend/projects/storefront/src/app/features/product/product.facade.ts:119` and `frontend/projects/storefront/src/app/core/demo-access/demo-access.ts:62`; the fourth is the home page.
- **`new Api(inject(ApiConfiguration), inject(HttpClient))`**: `frontend/projects/storefront/src/app/features/cart/cart.facade.ts:159`, `frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts:244`, `frontend/projects/demo-payment/src/app/payment-page.ts:226`. The comment above each gives the reason: Vitest's esbuild pipeline does not emit the decorator metadata the generated class's constructor injection needs (`frontend/projects/storefront/src/app/features/cart/cart.facade.ts:152-158`).
- **How the specs supply it**: the catalogue facade's and the home page's specs replace `Api` with a stub (`provide: Api` with `useValue`); the specs of the cart facade, the checkout facade, the payment page and `demo-access.ts` drive real HTTP through MSW, the last one although its unit uses `inject(Api)` (`frontend/projects/storefront/src/app/core/demo-access/demo-access.spec.ts:32`), and so does the product facade's page spec (`frontend/projects/storefront/src/app/features/product/product-page.spec.ts:51`). A third form sits in the specs: `provide: Api` with a `useFactory` that calls `new Api(config, http)` (`frontend/projects/storefront/src/app/features/product/variant-selection.spec.ts:430-434`, `frontend/projects/storefront/src/app/features/catalog/catalog-page.spec.ts:331-335`, `frontend/projects/storefront/src/app/a11y-structure.spec.ts:485-489`), for the decorator-metadata reason `frontend/projects/storefront/src/app/features/product/variant-selection.spec.ts:425-429` gives.
- **Left alone**: the idiom of each existing unit, since a switch changes what its spec has to provide. No source decides which form a new unit uses. The admin app uses its own `AdminApi` through `inject()` and is outside this entry.

## C3. Inline templates preferred, external templates in use

- **Written**: a small component takes an inline template (`SKILL.md`, "Angular").
- **Observed** (non-spec components): the storefront has 57 `templateUrl` components and 1 inline template (`frontend/projects/storefront/src/app/features/checkout/navigation-reason-banner.ts:26`); the admin has 19 and 5 (for example `frontend/projects/admin/src/app/shared/forms/control-error.ts:17`); demo-payment has 2 and none.
- **Left alone**: existing components, in both directions. No decision is recorded between the written preference and the house pattern.

## C4. The zoneless provider, explicit in two apps and omitted in one

- **Framework**: zoneless change detection is the default from Angular v21, and nothing has to be done to enable it (https://angular.dev/guide/zoneless#enabling-zoneless-in-an-application, version 22 documentation).
- **Observed**: the storefront provides `provideZonelessChangeDetection()` at `frontend/projects/storefront/src/app/app.config.ts:19`, and `frontend/projects/storefront/src/app/app.spec.ts:107` asserts that it does; demo-payment provides it at `frontend/projects/demo-payment/src/app/app.config.ts:16`; the admin omits it, with a comment citing the default (`frontend/projects/admin/src/app/app.config.ts:21-23`).
- **Left alone**: all three. Removing the storefront's provider fails its spec, and adding one to the admin contradicts its comment; neither is a side change.

## C5. `.scss` files written as CSS, with Sass line comments in three

- **Observed**: 53 `.scss` files under `frontend/projects/storefront/`, none using `@use`, `@import`, `@mixin`, `@include`, `@forward` or a `$variable:` declaration (`git grep`, 2026-09-26). Three of them carry Sass's `//` line comments, which CSS does not have (https://sass-lang.com/documentation/syntax/comments/, https://www.w3.org/TR/css-syntax-3/): `frontend/projects/storefront/src/app/features/catalog/filter-drawer.scss:197-201`, `frontend/projects/storefront/src/app/features/catalog/filter-panel.scss:205-209`, `frontend/projects/storefront/src/app/layouts/checkout-layout.scss:9-15` and `frontend/projects/storefront/src/app/layouts/checkout-layout.scss:74-75`. The one other `.scss`, `frontend/projects/admin/src/material-theme.scss`, uses Sass (`@use '@angular/material' as mat;` at `frontend/projects/admin/src/material-theme.scss:6`).
- **Unknown**: whether Sass features are meant to be available in the storefront's files. angular.dev says the CLI "supports CSS imports and all major CSS preprocessors" (https://angular.dev/reference/configs/workspace-config#extra-build-and-test-options), but no page found in angular.dev's version 22 documentation says which preprocessor a component stylesheet's extension selects, so nothing here asserts that rule.
- **Left alone**: the file names and the existing comments. Introducing any other Sass feature into a storefront `.scss` file, such as `@use`, a mixin or a `$` variable, is a decision to raise, not a style choice.

## C6. How far the design reference reaches

- **Written**: the project makes `frontend/docs/design/yettel.md` the design reference for every rendered surface (`mibolt-shop-frontend` ("Design authority")), and the document calls itself "the mandatory design reference for the MiBolt frontend" (`frontend/docs/design/yettel.md:5`). It never mentions the admin app or demo-payment (`git grep`, 0 hits).
- **Observed**: the admin is styled with Angular Material's `azure-blue` theme and Tailwind utilities without Preflight (`frontend/projects/admin/README.md:5`, `frontend/projects/admin/README.md:70-72`). Demo-payment's stylesheet takes the shop's spacing, radii and a few colours from the design reference and records that its palette and typeface are deliberately not the shop's (`frontend/projects/demo-payment/src/styles.css:9-18`).
- **A third source**: `frontend/docs/spec/architecture.md:25` says "no Angular Material visual theme", in a document whose status line calls it an implementation-ready design rather than an implemented application (`frontend/docs/spec/architecture.md:3`).
- **Left alone**: no decision is recorded; the admin's styling itself belongs to `mibolt-admin-frontend`.

## C7. The accessibility rule beside the template accessibility lint rules

- **Written**: no work on AXE checks, WCAG AA minimums, keyboard handling or ARIA, and focus handling kept to what a native element gives (`SKILL.md`, "Accessibility").
- **Linted**: the template block extends `angular.configs.templateAccessibility` (`frontend/eslint.config.mjs:493`), so its eleven rules, `click-events-have-key-events`, `interactive-supports-focus` and `label-has-associated-control` among them, report at error level on every `projects/**/*.html` file and on every inline template, which `angular.processInlineTemplates` (`frontend/eslint.config.mjs:122`) hands to ESLint as a virtual `.html` file under the same glob (https://eslint.org/docs/latest/use/configure/plugins).
- **Measured**: in the installed angular-eslint 22.5.0, `click-events-have-key-events` skips an inherently interactive element, so a `(click)` on a native `<button>` does not trip it. The accessibility rule counts what a native element gives on its own as enough focus handling.
- **Observed**: the code already carries accessibility work the rule does not ask for: `frontend/projects/storefront/src/app/a11y-structure.spec.ts`, `frontend/projects/storefront/src/app/app-skip-link.spec.ts`, `role="alert"` at `frontend/projects/admin/src/app/shared/forms/control-error.ts:17`.
- **Left alone**: that existing code, which is neither extended nor removed as a side change. Both sources bind, and no source says which gives way when they meet: a changed template has to lint clean for the checks before a commit (`mibolt-verification` ("Gates before a commit")), and the accessibility rule says no work is spent on keyboard handling or ARIA. Where a rule of this preset fails on a changed template and a native element does not clear it, that is a question for the user, and so is any change to the preset.

## C8. Two checks that exist and that nothing runs

`frontend/scripts/check-budgets.mjs` and
`npm --prefix frontend run fixtures:catalog:check` both exist, and no workflow
under `.github/` and no `mise.toml` runs either (`git grep`, 2026-09-26), while
`frontend/README.md:63` and the script's own header
(`frontend/scripts/build-catalog-fixture.mjs:12-16`) describe the second as
CI's check. Both belong to `mibolt-verification`, which states their status in
full; they are named here only because frontend documents cite them as checks.

## C9. Inferred types preferred, return types required

- **Written**: a type is inferred where it is obvious (`SKILL.md`, "Types").
- **Linted**: `explicit-function-return-type` at error level (`frontend/eslint.config.mjs:299-308`) requires a return type on every function and method in `projects/**/*.ts` and `tests/**/*.ts`, `const f = () => 1` included; it exempts an inline callback, a function whose variable is already typed, one that directly returns another function, an arrow function that directly returns an `as const` value, and a concise arrow function that starts with `void`, the five options at `frontend/eslint.config.mjs:302-306` (https://typescript-eslint.io/rules/explicit-function-return-type/). On the same side as the written rule, `no-inferrable-types` rejects an annotation on a variable, parameter or property initialised to a number, string or boolean, under `projects/` only (https://typescript-eslint.io/rules/no-inferrable-types/).
- **Left alone**: the return types. A missing one fails the lint check, so the written preference reaches only what that rule leaves open; no source says whether the preference or the rule should give way.

## C10. The `async` pipe written, subscriptions into signals observed

- **Written**: an observable a template reads goes through the `async` pipe, and state lives in signals (`SKILL.md`, "Angular").
- **Observed**: no template reads an observable. Outside the specs and the generated clients, `| async` occurs nowhere and `.subscribe(` occurs 20 times in class code (`git grep`, 2026-09-26), for example at `frontend/projects/storefront/src/app/features/home/home-page.ts:71-81`, which writes a generated client's result into a signal.
- **Left alone**: the existing subscriptions. No source says whether a new unit hands its template an observable through the pipe or a signal set from a subscription.
