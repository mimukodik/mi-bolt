# Contract change chains

Per kind of contract change: every place that has to move with it, and the
check that fails when one is left out. Paths are repo-relative and commands
run from the repository root. The consumer edits belong to the area skill
named on each step; this file says what has to change and what catches a
miss, not how to write the consumer code.

## Contents

1. Start from the finder, or from a sibling
2. Contract-side edits every change shares
3. A new or changed field on a shared schema
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
| a field on `Product` | `--kind property releasedAt` | reaches the catalogue data, the fixture and both mock layers |
| a schema | `--kind schema Cart` | has a sample, `contracts/commerce/samples/Cart.json` |

Two blind spots, both measured:

- **An empty bucket is not proof of no consumer.** The admin mocks match
  requests by URL and never name the operation, so the run above for
  `archiveAdminProduct` leaves the `admin mocks` bucket empty although
  `frontend/projects/admin/src/mocks/products-write.handlers.ts:958` handles
  that route. For an operation, also search its path.
- **For an error code use the `enum` kind.** The `schema` kind finds the
  schema name in `contracts/`, its samples, the imports of its generated model
  file and the Java model imports; run as `--kind schema ProblemCode` it finds
  no storefront hit at all, while `--kind enum PRICE_CHANGED` finds 25.

## 2. Contract-side edits every change shares

- `contracts/commerce/openapi.yaml`: the change itself. Every operation
  carries one of the eleven tags declared at
  `contracts/commerce/openapi.yaml:56-77`; the tag decides which frontend
  client gets it and which backend interface, `<Tag>Api`, must implement it
  ([codegen.md](codegen.md)).
- The spec's own media-type `examples:`. `frontend/tests/contract/schema.spec.ts:177`
  validates every one against its schema, so an example the change
  invalidates fails the contract suite.
- `contracts/commerce/samples/`. Each file is named after the schema it
  instantiates, with an optional case part (`OrderRequest.card.json`), and
  `contracts/check-samples.sh` validates it against that schema
  (`contracts/check-samples.sh:1-4`). A sample whose schema changed must still
  validate; a new schema does not need a sample (24 exist).
- `contracts/commerce/kommunikacio.md`, when a rule the spec cannot express
  changes: cookies (section 2), versions and If-Match (section 3),
  idempotency (section 4), the error table (section 5.3), the localisation
  boundary (section 6). Where the two disagree the spec wins and the document
  is corrected (`contracts/commerce/kommunikacio.md:11-19`).
- `contracts/commerce/sequences/*.puml`, when a flow they draw changes;
  `contracts/mise.toml:1-2` describes the contract task's check of them as
  syntax only.
- `info.version` at `contracts/commerce/openapi.yaml:4` (2.3.0 on
  2026-09-26). `backend/docs/decisions/0014-openapi-tags-and-admin-contract.md`
  records an additive change moving it as a semver minor.

## 3. A new or changed field on a shared schema

