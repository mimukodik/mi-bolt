---
name: mibolt-cross-package-changes
description: >-
  Changing the MiBolt API contract, contracts/commerce/openapi.yaml, or what
  several packages share: new or changed endpoints, schema fields, enum values
  or error codes, regenerating clients, api:drift or contract-test failures,
  core-api, catalogue data. Load it before answering or changing anything that
  crosses the API, even when only one side is named. Not for using data the API
  already returns.
---

# MiBolt cross-package changes

This skill owns the artefacts with more than one consumer: the OpenAPI
contract and everything generated from it, the shared `core-api` library, the
frontend contract suite, and the catalogue data with its fixture. It gives the
order a change to them fans out in and the check that catches each step left
out. The consumer edits themselves belong to the area skills. A path that
starts with `scripts/` or `references/`, or is `SKILL.md`, is inside this
skill's directory; one that starts with a MiBolt skill name is inside the
directory that holds the MiBolt skills; every other path is relative to the
repository root. Every command runs from the repository root, as
`mibolt-workspace-ops` ("Where commands run") sets out, except the citation
checker, `mibolt-project-map/scripts/check-skill-references.mjs`, which runs
as written from the directory that holds the MiBolt skills (see "Keep this
skill current"). The consumer finder, this skill's own
`scripts/find-contract-consumers.mjs`, is printed with a
`<directory that holds the MiBolt skills>` placeholder: replace it with that
directory's path, absolute or from the root; that directory is the parent of
this skill's own directory. With a path that starts at the skill name
instead, the command exits 1 with `Cannot find module`, because such a path
is read from the directory that holds the MiBolt skills and does not resolve
from the root. The finder stays at the root even so: it searches the
repository it is started in, and from the directory that holds the MiBolt
skills it exits 2.

## Scope and hand-offs

In scope:

- `contracts/`: `contracts/commerce/openapi.yaml`,
  `contracts/commerce/kommunikacio.md`, the samples in
  `contracts/commerce/samples/` with `contracts/check-samples.sh`, the diagrams
  in `contracts/commerce/sequences/`, and the tools `contracts/mise.toml` pins.
- Code generation: `frontend/ng-openapi-gen.json`,
  `frontend/ng-openapi-gen.admin.json`, their outputs
  `frontend/projects/shop-api/src/generated/` and
  `frontend/projects/admin/src/app/api/generated/`, and the backend generation
  block, `backend/services/commerce/build.gradle` ("openApiGenerate").
- `frontend/projects/core-api/`, the library all three apps share.
- The contract suite: `frontend/tests/contract/`, run through
  `frontend/vitest.contract.config.ts`.
- `data/catalog/`, `tools/catalog-import/`,
  `frontend/scripts/build-catalog-fixture.mjs`,
  `frontend/docs/api/fixtures/catalog.json`, and
  `frontend/projects/storefront/public/media/`, a tracked copy of the
  catalogue images.

Out of scope, and where it goes. Consult an area skill once for each consumer
the change actually touches, not all of them up front:

| Work | Skill |
|---|---|
| storefront, demo-payment and shop-mocks code | `mibolt-shop-frontend` |
| the admin app and its own mocks | `mibolt-admin-frontend` |
| controllers, services, `ErrorCode`, `ProblemAdvice`, migrations, the catalogue loader | `mibolt-commerce-backend` |
| lint, type and style rules in that code | `mibolt-frontend-code-standards`, `mibolt-backend-code-standards` |
| which checks to run, and how CI jobs map to local commands; consult it at the end | `mibolt-verification` |
| mise tasks, CI workflows and path filters, compose, Dockerfiles | `mibolt-workspace-ops` |
| end-to-end specs in `frontend/e2e/` and plans in `frontend/specs/` | none of the MiBolt skills; `frontend/e2e/seed.spec.ts` is the suite's conventions file |

A change inside one app that touches no shared artefact does not need this
skill.

## How the shared artefacts connect

- **The contract is the source of truth.** `contracts/commerce/openapi.yaml`
  is OpenAPI 3.1.0 at `info.version` 2.3.0, with eleven tags
  (`contracts/commerce/openapi.yaml`, "- name: Catalog") and 34 operations, 19 for the shop
  and 15 for the admin. Where a document and the spec disagree the spec wins,
  and neither side may add an endpoint, field or status code the spec lacks
  (`contracts/commerce/kommunikacio.md`, "Source of truth").
- **`contracts/commerce/kommunikacio.md` carries what the spec cannot:**
  cookies, the version counter and If-Match, idempotency, the error table, the
  localisation boundary, and what neither side may do. It is written in
  English despite its Hungarian file name.
- **Three generated consumers:**

  | Output | Generator and configuration | Committed | Used by |
  |---|---|---|---|
  | shop SDK, `frontend/projects/shop-api/src/generated/` | ng-openapi-gen, `frontend/ng-openapi-gen.json`: every tag but the four admin ones | yes | storefront, demo-payment and shop-mocks, through `@mi-bolt/api/*` (`frontend/tsconfig.json`, "@mi-bolt/api/*") |
  | admin client, `frontend/projects/admin/src/app/api/generated/` | ng-openapi-gen, `frontend/ng-openapi-gen.admin.json`: the four admin tags only | yes | the admin app only, by relative import |
  | backend interfaces and models, in the Gradle build directory | OpenAPI Generator `spring` (`backend/services/commerce/build.gradle`, "generatorName = 'spring'"), fed the copy `prepareOpenApiSpec` derives (`backend/services/commerce/build.gradle`, "tasks.register('prepareOpenApiSpec')") | no: ignored, regenerated before every compile | one controller per tag implements its `<Tag>Api` |

- **If-Match** is left out of both frontend clients' signatures. The
  storefront attaches it with core-api's `withIfMatch`
  (`frontend/projects/core-api/src/demo-session.interceptor.ts`, "export function withIfMatch"), which
  `demoSessionInterceptor` turns into the header; demo-payment registers that
  interceptor but calls no operation that takes `If-Match`. The admin uses its
  own (`frontend/projects/admin/src/app/core/api/if-match.interceptor.ts`, "export function withIfMatch").
- **Problem codes** travel as the contract's `ProblemCode` enum
  (`contracts/commerce/openapi.yaml`, "ProblemCode:"). The backend's `ErrorCode` must
  match it name for name, because `ProblemAdvice` converts with
  `ProblemCode.valueOf`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "codeToWireCode").
