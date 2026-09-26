---
name: mibolt-cross-package-changes
description: >-
  Changes that fan out to several MiBolt consumers: the OpenAPI contract
  contracts/commerce/openapi.yaml with its samples and kommunikacio.md,
  regenerating the shop SDK, the admin client and the backend interfaces
  (api:generate, api:drift), ProblemCode and If-Match protocol changes, the
  shared core-api library, the frontend contract tests, and the catalogue data
  with its generated fixture. Use when adding or changing an endpoint, field,
  enum or error code, when api:drift or a contract test fails, or when
  catalogue data changes. Not for work inside one app.
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
  `frontend/scripts/build-catalog-fixture.mjs` and
  `frontend/docs/api/fixtures/catalog.json`.

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
  storefront and demo-payment attach it with core-api's `withIfMatch`
  (`frontend/projects/core-api/src/demo-session.interceptor.ts:85`), the admin
  with its own (`frontend/projects/admin/src/app/core/api/if-match.interceptor.ts:6`).
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
| `schema` | `#/components/schemas/<Name>`, or a schema key | the name in `contracts/`, its sample files, the generated model file name in kebab case, the Java `api.model.<Name>;` import |
| `operation` | `operationId: <Name>` | the name as a whole word everywhere, and its generated function file in kebab case |
| `property` | a whole word | the name, and `get` or `set` followed by the name with its first letter capitalised |
| `enum` | a whole word | the value as written, in upper case and in lower case |

Exit codes: **0** when the name is in the contract as that kind, whether or
not anything else matched; **1** when it is not, with
`<Name> is not in the contract as a <kind>; for a new one, use an existing sibling as the template (references/contract-change-chain.md)`
on stderr; **2** for a usage error (a missing or unknown `--kind`, a name that
is not an identifier), a run from outside the repository root, or a missing
bucket root (`bucket root missing: <path>; the layout changed, update the script`).

The output sorts hits into 16 buckets by path: contract, generated shop SDK,
generated admin client, storefront, demo-payment, core-api, admin app, admin
mocks, shop mocks, contract tests, e2e, backend main, backend test, catalogue
data and fixture, docs, other. An excerpt of a real run of
`--kind operation getCart` on 2026-09-26, exit 0, with every bucket header
kept and most hit lines cut, so the counts are the full run's:

```text
1. contract (1)
  contracts/commerce/openapi.yaml:338:       operationId: getCart
2. generated shop SDK (5)
  frontend/projects/shop-api/src/generated/functions.ts:17: export { getCart as getCart } from './fn/cart/get-cart';
4. storefront (2)
  frontend/projects/storefront/src/app/features/cart/cart.facade.ts:460:       const cart = await firstValueFrom(this.api.invoke(getCart, {}));
9. shop mocks (7)
  frontend/projects/shop-mocks/src/cart/cart.handlers.ts:164:   const getCart: RequestHandler = http.get('*/api/v1/cart', async ({ request }) => {
10. contract tests (8)
  frontend/tests/contract/schema.spec.ts:94:   'getCart',
12. backend main (10)
  backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:36: 	public ResponseEntity<Cart> getCart() {
  backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartItem.java:63: 	public Cart getCart() {
13. backend test (43)
15. docs (2)

empty buckets: 3. generated admin client, 5. demo-payment, 6. core-api, 7. admin app, 8. admin mocks, 11. e2e, 14. catalogue data and fixture, 16. other
not searched: backend generated sources under backend/services/commerce/build/generated/openapi (untracked, regenerated by the build)
hits are candidates: confirm each (a word match such as getCart also matches the entity getter CartItem.getCart)
```

Read it this way:

- **`empty buckets:` is the line that matters.** A new shop operation whose
  `shop mocks` bucket is empty is exactly the gap `operation-matrix` reports.
- **Hits are candidates.** `CartItem.java:63` above is an entity getter that
  shares the name, not the operation.
- **An empty bucket is not proof.** The admin mocks match requests by URL and
  never name an operation; search the path as well
  ([references/contract-change-chain.md](references/contract-change-chain.md),
  section 1).