| Step | Where, and whose | What fails if it is skipped |
|---|---|---|
| Contract, examples, samples | section 2 | `frontend/tests/contract/schema.spec.ts:177`; `mise run contracts:check` |
| Regenerate | `mise run api:generate`; the model file changes in each client whose operations reference the schema | `api:drift` |
| Contract-suite fixtures | the happy-path response fixtures in `buildHappyPathFixture` (`frontend/tests/contract/operation-matrix.spec.ts:736`) for a shop operation returning the schema | a new required field fails `frontend/tests/contract/operation-matrix.spec.ts:173-195` |
| shop-mocks | the stores and builders that construct the model, such as `frontend/projects/shop-mocks/src/catalog/catalog-store.ts`: `mibolt-shop-frontend` | a new required field stops that code type-checking; `mibolt-verification` names the commands that compile it |
| storefront, demo-payment | callers and readers: `mibolt-shop-frontend` | a new required field in a request body stops every caller that builds the body type-checking; a new response field fails nothing |
| admin app and admin mocks | form model, mapper, schema, mocks and seed, for `Admin*` schemas: `mibolt-admin-frontend` | the same type-checking failures; no contract test covers the admin mocks |
| backend | domain record, mapper, service and API test: `mibolt-commerce-backend` | the backend API tests check responses against the source contract with `validAgainstContract()`, which "asserts the response satisfies every applicable rule in the contract" (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/ContractValidation.java:35-38`) |
| catalogue fixture | for `Product` fields: the source data and the mapping in `frontend/scripts/build-catalog-fixture.mjs` ([catalog-data.md](catalog-data.md)) | `frontend/tests/contract/schema.spec.ts:571-585` validates every fixture product against `Product` |
| e2e | `playwright-tests` | the e2e run |

## 4. A new shop operation

1. **Contract.** A shop tag (`Catalog`, `Cart`, `Checkout`, `Payment`,
   `Orders`, `Media`, `DemoAccess`), an `operationId`, and the shared
   `BadRequest` response, which every shop operation must declare
   (`frontend/tests/contract/shop-bad-request.spec.ts:21-28`). A mutation of
   the session's cart or checkout state takes the `IfMatch` parameter; see
   section 8.
2. **Regenerate.** A new function file under
   `frontend/projects/shop-api/src/generated/fn/` and its export in
   `frontend/projects/shop-api/src/generated/functions.ts`. Skipped: `api:drift`,
   and `frontend/tests/contract/operation-matrix.spec.ts:117-133` fails because
   the SDK lacks the function.
3. **Contract suite**, each of which fails until updated:
   - `REQUIRED_OPERATION_COUNT` (`frontend/tests/contract/response-validation.ts:35`),
     read by `frontend/tests/contract/operation-matrix.spec.ts:113-115`,
     `frontend/tests/contract/operation-matrix.spec.ts:679-683` and
     `frontend/tests/contract/shop-bad-request.spec.ts:23`;
   - `EXPECTED_OPERATION_IDS` (`frontend/tests/contract/schema.spec.ts:88-108`);
   - the "19 others" count in `frontend/tests/contract/sdk-split.spec.ts:126`;
   - the round trip in `frontend/tests/contract/sdk-transport.spec.ts:366`,
     which needs a handler in that file's own list (`frontend/tests/contract/sdk-transport.spec.ts:122`) and a
     `callOperation` call, or it reports the operation "not exercised by the
     SDK";
   - a happy-path fixture case in `buildHappyPathFixture`
     (`frontend/tests/contract/operation-matrix.spec.ts:736`) when the
     success response has a JSON body;
   - for a mutation carrying `If-Match` or `Idempotency-Key`, the expected
     sets at `frontend/tests/contract/schema.spec.ts:424` and
     `frontend/tests/contract/schema.spec.ts:483`.

   The count 19 also sits in test titles and header comments across
   `frontend/tests/contract/` and in `frontend/tests/contract/admin-tags.ts:4-5`;
   keep them true.
4. **shop-mocks handler**: `mibolt-shop-frontend`. Skipped:
   `frontend/tests/contract/operation-matrix.spec.ts:135-145` lists the
   operation under "MSW handlers missing for".
5. **Backend controller method** on the tag's `<Tag>Api`:
   `mibolt-commerce-backend`. Skipped: nothing fails at compile time, because
   the generated interface carries a default method ([codegen.md](codegen.md),
   section 4); only a backend API test for the operation, or a run against the
   real backend, shows it.
6. **Storefront or demo-payment caller**: `mibolt-shop-frontend`.

## 5. A new admin operation

1. **Contract.** A path under `/admin` and exactly one of `AdminAuth`,
   `AdminUsers`, `AdminProducts`, `AdminMedia`; product writes take the
   `ProductIfMatch` parameter (`contracts/commerce/openapi.yaml:1815`).
   Skipped or wrong: `frontend/tests/contract/sdk-split.spec.ts:103-121`.
2. **Regenerate.** It lands in the admin client only. Skipped: `api:drift`, and
   `frontend/tests/contract/sdk-split.spec.ts:139-144` reports the admin
   functions module missing it.
3. **Counts.** 15 admin operations are pinned at
   `frontend/tests/contract/sdk-split.spec.ts:125` and
   `frontend/tests/contract/sdk-split.spec.ts:141`, and stated in
   `frontend/tests/contract/admin-tags.ts:4-5`.
4. **Admin mocks handler and the admin caller**: `mibolt-admin-frontend`. No
   contract test checks that the admin mocks cover every admin operation.
5. **Backend** controller method on the tag's interface, for example
   `AdminProductsController implements AdminProductsApi`
   (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/catalog/AdminProductsController.java:21`):
   `mibolt-commerce-backend`.