- **core-api** (`frontend/projects/core-api/src/`) holds `resolveApiRoot`,
  `demoSessionInterceptor` with `withIfMatch`, and `dismissSplash`. The
  storefront and demo-payment use all three; the admin uses `resolveApiRoot`
  and `dismissSplash` and keeps its own interceptors
  (`frontend/projects/core-api/src/public-api.ts`, "Public API surface of core-api"). Each app opts in
  explicitly.
- **The contract suite**, `npm --prefix frontend run test:contract`, reads the
  contract at test time, drives the generated shop SDK against the shop-mocks
  handlers on MSW's Node server, and checks the committed fixture. Only
  `frontend/tests/contract/sdk-split.spec.ts` looks at admin operations; the
  rest drop them first (`frontend/tests/contract/admin-tags.ts`, "withoutAdminOperations").
- **The backend API tests** check responses against the contract file itself,
  not the derived copy
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/ContractValidation.java`, "Loads {@code contracts/commerce/openapi.yaml}").
- **The catalogue data** in `data/catalog/` seeds the backend, only into an
  empty database; the admin mock seed reads it directly; and
  `frontend/docs/api/fixtures/catalog.json` is generated from it for
  shop-mocks and the contract suite
  ([references/catalog-data.md](references/catalog-data.md)).

## Where to start

1. Run the consumer finder on the name you are changing, or on its nearest
   sibling when the name is new (next section).
2. Read the contract around that name, and
   `contracts/commerce/kommunikacio.md` when a protocol rule is involved.
3. Read the chain for your kind of change in
   [references/contract-change-chain.md](references/contract-change-chain.md).

Canonical examples, one per mechanism:

- `frontend/tests/contract/sdk-split.spec.ts`: how the tag split and the
  operation counts are pinned.
- `frontend/tests/contract/operation-matrix.spec.ts`: how every shop operation
  needs an SDK function and an MSW handler, derived from the spec at test time.
- `frontend/tests/contract/schema.spec.ts`: the spec's own invariants and the
  fixture checks.
- `contracts/check-samples.sh`: how samples are named and validated.
- `frontend/projects/core-api/src/demo-session.interceptor.ts`: a shared
  helper that each app opts into.

## Making a cross-package change

### Find every consumer first

Run the consumer finder from the repository root, which it reads as the
repository to search, with the directory placeholder replaced as the opening
paragraph says:

```text
node <directory that holds the MiBolt skills>/mibolt-cross-package-changes/scripts/find-contract-consumers.mjs --kind <kind> <Name>
```

It needs a git
checkout, git and Node 26 (the version `mise.toml`, "[tools]", pins), and it is
read-only: it runs only `git grep` and `git ls-files`, over tracked files,
leaving out the top-level directory that holds the MiBolt skills so that no
skill's own text counts as a consumer.

| `--kind` | The name must appear in the contract as | Spellings searched |
|---|---|---|
| `schema` | `#/components/schemas/<Name>`, or a schema key | the name in `contracts/`, its sample files, an import path ending in `models/<kebab-name>` and a quote, the name as a whole word in files that import the `@mi-bolt/api/models` barrel, and the Java `api.model.<Name>;` import |
| `operation` | `operationId: <Name>` | the name as a whole word everywhere, its generated function file in kebab case, and the operation's path from the contract, each `{param}` generalised, directly behind a quote, a backtick or `/api/v1`; a line only the path search found is marked `[path]` |
| `property` | a whole word | the name, and `get` or `set` followed by the name with its first letter capitalised |
| `enum` | a whole word | the value as written, in upper case and in lower case |

