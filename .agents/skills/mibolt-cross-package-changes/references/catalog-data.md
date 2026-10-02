# Catalogue data and its consumers

The demo catalogue under `data/catalog/`, the importer that produces it, the
fixture generated from it, and every consumer that reads either one. Paths and
commands are read the way the opening paragraph of `SKILL.md` says.

## Contents

1. What is in `data/catalog/`
2. Producing it: the importer
3. The generated fixture
4. The consumers, and when each sees a change
5. A catalogue change, step by step

## 1. What is in `data/catalog/`

- `data/catalog/catalog.json`: an object with `generatedAt`, `source` and
  `products`.
- `data/catalog/catalog.schema.json`: JSON Schema 2020-12 for that file, with
  `additionalProperties: false` on each of its seven object definitions (the
  root at `data/catalog/catalog.schema.json` ("MiBolt demo catalogue (yettel.hu import)"), a product at `data/catalog/catalog.schema.json` ("#/$defs/product")). Only the importer validates against it
  (`tools/catalog-import/src/import.ts`, "readFileSync(SCHEMA_PATH"); a hand edit to the data meets
  only the consumers' own checks.
- `data/catalog/images/`: the product images, 85 files named by content hash.
  `frontend/projects/storefront/public/media/` holds a byte-identical tracked
  copy of the same 85 files, and no tracked file regenerates it; section 4
  names who reads it.

Some values are enumerated in more than one place and change together. The
storage sizes are the clearest case: the contract's `StorageGb`
(`contracts/commerce/openapi.yaml`, "StorageGb:"), the catalogue schema's variant
`id` pattern and `storageGb` enum (`data/catalog/catalog.schema.json`, "(128|256|512)",
`data/catalog/catalog.schema.json`, "[128, 256, 512]"), and the admin mock seed, which fails
on any other value (`frontend/projects/admin/src/mocks/seed.ts`, "function storage").

## 2. Producing it: the importer

- `tools/catalog-import/src/import.ts` scrapes the yettel.hu phone catalogue
  with Playwright (default source `https://www.yettel.hu/mobiltelefon`,
  `tools/catalog-import/src/import.ts`, "--source URL starting listing URL"), caches pages and images in a `.cache/` directory beside it,
  which exists only after a run (ignored by `.gitignore`, "/tools/catalog-import/.cache/"), validates the
  result against the catalogue schema with Ajv 2020, and writes
  `data/catalog/catalog.json` and the images.
  A run with `--limit` writes `catalog.partial.json` instead, and a run whose
  result fails the schema writes `catalog.invalid.json`
  (`tools/catalog-import/src/import.ts`, "const isPartial"; `tools/catalog-import/src/import.ts`, "writeFile(INVALID_OUTPUT_PATH"); both are ignored
  (`.gitignore`, "/data/catalog/catalog.partial.json", `.gitignore`, "/data/catalog/catalog.invalid.json"). Its flags and the directory to run it from are in
  its header (`tools/catalog-import/src/import.ts`, "Usage (run from tools/catalog-import/):").
- **Running it is a call to an external site.** Run it only when the user has
  agreed to the yettel.hu scrape by name, never as part of a wider go-ahead.
  A catalogue task that can be done by editing `data/catalog/catalog.json`
  does not need the importer.
- `tools/catalog-import/spread-colour-prices.mjs` is a separate, manual
  post-processing step that gives some multi-colour products synthetic
  per-colour prices; the importer does not run it (`tools/catalog-import/spread-colour-prices.mjs`, "This file is NOT run by the importer").
