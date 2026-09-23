# 0001 — OpenAPI server generation with the org.openapi.generator plugin

## Situation

`api/openapi.yaml` is the contract; the backend must implement it from generated
interfaces and DTOs (see `docs/02-backend.md` §2 and §3). The release is on
Spring Boot 4.1.1, Gradle 9.7.1, Java 21, with the `spring-boot-starter-webmvc`,
`spring-boot-starter-data-jpa` and `spring-boot-starter-validation` starters.
T1 needs a working server stub: the compile must pass, all 17 operations must
have an interface, and the two `oneOf` + discriminator unions
(`DeliverySelection` → `home_delivery` / `pickup_point`,
`OrderRequest` → `card` / `cash_on_delivery`) must deserialise to the right
subtype.

## Options

1. **`org.openapi.generator` Gradle plugin, `spring` generator, plain copy
   of the spec.** Drop the plugin into `build.gradle`, point it at
   `api/openapi.yaml`, wire the generated sources into the main source set.
2. **`openapi-processor-spring` (`openapiprocessor.io`).** Promoted as a
   native OpenAPI 3.1 generator with first-class `oneOf` handling. Checked
   against this contract: it emits `Object` or an empty marker interface for
   `oneOf` and produces no `@JsonTypeInfo` / `@JsonSubTypes`, so neither union
   is usable for type-safe Jackson deserialisation.
3. **Build-time spec mutation.** Feed the generator a derived copy of the
   spec under `build/openapi/openapi.yaml` in which four single-value-enum
   discriminator properties are flattened to plain `type: string`. The
   generator then emits a parent interface with `String getOptionId()` and
   subtypes that also return `String getOptionId()`, which compiles.
4. **Wait for the plugin fix.** Upstream PR #24812 (merged 2026-09-06,
   milestone 7.26.0, due 2026-09-24) closes the bug but no Gradle-plugin
   snapshot has been published.

