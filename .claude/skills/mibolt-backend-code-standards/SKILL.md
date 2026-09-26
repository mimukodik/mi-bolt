---
name: mibolt-backend-code-standards
description: "Fixing PMD violations or compile errors in MiBolt backend Java, reviewing Java diffs, or judging whether a Java pattern is allowed: the PMD ruleset, layering, naming, English error text, nulls, logging, formatting, test code, forbidden patterns. Load it before answering or fixing, since the project adds rules to PMD's quickstart. Not for what an endpoint or business rule does."
---

# MiBolt backend code standards

A path that starts with `references/`, or is `SKILL.md`, is relative to this
skill's directory; one that starts with a MiBolt skill name is relative to the
directory that holds the MiBolt skills; every other path is relative to the
repository root. Every command runs from the repository root
(`mibolt-workspace-ops` ("Where commands run")), with any script path in it
read by those same rules. `backend/docs/02-backend.md` and
`backend/docs/04-adatbazis.md` are written in Hungarian: the anchors point at
their lines, and the English here summarises them without replacing them.

## 1. Scope and hand-offs

This skill covers how the Java source and test code under
`backend/services/commerce/src` is written, how PMD is wired into
`backend/services/commerce/build.gradle`, and what enforces each rule. The
other blocks of that build file belong to the skills below. It stops at these
edges:

- **What the service does** is out of scope: invariants, endpoints, the error
  model's mechanics (`ErrorCode`, `DomainException`, the `ProblemAdvice`
  mappings), transactions, persistence and Liquibase, security, configuration
  keys, the test harness and the decision-document workflow belong to
  `mibolt-commerce-backend`.
- **Running the gates**, their reports, the CI jobs and the JaCoCo numbers
  belong to `mibolt-verification`.
- **The OpenAPI contract, code generation and generated code** belong to
  `mibolt-cross-package-changes`.
- **TypeScript, templates and styles** under `frontend/` belong to
  `mibolt-frontend-code-standards`.
- **The `.editorconfig` file itself, mise tasks, Docker and CI wiring** belong
  to `mibolt-workspace-ops`; only the formatting facts about backend code are
  here.

## 2. Evidence model and where the rules are written

Every rule in section 5 carries one enforcement tag. Put the tag on every
review finding, so the author knows whether the build would have caught it.

- **PMD**: `pmdMain` or `pmdTest` fails the build on it.
- **structural**: the build's wiring prevents it without a rule that names it.
- **review-only**: written down, and nothing but a reviewer checks it.
- **observed**: no document states it; the code follows it consistently. The
  counts, measured on 2026-09-26, are in the reference.
- **conflict**: two sources disagree. Both are stated, and neither is declared
  the winner.

The backend's own rules are written in four places:

- `backend/docs/02-backend.md`: the root package (`:22`), §2 "Kódgenerálás"
  (`:26-44`), §3 "Rétegzés", the layering (`:48-62`), §7.0, the test database
  (`:296-324`), and §9 "Amit nem szabad", the forbidden list (`:442-454`).
- `backend/docs/04-adatbazis.md`: §1, database access (`:3-15`), and the money
  rule in §4 (`:103`).
- `backend/config/pmd/ruleset.xml`, whose reasons are in
  `backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`.
- `.editorconfig`.

PMD is the only static-analysis tool. No ArchUnit, Checkstyle, Spotless,
google-java-format, Error Prone, NullAway, JSpecify or Lombok appears in any
`*.gradle`, `*.toml`, `*.xml`, `*.java` or `*.properties` file under
`backend/`.

## 3. Where to start

- `backend/config/pmd/ruleset.xml`, the whole ruleset in 43 lines, and
  `backend/services/commerce/build.gradle:220-245`, its wiring. Decision 0009,
  indexed in section 2, says why each rule is in or out and which rules fired
  when the gate was introduced.