- **For an error code use `--kind enum`.** `--kind enum PRICE_CHANGED` ran on
  the same day with exit 0 and hits in the contract (11), both generated
  clients (5 and 2), the storefront (25), shop mocks (4), the contract tests
  (1), e2e (1), backend main (7) and test (8), and docs (7).

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
6. **Stage the regenerated clients with the contract change.** `api:drift`
   compares them with the index, so it passes only once they are staged or
   committed ([references/codegen.md](references/codegen.md), section 3). How
   the rest splits into commits is `.claude/rules/session-lifecycle.md`
   ("One commit, one logical change").
7. **Verify** through `mibolt-verification`.

### By kind of change

| Change | What moves besides the contract and the regenerated clients | Chain |
|---|---|---|
| a field on a shared schema | examples and samples, contract-suite fixtures, both mock layers, the backend mapper, the fixture for `Product` | section 3 |
| a new shop operation | the counts and lists in the contract suite, a shop-mocks handler, a backend controller method | section 4 |
| a new admin operation | the `sdk-split` counts, an admin mocks handler, a backend controller method | section 5 |
| a new enum value | every consumer that must cover all values, backend string constants, and the discriminator guard for four of them | section 6 |
| a new error code | `ErrorCode`, the error table in `kommunikacio.md`, each app's handling and Hungarian text | section 7 |
| an If-Match or header change | the callers' `withIfMatch`, the contract suite's header sets | section 8 |
| a removal or a rename | everything the finder lists, in one change | section 9 |
| a core-api helper | the export, and an explicit opt-in in each app | section 10 |
| catalogue data | the fixture, the admin seed, the loader's empty-database rule | [references/catalog-data.md](references/catalog-data.md) |

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
  (`.claude/rules/code-standards.md:119`); the finder does this for contract
  names.
- **A cut feature leaves nothing behind in any layer**
  (`.claude/rules/code-standards.md:125`).
- **Name a sample after its schema**, with an optional case part
  (`contracts/check-samples.sh:1-4`).
- **When `prepareOpenApiSpec` fails, update the replacement its message
  names**, keeping each of the four blocks an exact-once match; a new
  discriminated subtype goes through
  `backend/docs/decisions/0001-openapi-generator-and-discriminator-workaround.md`
  first ([references/codegen.md](references/codegen.md), section 4).
