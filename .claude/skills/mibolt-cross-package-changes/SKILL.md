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
out. The consumer edits themselves belong to the area skills. Every path here
is relative to the repository root, and every command runs from there.

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
  block, `backend/services/commerce/build.gradle:39-139`.
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
| end-to-end specs in `frontend/e2e/` and plans in `frontend/specs/` | `playwright-tests` |

A change inside one app that touches no shared artefact does not need this
skill.

## How the shared artefacts connect

- **The contract is the source of truth.** `contracts/commerce/openapi.yaml`
  is OpenAPI 3.1.0 at `info.version` 2.3.0, with eleven tags
  (`contracts/commerce/openapi.yaml:56-77`) and 34 operations, 19 for the shop
  and 15 for the admin. Where a document and the spec disagree the spec wins,
  and neither side may add an endpoint, field or status code the spec lacks
  (`contracts/commerce/kommunikacio.md:11-19`).
- **`contracts/commerce/kommunikacio.md` carries what the spec cannot:**
  cookies, the version counter and If-Match, idempotency, the error table, the
  localisation boundary, and what neither side may do. It is written in
  English despite its Hungarian file name.
- **Three generated consumers:**

  | Output | Generator and configuration | Committed | Used by |
  |---|---|---|---|
  | shop SDK, `frontend/projects/shop-api/src/generated/` | ng-openapi-gen, `frontend/ng-openapi-gen.json`: every tag but the four admin ones | yes | storefront, demo-payment and shop-mocks, through `@mi-bolt/api/*` (`frontend/tsconfig.json:18`) |
  | admin client, `frontend/projects/admin/src/app/api/generated/` | ng-openapi-gen, `frontend/ng-openapi-gen.admin.json`: the four admin tags only | yes | the admin app only, by relative import |
  | backend interfaces and models, in the Gradle build directory | OpenAPI Generator `spring` (`backend/services/commerce/build.gradle:89-114`), fed the copy `prepareOpenApiSpec` derives (`backend/services/commerce/build.gradle:67-87`) | no: ignored, regenerated before every compile | one controller per tag implements its `<Tag>Api` |

- **If-Match** is left out of both frontend clients' signatures. The
  storefront attaches it with core-api's `withIfMatch`
  (`frontend/projects/core-api/src/demo-session.interceptor.ts:85`), which
  `demoSessionInterceptor` turns into the header; demo-payment registers that
  interceptor but calls no operation that takes `If-Match`. The admin uses its
  own (`frontend/projects/admin/src/app/core/api/if-match.interceptor.ts:6`).
- **Problem codes** travel as the contract's `ProblemCode` enum
  (`contracts/commerce/openapi.yaml:2315-2343`). The backend's `ErrorCode` must
  match it name for name, because `ProblemAdvice` converts with
  `ProblemCode.valueOf`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java:365-367`).
- **core-api** (`frontend/projects/core-api/src/`) holds `resolveApiRoot`,
  `demoSessionInterceptor` with `withIfMatch`, and `dismissSplash`. The
  storefront and demo-payment use all three; the admin uses `resolveApiRoot`
  and `dismissSplash` and keeps its own interceptors
  (`frontend/projects/core-api/src/public-api.ts:1-8`). Each app opts in
  explicitly.
- **The contract suite**, `npm --prefix frontend run test:contract`, reads the
  contract at test time, drives the generated shop SDK against the shop-mocks
  handlers on MSW's Node server, and checks the committed fixture. Only
  `frontend/tests/contract/sdk-split.spec.ts` looks at admin operations; the
  rest drop them first (`frontend/tests/contract/admin-tags.ts:56`).
- **The backend API tests** check responses against the contract file itself,
  not the derived copy
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/ContractValidation.java:60`).
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

Run
`node .claude/skills/mibolt-cross-package-changes/scripts/find-contract-consumers.mjs --kind <kind> <Name>`
from the repository root. It needs a git checkout, git and Node 26 (the
version `mise.toml:12` pins), and it is read-only: it runs only `git grep` and
`git ls-files`, over tracked files, with `.claude/` excluded.

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
`--kind operation getCart` on 2026-09-26, exit 0, with every bucket header
kept and most hit lines cut, so the counts are the full run's:

