---
name: mibolt-admin-frontend
description: "Changing the MiBolt admin back-office app, frontend/projects/admin: the dashboard, product list filters, the product edit form and its validation, unsaved-changes warnings, sign-in and the redirect after a 401, If-Match save conflicts, admin users, image upload, Material styling, its own mocks. Load it before answering or changing anything there, however small. Not for the storefront or the API contract."
---

# MiBolt admin frontend

Change `frontend/projects/admin/`, the shop's back-office Angular app, the way it is already
built. A path starting with scripts/, references/, assets/ or agents/, or the name `SKILL.md`, is
relative to this skill's own directory, and one starting with a MiBolt skill name is relative to
the directory that holds the MiBolt skills; every other path in this skill and its references is
relative to the repository root.

## Scope and hand-offs

This skill covers everything under `frontend/projects/admin/` except the content of the generated
client: bootstrap and providers, routes and guards, `AdminSession`, the admin's own interceptors,
the stores, the Signal Forms helpers, the image upload, the Material and Tailwind styling, the
in-page mock backend in `frontend/projects/admin/src/mocks/` and the spec harness in
`frontend/projects/admin/src/testing/`.

Hand these to the skill that owns them:

- **The contract and the generated client.** A new field, parameter, operation or error code,
  regenerating or drift-checking the clients, the admin tag list in
  `frontend/ng-openapi-gen.admin.json`, and the operation counts pinned in
  `frontend/tests/contract/sdk-split.spec.ts:123-126` go to `mibolt-cross-package-changes`. Nothing
  in `frontend/projects/admin/src/app/api/generated/` is edited by hand
  (`frontend/docs/api/README.md:9`).
- **Server behaviour.** What an `/api/v1/admin/**` operation does, admin security and server-side
  validation go to `mibolt-commerce-backend`.
- **The shop apps.** The storefront, demo-payment and `shop-mocks` go to `mibolt-shop-frontend`.
- **`@mi-bolt/core-api`.** The admin uses only its `resolveApiRoot` and `dismissSplash`; a change
  to that library goes to `mibolt-cross-package-changes`.

Consult `mibolt-frontend-code-standards` when a lint or typecheck error appears, or when it is
unclear whether a pattern is allowed here. Consult `mibolt-verification` before declaring the work
done; it owns the full check matrix, which this skill does not repeat.

## How the admin is built

- **An app of its own.** Selector prefix `adm`, served under `/admin/`
  (`frontend/angular.json:251`), dev server on port 4220 (`frontend/angular.json:341-342`),
  Hungarian UI copy, `LOCALE_ID` `hu-HU`. The routes are `/bejelentkezes` (sign-in),
  `/attekintes` (the Áttekintés overview, which its component calls the dashboard), `/termekek`,
  `/termekek/uj`, `/termekek/:productId` and `/adminok`; the page to return to after sign-in
  travels in the `vissza` query parameter.
- **Its own client.** `AdminApi` is generated into
  `frontend/projects/admin/src/app/api/generated/` from the same contract as the shop SDK,
  restricted to the `AdminAuth`, `AdminUsers`, `AdminProducts` and `AdminMedia` tags and without an
  `If-Match` parameter (`frontend/ng-openapi-gen.admin.json:12-13`). Import it by relative path;
  there is no alias. Call `api.invoke(fn, params, context)`, or `invoke$Response` when a response
  header such as `ETag` matters. Its product schemas are its own: the edit page reads
  `AdminProduct` and writes `AdminProductInput`, objects in `contracts/commerce/openapi.yaml`
  separate from the shop's `Product`, so a field for the admin form goes on those two and reaches
  the shop only if `Product` gets it as well.
- **Its own mocks.** On the `development` configuration every API call is answered inside the page
  by `frontend/projects/admin/src/mocks/`, and the unit specs run on the same handlers. The
  `local-backend` configuration proxies `/api` to the Spring backend on port 8080 instead
  (`frontend/projects/admin/README.md:34-47`).
- **One provider list.** `frontend/projects/admin/src/app/app.config.ts:42-53`: the browser global
  error listeners, the router with component input binding, the admin's API configuration,
  `HttpClient` with the interceptors `ifMatchInterceptor`, `unauthorizedInterceptor` and
  `transportInterceptor` in that order, the app initializer that runs `AdminSession.refresh()`,
  and `LOCALE_ID`.
