# Backend rule evidence

The evidence behind the rules in `SKILL.md`: for each one, the line that states
it, what enforces it, an example in the code, and the exceptions that exist
today. The §9 forbidden list, with each line's enforcement, is in `SKILL.md`
and is not repeated here. Paths are repository-relative. Counts were measured
on 2026-09-26; section 7 gives the commands that reproduce them.

## Contents

1. PMD: the project's own rules
2. PMD: quickstart rules that shape everyday code
3. Written rules
4. Observed patterns: packages, classes, injection
5. Observed patterns: nulls, JSON members, logging, time, money
6. Formatting
7. Re-measuring the counts
8. Sources outside the repository

## 1. PMD: the project's own rules

All of them live in `backend/config/pmd/ruleset.xml`, and
`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md` gives the reason for
each. The quickstart leaves `SystemPrintln`, `AvoidReassigningParameters`,
`AvoidThrowingRawExceptionTypes` and `AvoidUncheckedExceptionsInSignatures`
commented out, so those four are active here only because the ruleset names
them (quickstart source, section 8).

- **`NoFullyQualifiedNames`** (`backend/config/pmd/ruleset.xml:22-38`), a custom
  XPath rule, `//ClassType[@FullyQualified = true()]`. It rejects every fully
  qualified type reference in code: generic arguments, `new` expressions,
  qualified static access and annotations. Imports, the package line and
  javadoc `{@link}` are not type references in code and pass. The quickstart's
  `UnnecessaryFullyQualifiedName` flags a qualifier only when the type is
  already imported, which is why this rule exists
  (`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md:183-200`).
  Compliant form: every type imported, as in
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:3-13`.
- **`SystemPrintln`** (`backend/config/pmd/ruleset.xml:39`) rejects
  `System.out` and `System.err` printing. Log through the class's SLF4J logger
  instead (section 5).
- **`AvoidReassigningParameters`** (`backend/config/pmd/ruleset.xml:40`)
  rejects an assignment to a method or constructor parameter. Copy it to a
  local and change the local.
- **`AvoidUncheckedExceptionsInSignatures`**
  (`backend/config/pmd/ruleset.xml:41`) rejects an unchecked exception in a
  `throws` clause. The fix 0009 records is deleting the clause
  (`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md:224-228`).
- **`AvoidThrowingRawExceptionTypes`** (`backend/config/pmd/ruleset.xml:42`)
  rejects throwing `RuntimeException`, `Exception`, `Throwable` or `Error`
  themselves. Throw `DomainException` for a business failure and a specific JDK
  type otherwise; 0009 replaced two raw throws with `UncheckedIOException` and
  `IllegalStateException`
  (`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md:229-236`).
- **`MethodNamingConventions`, re-added** (`backend/config/pmd/ruleset.xml:17-21`)
  with `junit5TestPattern` `[a-z][a-zA-Z0-9]*|f[0-9]+_[a-zA-Z0-9]*`. The
  `f<N>_` form is the smoke-test marker; its only use is
  `SmokeF6Test.f6_imageServingWorks` in
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/catalog/SmokeF6Test.java:27`.
  Every other method keeps PMD's default camelCase pattern.
- **`UseUtilityClass`, excluded** (`backend/config/pmd/ruleset.xml:11-15`),
  project-wide because a ruleset `<exclude>` cannot target one class; its only
  hit was the `@SpringBootApplication` entry point.

**Wiring** (`backend/services/commerce/build.gradle:220-245`): `toolVersion`
7.24.0 (`:221`), the one ruleset file and no built-in rule sets (`:222-223`),
violations printed to the console (`:224`), the build failing on any violation
(`:225`), a `GradleException` when the ruleset file is missing, because PMD
would otherwise analyse nothing and pass (`:228-238`), and the generated
`com.example.mi_bolt_backend.api` package skipped by `pmdMain` only, so a
hand-written test in that package is still linted (`:240-245`). Gradle wires
`pmdMain` and `pmdTest` into `check` (Gradle PMD plugin, section 8).

## 2. PMD: quickstart rules that shape everyday code

`rulesets/java/quickstart.xml` in PMD 7.24.0 has 124 active rules (section 8).
Read a rule's page in the PMD 7.24.0 index rather than recalling it; the list
below is the part a reviewer meets most, not the whole set.

- **`ControlStatementBraces`**: braces on every `if`, `else`, `for`, `while`
  and `do` body, including a single-statement `if`.
