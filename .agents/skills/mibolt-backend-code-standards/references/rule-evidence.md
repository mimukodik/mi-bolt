# Backend rule evidence

The evidence behind the rules in `SKILL.md`: for each one, the line that states
it, what enforces it, an example in the code, and the exceptions that exist
today. The §9 forbidden list, with each line's enforcement, is in `SKILL.md`
and is not repeated here. `SKILL.md` is this skill's own; every other path is
repository-relative. Section 7 gives the commands that reproduce the counts.

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

- **`NoFullyQualifiedNames`** (`backend/config/pmd/ruleset.xml`, "NoFullyQualifiedNames"),
  a custom
  XPath rule, `//ClassType[@FullyQualified = true()]`. It rejects every fully
  qualified type reference in code: generic arguments, `new` expressions,
  qualified static access and annotations. Imports, the package line and
  javadoc `{@link}` are not type references in code and pass. The quickstart's
  `UnnecessaryFullyQualifiedName` flags a qualifier only when the type is
  already imported, which is why this rule exists
  (`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`, "no inline FQNs").
  Compliant form: every type imported, as in
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java`
  ("import org.springframework.http.ResponseEntity;").
- **`SystemPrintln`** (`backend/config/pmd/ruleset.xml`, "SystemPrintln")
  rejects
  `System.out` and `System.err` printing. Log through the class's SLF4J logger
  instead (section 5).
- **`AvoidReassigningParameters`**
  (`backend/config/pmd/ruleset.xml`, "AvoidReassigningParameters")
  rejects an assignment to a method or constructor parameter. Copy it to a
  local and change the local.
- **`AvoidUncheckedExceptionsInSignatures`**
  (`backend/config/pmd/ruleset.xml`, "AvoidUncheckedExceptionsInSignatures")
  rejects an unchecked exception in a
  `throws` clause. The fix 0009 records is deleting the clause
  (`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`, "the clause was deleted").
- **`AvoidThrowingRawExceptionTypes`**
  (`backend/config/pmd/ruleset.xml`, "AvoidThrowingRawExceptionTypes")
  rejects throwing `RuntimeException`, `Exception`, `Throwable` or `Error`
  themselves. Throw `DomainException` for a business failure and a specific JDK
  type otherwise; 0009 replaced two raw throws with `UncheckedIOException` and
  `IllegalStateException`
  (`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`, "throw new UncheckedIOException(e);").
- **`MethodNamingConventions`, re-added**
  (`backend/config/pmd/ruleset.xml`, "category/java/codestyle.xml/MethodNamingConventions")
  with `junit5TestPattern` `[a-z][a-zA-Z0-9]*|f[0-9]+_[a-zA-Z0-9]*`. The
  `f<N>_` form is the smoke-test marker; its only use is
  `SmokeF6Test.f6_imageServingWorks` in
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/catalog/SmokeF6Test.java`
  ("f6_imageServingWorks").
  Every other method keeps PMD's default camelCase pattern.
- **`UseUtilityClass`, excluded**
  (`backend/config/pmd/ruleset.xml`, "UseUtilityClass"),
  project-wide because a ruleset `<exclude>` cannot target one class; its only
  hit was the `@SpringBootApplication` entry point.

**Wiring** (`backend/services/commerce/build.gradle`, "pmd {"): `toolVersion`
7.24.0 (`backend/services/commerce/build.gradle`, "toolVersion"), the one ruleset
file and no built-in rule sets (`backend/services/commerce/build.gradle`, "ruleSets = [] ruleSetFiles"),
violations printed to the console (`backend/services/commerce/build.gradle`, "consoleOutput = true"), the
build failing on any violation (`backend/services/commerce/build.gradle`, "ignoreFailures = false"), a
`GradleException` when the ruleset file is missing, because PMD
would otherwise analyse nothing and pass (`backend/services/commerce/build.gradle`, "PMD ruleset not found"),
and the generated
`com.example.mi_bolt_backend.api` package skipped by `pmdMain` only, so a
hand-written test in that package is still linted
(`backend/services/commerce/build.gradle`, "tasks.named('pmdMain')"). Gradle wires
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
  main code, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`
  ("catch (Exception e)"),
  passes it.
- **Not checked:** `FieldNamingConventions` is commented out in the
  quickstart, so field names are free; `ProperLogger` is active, but its
  default `loggerClass` is Commons Logging's `Log`, so it does not examine the
  SLF4J `Logger` fields used here.

The rules that fired when the gate was introduced, with the fix each needed,
are the table at
`backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`
("Findings fixed before the gate went green").

## 3. Written rules

`backend/docs/02-backend.md` and `backend/docs/04-adatbazis.md` are in
Hungarian; the section titles are given so the lines can be found.

- **Root package `com.example.mi_bolt_backend`**:
  `backend/docs/02-backend.md` ("A gyökércsomag"). Review-only. Every class sits under it, and
  the generator writes under its `api` and `api.model` subpackages
  (`backend/services/commerce/build.gradle`, "apiPackage" and
  `backend/services/commerce/build.gradle`, "modelPackage").
- **Controllers implement the generated interfaces and declare no route, HTTP
  method or status code of their own** (§2 "Kódgenerálás",
  `backend/docs/02-backend.md`, "Elvárás: a szerződésből generált interfészek").
  Review-only. 11 of the 12 `*Controller`
  classes implement a generated `*Api`; the twelfth, `ProblemErrorController`,
  implements Spring Boot's `ErrorController` and holds the only hand-written
  `@RequestMapping` in main code
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemErrorController.java`, "@RequestMapping(ERROR_PATH)"),
  for the `/error` forward rather than a contract route.
