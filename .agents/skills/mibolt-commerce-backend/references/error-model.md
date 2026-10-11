# Error model: ErrorCode, DomainException and ProblemAdvice

How a refusal becomes an `application/problem+json` response, which status each
failure gets, and what adding an error code takes. The status semantics
themselves are the contract's: `contracts/commerce/kommunikacio.md` ("5. Error contract")
(§5), which `mibolt-cross-package-changes` owns.

## Contents

- [The wire shape](#the-wire-shape)
- [Throwing a refusal](#throwing-a-refusal)
- [The 27 codes](#the-27-codes)
- [What ProblemAdvice maps, and to what](#what-problemadvice-maps-and-to-what)
- [400 or 422](#400-or-422)
- [Field errors and JSON pointers](#field-errors-and-json-pointers)
- [Adding an error code](#adding-an-error-code)

## The wire shape

One class writes every error body:
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`
(`@RestControllerAdvice`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "@RestControllerAdvice"). Controllers never build an error body; they
throw, or let a framework exception reach the advice (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "Single source of {@code application/problem+json} responses"). The body is the record
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemDetails.java` ("public record ProblemDetails("):

- `type`: `urn:mi-bolt:problem:` plus the kebab-case code
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java`, "public String problemTypeUri()").
- `title`: the code's default title; `status`: the HTTP status.
- `code`: the generated `ProblemCode`, taken by `ProblemCode.valueOf(code.name())`
  (`codeToWireCode` in the advice, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "private static ProblemCode codeToWireCode"), with no fallback.
- `detail`: the exception's detail, else the default title (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "detail == null ? code.defaultTitle() : detail").
- `traceId`: the id `TraceIdFilter` put on the request, also sent as the
  `X-Trace-Id` header
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/TraceIdFilter.java`, "doFilterInternal").
- `params`: omitted when empty (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "(params == null || params.isEmpty()) ? null : params", and the global `non_null` inclusion).
- `fieldErrors`: always present, empty when there are none (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "fieldErrors == null ? List.of() : fieldErrors").

A request forwarded to `/error` (anything the controller chain did not handle)
is answered by
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemErrorController.java` ("A 404 keeps its status and uses NOT_FOUND"):
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
optional field errors (constructors at `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/DomainException.java`, "public DomainException("). Pick the shortest
constructor that carries what the client needs:

- `new DomainException(ErrorCode.X, "detail")` when the code says it all.
- `new DomainException(ErrorCode.X, "detail", Map.of(...))` when the client
  interpolates values, as `QUANTITY_LIMIT` does with `max` and `requested`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "ErrorCode.QUANTITY_LIMIT").
- The five-argument form when the refusal points at a request field or wraps
  a cause, as the terms check does
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`, "if (!acceptedTerms)").

The detail text is English; that rule belongs to
`mibolt-backend-code-standards`.

## The 27 codes

`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java` ("public enum ErrorCode"),
the same name set as the contract's `ProblemCode`
(`contracts/commerce/openapi.yaml`, "ProblemCode:").

| Status | Codes |
|---|---|
| 400 | `INVALID_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `CSRF_TOKEN_INVALID` |
| 404 | `NOT_FOUND` |
| 409 | `OUT_OF_STOCK`, `QUANTITY_LIMIT`, `PRICE_CHANGED`, `PAYMENT_ALREADY_RESOLVED`, `IDEMPOTENCY_CONFLICT`, `USERNAME_TAKEN`, `ADMIN_SELF_DELETE`, `LAST_ADMIN`, `VARIANT_IN_CART`, `FEATURED_LIMIT`, `CATALOG_CONSTRAINT_CONFLICT` |
| 410 | `CART_EXPIRED` |
| 412 | `CART_VERSION_CONFLICT`, `PRODUCT_VERSION_CONFLICT`, `APPEARANCE_VERSION_CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `VALIDATION_FAILED`, `CHECKOUT_INCOMPLETE`, `PAYMENT_DECLINED`, `PAYMENT_PENDING`, `PAYMENT_REQUIRED` |
| 428 | `PRECONDITION_REQUIRED` |
| 503 | `SERVICE_UNAVAILABLE` |

`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/problem/ErrorCodeTest.java` ("class ErrorCodeTest")
pins `ErrorCode` and the generated `ProblemCode` to the same names in both
directions and pins the count to 27.

## What ProblemAdvice maps, and to what

| Exception | Answer | Handler |
|---|---|---|
| `DomainException` | its own code and status | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleDomain") |
| `HttpMessageNotReadableException`, including a body member the contract does not declare | 400 `INVALID_REQUEST` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleUnreadable") |
| `MissingServletRequestParameterException` | 400, `params.parameter` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleMissingParam") |
| `MissingRequestHeaderException`, such as a missing `If-Match` on a shop write | 400, `params.header` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleMissingHeader") |
| `UnknownQueryParameterException` | 400, `params.parameter` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleUnknownQueryParameter") |
| `MethodArgumentTypeMismatchException` | 400, `params.parameter` and `params.reason` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleTypeMismatchParam") |
| `HttpRequestMethodNotSupportedException` | 405 with code `INVALID_REQUEST` and an `Allow` header | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleMethodNotSupported") |
| `HttpMediaTypeNotSupportedException` | 415 with code `INVALID_REQUEST` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleMediaTypeNotSupported") |
| `HttpMediaTypeNotAcceptableException` | 406 with code `INVALID_REQUEST` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleMediaTypeNotAcceptable") |
| `MethodArgumentNotValidException` (body bean validation) | 400 when a member is missing, else 422 `VALIDATION_FAILED` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleBodyValidation") |
| `HandlerMethodValidationException` (query or path parameter) | 400, `params.parameter` and `params.reason`, no field errors | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleHandlerValidation") |
| `ConstraintViolationException` (method validation on a generated interface) | 400, or 404 `NOT_FOUND` for an invalid product `slug` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleConstraintViolation") |
| `NoResourceFoundException` | 404 `NOT_FOUND` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleNotFound") |
| `MaxUploadSizeExceededException` | 413 `PAYLOAD_TOO_LARGE`, `params.maxBytes` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleUploadTooLarge") |
| `MissingServletRequestPartException` | 400, `params.part` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleMissingPart") |
| `MultipartException` | 400 | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleMalformedMultipart") |
| any other `Throwable` | 503 `SERVICE_UNAVAILABLE` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java` ("handleUnexpected") |

The unknown body member reaches the advice because
`spring.jackson.deserialization.fail-on-unknown-properties=true`
(`backend/services/commerce/src/main/resources/application.properties`, "spring.jackson.deserialization.fail-on-unknown-properties").
Unknown query parameters are caught by
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/UnknownQueryParameterInterceptor.java` ("Rejects requests whose query parameters include names"),
because Spring ignores them by default. The log level of each branch belongs
to `mibolt-backend-code-standards`.

## 400 or 422

The contract separates a malformed request (400) from a well-formed one that
fails on business grounds (422): `contracts/commerce/kommunikacio.md` ("5.1 Separation of status codes").
In this service that becomes:

- A missing required body member (`@NotNull`, reported as `REQUIRED`) is 400
  `INVALID_REQUEST`; every other body validation failure is 422
  `VALIDATION_FAILED` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "handleBodyValidation").
- A wrong query or path parameter is always 400, never 422 (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "handleHandlerValidation").
- A business refusal the service decides is 422 with field errors, even for a
  well-formed boolean: `acceptedTerms: false` is 422 at `/acceptedTerms`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`, "Terms must be accepted").
- The admin write API applies the same split in three stages, bean
  validation, then `AdminProductValidator`, then database rules
  (`backend/docs/decisions/0020-admin-catalogue-write-api.md`, "each answered whole").

## Field errors and JSON pointers

Each field error is a JSON pointer into the request body plus a code
(`contracts/commerce/kommunikacio.md`, "5.2 The content of the error response", §5.2):

- The pointer comes from `ProblemAdvice.toJsonPointer` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "static String toJsonPointer"), RFC 6901:
  dots and `[n]` become `/`. A class-level (cross-field) error points at `/`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "getGlobalErrors()").
- The code is the constraint's simple name in upper case (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "private static String constraintCode"), with
  `NotNull` reported as `REQUIRED`, and a `@Pattern` on `phone` or
  `postalCode` reported as `PHONE_FORMAT` or `POSTAL_CODE_FORMAT`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "Map<String, String> PATTERN_CODES = Map.of("; `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "private static String fieldCode").
- A service builds its own with `new FieldError(pointer, code)` from the
  generated model, as `CheckoutService.validateUpdate` does
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java`, "private void validateUpdate").

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
   (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/problem/ErrorCodeTest.java`, "pins {@link ErrorCode#values()} length to"),
   and give the new code a row in its parameterised status test (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/problem/ErrorCodeTest.java`, "static Stream<Arguments> newCodeStatus()").
5. Throw it from the owning service with the `params` the contract documents.
6. Add an API test that asserts the status, `$.code`, the `params` and
   `validAgainstContract()`, the assertion the testing reference describes.
7. Record the decision if the code implements a choice the requirement docs
   did not make (SKILL.md section 5).

An `ErrorCode` constant with no matching `ProblemCode` fails `ErrorCodeTest`,
and thrown at run time it would make `ProblemCode.valueOf` throw inside the
advice itself.
