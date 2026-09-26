# Invariant index: the Hungarian requirement docs in English

An English index into `backend/docs/02-backend.md` and `backend/docs/04-adatbazis.md`,
with the code that enforces each numbered rule. It is an index, not a translation:
the Hungarian text is what binds, so read the rule there before changing the
behaviour it describes. Where a document and `contracts/commerce/openapi.yaml`
disagree, the spec file wins (`contracts/commerce/kommunikacio.md:11-19`).

## Contents

- [Section map of 02-backend.md](#section-map-of-02-backendmd)
- [Section map of 04-adatbazis.md](#section-map-of-04-adatbazismd)
- [Catalogue, rules 1-12](#catalogue-rules-1-12)
- [Cart, rules 13-22](#cart-rules-13-22)
- [Checkout, rules 23-29](#checkout-rules-23-29)
- [Payment, rules 30-36](#payment-rules-30-36)
- [Order, rules 37-46](#order-rules-37-46)
- [Price change, rule 47](#price-change-rule-47)
- [Schema constraints and where each lives](#schema-constraints-and-where-each-lives)

## Section map of 02-backend.md

| § | Hungarian title | Lines | What it settles |
|---|---|---|---|
| 1 | Technológiai keret | `backend/docs/02-backend.md:8-22` | Spring Boot 4.1.1, Gradle 9.7.1 Groovy DSL, Java 21, `spring-boot-starter-webmvc`, JPA, PostgreSQL 16, root package. |
| 2 | Kódgenerálás | `backend/docs/02-backend.md:26-44` | Interfaces and DTOs come from the contract; controllers implement them and declare no route, method or status of their own; single-value `enum` discriminators stay, never rewritten to `const`. |
| 3 | Rétegzés | `backend/docs/02-backend.md:48-62` | Controller, service, repository split. The rule and its review-only enforcement belong to `mibolt-backend-code-standards`. |
| 4 | Domain-invariánsok | `backend/docs/02-backend.md:66-184` | Rules 1-47, indexed below. |
| 5 | Adatmodell elvárások | `backend/docs/02-backend.md:188-214` | What the data model must hold: shared version counter for cart and draft, idempotency record shape, atomic order placement. |
| 6 | Kezdőadat és képek | `backend/docs/02-backend.md:218-286` | 6.1: catalogue collection is a separate task. 6.2: the backend stores and serves images, deliberately for now; content-derived ids, `GET /media/{imageId}`, immutable caching. |
| 7 | Tesztelési elvárások | `backend/docs/02-backend.md:290-401` | 7.0 no Docker database in tests; 7.1 smoke scenarios F1-F7; 7.2 every numbered invariant tested and named by number, plus concurrency, idempotency and session isolation cases; 7.3 API tests per operation, error code and header; 7.4 machine contract validation. |
| 8 | A fejlesztés alatti döntések dokumentálása | `backend/docs/02-backend.md:405-438` | The decision-record workflow; SKILL.md section 5 carries it. |
| 9 | Amit nem szabad | `backend/docs/02-backend.md:442-454` | The forbidden list. It belongs to `mibolt-backend-code-standards`, except two lines that stay here: price, stock or amount never taken from a request body, with its one admin exception (`:448`, decision 0020), and the ban on an undocumented decision, which is the §8 workflow. |

## Section map of 04-adatbazis.md

| § | Hungarian title | Lines | What it settles |
|---|---|---|---|
| 1 | Kötelező szabály | `backend/docs/04-adatbazis.md:3-31` | The local database runs only through root `mise` tasks and `deploy/compose.sh`; tests never reach it. Running it is `mibolt-workspace-ops`. |
| 2 | Amit a konténer ad | `backend/docs/04-adatbazis.md:35-69` | Container image, port, volume, second stacks. `mibolt-workspace-ops`. |
| 3 | Alkalmazás-oldali elvárások | `backend/docs/04-adatbazis.md:73-85` | Connection from `MIBOLT_DB_URL`, `MIBOLT_DB_USER` and `MIBOLT_DB_PASSWORD`; `ddl-auto` is `validate`; the app must not start on a mismatched schema. |
| 4 | Séma-elvárások | `backend/docs/04-adatbazis.md:89-103` | Constraints the database itself enforces, listed below. |
| 5 | Migráció | `backend/docs/04-adatbazis.md:107-124` | Liquibase; history reproducible from an empty database; forward-only (`:115-116`); schema checked at start; seed data is not a changeset. |

## Catalogue, rules 1-12

Source: `backend/docs/02-backend.md:70-92`.

1. A list item is a (product, storage) pair, and `total` counts list items.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:254-263`
   (`buildEntriesForProduct` over `STORAGE_VALUES`).
2. Filters combine with AND across facets and OR within one facet.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:297-363`
   (`filterEntries`, `matchesProductLevel`, `variantMatches`).
3. Facet counts are disjunctive: a facet's own selection is left out when that
   facet is counted, the others are not.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:915-924`
   (`Filters.without`, called from the `matches*Facet` methods).
4. `priceRange` is the lowest and highest price of the current result set.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:512-527`.
5. `recommended` sorts by curated `rank`, then product id, then ascending
   storage; with `q` present it means relevance.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:365-375`
   (`sortEntries`) and `RECOMMENDED_ENTRY_ORDER` at `:881`.
6. `featured=true` returns at most four items, in curated order.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:421-436`
   (`applyFeaturedCap`, `capCount`; `FEATURED_CAP` at `:52`).
7. A page past the end returns empty `items`, unchanged `total` and
   `totalPages`, and echoes the requested `page`; no clamping, no 404.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:158-169`.
8. An unknown query parameter is a 400; silently ignoring it is forbidden.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/UnknownQueryParameterInterceptor.java`,
   registered in `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/WebMvcConfig.java`.
9. `minPrice` greater than `maxPrice` is a 400.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:117-121`.
10. A list item's `colors` lists the product's colours at the same storage,
    each with its own price, availability and variant id.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:270-295`
    (`pickEntry`).
11. `variantSlug` is unique within a product and usable as a path segment.
    `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml:285-288`
    (`uq_product_variant_product_slug`).
12. `image.src` is a ready-to-use URL the server builds; the client never
    assembles an image path.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:718-726`
    (`toImageData`; `MEDIA_SRC_PREFIX` at `:44`).

`pageSize` accepts only 12 or 24:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:835-842`.

## Cart, rules 13-22

Source: `backend/docs/02-backend.md:94-112`. Enforced in `CartService` unless
another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`.

13. One variant is exactly one cart line; adding it again merges into that
    line. `addItem`, `:79-118`; the concurrency backstop is
    `uq_cart_item_cart_variant`,
    `backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml:91-94`.
14. Quantity is always absolute, never a delta. `setQuantity`, `:120-147`.
15. A merged quantity over the line maximum is a `QUANTITY_LIMIT` error, never
    silent truncation. `addItem`, `:102-106`.
16. `maxQuantity` is the smaller of stock and the global per-line limit, and
    `availability` never contradicts it.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java:796-809`
    (`maxQuantity`, `orderableMax`, which is 0 for an archived product;
    `MAX_PER_LINE` at `:41`).
17. When stock falls below a line's quantity the server reduces the line and
    reports `QUANTITY_REDUCED`, leaving no contradictory state. `reconcile`,
    `:208-236`, which `getCart`, `addItem`, `setQuantity` and `removeItem`
    run; at zero stock it removes the line with `ITEM_REMOVED`.
18. `lineCount` counts lines, `totalQuantity` sums quantities; the header badge
    shows the latter. `finalize`, `:271-279`.
19. The cart lives 30 days and every successful operation extends
    `expiresAt`, with the session cookie's `Max-Age`. `finalize`, `:239-243`;
    `mibolt.session.lifetime` in
    `backend/services/commerce/src/main/resources/application.properties:37`.
20. Deleting a line is idempotent: a variant unknown to the catalogue is 404,
    a known variant not in the cart is 200 with the current cart.
    `removeItem`, `:149-164`.
21. `DELETE /cart/items` empties the cart in one request and raises the
    version once. `clear`, `:166-176`.
22. `GET /cart` creates an empty cart when the session has none.
    `loadOrCreateCart`, `:183-190`.

## Checkout, rules 23-29

Source: `backend/docs/02-backend.md:114-130`. Enforced in `CheckoutService`
unless another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java`.

23. The draft is durable: it lives with the cart, survives a refresh or a tab
    switch, and is deleted only when the order is placed.
    `loadOrCreateDraft`, `:304-307`; the deletion is
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java:233`.
24. `PATCH /checkout` merges: only the sections sent are overwritten.
    `applyUpdate`, `:188-218`.
25. Partial state is allowed until the order; `complete` is true when every
    required section is present and the cart is not empty. `buildView`,
    `:287-290`.
26. Billing data is required for every order, pickup included. `buildView`,
    `:287-290`, and the section check at order time,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java:270-313`.
27. A delivery address exists only for home delivery; the contract's `oneOf`
    enforces it and the service checks it too. `validateUpdate`, `:145-150`.
28. The summary is recomputed on every read; there is no quote step and no
    price lock. `buildSummary`, `:296-302`.
29. `GET /checkout/options` depends on the cart value: delivery fees reflect
    the free-shipping threshold, and above a ceiling cash on delivery is
    `available: false` with `CART_VALUE_TOO_HIGH`. The numbers are the
    implementation's to choose, but the two options may never both be always
    available. `buildOptions`, `:225-259`; the values are
    `backend/services/commerce/src/main/resources/application.properties:46-54`,
    recorded in `backend/docs/decisions/0010-checkout-draft-options-and-fees.md`.

## Payment, rules 30-36

Source: `backend/docs/02-backend.md:132-149`. Enforced in
`PaymentIntentService` unless another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java`.

30. An intent is created only for card payment and only for a complete draft.
    `create`, `:73-83`.
31. The backend never asks for or accepts a card number, a security code or an
    expiry date. Structural: no such field exists on
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntent.java:22-47`.
32. `declined` and `pending` are valid outcomes, not server errors, with the
    status in the body. `resolve`, `:98-113`, returns them and never throws for
    them. The rule text names 201; the contract answers
    `POST /payment-intents/{id}/outcome` with 200
    (`contracts/commerce/openapi.yaml:836`), and the code follows the contract.
33. A pending intent reaches a terminal status by its `expiresAt`.
    `applyLazyExpiry`, `:124-132`, evaluated lazily on every `get` and
    `resolve`; there is no scheduler.
34. `redirectUrl` points at the demo payment app on its own origin, so
    `redirectUrl` and `returnUrl` are absolute, built from
    `mibolt.payment.redirect-url-prefix` and `return-url-prefix`. `create`,
    `:86-87`; the keys are
    `backend/services/commerce/src/main/resources/application.properties:60-61`.
35. The outcome call is allowed only for the owning session and only once: a
    terminal intent answers 409 `PAYMENT_ALREADY_RESOLVED`. `loadIntent`,
    `:115-122` (another session's intent is 404), and `resolve`, `:106-110`.
36. The outcome operation exists only because there is no real payment
    provider, and a real integration deletes it.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java:76`
    (`resolvePaymentIntent`).

## Order, rules 37-46

Source: `backend/docs/02-backend.md:151-178`. Enforced in `OrderService`
unless another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`.

37. Idempotency replay comes before every other check, the cart state, the
    expiry and `If-Match` included.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java:89-96`
    replays before `place` runs; the version check follows at `:122-123`. The
    same order holds for
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java:54-61`.
38. A card order needs `paymentIntentId`, and its absence is a schema error,
    400. Each intent status has its answer: `succeeded` proceeds,
    `requires_action` is 422 `PAYMENT_REQUIRED`, `pending` 422
    `PAYMENT_PENDING`, `declined` 422 `PAYMENT_DECLINED`; an intent already
    backing an order is 422 `PAYMENT_REQUIRED`. `place`, `:152-180`; the race
    backstop is `uq_shop_order_payment_intent`,
    `backend/services/commerce/src/main/resources/db/changelog/changes/0011-order-payment-intent-unique.yaml:13-16`,
    answered at
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java:75-80`.
39. A cash-on-delivery order carries no `paymentIntentId`.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java:100-109`.
40. `acceptedTerms: false` is a 422 with a `fieldErrors` entry at
    `/acceptedTerms`, not a schema error. `place`, `:126-129`.
41. The server checks `termsVersion` against the current version. `place`,
    `:130-135`; the value is
    `backend/services/commerce/src/main/resources/application.properties:54`.
42. Placing an order is one transaction: stock decrement, receipt,
    idempotency record, cart close and draft deletion succeed or fail
    together. `@Transactional` on the class, `:36-38`; the decrement,
    `:182-193`; the controller's `TransactionTemplate` with three attempts on
    an order-number collision,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java:69-87`.
43. After the order the session gets a fresh, empty cart at once. `place`,
    `:237-240`.
44. Price, delivery method and contact data come from the draft, never from
    the order request. `place`, `:145-150` and `:204-223`.
45. `GET /orders/{orderId}` returns the order only to the session that created
    it; anyone else gets 404, never 403. `get`, `:246-259`.
46. The order number is `DEMO-` plus six digits, deliberately visibly fake.
    `ORDER_NUMBER_PREFIX` at `:43`, `uniqueOrderNumber` at `:261-268`, and
    `uq_shop_order_number`,
    `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml:210-213`.

## Price change, rule 47

Source: `backend/docs/02-backend.md:180-184`. When a catalogue price changes,
the server updates the cart prices atomically, raises the version, and answers
a payment or order attempt with 409 `PRICE_CHANGED`; accepting the new amount
silently is forbidden. The notice comes from
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:228-232`
and the version rises in `finalize`, `:239-240`. The refusals are
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java:65-71`
and
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java:101-120`.

## Schema constraints and where each lives

`backend/docs/04-adatbazis.md:89-103` lists what the database itself enforces.
Each is in a changeset under
`backend/services/commerce/src/main/resources/db/changelog/changes/`:

| Constraint | Where |
|---|---|
| Product slug unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml:24-28` |
| Variant slug unique within a product | `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml:285-288` |
| Colour code unique within a product | `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml:281-284` |
| One active cart per session | `backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml:22-30` |
| One line per variant in a cart | `backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml:91-94` |
| Order number unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml:210-213` |
| Idempotency key unique per session, method and path | `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml:340-343` |
| Stock never below zero | `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml:344-346` |
| Admin username unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0007-admin-user.yaml:36-39` |
| Demo username unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0010-demo-access.yaml:35-38` |
| One order per payment intent | `backend/services/commerce/src/main/resources/db/changelog/changes/0011-order-payment-intent-unique.yaml:13-16` |
| Money as whole HUF in an integer column | `bigint` columns named `*_huf`, for example `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml:211-212` |