- **Layering** (§3 "Rétegzés", `backend/docs/02-backend.md`, "3. Rétegzés").
  Review-only; no ArchUnit or other package-dependency check exists. The
  controller only converts, HTTP to a domain call and a domain result to a DTO,
  with no business rule and no database call. The service holds every business
  rule, invariant and transaction boundary, sees no header, sets no status, and
  throws domain exceptions. The repository queries and persists, with no rule.
  No controller builds an error body except `ProblemErrorController`, which
  renders the `/error` forward's `ProblemDetails` itself
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemErrorController.java`, "ProblemDetails body = new ProblemDetails(");
  every other error body comes from the one `@RestControllerAdvice`,
  `ProblemAdvice`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "ProblemDetails body = new ProblemDetails(").
  Reference shape: `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java`
  ("public class CartController implements CartApi"),
  five methods that each delegate to `CartService`.
- **English error text** (§9, `backend/docs/02-backend.md`, "Felhasználónak szánt magyar szöveg hibaválaszban": no
  user-facing Hungarian text in an error response). Review-only. Every
  `ErrorCode` title is English
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java`, "public enum ErrorCode").
  Hungarian user-facing strings in main code appear only in non-error
  responses: the receipt notice `OrderService.NOTICE`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`, "static final String NOTICE")
  and the checkout option labels
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java`, "private CheckoutData.Options buildOptions").
- **Money is whole forints in an integer type; floating point is forbidden**
  (`backend/docs/04-adatbazis.md`, "Lebegőpontos típus pénzre tilos"). Review-only on the Java side. Entities
  hold `long` fields named `*Huf`, the mappers narrow to `int` with
  `Math.toIntExact` where they build the generated `Money`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderModels.java`, "Math.toIntExact(amount)"),
  `CartService` narrows the old and the new unit price of a price-change
  notice the same way
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "Math.toIntExact(oldPrice)")
  into the `Integer` `from` and `to` of `CartData.NoticeParams`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartData.java`, "record NoticeParams"),
  and main code has no `double`, `float` or `BigDecimal`.
- **No test starts, reaches or depends on the Docker PostgreSQL container**
  (§7.0, `backend/docs/02-backend.md`, "7.0 Kemény szabály: a tesztek nem használhatnak Docker-adatbázist", repeated in §9). Review-only:
  `@IntegrationTest` activates the `test` profile
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java`, "@ActiveProfiles"),
  whose datasource is in-memory H2
  (`backend/services/commerce/src/test/resources/application-test.properties`, "spring.datasource.url=jdbc:h2:mem"),
  but nothing applies that profile to a test without the annotation: the
  Gradle test tasks set none (`backend/services/commerce/build.gradle`, "tasks.named('test') { inputs.file",
  `backend/services/commerce/build.gradle`, "tasks.register('integrationTest', Test)" and
  `backend/services/commerce/build.gradle`, "tasks.withType(Test)") and `backend/services/commerce/src/test/resources` holds no
  other `application*.properties`. The annotation is the only
  `@SpringBootTest` in the tree today
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java`, "@SpringBootTest"),
  on 48 test classes, so a reviewer checks that a new Spring-context test
  carries it. The CI `postgres-smoke` job is the documented exception and is
  not a Gradle test (`backend/docs/02-backend.md`, "Egy kivétel van, és az nem teszt.").
- **The local database is reached only through the mise tasks and
  `deploy/compose.sh`**, never a direct `docker`, `docker compose` or outside
  `psql` (§1, `backend/docs/04-adatbazis.md`, "A helyi adatbázist a git gyökeréből futó mise-taskok kezelik";
  §9 points there).
  Review-only.