The shop contract checks do not see admin operations: `withoutAdminOperations`
(`frontend/tests/contract/admin-tags.ts:56`) removes them before
`schema.spec.ts`, `response-validation.ts` and `sdk-transport.spec.ts` read the
spec.

## 6. A new enum value

- **Contract** enum, plus any example or sample that lists the values.
- **Regenerate**: the union type and its `-array.ts` sibling in each client
  that references the enum ([codegen.md](codegen.md), section 1).
- **TypeScript consumers** that must cover every member, such as a `Record`
  keyed by the union, stop type-checking until the new member is handled:
  `OUTCOME_LABELS` over the payment outcome is one
  (`frontend/projects/demo-payment/src/app/payment-page.ts:96`). A `switch`
  with a `default` branch still compiles and routes the new value there.
  Owners: `mibolt-shop-frontend`, `mibolt-admin-frontend`.
- **Backend** code that spells wire values as string constants, such as
  `HOME_DELIVERY = "home_delivery"`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutModels.java:27`):
  `mibolt-commerce-backend`. The finder's `enum` kind also searches the upper-
  and lower-case forms for this reason.
- **Discriminator enums.** `home_delivery`, `pickup_point`, `card` and
  `cash_on_delivery` inside the four discriminated subtypes are guarded by
  `prepareOpenApiSpec`; a second value under one of them fails every backend
  build ([codegen.md](codegen.md), section 4). The finder shows the guard in
  its `other` bucket (`backend/services/commerce/build.gradle:52` for
  `home_delivery`).
- **Catalogue-backed enums** such as `StorageGb` are also enumerated in the
  catalogue schema and the admin seed ([catalog-data.md](catalog-data.md),
  section 1).

## 7. A new error code

1. **Contract.** Add it to `ProblemCode`
   (`contracts/commerce/openapi.yaml:2315-2343`) and document it on the
   operations that return it. The existing examples follow one shape: `type`
   is `urn:mi-bolt:problem:` plus the code in kebab case, `title` is the
   backend's default title (`contracts/commerce/openapi.yaml:729-750`). For a
   code the shop sees, add a row to the table in
   `contracts/commerce/kommunikacio.md:166-184`, which requires Hungarian UI
   text for every listed code (`contracts/commerce/kommunikacio.md:186-188`).
2. **Regenerate.** `problem-code.ts` and `problem-code-array.ts` change in both
   clients.
3. **Backend** `ErrorCode` constant with the same name, its HTTP status and an
   English default title
   (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java:12-37`;
   the `type` URI is built at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java:71`), thrown by the owning service:
   `mibolt-commerce-backend`. `ProblemAdvice` maps it to the wire with
   `ProblemCode.valueOf(code.name())`
   (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java:365-367`).
   An `ErrorCode` with no matching `ProblemCode` compiles and throws
   `IllegalArgumentException` when that error is rendered
   (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Enum.html);
   a `ProblemCode` with no `ErrorCode` fails nothing and is never sent.
4. **Storefront and demo-payment** handling and its Hungarian text:
   `mibolt-shop-frontend`. An unhandled code compiles; in
   `frontend/projects/storefront/src/app/features/checkout/order-submission.ts:300-320`
   it falls to the `default` branch as `unknown`.
5. **Admin** handling, around `frontend/projects/admin/src/app/core/api/problem.ts`:
   `mibolt-admin-frontend`.
