# Communication expectations

The contract between frontend and backend. Both sides, frontend and backend,
must satisfy the same thing.

Everything below can be derived from `openapi.yaml`; this document states what
the machine-readable spec cannot enforce on its own.

---

## Source of truth

`contracts/commerce/openapi.yaml` is the contract. If any document and the
spec file contradict each other, **the spec file is authoritative**, and the
document must be corrected.

It follows that neither the backend nor the frontend may define an endpoint,
field or status code that is not in the spec. If something is missing, the
spec is extended first.

---

## 1. Basics

- Every endpoint lives under the `/api/v1` prefix, on the same origin. The
  runtime root respects the application's base href.
- Successful response: `application/json`. Error response:
  **`application/problem+json`**.
- Money: **whole forint**, never fillér and never floating point. Every
  monetary value has the shape `{ amount, currency: "HUF" }`.
- Date and time: ISO 8601, UTC.
- Images: `Image.src` is a server-produced, **ready-to-use URL**. The client
  uses it unchanged, and never builds an image path from an identifier. This
  is what lets image serving move elsewhere later without touching the
  contract.

---

## 2. Session

The session is identified by a **cookie** issued by the server:
`mibolt_session`.

**Backend expectation.** On the first request that reaches a session-bound
endpoint without a cookie, the server issues a new one and returns it with
`Set-Cookie`. The cookie's attributes: `HttpOnly`, `Secure`, `SameSite=Lax`,
and `Max-Age` matched to the cart's lifetime (30 days). The cookie's value is
unguessable and carries no identifier or data of its own.

**Frontend expectation.** The frontend **does not** generate, store or send a
session identifier. On the same origin the browser sends the cookie on its
own; no interceptor is needed.

**Consequence.** Every tab of one browser sees the same cart. The backend
must actually guarantee this: state must not live anywhere that is a separate
instance per tab.

**Scope.** The catalogue endpoints (`/products*`) and image serving
(`/media/*`) are reachable without a session. The `/cart*`, `/checkout*`,
`/payment-intents*` and `/orders*` endpoints are session-bound.

---

## 3. Versioning and concurrency

The cart and the checkout draft share **a single common version counter**.

**Every successful mutation increases** this counter: adding a line item,
changing a quantity, deleting a line, emptying the cart, modifying the
checkout draft.

**Every affected response carries an `ETag` header**, as a quoted integer:
`ETag: "7"`. These give it: `GET /cart`, every cart mutation, `GET /checkout`,
`PATCH /checkout`.

**Every mutation requires an `If-Match` header** in the same form. If the
value does not match the server's current version, the response is
**412 Precondition Failed**, with code `CART_VERSION_CONFLICT`. Not 409 — if a
conditional request is used, a failed condition is 412 in HTTP.

**Frontend expectation.** The version must be read from the response's `ETag`
header and sent back on the next mutation. On 412 the correct behaviour: reread
the cart or the checkout, inform the user, then — if it still makes sense —
repeat the operation. It must never automatically retry with the new version
without the user's knowledge.

---

## 4. Idempotency

An `Idempotency-Key` header is **mandatory on two endpoints**:
`POST /payment-intents` and `POST /orders`. It is not needed elsewhere, and
must not be required there either.

Rules:

- The key's scope: method + path + session. Retention period 24 hours.
- The same key with the same normalised body **replays the original result**,
  **before** the server performs any state or condition check. This means
  that a resend after an uncertain response returns the order confirmation,
  not an error.
- The same key with a **different** body: **409 `IDEMPOTENCY_CONFLICT`**.

**Frontend expectation.** After an uncertain response (timeout, dropped
connection) the request must be repeated **with exactly the same key and
body**. A new key must only be generated when the user deliberately starts a
new attempt — for example trying again after a declined payment.

---

## 5. Error contract

Every error response is `application/problem+json`, per the `Problem` schema.

### 5.1 Separation of status codes