- §3 and §9 of `backend/docs/02-backend.md`, at the anchors in section 2.
- The shapes to copy:
  - `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java`:
    a thin controller whose five methods each delegate to `CartService`, with
    no rule and no error body.
  - `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`:
    constructor injection with an injected `Clock`, business failures thrown
    as `DomainException`, and repository `Optional`s resolved with
    `orElseThrow`.
  - `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`:
    the logger declaration, the WARN and ERROR severities and the
    `isXEnabled()` guards.

## 4. Typical work

**Fixing a PMD finding:**

1. Reproduce it with `mise run //backend:lint`. The console prints each
   violation as file, line, rule and PMD's message
   (`backend/services/commerce/build.gradle:224`), as the two lines quoted at
   `backend/docs/decisions/0009-pmd-quickstart-lint-gate.md:144-145` show;
   `SystemPrintln`'s message is `Usage of System.out/err` (source: section 8
   of [the reference](references/rule-evidence.md)).
2. Identify the rule. The project's own rules are the first six rules of
   section 5. Any other name is a quickstart rule: read its page in the PMD
   7.24.0 rule index, https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java.html,
   rather than recalling it, because the ruleset is pinned to that version.
3. Fix the code, and add no `// NOPMD` and no `@SuppressWarnings`: the
   backend has neither (observed; no document forbids them), and a rule that
   is wrong for this codebase is changed in the ruleset through a decision
   (section 6) instead.
4. Rerun `mise run //backend:lint` until it exits 0. The other checks a
   change must pass are in `mibolt-verification` ("Gates before a commit");
   this skill does not list them.

**Fixing a compile error:** the main-code types under
`com.example.mi_bolt_backend.api` are generated from the contract before every
compile (`backend/services/commerce/build.gradle:137-139`) and are never
edited; the two deserialisation tests that share the `api.model` package under
`src/test` are hand-written. When hand-written code no longer matches the
generated types after a contract change, the change and its consumers belong
to `mibolt-cross-package-changes`; when hand-written code simply uses them
wrongly, fix that code. Fix any compile error without breaking a rule in
section 5.

**Reviewing a Java diff:**

1. Sort the changed files by class suffix and hold each against the layering
   rule: a `*Controller` only converts, a `*Service` holds the rules, a
   `*Repository` only queries.
2. Walk the review-only and observed rules in section 5, which PMD cannot
   catch. [The reference](references/rule-evidence.md) gives each one's
   source, an example and today's exceptions.
3. Walk the §9 list at the end of section 5. A path written into code,
   configuration or a test follows
   `mibolt-workspace-ops` ("No machine-specific paths").
4. Run `mise run //backend:lint` for the enforced part, and give every
   finding its tag. A finding is pre-existing only when
   `git diff --name-status <base>...HEAD` does not list its file and
   `git status --short` does not show that file
   (`mibolt-verification` ("Pre-existing failures")).

## 5. The rules

**Enforced by PMD** (`backend/config/pmd/ruleset.xml`):

- **Import every type; never write a fully qualified type name in code.**
  PMD, the custom `NoFullyQualifiedNames` (`:22-38`).
- **Never print to `System.out` or `System.err`; log instead.** PMD,
  `SystemPrintln` (`:39`).
- **Never assign to a parameter; copy it to a local.** PMD,
  `AvoidReassigningParameters` (`:40`).
- **Never list an unchecked exception in a `throws` clause.** PMD,
  `AvoidUncheckedExceptionsInSignatures` (`:41`).
- **Never throw `RuntimeException`, `Exception`, `Throwable` or `Error`
  itself.** Throw `DomainException` for a business failure, and a specific
  JDK type otherwise. PMD, `AvoidThrowingRawExceptionTypes` (`:42`).
- **Name a test method in lowerCamelCase, or `f<N>_name` for a smoke-test
  marker.** PMD, `MethodNamingConventions` with a `junit5TestPattern`
  (`:17-21`).
