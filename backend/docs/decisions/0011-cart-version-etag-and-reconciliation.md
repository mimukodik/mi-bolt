# 0011 — Cart: shared state version, ETag/If-Match, reconciliation

## Situation

T5 ships the five cart operations of the contract on top of the T2 session
and the T4 catalogue: `GET /cart`, `POST /cart/items`, `PATCH /cart/items/{variantId}`,
`DELETE /cart/items/{variantId}`, `DELETE /cart/items`. The contract couples
`version` to a shared checkout-draft state and asks for an `ETag` on every
response, an `If-Match` on every mutation, and a reconciliation pass that
reports stock and price changes the server made on its own. `docs/02-backend.md`
§4.2 (rules 13–22), §4.6 and §5 fix the behaviour: one line per variant,
`maxQuantity = min(stock, 5)`, every successful mutation bumps the version
once and pushes `expires_at` on the session and the cart, expiry is reported
once and creates a fresh empty cart on the next request.

## Options

1. A dedicated `version` column on the cart, incremented by the cart code
   alone, with `ETag` mirroring it. The cart owns its own optimistic
   concurrency token.
2. The session's `state_version` column, shared with the checkout draft.
   `ETag` mirrors that column, and the cart code reads and bumps it through
   the session.

## Decision

Take option 2. The contract names `version` as "shared with the checkout
draft and mirrored by the ETag" (`api/openapi.yaml` line 92), so the cart
inherits the same number the checkout draft will and a single column on the
session is the natural source. `CartService` reads the session through
`ShopSessionRepository` on every request, so there is one place the bump
happens; the cart's own row stores no version, only the lifetime.

- `ETag = "<state_version>"`. The value is a single ASCII string for the
  `state_version` of the session the request bound to, with the literal
  double-quote characters the contract requires for the `If-Match` round
  trip.
- `If-Match` is required on every mutation. `CartService.expectVersion`
  parses the quoted value and compares it to `session.getStateVersion()`
  before any service method that mutates the cart. A mismatch returns
  `412 CART_VERSION_CONFLICT` with `params.expected = session.getStateVersion()`
  and `params.received = <the parsed value>`.
- Every successful mutation bumps the version once and pushes `expires_at`
  on the session and the cart by 30 days. The session gets a new
  `state_version` and a new `expires_at`; the cart gets a new `expires_at`.
  A `GET /cart` that produced no notices and made no change does not bump.
- A notice counts as a change. The reconciliation pass runs on every
  request and produces zero or more `CartNotice` entries:
  - a variant whose stock dropped below the line quantity → `QUANTITY_REDUCED`
    with `params.from` and `params.to`,
  - a variant whose stock reached zero → `ITEM_REMOVED` with `params.quantity`,
  - a variant whose catalogue price differs from the snapshot → `PRICE_CHANGED`
    with `params.from` and `params.to`.
  Each notice triggers the same single bump.
- `maxQuantity = min(stock, 5)`. The constant lives on `CatalogService`
  (see 0008) and is the value the contract reports; `CartItem.maxQuantity`
  is the per-line cap.
- A merged quantity over the maximum is `409 QUANTITY_LIMIT` with
  `params.max` and `params.requested`, never silently truncated.
- A `DELETE /cart/items/{variantId}` for a variant that exists in the
  catalogue but is no longer in the cart returns `200` with the current cart
  and does not bump the version, because the requested end state already
  holds. A variant unknown to the catalogue is `404 NOT_FOUND` with
  `params.variantId`.
- An expired cart is deleted on the next request and reported `410
  CART_EXPIRED` once. The request after that — issued without any change to
  the cookie — receives a fresh empty cart with a new `id`; its `version` is
  the session's current `state_version`, which expiry does not reset, so it
  is `1` only for a session that never mutated its cart.
- One line per variant is guarded by the database-level unique constraint
  `uq_cart_item_cart_variant`.

## Consequences

The session cookie's `Max-Age` is static (30 days from issue), while the
server-side expiry slides with every successful mutation. The cookie filter
issues a `Set-Cookie` only when no valid cookie is present
(`SessionCookieFilterTest.firstSessionScopedRequestSetsCookieWithFullAttributes`
and `twoRequestsWithTheSameCookieSeeTheSameSession`), so a shopper who
keeps making changes does not get a second cookie even though their
server-side cart keeps sliding. Acceptable for the demo MVP: a logged-in
shopper with no activity would still lose the cart at the cookie's
`Max-Age`, while an active shopper's server-side expiry keeps walking
forward.

Money is `int` HUF on the wire and `long` HUF on the entity. The mapper
in `CartModels` does the narrowing conversion with `Math.toIntExact`, so a
future change above the `Money.amount` max would fail loudly at the
controller boundary rather than silently wrapping.

Test counts after this unit: 144 unit tests (`./gradlew test`) and 118
integration tests (`./gradlew integrationTest`).

## Date and status

2026-09-20 — Accepted.

## Sources

- `api/openapi.yaml` lines 266–466 and 944–999 (cart endpoints, `Cart`
  schema, `CartNotice`, `CartNoticeCode`, `AddCartItemRequest`,
  `SetCartItemQuantityRequest`).
- `docs/02-backend.md` §4.2, §4.6, §5.
- `docs/04-adatbazis.md` §4.