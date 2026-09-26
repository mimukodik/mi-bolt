# Error model: ErrorCode, DomainException and ProblemAdvice

How a refusal becomes an `application/problem+json` response, which status each
failure gets, and what adding an error code takes. The status semantics
themselves are the contract's: `contracts/commerce/kommunikacio.md:123-190`
(§5), which `mibolt-cross-package-changes` owns.

## Contents

- [The wire shape](#the-wire-shape)
- [Throwing a refusal](#throwing-a-refusal)
- [The 26 codes](#the-26-codes)
- [What ProblemAdvice maps, and to what](#what-problemadvice-maps-and-to-what)
- [400 or 422](#400-or-422)
- [Field errors and JSON pointers](#field-errors-and-json-pointers)
- [Adding an error code](#adding-an-error-code)

## The wire shape

One class writes every error body:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`
(`@RestControllerAdvice`, `:54`). Controllers never build an error body; they
throw, or let a framework exception reach the advice (`:49-53`). A bare line
number in this section is a line of the advice. The body is the record
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemDetails.java:16-25`:

- `type`: `urn:mi-bolt:problem:` plus the kebab-case code
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java:55-72`).
- `title`: the code's default title; `status`: the HTTP status.
- `code`: the generated `ProblemCode`, taken by `ProblemCode.valueOf(code.name())`
  (`codeToWireCode` in the advice, `:364-367`), with no fallback.
- `detail`: the exception's detail, else the default title (`:335`).
- `traceId`: the id `TraceIdFilter` put on the request, also sent as the
  `X-Trace-Id` header
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/TraceIdFilter.java:28-41`).
- `params`: omitted when empty (`:337`, and the global `non_null` inclusion).
- `fieldErrors`: always present, empty when there are none (`:328-329`).

A request forwarded to `/error` (anything the controller chain did not handle)
is answered by
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemErrorController.java:27-64`:
a 404 stays `NOT_FOUND`, everything else becomes 503 `SERVICE_UNAVAILABLE`,
because the contract has no 500.

The 401 and 403 of the admin chain and the demo gate reach the same advice:
`ProblemAuthenticationEntryPoint`, `ProblemAccessDeniedHandler` and
`DemoAccessFilter` hand a `DomainException` to the MVC exception resolver
(`backend/docs/decisions/0015-admin-security-filter-chains.md`, "401 and 403
bodies"; `backend/docs/decisions/0022-demo-access-gate.md`).

## Throwing a refusal

A service throws
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/DomainException.java`,
which carries the code, a developer-facing detail, optional `params` and
optional field errors (constructors at `:22-41`). Pick the shortest
constructor that carries what the client needs:

- `new DomainException(ErrorCode.X, "detail")` when the code says it all.
- `new DomainException(ErrorCode.X, "detail", Map.of(...))` when the client
  interpolates values, as `QUANTITY_LIMIT` does with `max` and `requested`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:102-106`).
- The five-argument form when the refusal points at a request field or wraps
  a cause, as the terms check does
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java:126-135`).

The detail text is English; the rule and its one exception belong to
`mibolt-backend-code-standards`.

## The 26 codes

`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java:12-37`,
the same set and order as the contract's `ProblemCode`
(`contracts/commerce/openapi.yaml:2315`).

| Status | Codes |
|---|---|
| 400 | `INVALID_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `CSRF_TOKEN_INVALID` |
| 404 | `NOT_FOUND` |
| 409 | `OUT_OF_STOCK`, `QUANTITY_LIMIT`, `PRICE_CHANGED`, `PAYMENT_ALREADY_RESOLVED`, `IDEMPOTENCY_CONFLICT`, `USERNAME_TAKEN`, `ADMIN_SELF_DELETE`, `LAST_ADMIN`, `VARIANT_IN_CART`, `FEATURED_LIMIT`, `CATALOG_CONSTRAINT_CONFLICT` |
| 410 | `CART_EXPIRED` |
| 412 | `CART_VERSION_CONFLICT`, `PRODUCT_VERSION_CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `VALIDATION_FAILED`, `CHECKOUT_INCOMPLETE`, `PAYMENT_DECLINED`, `PAYMENT_PENDING`, `PAYMENT_REQUIRED` |
| 428 | `PRECONDITION_REQUIRED` |
| 503 | `SERVICE_UNAVAILABLE` |

`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/problem/ErrorCodeTest.java:28-53`
pins `ErrorCode` and the generated `ProblemCode` to the same names in both
directions and pins the count to 26.

## What ProblemAdvice maps, and to what

Line ranges are in
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`.

| Exception | Answer | Lines |
|---|---|---|
| `DomainException` | its own code and status | `:76-79` |
| `HttpMessageNotReadableException`, including a body member the contract does not declare | 400 `INVALID_REQUEST` | `:81-88` |
| `MissingServletRequestParameterException` | 400, `params.parameter` | `:90-96` |
| `MissingRequestHeaderException`, such as a missing `If-Match` on a shop write | 400, `params.header` | `:98-104` |
| `UnknownQueryParameterException` | 400, `params.parameter` | `:106-112` |
| `MethodArgumentTypeMismatchException` | 400, `params.parameter` and `params.reason` | `:114-121` |
| `HttpRequestMethodNotSupportedException` | 405 with code `INVALID_REQUEST` and an `Allow` header | `:123-133` |
| `HttpMediaTypeNotSupportedException` | 415 with code `INVALID_REQUEST` | `:135-142` |
| `HttpMediaTypeNotAcceptableException` | 406 with code `INVALID_REQUEST` | `:144-154` |
| `MethodArgumentNotValidException` (body bean validation) | 400 when a member is missing, else 422 `VALIDATION_FAILED` | `:156-183` |
| `HandlerMethodValidationException` (query or path parameter) | 400, `params.parameter` and `params.reason`, no field errors | `:185-212` |
| `ConstraintViolationException` (method validation on a generated interface) | 400, or 404 `NOT_FOUND` for an invalid product `slug` | `:214-243` |
| `NoResourceFoundException` | 404 `NOT_FOUND` | `:245-249` |
| `MaxUploadSizeExceededException` | 413 `PAYLOAD_TOO_LARGE`, `params.maxBytes` | `:251-266` |
| `MissingServletRequestPartException` | 400, `params.part` | `:268-277` |
| `MultipartException` | 400 | `:279-292` |
| any other `Throwable` | 503 `SERVICE_UNAVAILABLE` | `:294-301` |

The unknown body member reaches the advice because
`spring.jackson.deserialization.fail-on-unknown-properties=true`
(`backend/services/commerce/src/main/resources/application.properties:13-19`).
Unknown query parameters are caught by
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/UnknownQueryParameterInterceptor.java:18-30`,
because Spring ignores them by default. The log level of each branch belongs
to `mibolt-backend-code-standards`.

## 400 or 422

The contract separates a malformed request (400) from a well-formed one that
fails on business grounds (422): `contracts/commerce/kommunikacio.md:127-140`.
In this service that becomes, with the advice's lines in
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`:

- A missing required body member (`@NotNull`, reported as `REQUIRED`) is 400
  `INVALID_REQUEST`; every other body validation failure is 422
  `VALIDATION_FAILED` (`:156-183`).
- A wrong query or path parameter is always 400, never 422 (`:185-212`).
- A business refusal the service decides is 422 with field errors, even for a
  well-formed boolean: `acceptedTerms: false` is 422 at `/acceptedTerms`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java:126-129`).
- The admin write API applies the same split in three stages, bean
  validation, then `AdminProductValidator`, then database rules
  (`backend/docs/decisions/0020-admin-catalogue-write-api.md:17-23`).

## Field errors and JSON pointers

Each field error is a JSON pointer into the request body plus a code
(`contracts/commerce/kommunikacio.md:142-165`, §5.2):

- The pointer comes from `ProblemAdvice.toJsonPointer` (`:369-394`), RFC 6901:
  dots and `[n]` become `/`. A class-level (cross-field) error points at `/`
  (`:175-177`).
- The code is the constraint's simple name in upper case (`:433-440`), with
  `NotNull` reported as `REQUIRED`, and a `@Pattern` on `phone` or
  `postalCode` reported as `PHONE_FORMAT` or `POSTAL_CODE_FORMAT`
  (`:61-64`, `:442-450`).
- A service builds its own with `new FieldError(pointer, code)` from the
  generated model, as `CheckoutService.validateUpdate` does
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java:124-168`).

## Adding an error code

The code is a contract value first, so the change starts in
`mibolt-cross-package-changes` and comes back here:

1. The contract's `ProblemCode` enum gains the value, and the kommunikacio.md
   §5.3 table names where it occurs (`mibolt-cross-package-changes`).
2. The backend stubs regenerate on the next compile, or with
   `mise run //backend:api:generate`.
3. Add the constant to `ErrorCode` with its status and an English default
   title, keeping the contract's order, which the enum follows today.
4. Raise the pinned count in `ErrorCodeTest`
   (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/problem/ErrorCodeTest.java:50-53`),
   and give the new code a row in its parameterised status test (`:55-74`).
5. Throw it from the owning service with the `params` the contract documents.
6. Add an API test that asserts the status, `$.code`, the `params` and
   `validAgainstContract()`, the assertion the testing reference describes.
7. Record the decision if the code implements a choice the requirement docs
   did not make (SKILL.md section 5).

An `ErrorCode` constant with no matching `ProblemCode` fails `ErrorCodeTest`,
and thrown at run time it would make `ProblemCode.valueOf` throw inside the
advice itself.