- **Session and sign-in.** `AdminSession.current` is `undefined` until the initializer has run,
  then `null` or the signed-in `AdminUser`. `adminAuthGuard` sends a signed-out visit to
  `/bejelentkezes` with `vissza`; a 401 from any call does the same through
  `unauthorizedInterceptor`; the login page returns to `vissza` only when `isSafeTarget` accepts it
  (`frontend/projects/admin/src/app/features/login/login-page.ts:28-36`).
- **Optimistic concurrency.** Product writes carry `If-Match` through the admin's own
  `withIfMatch` (`frontend/projects/admin/src/app/core/api/if-match.interceptor.ts:6-8`), not the
  one in `@mi-bolt/core-api`. A 412 means someone else saved first.
- **State.** Root singletons are `@Service()`: `AdminSession` and `MediaUploader`. The product
  list, the product editor and the admins screen keep their state in an `@Injectable()` store
  listed in the page's own `providers`: `ProductListStore`, `ProductEditStore`, `AdminsStore`; the
  overview holds its per-card `Loadable<T>` signals in the component, and the login page works
  through `AdminSession`. A store method that calls the backend never rejects; it returns a tagged
  union (`SaveResult`, `RowActionResult`, `DeleteResult`) or sets a status signal, and the page
  switches on it.
- **Forms.** Every form is a Signal Form from `@angular/forms/signals`; the admin imports nothing
  from `@angular/forms`. The shared pieces are in `frontend/projects/admin/src/app/shared/forms/`:
  `SubmitAttempt` (submit, disabled state, focus on the first error), `MESSAGES` and
  `SERVER_FIELD_MESSAGES`, `toServerErrors` for a 400 or 422 answer that carries field errors, and
  `adm-control-error`.