The compile error is upstream bug
[#24959](https://github.com/OpenAPITools/openapi-generator/issues/24959):
with `useOneOfInterfaces=true` (the spring default) the interface gets
`String getX()` and each child gets an `XEnum getX()`. A local matrix of
five configOption combinations was run on 2026-09-19; the table below
records the result. Only `useOneOfInterfaces=false` compiles, and that
produces standalone concrete classes (not a true parent/child hierarchy).
Every other 7.25.0 combination leaves the parent/child mismatch in place.

| Row | Options on top of the five base | Compiled | Parent kind | Parent getter | Child getter | Annotations on parent |
| --- | --- | --- | --- | --- | --- | --- |
| A | none (baseline) | no | interface | `String getOptionId()` | `OptionIdEnum getOptionId()` | `@JsonTypeInfo` + `@JsonSubTypes` (home_delivery/pickup_point) |
| B | `legacyDiscriminatorBehavior=true` | no | interface | `String getOptionId()` | `OptionIdEnum getOptionId()` | unchanged from A |
| C | `useOneOfInterfaces=false` | yes | concrete class | `OptionIdEnum getOptionId()` | `OptionIdEnum getOptionId()` (child does not extend parent) | unchanged |
| D | `legacyDiscriminatorBehavior=true`, `useOneOfInterfaces=false` | yes | identical to C | identical to C | identical to C | identical to C |
| E | `legacyDiscriminatorBehavior=false`, `useOneOfInterfaces=true`, `useOneOfDiscriminatorLookup=true` | no | identical to A | identical to A | identical to A | identical to A |

## Decision

Take option 3 with the plugin from option 1, on hold for option 4.

- Plugin `org.openapi.generator` version 7.25.0 (latest on the
  [Gradle Plugin Portal](https://plugins.gradle.org/plugin/org.openapi.generator),
  released 2026-08-24).
- `generatorName = "spring"`, `apiPackage = com.example.mi_bolt_backend.api`,
  `modelPackage = com.example.mi_bolt_backend.api.model`,
  `inputSpec = build/openapi/openapi.yaml` (the derived copy).
- `configPackage = com.example.mi_bolt_backend.api.config` is set via
  `additionalProperties` so the generated `EnumConverterConfiguration`
  (converters for `ProductSort`, `StorageGb` and the other enums used in
  query parameters) lands inside the `@SpringBootApplication` scan root
  and is registered on startup. With the generator's default
  `org.openapitools.configuration` package the class is on the classpath
  but outside component scan, so a future controller would 400 on
  `?sort=price_asc`.
- five `configOptions` only:
  - `interfaceOnly = true` — interfaces and DTOs, no controllers.
  - `useSpringBoot4 = true` — selects the Spring Boot 4 code paths and the
    `jakarta` namespace.
  - `documentationProvider = none` — no `springdoc-openapi` annotations.
  - `annotationLibrary = none` — no Swagger annotations.
  - `openApiNullable = false` — do not pull in the
    `org.openapitools:jackson-databind-nullable` library (the generator's
    "OpenAPI Jackson Nullable library").
- `generateApiTests`, `generateModelTests`, `generateApiDocumentation`,
  `generateModelDocumentation` are all `false` because every test and every
  document lives in this repository; the generator's would-be output would
  be discarded.
- A custom Gradle task `prepareOpenApiSpec` reads `api/openapi.yaml` and
  performs four exact literal replacements, each of which is the whole
  block including the line that follows the enum value, so a second value
  added under one of these enums (either above or below the original) and
  any re-indentation make the task fail with a message naming the missing
  block:
  - `HomeDeliverySelection.optionId` block ending in `        address:`
  - `PickupPointSelection.optionId` block ending in `    DeliverySelection:`
  - `CardOrderRequest.paymentMethod` block ending in `        paymentIntentId:`
  - `CashOnDeliveryOrderRequest.paymentMethod` block ending in `        termsVersion:`
  The `PickupPointSelection` literal is anchored on the next schema header,
  so inserting an unrelated schema between `PickupPointSelection` and
  `DeliverySelection` or renaming `DeliverySelection` also fails the guard,
  with a message that names `PickupPointSelection.optionId`.
  The `PaymentMethodId` and `DeliveryOptionId` enums live at a different
  indentation and are not touched. The exactly-once check turns a spec
  change into a build failure with a diagnostic, not silent drift.
- `openApiGenerate` depends on `prepareOpenApiSpec`; `openApiGenerate` wipes
  its own `outputDir` in a `doFirst` so a renamed or removed schema does
  not leave a ghost class behind; `JavaCompile` depends on `openApiGenerate`;
  the generated source directory is added to the main `java.srcDirs`.
- `build/` is `.gitignore`d; no generated code lands in the repository.
- Spec copy is read and written as UTF-8 to avoid platform-default
  surprises; `.gitattributes` declares `*.yaml text eol=lf` so a CRLF
  checkout cannot break the literal matches.

The orchestrator's research (sources cited below) backs every claim that
needs an external reference; this file is the written-down form of those
findings.

## Consequences

**Wins.**
- `./gradlew clean build` is green on a fresh clone. The two unions
  deserialise to the right subtype (covered by
  `DeliverySelectionDeserializationTest` and `OrderRequestDeserializationTest`).
- The build-time copy is a plain `doLast` task with declared inputs and
  outputs, so Gradle's up-to-date checks work and a spec change re-runs it.
- The four single-value enums collapse to plain strings, so every consumer
  of the generated DTOs (controllers, services, tests) works with `String`
  instead of a per-schema enum. This matches the `description` text in the
  spec ("semantically the same as `const`") and removes a layer of
  generator-flavoured types from the codebase.
- The guard is the whole block, so adding a second value under one of the
  four enums (verified by a direct count probe on 2026-09-19: the
  baseline passes; both `- home_delivery_express` placed above and below
  `- home_delivery` make the count drop to 0 and the task fail) turns into
  a build failure with the task's diagnostic, not silent drift.
- The removal trigger is explicit: when 7.26.0 ships, drop
  `prepareOpenApiSpec` and the four replacements, point
  `openApiGenerate.inputSpec` back at `api/openapi.yaml`, and reopen
  `MiBoltBackendApplicationTests.contextLoads` (T2 will already have made
  it pass by then).

**Costs.**
- A pre-existing failing test (`MiBoltBackendApplicationTests.contextLoads`)
  has been annotated `@Disabled` with a comment pointing at T2. The
  original failure was a Spring context that needed a datasource, which T1
  is forbidden to add. The annotation is the smallest change that lets
  `./gradlew clean build` exit 0; T2 will configure the datasource and
  re-enable it.
- The `allOf` warning `Circular reference detected in allOf for $ref:
  FacetValue. Skipping.` from the generator is benign for this spec:
  `CatalogItem`, `Product` and `ColorFacetValue` are emitted as flat
  classes with all expected fields, including the `swatchHex` member of
  `ColorFacetValue` and the merged `ProductBase` fields on `CatalogItem`
  and `Product`. No semantic loss.
- `openApiGenerate` and `compileJava` now run as part of every build.

**What this decision does not do.**
- It does not touch `api/openapi.yaml`. A contract defect is reported to the
  issue, not fixed in code.
- It does not add a Jackson 2 dependency. Spring Boot 4.1.1 ships Jackson 3:
  `tools.jackson.core:jackson-databind:3.1.5` is the runtime mapper, and
  `com.fasterxml.jackson.core:jackson-annotations:2.21` resolves as a
  transitive of `spring-boot-jackson` to keep the `com.fasterxml.jackson.annotation.*`
  package the generator emits as the correct annotations under Jackson 3.
- It does not declare `unhandledException`. Domain exceptions are unchecked
  and mapped centrally by `@RestControllerAdvice`; throwing `Exception`
  from every generated method would force a `throws Exception` clause on
  every controller implementation.

## Date and status

2026-09-19 — Valid.

Removal trigger: when the
[7.26.0 milestone](https://github.com/OpenAPITools/openapi-generator/milestone/79)
ships (target 2026-09-24), drop `prepareOpenApiSpec` and the four
replacements, point `openApiGenerate.inputSpec` back at `api/openapi.yaml`,
reopen `MiBoltBackendApplicationTests.contextLoads`, and update the two
tests that today assert on the `String` form of the discriminator getter:

- `src/test/java/com/example/mi_bolt_backend/api/model/DeliverySelectionDeserializationTest.java`
  — the `new HomeDeliverySelection("home_delivery", address)` call and the
  `assertEquals("home_delivery", home.getOptionId())` assertions must use
  the generated enum.
- `src/test/java/com/example/mi_bolt_backend/api/model/OrderRequestDeserializationTest.java`
  — same shape for `CardOrderRequest` and the `paymentMethod` constructor
  argument.

## Sources

- https://plugins.gradle.org/plugin/org.openapi.generator — plugin version
  7.25.0 released 2026-08-24.
- https://github.com/OpenAPITools/openapi-generator/issues/24959 — the bug
  this decision works around.
- https://github.com/OpenAPITools/openapi-generator/pull/24812 — merged
  2026-09-06 into milestone 7.26.0.
- https://github.com/OpenAPITools/openapi-generator/milestone/79 — target
  release date 2026-09-24.
- https://openapiprocessor.io/spring/processor/one-of-interface.html — the
  alternative generator considered and rejected for this contract.
- https://docs.spring.io/spring-boot/reference/features/json.html — the
  Spring Boot 4 reference for the Jackson 3 module, confirming the package
  name and the absence of a Jackson 2 dependency.

## Note: paths after the monorepo move (MIM-411)

- `api/openapi.yaml` is now `contracts/commerce/openapi.yaml` at the git root; the build reads it as `../../../contracts/commerce/openapi.yaml` from `backend/services/commerce/`.
- The `docs/0N` citations above refer to the same files under `backend/docs/`.