- **`ClassNamingConventions`**: type names match `[A-Z][a-zA-Z0-9]*`, so no
  underscore; a class holding test methods matches
  `^(Test|IT).*$|^[A-Z][a-zA-Z0-9]*(Test|Tests|TestCase|IT|ITCase)$`.
- **`GuardLogStatement`**: a log call that concatenates or calls a method is
  wrapped in the matching `isXEnabled()` check; `{}` placeholders with plain
  variables are the documented alternative. Section 5 has the repository's
  practice.
- **`UseLocaleWithCaseConversions`**: `toLowerCase` and `toUpperCase` take a
  locale. Every call in `backend/services/commerce/src` passes `Locale.ROOT`.
- **`UnnecessaryImport`, `UnusedLocalVariable`, `UnusedPrivateField`,
  `UnusedPrivateMethod`, `UnusedFormalParameter`**: dead code fails the lint.
- **`MissingOverride`, `PreserveStackTrace`**: an override carries
  `@Override`, and an exception thrown from a `catch` block refers to the
  caught one, normally as its cause.
- **`UncommentedEmptyConstructor`, `UncommentedEmptyMethodBody`,
  `EmptyControlStatement`**: an empty constructor or method body carries a
  comment saying why; an empty `if`, loop, `try` or `finally` body fails even
  with a comment, because `allowCommentedBlocks` defaults to false.
- **`AvoidCatchingGenericException`**, configured by the quickstart to reject
  only a `catch` of `Throwable` or `Error`; the one `catch (Exception e)` in
  main code, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:96`,
  passes it.
- **Not checked:** `FieldNamingConventions` is commented out in the
  quickstart, so field names are free; `ProperLogger` is active, but its
  default `loggerClass` is Commons Logging's `Log`, so it does not examine the
  SLF4J `Logger` fields used here.

The rules that fired when the gate was introduced, with the fix each needed,
are the table at
`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md:75-88`.

## 3. Written rules

`backend/docs/02-backend.md` and `backend/docs/04-adatbazis.md` are in
Hungarian; the section titles are given so the lines can be found.

- **Root package `com.example.mi_bolt_backend`**:
  `backend/docs/02-backend.md:22`. Review-only. Every class sits under it, and
  the generator writes under its `api` and `api.model` subpackages
  (`backend/services/commerce/build.gradle:93-94`).
- **Controllers implement the generated interfaces and declare no route, HTTP
  method or status code of their own** (§2 "Kódgenerálás",
  `backend/docs/02-backend.md:28-35`). Review-only. 11 of the 12 `*Controller`
  classes implement a generated `*Api`; the twelfth, `ProblemErrorController`,
  implements Spring Boot's `ErrorController` and holds the only hand-written
  `@RequestMapping` in main code
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemErrorController.java:37`),
  for the `/error` forward rather than a contract route.
- **Layering** (§3 "Rétegzés", `backend/docs/02-backend.md:48-62`).
  Review-only; no ArchUnit or other package-dependency check exists. The
  controller only converts, HTTP to a domain call and a domain result to a DTO,
  with no business rule and no database call. The service holds every business
  rule, invariant and transaction boundary, sees no header, sets no status, and
  throws domain exceptions. The repository queries and persists, with no rule.
  No controller builds an error body; the one `@RestControllerAdvice` does.
  Reference shape: `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:35-77`,
  five methods that each delegate to `CartService`.
- **English error text** (§9, `backend/docs/02-backend.md:447`: no
  user-facing Hungarian text in an error response). Review-only. Every
  `ErrorCode` title is English
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java:12-37`).
  Hungarian user-facing strings in main code appear only in non-error
  responses: the receipt notice `OrderService.NOTICE`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java:49-50`)
  and the checkout option labels
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java:234-255`).
- **Money is whole forints in an integer type; floating point is forbidden**
  (`backend/docs/04-adatbazis.md:103`). Review-only on the Java side. Entities
  hold `long` fields named `*Huf`, the mappers narrow to `int` with
  `Math.toIntExact` where they build the generated `Money`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderModels.java:57`),
  and main code has no `double`, `float` or `BigDecimal`.
- **No test starts, reaches or depends on the Docker PostgreSQL container**
  (§7.0, `backend/docs/02-backend.md:296-324`, repeated in §9). Structural:
  `@IntegrationTest` activates the `test` profile
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java:27`),
  whose datasource is in-memory H2
  (`backend/services/commerce/src/test/resources/application-test.properties:4`).
  That annotation is the only `@SpringBootTest` in the tree
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java:24`),
  and 48 test classes carry it; its tag is what sends them to the
  `integrationTest` task. The CI `postgres-smoke` job is the documented
  exception and is not a Gradle test (`backend/docs/02-backend.md:305-313`).
