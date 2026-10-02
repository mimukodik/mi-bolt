# Invariant index: the Hungarian requirement docs in English

An English index into `backend/docs/02-backend.md` and `backend/docs/04-adatbazis.md`,
with the code that enforces each numbered rule. It is an index, not a translation:
the Hungarian text is what binds, so read the rule there before changing the
behaviour it describes. Where a document and `contracts/commerce/openapi.yaml`
disagree, the spec file wins (`contracts/commerce/kommunikacio.md`, "Source of truth").

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

| § | Hungarian title | Where | What it settles |
|---|---|---|---|
| 1 | Technológiai keret | `backend/docs/02-backend.md` ("1. Technológiai keret") | Spring Boot 4.1.1, Gradle 9.7.1 Groovy DSL, Java 21, `spring-boot-starter-webmvc`, JPA, PostgreSQL 16, root package. |
| 2 | Kódgenerálás | `backend/docs/02-backend.md` ("2. Kódgenerálás") | Interfaces and DTOs come from the contract; controllers implement them and declare no route, method or status of their own; single-value `enum` discriminators stay, never rewritten to `const`. |
| 3 | Rétegzés | `backend/docs/02-backend.md` ("3. Rétegzés") | Controller, service, repository split. The rule and its review-only enforcement belong to `mibolt-backend-code-standards`. |
| 4 | Domain-invariánsok | `backend/docs/02-backend.md` ("4. Domain-invariánsok") | Rules 1-47, indexed below. |
| 5 | Adatmodell elvárások | `backend/docs/02-backend.md` ("5. Adatmodell elvárások") | What the data model must hold: shared version counter for cart and draft, idempotency record shape, atomic order placement. |
| 6 | Kezdőadat és képek | `backend/docs/02-backend.md` ("6. Kezdőadat és képek") | 6.1: catalogue collection is a separate task. 6.2: the backend stores and serves images, deliberately for now; content-derived ids, `GET /media/{imageId}`, immutable caching. |
| 7 | Tesztelési elvárások | `backend/docs/02-backend.md` ("7. Tesztelési elvárások") | 7.0 no Docker database in tests; 7.1 smoke scenarios F1-F7; 7.2 every numbered invariant tested and named by number, plus concurrency, idempotency and session isolation cases; 7.3 API tests per operation, error code and header; 7.4 machine contract validation. |
| 8 | A fejlesztés alatti döntések dokumentálása | `backend/docs/02-backend.md` ("8. A fejlesztés alatti döntések dokumentálása") | The decision-record workflow; SKILL.md section 5 carries it. |
| 9 | Amit nem szabad | `backend/docs/02-backend.md` ("9. Amit nem szabad") | The forbidden list, which belongs to `mibolt-backend-code-standards`. This skill describes two things its lines lead to: the admin exception to the price-and-stock line (`backend/docs/02-backend.md`, "Ár, készlet vagy összeg elfogadása a kérés törzséből", decision 0020), and the §8 decision-record workflow behind the ban on an undocumented decision (`backend/docs/02-backend.md`, "Dokumentálatlan döntés"). |

## Section map of 04-adatbazis.md

| § | Hungarian title | Where | What it settles |
|---|---|---|---|
| 1 | Kötelező szabály | `backend/docs/04-adatbazis.md` ("1. Kötelező szabály") | The local database runs only through root `mise` tasks and `deploy/compose.sh`; tests never reach it. Running it is `mibolt-workspace-ops`. |
| 2 | Amit a konténer ad | `backend/docs/04-adatbazis.md` ("2. Amit a konténer ad") | Container image, port, volume, second stacks. `mibolt-workspace-ops`. |
| 3 | Alkalmazás-oldali elvárások | `backend/docs/04-adatbazis.md` ("3. Alkalmazás-oldali elvárások") | Connection from `MIBOLT_DB_URL`, `MIBOLT_DB_USER` and `MIBOLT_DB_PASSWORD`; `ddl-auto` is `validate`; the app must not start on a mismatched schema. |
| 4 | Séma-elvárások | `backend/docs/04-adatbazis.md` ("4. Séma-elvárások") | Constraints the database itself enforces, listed below. |
| 5 | Migráció | `backend/docs/04-adatbazis.md` ("5. Migráció") | Liquibase; history reproducible from an empty database; forward-only (`backend/docs/04-adatbazis.md`, "egy már futtatott changeset-et nem írunk át"); schema checked at start; seed data is not a changeset. |

## Catalogue, rules 1-12

Source: `backend/docs/02-backend.md` ("4.1 Katalógus").

1. A list item is a (product, storage) pair, and `total` counts list items.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("private List<Entry> buildEntriesForProduct")
   (`buildEntriesForProduct` over `STORAGE_VALUES`).
