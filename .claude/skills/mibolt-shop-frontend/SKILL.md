---
name: mibolt-shop-frontend
description: "Developing the MiBolt customer-facing Angular apps: the storefront (catalogue and filters, product page, cart, five-step checkout, demo-access gate, layouts, UI primitives, yettel design tokens), the demo-payment app and the shop MSW mock backend shop-mocks. Use for adding a filter, product-page field, checkout step or form field, route, page or primitive, for cart and checkout 409, 410 or 412 handling, payment-flow changes, or mock data and fault scenarios. Not for the admin app or for changing the OpenAPI contract."
---

# MiBolt shop frontend

Change the shop the way it is already built. Every path in this skill and its
references is relative to the repository root, and every command runs from
there. The exception is output that exists only after a build, a test run or
an install, which is named relative to `frontend/`, the directory that holds
it.

## Scope and hand-offs

This skill covers the storefront (`frontend/projects/storefront/`, except
the catalogue image copy in its `public/media/`), the demo payment app (`frontend/projects/demo-payment/`), the shop mock backend
(`frontend/projects/shop-mocks/`), the unit MSW harness
(`frontend/tests/setup-msw.ts`, `frontend/tests/msw-server.ts`,
`frontend/tests/network-isolation.spec.ts`), and the unit specs of those three
projects.

These belong elsewhere:

- **The admin app** belongs to `mibolt-admin-frontend`. It has its own SDK and
  its own mocks, and lint keeps the shop's out of it.
- **The contract and everything generated from it**, `core-api`, and
  catalogue data belong to `mibolt-cross-package-changes`: a change to
  `contracts/commerce/openapi.yaml`, regenerating
  `frontend/projects/shop-api/src/generated/`, a change to
  `frontend/projects/core-api/`, or a new
  `frontend/docs/api/fixtures/catalog.json`. Do that part there, then come
  back here for the storefront, payment and mock side.
- **Ports, proxy files, `frontend/angular.json` build and serve options and
  mise tasks** belong to `mibolt-workspace-ops`.