```text
operation: GET /cart (path also searched, each {param} generalised, directly behind a quote, a backtick or /api/v1)
1. contract (2)
  contracts/commerce/kommunikacio.md:60: [path] (below). The `/cart*`, `/checkout*`, `/payment-intents*` and
  contracts/commerce/openapi.yaml:338:       operationId: getCart
2. generated shop SDK (5)
  frontend/projects/shop-api/src/generated/functions.ts:17: export { getCart as getCart } from './fn/cart/get-cart';
4. storefront (29)
  frontend/projects/storefront/src/app/features/cart/cart.facade.spec.ts:192: [path]     expect(requestsTo('GET', '/cart')).toHaveLength(1);
  frontend/projects/storefront/src/app/features/cart/cart.facade.ts:460:       const cart = await firstValueFrom(this.api.invoke(getCart, {}));
9. shop mocks (33)
  frontend/projects/shop-mocks/src/cart/cart.handlers.ts:164:   const getCart: RequestHandler = http.get('*/api/v1/cart', async ({ request }) => {
10. contract tests (17)
  frontend/tests/contract/schema.spec.ts:94:   'getCart',
11. e2e (2)
12. backend main (13)
  backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:36: 	public ResponseEntity<Cart> getCart() {
  backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartItem.java:63: 	public Cart getCart() {
13. backend test (71)
  backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartApiTest.java:55: [path] 		MvcResult first = mockMvc.perform(get("/cart"))
15. docs (2)

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
  lines above `contracts/commerce/openapi.yaml:338`, is such a line; the
  `operationId:` line the name search finds stands for it.
- **`empty buckets:` is where to look next, not a verdict.** The path search
  does not see a URL assembled from a constant plus a suffix, such as the one
  `archiveUrl` builds at
  `frontend/projects/admin/src/testing/mock-spec-helpers.ts:60`, nor one
  ending in a concatenated parameter, such as `get("/admin/products/" + id)`
  at
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/admin/catalog/AdminProductReplaceApiTest.java:231`,
  which the `getAdminProduct` run leaves out. Search for those two shapes by
  hand when a bucket you expect to hold a consumer is empty. On 2026-09-26
  each of the 34 operations had hits in `backend test` and in the mock bucket
  of its own side, shop or admin.