- **Gradle build code** is Groovy DSL (`backend/docs/02-backend.md`, "Groovy DSL").
  Observed, not written: the PMD block fails the build when the ruleset file
  is missing rather than let PMD analyse nothing and pass
  (`backend/services/commerce/build.gradle`, "PMD ruleset not found"); keep that check when the
  block changes.

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
- **Records** carry value types: 37 record declarations in main code, 31 of
  them nested in the four `*Data` interfaces. JPA entities and the seven
  `*Dto` classes are ordinary classes with accessors, and so is the Spring
  Security principal `AdminPrincipal`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/security/AdminPrincipal.java`, "public class AdminPrincipal"),
  whose `eraseCredentials()` clears its password hash.
- **Injection.** Main classes use constructor injection with `final` fields
  and no annotation. The one `@Autowired` in main code picks which of
  `CatalogLoader`'s two constructors Spring uses; the second is package-private
  for tests
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`, "@Autowired").
  The 48 `@IntegrationTest` classes, and no other test class, inject with
  `@Autowired private` fields (116). There is no Lombok.
- **No suppression.** No `// NOPMD`, no `@SuppressWarnings` and no
  `violationSuppressXPath` anywhere in the backend.

## 5. Observed patterns: nulls, JSON members, logging, time, money

- **Nulls.** No `@Nullable` and no `Objects.requireNonNull` in main code.
  Repositories return `Optional` for a lookup that can miss (10 declared
  repository methods plus the inherited `findById`; 17 `Optional<` in main in
  all). Those are resolved with `orElseThrow` (18 calls: 16 into a
  `DomainException`, one into the `UsernameNotFoundException` that Spring
  Security's `UserDetailsService` contract asks of `AdminUserDetailsService`
  (section 8), and one rethrowing a caught `DataIntegrityViolationException`
  in `AdminMediaService`), and in two places with `.orElse(null)`
  (`AdminProductCommandService`, `SessionService`; the third `.orElse(null)`
  in main ends a stream in `ProblemAdvice`). Inside a class, `null` means
  "absent": 14 `return null;`, mostly private lookup helpers such as
  `CartService.findLine`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "private CartItem findLine");
  `SessionService.loadByCookieToken` returns `null` for a missing or expired
  cookie
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionService.java`, "loadByCookieToken").
  A business failure is thrown, never returned as `null`.
- **JSON members.** A response omits a member whose value is `null`
  (`backend/services/commerce/src/main/resources/application.properties`, "spring.jackson.default-property-inclusion"),
  and a request with a member the contract does not declare is refused
  (`backend/services/commerce/src/main/resources/application.properties`, "spring.jackson.deserialization.fail-on-unknown-properties");
  the comment above them (`backend/services/commerce/src/main/resources/application.properties`, "JSON: omit absent optional members") gives the
  reason, and
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/JacksonNonNullTest.java`
  pins the first. The catalogue loader's DTOs opt out of the second with
  `@JsonIgnoreProperties(ignoreUnknown = true)`.
