# 0009 — PMD quickstart lint gate

## Situation

The backend ships with 87 unit and 54 integration tests, a JaCoCo LINE
≥ 0.90 gate, and a hand-written imports-not-FQN rule that has so far
only been policed by humans and the build's own compile errors. There
is no static analysis tool behind `build`, so the imports rule, the
unused-import rule, and the dead-code rule cannot drift before a code
review catches them. The task is to plug that gap with one tool whose
defaults already enforce those three rules, and whose integration into
the Gradle build is one config block plus one rule set file, with no
new dependencies. The workflow gained one `Lint (PMD)` job (parallel to
the test jobs) at the user's request, and `check` also runs PMD inside
the gate job as a second line of defence.

## Options

1. **PMD quickstart via the Gradle core plugin.** Apply PMD's
   `rulesets/java/quickstart.xml` (124 rules) through the `pmd` plugin
   that ships with Gradle 9.7.1. The plugin registers `pmdMain` and
   `pmdTest`, wires both into `check` automatically, and runs them in
   the existing `coverage-gate` job (`./gradlew build jacocoTestReport
   -x test -x integrationTest --continue`); the workflow also gained a
   dedicated `Lint (PMD)` job that runs PMD on its own, parallel to the
   test jobs.
2. **Checkstyle.** A separate plugin (`checkstyle`) with a separate
   dependency (the Checkstyle JAR), a separate config file, and a
   largely overlapping but different rule set. Checkstyle's
   `RedundantImport` rule covers the same ground as PMD's
   `UnnecessaryImport` but neither ships a `UseUtilityClass` or a
   `GuardLogStatement` that matches the project's intent, and pulling
   in a second tool just to cover one rule the first already has is
   not justified.
3. **SpotBugs.** A separate plugin that runs on bytecode (not source),
   is heavier to configure, and addresses a different class of bugs
   (null-deref, resource-close) than the imports/dead-code/unused-log
   set this record opens with. Out of scope for the gap at hand.

Option 2 is rejected because Checkstyle duplicates one rule PMD already
covers and adds nothing for the three rules the gap is actually about.
Option 3 is rejected because SpotBugs targets a different defect
class. Option 1 is chosen because the Gradle `pmd` plugin is in the
distribution already (no extra dependency), the `quickstart` rule set
already contains the three rules the gap is about
(`UnnecessaryFullyQualifiedName`, `UnnecessaryImport`,
`UnusedLocalVariable`), and both new tasks chain off `check`; the
workflow change is limited to a parallel `Lint (PMD)` job for visibility.

## Decision

Add `id 'pmd'` to the plugins block in `build.gradle` (no version,
Gradle core plugin), a `pmd { ... }` extension block pinning
`toolVersion = '7.24.0'` and pointing `ruleSetFiles` at
`config/pmd/ruleset.xml` with `ruleSets = []` (the empty list is
required — without it the plugin adds the default rule sets on top of
the file, and the quickstart already covers everything in them). Add a
`tasks.named('pmdMain') { exclude '**/com/example/mi_bolt_backend/api/**' }`
block to keep the generated OpenAPI sources out of the analysis on
`pmdMain` only (the same set JaCoCo already excludes under decision
0004); the hand-written tests under the same package name in `src/test`
must stay inside the gate, so the exclude is scoped to `pmdMain` and not
applied to `pmdTest` via `withType(Pmd)`.

7.24.0 is the newest PMD the Gradle 9.7.1 plugin documents support for
(`docs.gradle.org/9.7.1/userguide/pmd_plugin.html`, read 2026-09-20).

## Findings fixed before the gate went green

First `pmdMain` run: 16 violations. First `pmdTest` run: 8 violations
(measured with the plain quickstart, before any exclusion). Total 24:
22 fixed in the second commit of this branch, `UseUtilityClass` excluded
and `MethodNamingConventions` configured instead (see Exclusions):

| Rule | Main | Test | Total |
| --- | --: | --: | --: |
| `UnnecessaryImport` | 2 | 4 | 6 |
| `GuardLogStatement` | 4 | 0 | 4 |
| `AssignmentInOperand` | 4 | 0 | 4 |
| `UseUtilityClass` | 1 | 0 | 1 (excluded) |
| `UnusedFormalParameter` | 1 | 1 | 2 |
| `OneDeclarationPerLine` | 1 | 0 | 1 |
| `PreserveStackTrace` | 1 | 0 | 1 |
| `EmptyControlStatement` | 1 | 0 | 1 |
| `UncommentedEmptyConstructor` | 1 | 0 | 1 |
| `UncommentedEmptyMethodBody` | 0 | 1 | 1 |
| `SimplifiableTestAssertion` | 0 | 1 | 1 |
| `MethodNamingConventions` | 0 | 1 | 1 (configured) |

### Code changes required by rules

- `MiBoltBackendApplication.java` — no change; the `UseUtilityClass` rule
  is excluded (see Exclusions).