Exit codes: **0** when the name is in the contract as that kind, whether or
not anything else matched; **1** when it is not, with
`<Name> is not in the contract as kind <kind>; for a new one, use an existing sibling as the template (references/contract-change-chain.md)`
on stderr; **2** for a usage error (a missing or unknown `--kind`, a name that
is not an identifier), a run from outside the repository root, a missing
bucket root (`bucket root missing: <path>; the layout changed, update the script`),
or an operation whose method and path cannot be read from the contract
(`cannot derive the path of <Name> from contracts/commerce/openapi.yaml; the layout changed, update the script`).

The finder takes identifiers only: a numeric enum value such as a `StorageGb`
size exits 2. Run `--kind schema StorageGb` and `--kind property storageGb`
instead; the second reaches the catalogue data.

The output sorts hits into 16 buckets by path: contract, generated shop SDK,
generated admin client, storefront, demo-payment, core-api, admin app, admin
mocks, shop mocks, contract tests, e2e, backend main, backend test, catalogue
data and fixture, docs, other. An excerpt of a real run of
`--kind operation getCart`, exit 0, with every bucket header kept and most hit
lines cut; `<n>` stands for a bucket's hit count and `<line>` for a line
number:

```text
operation: GET /cart (path also searched, each {param} generalised, directly behind a quote, a backtick or /api/v1)
1. contract (<n>)
  contracts/commerce/kommunikacio.md:<line>: [path] (below). The `/cart*`, `/checkout*`, `/payment-intents*` and
  contracts/commerce/openapi.yaml:<line>:       operationId: getCart
2. generated shop SDK (<n>)
  frontend/projects/shop-api/src/generated/functions.ts:<line>: export { getCart as getCart } from './fn/cart/get-cart';
4. storefront (<n>)
  frontend/projects/storefront/src/app/features/cart/cart.facade.spec.ts:<line>: [path]     expect(requestsTo('GET', '/cart')).toHaveLength(1);
  frontend/projects/storefront/src/app/features/cart/cart.facade.ts:<line>:       const cart = await firstValueFrom(this.api.invoke(getCart, {}));
9. shop mocks (<n>)
  frontend/projects/shop-mocks/src/cart/cart.handlers.ts:<line>:   const getCart: RequestHandler = http.get('*/api/v1/cart', async ({ request }) => {
10. contract tests (<n>)
  frontend/tests/contract/schema.spec.ts:<line>:   'getCart',
11. e2e (<n>)
12. backend main (<n>)
  backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:<line>: 	public ResponseEntity<Cart> getCart() {
  backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartItem.java:<line>: 	public Cart getCart() {
13. backend test (<n>)
  backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartApiTest.java:<line>: [path] 		MvcResult first = mockMvc.perform(get("/cart"))
15. docs (<n>)

empty buckets: 3. generated admin client, 5. demo-payment, 6. core-api, 7. admin app, 8. admin mocks, 14. catalogue data and fixture, 16. other
not searched: backend generated sources under backend/services/commerce/build/generated/openapi (untracked, regenerated by the build)
path search misses a URL assembled from a constant plus a suffix, or ending in a concatenated parameter
hits are candidates: confirm each (a word match such as getCart also matches the entity getter CartItem.getCart)
```