2. Filters combine with AND across facets and OR within one facet.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("private List<Entry> filterEntries")
   (`filterEntries`, `matchesProductLevel`, `variantMatches`).
3. Facet counts are disjunctive: a facet's own selection is left out when that
   facet is counted, the others are not.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("Filters without(String facetToIgnore)")
   (`Filters.without`, called from the `matches*Facet` methods).
4. `priceRange` is the lowest and highest price of the current result set.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("CatalogData.PriceRangeData priceRange").
5. `recommended` sorts by curated `rank`, then product id, then ascending
   storage; with `q` present it means relevance.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("private List<Entry> sortEntries")
   (`sortEntries`) and `RECOMMENDED_ENTRY_ORDER` at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("private static final Comparator<Entry> RECOMMENDED_ENTRY_ORDER").
6. `featured=true` returns at most four items, in curated order.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("private List<Entry> applyFeaturedCap")
   (`applyFeaturedCap`, `capCount`; `FEATURED_CAP` at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java`, "private static final int FEATURED_CAP").
7. A page past the end returns empty `items`, unchanged `total` and
   `totalPages`, and echoes the requested `page`; no clamping, no 404.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("long fromIndex = (long) (page - 1) * pageSizeValue").
8. An unknown query parameter is a 400; silently ignoring it is forbidden.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/UnknownQueryParameterInterceptor.java`,
   registered in `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/WebMvcConfig.java`.
9. `minPrice` greater than `maxPrice` is a 400.
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("minPrice > maxPrice").
10. A list item's `colors` lists the product's colours at the same storage,
    each with its own price, availability and variant id.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("private Entry pickEntry")
    (`pickEntry`).
11. `variantSlug` is unique within a product and usable as a path segment.
    `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml` ("uq_product_variant_product_slug")
    (`uq_product_variant_product_slug`).
12. `image.src` is a ready-to-use URL the server builds; the client never
    assembles an image path.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("public static CatalogData.ImageData toImageData")
    (`toImageData`; `MEDIA_SRC_PREFIX` at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java`, "public static final String MEDIA_SRC_PREFIX").

`pageSize` accepts only 12 or 24:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("private static int parsePageSize").

## Cart, rules 13-22

Source: `backend/docs/02-backend.md` ("4.2 Kosár"). Enforced in `CartService` unless
another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`.

13. One variant is exactly one cart line; adding it again merges into that
    line. `addItem`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("public CartData.CartView addItem"); the concurrency backstop is
    `uq_cart_item_cart_variant`,
    `backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml` ("uq_cart_item_cart_variant").
14. Quantity is always absolute, never a delta. `setQuantity`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("public CartData.CartView setQuantity").
15. A merged quantity over the line maximum is a `QUANTITY_LIMIT` error, never
    silent truncation. `addItem`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("ErrorCode.QUANTITY_LIMIT").
16. `maxQuantity` is the smaller of stock and the global per-line limit, and
    `availability` never contradicts it.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java` ("public static int maxQuantity")
    (`maxQuantity`, `orderableMax`, which is 0 for an archived product;
    `MAX_PER_LINE` at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogService.java`, "public static final int MAX_PER_LINE").
17. When stock falls below a line's quantity the server reduces the line and
    reports `QUANTITY_REDUCED`, leaving no contradictory state. `reconcile`,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("private ReconciliationResult reconcile"), which `getCart`, `addItem`, `setQuantity` and `removeItem`
    run; at zero stock it removes the line with `ITEM_REMOVED`.
18. `lineCount` counts lines, `totalQuantity` sums quantities; the header badge
    shows the latter. `finalize`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("return new CartData.CartView(").
19. The cart lives 30 days and every successful operation extends
    `expiresAt`, with the session cookie's `Max-Age`. The code extends the
    session's and the cart's expiry only when a request changed something or
    produced a notice (`finalize`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "session.extend(now(), now().plus(sessionService.lifetime()))", and a checkout update,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java`, "session.extend(at, at.plus(lifetime))"),
    and the cookie keeps the `Max-Age` it was issued with;
    `backend/docs/decisions/0011-cart-version-etag-and-reconciliation.md` ("Every successful mutation bumps the version once")
    and `backend/docs/decisions/0011-cart-version-etag-and-reconciliation.md` ("is static (30 days from issue)") record both. The lifetime is `mibolt.session.lifetime` in
    `backend/services/commerce/src/main/resources/application.properties` ("mibolt.session.lifetime").
20. Deleting a line is idempotent: a variant unknown to the catalogue is 404,
    a known variant not in the cart is 200 with the current cart.
    `removeItem`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("public CartData.CartView removeItem").
21. `DELETE /cart/items` empties the cart in one request and raises the
    version once. `clear`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("public CartData.CartView clear(").
22. `GET /cart` creates an empty cart when the session has none.
    `loadOrCreateCart`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("private Cart loadOrCreateCart").

## Checkout, rules 23-29

Source: `backend/docs/02-backend.md` ("4.3 Checkout"). Enforced in `CheckoutService`
unless another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java`.

23. The draft is durable: it lives with the cart, survives a refresh or a tab
    switch, and is deleted only when the order is placed.
    `loadOrCreateDraft`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("private CheckoutDraft loadOrCreateDraft"); the deletion is
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("drafts.findByCartId(cartEntity.getId()).ifPresent(drafts::delete)").
24. `PATCH /checkout` merges: only the sections sent are overwritten.
    `applyUpdate`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("private void applyUpdate").
25. Partial state is allowed until the order; `complete` is true when every
    required section is present and the cart is not empty. `buildView`,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("boolean complete = contact != null").
26. Billing data is required for every order, pickup included. `buildView`,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("boolean complete = contact != null"), and the section check at order time,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("private List<FieldError> sectionMissingFieldErrors").
27. A delivery address exists only for home delivery; the contract's `oneOf`
    enforces it and the service checks it too. `validateUpdate`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("address is required for home delivery").
28. The summary is recomputed on every read; there is no quote step and no
    price lock. `buildSummary`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("private static CheckoutData.Summary buildSummary").
29. `GET /checkout/options` depends on the cart value: delivery fees reflect
    the free-shipping threshold, and above a ceiling cash on delivery is
    `available: false` with `CART_VALUE_TOO_HIGH`. The numbers are the
    implementation's to choose, but the two options may never both be always
    available. `buildOptions`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("private CheckoutData.Options buildOptions"); the values are
    `backend/services/commerce/src/main/resources/application.properties` ("Checkout fees and thresholds"),
    recorded in `backend/docs/decisions/0010-checkout-draft-options-and-fees.md`.

## Payment, rules 30-36

Source: `backend/docs/02-backend.md` ("4.4 Fizetés"). Enforced in
`PaymentIntentService` unless another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java`.

30. An intent is created only for card payment and only for a complete draft.
    `create`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java` ("public OrderData.IntentView create(").
31. The backend never asks for or accepts a card number, a security code or an
    expiry date. Structural: no such field exists on
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntent.java` ("public class PaymentIntent").
32. `declined` and `pending` are valid outcomes, not server errors, with the
    status in the body. `resolve`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java` ("public OrderData.IntentView resolve"), returns them and never throws for
    them. The rule text names 201; the contract answers
    `POST /payment-intents/{id}/outcome` with 200
    (`contracts/commerce/openapi.yaml`, "description: The updated payment intent."), and the code follows the contract
    (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java`, "resolvePaymentIntent").
33. A pending intent reaches a terminal status by its `expiresAt`.
    `applyLazyExpiry`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java` ("private void applyLazyExpiry"), evaluated lazily on every `get` and
    `resolve`; there is no scheduler.
34. `redirectUrl` points at the demo payment app on its own origin, so
    `redirectUrl` and `returnUrl` are absolute, built from
    `mibolt.payment.redirect-url-prefix` and `return-url-prefix`. `create`,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java` ("redirectPrefix + id, returnPrefix + id"); the keys are
    `backend/services/commerce/src/main/resources/application.properties` ("mibolt.payment.redirect-url-prefix").
35. The outcome call is allowed only for the owning session and only once: a
    terminal intent answers 409 `PAYMENT_ALREADY_RESOLVED`. `loadIntent`,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java` ("private PaymentIntent loadIntent") (another session's intent is 404), and `resolve`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java` ("ErrorCode.PAYMENT_ALREADY_RESOLVED").
36. The outcome operation exists only because there is no real payment
    provider, and a real integration deletes it.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java` ("public ResponseEntity<PaymentIntent> resolvePaymentIntent")
    (`resolvePaymentIntent`).

## Order, rules 37-46

Source: `backend/docs/02-backend.md` ("4.5 Rendelés"). Enforced in `OrderService`
unless another file is named:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`.

37. Idempotency replay comes before every other check, the cart state, the
    expiry and `If-Match` included.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java` ("private ResponseEntity<OrderReceipt> placeOrder")
    replays before `place` runs; the version check follows inside `place`, at
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Rule 37: version after replay, before the draft."),
    after the rule 47 check (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`, "Rule 47: cart and price/stock changes first."). The same order holds for
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java` ("public ResponseEntity<PaymentIntent> createPaymentIntent").
38. A card order needs `paymentIntentId`, and its absence is a schema error,
    400. Each intent status has its answer: `succeeded` proceeds,
    `requires_action` is 422 `PAYMENT_REQUIRED`, `pending` 422
    `PAYMENT_PENDING`, `declined` 422 `PAYMENT_DECLINED`; an intent already
    backing an order is 422 `PAYMENT_REQUIRED`. `place`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Rule 38: payment state (card only)."); the race
    backstop is `uq_shop_order_payment_intent`,
    `backend/services/commerce/src/main/resources/db/changelog/changes/0011-order-payment-intent-unique.yaml` ("uq_shop_order_payment_intent"),
    answered at
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java` ("PaymentIntentReuse.isPaymentIntentReuse").
39. A cash-on-delivery order carries no `paymentIntentId`.
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java` ("body instanceof CashOnDeliveryOrderRequest cod").
40. `acceptedTerms: false` is a 422 with a `fieldErrors` entry at
    `/acceptedTerms`, not a schema error. `place`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Terms must be accepted").
41. The server checks `termsVersion` against the current version. `place`,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Terms version is outdated"); the value is
    `backend/services/commerce/src/main/resources/application.properties` ("mibolt.checkout.terms-version").
42. Placing an order is one transaction: stock decrement, receipt,
    idempotency record, cart close and draft deletion succeed or fail
    together. `@Transactional` on the class, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("@Transactional public class OrderService"); the decrement and the
    enabled canary-only compensation (ADR 0023), `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Rule 42, docs/04 §4: conditional stock decrement."); the controller's
    `TransactionTemplate` with three attempts on
    an order-number collision,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java` ("public ResponseEntity<OrderReceipt> createOrder").
43. After the order the session gets a fresh, empty cart at once. `place`,
    `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("carts.save(new Cart(session, at, expiresAt))").
44. Price, delivery method and contact data come from the draft, never from
    the order request. `place`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Rule 44: the draft is the authority on the payment method.") and `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Rules 42–44: persist the order from the draft and close the cart.").
45. `GET /orders/{orderId}` returns the order only to the session that created
    it; anyone else gets 404, never 403. `get`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Rule 45: read the order belonging to the current session.").
46. The order number is `DEMO-` plus six digits, deliberately visibly fake.
    `ORDER_NUMBER_PREFIX` at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("static final String ORDER_NUMBER_PREFIX"), `uniqueOrderNumber` at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("private String uniqueOrderNumber()"), and
    `uq_shop_order_number`,
    `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml` ("uq_shop_order_number").

## Price change, rule 47

Source: `backend/docs/02-backend.md` ("4.6 Ármódosulás"). When a catalogue price changes,
the server updates the cart prices atomically, raises the version, and answers
a payment or order attempt with 409 `PRICE_CHANGED`; accepting the new amount
silently is forbidden. The notice comes from
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("new CartData.Notice(N_PRICE_CHANGED")
and the version rises in `finalize`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java` ("session.bumpStateVersion()"). The refusals are
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java` ("Cart prices were updated; the shopper must review the new total")
and
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java` ("Rule 47: cart and price/stock changes first.").

## Schema constraints and where each lives

`backend/docs/04-adatbazis.md` ("4. Séma-elvárások") lists what the database itself enforces;
the changesets add three more, the colour-code, demo-username and
one-order-per-intent rows below. Each is in a changeset under
`backend/services/commerce/src/main/resources/db/changelog/changes/`:

| Constraint | Where |
|---|---|
| Product slug unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml` ("name: slug type: varchar(120) constraints: nullable: false unique: true") |
| Variant slug unique within a product | `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml` ("uq_product_variant_product_slug") |
| Colour code unique within a product | `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml` ("uq_product_color_product_code") |
| One active cart per session | `backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml` ("unique: true foreignKeyName: fk_cart_session") |
| One line per variant in a cart | `backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml` ("uq_cart_item_cart_variant") |
| Order number unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml` ("uq_shop_order_number") |
| Idempotency key unique per session, method and path | `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml` ("uq_idempotency_record_scope") |
| Stock never below zero | `backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml` ("ck_product_variant_stock") |
| Admin username unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0007-admin-user.yaml` ("uq_admin_user_username") |
| Demo username unique | `backend/services/commerce/src/main/resources/db/changelog/changes/0010-demo-access.yaml` ("uq_demo_user_username") |
| One order per payment intent | `backend/services/commerce/src/main/resources/db/changelog/changes/0011-order-payment-intent-unique.yaml` ("uq_shop_order_payment_intent") |
| Money as whole HUF in an integer column | `bigint` columns named `*_huf`, for example `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml` ("name: price_huf") |