- **Everything else in PMD 7.24.0's quickstart ruleset, minus
  `UseUtilityClass`** (`:7-16`). The quickstart rules met most often: braces
  on every `if`, `else` and loop body; PascalCase type names without
  underscores, and a name ending in `Test` or `Tests` for a class that holds
  test methods, as every one here has (the reference gives PMD's exact
  pattern); an `isXEnabled()` guard around a log call
  that concatenates strings or calls a method; a `Locale` argument on every
  `toLowerCase` and `toUpperCase`, which here is always `Locale.ROOT`; no
  unused import, local, private field, private method or parameter;
  `@Override` on every override. This list is not the full set: that is the
  7.24.0 quickstart the reference links, minus `UseUtilityClass`.

**Written, and checked only by review:**

- **A controller only converts, a service holds every rule, a repository only
  queries.** The controller turns HTTP into a domain call and the result into
  a DTO, with no business rule, no database call and no error body. The
  service holds every rule, invariant and transaction boundary, sees no
  header, sets no status and throws domain exceptions. The repository queries
  and persists. Review-only, `backend/docs/02-backend.md:48-62`.
- **A controller implements its generated `*Api` interface and declares no
  route, HTTP method or status code of its own.** Review-only,
  `backend/docs/02-backend.md:34-35`. Returning the status the contract lists
  for an operation, as the controllers' `ResponseEntity.created(...)`,
  `noContent()` and `status(...)` returns do, is not a status of its own. The
  only hand-written mapping in main code, `ProblemErrorController`'s `/error`,
  serves Spring Boot's error forward rather than a contract route, and it is
  also the one controller that builds its own error body.
- **Error text is English.** Review-only, `backend/docs/02-backend.md:447`.
  Hungarian user-facing text appears only in non-error responses, the receipt
  notice and the checkout option labels, which this rule does not cover.
- **Money is whole forints in an integer type; never a floating-point type.**
  Review-only, `backend/docs/04-adatbazis.md:103`, which states it for
  columns. In Java it is a `long`: entity fields are named `*Huf`
  (`ShopOrder.totalHuf`), while record components and the checkout fee
  settings are not (`CheckoutData.Summary.subtotal`,
  `CheckoutService.homeDeliveryFee`). It is narrowed with `Math.toIntExact`
  where a mapper builds the generated `Money`, and where `CartService` puts an
  old and a new price into the `Integer` `from` and `to` of a price-change
  notice (`CartData.NoticeParams`). Main code has no `double`, `float` or
  `BigDecimal`.
- **No test starts, reaches or depends on the Docker PostgreSQL container.**
  Review-only, `backend/docs/02-backend.md:296-324`. Give every Spring-context
  test `@IntegrationTest`, never a bare `@SpringBootTest`. `@IntegrationTest`
  selects the in-memory H2 `test` profile, and nothing else in the build does:
  the Gradle test tasks set no profile
  (`backend/services/commerce/build.gradle:141-158`, `:247-269`), so a context
  started without the annotation gets the default datasource, the container on
  port 55433 (`backend/services/commerce/src/main/resources/application.properties:5`).
  How the annotation works belongs to `mibolt-commerce-backend`.

**Observed patterns; follow them, nothing checks them unless the bullet
names the check:**

- **Put a class in the domain package it serves.** The root is
  `com.example.mi_bolt_backend` (`backend/docs/02-backend.md:22`), split into
  eight vertical packages, `admin`, `cart`, `catalog`, `checkout`, `demo`,
  `order`, `problem` and `session`, with no horizontal layer package. Which
  domain holds what belongs to `mibolt-commerce-backend`.
- **Name a class after its layer:** `*Controller`, `*Service`, `*Repository`,
  `*Data` (an interface grouping domain records), `*Models` (the mapping from
  those records to generated types) and `*Dto` (the catalogue loader's JSON
  shapes). Entities take no suffix.
- **Inject through the constructor into `final` fields, with no
  annotation.** `@Autowired` appears once in main code, to choose between two
  constructors. Spring-context test classes inject `@Autowired private`
  fields. Value types are records, most of them nested in the `*Data`
  interfaces; JPA entities, the catalogue loader's `*Dto` classes and
  `AdminPrincipal`, whose `eraseCredentials()` clears a field, are ordinary
  classes with accessors. There is no Lombok.