- **Colour, type, radius, spacing and recipe values** come from
  `frontend/docs/design/yettel.md`, per `.claude/CLAUDE.md` ("Design
  authority"). This skill carries none of them.

Consult these when their condition holds, and not otherwise:

- Consult `mibolt-frontend-code-standards` when a lint or typecheck error
  appears, or when it is unclear whether a pattern is allowed.
- Consult `mibolt-verification` before declaring the work done.
- Consult `playwright-tests` only for end-to-end spec work. Specs under
  `frontend/e2e/` are written only by the `playwright-test-*` agents
  (`.claude/rules/code-standards.md`, "Only the `playwright-test-*` agents
  write end-to-end tests"), so this skill does not teach them.

## Area model

**Three projects, one data path.**

- **storefront** (component prefix `app`) is the shop. Its screens are
  Hungarian routes: `/` home, `/telefonok` catalogue, `/telefonok/:slug`
  product, `/kosar` a redirect to `/penztar/kosar`, `/penztar/...` the
  checkout, `/belepes` the demo sign-in, `/primitives` an internal showcase.
- **demo-payment** (prefix `pay`, base href `/demo-fizetes/`) is one page,
  `PaymentPage`, the simulated card authorisation the shop redirects to,
  inside a root `App` shell whose template
  (`frontend/projects/demo-payment/src/app/app.html`) holds the demo banner
  and the outlet.
- **shop-mocks** (`@mi-bolt/mocks/*`) is the backend both apps run on in
  development, as a service worker in the page; unit specs drive the same
  handlers through MSW's Node server. Nothing sits behind
  `mise run storefront` but these mocks.

The two apps reach the backend only through the generated shop SDK
(`@mi-bolt/api/*`, which `frontend/tsconfig.json:17-21` maps to
`frontend/projects/shop-api/src/generated/`), as
`api.invoke(fn, params, context)`. The mocks answer with the same generated
models, so a contract change that renames or drops a field breaks them at
compile time as well.

**Inside the storefront** (`frontend/projects/storefront/`):

- `frontend/projects/storefront/src/main.ts` starts the mock worker through
  `frontend/projects/storefront/src/core/bootstrap-demo.ts` before Angular
  boots, whenever the environment has `demo: true`, which is the development
  configuration.
- `frontend/projects/storefront/src/app/features/` holds one folder per
  feature: catalog, product, cart, checkout, home, demo-sign-in, not-found and
  primitives-showcase. Each keeps its page, its facade if it holds server
  state, its sub-components and their co-located specs.
- `frontend/projects/storefront/src/app/core/` holds the demo-access gate and
  the navigation; `frontend/projects/storefront/src/app/layouts/` holds the
  three layouts; `frontend/projects/storefront/src/app/shared/` holds the
  shell, the UI primitives, the types, the utilities and the media helper.
- `frontend/projects/storefront/src/styles.css` imports Tailwind and declares
  the one `@theme` block, so templates lay out and space with Tailwind
  utilities (39 of the 58 storefront templates carry a `flex`, `grid` or
  `gap-*` class, counted 2026-09-26) and a component's `.scss` carries the
  rest. `frontend/projects/storefront/src/styles/tokens.css` names the design
  tokens, mapped row by row in `frontend/docs/design/yettel.md` §9; its
  colour, radius and font names resolve to those theme variables.
  `frontend/projects/storefront/src/styles/primitives.css` holds the font
  faces, the page reset and the shared focus ring. The three are the build's
  global `styles` (`frontend/angular.json:29-33`). The payment app imports no
  Tailwind (`frontend/projects/demo-payment/src/styles.css:4-7`).
- `frontend/projects/storefront/public/` holds the files the build copies as
  they are: the fonts, `favicon.ico`, the images under `assets/` (the
  placeholder and the product-page fixture's pictures), and
  `mockServiceWorker.js`, which only the development configuration copies
  and which the payment app's and the admin's development builds take from
  here as well (`frontend/angular.json`). Its `media/` folder is the
  exception: a copy of `data/catalog/images/` that belongs to
  `mibolt-cross-package-changes`.

**State.** Six root services hold it: `CatalogFacade`, `ProductFacade`,
`CartFacade`, `CheckoutFacade`, `OrderSubmission` and `DemoAccess`, each a
`@Service()` class taking its dependencies through `inject()`, as root
`CLAUDE.md` ("Services") asks of a new singleton. A facade keeps
`private readonly xWritable = signal(...)` and exposes
`readonly x = this.xWritable.asReadonly()`; the catalogue and product facades
fold their signals into one `computed` `vm` and load through an RxJS
pipeline, a `Subject` into `switchMap` onto the SDK and back into signals, so
a late answer never overwrites a newer query. There is no state library.

**The rules the shop keeps.** The header of
`frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts:1-26`
states most of them in one place:

- The server is authoritative. The checkout summary, `complete` and the cart
  version come from its answer, and the checkout never recomputes them.
- Every cart and checkout write carries `If-Match` bound to the cart version
  at dispatch time, not at click time. `CartMutationQueue` serialises cart
  writes and `CheckoutFacade` serialises its own; both share the cart's
  version.
- A 412 `CART_VERSION_CONFLICT` raises `conflict`, refetches in the
  background and waits for an explicit `retry()`; nothing replays by itself.
  A 410 `CART_EXPIRED` raises `cartExpired` and drops the snapshot. A 409
  `PRICE_CHANGED` on the order arms `priceChange` with both totals, and the
  submit stays dead until `confirmPriceChange()`. A 422 carries `fieldErrors`
  for the form.
- An idempotency key survives an uncertain failure (status 0 or 5xx) and
  rotates after a definite one.
- The payment leaves the shop and returns to it with a full page load, never
  a router navigation (`contracts/commerce/kommunikacio.md` §8.3).

## Where to start

Find an existing instance of what you are adding and trace it end to end
first: `git grep -n is5g -- frontend/projects/storefront/src frontend/projects/shop-mocks/src`
shows every place a boolean catalogue filter reaches. Grep the identifier in
every spelling the repository uses (`.claude/rules/code-standards.md`, "Grep
the identifier as the repository spells it").

| Task | Open first |
|---|---|
| Catalogue filter, sort or paging | `frontend/projects/storefront/src/app/features/catalog/catalog-query.ts`, the URL codec |
| Product page | `frontend/projects/storefront/src/app/features/product/product.facade.ts` |
| Cart | `frontend/projects/storefront/src/app/features/cart/cart.facade.ts` |
| Checkout step or field | `frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts` |
| Order, payment intent, 409, 410, 412 | `frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts` |
| Route, layout or page | `frontend/projects/storefront/src/app/app.routes.ts` |
| UI primitive | `frontend/projects/storefront/src/app/shared/ui/index.ts` |
| Shopper-facing sentence | the page that shows it; `describeAddFailure` in `frontend/projects/storefront/src/app/features/product/product-page.ts` builds the add-to-cart refusals |
| Price display | `frontend/projects/storefront/src/app/shared/ui/price-block/price-block.ts` |
| Product card (catalogue grid, home featured grid, related strip) | `frontend/projects/storefront/src/app/features/catalog/product-card.ts` |
| Payment page | `frontend/projects/demo-payment/src/app/payment-page.ts` |
| Mock data, behaviour or fault | `frontend/projects/shop-mocks/src/create-handlers.ts`, then the domain folder |

Copy these when you need a pattern:

- a page bound to the URL: `CatalogPage` in
  `frontend/projects/storefront/src/app/features/catalog/catalog-page.ts`;
- a root facade with serialised writes and error mapping: `CartFacade` in
  `frontend/projects/storefront/src/app/features/cart/cart.facade.ts`;
- a presentational component and its spec:
  `frontend/projects/storefront/src/app/features/product/variant-selector.ts`
  and `frontend/projects/storefront/src/app/features/product/variant-selector.spec.ts`;
- a Signal Forms schema and the component bound to it:
  `frontend/projects/storefront/src/app/features/checkout/contact.schema.ts`
  and `frontend/projects/storefront/src/app/features/checkout/contact-step.ts`;
- a write with full error handling: `patch()` and `mapError` in
  `frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts`;
- input validation on the way to the DOM:
  `frontend/projects/storefront/src/app/shared/media/resolve-asset-url.ts`;
- a mock handler: `frontend/projects/shop-mocks/src/catalog/catalog.handlers.ts`;
- a page as a state machine: `frontend/projects/demo-payment/src/app/payment-page.ts`.

## Workflows

1. **Trace an existing instance** of the same kind of change, as above.
2. **Check the SDK.** If the field, parameter, operation or error code is not
   in `frontend/projects/shop-api/src/generated/`, the contract changes first
   in `mibolt-cross-package-changes`.
3. **Change the layers from the data outwards**: the mock, then the codec or
   facade, then the component, each with its spec beside it; for a bug, write
   the failing spec first. The step lists for a catalogue filter, a
   product-page field, a checkout field or step, a route or page, a UI
   primitive, and error handling are in
   [references/change-chains.md](references/change-chains.md).
4. **Verify** as the Verify section says.

Task-specific points:

- **Catalogue filter.** The URL is the single source of truth, which is what
  makes a filter survive a reload: add the field to the codec in
  `frontend/projects/storefront/src/app/features/catalog/catalog-query.ts`,
  and `CatalogPage` mirrors the facade's query back into the URL. Put the
  control in both the desktop panel and the mobile drawer.
- **Checkout.** Pages (`ContactPage`, `DeliveryPage`, `ReviewPage`) hold the
  facades and decide; steps (`ContactStep`, `DeliveryStep`, `ReviewStep`)
  render. The wizard's guards hydrate the cart and the session before they
  decide, so a reload lands on the same step.
- **Error copy.** Map a Problem's `code` and `params` to a Hungarian sentence
  in the page that shows it. Never render `title` or `detail`, which are
  English developer text (`contracts/commerce/kommunikacio.md` §6).
- **Mocks.** A new domain file registers with `registerBusinessHandlers` and
  is also imported by `frontend/projects/shop-mocks/src/browser.ts`, or the
  browser never loads it. See [references/shop-mocks.md](references/shop-mocks.md).
- **Payment flow.** Both apps take part; see
  [references/demo-payment.md](references/demo-payment.md).

## Local conventions

Each line says where it comes from. The lint, type and style rules among them
are owned by `mibolt-frontend-code-standards`, and the conflicts named below
are entries in its conflict register; they appear here as one line each
because they are easy to break in this area.

- **Root `CLAUDE.md` sets the Angular conventions** (`input()`, `output()`,
  `computed()`, native control flow, no `ngClass`, `ngStyle` or
  `CommonModule`, Signal Forms for new forms). Follow it; this skill does not
  repeat it.
- **No `as` and no `any`** (`.claude/rules/code-standards.md`). Lint enforces
  the assertion ban only in the admin and two contract files (register entry
  C1), and the written rule binds the shop all the same. Narrow `unknown`
  with the storefront's own `isRecord`
  (`frontend/projects/storefront/src/app/shared/utils/is-record.ts:5`) or a
  new guard, as both `mapError` functions do.
- **One app never imports another** (`frontend/eslint.config.mjs:410-437`),
  which is why the storefront and the payment app each keep their own
  `LOCATION_ASSIGN` token. Code both need goes into a library, which is
  `mibolt-cross-package-changes` work.
- **`Api` is built two ways** (observed). `CatalogFacade`, `ProductFacade`,
  `DemoAccess` and `HomePage` call `inject(Api)`; `CartFacade`,
  `CheckoutFacade` and `PaymentPage` call
  `new Api(inject(ApiConfiguration), inject(HttpClient))`. Which one a new
  unit takes is not settled (register entry C2).
- **Components use external `templateUrl` and `styleUrl` files** (observed,
  with one inline exception), although root `CLAUDE.md` prefers inline
  templates for small components (register entry C3). Do not convert one as
  a side change.
- **The storefront's component stylesheets are `.scss` files written as
  CSS** (observed: none uses `@use`, `@import`, `@mixin`, `@include`,
  `@forward` or a `$` variable). Write CSS in them. The only Sass syntax
  present is `//` line comments, in
  `frontend/projects/storefront/src/app/features/catalog/filter-drawer.scss`,
  `frontend/projects/storefront/src/app/features/catalog/filter-panel.scss`
  and `frontend/projects/storefront/src/app/layouts/checkout-layout.scss`.
  Introducing any other Sass feature, such as `@use`, a mixin or a `$`
  variable, is a decision to raise, not a style choice (register entry C5).
- **Zoneless change detection is provided explicitly**
  (`frontend/projects/storefront/src/app/app.config.ts:19`,
  `frontend/projects/demo-payment/src/app/app.config.ts:16`), and
  `frontend/projects/storefront/src/app/app.spec.ts:107` asserts it (register
  entry C4). Do not add or remove it as a side change.
- **Shopper-facing copy is Hungarian, everything else English**
  (`frontend/docs/spec/execution-rules.md:9`). The copy is hard-coded in the
  component or page that shows it; there is no i18n pipeline (observed).
- **Storage is `sessionStorage` only**, and every access sits in `try`/`catch`
  and falls back to page-local state when storage is denied (observed).
- **Two helpers are security-relevant.** Every `<img src>` comes from
  `resolveAssetUrl`, and every post-sign-in return target passes
  `isSafeReturnUrl`
  (`frontend/projects/storefront/src/app/core/demo-access/demo-access.ts:49`).
  Do not route around either.
- **Accessibility.** Root `CLAUDE.md` ("Accessibility Requirements") overrides
  generic accessibility guidance, in the user's words: "in the frontend app
  keyboard and ARIA events are not of interest, and focus only minimally,
  because it will never be a live app! no screen reader will ever read it!".
  Both apps already carry ARIA and focus code, such as
  `frontend/projects/storefront/src/app/a11y-structure.spec.ts` and the focus
  effect in `PaymentPage`. Neither extend that code nor remove it. The
  template accessibility lint rules still run on every template, so a new
  template has to lint clean against them (register entry C7).
- **Framework questions** are answered with the instruments in
  `.claude/rules/framework-facts.md`, never by a probe. The `angular-developer`
  skill is vendored generic Angular guidance; this skill records what this
  repository enforces and does.

**Unit specs.** Specs sit beside their source as `*.spec.ts`.

- A component with inputs is tested through a host component in `TestBed`, as
  `frontend/projects/storefront/src/app/features/product/variant-selector.spec.ts:60-81`
  does.
- A spec reaches HTTP one of two ways. It drives real requests over MSW,
  calling `useMswServer()` from `frontend/tests/msw-server.ts` at module
  scope and installing the mocks with `server.use(...createHandlers(options))`,
  as `frontend/projects/storefront/src/app/features/cart/cart.facade.spec.ts`
  does; an unhandled request then fails the test. Or it provides a stub
  `Api`, as
  `frontend/projects/storefront/src/app/features/catalog/catalog.facade.spec.ts:391`
  does. Extend a unit's spec the way it is already written.
- Some specs carry a `// @vitest-environment jsdom` comment and some do not
  (31 of the 74 storefront specs, counted 2026-09-26). Start a new spec from
  the header of the nearest spec of the same kind rather than from memory.
- A bug fix comes with a test that fails before it and passes after it
  (`.claude/rules/code-standards.md`, "Every bug still gets a test").

## What else a change touches

- **Mocks.** A storefront call that changes needs its handler under
  `frontend/projects/shop-mocks/src/` to change with it. A persisted shape
  that changes incompatibly needs `SNAPSHOT_SCHEMA_VERSION`
  (`frontend/projects/shop-mocks/src/persistence.ts:49`) bumped. A new fault
  operation joins `FAULT_OPERATIONS`
  (`frontend/projects/shop-mocks/src/faults.ts:64`).
- **The production build.** Both apps' production configurations replace
  `frontend/projects/shop-mocks/src/browser.ts` with
  `frontend/projects/shop-mocks/src/browser.production.ts`, which exports
  only `startMockWorker`. Anything an app imports from
  `@mi-bolt/mocks/browser` (today `startMockWorker`, at
  `frontend/projects/storefront/src/core/bootstrap-demo.ts:22` and
  `frontend/projects/demo-payment/src/main.ts:37-38`) has to be exported by
  the production file too, with the same signature. The production budget
  warns at 4 kB and fails at 8 kB per component stylesheet
  (`frontend/angular.json`).
- **End-to-end specs.** Every spec under `frontend/e2e/integration/` finds
  elements by `data-testid`, and most also by visible text or role, so a
  renamed test id or reworded sentence can break them, and
  `frontend/e2e/seed.spec.ts` describes the fault protocol, so a protocol
  change reaches it too. Consult `playwright-tests` for either.
- **The payment round trip.** A change to the intent, its URLs or the return
  leg touches `frontend/projects/storefront/src/app/features/checkout/review-page.ts`,
  `frontend/projects/storefront/src/app/features/checkout/payment-return-page.ts`
  and `frontend/projects/demo-payment/src/app/payment-page.ts` together.
- **A shared primitive, token or reused component** reaches every feature
  that uses it: `ProductCard`, for one, renders in the catalogue, the home
  page's featured grid and the product page's related strip. Find the users
  by class name and by element selector before changing an input.

## Verify

Run a focused unit test while working:

```bash
npm --prefix frontend run ng -- test storefront --include projects/storefront/src/app/features/catalog --coverage=false --watch=false
```

- Replace `storefront` with `demo-payment` or `shop-mocks`. Point
  `--include` at a spec file or its folder, written from `frontend/` as
  `projects/<project>/src/...`, or at a `'**/<name>.spec.ts'` glob, quoted
  so the shell passes it through unexpanded.
- **Add `--list-tests` first** to print the files the pattern selects; it
  exits without running them (https://angular.dev/cli/test). Read the list,
  not the exit status: a pattern that selects nothing prints no file and
  still exits 0. The form angular.dev describes, relative to the project
  root (`src/app/...`), is such a pattern on the installed `@angular/build`
  22.1.8 (`frontend/package-lock.json:264-265`), which resolves `include`
  against the project's `sourceRoot` after stripping a leading
  `projects/<project>/src/` (`normalizePattern` in that package's
  `src/builders/unit-test/test-discovery.js`, present once `mise run setup`
  has installed the frontend's dependencies).
- **Point at the spec, not at the source file.** A source file selects its
  spec only when the two share a base name, as `cart.facade.ts` and
  `cart.facade.spec.ts` do; otherwise the source file itself is selected as
  the test file. `checkout.facade.ts`, whose spec is
  `checkout-facade.spec.ts`, is such a case (measured 2026-09-26).
- `--coverage=false` switches off the coverage the test target turns on
  (`frontend/angular.json`, `"coverage": true`), so a partial run leaves the
  full run's report alone: `coverage/unit/` in `frontend/` for the storefront
  (`frontend/projects/storefront/vitest.config.ts:6`), and
  `coverage/demo-payment/` and `coverage/shop-mocks/` for the other two.
- `--watch=false` makes the run exit; watch is the default in a terminal.
  `--no-coverage --no-watch` is accepted in place of the two `=false` flags.

Before declaring the work done, consult `mibolt-verification` for the full
set, its prerequisites and what each command leaves behind. The ones this
area needs most often:

- `npm --prefix frontend run test` runs every project and writes its reports
  under `coverage/` in `frontend/`, which parallel runs share
  (`.claude/rules/parallel-spawns.md`, "What a batch shares").
- `npm --prefix frontend run build` and `npm --prefix frontend run build:payment`
  write `dist/storefront/` and `dist/demo-payment/` in `frontend/`;
  `npm --prefix frontend run check:storefront-dist` and
  `npm --prefix frontend run check:payment-dist` then read those directories
  (`frontend/package.json:18-19`) and fail if MSW reached a production build.
- `npm --prefix frontend run check:payment-boot` starts `ng serve` on port
  4299 (`frontend/scripts/check-app-boot.mjs:17`).

Every change a shopper can see is verified in a real browser, per
`.claude/rules/browser-verification.md`. The orchestrator starts and stops
the servers: `mise run storefront` for the shop on MSW, `mise run frontend`
when the payment page takes part, and `mise run dev` when the result comes
from the backend. A useful pass exercises the changed flow, including its
failure path, which a `?mi-scenario=fail-<operation>` URL produces on demand.

## References

- [references/storefront-architecture.md](references/storefront-architecture.md):
  bootstrap, the route and checkout tables, guards, layouts, the six root
  services, interceptors, storage keys and the security helpers. Read when
  touching routing, bootstrap, a facade, an interceptor, or state that more
  than one feature reads.
- [references/change-chains.md](references/change-chains.md): file-by-file
  steps for a catalogue filter, a product-page field, a checkout field or
  step, a route or page, a UI primitive, error handling, and copy and prices.
  Read when planning a change that spans more than one file.
- [references/shop-mocks.md](references/shop-mocks.md): domains, the
  registry, stores, scenarios and faults, persistence, the browser worker,
  the demo-access gate and the unit harness. Read when changing mock data or
  behaviour, adding a fault scenario, or writing an MSW-driven spec.
- [references/demo-payment.md](references/demo-payment.md): the payment
  page's states, the outcomes, both legs of the redirect, ports and proxies.
  Read for any change to the payment flow, in either app.

## Keep this skill current

When a change touches one of these, update the part of this skill or its
references that describes it, in the same change:

- `frontend/projects/storefront/src/app/app.routes.ts` and
  `frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts`;
- any `frontend/projects/storefront/src/app/features/*/*.facade.ts`,
  `frontend/projects/storefront/src/app/features/checkout/order-submission.ts`
  and `frontend/projects/storefront/src/app/core/demo-access/demo-access.ts`,
  the six root services;
- `frontend/projects/shop-mocks/src/create-handlers.ts`,
  `frontend/projects/shop-mocks/src/faults.ts`,
  `frontend/projects/shop-mocks/src/scenarios.ts`,
  `frontend/projects/shop-mocks/src/persistence.ts` and
  `frontend/projects/shop-mocks/src/browser.ts`;
- the `storefront`, `demo-payment` and `shop-mocks` targets in
  `frontend/angular.json`, and the installed `@angular/build` version, which
  decides the `--include` form above;
- the token mapping in `frontend/docs/design/yettel.md` §9.

Then check that every path, anchor and command here still resolves:

```bash
node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs .claude/skills/mibolt-shop-frontend
```

It exits 0 when nothing fails. Add `--show-anchors` to print each anchored
line, and read whether it still says what this skill claims; the script
cannot judge that.
