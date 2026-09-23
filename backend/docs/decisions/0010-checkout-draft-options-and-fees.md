# 0010 — Checkout draft, options and fees

## Situation

T6 ships `GET /checkout/options`, `GET /checkout` and `PATCH /checkout`
on top of the T5 cart: the persistent draft, the option set and the fees
the front-end needs to render the form and the summary the user sees
before the order is placed. `docs/02-backend.md` §4.3 rules 23–29 fix
the behaviour (one draft per cart, sections merge, summary recomputed,
selection that is not available for the cart value is rejected with
`DELIVERY_OPTION_UNAVAILABLE` / `PAYMENT_METHOD_UNAVAILABLE`, home
delivery needs an address, pickup drops it) but explicitly leave the
fee numbers and the thresholds to the implementation. T6 also lands a
two-entry map in `ProblemAdvice` that translates the generic `PATTERN`
constraint code into the contract-named `PHONE_FORMAT` and
`POSTAL_CODE_FORMAT` for the two `@Pattern` fields the checkout forms
carry; the contract's 422 example names them explicitly
(`api/openapi.yaml` lines 552–573).

## Options considered for the draft

1. **A single JSON column per section** (`contact_json`,
   `billing_json`, `delivery_json`, `payment_json`).
2. **Normalised nullable column groups in one `checkout_draft` row per
   cart** (the chosen approach): every section key column is nullable,
   a section is present when its key column is non-null, and the row
   carries the `created_at` / `updated_at` timestamps.

Decision (2): the sections are small and flat, JPA validates every
column (`ddl-auto=validate` in `application.properties`), and the
post-mortem on a failed order is a plain `SELECT` without a JSON
parser. Option (1) reads cleanly on the entity but pushes validation
into a string-only column and makes a regression in one field invisible
to the Liquibase check that already runs on every build.

## Decision

Take option 2 for the draft. The implementation lives in
`com.example.mi_bolt_backend.checkout` (entity, repository, service,
controller, mapper) and reads as follows:

- **One draft per cart, keyed by `cart_id`.** The `cart_id` column is
  unique and carries `cascade = REMOVE`, so the draft lives and dies
  with the cart (rule 23) and rides the cart's `410 CART_EXPIRED` on
  the next request — there is no separate draft expiry path.
- **The `version` and `ETag`/`If-Match` are the session's shared
  counter** (the column the cart already bumps, decision 0011). The
  controller mirrors `view.version()` as the `ETag` and calls
  `CheckoutService.expectVersion(session, ifMatch)` before every
  mutation; `CheckoutService.getOptions` is a pure read and carries no
  `ETag`.
- **`PATCH /checkout` merges sections.** A null section in the
  request body is "not sent", the others are validated and written;
  every successful PATCH bumps the version once. An empty PATCH
  (`{}`) is `422 VALIDATION_FAILED` with `fieldErrors[0].path = "/"`
  and `fieldErrors[0].code = "MIN_PROPERTIES"`, enforced by the
  service (`validateUpdate`).
- **The summary is recomputed on every read** from the cart subtotal
  and the selected delivery/payment options (rule 28). There is no
  separate quote step: a price change between PATCH and order is the
  one the order call reads.
- **`complete` is `true` when every required section is present and
  the cart is non-empty** (rule 25). The four sections are `contact`,
  `billing`, `delivery`, `payment`; an empty cart produces `complete =
  false` even when every section is filled. A stored delivery option or
  payment method that the current cart makes unavailable (the cart was
  emptied, or grew past the cash-on-delivery cap) contributes no fee
  to the summary and makes `complete = false`; the section itself
  stays on the draft so the shopper can see what to change.
- **A selection that is not available for the current cart value is
  `422 VALIDATION_FAILED`** with `DELIVERY_OPTION_UNAVAILABLE` or
  `PAYMENT_METHOD_UNAVAILABLE` and `params.reason` set to the
  option's `unavailableReason` (`CART_EMPTY`,
  `CART_VALUE_TOO_HIGH`).
- **`home_delivery` needs an address**; `pickup_point` clears it (rule
  27). The mapper in `CheckoutModels` decides between
  `HomeDeliverySelection` and `PickupPointSelection` by the option id
  and surfaces the address only when the option carries one.
- **`PHONE_FORMAT` and `POSTAL_CODE_FORMAT` are produced by a
  two-entry map in `ProblemAdvice`** keyed by the leaf field name.
  The map lives next to the `PROBLEM_JSON` constant and is read by
  `fieldCode(ObjectError, String)` (inserted into the
  `handleBodyValidation` field loop in place of `constraintCode`).
  The helper takes the error and the Spring field path, returns the
  generic code unchanged unless it is `PATTERN`, and substitutes the
  contract-named code when the leaf matches.

The fees and thresholds are configuration under `mibolt.checkout.*`
(`application.properties`):

| Property                                          | Value     |
| ------------------------------------------------- | --------: |
| `mibolt.checkout.home-delivery-fee-huf`           | `1490`    |
| `mibolt.checkout.pickup-fee-huf`                  | `990`     |
| `mibolt.checkout.free-shipping-threshold-huf`     | `30000`   |
| `mibolt.checkout.card-fee-huf`                    | `0`       |
| `mibolt.checkout.cash-on-delivery-fee-huf`        | `490`     |
| `mibolt.checkout.cash-on-delivery-max-cart-huf`   | `300000`  |
| `mibolt.checkout.terms-version`                   | `2026-09` |

Both delivery fees drop to zero at or above the free-shipping
threshold; COD is unavailable above the COD cap with
`CART_VALUE_TOO_HIGH`; every option is unavailable on an empty cart
with `CART_EMPTY`; `NOT_AVAILABLE_FOR_ITEMS` is never produced.

**These numbers were chosen on 2026-09-20 as demo defaults and
accepted by the issue owner the same day; changing them is a properties
edit.** A future issue that wants different numbers edits
`application.properties` and adds a comment pointing at this record.

## Consequences

- No price lock, no separate quote step: the price the order endpoint
  reads is the price the user saw on the previous `GET /checkout`.
- The draft survives reloads and tab switches and is cleared with the
  cart at order time (T7).
- The `ProblemAdvice.PATTERN_CODES` map is the only place that names
  a field-level contract code; adding a third `@Pattern` field the
  contract names explicitly is a one-line map edit plus a
  ProblemAdviceTest case, not a sweep.
- Test counts after this unit: 169 unit tests (`./gradlew test`) and
  137 integration tests (`./gradlew integrationTest`).

## Date and status

2026-09-20 — Accepted; the fee values were confirmed by the issue
owner on 2026-09-20.

## Sources

- `api/openapi.yaml` lines 467–574 (the three checkout endpoints) and
  lines 1666–1917 (`CheckoutOptions`, `DeliveryOption`,
  `PaymentMethodOption`, `CheckoutSession`, `Contact`,
  `BillingDetails`, `Address`, `HomeDeliverySelection`,
  `PickupPointSelection`, `PaymentSelection`, `UnavailableReason`,
  `UpdateCheckoutRequest`, `CheckoutSummary`).
- `docs/02-backend.md` §4.3 rules 23–29.
- `docs/04-adatbazis.md` §4 (`checkout_draft` table, `cart_id` unique
  constraint with cascade).