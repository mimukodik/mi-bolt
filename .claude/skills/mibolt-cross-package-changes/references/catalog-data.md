# Catalogue data and its consumers

The demo catalogue under `data/catalog/`, the importer that produces it, the
fixture generated from it, and every consumer that reads either one. Paths are
repo-relative and commands run from the repository root.

## Contents

1. What is in `data/catalog/`
2. Producing it: the importer
3. The generated fixture
4. The consumers, and when each sees a change
5. A catalogue change, step by step

## 1. What is in `data/catalog/`

- `data/catalog/catalog.json`: an object with `generatedAt`, `source` and
  `products` (48 products on 2026-09-26).
- `data/catalog/catalog.schema.json`: JSON Schema 2020-12 for that file, with
  `additionalProperties: false` on each of its seven object definitions (the
  root at `data/catalog/catalog.schema.json:6`, a product at `data/catalog/catalog.schema.json:20`). Only the importer validates against it
  (`tools/catalog-import/src/import.ts:1155`); a hand edit to the data meets
  only the consumers' own checks.
- `data/catalog/images/`: the product images, 85 files named by content hash.

Some values are enumerated in more than one place and change together. The
storage sizes are the clearest case: the contract's `StorageGb`
(`contracts/commerce/openapi.yaml:1952-1957`), the catalogue schema's variant
`id` pattern and `storageGb` enum (`data/catalog/catalog.schema.json:108`,
`data/catalog/catalog.schema.json:111`), and the admin mock seed, which fails
on any other value (`frontend/projects/admin/src/mocks/seed.ts:64-68`).

## 2. Producing it: the importer

- `tools/catalog-import/src/import.ts` scrapes the yettel.hu phone catalogue
  with Playwright (default source `https://www.yettel.hu/mobiltelefon`,
  `tools/catalog-import/src/import.ts:12-13`), caches pages and images in a `.cache/` directory beside it,
  which exists only after a run (ignored by `.gitignore:326`), validates the
  result against the catalogue schema with Ajv 2020, and writes
  `data/catalog/catalog.json` and the images.
  A run with `--limit` writes `catalog.partial.json` instead, and a run whose
  result fails the schema writes `catalog.invalid.json`
  (`tools/catalog-import/src/import.ts:1155-1194`); both are ignored
  (`.gitignore:327-328`). Its flags and the directory to run it from are in
  its header (`tools/catalog-import/src/import.ts:4-21`).
