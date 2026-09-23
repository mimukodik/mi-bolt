# 0004 — Contract validator, JaCoCo gate, context path and JSON inclusion

## Situation

Four cross-cutting choices need a written-down rationale so the next session
can argue with them rather than guess: the contract validator that
API tests run every response against, the JaCoCo coverage gate, the
`server.servlet.context-path` that drives the generated `@RequestMapping`
paths, and the `spring.jackson.default-property-inclusion=non_null` setting.

## Options

### Contract validator

1. **`com.atlassian.oai:openapi-request-validator-mockmvc:3.0.0`** +
   `OpenApiValidationMatchers.openApi().isValid(...)`. The 3.0.0 release is
   the project under its new coordinates (it was `swagger-request-validator`
   before) and ships OpenAPI 3.1 support including `unevaluatedProperties`,
   Spring 7 / Boot 4, JDK 21.
2. **Hand-roll a response validator.** Brittle, no schema awareness,
   duplicates `api/openapi.yaml`.
3. **Skip contract validation.** Tests would not catch a body the
   contract forbids until an integration test fails.

The `MockMvc` matcher class lives at
`com.atlassian.oai.validator.mockmvc.OpenApiValidationMatchers.openApi()`
in the mockmvc artifact; the matcher method is `isValid(String)` or
`isValid(OpenApiInteractionValidator)`. An interaction validator is built
with `OpenApiInteractionValidator.createForInlineApiSpecification(spec).build()`
because the `createForSpecificationUrl("classpath:...")` form goes through
the embedded swagger-parser which cannot find the file on the test
classpath under OAS 3 in this version.

### Coverage gate

1. **JaCoCo Gradle plugin (built into Gradle 9.7.1), 90 % line coverage on
   hand-written code.** Exclude the generated `api/**` tree and
   `MiBoltBackendApplication.class` (its `main` never runs under tests).
2. **No gate, or a percentage based on the full class set.** Either the
   generated code inflates the denominator or the gate is a report nobody
   reads.

### Context path

1. **`server.servlet.context-path=/api/v1`** so every generated
   `@RequestMapping` (relative) lives under the contract's `/api/v1`
   server URL.
2. **Strip the prefix per route.** More moving parts, no upside over
   Spring's built-in context-path support.

### JSON inclusion

1. **`spring.jackson.default-property-inclusion=non_null`.** Absent
   optional members are omitted from the wire body, the OpenAPI
   `required` set is the only authority on what is present.
2. **`always`** or **`non_absent`** — both serialise every present member
   even when null, which makes responses larger than the contract allows.

## Decision

Take option 1 in all four.

- Contract validator: `Files.readString(Path.of("api/openapi.yaml"))` from
  the project working directory; `api/openapi.yaml` is the single source
  and is loaded the same way in Gradle and the IDE. The helper builds the
  validator inline with `createForInlineApiSpecification(spec)`; the
  matcher is `openApi().isValid(validator)`.
- Coverage: the gate is in `build.gradle` as a `violationRules.rule` with
  `counter = 'LINE'`, `value = 'COVEREDRATIO'`, `minimum = 0.90`. The
  exclusion list (`com/example/mi_bolt_backend/api/**`,
  `**/MiBoltBackendApplication.class`) is applied to both
  `jacocoTestReport` and `jacocoTestCoverageVerification` so the
  verification rule sees the same scope as the report. `check` depends
  on `jacocoTestCoverageVerification` so the gate runs on `./gradlew check`,
  not only `./gradlew build`.
- Context path: `/api/v1`. The `servers` block in the contract puts every
  operation under that prefix; Spring's context-path matches it without
  any per-route stripping.
- JSON inclusion: `non_null`. Spring Boot 4.1.1 honours
  `spring.jackson.default-property-inclusion` (a 4.0.0 regression that
  silently ignored the property was fixed in 4.0.1).
- Validation policy (per docs/01 §5.1 and docs/02 §4.1/9): bean-validation
  on a request body returns 422 VALIDATION_FAILED with `fieldErrors[]`;
  bean-validation on a query or path parameter returns 400
  INVALID_REQUEST with `params.parameter` and `params.reason`. Formally
  wrong query input is a client error, not a business rejection.
- HTTP semantics outside the contract (405 method-not-allowed, 406
  not-acceptable, 415 unsupported-media-type) are part of framework-level
  HTTP behaviour and stay as separate handlers. The body keeps the
  Problem shape with `code: INVALID_REQUEST`. Contract validation only
  applies to the responses each operation declares — those framework
  status codes are not in any operation's `responses` block, so
  `validAgainstContract()` is never applied to them.

The gate proof the orchestrator asked for: with `minimum = 1.0` in a
scratch copy, the rule violates at 0.9 — `Rule violated for bundle
mi-bolt-backend: lines covered ratio is 0.9, but expected minimum is 1.0`.
Restoring `0.90` makes `./gradlew clean check` exit 0.

## Consequences

**Wins.**
- API tests fail with a precise contract-level message when a response
  drifts, before the smoke sequence can. A drift shows up on the
  developer's machine, not on the orchestrator's review pass.
- The coverage gate stops a hand-written class from rotting below 90 %
  in code review without anyone noticing. The exclusion list keeps
  generated sources out of the denominator, so the gate measures what
  the developer writes, not what the generator emits.

**Costs.**
- A future change that genuinely requires a generated class to be
  exercised directly (and not just via a generated interface) would
  need a new exclusion decision recorded here.
- Strict request validation in the contract validator rejects
  underscore paths and any other shape that does not appear in the
  contract. Fixture controllers are therefore deliberately outside
  the contract: a request to `/cart/__probe` or `/throw/__domain` is
  not a valid request to any contract operation and `validAgainstContract()`
  must never be applied to fixture paths. The accepted path the
  validator is exercised against is `/products/nope`, which matches the
  contract's `/products/{slug}` schema and returns a 404 problem+json.
  When a future task adds a contract-validating test, the test must
  pick a path the contract allows.

## Date and status

2026-09-19 — Valid.

## Sources

- https://github.com/atlassian/openapi-request-validator — validator
  project; 3.0.0 release; `com.atlassian.oai:openapi-request-validator-mockmvc:3.0.0`.
- https://docs.gradle.org/9.7.1/userguide/jacoco_plugin.html — JaCoCo
  plugin in Gradle 9.7.1 and `violationRules` reference.
- https://docs.spring.io/spring-boot/reference/features/json.html —
  Jackson 3 configuration and the `default-property-inclusion` property.
- https://docs.spring.io/spring-boot/how-to/data-initialization.html —
  the contract server URL `/api/v1` is the OpenAPI `servers[0].url`
  field; Spring's `server.servlet.context-path` is the matching
  configuration surface.

## Amendment 2026-09-20: per-class floor

Beside the bundle rule (LINE ≥ 0.90) a second JaCoCo rule requires LINE ≥ 0.80
on every class, with the same exclusions (generated `api/**`, the application
class). A new class can no longer land half-tested while the bundle stays
green. The earlier manual "every changed line covered" rule is retired: this
is a demo MVP and the per-line hunt cost more than it caught.

## Note: paths after the monorepo move (MIM-411)

- `api/openapi.yaml` is now `contracts/commerce/openapi.yaml` at the git root; the build reads it as `../../../contracts/commerce/openapi.yaml` from `backend/services/commerce/`.
- The contract validator now reads `Path.of("../../../contracts/commerce/openapi.yaml")` (`ContractValidation.java`).
- The `docs/0N` citations above refer to the same files under `backend/docs/`.
- `docs/01-kommunikacio.md` (`docs/01`) is now `contracts/commerce/kommunikacio.md`.
