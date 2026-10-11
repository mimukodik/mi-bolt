# Contract change chains

Per kind of contract change: every place that has to move with it, and the
check that fails when one is left out. Paths and commands are read the way
the opening paragraph of `SKILL.md` says. The consumer edits belong to the
area skill named on each step; this file says what has to change and what
catches a miss, not how to write the consumer code.

## Contents

1. Start from the finder, or from a sibling
2. Contract-side edits every change shares
3. A new or changed field on a schema
4. A new shop operation
5. A new admin operation
6. A new enum value
7. A new error code
8. An If-Match or other header change
9. Removing or renaming something
10. A core-api change

## 1. Start from the finder, or from a sibling

Run the finder on the name before touching the contract (the command and its
output are in the skill's `SKILL.md`). A name that is not in the contract yet
makes it exit 1 and point here. In that case run it on the existing sibling
closest to what you are adding: its buckets are the places the new name will
need.

| Adding | Run the finder with | Why that sibling |
|---|---|---|
| a shop operation | `--kind operation addCartItem` | a cart mutation: SDK function, facade call, shop-mocks handler, contract tests, backend controller |
| an admin operation | `--kind operation archiveAdminProduct` | an admin products operation: admin client, admin app, backend admin controller |
| an error code | `--kind enum PRICE_CHANGED` | a code both clients, the storefront, shop-mocks and the backend handle |
| a field on `Product` | `--kind property releasedAt` | reaches the catalogue data, the fixture, shop-mocks and the storefront specs that build a `Product` or `CatalogItem`; the `CatalogItem` builders need the new field only if it goes on `ProductBase`, where `releasedAt` sits and which both extend. Its admin hits are the `Admin*` schemas' own `releasedAt`, which move only if an `Admin*` schema gets the field too |
| a schema | `--kind schema Cart` | has a sample, `contracts/commerce/samples/Cart.json` |

Read a sibling's output the way `SKILL.md` ("Read it this way") says: its
`[path]` lines are mostly the mocks and backend API tests that address the
operation by URL, an empty bucket is where to look next rather than proof of
no consumer, and an error code is searched with the `enum` kind.

## 2. Contract-side edits every change shares

- `contracts/commerce/openapi.yaml`: the change itself. Every operation
  carries one of the twelve tags declared at
  `contracts/commerce/openapi.yaml` ("- name: Catalog"); the tag decides which frontend
  client gets it and which backend interface, `<Tag>Api`, must implement it
  (the codegen reference, sections 1 and 4).
- The spec's own media-type `examples:`.
  `frontend/tests/contract/schema.spec.ts` ("every media-type example on responses and requestBodies validates against its own schema") validates every example on a
  shop operation against its schema, so an example the change invalidates
  there fails the contract suite; admin operations are removed before that
  test reads the spec (`frontend/tests/contract/admin-tags.ts`, "withoutAdminOperations"), so the
  contract suite does not check an example on an admin operation.
- `contracts/commerce/samples/`. Each file is named after the schema it
  instantiates, with an optional case part (`OrderRequest.card.json`), and
  `contracts/check-samples.sh` validates it against that schema
  (`contracts/check-samples.sh`, "<Schema>.json and <Schema>.<case>.json"). A sample whose schema changed must still
  validate; a new schema does not need a sample (24 exist).
- `contracts/commerce/kommunikacio.md`, when a rule the spec cannot express
  changes: cookies (section 2), versions and If-Match (section 3),
  idempotency (section 4), the error table (section 5.3), the localisation
  boundary (section 6). Where the two disagree the spec wins and the document
  is corrected (`contracts/commerce/kommunikacio.md`, "Source of truth").
- `contracts/commerce/sequences/*.puml`, when a flow they draw changes;
  `contracts/mise.toml` ("PlantUML syntax of the sequence diagrams") describes the contract task's check of them as
  syntax only.
- `info.version` at `contracts/commerce/openapi.yaml` ("info:"). `backend/docs/decisions/0014-openapi-tags-and-admin-contract.md`
  records an additive change moving it as a semver minor.

## 3. A new or changed field on a schema

| Step | Where, and whose | What fails if it is skipped |
|---|---|---|
| Contract, examples, samples | section 2 | `frontend/tests/contract/schema.spec.ts` ("every media-type example on responses and requestBodies validates against its own schema"); `mise run contracts:check` |
| Regenerate | `mise run api:generate`; the model file changes in each client whose operations reference the schema | `api:drift` |
| Contract-suite fixtures | the happy-path response fixtures in `buildHappyPathFixture` (`frontend/tests/contract/operation-matrix.spec.ts`, "function buildHappyPathFixture(") for a shop operation returning the schema | a new required field fails `frontend/tests/contract/operation-matrix.spec.ts` ("every documented success response validates against its schema") |
| shop-mocks | the stores and builders that construct the model, such as `frontend/projects/shop-mocks/src/catalog/catalog-store.ts`: `mibolt-shop-frontend` | a new required field stops that code type-checking; `mibolt-verification` names the commands that compile it |
| storefront, demo-payment | callers and readers, and the spec builders and fixtures typed as the model, such as `DEMO_PRODUCT` (`frontend/projects/storefront/src/app/features/product/demo-product.fixture.ts`, "DEMO_PRODUCT"): `mibolt-shop-frontend` | a new required field stops type-checking in every caller that builds a request body of that type and in every spec builder or fixture typed as the model; an optional field fails nothing |
| admin app and admin mocks | form model, mapper, schema, mocks and seed, for `Admin*` schemas: `mibolt-admin-frontend` | the same type-checking failures; no contract test covers the admin mocks |
| backend | domain record or entity, its Liquibase migration when the field is stored, mapper, service and API test: `mibolt-commerce-backend` | the backend API tests check responses against the source contract with `validAgainstContract()`, which "asserts the response satisfies every applicable rule in the contract" (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/ContractValidation.java`, "validAgainstContract") |
| catalogue fixture | for `Product` fields: the source data and the mapping in `frontend/scripts/build-catalog-fixture.mjs` (the catalog-data reference, section 3) | `frontend/tests/contract/schema.spec.ts` ("every fixture product validates against the OpenAPI Product schema") validates every fixture product against `Product` |
| e2e | the specs under `frontend/e2e/` that read the field, which no MiBolt skill covers; `frontend/e2e/seed.spec.ts` holds the suite's conventions | the e2e run |

## 4. A new shop operation

1. **Contract.** A shop tag (`Catalog`, `Cart`, `Checkout`, `Payment`,
   `Orders`, `Media`, `DemoAccess`), an `operationId`, and the shared
   `BadRequest` response, which every shop operation must declare
   (`frontend/tests/contract/shop-bad-request.spec.ts`, "it('every shop operation declares 400'"). A mutation of
   the session's cart or checkout state takes the `IfMatch` parameter; see
   section 8.
2. **Regenerate.** A new function file under
   `frontend/projects/shop-api/src/generated/fn/` and its export in
   `frontend/projects/shop-api/src/generated/functions.ts`. Skipped:
   `frontend/tests/contract/operation-matrix.spec.ts` ("exposes every operationId in the generated SDK functions module") fails because the
   SDK lacks the function, besides what `SKILL.md`, "What fails when a step is
   skipped", lists.
3. **Contract suite**, each of which fails until updated:
   - `REQUIRED_OPERATION_COUNT` (`frontend/tests/contract/response-validation.ts`, "REQUIRED_OPERATION_COUNT"),
     read by `frontend/tests/contract/operation-matrix.spec.ts` ("T26-AC01 operation inventory parity"),
     `frontend/tests/contract/operation-matrix.spec.ts` ("spec drift check") and
     `frontend/tests/contract/shop-bad-request.spec.ts` ("it('every shop operation declares 400'");
   - `EXPECTED_OPERATION_IDS` (`frontend/tests/contract/schema.spec.ts`, "const EXPECTED_OPERATION_IDS = [");
   - the "20 others" count in `frontend/tests/contract/sdk-split.spec.ts` ("sdk-split: tag lists and admin coverage");
   - the round trip in `frontend/tests/contract/sdk-transport.spec.ts` ("T04-AC04 every generated operation reaches MSW"),
     which needs a handler in that file's own list (`frontend/tests/contract/sdk-transport.spec.ts`, "const handlers = [") and a
     `callOperation` call, or it reports the operation "not exercised by the
     SDK";
   - a happy-path fixture case in `buildHappyPathFixture`
     (`frontend/tests/contract/operation-matrix.spec.ts`, "function buildHappyPathFixture(") when the
     success response has a JSON body;
   - for a mutation carrying `If-Match` or `Idempotency-Key`, the expected
     sets at `frontend/tests/contract/schema.spec.ts` ("cart-version-monotonic: every mutating cart operation requires If-Match") and
     `frontend/tests/contract/schema.spec.ts` ("idempotency-key-required-on-mutations").

   The count 20 also sits in test titles and header comments across
   `frontend/tests/contract/` and in `frontend/tests/contract/admin-tags.ts` ("shop operations");
   keep them true.
4. **shop-mocks handler**: `mibolt-shop-frontend`. Skipped: see `SKILL.md`,
   "What fails when a step is skipped".
5. **Backend controller method** on the tag's `<Tag>Api`:
   `mibolt-commerce-backend`. Skipped: see `SKILL.md`, "What fails when a step
   is skipped".
6. **Storefront or demo-payment caller**: `mibolt-shop-frontend`.

## 5. A new admin operation

1. **Contract.** A path under `/admin` and exactly one of `AdminAuth`,
   `AdminUsers`, `AdminProducts`, `AdminMedia`, `AdminCampaignSettings`; a wrong path or tag fails
   `frontend/tests/contract/sdk-split.spec.ts` ("every /admin/ operation carries exactly one admin tag") or `frontend/tests/contract/sdk-split.spec.ts` ("every operation carrying an ADMIN_TAGS tag sits under /admin/"). Product updates take
   the `ProductIfMatch` parameter (`contracts/commerce/openapi.yaml`, "ProductIfMatch:"):
   replace, archive and restore (`contracts/commerce/openapi.yaml`, "operationId: replaceAdminProduct",
   `contracts/commerce/openapi.yaml`, "operationId: archiveAdminProduct",
   `contracts/commerce/openapi.yaml`, "operationId: restoreAdminProduct"); create does not.
2. **Regenerate.** It lands in the admin client only. Skipped:
   `frontend/tests/contract/sdk-split.spec.ts` ("every admin operationId is exported by the admin functions module") reports the admin
   functions module missing it, besides what `SKILL.md`, "What fails when a step
   is skipped", lists.
3. **Counts.** 17 admin operations are pinned at
   `frontend/tests/contract/sdk-split.spec.ts` ("sdk-split: tag lists and admin coverage") and
   `frontend/tests/contract/sdk-split.spec.ts` ("every admin operationId is exported by the admin functions module"), and stated in
   `frontend/tests/contract/admin-tags.ts` ("shared list of admin-tagged operations").
4. **Admin mocks handler and the admin caller**: `mibolt-admin-frontend`.
   Skipped: see `SKILL.md`, "What fails when a step is skipped".
5. **Backend** controller method on the tag's interface, for example
   `AdminProductsController implements AdminProductsApi`
   (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/catalog/AdminProductsController.java`, "AdminProductsController implements AdminProductsApi"):
   `mibolt-commerce-backend`.

The shop contract checks do not see admin operations: `withoutAdminOperations`
(`frontend/tests/contract/admin-tags.ts`, "withoutAdminOperations") removes them before
`schema.spec.ts`, `response-validation.ts` and `sdk-transport.spec.ts` read the
spec.

## 6. A new enum value

- **Contract** enum, plus any example or sample that lists the values.
- **Regenerate**: the union type and its `-array.ts` sibling in each client
  that references the enum (the codegen reference, section 1).
- **TypeScript consumers** that must cover every member, such as a `Record`
  keyed by the union, stop type-checking until the new member is handled:
  `OUTCOME_LABELS` over the payment outcome is one
  (`frontend/projects/demo-payment/src/app/payment-page.ts`, "const OUTCOME_LABELS:"). A `switch`
  with a `default` branch still compiles and routes the new value there.
  Owners: `mibolt-shop-frontend`, `mibolt-admin-frontend`.
- **Backend** code that spells wire values as string constants, such as
  `HOME_DELIVERY = "home_delivery"`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutModels.java`, "String HOME_DELIVERY"):
  `mibolt-commerce-backend`. The finder's `enum` kind also searches the upper-
  and lower-case forms for this reason.
- **Discriminator enums.** `home_delivery`, `pickup_point`, `card` and
  `cash_on_delivery` inside the four discriminated subtypes are guarded by
  `prepareOpenApiSpec`; a second value under one of them fails every backend
  build (the codegen reference, section 4). The finder shows the guard in
  its `other` bucket (`backend/services/commerce/build.gradle`, "HomeDeliverySelection.optionId", for
  `home_delivery`).
- **Catalogue-backed enums** such as `StorageGb` are also enumerated in the
  catalogue schema and the admin seed (the catalog-data reference,
  section 1).

## 7. A new error code

1. **Contract.** Add it to `ProblemCode`
   (`contracts/commerce/openapi.yaml`, "ProblemCode:") and document it on the
   operations that return it. The existing examples follow one shape: `type`
   is `urn:mi-bolt:problem:` plus the code in kebab case, `title` is the
   backend's default title (`contracts/commerce/openapi.yaml`, "type: urn:mi-bolt:problem:idempotency-conflict"). For a
   code the shop sees, add a row to the table in
   `contracts/commerce/kommunikacio.md` ("5.3 Error codes and their typical place"), which requires Hungarian UI
   text for every listed code (`contracts/commerce/kommunikacio.md`, "Expectation for both sides:").
2. **Regenerate.** `problem-code.ts` and `problem-code-array.ts` change in both
   clients.
3. **Backend** `ErrorCode` constant with the same name, its HTTP status and an
   English default title
   (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java`, "public enum ErrorCode";
   the `type` URI is built at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java` ("problemTypeUri")), thrown by the owning service,
   and the count of `ErrorCode` constants that `ErrorCodeTest` pins raised to
   match: `mibolt-commerce-backend`. `ProblemAdvice` maps it to the wire with
   `ProblemCode.valueOf(code.name())`
   (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "private static ProblemCode codeToWireCode(").
   Skipped: see `SKILL.md`, "What fails when a step is skipped".
4. **Storefront and demo-payment** handling and its Hungarian text:
   `mibolt-shop-frontend`. An unhandled code compiles; in
   `frontend/projects/storefront/src/app/features/checkout/order-submission.ts` ("private mapFailure(")
   it falls to the `default` branch as `unknown`.
5. **Admin** handling, around `frontend/projects/admin/src/app/core/api/problem.ts`:
   `mibolt-admin-frontend`.
6. **shop-mocks** returning the code where the mock backend should:
   `mibolt-shop-frontend`. The contract suite builds its code-to-operation
   matrix from the spec (`frontend/tests/contract/operation-matrix.spec.ts`, "problemMatrix = buildProblemCodeMatrix("),
   so no hand-kept list there needs the new code.

## 8. An If-Match or other header change

- **Contract.** Two If-Match parameters exist: `IfMatch`, the cart and checkout
  version (`contracts/commerce/openapi.yaml`, "The session state version from the most recent ETag"), and `ProductIfMatch`, the
  admin product version (`contracts/commerce/openapi.yaml`, "ProductIfMatch:"), answered by
  the `ETag` and `ProductETag` response headers
  (`contracts/commerce/openapi.yaml`, "The current session state version, quoted", `contracts/commerce/openapi.yaml`, "ProductETag:").
  The protocol is `contracts/commerce/kommunikacio.md` ("3. Versioning and concurrency"): one version
  counter, a quoted integer, 412 `CART_VERSION_CONFLICT` on a mismatch, and no
  silent retry with the new version.
- **Frontend.** Both generator configs drop `If-Match` from the generated
  signatures (`frontend/ng-openapi-gen.json`, "excludeParameters"), so the caller attaches it.
  The storefront uses core-api's `withIfMatch(version)`
  (`frontend/projects/core-api/src/demo-session.interceptor.ts`, "export function withIfMatch");
  `demoSessionInterceptor` writes the header, quoting a bare integer, passing
  an already-quoted one through and throwing on anything else
  (`frontend/projects/core-api/src/demo-session.interceptor.ts`, "demoSessionInterceptor: HttpInterceptorFn",
  `frontend/projects/core-api/src/demo-session.interceptor.ts`, "function quoteVersion").
  demo-payment registers the same interceptor and calls no operation that
  takes `If-Match`. The admin uses its own `withIfMatch(etag)`, which passes
  the ETag through unchanged
  (`frontend/projects/admin/src/app/core/api/if-match.interceptor.ts`, "export function withIfMatch").
  The caller changes go to `mibolt-shop-frontend` and `mibolt-admin-frontend`.
- **Contract suite.** A shop mutation gaining or losing `IfMatch` moves in or
  out of the set at `frontend/tests/contract/schema.spec.ts` ("cart-version-monotonic: every mutating cart operation requires If-Match"), and the same
  holds for `Idempotency-Key` at `frontend/tests/contract/schema.spec.ts` ("idempotency-key-required-on-mutations");
  either test fails otherwise.
- **Backend** version checks and ETag responses: `mibolt-commerce-backend`.

## 9. Removing or renaming something

- Run the finder on the old name. Everything it lists goes in the same change,
  in every layer, the backend included, with no shim kept for the old name;
  `mibolt-frontend-code-standards` ("Removed features") states the same rule
  for a cut frontend feature.
- Regeneration removes what the contract no longer declares. A frontend model
  file that is no longer generated, because its schema is gone or no operation
  of that client references it (`ignoreUnusedModels`), is deleted by
  ng-openapi-gen's `removeStaleFiles`, which "Defaults to true" and neither
  config sets
  (https://github.com/cyclosproject/ng-openapi-gen/blob/master/ng-openapi-gen-schema.json);
  the backend output directory is wiped before every generation (the codegen
  reference, section 4). `api:drift` then shows the deletions as a diff until
  they are staged or committed.
- A sample named after a removed schema no longer has a schema to validate
  against; remove or rename it with the schema.
- A renamed operation moves every count and list in section 4 or 5, and the
  test titles that name it.
- End-to-end specs, their fixtures under `frontend/e2e/fixtures/` and the
  plans under `frontend/specs/` that use the name (the finder's `e2e` bucket)
  move with it, like any other file the finder lists: the `/demo/session`
  path in `frontend/e2e/fixtures/backend-ready.ts` is one such hit.
  `frontend/e2e/seed.spec.ts` holds the suite's conventions.

## 10. A core-api change

`frontend/projects/core-api/src/` holds three modules: `api-root.ts`,
`demo-session.interceptor.ts` and `splash.ts`.

1. Add the module and its spec under `frontend/projects/core-api/src/`, and
   export it from `frontend/projects/core-api/src/public-api.ts`, the library's
   packaging entry (`frontend/projects/core-api/ng-package.json`).
2. Apps import each module by file through `@mi-bolt/core-api/*`
   (`frontend/tsconfig.json`, "@mi-bolt/core-api/*"), for example `@mi-bolt/core-api/api-root`,
   and opt in explicitly: the storefront registers `demoSessionInterceptor`
   at `frontend/projects/storefront/src/app/app.config.ts` ("withInterceptors([demoSessionInterceptor, priceCacheInterceptor, demoAccessInterceptor])"), demo-payment at
   `frontend/projects/demo-payment/src/app/app.config.ts` ("withInterceptors([demoSessionInterceptor])"). The admin takes
   only `resolveApiRoot` and `dismissSplash`, keeps its own interceptors
   (`frontend/projects/admin/src/app/app.config.ts`, "withInterceptors([ifMatchInterceptor"), and gets a new
   core-api interceptor only by an explicit decision
   (`frontend/projects/core-api/src/public-api.ts`, "The admin keeps its own If-Match interceptor").
3. The opt-in in each app goes to that app's skill.