| Status | Meaning |
|---|---|
| **400** | The request is **malformed**: wrong type, missing required field, unknown query parameter. |
| **422** | The request is well-formed, but not **acceptable on business grounds**. |
| 404 | The addressed resource does not exist, **or does not belong to this session**. |
| 409 | The request conflicts with the current state. |
| 410 | The cart has expired. |
| 412 | The `If-Match` version does not match. |
| 503 | Temporary service outage. |

This separation is mandatory and consistent. An unchecked terms-and-conditions
checkbox is not 400, but **422**, because a well-formed boolean arrived.

### 5.2 The content of the error response

```json
{
  "type": "urn:mi-bolt:problem:quantity-limit",
  "title": "Quantity limit exceeded",
  "status": 409,
  "code": "QUANTITY_LIMIT",
  "detail": "Merged quantity would exceed the line maximum.",
  "traceId": "01JB8X5Q2U",
  "params": { "max": 5, "requested": 7 },
  "fieldErrors": []
}
```

- **`code`** is the machine identifier. The UI switches on this, never on the
  text of `title` or `detail`.
- **`params`** are the values to substitute into the text. Without these the
  UI cannot write a precise message ("legfeljebb 5 db rendelhető").
- **`fieldErrors`** entries are `path` (a JSON pointer into the request body)
  and `code` pairs, with optional `params`. This is how the UI knows **which
  form field** to flag.
- **`traceId`** is present in every response, searchable in the logs.

### 5.3 Error codes and their typical place

| Code | Status | When |
|---|---|---|
| `INVALID_REQUEST` | 400 | Malformed request, unknown parameter. |
| `VALIDATION_FAILED` | 422 | Business-invalid field value; `fieldErrors` populated. |
| `NOT_FOUND` | 404 | Resource that does not exist or belongs to a different session. |
| `CART_EXPIRED` | 410 | The cart has expired. |
| `CART_VERSION_CONFLICT` | 412 | `If-Match` mismatch. |
| `OUT_OF_STOCK` | 409 | The variant is sold out. |
| `QUANTITY_LIMIT` | 409 | The requested quantity exceeds the per-line maximum. |
| `PRICE_CHANGED` | 409 | The catalogue price changed; the user must see the new one. |
| `CHECKOUT_INCOMPLETE` | 422 | Missing checkout section. |
| `PAYMENT_REQUIRED` | 422 | The payment intent is `requires_action` — the shopper did not go through the payment page. |
| `PAYMENT_DECLINED` | 422 | The payment intent was declined; a new attempt is needed, with a new idempotency key. |
| `PAYMENT_PENDING` | 422 | The payment intent has not yet settled; the order cannot be finalised. |
| `PAYMENT_ALREADY_RESOLVED` | 409 | The payment intent is already in a terminal state and cannot be overwritten. |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key with a different body. |
| `SERVICE_UNAVAILABLE` | 503 | Temporary outage. |

**Expectation for both sides:** the UI must have Hungarian text for **every**
listed code. An unknown code gets a generic message, but this must be logged,
because it means the two sides have drifted apart.

---

## 6. The localisation boundary

**Error message and validation:** the server sends a code and parameters, and
the UI composes the text. `Problem.title` and `detail` are **English
developer text**, meant for logs and debugging — the user never sees it.

**Content:** product names, `highlights`, specification lines, the labels and
descriptions of delivery and payment methods, and `OrderReceipt.notice` are
**server-side data**, and arrive in Hungarian. The UI displays these
unchanged.

The boundary is simple: what is a **message** belongs to the client; what is
**data** belongs to the server.

---

## 7. Server-initiated changes

What the user requested and cannot get is an **error**. What the server
changed on its own is a **notice**.

The `Cart.notices` array carries this: `code`, optional `variantId` and
`params`. Its codes: `QUANTITY_REDUCED`, `PRICE_CHANGED`, `ITEM_REMOVED`.

**Backend expectation.** When stock drops below the quantity in the cart, the
server reduces the line's quantity and gives a notice; it leaves no
contradictory state where `quantity` is greater than `maxQuantity`.