- **Hits are candidates.** `CartItem.java:63` above is an entity getter that
  shares the name, not the operation, and `kommunikacio.md:60` is prose.
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
2. **Regenerate** with `mise run api:generate`, which rewrites both frontend
   clients and the backend interfaces. It rewrites tracked files and is a
   shared resource (`.claude/rules/parallel-spawns.md`, "What a batch
   shares"): run it only when your task hands you that step.
3. **Contract suite.** Update the counts, lists and fixtures in
   `frontend/tests/contract/` that your chain names.
4. **Consumers**, each through its own skill and in any order: the backend,
   the shop side and the admin side, as far as the finder's buckets reach.
5. **Catalogue fixture**, when catalogue data or the `Product` shape changed:
   `npm --prefix frontend run fixtures:catalog`, then
   `npm --prefix frontend run fixtures:catalog:check`.
6. **Keep the regenerated clients with the contract change.** `api:drift`
   compares them with the index, so it passes only once they are staged or
   committed ([references/codegen.md](references/codegen.md), section 3).
   Whoever commits stages both generated directories together with the
   contract; a spawned agent whose task does not tell it to stage names both
   directories in its report instead (`.claude/rules/session-lifecycle.md`,
   "The commit belongs to the orchestrator"). How the rest splits into commits
   is `.claude/rules/session-lifecycle.md` ("One commit, one logical change").
7. **Verify** through `mibolt-verification`.

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
  configuration and regenerate. Sources: `frontend/docs/api/README.md:9`,
  `frontend/README.md:13`, `backend/docs/02-backend.md:445`, and the header of
  every generated file (`frontend/projects/shop-api/src/generated/api.ts:2`).
- **The spec is authoritative, and no side adds what it lacks**:
  `contracts/commerce/kommunikacio.md:11-19` and its section 9,
  `contracts/commerce/kommunikacio.md:314-323`.
- **The server sends codes and parameters, and the UI writes the Hungarian
  text**; `title` and `detail` are English developer text
  (`contracts/commerce/kommunikacio.md:192-205`).
- **Grep an identifier as the repository spells it**
  (`.claude/rules/code-standards.md`, "Grep the identifier as the repository
  spells it"); the finder does this for contract names.
- **A cut feature leaves nothing behind in any layer**
  (`.claude/rules/code-standards.md`, "A cut feature leaves nothing behind").
- **Name a sample after its schema**, with an optional case part
  (`contracts/check-samples.sh:1-4`).
- **When `prepareOpenApiSpec` fails, update the replacement its message
  names**, keeping each of the four blocks an exact-once match; a new
  discriminated subtype goes through
  `backend/docs/decisions/0001-openapi-generator-and-discriminator-workaround.md`
  first ([references/codegen.md](references/codegen.md), section 4).
- **Running the catalogue importer scrapes yettel.hu**: ask the user first and
  name the scrape in the question itself, per `.claude/CLAUDE.md` ("An
  outward-facing action is never a passenger in a bigger yes"); a spawned agent
  does not run it and names the need in its report. A change that an edit to
  `data/catalog/catalog.json` can make needs no importer run
  ([references/catalog-data.md](references/catalog-data.md), section 2).
- **Only the `playwright-test-*` agents write end-to-end specs**
  (`.claude/rules/code-standards.md`, "Only the `playwright-test-*` agents
  write end-to-end tests").

## What fails when a step is skipped

| Step skipped | What fails | Where it runs |
|---|---|---|
| regenerating, or staging the regenerated clients | `api:drift`: it regenerates, then runs `git diff --exit-code` and an untracked-file test over both client directories (`frontend/package.json:32`) | the `api-drift` CI job (`.github/workflows/frontend.yml:136-159`), `mise run api:drift`, `mise run verify` (`mise.toml:67-74`) |
| leaving a generated file as hand-edited | the same `api:drift`, since regeneration overwrites the edit | as above |
| updating a spec example or a sample the change invalidated | examples on a shop operation: `frontend/tests/contract/schema.spec.ts:177`; samples: `contracts/check-samples.sh` | `npm --prefix frontend run test:contract`; `mise run contracts:check` and the Contracts CI workflow (`.github/workflows/contracts.yml:24-25`) |
| moving the operation counts, 15 admin and 19 shop | `frontend/tests/contract/sdk-split.spec.ts:123-127`, and for an admin operation `frontend/tests/contract/sdk-split.spec.ts:141`; for a shop operation also `REQUIRED_OPERATION_COUNT` (`frontend/tests/contract/response-validation.ts:35`) and `EXPECTED_OPERATION_IDS` (`frontend/tests/contract/schema.spec.ts:88-108`) | `npm --prefix frontend run test:contract` |
| a shop-mocks handler for a new shop operation | `operation-matrix` parity, "MSW handlers missing for" (`frontend/tests/contract/operation-matrix.spec.ts:135-145`) | `npm --prefix frontend run test:contract` |
| updating the replacement for an edited discriminator block | `prepareOpenApiSpec`'s exactly-once guard (`backend/services/commerce/build.gradle:73-80`) | every backend compile |
| matching the `ErrorCode` and `ProblemCode` names | `ErrorCodeTest`, which pins the two enums to the same names in both directions and pins the number of `ErrorCode` constants, so a new code also means raising that count (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/problem/ErrorCodeTest.java:28-53`); nothing fails at compile time, and at run time an `ErrorCode` with no `ProblemCode` would throw `IllegalArgumentException` in the strict `valueOf` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java:366`, https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Enum.html) | the backend unit tests, `backend/gradlew -p backend :services:commerce:test`, and every backend build |
| a backend controller method for a new operation | nothing at compile time: the generated interface supplies a default method ([references/codegen.md](references/codegen.md), section 4) | a backend API test for the operation, or the app on the real backend |
| following a generated model change in shop-mocks | its code stops type-checking: 14 files under `frontend/projects/shop-mocks/src/` import generated models, 10 through `@mi-bolt/api/models/*` and 4 through the `@mi-bolt/api/models` barrel | every command that compiles shop-mocks; `mibolt-verification` names them |
| an admin mocks handler for a new admin operation | nothing: no contract test covers the admin mocks | the admin app in a browser |
| regenerating the catalogue fixture after a data change | `fixtures:catalog:check` exits 1, but it is manual-only: no workflow or mise task runs it. The contract suite catches only a changed product count or a product `Product` rejects (`frontend/tests/contract/schema.spec.ts:512-514`, `frontend/tests/contract/schema.spec.ts:571-585`) | `npm --prefix frontend run fixtures:catalog:check`, run by hand |

No backend drift check exists, and none is needed: the backend output is never
committed (`backend/.gitignore:3`) and is regenerated before every compile.

## How to verify

These are the checks this skill's artefacts own; `mibolt-verification` owns
the full set for a change and how CI maps onto them.

| Command | What it proves | Side effects |
|---|---|---|
| `node .claude/skills/mibolt-cross-package-changes/scripts/find-contract-consumers.mjs --kind <kind> <Name>` | nothing by itself: it lists candidates; the step is done when every non-empty bucket is handled or dismissed, and, for `--kind operation`, every empty one that should hold a consumer has been searched by hand for the two URL shapes the path search misses | none |
| `mise run contracts:check` | `vacuum lint` passes on the contract, every sample validates against its schema, and `plantuml -checkonly` passes on the diagrams (`contracts/mise.toml:14-19`), which the file's header calls a syntax check (`contracts/mise.toml:1-2`); `-checkonly` is PlantUML's legacy spelling, no longer documented: the current CLI lists `--check-syntax`, "Check diagram syntax without generating images" (https://plantuml.com/command-line), and keeps legacy options for a transition period (https://github.com/plantuml/plantuml/issues/2377) | `contracts/check-samples.sh` writes only into a temporary directory it deletes on exit (`contracts/check-samples.sh:9-10`); the tools are pinned in `contracts/mise.toml:5-9`, and CI installs them first (`.github/workflows/contracts.yml:22-23`) |
| `npm --prefix frontend run test:contract` | the contract suite passes, in a Node environment (`frontend/vitest.contract.config.ts:16-22`); its `tests/**/*.spec.ts` glob also runs the other specs under `frontend/tests/` | none |
| `mise run api:drift` | the clients in the index equal what the working-tree contract generates; in CI, with nothing staged, that the committed clients match the committed contract | rewrites both client directories: a shared resource, as in the fan-out order |
| `npm --prefix frontend run fixtures:catalog:check` | the committed fixture matches `data/catalog/catalog.json`; silent exit 0 when it does | none |
| `mise run api:generate`, `npm --prefix frontend run fixtures:catalog` | nothing: these write, they do not check | rewrite generated files |

Done means: the finder's buckets are accounted for, the contract checks and the
contract suite pass, the regenerated clients are staged beside the contract (or
named in the report for whoever commits) so that `api:drift` can pass, and each
consumer's own checks have passed through its skill and `mibolt-verification`.

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
`README.md:324-332` for the contract workflow as the README gives it; and the
decisions `backend/docs/decisions/0001-openapi-generator-and-discriminator-workaround.md`,
`backend/docs/decisions/0005-yettel-catalog-import-script.md` and
`backend/docs/decisions/0014-openapi-tags-and-admin-contract.md`.

## Keep this skill current

Update this skill and its references in the same change as any of these:

- the tags in `contracts/commerce/openapi.yaml:56-77`, or the operation counts
  (34, 19 and 15);
- `frontend/ng-openapi-gen.json` or `frontend/ng-openapi-gen.admin.json`;
- the `api:*` and `fixtures:catalog*` scripts in `frontend/package.json:31-34`,
  or the root tasks behind `mise run api:generate`, `mise run api:drift` and
  `mise run contracts:check` (`mise.toml:76-86`);
- the openapi block of `backend/services/commerce/build.gradle:39-139`;
- `frontend/projects/core-api/src/public-api.ts`;
- `data/catalog/catalog.schema.json` or
  `frontend/scripts/build-catalog-fixture.mjs`;
- how `frontend/projects/storefront/public/media/` is filled or read, today a
  copy of `data/catalog/images/` that no tracked file regenerates;
- the counts and lists in `frontend/tests/contract/` that the chains cite;
- the finder's bucket roots, `BUCKET_ROOTS` in
  `.claude/skills/mibolt-cross-package-changes/scripts/find-contract-consumers.mjs`;
  its exit 2 with `bucket root missing` or `cannot derive the path` is the
  signal that the layout moved.

Check every path, anchor and command cited here with
`node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs .claude/skills/mibolt-cross-package-changes`.
Run it with `--show-anchors` after an edit to any file this skill or its
references cite by line, whether or not the list above names it, and judge
whether each anchored line still says what the skill claims: an anchor passes
as long as it stays inside its file, however far the text under it moved.
`git grep -n '<path>:[0-9]' -- .claude/skills/mibolt-cross-package-changes`
lists the anchors into one file. Run it again after any edit to the root
`CLAUDE.md`, `.claude/CLAUDE.md`, a file under `.claude/rules/` or any other
file this skill cites a section of by name, and open the sections this skill
cites there, because check (e) still passes a renamed section whose old name
occurs elsewhere in the file
(`.claude/skills/mibolt-project-map/references/citation-check.md`, "What it
checks").