- `backend/docs/decisions/0005-yettel-catalog-import-script.md` records the
  importer's design. Its body predates the tool's current home,
  `tools/catalog-import/`, an npm workspace of `tools/package.json` ("workspaces"): the
  paths and `pnpm` commands it gives there are mapped onto the current ones in
  `backend/docs/decisions/0005-yettel-catalog-import-script.md` ("Note: paths
  after the monorepo move").

## 3. The generated fixture

- `frontend/scripts/build-catalog-fixture.mjs` reads
  `data/catalog/catalog.json` and writes
  `frontend/docs/api/fixtures/catalog.json`: one contract-shaped `Product`
  per product plus a parallel `ranking` array for the fields the handlers need
  and `Product` does not carry (`frontend/scripts/build-catalog-fixture.mjs`, "Generator for docs/api/fixtures/catalog.json."). The fixture is committed.
- `npm --prefix frontend run fixtures:catalog` writes it.
- `npm --prefix frontend run fixtures:catalog:check` rebuilds it in memory
  and exits 1 with `... is out of date; rerun without --check` when the file
  on disk differs, and exits 0 silently when it matches
  (`frontend/scripts/build-catalog-fixture.mjs`, "is out of date; rerun without --check"). It is read-only.
- **`fixtures:catalog:check` is manual-only.** The generator's header
  (`frontend/scripts/build-catalog-fixture.mjs`, "npm script is the CI entry point") and
  `frontend/README.md` ("Proving the committed fixture matches the source catalogue, as CI does") describe it as the CI entry point, and no workflow
  or mise task runs it. Run it yourself after any change under
  `data/catalog/` or to the generator.
- What does run in CI is the contract suite's fixture section,
  `frontend/tests/contract/schema.spec.ts` ("T03-AC03 fixture shape"): the fixture has one
  product per product in `data/catalog/catalog.json` (`frontend/tests/contract/schema.spec.ts`, "catalog.json contains one product per entry of data/catalog/catalog.json"), and every
  fixture product validates against the contract's `Product` schema
  (`frontend/tests/contract/schema.spec.ts`, "every fixture product validates against the OpenAPI Product schema"). A stale fixture with the same product count and still-valid
  products passes it.

## 4. The consumers, and when each sees a change

| Consumer | Reads | Sees a change |
|---|---|---|
| Backend `CatalogLoader` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`) | `catalog.json` and `images/` under `mibolt.catalog.path`, default `../../../data/catalog` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`, "mibolt.catalog.path:../../../data/catalog") | Only on an empty database: with products present it logs `catalogue present, ... loader skipped` and returns (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`, "catalogue present, {} products, loader skipped", class comment `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java` ("Loads the catalogue from")). A local PostgreSQL that already holds the old catalogue keeps it; resetting its volume is `mibolt-workspace-ops` territory. The loader's DTOs ignore unknown members (`backend/services/commerce/src/main/resources/application.properties`, "catalogue loader's DTOs opt out"). |
| Admin mock seed (`frontend/projects/admin/src/mocks/seed.ts`) | the raw `data/catalog/catalog.json`, imported directly (`frontend/projects/admin/src/mocks/seed.ts`, "import catalogSource") | On the next admin build or test run; it checks values as it converts them and throws on one it does not know, as the storage sizes show (`frontend/projects/admin/src/mocks/seed.ts`, "function storage"). |
| shop-mocks (`frontend/projects/shop-mocks/src/browser.ts`, "import catalogFixture", `frontend/projects/shop-mocks/src/catalog/catalog-store.ts`) and the storefront and shop-mocks specs | the generated fixture | Only after `fixtures:catalog` has been rerun. |
| Contract suite (`frontend/tests/contract/schema.spec.ts`, "const CATALOG_PATH") | both files | On `npm --prefix frontend run test:contract`. |
| Backend and web images (`deploy/compose.yaml`, "image: mi-bolt-commerce", `deploy/compose.yaml`, "image: mi-bolt-web") | `data/catalog/` as the `catalog` build context; `frontend/Dockerfile` ("COPY --from=catalog catalog.json") copies `catalog.json` for the admin seed, `backend/services/commerce/Dockerfile` ("COPY --from=catalog") copies the directory and points the loader at it | On the next image build. |
| Shop mocks and admin mocks, for image bytes | `frontend/projects/storefront/public/media/`, the copy of `images/`: the storefront serves it with the rest of its `public/` (`frontend/angular.json`, "projects/storefront/public") and the shop mocks fetch `/media/<imageId>.png` from the page's origin (`frontend/projects/shop-mocks/src/catalog/catalog.handlers.ts`, "async function defaultMediaLoader("); the admin development build serves the same directory (`frontend/angular.json`, "media/**"), and the admin mocks load their seed images from it (`frontend/projects/admin/src/mocks/media.handlers.ts`, "media/${entry.seedFile}") | Only when the changed images are copied there by hand; no tracked file regenerates it. |
| Candidate provenance (`deploy/candidate/README.md`, "is SHA-256 over sorted tracked relative paths") | a fingerprint over tracked files under `data/catalog/` | On the next candidate build; recorded, not gated on. |

A change under `data/catalog/**` runs the frontend, backend and smoke CI
branches (`.github/components.yml`, "frontend:", `.github/components.yml`, "backend:",
`.github/components.yml`, "smoke:").

## 5. A catalogue change, step by step

1. Edit `data/catalog/catalog.json` (or rerun the importer, under the
   condition in section 2).
   Keep it valid against `data/catalog/catalog.schema.json` by hand, since
   nothing but the importer checks it; a new field goes into the schema too.
2. `npm --prefix frontend run fixtures:catalog`, then
   `npm --prefix frontend run fixtures:catalog:check` to confirm it exits 0.
3. If the change adds a field the fixture must carry, the mapping in
   `frontend/scripts/build-catalog-fixture.mjs` changes too, and the field has
   to exist on the contract's `Product` first, since the contract suite
   rejects unknown fixture members (`frontend/tests/contract/schema.spec.ts`, "a fixture product with an unknown field fails the Product schema").
   That is a contract change: follow the contract-change-chain reference,
   section 3.
4. Consumer follow-ups go to their area skills: the admin seed conversion to
   `mibolt-admin-frontend`, the shop-mocks catalogue store to
   `mibolt-shop-frontend`, and the loader and its validation to
   `mibolt-commerce-backend`.
5. The data, the regenerated fixture and any changed images, with their
   copies under `frontend/projects/storefront/public/media/` (section 4), are
   one change: the fixture and the copies derive from the data, and CI checks
   no more of that than the fixture's product count and each fixture
   product's shape (section 3). `mibolt-verification` names the checks to run.
