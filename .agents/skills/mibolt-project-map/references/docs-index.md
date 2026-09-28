# Docs index

Which document is authoritative for each area, the language it is written
in, and where it no longer matches the repository. Paths are relative to the
repository root; the currency notes were checked on 2026-09-26. A dash in the
currency column means no mismatch was found, not that every line was
checked.

Where a document and the code or config disagree, the code and config are
what runs, and the document is out of date on that point. Do not quote a
pre-implementation document as a description of the current apps.

## Workspace

| Document | Authoritative for | Language | Currency |
|---|---|---|---|
| `README.md` | install, the run modes, ports (`README.md:229-239`), the stack and order-flow diagrams, the root command reference | English | the command table at `README.md:352-372` omits `mise run deploy:check`, which `mise.toml:100-102` defines |
| `docs/monorepo.md` | the folder map, the root commands, the CI component filters | English | its command table at `docs/monorepo.md:30-50` omits the same task |

## Frontend

| Document | Authoritative for | Language | Currency |
|---|---|---|---|
| `frontend/README.md` | the six projects, every npm script, the mock and real-backend configurations, tests, the CI jobs | English | `frontend/README.md:63` describes `fixtures:catalog:check` as "Proving the committed fixture matches the source catalogue, as CI does", and `frontend/scripts/build-catalog-fixture.mjs:15` calls that script the CI entry point; no workflow or mise task runs it, and the only comparison CI's contract suite makes between the fixture and the source catalogue is the product count (`frontend/tests/contract/schema.spec.ts:512-513`) |
| `frontend/projects/admin/README.md` | the admin app's commands, mock backend and styling | English | not checked line by line |
| `frontend/docs/api/README.md` | SDK generation, the shop and admin SDK split, the catalogue fixture | English | matches `frontend/ng-openapi-gen.json` and `frontend/ng-openapi-gen.admin.json` |
| `frontend/docs/design/yettel.md`, `frontend/docs/design/yettel/` | colour, type, radii and component recipes, with the captured yettel.hu source; the design authority for every rendered surface, `mibolt-shop-frontend` ("Design authority") | English | the document never mentions the admin app |
| `frontend/docs/design/README.md` | the entry to the design reference | English | records that the HTML prototype was removed on 2026-09-22 |
| `frontend/docs/lint-relaxations.md` | which lint rules were relaxed, why, and how to reinstate one | English | — |
| `frontend/docs/README.md` | the entry to the design and execution documents | English | written before implementation: "not a finished Angular application" (`frontend/docs/README.md:17`) |
| `frontend/docs/spec/` | the planning package the apps were built from: architecture, components, screens, acceptance, test scenarios, test strategy, sources, technology decisions, execution rules | English | written before implementation: `frontend/docs/spec/architecture.md:3`, `frontend/docs/spec/execution-rules.md:3`, `frontend/docs/spec/acceptance.md:3` and `frontend/docs/spec/test-scenarios.md:3` describe an app not yet built; `frontend/docs/spec/testing.md:3` records the end-to-end reinstatement of 2026-09-22 while `frontend/docs/spec/testing.md:5` still says the package holds no completed app; the coverage floors in `frontend/docs/spec/testing.md:9` match `frontend/angular.json` |
| `frontend/e2e/seed.spec.ts`, `frontend/specs/` | the end-to-end conventions file and the test plans | English | `frontend/specs/README.md` is a one-line stub beside the plan files |

## Contract

| Document | Authoritative for | Language | Currency |
|---|---|---|---|
| `contracts/commerce/openapi.yaml` | every endpoint, schema and error code; the single source of truth for both SDKs and the backend interfaces | English | — |
| `contracts/commerce/kommunikacio.md` | protocol rules the spec cannot express: the `/api/v1` prefix, Problem JSON, session and demo-access cookies, `ETag` and `If-Match` versioning, idempotency, the payment redirect (§8.3) | English, despite the Hungarian file name | — |
| `contracts/commerce/samples/`, `contracts/commerce/sequences/` | example payloads validated against their schemas; PlantUML flows, checked for syntax only | — | — |

## Backend

| Document | Authoritative for | Language | Currency |
|---|---|---|---|
| `backend/README.md` | run modes, environment variables, the order flow in endpoints, tests and gates, the index of `backend/docs/` | English | — |
| `backend/docs/02-backend.md` | backend requirements: code generation (§2), layering (§3), the numbered domain invariants (§4), tests (§7), recording decisions (§8), the forbidden list (§9) | Hungarian | — |
| `backend/docs/04-adatbazis.md` | database rules: the local container, the schema, forward-only migrations (§5) | Hungarian | — |
| `backend/docs/06-uzembe-helyezes.md` | manual server deployment and image publishing | Hungarian | — |
| `backend/docs/decisions/` | 22 decision records, each with at least a Situation and a Decision section | English | 14 end with a note on paths after the monorepo move, so a path above that note can predate the move: `backend/docs/decisions/0001-openapi-generator-and-discriminator-workaround.md:5` names the contract as `api/openapi.yaml` |

## Deploy, data and tools

| Document | Authoritative for | Language | Currency |
|---|---|---|---|
| `deploy/helm/mi-bolt/README.md` | the app chart and the values its caller must supply | English | — |
| `deploy/candidate/README.md` | candidate build, publication and the receipt schema | English | — |
| `data/catalog/catalog.schema.json` | the shape of the catalogue data | JSON Schema | — |
| `backend/docs/decisions/0005-yettel-catalog-import-script.md` | why and how the catalogue is imported from yettel.hu | English | — |
| `tools/dev-server/dev-server.sh` (its usage text) | starting, stopping and checking one dev server on one port | English | — |