- **The local database is reached only through the mise tasks and
  `deploy/compose.sh`**, never a direct `docker`, `docker compose` or outside
  `psql` (§1, `backend/docs/04-adatbazis.md:5-15`; §9 points there).
  Review-only.
- **Gradle build code** is Groovy DSL (`backend/docs/02-backend.md:15`). A
  build step that could silently do nothing fails loudly instead: the PMD
  ruleset check (`backend/services/commerce/build.gradle:228-238`) is the
  instance this skill owns.

## 4. Observed patterns: packages, classes, injection

No document states these; the code follows them consistently.

- **Packages.** Eight vertical domain packages under the root: `admin` (with
  `catalog`, `security` and `user` below it), `cart`, `catalog`, `checkout`,
  `demo`, `order`, `problem` and `session`. There is no horizontal
  `controller`, `service` or `repository` package; the layer shows in the class
  suffix. Tests mirror the main tree, plus `api.model` for two
  deserialisation tests of generated models and `test` for shared support such
  as `IntegrationTest` and `ContractValidation`.
- **Suffixes** in main code: `*Controller` (12), `*Service` (15),
  `*Repository` (15, Spring Data interfaces), `*Data` (4 interfaces grouping
  the domain records, such as `CartData.CartView`), `*Models` (5 mappers from
  those records to the generated `api.model` types, such as `CartModels`),
  `*Dto` (7, the catalogue loader's JSON shapes). Entities carry no suffix:
  `Cart`, `CartItem`, `ShopOrder`, `ProductVariant`.
- **Records** carry data: 37 record declarations in main code.
- **Injection.** Main classes use constructor injection with `final` fields
  and no annotation. The one `@Autowired` in main code picks which of
  `CatalogLoader`'s two constructors Spring uses; the second is package-private
  for tests
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:48`).
  Test classes inject with `@Autowired private` fields (116). There is no
  Lombok.
- **No suppression.** No `// NOPMD`, no `@SuppressWarnings` and no
  `violationSuppressXPath` anywhere in the backend.

## 5. Observed patterns: nulls, JSON members, logging, time, money

- **Nulls.** No `@Nullable` and no `Objects.requireNonNull` in main code.
  Repositories return `Optional` for a lookup that can miss (17 `Optional<`
  in main), resolved with `orElseThrow` (18) into a `DomainException`, and in
  three places with `.orElse(null)`. Inside a class, `null` means "absent":
  14 `return null;`, mostly private lookup helpers such as
  `CartService.findLine`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:199-206`);
  `SessionService.loadByCookieToken` returns `null` for a missing or expired
  cookie
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionService.java:46-54`).
  A business failure is thrown, never returned as `null`.
- **JSON members.** A response omits a member whose value is `null`
  (`backend/services/commerce/src/main/resources/application.properties:18`),
  and a request with a member the contract does not declare is refused
  (`:19`); the comment above them (`:13-17`) gives the reason, and
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/JacksonNonNullTest.java`
  pins the first. The catalogue loader's DTOs opt out of the second with
  `@JsonIgnoreProperties(ignoreUnknown = true)`.
- **Logging.** SLF4J, declared as
  `private static final Logger log = LoggerFactory.getLogger(X.class);` in the
  four classes that log: `ProblemAdvice`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java:57`),
  `CatalogLoader`, `AdminBootstrap` and `DemoAccessBootstrap`. A 4xx response
  is logged at WARN without a stack trace
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java:345-351`),
  an unhandled throwable at ERROR with the exception as the last argument, which
  SLF4J prints with its stack trace
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java:294-300`).
  15 of the 16 log calls sit
  inside an `isXEnabled()` guard; the one that does not,
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:78`,
  passes a plain variable to a `{}` placeholder.
- **Time.** Ten main classes take an injected `java.time.Clock`, whose bean is
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartClockConfig.java:12-15`,
  and read the current time from it, so a test can fix the time.
  `SessionService` is the exception: it calls `OffsetDateTime.now()` directly
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionService.java:39`
  and `:52`). A pattern with an exception, not a written rule.
- **Money.** See the written rule in section 3.

## 6. Formatting

- **Indentation: CONFLICT.** 194 of the 198 Java files under
  `backend/services/commerce/src` have tab-indented lines, and no Java file has
  a space-indented code line (the four others have no indented code at all).
  `backend/services/commerce/build.gradle` and
  `backend/config/pmd/ruleset.xml` are tab-indented too. `.editorconfig:4-7`
  sets `indent_style = space` and `indent_size = 2` for `[*]`, a section that
  matches every file (EditorConfig specification, section 8). No Java formatter
  is configured. Match the surrounding file; neither source is declared to win.
- **Braces.** `ControlStatementBraces` requires them (section 2). `else`,
  `catch` and `finally` start their own line after the closing brace (27, 30
  and 10 occurrences), apart from one `} catch` and one `} finally` in
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/catalog/ImageInspector.java:95-98`.
- **Imports.** No wildcard import anywhere; static imports appear only in test
  code.