- **Read the current time from an injected `Clock`.** `SessionService` calls
  `OffsetDateTime.now()` directly, so this is a pattern with an exception
  rather than a rule.
- **Nulls:** no nullability annotation and no `Objects.requireNonNull`.
  Repositories return `Optional`, mostly resolved with `orElseThrow`; inside a
  class `null` means absent; a business failure is thrown as a
  `DomainException`, never returned as `null`. Responses omit null members and
  a request with an undeclared member is refused
  (`backend/services/commerce/src/main/resources/application.properties:18-19`).
- **Logging:** declare
  `private static final Logger log = LoggerFactory.getLogger(X.class);`
  (SLF4J). Log a 4xx at WARN without a stack trace, and an unexpected
  throwable at ERROR with the exception as the last argument. Wrap each call
  in the matching `isXEnabled()` guard, as every call in main code but one
  is. That guard is the one part of this bullet PMD enforces:
  `GuardLogStatement` fails an unguarded call that concatenates or calls a
  method to build its message, and passes one that hands plain variables to
  `{}` placeholders. PMD never checks the declaration.
- **Formatting, a conflict:** the Java sources, `build.gradle` and
  `ruleset.xml` are tab-indented, and no Java file has a space-indented code
  line, while `.editorconfig:4-7` sets two-space indentation for every file.
  No formatter is configured. Match the surrounding file. `else`, `catch` and
  `finally` start a new line after the closing brace, and no import uses a
  wildcard.

**The §9 forbidden list** (`backend/docs/02-backend.md:442-454`), line by
line, with its enforcement:

- A hand-written controller route or status code that bypasses the generated
  interface (`:444`). Review-only.
- Generated code committed or edited by hand (`:445`). Structural: it is
  written under the ignored `build/`. The detail belongs to
  `mibolt-cross-package-changes`.
- A business rule in the controller layer (`:446`). Review-only.
- User-facing Hungarian text in an error response (`:447`). Review-only.
- Accepting a price, stock level or amount from a request body (`:448`).
  Review-only. The admin catalogue write API is the one exception, decision
  0020, which belongs to `mibolt-commerce-backend`.
- An endpoint, field or status code the contract does not have (`:449`).
  Review, plus the API tests, which validate every response they exercise
  against the contract (§7.4, `backend/docs/02-backend.md:397-401`). A
  contract change belongs to `mibolt-cross-package-changes`.
- Direct intervention in the database container (`:450`): reach the local
  database only through the mise tasks and `deploy/compose.sh`
  (`backend/docs/04-adatbazis.md:5-15`). Review-only.
- A test built on the Docker database (`:451-452`). Review-only, as above.
- Getting around the coverage floor by counting generated code, or switching
  it off (`:453`). Review of the JaCoCo block in
  `backend/services/commerce/build.gradle`. The floor rule is in
  `mibolt-verification` ("Tests and coverage"), and its numbers are in
  `mibolt-verification` ("Backend (`backend/`)").
- An undocumented decision, or a silent departure from these documents
  (`:454`). Review-only; the decision workflow belongs to
  `mibolt-commerce-backend`.

## 6. What else a change touches

- **A change to `backend/config/pmd/ruleset.xml` or to
  `backend/services/commerce/build.gradle:220-245` is a decision.** Record it
  as an amendment to decision 0009 or as a new decision, together with the
  change rather than afterwards, as §8 requires
  (`backend/docs/02-backend.md:405-434`); how a decision is written belongs to
  `mibolt-commerce-backend`. A rule added to the ruleset also applies to the
  existing code, so fix what it finds before the gate goes green, as 0009's
  amendment did.
- **`pmdMain` skips the generated `com.example.mi_bolt_backend.api` package;
  `pmdTest` does not** (`backend/services/commerce/build.gradle:240-245`). A
  hand-written test placed in that package is linted like any other.