**Frontend expectation.** The cart page must display these notices as a top
banner. Swallowing them silently is forbidden — the user would see a price or
quantity change with no explanation.

---

## 8. The whole flow

### 8.1 A purchase, on the successful path

1. `GET /products?...` — catalogue, with filters. No session needed.
2. `GET /products/{slug}` — product detail page with the full variant matrix.
   `GET /products/{slug}/related` in a separate call, for the bottom of the
   page.
3. `POST /cart/items` — `If-Match` with the current version. The response is
   the **full cart** and the new `ETag`. Adding the same variant again
   **merges** into the existing line.
4. `GET /checkout/options` — delivery and payment methods, **matched to the
   cart's value**.
5. `PATCH /checkout` — `contact`, `billing`, `delivery`, `payment` sections,
   individually or together. Only the sections sent are overwritten. Every
   successful write increases the version.
6. `GET /checkout` — the draft and the **freshly computed** summary. There is
   no separate quote step.
7. For card payment: `POST /payment-intents` — `If-Match` and
   `Idempotency-Key`. The response gives a `redirectUrl`; the user is taken
   there, chooses, then returns on the `returnUrl`. `GET /payment-intents/{id}`
   gives the result.
8. `POST /orders` — `If-Match` and `Idempotency-Key`. For card payment
   `paymentIntentId` is mandatory, for cash on delivery the field does not
   even exist. The response is **201** and the confirmation.
9. With the order, the cart closes, the draft is deleted, and the session
   **immediately gets a fresh, empty cart**. The next `GET /cart` gives an
   empty cart, not the ordered one.

### 8.2 A price change mid-flow

If the catalogue price changes before the order is finalised: the server
**atomically** refreshes the cart's prices, **increases the version**, and
gives a **409 `PRICE_CHANGED`** response to the payment or order attempt.

In this case the UI must reread the cart, show the new total, and ask for the
**user's explicit confirmation** before trying again. Silently accepting the
new total is forbidden.

### 8.3 Payment redirect

A `PaymentIntent` can take on four states: `requires_action`, `succeeded`,
`declined`, `pending`. `declined` and `pending` are **not errors**:
`POST /payment-intents` gives **201** for these too, the state is in the body.

The payment page is a **separate, small Angular application** in the
webshop's monorepo, clearly marked as a demo, under a generic name. **It must
never carry the name or branding of a real payment provider.** It offers
three outcomes: successful, declined, pending.

The full sequence:

1. `POST /payment-intents` — the shop creates the intent, and gets the
   `redirectUrl`.
2. The browser goes to the payment application with a **full page load**. The
   webshop SPA is destroyed.
3. The payment application fetches the amount with
   `GET /payment-intents/{id}`.
4. The shopper chooses, and the application reports the outcome with
   **`POST /payment-intents/{id}/outcome`**.
5. Return to the `returnUrl`, again with a full page load and a **GET**
   navigation. The webshop SPA starts from zero, and loads everything back
   from the server.
6. The shop checks the result with `GET /payment-intents/{id}`, then places
   the order.

**The `outcome` operation fires once.** If the intent is already in a
terminal state, the response is **409 `PAYMENT_ALREADY_RESOLVED`** — this
protects against a back button or a refresh overwriting a payment already
recorded. After a lost response, the intent must not be resent but queried
instead.

**This operation exists because there is no real payment provider.** In
production, the browser could never decide for itself whether its own payment
was successful; there, the provider notifies the shop behind the scenes. This
endpoint must not be carried into a production integration.

For a pending intent, the shop waits by polling; the server guarantees that
the state becomes terminal before `expiresAt`.

---

## 9. What neither side may do

- The client **does not** send a price, subtotal, total, delivery fee or
  stock data. The server does not accept such a thing from the request, even
  if it arrives.
- The client **does not** store the cart in browser storage. The only source
  of truth is the server's.
- The server **does not** send error text meant for the user.
- Neither side introduces a field, endpoint or status code that is not in the
  spec.