- **Transport.** HttpClient keeps its default fetch backend. The image upload alone is marked
  `USE_XHR`, because fetch produces no upload progress events
  (https://angular.dev/guide/http/setup#withxhr).
- **Styling.** Angular Material 3 with the azure and blue palettes
  (`frontend/projects/admin/src/material-theme.scss`), Tailwind utilities without Preflight
  (`frontend/projects/admin/src/styles.css`), and component styles on Material's `--mat-sys-*`
  variables.
- **A small initial bundle.** Material, the shell, the dialogs and the locale data load with the
  route or the action that needs them (the `MIM-404` comments in
  `frontend/projects/admin/src/app/app.config.ts` and `frontend/projects/admin/src/app/app.routes.ts`).
  Import nothing from Angular Material into `frontend/projects/admin/src/app/app.config.ts` or
  `frontend/projects/admin/src/app/app.ts`.

## Where to start

Read the route first, then the page, then its store: `frontend/projects/admin/src/app/app.routes.ts`
names each screen's lazily loaded routes file, and that file names the page component.

Where each concern lives:

- Session, guards and the 401 redirect: `frontend/projects/admin/src/app/core/auth/`.
- `If-Match`, the XHR mark and Problem reading: `frontend/projects/admin/src/app/core/api/`.
- Shell, side navigation and account menu: `frontend/projects/admin/src/app/layout/shell.component.ts`.
- Screens: `frontend/projects/admin/src/app/features/` (`login`, `overview`, `products/list`,
  `products/edit`, `admins`, `account`).
- Image upload: `frontend/projects/admin/src/app/shared/image-upload/`; confirm dialog:
  `frontend/projects/admin/src/app/shared/confirm-dialog/confirm-dialog.ts`.
- Type guards: `frontend/projects/admin/src/app/core/is-record.ts` and `isProblem` in
  `frontend/projects/admin/src/app/core/api/problem.ts`.

Canonical examples; copy the pattern of the closest one:

- A list screen with its state in the URL, virtual scroll and row actions under `If-Match`:
  `frontend/projects/admin/src/app/features/products/list/product-list-page.ts`,
  `frontend/projects/admin/src/app/features/products/list/product-list.store.ts`,
  `frontend/projects/admin/src/app/features/products/list/product-list.query.ts`,
  `frontend/projects/admin/src/app/features/products/list/product-list.data-source.ts`.
- A create and edit form over a store that keeps the `ETag`:
  `frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`,
  `frontend/projects/admin/src/app/features/products/edit/product-edit.store.ts`,
  `frontend/projects/admin/src/app/features/products/edit/product-form.schema.ts`,
  `frontend/projects/admin/src/app/features/products/edit/product-form.mapper.ts`.
- The smallest complete store: `frontend/projects/admin/src/app/features/admins/admins.store.ts`.
- The submit behaviour every form shares:
  `frontend/projects/admin/src/app/shared/forms/submit-attempt.ts`.
- A dialog with one way out:
  `frontend/projects/admin/src/app/features/products/edit/conflict-dialog.ts`.
- Independent loading and error states per card:
  `frontend/projects/admin/src/app/features/overview/overview.component.ts`.
- A spec that drives real HTTP through the mocks:
  `frontend/projects/admin/src/app/core/auth/admin-session.spec.ts`.

## Typical work

**Start every change the same way.** Find the route, open the page and its store, and find the mock
handler in `frontend/projects/admin/src/mocks/` that answers the store's calls. Before editing,
check that the generated models in `frontend/projects/admin/src/app/api/generated/models/` carry
what the change needs. If they do not, the change starts in `mibolt-cross-package-changes`, and
this skill takes over once the client is regenerated.

**Add or change a product field.** The form model, the mapper, the schema, the messages, the owning
card with its error count, the write mock and the seed, then the specs. The chain with every file is
in [references/product-form.md](references/product-form.md), section 4.

**Change a list filter, the sort or a column.** The router query is the list's only state, so the
codec in `frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, the control
in `ProductFilters` and the read mock's query handling change together. The chains are in
[references/product-form.md](references/product-form.md), sections 7 and 8.

**Add a screen.** A directory under `frontend/projects/admin/src/app/features/`, a lazy child of the
shell route, a link in the side navigation, a store in the page's `providers`, and mock handlers for
what it calls; see [references/admin-architecture.md](references/admin-architecture.md), section 9.

**Change session or auth behaviour.** Work in `frontend/projects/admin/src/app/core/auth/` and keep
the interceptor order in `frontend/projects/admin/src/app/app.config.ts:48`. Keep
`skipUnauthorizedRedirect()` on every session call that carries it: `refresh()`'s session read,
`login()`'s priming GET and POST, and `logout()`
(`frontend/projects/admin/src/app/core/auth/admin-session.ts:36-82`). Their caller handles a 401
itself, and the interceptor must not also navigate
(`frontend/projects/admin/src/app/core/auth/admin-session.ts:65-70`). Keep every post-login target
behind `isSafeTarget`.

**Warn before leaving the product editor.** No `canDeactivate` guard exists yet. Put one, a
`CanDeactivateFn` (https://angular.dev/api/router/CanDeactivateFn), on both `uj` and `:productId`
in `frontend/projects/admin/src/app/features/products/products.routes.ts:11-22`, so create and
edit are both covered, and ask through `openConfirm`
(`frontend/projects/admin/src/app/shared/confirm-dialog/confirm-dialog.ts:55`), the admin's one
confirmation dialog. Read [references/product-form.md](references/product-form.md), section 1,
first: the form's `dirty()` misses row edits, and a successful create navigates away without
resetting the form. The guard also runs when the app itself leaves for the login page after the
session is gone, on a 401
(`frontend/projects/admin/src/app/core/auth/unauthorized.interceptor.ts:28-33`) and on sign-out
(`frontend/projects/admin/src/app/layout/shell.component.ts:99-102`), where a cancel keeps the
edits on a page that can no longer save them. It never runs on a reload, a closed tab or a typed
URL, which only a `beforeunload` listener catches, and that shows the browser's own dialog, not
`openConfirm` (https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event). Which
of these the warning covers is the user's to settle; ask before building it.

**Handle a new error code.** Read it inside the store with `problemOf(error)?.code`, add a kind to
the store's result union, give the page a branch for that kind, and put any field-level text in
`SERVER_FIELD_MESSAGES` (`frontend/projects/admin/src/app/shared/forms/messages.ts:26-43`). The code
itself reaches the client through `mibolt-cross-package-changes`.

**Change mock data or behaviour.** Follow [references/admin-mocks.md](references/admin-mocks.md).

**Finish every change** with the specs beside each changed file, the mock answering any request or
response that changed, and the checks under "Verify".

## Rules that bind here

Each line names a rule and where it is written or enforced; the owner carries the detail.

- **No type assertion, `as const` aside.** ESLint enforces it for the admin
  (`frontend/eslint.config.mjs:389-391`), stricter than for the rest of the workspace; the written
  rule is `mibolt-frontend-code-standards` ("Types"). First check whether a generic already
  carries the type: the generated `invoke<P, R>` returns an `Observable<R>` of the
  operation's own response type, and `invoke$Response<P, R>` an `Observable<StrictHttpResponse<R>>`
  (`frontend/projects/admin/src/app/api/generated/admin-api.ts:45-57`), so what they emit needs
  neither an `as` nor a guard. An `as` that narrows becomes a guard: `isRecord`, `isProblem`, or a
  local literal-union guard like those at
  `frontend/projects/admin/src/app/features/products/list/product-list.query.ts:67-83`.
  `mibolt-frontend-code-standards` owns the lint detail, what replaces an `as` that widens, and
  where `satisfies` replaces one.
- **No shop SDK, no shop mocks, no other app.** Importing `@mi-bolt/api/*`, `@mi-bolt/mocks/*`,
  anything under `shop-api`, or anything from `storefront` or `demo-payment` is a lint error here
  (`frontend/eslint.config.mjs:392-407`). A dynamic `import()` is linted only for the app segments
  (`frontend/eslint.config.mjs:428-437`), because `no-restricted-imports` does not visit one
  (`frontend/eslint.config.mjs:26-28`), so a dynamic `import()` of the shop SDK or mocks passes
  lint and review is what keeps it out. Code two apps need moves into a library, which is
  `mibolt-cross-package-changes`'s; `mibolt-frontend-code-standards` owns the lint detail.
- **The Angular conventions** that `mibolt-frontend-code-standards` ("Angular") lists hold here,
  and the admin follows them throughout: signal inputs and outputs, `computed`, native control
  flow, `@Service()` for root singletons and Signal Forms among them.
- **Stores never reject.** A new store method that calls the backend returns a tagged union or sets
  a status signal, like the existing ones. Nothing enforces it but review.
- **Hungarian UI copy, English code.** Validation text comes from
  `frontend/projects/admin/src/app/shared/forms/messages.ts`, never from an inline string.
- **Accessibility.** No work goes into AXE checks, WCAG minimums, keyboard handling or ARIA, and
  focus handling stays minimal, per `mibolt-frontend-code-standards` ("Accessibility"). The admin
  already carries ARIA and focus code: `role="alert"` in `adm-control-error`, focus moved to a
  title before a reload removes the focused button, `SubmitAttempt` focusing the first invalid
  control, and the list's row and cell roles. Neither extend it nor remove it as a side change; it
  leaves with an element or a feature the change itself removes, per
  `mibolt-frontend-code-standards` ("Removed features"). A new list column copies its neighbours'
  markup as it stands, roles included, which is not extending it
  ([references/product-form.md](references/product-form.md), section 8).
- **Framework questions** about Angular, Angular Material, Vitest or MSW are answered from that
  tool's documentation for the installed version, with the URL beside the claim, and never by a
  throwaway experiment; `mibolt-frontend-code-standards` ("Framework questions") says where to
  read and what counts as measuring this repository instead.
- **The design reference is an open question.** `frontend/docs/design/yettel.md:5` calls that
  document "the mandatory design reference for the MiBolt frontend", yet it never mentions the
  admin, while `frontend/projects/admin/README.md:5` and
  `frontend/projects/admin/README.md:70-72` describe Angular Material with the `azure-blue` theme
  and Tailwind utilities, which is what the admin's code uses. Which of the two governs an admin
  style value is the user's to settle, and this skill does not settle it. A change that needs a new
  style value puts that choice to the user, naming both sources. `mibolt-frontend-code-standards`
  records the same open question as entry C6 of its conflict register, which also names a third,
  pre-implementation source.
- **End-to-end tests.** The admin has no Playwright spec, and the servers
  `frontend/playwright.config.ts:26-53` starts are the storefront's and, in CI, demo-payment's,
  never the admin's; the conventions file `frontend/e2e/seed.spec.ts:62-68` records the admin's
  sign-in. The admin is verified by unit specs over its mocks and by the browser pass.
- **A bug gets a spec** that fails before the fix and passes after it, in the same change, per
  `mibolt-verification` ("Tests and coverage").

## What else a change reaches

- **The mocks and the specs, together.** The dev server and the unit specs run on the same
  handlers, so a request or response shape the mock does not follow breaks both. A mock that
  answers more leniently than the backend hides a bug; match the backend's answer, which
  `mibolt-commerce-backend` owns.
- **The contract.** A field, parameter, operation or error code the generated client lacks comes
  from the contract first, through `mibolt-cross-package-changes`. A new admin operation also moves
  the pinned count in `frontend/tests/contract/sdk-split.spec.ts:123-126`, which that skill owns.
- **Validation twins.** The limits in `productFormSchema` and in the login and admin forms repeat
  the contract and the backend validator, and the mock handlers repeat them again. A limit changed
  in one place changes in all of them.
- **The overview's links.** The overview cards open the list with query parameters
  (`frontend/projects/admin/src/app/features/overview/overview.component.ts:28-54`); a renamed list
  query key breaks them.
- **Catalogue data.** `frontend/projects/admin/src/mocks/seed.ts:1` imports
  `data/catalog/catalog.json`, so a catalogue change, owned by `mibolt-cross-package-changes`,
  changes the admin's seeded products, which specs such as
  `frontend/projects/admin/src/mocks/products-write.validation.spec.ts` pick by id.
- **The production build.** No mock code may reach it: the `production` configuration swaps the
  mock's entry for a stub (`frontend/angular.json:287-292`), and `check:admin-dist` proves it. The
  initial bundle is budgeted at 500 kB warning and 1 MB error (`frontend/angular.json:269-274`).
- **`@mi-bolt/core-api`.** A new interceptor there reaches the admin only if
  `frontend/projects/admin/src/app/app.config.ts` adds it.

## Verify

Run everything from the repository root, in the forms `mibolt-workspace-ops` ("Where commands
run") gives. The checks that pass before every commit are in `mibolt-verification` ("Gates
before a commit"); the admin adds its own build checks, below.

- **Focused specs** while working:

  ```bash
  npm --prefix frontend run ng -- test admin --include '**/product-form.schema.spec.ts' --coverage=false --watch=false
  ```

  Give `--include` a spec path or a directory as seen from `frontend/`, such as
  `projects/admin/src/app/features/products/list`, or a quoted glob starting with `**/`; a path
  starting at `src/app/` selects no spec, and the run then fails with "No tests found matching the
  following patterns". Run a new pattern with `--list-tests` first: it prints the spec files the
  pattern selects without building or running anything, and exits 0 even when it prints none, so
  read the list rather than the exit status. `mibolt-verification` ("Iterate with focused runs")
  owns why the paths resolve this way and why a focused run passes `--coverage=false`.
- **The full unit suite**, `npm --prefix frontend run test`, runs every project with coverage on.
  It writes the admin's report to `coverage/admin/` in `frontend/`
  (`frontend/projects/admin/vitest.config.ts:6`) and holds the admin to the floor in
  `frontend/angular.json:374-380`, which `mibolt-verification` ("Tests and coverage") explains.
- **Build checks.** The gate's `npm --prefix frontend run build` builds the storefront alone
  (`frontend/package.json:12`), so every admin change also runs the admin's own, as
  `mibolt-verification` lists them: `npm --prefix frontend run build:admin` writes the production
  build to `dist/admin/` in `frontend/`, `npm --prefix frontend run check:admin-dist` then reads it
  and exits 2 when there is none, and `npm --prefix frontend run check:admin-boot` starts
  `ng serve admin` on port 4299 and checks that the mock worker is served under `/admin/`;
  `check:payment-boot` uses the same port and the script takes no lock on it, so never start a
  boot check while another is running, whichever app each serves and whichever checkout or
  worktree it runs from, since every checkout on the machine shares the port
  (`frontend/scripts/check-app-boot.mjs:17-19`, `frontend/scripts/check-app-boot.mjs:49`).
- **Lint and format** of the changed files: the commands are `mibolt-frontend-code-standards`'s.
- **The browser pass**, `mibolt-verification` ("Browser pass"), is due for anything a person sees
  or clicks in the admin: the changed flow driven in a real browser, its negative states included,
  with no console error and no failed request behind it. `mise run admin` serves the admin on its
  mock at http://localhost:4220/admin/, and `mise run dev` serves it at the same address against
  the real backend, for a change whose result comes from the backend. On the mock, sign in as the
  seeded admin (`SEED_ADMIN` and `SEED_ADMIN_PASSWORD` in
  `frontend/projects/admin/src/mocks/seed.ts:13-18`; the mock also prints them to the console), and
  reach the negative states with `?mi-scenario=empty-catalog`, `list-error`, `save-conflict` or
  `upload-error`. On the real backend, the first start on a database with no admin creates one and
  prints its password once in the backend log, unless `MIBOLT_ADMIN_INITIAL_PASSWORD` chose it
  (`frontend/projects/admin/README.md:49-55`). No scenario answers 401 to a signed-in page, so on
  the mock only the guard's half of the 401 round trip can be driven: reload a protected page,
  which empties the in-memory mock database and signs the admin out, and sign in again to land
  back on it through `vissza`. The interceptor's half is pinned by
  `frontend/projects/admin/src/app/core/auth/unauthorized.interceptor.spec.ts`.

The change is done when the specs beside every changed file pass, a fixed bug has a spec that
failed first, the mocks answer the new shape, and the browser pass has exercised the change.

## References

- [references/admin-architecture.md](references/admin-architecture.md): bootstrap and
  environments, the provider list, routes and guards, the session and the 401 round trip,
  `If-Match` and Problem handling, the state idioms, locale and bundle rules, styling, and adding a
  screen. Read when touching routing, auth, an interceptor, a store's shape or the shell, or when
  adding a screen.
- [references/product-form.md](references/product-form.md): the product edit page with its model,
  mapper, schema and cards, and the product list's URL state, filters, sort, columns and row
  actions, with the chains for a new field, filter and column. Read when changing the product form
  or the product list.
- [references/admin-mocks.md](references/admin-mocks.md): how the mock starts and stays out of
  production, the database, seed and scenarios, the handlers and their order of checks, and the
  spec harness. Read when changing mock data or behaviour, adding a scenario, or writing a spec
  that drives HTTP through the mocks.

In the repository, `frontend/projects/admin/README.md` covers the admin's commands, the mock
sign-in, the scenarios and the real-backend setup, and `frontend/README.md` the workspace's
configurations and scripts. Two passages of the admin README differ from the code:
`frontend/projects/admin/README.md:6` and `frontend/projects/admin/README.md:62-68` describe
`HttpClient` on the XHR backend and the icon font set through `MAT_ICON_DEFAULT_OPTIONS` in
`frontend/projects/admin/src/app/app.config.ts`, while the code keeps the fetch backend and sets
the font with `applyMaterialSymbolsFont()` from the login page and the shell, and
`frontend/projects/admin/src/app/app.spec.ts:71-72` asserts that no `MAT_ICON_DEFAULT_OPTIONS` is
provided. The code is what runs.

## Keep this skill current

Update this skill in the same change when one of these moves:

- `frontend/projects/admin/src/app/app.config.ts` (providers, interceptor order) or
  `frontend/projects/admin/src/app/app.routes.ts` (routes, guards, a new screen);
- `frontend/projects/admin/src/app/features/products/products.routes.ts`, when it gains the
  leave-page guard that "Typical work" says does not exist yet;
- a store under `frontend/projects/admin/src/app/features/`: its result union or its provider
  scope;
- `frontend/projects/admin/src/app/shared/forms/`: the submit, message or server-error helpers;
- `frontend/projects/admin/src/mocks/`: a handler's order of checks, a scenario, the seed source;
- `frontend/ng-openapi-gen.admin.json`: the tags or the excluded `If-Match` parameter;
- `frontend/projects/admin/README.md`, and the admin's blocks in `frontend/angular.json` and
  `frontend/eslint.config.mjs`, which the line anchors here point into.

Then run the check below, and run it as well after an edit to any other file this skill or its
references cite by `path:line`, since an edit that only shifts lines leaves an anchor on the
wrong line, and the check still passes it as long as the number stays inside the file. It checks
every path, `path:line` anchor and command, and `--show-anchors` prints each anchored line; read
that line against what the text says about it:

```bash
node mibolt-project-map/scripts/check-skill-references.mjs --show-anchors mibolt-admin-frontend
```

The script's path resolves as the paths rule at the top of this skill says, and the script runs
from anywhere in the repository.

A range longer than ten lines ends in `... (+N more lines)`, so read its rest in the file. The
script neither checks nor prints the bare "(line N)" and "(lines N-M)" numbers in sections
4, 5, 7 and 8 of [references/product-form.md](references/product-form.md), which point into
`frontend/projects/admin/src/mocks/products-write.handlers.ts`,
`frontend/projects/admin/src/mocks/products-read.handlers.ts` and
`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`; after an edit to
one of those three files, reread them by hand.

Run it as well after any edit to a skill that this skill or its references cite a section of by
name: today `mibolt-frontend-code-standards`, `mibolt-verification`, `mibolt-workspace-ops`, and
this skill's own `SKILL.md`, which
[references/admin-architecture.md](references/admin-architecture.md) cites. Its check (e) fails
only when a cited name no longer occurs anywhere in the cited file or skill, so it cannot see a
section that kept its name and changed what it says: reread each section this skill or its
references cite from what was edited, against what they use it for.