- **Logging.** SLF4J, declared as
  `private static final Logger log = LoggerFactory.getLogger(X.class);` in the
  four classes that log: `ProblemAdvice`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "LoggerFactory.getLogger(ProblemAdvice.class)"),
  `CatalogLoader`, `AdminBootstrap` and `DemoAccessBootstrap`. A 4xx response
  is logged at WARN without a stack trace
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "log at WARN without a stack trace"),
  an unhandled throwable at ERROR with the exception as the last argument, which
  SLF4J prints with its stack trace
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "handleUnexpected").
  15 of the 16 log calls sit
  inside an `isXEnabled()` guard; the one that does not,
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`
  ("catalogue present, {} products, loader skipped"),
  passes a plain variable to a `{}` placeholder.
- **Time.** Ten main classes take an injected `java.time.Clock`, whose bean is
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartClockConfig.java` ("cartClock"),
  and read the current time from it, so a test can fix the time.
  `SessionService` is the exception: it calls `OffsetDateTime.now()` directly
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionService.java`, "OffsetDateTime now = OffsetDateTime.now()"
  and `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionService.java`, "isAfter(OffsetDateTime.now())"). A pattern with an exception, not a written rule.
- **Money.** See the written rule in section 3.

## 6. Formatting

- **Indentation: CONFLICT.** 194 of the 198 Java files under
  `backend/services/commerce/src` have tab-indented lines, and no Java file has
  a space-indented code line (the four others have no indented code at all).
  `backend/services/commerce/build.gradle` and
  `backend/config/pmd/ruleset.xml` are tab-indented too. `.editorconfig`
  ("indent_style = space") sets `indent_style = space` and `indent_size = 2` for `[*]`, a section that
  matches every file (EditorConfig specification, section 8). No Java formatter
  is configured. Match the surrounding file; neither source is declared to win.
- **Braces.** `ControlStatementBraces` requires them (section 2). `else`,
  `catch` and `finally` start their own line after the closing brace (27, 30
  and 10 occurrences), apart from one `} catch` and one `} finally` in
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/catalog/ImageInspector.java`
  ("} catch (IOException ex)").
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
git grep -hE '(^|[^A-Za-z])record [A-Z]' -- 'backend/services/commerce/src/main/*Data.java' | wc -l   # 31 in the *Data interfaces
git ls-files 'backend/services/commerce/src/main/java/com/example/mi_bolt_backend/*/*' | cut -d/ -f10 | sort -u | wc -l   # 8 domain packages
for s in Controller Service Repository Data Models Dto; do printf '%s ' "$s"; git ls-files "backend/services/commerce/src/main/*$s.java" | wc -l; done   # 12 15 15 4 5 7
git grep -lE 'implements [A-Za-z]+Api' -- 'backend/services/commerce/src/main/*Controller.java' | wc -l   # 11 of the 12 controllers
git grep -o '@Autowired' -- 'backend/services/commerce/src/main/*.java' | wc -l                         # 1 in main
git grep -lE '^@IntegrationTest' -- 'backend/services/commerce/src/test/*.java' | wc -l                 # 48
git grep -o '@Autowired' -- 'backend/services/commerce/src/test/*.java' | wc -l                         # 116
git ls-files 'backend/services/commerce/src/test/java/com/example/mi_bolt_backend/api/model/*.java' | wc -l   # 2 deserialisation tests
git grep -o 'Optional<' -- 'backend/services/commerce/src/main/*.java' | wc -l                          # 17
git grep -o 'Optional<' -- 'backend/services/commerce/src/main/*Repository.java' | wc -l                # 10 repository declarations
git grep -o 'orElseThrow' -- 'backend/services/commerce/src/main/*.java' | wc -l                        # 18
git grep -n 'orElseThrow' -- 'backend/services/commerce/src/main/*.java' | grep -v 'DomainException'   # 3 lines: the two non-DomainException calls, and AdminAuthService, whose block returns one
git grep -o '\.orElse(null)' -- 'backend/services/commerce/src/main/*.java' | wc -l                     # 3
git grep -o 'return null;' -- 'backend/services/commerce/src/main/*.java' | wc -l                       # 14
git grep -hE '(^|[^A-Za-z_])log\.(trace|debug|info|warn|error)\(' -- 'backend/services/commerce/src/main/*.java' | wc -l   # 16 log calls
for k in else catch finally; do printf '%s ' "$k"; git grep -hE "^[[:space:]]+$k([^A-Za-z]|\$)" -- 'backend/services/commerce/src/*.java' | wc -l; done   # 27 30 10
git grep -nE '\}[[:space:]]*(else|catch|finally)([^A-Za-z]|$)' -- 'backend/services/commerce/src/*.java'   # the two in ImageInspector
```

The guard count is lower than the number of guarded calls because
`AdminBootstrap` puts two calls under one guard.

## 8. Sources outside the repository

- PMD 7.24.0 quickstart ruleset, the 124 active rules and the commented-out
  ones: https://github.com/pmd/pmd/blob/pmd_releases/7.24.0/pmd-java/src/main/resources/rulesets/java/quickstart.xml
  (the count agrees with `backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`
  ("(124 rules)")).
- PMD 7.24.0 Java rule index: https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java.html
- `ControlStatementBraces`, `ClassNamingConventions`, `MethodNamingConventions`,
  `FieldNamingConventions` and `EmptyControlStatement` defaults:
  https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java_codestyle.html
- `GuardLogStatement`, `SystemPrintln`, `AvoidReassigningParameters`,
  `MissingOverride`, `PreserveStackTrace`:
  https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_rules_java_bestpractices.html
- `SystemPrintln`'s console message, `Usage of System.out/err`, in the rule's
  source at the 7.24.0 release tag:
  https://github.com/pmd/pmd/blob/pmd_releases/7.24.0/pmd-java/src/main/resources/category/java/bestpractices.xml
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
- Spring Security's `UserDetailsService.loadUserByUsername` throws
  `UsernameNotFoundException` when the user could not be found:
  https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/userdetails/UserDetailsService.html
- `@Autowired` is needed on one constructor only when a bean has several:
  https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html
- `spring.jackson.default-property-inclusion` and
  `spring.jackson.deserialization.*` (Spring Boot 4.1.1):
  https://docs.spring.io/spring-boot/appendix/application-properties/index.html
- EditorConfig: `*` matches any file name in any directory below the file:
  https://spec.editorconfig.org/