- **Running it is a call to an external site.** Ask the user first and name
  the scrape in the question itself, per `.claude/CLAUDE.md` ("An
  outward-facing action is never a passenger in a bigger yes"). A catalogue
  task that can be done by editing `data/catalog/catalog.json` does not need
  the importer.
- `tools/catalog-import/spread-colour-prices.mjs` is a separate, manual
  post-processing step that gives some multi-colour products synthetic
  per-colour prices; the importer does not run it (`tools/catalog-import/spread-colour-prices.mjs:11-13`).
- `backend/docs/decisions/0005-yettel-catalog-import-script.md` records the
  importer's design. Its paths (`scripts/catalog-import/`) and its `pnpm`
  command predate the tool's current home under `tools/catalog-import/`,
  which is an npm workspace of `tools/package.json:5`.

## 3. The generated fixture

- `frontend/scripts/build-catalog-fixture.mjs` reads
  `data/catalog/catalog.json` and writes
  `frontend/docs/api/fixtures/catalog.json`: one contract-shaped `Product`
  per product plus a parallel `ranking` array for the fields the handlers need
  and `Product` does not carry (`frontend/scripts/build-catalog-fixture.mjs:1-16`). The fixture is committed.
- `npm --prefix frontend run fixtures:catalog` writes it.
- `npm --prefix frontend run fixtures:catalog:check` rebuilds it in memory
  and exits 1 with `... is out of date; rerun without --check` when the file
  on disk differs, and exits 0 silently when it matches
  (`frontend/scripts/build-catalog-fixture.mjs:157-170`). It is read-only.
- **`fixtures:catalog:check` is manual-only.** The generator's header
  (`frontend/scripts/build-catalog-fixture.mjs:15-16`) and
  `frontend/README.md:63` describe it as the CI entry point, and no workflow
  or mise task runs it. Run it yourself after any change under
  `data/catalog/` or to the generator.
- What does run in CI is the contract suite's fixture section,
  `frontend/tests/contract/schema.spec.ts:511-602`: the fixture has one
  product per product in `data/catalog/catalog.json` (`frontend/tests/contract/schema.spec.ts:512-514`), and every
  fixture product validates against the contract's `Product` schema
  (`frontend/tests/contract/schema.spec.ts:571-585`). A stale fixture with the same product count and still-valid
  products passes it.

## 4. The consumers, and when each sees a change

| Consumer | Reads | Sees a change |
|---|---|---|
| Backend `CatalogLoader` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`) | `catalog.json` and `images/` under `mibolt.catalog.path`, default `../../../data/catalog` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:54`) | Only on an empty database: with products present it logs `catalogue present, ... loader skipped` and returns (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:76-79`, class comment `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:24-29`). A local PostgreSQL that already holds the old catalogue keeps it; resetting its volume is `mibolt-workspace-ops` territory. The loader's DTOs ignore unknown members (`backend/services/commerce/src/main/resources/application.properties:16-17`). |
| Admin mock seed (`frontend/projects/admin/src/mocks/seed.ts`) | the raw `data/catalog/catalog.json`, imported directly (`frontend/projects/admin/src/mocks/seed.ts:1`) | On the next admin build or test run; it checks values as it converts them and throws on one it does not know, as the storage sizes show (`frontend/projects/admin/src/mocks/seed.ts:64-68`). |
| shop-mocks (`frontend/projects/shop-mocks/src/browser.ts:32`, `frontend/projects/shop-mocks/src/catalog/catalog-store.ts`) and the storefront and shop-mocks specs | the generated fixture | Only after `fixtures:catalog` has been rerun. |
| Contract suite (`frontend/tests/contract/schema.spec.ts:26-27`) | both files | On `npm --prefix frontend run test:contract`. |
| Backend and web images (`deploy/compose.yaml:35`, `deploy/compose.yaml:63`) | `data/catalog/` as the `catalog` build context; `frontend/Dockerfile:13` copies `catalog.json` for the admin seed, `backend/services/commerce/Dockerfile:28-29` copies the directory and points the loader at it | On the next image build. |
| Candidate provenance (`deploy/candidate/README.md:58-61`) | a fingerprint over tracked files under `data/catalog/` | On the next candidate build; recorded, not gated on. |

A change under `data/catalog/**` runs the frontend, backend and smoke CI
branches (`.github/components.yml:6`, `.github/components.yml:13`,
`.github/components.yml:28`).

## 5. A catalogue change, step by step

1. Edit `data/catalog/catalog.json` (or rerun the importer, after asking).
   Keep it valid against `data/catalog/catalog.schema.json` by hand, since
   nothing but the importer checks it; a new field goes into the schema too.
2. `npm --prefix frontend run fixtures:catalog`, then
   `npm --prefix frontend run fixtures:catalog:check` to confirm it exits 0.
3. If the change adds a field the fixture must carry, the mapping in
   `frontend/scripts/build-catalog-fixture.mjs` changes too, and the field has
   to exist on the contract's `Product` first, since the contract suite
   rejects unknown fixture members (`frontend/tests/contract/schema.spec.ts:587`).
   That is a contract change: follow
   [contract-change-chain.md](contract-change-chain.md).
4. Consumer follow-ups go to their area skills: the admin seed conversion to
   `mibolt-admin-frontend`, the shop-mocks catalogue store to
   `mibolt-shop-frontend`, and the loader and its validation to
   `mibolt-commerce-backend`.
5. Commit the data, the regenerated fixture and any images together, then
   hand the checks to `mibolt-verification`.