## 7. Re-measuring the counts

Run from the repository root. Each command is read-only; the three zero-hit
checks print nothing and exit 1 while the statement holds.

```bash
git ls-files 'backend/services/commerce/src/*.java' | wc -l                                    # 198
git grep -l $'^\t' -- 'backend/services/commerce/src/*.java' | wc -l                          # 194 with tab indentation
git grep -lE '^ +[^ *]' -- 'backend/services/commerce/src/*.java' | wc -l                     # 0 with space indentation
git grep -ilE 'archunit|spotless|checkstyle|google-java-format|errorprone|nullaway|jspecify|lombok' -- 'backend/*.gradle' 'backend/*.toml' 'backend/*.xml' 'backend/*.java' 'backend/*.properties'
git grep -lE 'NOPMD|@SuppressWarnings' -- 'backend/*.java'
git grep -nE 'to(Lower|Upper)Case\(\)' -- 'backend/services/commerce/src/*.java'
git grep -c 'LoggerFactory.getLogger' -- 'backend/services/commerce/src/main/*.java'          # 4 files
git grep -hE 'is(Trace|Debug|Info|Warn|Error)Enabled\(\)' -- 'backend/services/commerce/src/main/*.java' | wc -l   # 14 guards
git grep -lE 'private final Clock ' -- 'backend/services/commerce/src/main/*.java' | wc -l    # 10
git grep -hE '(^|[^A-Za-z])record [A-Z]' -- 'backend/services/commerce/src/main/*.java' | wc -l   # 37
```

The guard count is lower than the number of guarded calls because
`AdminBootstrap` puts two calls under one guard.

## 8. Sources outside the repository

Read on 2026-09-26.

- PMD 7.24.0 quickstart ruleset, the 124 active rules and the commented-out
  ones: https://github.com/pmd/pmd/blob/pmd_releases/7.24.0/pmd-java/src/main/resources/rulesets/java/quickstart.xml
  (the count agrees with `backend/docs/decisions/0009-pmd-quickstart-lint-gate.md:20`).
- PMD 7.24.0 Java rule index: https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java.html
- `ControlStatementBraces`, `ClassNamingConventions`, `MethodNamingConventions`,
  `FieldNamingConventions` and `EmptyControlStatement` defaults:
  https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java_codestyle.html
- `GuardLogStatement`, `SystemPrintln`, `AvoidReassigningParameters`,
  `MissingOverride`, `PreserveStackTrace`:
  https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java_bestpractices.html
- `UncommentedEmptyConstructor`, `UncommentedEmptyMethodBody`:
  https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java_documentation.html
- `ProperLogger` (default `loggerClass`), `UseLocaleWithCaseConversions`,
  `AvoidCatchingGenericException`:
  https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java_errorprone.html
- `AvoidUncheckedExceptionsInSignatures`, `AvoidThrowingRawExceptionTypes`:
  https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java_design.html
- Gradle 9.7.1 PMD plugin, `pmdMain` and `pmdTest` wired into `check`, PMD
  versions supported up to 7.24.0:
  https://docs.gradle.org/9.7.1/userguide/pmd_plugin.html
- Gradle 9.7.1 `PmdExtension` (`consoleOutput`, `ignoreFailures`,
  `ruleSets`): https://docs.gradle.org/9.7.1/dsl/org.gradle.api.plugins.quality.PmdExtension.html
- SLF4J prints a throwable passed as the last argument with its stack trace:
  https://www.slf4j.org/faq.html#paramException
- `@Autowired` is needed on one constructor only when a bean has several:
  https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html
- `spring.jackson.default-property-inclusion` and
  `spring.jackson.deserialization.*` (Spring Boot 4.1.1):
  https://docs.spring.io/spring-boot/appendix/application-properties/index.html
- EditorConfig: `*` matches any file name in any directory below the file:
  https://spec.editorconfig.org/