## 7. Commands

- `mise run //backend:lint`: runs `pmdMain` and `pmdTest`
  (`backend/mise.toml:5-6`). It needs the Java 21 toolchain the root
  `mise.toml` pins, writes its output into the service's ignored `build/`
  directory, and exits non-zero on any violation (`ignoreFailures = false`,
  `backend/services/commerce/build.gradle:225`). Done means exit 0. Gradle
  runs `pmdMain` and `pmdTest`, the only tasks that run PMD, in two cases: a
  command names them, as this task, its plain Gradle form below and CI's
  `Lint (PMD)` job (`.github/workflows/backend.yml:97-119`) do; or a command
  runs `check`, which `build` depends on, as the full build and CI's
  `Coverage gate and build` job (`.github/workflows/backend.yml:162-163`) do
  (https://docs.gradle.org/9.7.1/userguide/pmd_plugin.html,
  https://docs.gradle.org/9.7.1/userguide/java_plugin.html). Compiling,
  `mise run //backend:test` and `bootRun` do neither, so a violation still
  compiles and runs locally and first fails at this lint, the full build or
  CI.
- `backend/gradlew -p backend :services:commerce:pmdMain :services:commerce:pmdTest`:
  the same two tasks without mise, as `backend/README.md:99` gives them.
- `backend/gradlew -p backend :services:commerce:build`: the full gate, which
  compiles and runs the tests, PMD and the coverage check. When it must pass
  is in `mibolt-verification` ("Gates before a commit"), and what it leaves
  behind is in the same skill.

## 8. References

- [references/rule-evidence.md](references/rule-evidence.md): every rule above
  with the line that states it, its enforcement, an example in the code and
  today's exceptions; the quickstart rules worth knowing; the formatting
  measurements; the commands that re-measure every count; the documentation
  URLs. Read it when reviewing a Java diff line by line, when a rule's source
  or enforcement is questioned, or when a count in this skill has to be
  re-measured.
- The repository sources themselves are listed in sections 2 and 3.

## 9. Keep this skill current

Update this skill in the same change as any of these:

- `backend/config/pmd/ruleset.xml`, or the PMD block at
  `backend/services/commerce/build.gradle:220-245`. A `toolVersion` bump
  changes the quickstart's content: re-read the quickstart at the new release
  tag.
- `backend/docs/02-backend.md` §1, §2, §3, §7.0, §7.4, §8 or §9, or
  `backend/docs/04-adatbazis.md` §1 or §4.
- `.editorconfig`, or a formatter or static-analysis plugin added to the
  build.
- The `lint` task in `backend/mise.toml`, the `lint` or `coverage-gate` job in
  `.github/workflows/backend.yml`, or the PMD command in `backend/README.md`,
  which section 7 cites by line.
- A new domain package under
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend`, or a
  new class suffix.
- A decision under `backend/docs/decisions/` that amends 0009 or changes a
  rule above.

Then run
`node mibolt-project-map/scripts/check-skill-references.mjs --show-anchors mibolt-backend-code-standards`,
and run it as well after an edit anywhere in a file this skill or its
reference cites by line, including the Java sources the reference cites for
its examples: a line added or removed above a cited block moves the block off
its anchor, and the check fails only once an anchor runs past the end of its
file. It must exit 0. Settle each `UNVERIFIED` line by hand, and read each
anchored line it prints against the claim made about it; a range longer than
ten lines ends in `... (+N more lines)`, so read its rest in the file. Sections
2 and 5 and the reference often write an anchor bare, as `:N` after a path
already named; the checker neither checks nor prints those, so read each in
that file.
Re-run the measurement commands in the reference to refresh the counts. Run
the checker as well after an edit to `mibolt-verification` or
`mibolt-workspace-ops`, the skills this one cites sections of by name: its
check (e) reports a cited section name that no longer occurs anywhere in that
skill, so also reread each section this skill cites from the edited one. What
each check proves is in `mibolt-project-map/references/citation-check.md`.