- `CatalogLoader.java` — `UnusedFormalParameter` (removed the unused
  `CatalogDto catalog` parameter from the private `persist` method),
  `OneDeclarationPerLine` (split `int a, b, c;` into one declaration
  per line), `AssignmentInOperand` ×4 (extracted `pos++`, `cpos++`,
  `spos++`, `rpos++` to a separate statement), `GuardLogStatement`
  (wrapped the final summary log in `isInfoEnabled`).
- `CatalogValidator.java` — `PreserveStackTrace` (passed the caught
  `DateTimeParseException` as the `cause` of the new
  `CatalogValidationException`).
- `MediaController.java` — `UnnecessaryImport` (removed unused
  `org.springframework.http.CacheControl`).
- `ProductDto.java` — `UnnecessaryImport` (removed unused
  `java.time.LocalDate`).
- `ProblemAdvice.java` — `GuardLogStatement` ×3 (wrapped `log.debug`,
  `log.warn`, `log.error` calls in `isXxxEnabled`), `EmptyControlStatement`
  (removed the empty `else if (c == ']')` branch in `toJsonPointer` by
  flipping the comparison to `else if (c != ']')`).
- `ShopSession.java` — `UncommentedEmptyConstructor` (added a one-line
  comment naming the JPA no-arg requirement).
- `MiBoltBackendApplicationTests.java` — `UncommentedEmptyMethodBody`
  (added a one-line comment to the `contextLoads` body).
- `CatalogValidatorTest.java` — `UnusedFormalParameter` (removed the
  unused `Path tmp` parameter from the `validCatalog` helper and
  updated the 14 callers that passed the now-unused temp dir).
- `SessionTokenServiceTest.java` — `SimplifiableTestAssertion`
  (replaced `assertTrue(a.equals(b))` with `assertEquals(b, a)`).
- `ContractValidatorTest.java` — `UnnecessaryImport` (removed unused
  `com.atlassian.oai.validator.model.SimpleRequest`).
- `JacksonNonNullTest.java` — `UnnecessaryImport` ×3 (removed the
  static `MockMvcResultMatchers.content` import, plus the unused
  `Address` and `Address.CountryCodeEnum` imports; `java.time.LocalDate`
  stayed — it is used by the
  `productsEmptyVariantsListIsSerialisedAsEmptyArray` fixture).

### Excluded rules

| Rule | Reason |
| --- | --- |
| `UseUtilityClass` | Excluded project-wide (a ruleset `<exclude>` is project-wide, not per-class); today the only hit was the Spring Boot entry point (`@SpringBootApplication`, one static `main`), which is a false positive because a `final` class with a private constructor breaks the first non-static `@Bean` method added to it and PMD 7.24.0 has no annotation-ignore property on this rule. Acceptable for the demo MVP. |
| `MethodNamingConventions` | Configured, not excluded: a second `<rule ref>` re-adds the rule with `junit5TestPattern = "[a-z][a-zA-Z0-9]*\|f[0-9]+_[a-zA-Z0-9]*"`, which also accepts the smoke marker form (`SmokeF6Test.f6_imageServingWorks`, the only method in that form today). The production-code naming rule is kept on. |

## Gate proof

Injecting `java.util.List<String> probe = new java.util.ArrayList<>();`
into `SessionTokenServiceTest.stateVersionDefaultsToOne()` (with the
two matching imports added so the FQN is genuinely unnecessary) caused
`./gradlew pmdTest` to fail with five violations on that file, two of
them `UnnecessaryFullyQualifiedName`:

```
src/test/java/com/example/mi_bolt_backend/session/SessionTokenServiceTest.java:52: UnnecessaryFullyQualifiedName: Unnecessary qualifier 'java.util': 'List' is already in scope because it is imported in this file
src/test/java/com/example/mi_bolt_backend/session/SessionTokenServiceTest.java:52: UnnecessaryFullyQualifiedName: Unnecessary qualifier 'java.util': 'ArrayList' is already in scope because it is imported in this file
```

The probe and the two temporary imports were removed; `git status
--short` is clean for that file.

## CI effect

CI runs PMD as its own `Lint (PMD)` job, parallel to the two test
jobs, so a finding is visible as a red job of its own with the reports
uploaded as the `pmd-reports` artifact. The `Lint (PMD)` job is
independent of the `coverage-gate` job: a PMD failure does not wait on
or hide the JaCoCo gate, and the gate job's own `build` (through
`check`) runs PMD again as a second line of defence.

## Sources

- https://docs.gradle.org/9.7.1/userguide/pmd_plugin.html — the
  plugin is a Gradle core plugin (no extra dependency), `pmdMain` and
  `pmdTest` are registered automatically, and `toolVersion` is the
  only knob that pins the PMD distribution; 7.24.0 is the newest
  version the 9.7.1 plugin documents support for (read 2026-09-20).