Read it this way:

- **The first line is the operation as the contract declares it.** Its path
  is searched as well as its name, because the mocks and the backend API tests
  address an operation by method and URL and name it in a comment at most; a
  line only that search found is marked `[path]`. When other operations share
  the path, a `path shared with:` line names them, and a `[path]` hit may be
  theirs: `--kind operation addCartItem` prints
  `path shared with: DELETE clearCart`.
- **A path with no quote, backtick or `/api/v1` right in front of it is not a
  path hit**, which keeps most prose out. The contract's own path key, two
  lines above `contracts/commerce/openapi.yaml` ("operationId: getCart"), is such a line; the
  `operationId:` line the name search finds stands for it.
- **`empty buckets:` is where to look next, not a verdict.** The path search
  does not see a URL assembled from a constant plus a suffix, such as the one
  `archiveUrl` builds at
  `frontend/projects/admin/src/testing/mock-spec-helpers.ts` ("archiveUrl"), nor one
  ending in a concatenated parameter, such as `get("/admin/products/" + id)`
  at
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/admin/catalog/AdminProductReplaceApiTest.java` ("replaceChangingTheNameAnswers200WithTheNextEtag"),
  which the `getAdminProduct` run leaves out. Search for those two shapes by
  hand when a bucket you expect to hold a consumer is empty.
- **Hits are candidates.** `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartItem.java` ("public Cart getCart()") above is an entity getter that
  shares the name, not the operation, and `contracts/commerce/kommunikacio.md` ("2. Session") is prose.
- **For an error code use `--kind enum`.** `--kind enum PRICE_CHANGED` ran on
  the same day with exit 0 and hits in the contract (11), both generated
  clients (5 and 2), the storefront (25), shop mocks (4), the contract tests
  (1), e2e (1), backend main (7) and test (8), and docs (7).
  `--kind schema ProblemCode` searches the schema name rather than its values
  and finds no storefront hit at all.

### The fan-out order

1. **Contract.** Edit `contracts/commerce/openapi.yaml`, together with the
   examples, samples and `contracts/commerce/kommunikacio.md` rows the change
   touches (chain reference, section 2), and check it with
   `mise run contracts:check`.
2. **Regenerate** with `mise run api:generate`. It rewrites the tracked files
   of both frontend clients and regenerates the backend interfaces in the
   Gradle build directory, which git ignores
   ([references/codegen.md](references/codegen.md), section 3).
3. **Contract suite.** Update the counts, lists and fixtures in
   `frontend/tests/contract/` that your chain names.
4. **Consumers**, each through its own skill and in any order: the backend,
   the shop side and the admin side, as far as the finder's buckets reach.
5. **Catalogue fixture**, when catalogue data or the `Product` shape changed:
   `npm --prefix frontend run fixtures:catalog`, then
   `npm --prefix frontend run fixtures:catalog:check`.
6. **The contract, the regenerated clients and their consumers are one
   change**, because the checks fail on the pieces apart: the `api-drift` CI
   job fails whenever the committed clients differ from what the committed
   contract generates, and most consumer steps left for later fail the
   contract suite, the backend tests or a type check, as the table under
   "What fails when a step is skipped" lists. Locally, `api:drift` compares
   the regenerated clients with the git index, so it passes only once they
   are staged or committed beside the contract
   ([references/codegen.md](references/codegen.md), section 3).
7. **Verify** with the checks `mibolt-verification` names for each changed
   path, the commands in `mibolt-verification` ("Gates before a commit")
   among them.

### By kind of change

| Change | What moves besides the contract and the regenerated clients | Chain |
|---|---|---|
| a field on a schema | examples and samples, the contract-suite fixtures when a shop operation returns the schema, the backend mapper and a migration when the field is stored, and the mocks of each client whose generated `models/` holds the schema: `Product` is in the shop SDK only and also moves the catalogue fixture, the `Admin*` schemas are in the admin client only | section 3 |
| a field on the admin product form | both `AdminProductInput`, the write, where a limit such as `maxLength` goes, and `AdminProduct`, the read the form loads, since each is `additionalProperties: false`, then what the row above lists for an `Admin*` schema; `Product` and the shop side change only if the storefront shows the field too | section 3 |
| a new shop operation | the counts and lists in the contract suite, a shop-mocks handler, a backend controller method | section 4 |
| a new admin operation | the `sdk-split` counts, an admin mocks handler, a backend controller method | section 5 |
| a new enum value | every consumer that must cover all values, backend string constants, and the discriminator guard for four of them | section 6 |
| a new error code | `ErrorCode`, the error table in `kommunikacio.md`, each app's handling and Hungarian text | section 7 |
| an If-Match or header change | the callers' `withIfMatch`, the contract suite's header sets | section 8 |
| a removal or a rename | everything the finder lists, in one change | section 9 |
| a core-api helper | the export, and an explicit opt-in in each app | section 10 |
| catalogue data | the fixture, the admin seed, the loader's empty-database rule, and for an image its copy under `frontend/projects/storefront/public/media/` | [references/catalog-data.md](references/catalog-data.md) |

The sections are in
[references/contract-change-chain.md](references/contract-change-chain.md).

## Rules that bind this work

One line each; the source named owns the rule.

- **Never edit generated code by hand**; change the contract or a generator
  configuration and regenerate. Sources: `frontend/docs/api/README.md` ("Never edited by hand"),
  `frontend/README.md` ("never edited by hand"), `backend/docs/02-backend.md` ("Generált kód a verziókezelőben vagy kézi szerkesztése"), and the header of
  every generated file (`frontend/projects/shop-api/src/generated/api.ts`, "Code generated by ng-openapi-gen DO NOT EDIT.").
- **The spec is authoritative, and no side adds what it lacks**:
  `contracts/commerce/kommunikacio.md` ("Source of truth") and its section 9,
  `contracts/commerce/kommunikacio.md` ("9. What neither side may do").
- **The server sends codes and parameters, and the UI writes the Hungarian
  text**; `title` and `detail` are English developer text
  (`contracts/commerce/kommunikacio.md`, "6. The localisation boundary").
- **Search an identifier in every spelling the repository gives it** before
  concluding it has no consumer, as the finder does for contract names:
  `AddCartItemRequest` in code is `add-cart-item-request.ts` as its generated
  model file. This skill owns that rule; [references/codegen.md](references/codegen.md),
  section 2, shows the file-name spelling.
- **A removed or renamed contract name leaves nothing behind in any layer
  the finder lists**, the backend included, with no compatibility shim. This
  skill owns that rule; `mibolt-frontend-code-standards` ("Removed features")
  states the same rule for a cut frontend feature.
- **Every defect fixed here gets a test in the same change**, seen failing
  before the fix and passing after; `mibolt-verification` ("Tests and
  coverage") owns that rule, and the rule that coverage is held to an
  aggregate floor.
- **Name a sample after its schema**, with an optional case part
  (`contracts/check-samples.sh`, "<Schema>.json and <Schema>.<case>.json").
- **When `prepareOpenApiSpec` fails, update the replacement its message
  names**, keeping each of the four blocks an exact-once match; a new
  discriminated subtype goes through
  `backend/docs/decisions/0001-openapi-generator-and-discriminator-workaround.md`
  first ([references/codegen.md](references/codegen.md), section 4).
- **Running the catalogue importer scrapes yettel.hu**, an external site,
  replaces `data/catalog/catalog.json` and writes its images into
  `data/catalog/images/`: run it only when the user has
  agreed to that scrape by name, never as part of a wider go-ahead. A change
  that an edit to `data/catalog/catalog.json` can make needs no importer run
  ([references/catalog-data.md](references/catalog-data.md), section 2).

## What fails when a step is skipped

| Step skipped | What fails | Where it runs |
|---|---|---|
| regenerating, or staging the regenerated clients | `api:drift`: it regenerates, then runs `git diff --exit-code` and an untracked-file test over both client directories (`frontend/package.json`, "npm run api:generate && git diff --exit-code") | the `api-drift` CI job (`.github/workflows/frontend.yml`, "API client drift"), `mise run api:drift`, `mise run verify` (`mise.toml`, "[tasks.verify]") |
| leaving a generated file as hand-edited | the same `api:drift`, since regeneration overwrites the edit | as above |
| updating a spec example or a sample the change invalidated | examples on a shop operation: `frontend/tests/contract/schema.spec.ts` ("every media-type example on responses and requestBodies validates against its own schema"); samples: `contracts/check-samples.sh` | `npm --prefix frontend run test:contract`; `mise run contracts:check` and the Contracts CI workflow (`.github/workflows/contracts.yml`, "OpenAPI lint, samples, sequences") |
| moving the operation counts, 15 admin and 19 shop | `frontend/tests/contract/sdk-split.spec.ts` ("declares exactly 15 admin operations and 19 others"), and for an admin operation `frontend/tests/contract/sdk-split.spec.ts` ("every admin operationId is exported by the admin functions module"); for a shop operation also `REQUIRED_OPERATION_COUNT` (`frontend/tests/contract/response-validation.ts`, "REQUIRED_OPERATION_COUNT") and `EXPECTED_OPERATION_IDS` (`frontend/tests/contract/schema.spec.ts`, "EXPECTED_OPERATION_IDS") | `npm --prefix frontend run test:contract` |
| a shop-mocks handler for a new shop operation | `operation-matrix` parity, "MSW handlers missing for" (`frontend/tests/contract/operation-matrix.spec.ts`, "registers a business handler for every operationId") | `npm --prefix frontend run test:contract` |
| updating the replacement for an edited discriminator block | `prepareOpenApiSpec`'s exactly-once guard (`backend/services/commerce/build.gradle`, "expected the ${r.name} block to appear exactly") | every backend compile |
| matching the `ErrorCode` and `ProblemCode` names | `ErrorCodeTest`, which pins the two enums to the same names in both directions and pins the number of `ErrorCode` constants, so a new code also means raising that count (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/problem/ErrorCodeTest.java`, "class ErrorCodeTest"); nothing fails at compile time, and at run time an `ErrorCode` with no `ProblemCode` would throw `IllegalArgumentException` in the strict `valueOf` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`, "ProblemCode.valueOf(code.name())", https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Enum.html) | the backend unit tests, `backend/gradlew -p backend :services:commerce:test`, and every backend build |
| a backend controller method for a new operation | nothing at compile time: the generated interface supplies a default method ([references/codegen.md](references/codegen.md), section 4) | a backend API test for the operation, or the app on the real backend |
| following a generated model change in shop-mocks | its code stops type-checking: 14 files under `frontend/projects/shop-mocks/src/` import generated models, 10 through `@mi-bolt/api/models/*` and 4 through the `@mi-bolt/api/models` barrel | every command that compiles shop-mocks; `mibolt-verification` names them |
| an admin mocks handler for a new admin operation | nothing: no contract test covers the admin mocks | the admin app in a browser |
| regenerating the catalogue fixture after a data change | `fixtures:catalog:check` exits 1, but it is manual-only: no workflow or mise task runs it. The contract suite catches only a changed product count or a product `Product` rejects (`frontend/tests/contract/schema.spec.ts`, "catalog.json contains one product per entry of data/catalog/catalog.json", `frontend/tests/contract/schema.spec.ts`, "every fixture product validates against the OpenAPI Product schema") | `npm --prefix frontend run fixtures:catalog:check`, run by hand |

No backend drift check exists, and none is needed: the backend output is never
committed (`backend/.gitignore`, "build/") and is regenerated before every compile.

## How to verify

These are the checks this skill's artefacts own; `mibolt-verification` owns
the full set for a change and how CI maps onto them.

| Command | What it proves | Side effects |
|---|---|---|
| the consumer finder, the command under "Find every consumer first" | nothing by itself: it lists candidates; the step is done when every non-empty bucket is handled or dismissed, and, for `--kind operation`, every empty one that should hold a consumer has been searched by hand for the two URL shapes the path search misses | none |
| `mise run contracts:check` | `vacuum lint` passes on the contract, every sample validates against its schema, and `plantuml -checkonly` passes on the diagrams (`contracts/mise.toml`, "[tasks.check]"), which the file's header calls a syntax check (`contracts/mise.toml`, "PlantUML syntax of the sequence diagrams"); `-checkonly` is PlantUML's legacy spelling, no longer documented: the current CLI lists `--check-syntax`, "Check diagram syntax without generating images" (https://plantuml.com/command-line), and keeps legacy options for a transition period (https://github.com/plantuml/plantuml/issues/2377) | `contracts/check-samples.sh` writes only into a temporary directory it deletes on exit (`contracts/check-samples.sh`, "mktemp -d"); the tools are pinned in `contracts/mise.toml` ("[tools]"), and CI installs them first (`.github/workflows/contracts.yml`, "Install the contract tools") |
| `npm --prefix frontend run test:contract` | the contract suite passes, in a Node environment (`frontend/vitest.contract.config.ts`, "environment: 'node'"); its `tests/**/*.spec.ts` glob also runs the other specs under `frontend/tests/` | none |
| `mise run api:drift` | the clients in the index equal what the working-tree contract generates; in CI, with nothing staged, that the committed clients match the committed contract | rewrites the tracked files in both client directories before it compares them, as `api:generate` does |
| `npm --prefix frontend run fixtures:catalog:check` | the committed fixture matches `data/catalog/catalog.json`; silent exit 0 when it does | none |
| `mise run api:generate`, `npm --prefix frontend run fixtures:catalog` | nothing: these write, they do not check | `api:generate` rewrites both client directories and the backend output in the Gradle build directory; `fixtures:catalog` rewrites `frontend/docs/api/fixtures/catalog.json` |

Done means: the finder's buckets are accounted for, the contract checks and the
contract suite pass, the regenerated clients are staged beside the contract so
that `api:drift` passes, and each consumer's own checks have passed through its
skill and `mibolt-verification`.

Tool references: vacuum, https://quobix.com/vacuum/commands/lint/;
check-jsonschema, https://check-jsonschema.readthedocs.io/en/stable/usage.html;
ng-openapi-gen, https://github.com/cyclosproject/ng-openapi-gen; OpenAPI
Generator's `spring` generator,
https://openapi-generator.tech/docs/generators/spring.

## What to read, and when

- [references/contract-change-chain.md](references/contract-change-chain.md):
  read before editing `contracts/commerce/openapi.yaml`, and when the finder
  exits 1 for a name that is not in the contract yet.
- [references/codegen.md](references/codegen.md): read when `api:drift` is
  red, locally or in CI (section 5 has the causes, including a rebase that
  changed the lockfile), when regeneration misbehaves, when a model is missing
  from one client, when the backend build fails in `prepareOpenApiSpec`, or
  before changing a generator configuration or the backend generation block.
- [references/catalog-data.md](references/catalog-data.md): read when anything
  under `data/catalog/` changes, before running the importer, or when a
  catalogue consumer disagrees with the data.

Sources in the repository: `contracts/commerce/kommunikacio.md` for every
protocol rule; `frontend/docs/api/README.md` for the two SDKs and the fixture;
`README.md` ("Changing the API contract") for the contract workflow as the README gives it; and the
decisions `backend/docs/decisions/0001-openapi-generator-and-discriminator-workaround.md`,
`backend/docs/decisions/0005-yettel-catalog-import-script.md` and
`backend/docs/decisions/0014-openapi-tags-and-admin-contract.md`.

## Keep this skill current

Update this skill and its references in the same change as any of these:

- the tags in `contracts/commerce/openapi.yaml` ("- name: Catalog"), or the operation counts
  (34, 19 and 15);
- `frontend/ng-openapi-gen.json` or `frontend/ng-openapi-gen.admin.json`;
- the `api:*` and `fixtures:catalog*` scripts in `frontend/package.json` ("scripts"),
  or the root tasks behind `mise run api:generate`, `mise run api:drift` and
  `mise run contracts:check` (`mise.toml`, "Regenerate the frontend API clients"; `mise.toml`, "Fail when the committed frontend API clients differ"; `mise.toml`, "Lint the contract, validate the samples");
- the openapi block of `backend/services/commerce/build.gradle` ("openApiGenerate");
- `frontend/projects/core-api/src/public-api.ts`;
- `data/catalog/catalog.schema.json` or
  `frontend/scripts/build-catalog-fixture.mjs`;
- how `frontend/projects/storefront/public/media/` is filled or read, today a
  copy of `data/catalog/images/` that no tracked file regenerates;
- the counts and lists in `frontend/tests/contract/` that the chains cite;
- the finder's bucket roots, `BUCKET_ROOTS` in
  `scripts/find-contract-consumers.mjs`; its exit 2 with `bucket root missing`
  or `cannot derive the path` is the signal that the layout moved.

Check every path, section name and command cited here, from the directory
that holds the MiBolt skills, with
`node mibolt-project-map/scripts/check-skill-references.mjs mibolt-cross-package-changes`.
A citation names its target, a heading, task, function, key or distinctive
phrase, and never gives a line number. Run the checker again after any edit to
a file or a MiBolt skill this skill cites by name, whether or not the list
above names it, and reread each cited section against the claim beside it,
because check (e) only confirms that the name still occurs somewhere in the
target, so it still passes a renamed section whose old name occurs elsewhere
in the cited file or skill
(`mibolt-project-map/references/citation-check.md` ("What it checks")).
