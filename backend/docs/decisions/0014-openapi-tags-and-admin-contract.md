# 0014 — OpenAPI generation by tag and the 2.1.0 admin contract

## Situation

The admin application is a separate Angular app that signs in through a
dedicated cookie (`mibolt_admin_session`) and lives behind the same
`/api/v1` base path as the shop. The 2.1.0 contract adds fifteen
operations under `/admin/**` (sign-in, session, password, user CRUD,
catalogue CRUD with If-Match, brand list, image upload) plus the matching
`Unauthorized`, `Forbidden`, `UnprocessableEntity`,
`ProductPreconditionFailed`, `PreconditionRequired` and `PayloadTooLarge`
responses, the `adminSession` cookie scheme, the `ProductETag` header,
the `AdminId`, `ProductId` and `ProductIfMatch` parameters, the new
`Admin*` schemas and eleven new `ProblemCode` values.

With the OpenAPI Generator's default grouping the first path segment
becomes the interface name: every operation under `/admin/**` would land
in a single `AdminApi` interface, so one generated class would own
every admin unit's code, its tests, and every later fix. The shop
already names each surface after its tag (`Catalog`, `Cart`, `Checkout`,
`Orders`, `Media`), and the four-tag admin split (`AdminAuth`,
`AdminUsers`, `AdminProducts`, `AdminMedia`) mirrors that.

## Options

a. Enable `useTags: 'true'` in the OpenAPI Generator `spring` config so
   the generated interfaces follow the OpenAPI `tags` array. Each tag
   gets its own interface (`AdminAuthApi`, `AdminUsersApi`,
   `AdminProductsApi`, `AdminMediaApi`), and the shop's existing
   interfaces stay where they are (`CartApi`, `CheckoutApi`, `OrdersApi`,
   `MediaApi`).

b. Rename the admin paths so their first segments differ
   (`/admin-auth/login`, `/admin-users/{adminId}` and so on). The
   contract's binding path outline names the operations under
   `/admin/**` literally; this would break the binding without
   simplifying the generated code.

c. Keep the generator's default grouping and write one controller for
   all fifteen admin operations. The class would be the largest in the
   project by an order of magnitude and would couple sign-in, user
   administration and catalogue maintenance in a single dependency graph.

## Decision

(a). The contract moves from `info.version` 2.0.0 to 2.1.0, an additive
semver-minor change in the same document; the four admin tags drive the
new interfaces; eleven new `ProblemCode` values
(`UNAUTHENTICATED`, `CSRF_TOKEN_INVALID`, `PRODUCT_VERSION_CONFLICT`,
`PRECONDITION_REQUIRED`, `USERNAME_TAKEN`, `ADMIN_SELF_DELETE`,
`LAST_ADMIN`, `VARIANT_IN_CART`, `FEATURED_LIMIT`,
`CATALOG_CONSTRAINT_CONFLICT`, `PAYLOAD_TOO_LARGE`) join the existing
fifteen. `AdminUserCreated` keeps the member name `user` exactly as the
backend plan writes it (the older outline said `admin`; this record
retires that). The list item gains `version`, `maxPrice` and `colors`
and the sort enum gains `featured` as its last value, settled
2026-09-22; the brief that ran this unit applied those edits directly
rather than asking the plan author. No git tag is created for 2.1.0,
consistent with 2.0.0.

The two shop interfaces whose names were governed by the same generator
default rename with this change: `ProductsApi` becomes `CatalogApi` and
`PaymentIntentsApi` becomes `PaymentApi`. ADR 0008 names the rename in
its two prose references; the test classes `ProductsApiTest` and
`PaymentIntentsApiTest` keep their file names because the renaming was
a generator change, not a test-surface change. The other shop
interfaces (`CartApi`, `CheckoutApi`, `OrdersApi`, `MediaApi`) keep
their names because their tags already matched the path's first
segment.

## Consequences

Each admin tag gets its own generated interface, so the matching
controllers (`AdminAuthController`, `AdminUsersController`,
`AdminProductsController`, `AdminMediaController`) live in separate
files with separate dependency graphs. An admin operation without a
controller implementation answers the generator's default 501 until its
unit lands, which is exactly what the orchestrating build relies on: a
later unit (B3-B8) implements the methods without changing this
contract. The frontend syncs 2.1.0 with `api:sync`, which is the
project's existing mechanism for picking up a contract change.

`CatalogApi` and `PaymentApi` are the new generated names; every
`ProductsApi` reference in the project (controller, advice Javadoc,
ADR 0008) is renamed in this unit, and `PaymentIntentsApi` is renamed
to `PaymentApi` in the payment controller and its Javadoc. Any stale
reference in a future file will fail to compile, which is the test the
gate `grep -rn -E 'ProductsApi\b|PaymentIntentsApi\b' src/main/java`
already runs.

## Date and status

2026-09-23 — Valid. Settled on 2026-09-22 (Q1 on the issue) and applied
2026-09-23 by unit MIM-322-B1.

## Note: paths after the monorepo move (MIM-411)

- The gate `grep -rn -E 'ProductsApi\b|PaymentIntentsApi\b' src/main/java` ran from the backend repository root; from the git root it is `grep -rn -E 'ProductsApi\b|PaymentIntentsApi\b' backend/services/commerce/src/main/java`.
- In the monorepo `api:sync` is gone: `frontend/ng-openapi-gen.json` reads `contracts/commerce/openapi.yaml` directly, so a contract change reaches the frontend with the next `npm --prefix frontend run api:generate`, and `api:drift` in CI fails when it did not.