- https://github.com/pmd/pmd/tree/pmd_releases/7.24.0/rulesets/java/quickstart.xml
  — the 124 rules the quickstart ships, including
  `UnnecessaryFullyQualifiedName`, `UnnecessaryImport`,
  `UnusedLocalVariable`, `UseUtilityClass`, `GuardLogStatement`,
  `PreserveStackTrace`, `EmptyControlStatement`,
  `UncommentedEmptyConstructor`, `UncommentedEmptyMethodBody`,
  `UnusedFormalParameter`, `AssignmentInOperand`,
  `OneDeclarationPerLine`,
  `SimplifiableTestAssertion`, and `MethodNamingConventions`.
- https://docs.gradle.org/9.7.1/userguide/pmd_plugin.html#sec:pmd_ruleset_files
  — the reason `ruleSets = []` is required alongside `ruleSetFiles`:
  without it the plugin adds the default rule sets on top of the file,
  and the quickstart already covers everything in them.

## Amendment 2026-09-20: no inline FQNs, four more rules

The quickstart ships `UnnecessaryFullyQualifiedName`, which only reports
an FQN whose simple name is already imported by the file. An FQN whose
target type has no import in the file passes it, because the rule is
"you don't need this qualifier" rather than "never inline a qualified
type reference". Measured on this branch with the probe

```java
java.util.Map<String, Object> probe = new java.util.HashMap<>();
probe.put("k", org.springframework.http.HttpStatus.OK);
```

added to a test file that imports neither `java.util` nor
`org.springframework.http`: `UnnecessaryFullyQualifiedName` reports 0
violations. The project rule is the stricter "imports, never inline
FQNs", so the amendment adds a custom XPath rule named
`NoFullyQualifiedNames` whose xpath is `//ClassType[@FullyQualified =
true()]` and whose message is "Do not inline a fully qualified type
name; add an import instead.". The XPath catches every Java type
reference PMD treats as fully qualified: generic type arguments (the
`Map<String, Object>` here), `new` expressions (the `new
java.util.HashMap<>()`), qualified static member access
(`HttpStatus.OK`), and qualified annotation usage. It does not touch
imports (which are not `ClassType` nodes), package declarations, or
javadoc `{@link}` references (javadoc is a comment and is not parsed
as code). Gate-bite proof on this branch: adding the probe above as
the first statement of `validatorAcceptsValidProblemBody()` in
`ContractValidatorTest.java` made `./gradlew pmdTest` fail with three
`NoFullyQualifiedNames` lines on that file at line 33, one per
qualifier; removing the probe returned the file to clean.

Four plain rule references are also added after the custom rule:
`SystemPrintln` (no `System.out.print` in production code),
`AvoidReassigningParameters` (parameters are inputs, never scratch
storage), `AvoidUncheckedExceptionsInSignatures` (no unchecked
exception declared in a `throws` clause — the compiler does not
enforce it and the declaration is noise), and
`AvoidThrowingRawExceptionTypes` (no `throw new RuntimeException(...)`
— throw a typed subclass so callers can react specifically). The
amendment-run produced exactly three findings, all fixed in the next
commit:

- `src/main/java/com/example/mi_bolt_backend/problem/UnknownQueryParameterInterceptor.java:36`
  — `AvoidUncheckedExceptionsInSignatures`: `UnknownQueryParameterException`
  extends `RuntimeException`, so the `throws` clause listed an unchecked
  exception; the clause was deleted (it was the only declared
  exception).
- `src/test/java/com/example/mi_bolt_backend/catalog/CatalogLoaderTest.java:309`
  — `AvoidThrowingRawExceptionTypes`: `throw new RuntimeException(e);`
  became `throw new UncheckedIOException(e);` (the brief named
  `IllegalStateException`; the code-review pass chose `UncheckedIOException`, which keeps the I/O semantics).
- `src/test/java/com/example/mi_bolt_backend/test/FixtureControllers.java:95`
  — `AvoidThrowingRawExceptionTypes`: `throw new
  RuntimeException("kaboom");` became `throw new
  IllegalStateException("kaboom");`.

No test asserted on the type of either raw `RuntimeException`, so no
test changes were needed.

The amendment considered and rejected four neighbouring rules.
`AvoidDuplicateLiterals` was rejected because it fired 24 times in the
test fixtures and every hit was a deliberate reuse of an error code or
status string. `UnnecessaryLocalBeforeReturn` and `AvoidCatchingNPE`
were rejected because PMD 7.24.0 deprecates both (removal slated for
8.0.0). `UselessParentheses` was rejected because the quickstart
already covers it.

Sources:

- https://docs.pmd-code.org/pmd-doc-7.24.0/pmd_userdocs_extending_writing_xpath_rules.html
  — the XPath rule contract and the `ClassType` selector's
  `@FullyQualified` attribute.
- https://docs.pmd-code.org/apidocs/pmd-java/7.24.0/net/sourceforge/pmd/lang/java/ast/ASTClassType.html
  — the `ASTClassType` node and its `FullyQualified` boolean
  attribute, which is true for every qualified type reference
  regardless of whether a matching import exists.