6. **shop-mocks** returning the code where the mock backend should:
   `mibolt-shop-frontend`. The contract suite builds its code-to-operation
   matrix from the spec (`frontend/tests/contract/operation-matrix.spec.ts:100`),
   so no hand-kept list there needs the new code.

## 8. An If-Match or other header change

- **Contract.** Two If-Match parameters exist: `IfMatch`, the cart and checkout
  version (`contracts/commerce/openapi.yaml:1779`), and `ProductIfMatch`, the
  admin product version (`contracts/commerce/openapi.yaml:1815`), answered by
  the `ETag` and `ProductETag` response headers
  (`contracts/commerce/openapi.yaml:1726`, `contracts/commerce/openapi.yaml:1733`).
  The protocol is `contracts/commerce/kommunikacio.md:76-97`: one version
  counter, a quoted integer, 412 `CART_VERSION_CONFLICT` on a mismatch, and no
  silent retry with the new version.
- **Frontend.** Both generator configs drop `If-Match` from the generated
  signatures (`frontend/ng-openapi-gen.json:12`), so the caller attaches it.
  The storefront and demo-payment use core-api's `withIfMatch(version)`
  (`frontend/projects/core-api/src/demo-session.interceptor.ts:85`), which
  quotes a numeric version and throws on anything else (`frontend/projects/core-api/src/demo-session.interceptor.ts:117-123`); the admin
  uses its own `withIfMatch(etag)`, which passes the ETag through unchanged
  (`frontend/projects/admin/src/app/core/api/if-match.interceptor.ts:6-8`).
  The caller changes go to `mibolt-shop-frontend` and `mibolt-admin-frontend`.
- **Contract suite.** A shop mutation gaining or losing `IfMatch` moves in or
  out of the set at `frontend/tests/contract/schema.spec.ts:424`, and the same
  holds for `Idempotency-Key` at `frontend/tests/contract/schema.spec.ts:483`;
  either test fails otherwise.
- **Backend** version checks and ETag responses: `mibolt-commerce-backend`.

## 9. Removing or renaming something

- Run the finder on the old name. Everything it lists goes in the same change,
  in every layer, per `.claude/rules/code-standards.md:125` ("A cut feature
  leaves nothing behind").
- Regeneration removes what the contract no longer declares: a frontend model
  no operation references disappears through `ignoreUnusedModels`, and the
  backend output directory is wiped before every generation
  ([codegen.md](codegen.md)). `api:drift` then shows the deletions as a diff
  until they are staged or committed.
- A sample named after a removed schema no longer has a schema to validate
  against; remove or rename it with the schema.
- A renamed operation moves every count and list in section 4 or 5, and the
  test titles that name it.
- End-to-end specs and plans that use the name (the finder's `e2e` bucket) go
  to `playwright-tests`; only its agents edit them
  (`.claude/rules/code-standards.md:146`).

## 10. A core-api change

`frontend/projects/core-api/src/` holds three modules: `api-root.ts`,
`demo-session.interceptor.ts` and `splash.ts`.

1. Add the module and its spec under `frontend/projects/core-api/src/`, and
   export it from `frontend/projects/core-api/src/public-api.ts`, the library's
   packaging entry (`frontend/projects/core-api/ng-package.json`).
2. Apps import each module by file through `@mi-bolt/core-api/*`
   (`frontend/tsconfig.json:19`), for example `@mi-bolt/core-api/api-root`,
   and opt in explicitly: the storefront registers `demoSessionInterceptor`
   at `frontend/projects/storefront/src/app/app.config.ts:21`, demo-payment at
   `frontend/projects/demo-payment/src/app/app.config.ts:17`. The admin takes
   only `resolveApiRoot` and `dismissSplash`, keeps its own interceptors
   (`frontend/projects/admin/src/app/app.config.ts:48`), and gets a new
   core-api interceptor only by an explicit decision
   (`frontend/projects/core-api/src/public-api.ts:1-8`).
3. The opt-in in each app goes to that app's skill.