- **Running the catalogue importer calls an external site**: ask first, per
  `.claude/CLAUDE.md` ("An outward-facing action is never a passenger in a
  bigger yes").
- **Only the `playwright-test-*` agents write end-to-end specs**
  (`.claude/rules/code-standards.md:146`).

## What fails when a step is skipped

| Step skipped | What fails | Where it runs |
|---|---|---|
| regenerating, or staging the regenerated clients | `api:drift`: it regenerates, then runs `git diff --exit-code` and an untracked-file test over both client directories (`frontend/package.json:32`) | the `api-drift` CI job (`.github/workflows/frontend.yml:136-159`), `mise run api:drift`, `mise run verify` |
| leaving a generated file as hand-edited | the same `api:drift`, since regeneration overwrites the edit | as above |
| updating a spec example or a sample the change invalidated | examples: `frontend/tests/contract/schema.spec.ts:177`; samples: `contracts/check-samples.sh` | `npm --prefix frontend run test:contract`; `mise run contracts:check` and the Contracts CI workflow (`.github/workflows/contracts.yml:24-25`) |
| moving the operation counts, 15 admin and 19 shop | `frontend/tests/contract/sdk-split.spec.ts:123-127`; for a shop operation also `REQUIRED_OPERATION_COUNT` (`frontend/tests/contract/response-validation.ts:35`) and `EXPECTED_OPERATION_IDS` (`frontend/tests/contract/schema.spec.ts:88-108`) | `npm --prefix frontend run test:contract` |
| a shop-mocks handler for a new shop operation | `operation-matrix` parity, "MSW handlers missing for" (`frontend/tests/contract/operation-matrix.spec.ts:135-145`) | `npm --prefix frontend run test:contract` |
| updating the replacement for an edited discriminator block | `prepareOpenApiSpec`'s exactly-once guard (`backend/services/commerce/build.gradle:73-80`) | every backend compile |
| matching the `ErrorCode` and `ProblemCode` names | nothing at compile time. A `ProblemCode` with no `ErrorCode` is never sent; an `ErrorCode` with no `ProblemCode` throws `IllegalArgumentException` in the strict `valueOf` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java:366`) the first time that error is rendered | the backend API test that provokes the code |
| a backend controller method for a new operation | nothing at compile time: the generated interface supplies a default method ([references/codegen.md](references/codegen.md), section 4) | a backend API test for the operation, or the app on the real backend |
| following a generated model change in shop-mocks | its code stops type-checking: 14 files under `frontend/projects/shop-mocks/src/` import `@mi-bolt/api/models/*` | every command that compiles shop-mocks; `mibolt-verification` names them |
| an admin mocks handler for a new admin operation | nothing: no contract test covers the admin mocks | the admin app in a browser |
| regenerating the catalogue fixture after a data change | `fixtures:catalog:check` exits 1, but it is manual-only: no workflow or mise task runs it. The contract suite catches only a changed product count or a product `Product` rejects (`frontend/tests/contract/schema.spec.ts:512-514`, `frontend/tests/contract/schema.spec.ts:571-585`) | `npm --prefix frontend run fixtures:catalog:check`, run by hand |

No backend drift check exists, and none is needed: the backend output is never
committed (`backend/.gitignore:3`) and is regenerated before every compile.

## How to verify

These are the checks this skill's artefacts own; `mibolt-verification` owns
the full set for a change and how CI maps onto them.

| Command | What it proves | Side effects |
|---|---|---|
| `node .claude/skills/mibolt-cross-package-changes/scripts/find-contract-consumers.mjs --kind <kind> <Name>` | every non-empty bucket has been handled or confirmed as a false positive | none |
| `mise run contracts:check` | `vacuum lint` passes on the contract, every sample validates against its schema, and `plantuml -checkonly` passes on the diagrams (`contracts/mise.toml:14-19`), which the file's header calls a syntax check (`contracts/mise.toml:1-2`) | `contracts/check-samples.sh` writes only into a temporary directory it deletes on exit (`contracts/check-samples.sh:9-10`); the tools are pinned in `contracts/mise.toml:5-9`, and CI installs them first (`.github/workflows/contracts.yml:22-23`) |
| `npm --prefix frontend run test:contract` | the contract suite passes, in a Node environment (`frontend/vitest.contract.config.ts:16-22`); its `tests/**/*.spec.ts` glob also runs the other specs under `frontend/tests/` | none |
| `mise run api:drift` | the committed clients match the committed contract | rewrites both client directories: a shared resource, as in the fan-out order |
| `npm --prefix frontend run fixtures:catalog:check` | the committed fixture matches `data/catalog/catalog.json`; silent exit 0 when it does | none |
| `mise run api:generate`, `npm --prefix frontend run fixtures:catalog` | nothing: these write, they do not check | rewrite generated files |

Done means: the finder's buckets are accounted for, the contract checks and the
contract suite pass, `api:drift` passes with the regenerated clients staged
beside the contract, and each consumer's own checks have passed through its
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
- [references/codegen.md](references/codegen.md): read when regeneration or
  `api:drift` misbehaves, when a model is missing from one client, when the
  backend build fails in `prepareOpenApiSpec`, or before changing a generator
  configuration or the backend generation block.
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
- the counts and lists in `frontend/tests/contract/` that the chains cite;
- the finder's bucket roots, `BUCKET_ROOTS` in
  `.claude/skills/mibolt-cross-package-changes/scripts/find-contract-consumers.mjs`;
  its exit 2 with `bucket root missing` is the signal that the layout moved.

Check every path, anchor and command cited here with
`node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs .claude/skills/mibolt-cross-package-changes`;
add `--show-anchors` to see the text each anchor points at, and judge whether
it still says what this skill claims.
