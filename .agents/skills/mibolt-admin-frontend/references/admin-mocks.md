# Admin mocks and the spec harness

The admin's own mock backend in `frontend/projects/admin/src/mocks/` and the unit-spec harness in
`frontend/projects/admin/src/testing/`. Paths resolve as `SKILL.md` says.

## Contents

1. How the mock starts, and how it stays out of production
2. The database, the seed and the scenarios
3. The handlers
4. Changing mock behaviour
5. The spec harness

## 1. How the mock starts, and how it stays out of production

- `startAdminMocks()` (`frontend/projects/admin/src/mocks/browser.ts`, "export async function
  startAdminMocks()") builds the database from `?mi-scenario=`, registers `adminHandlers(db)` with
  `setupWorker`, resolves `mockServiceWorker.js` against `document.baseURI` so the worker is found
  under `/admin/`, lets every request without a handler through (the fonts and the seed images must
  pass), waits until the worker controls the page
  (`frontend/projects/admin/src/mocks/wait-for-controller.ts`), and prints the sign-in to the
  console.
- `frontend/projects/admin/src/main.ts` ("async function bootstrap()") calls it only in a
  non-production demo build, which is the `development` configuration behind `npm --prefix frontend
  run start:admin`.
- The `development` build copies `mockServiceWorker.js` and `media/**` from
  `frontend/projects/storefront/public/` (`frontend/angular.json`, "media/**"). The seed images are
  fetched from `media/` under the admin's base path, which is that copy.
  `npm --prefix frontend run check:admin-boot` is the check that the worker script is served under
  `/admin/`.
- The `production` configuration replaces `frontend/projects/admin/src/mocks/browser.ts` with
  `frontend/projects/admin/src/mocks/browser.production.ts` (`frontend/angular.json`,
  "projects/admin/src/mocks/browser.production.ts"), and `npm --prefix frontend run
  check:admin-dist` fails when a built `.js` file names or contains `setupWorker` or
  `mockServiceWorker`.
- This mock is the admin's alone. The admin may not import `@mi-bolt/mocks/*`
  (`frontend/eslint.config.mjs`, "The shop SDK and mocks are not for the admin"), and the shop's
  `shop-mocks` has no handler for an admin operation.

## 2. The database, the seed and the scenarios

- `MockDb` (`frontend/projects/admin/src/mocks/db.ts`, "export interface MockDb") is the whole
  state: the admins, the signed-in admin's id, the current XSRF token, the products by id, the next
  product id, the images and the scenario. It lives in the tab's memory, so a reload resets it.
  Handlers read and write these fields and never change the shape.
- `seedCatalog()` (`frontend/projects/admin/src/mocks/seed.ts`, "export function seedCatalog") reads
  `data/catalog/catalog.json` directly (`frontend/projects/admin/src/mocks/seed.ts`, "import
  catalogSource"), not the generated fixture the shop mocks read. It numbers the products `1..N` in
  source order, archives the last `ARCHIVED_SEED_COUNT` (two), starts every `version` at 0,
  registers every colour image as a seed file, and throws on a shape it does not expect.
- The one seeded admin is `SEED_ADMIN`, signed in with `SEED_ADMIN_PASSWORD`
  (`frontend/projects/admin/src/mocks/seed.ts`, "export const SEED_ADMIN").
- The scenarios (`frontend/projects/admin/src/mocks/scenario.ts`, "export const SCENARIOS") are
  chosen with `?mi-scenario=<name>`; any other value is `default`:
  - `empty-catalog`: no products (`frontend/projects/admin/src/mocks/db.ts`, "scenario !==
    'empty-catalog'");
  - `list-error`: the product list answers 503
    (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "db.scenario === 'list-error'");
  - `save-conflict`: every product PUT answers 412, while archive and restore are unaffected
    (`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "db.scenario ===
    'save-conflict'");
  - `upload-error`: the image upload answers 503
    (`frontend/projects/admin/src/mocks/media.handlers.ts`, "db.scenario === 'upload-error'").

## 3. The handlers

`adminHandlers(db)` (`frontend/projects/admin/src/mocks/handlers.ts`, "export function
adminHandlers") is the one list that both the browser worker and the specs start from. The slices
are written to answer as the backend does, in its order of checks and with its Problem wording: the
read and media slices say so in their header comments, and specs such as
`frontend/projects/admin/src/mocks/products-write.validation.spec.ts` ("Every expected answer is a
literal read from the brief") pin answers taken from the backend.

- `frontend/projects/admin/src/mocks/auth.handlers.ts`: session read, login, logout, password
  change. A session read issues the `XSRF-TOKEN` cookie when none has been issued yet, and a
  login or a logout rotates it.
- `frontend/projects/admin/src/mocks/users.handlers.ts`: list, create and delete admins.
- `frontend/projects/admin/src/mocks/products-read.handlers.ts`: the list with its filters, sort
  and paging, the detail with an `ETag` of `"<version>"`, and the brand list. An undeclared query
  key is a 400.
- `frontend/projects/admin/src/mocks/products-write.handlers.ts`: create, replace, archive and
  restore.
- `frontend/projects/admin/src/mocks/media.handlers.ts`: upload and read. An upload is stored under
  the SHA-256 of its bytes, its type is read from the bytes rather than the declared type, and
  the limit is 1 MB.

Shared by the slices: `frontend/projects/admin/src/mocks/guards.ts` (`csrfRejection` answers 403
`CSRF_TOKEN_INVALID` unless `X-XSRF-TOKEN` matches the issued token, `sessionRejection` answers
401 `UNAUTHENTICATED`), `frontend/projects/admin/src/mocks/problem.ts` (the Problem body), and
`frontend/projects/admin/src/mocks/backend-answers.ts` (the backend's 400 and 422 shapes and its
Java string trimming).

A product PUT runs its checks in this order
(`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "function replaceHandler"): CSRF
and session, an undeclared query key, the path id's type, reading and bean-validating the body (an
undeclared member is a 400), the path id's minimum, the `If-Match` pattern, the product lookup, 428
`PRECONDITION_REQUIRED` without `If-Match`, 412 `PRODUCT_VERSION_CONFLICT` on a version mismatch
(or always, under `save-conflict`), the validator, the database rules, and finally the stored
product with `version + 1` and a fresh `ETag`.

## 4. Changing mock behaviour

- **A new or changed product field**: the member allow-list `TOP_MEMBERS` and the read, validate,
  convert and build steps in `frontend/projects/admin/src/mocks/products-write.handlers.ts`
  (`readProductInput`, `beanValidationErrors`, `validatorErrors`, `toAdminProductInput`,
  `buildProduct`), the list projection `toListItem` in
  `frontend/projects/admin/src/mocks/products-read.handlers.ts` ("function toListItem") if the list
  shows it, and `seedCatalog` if seeded products need it.
- **A new endpoint**: a handler in the slice for its tag, added to `adminHandlers`, answering
  through `problem()` and the shapes in `frontend/projects/admin/src/mocks/backend-answers.ts`
  rather than a hand-built body.
- **A new scenario**: its name in `SCENARIOS`, a branch on `db.scenario` in the handler it
  affects, and a line in the scenario list of `frontend/projects/admin/README.md` ("selects one of
  the scenarios in").
- **Specs**: every mock module except `frontend/projects/admin/src/mocks/browser.ts` has a spec
  beside it. The write handler's cases are split across
  `frontend/projects/admin/src/mocks/products-write.handlers.spec.ts`,
  `frontend/projects/admin/src/mocks/products-write.validation.spec.ts`,
  `frontend/projects/admin/src/mocks/products-write.conversions.spec.ts` and
  `frontend/projects/admin/src/mocks/products-write.strip.spec.ts`.

## 5. The spec harness

- `frontend/angular.json` ("projects/admin/src/testing/setup-msw.ts") names
  `frontend/projects/admin/src/testing/setup-msw.ts` as the admin test target's setup file. It is
  the admin's own copy of the shop harness; the admin does not use `frontend/tests/setup-msw.ts`.
- Call `useMswServer()` at module scope in every spec that uses `server`
  (`frontend/projects/admin/src/testing/msw-server.ts`, "export function useMswServer"). The setup
  file alone reaches only the first spec file of each test worker; the comment at
  `frontend/projects/admin/src/testing/msw-server.ts` ("The lifecycle is a function a spec file
  calls") explains why.
- The server starts with no handlers and `onUnhandledRequest: 'error'`, so a request with no
  handler fails the test. Register what the test needs with `server.use(...)`: all of
  `adminHandlers(db)` over a fresh `createDb(scenario)`, or one slice.
- `frontend/projects/admin/src/testing/mock-spec-helpers.ts` holds the shared helpers:
  `signedIn(scenario)` for a signed-in database with every handler, `setup(scenario)` for a
  signed-in database with an XSRF cookie and the write handlers, and URL builders and body
  readers.
- A spec that sends a mutating request under `TestBed` provides `MOCK_PLATFORM_LOCATION_CONFIG`
  with `startUrl: document.baseURI`; without it Angular's XSRF handling omits the header and the
  mock answers 403 (`frontend/projects/admin/src/app/core/auth/admin-session.spec.ts`, "would 403
  every mutating request").
- Stores, pages and dialogs are specified against the real `AdminApi` over these handlers, and no
  admin spec replaces `AdminApi` with a stub. The three specs that use `HttpTestingController`
  instead are
  `frontend/projects/admin/src/app/core/api/if-match.interceptor.spec.ts`,
  `frontend/projects/admin/src/app/core/api/transport.interceptor.spec.ts` and
  `frontend/projects/admin/src/app/shared/image-upload/media-uploader.spec.ts`.
