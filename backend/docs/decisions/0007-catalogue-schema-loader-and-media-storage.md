# 0007 — Catalogue schema, startup loader and media storage

## Situation

T4 needs the catalogue as data the application owns at startup: products,
colours, variants, spec groups, highlights and content-addressed images
live next to the cart and the session table, and the demo catalogue has
to be loadable from a single JSON file plus a directory of image bytes
without an external service. The contract for `listProducts`,
`getProduct` and `listRelatedProducts` is the consumer; this decision
covers what the catalog side looks like in the database, how the JSON
becomes rows, and how images are stored and served.

The brief's invariants, the schema layout, the loader trigger, the
fail-fast rule, the facet algorithm, the demo-size limit, and the CDN
migration path all live here.

## Options

1. **Database-only, portable schema + ApplicationRunner loader.** Seven
   tables in Liquibase with cross-dialect types, an
   `ApplicationRunner` that loads `catalog.json` once at startup if the
   product table is empty, and image bytes stored alongside the rest of
   the catalogue so a `scripts/local-database-docker.sh reset` drops
   images and catalogue together (docs/02 §6.2).
2. **External catalogue service.** A second Spring Boot service owns
   the catalogue; the shop calls it over HTTP. Out of scope for a
   single-service demo and adds an integration point that has nothing
   to demonstrate yet.
3. **Catalogue as Java constants.** Compile-time catalog, no loader, no
   JSON. Disqualified: the demo audience must be able to see a
   realistic catalogue, and the brief puts the data shape in
   `catalog.json`.

## Decision

Take option 1.

### Schema (Liquibase `0002-catalog.yaml`, seven tables, snake_case)

- `product` — `id bigint identity PK`, `slug varchar(120) unique not null`,
  `brand`, `name`, `description`, `is_5g boolean`, `released_at date`,
  `rank integer`, `popularity_score integer`, `featured boolean`.
- `product_highlight` — `product_id FK`, `position`, `text`.
- `catalog_image` — `id varchar(64) PK` (SHA-256 hex of the bytes),
  `content_type`, `width`, `height`, `bytes bytea not null`.
- `product_color` — `product_id FK`, `code`, `name`, `swatch_hex`,
  `alt`, `image_id FK`, `position`; unique `(product_id, code)`.
- `product_variant` — `id varchar(80) PK` (T3 variant id
  `<productSlug>--<colorCode>--<storageGb>`), `product_id FK`,
  `slug`, `color_id FK`, `storage_gb integer`, `price_huf bigint`,
  `stock integer`; unique `(product_id, slug)`.
- `spec_group` — `product_id FK`, `position`, `title`.
- `spec_row` — `spec_group_id FK`, `position`, `label`,
  `row_value varchar(2000)`; spec row values are bounded at 2000 like
  description; the longest value in the 2026-09-19 snapshot is 366
  characters.

`spec_row.value` was renamed to `spec_row.row_value` because H2
keeps `VALUE` reserved under every quoting strategy we tried (backticks,
double-quoted column names, generic Liquibase types) and the
Liquibase-generated DDL would have collided with the JPA-generated DDL
at schema validation. The Java field stays `rowValue`, and the API
schema is unaffected: the contract never names the column.

Indexes on `product.rank`, every FK and the two unique constraints on
`(product_id, code)` and `(product_id, slug)`. `bytea` is used for
image bytes and works on both Postgres and H2 in PostgreSQL mode.

`alt` lives on `product_color`, not on `catalog_image`, because one
image file may be referenced by more than one colour, possibly of
different products. With alt on the image, the second colour would
silently inherit the first colour's alt text; with alt on the colour,
each colour owns its own. Width, height and content type are
properties of the bytes and must agree across every reference to the
same sha, so the validator refuses a second occurrence whose
dimensions or extension disagree with the first. The
`src/test/resources/catalog/catalog.json` fixture exercises the case
on every boot (`samsung-galaxy-s25` carries `navy` and `navy-alt`
sharing one image file with two different alt texts).

### Loader

`CatalogLoader` is an `ApplicationRunner` with `@Order(0)`. It runs
after Liquibase has applied the schema. The single entry point is

```java
public ValidatedCatalog validate(CatalogDto dto, Path imagesDir)
```

which runs in two phases. Phase (a) checks structural rules on the DTO
only — product slug pattern + uniqueness, variant id uniqueness across
the catalogue, variant slug uniqueness inside the product, variant id
shape, `storageGb ∈ {128,256,512}`, colorCode known inside the
product, highlights 1–6, ≤4 featured, ≥1 spec group with ≥1 row,
every colour has an image entry. Phase (b) reads each image from disk
at `imagesDir`, checks the extension ∈ {webp,jpg,png}, computes the
SHA-256 of the bytes and compares it to the file name stem. Phase (b)
runs only after (a) passes so a structural rule failure is never masked
by an image-rule failure and vice versa.

`load()` then persists everything inside
`new TransactionTemplate(txManager).executeWithoutResult(...)`, so a
JPA save failure rolls back the whole transaction and the shared
catalogue rows are never partially written. `@Transactional` is off
`load()` — the transaction is created by the template.

If `count(product) > 0`, the loader logs `catalogue present, N
products, loader skipped` and returns. Otherwise it logs `catalogue
loaded: X products, Y variants, Z images, W featured`.

Any violation throws `CatalogValidationException` with a message that
names the product, variant or file, and the application refuses to
start.

### Image storage and serving

Image bytes live in `catalog_image.bytes` (`bytea`). The image id is
the SHA-256 hex of the bytes; the file name on disk is `<sha>.<ext>`.
`Image.src` is `/api/v1/media/<imageId>` (root-relative). When a CDN is
added later, only the stored `src` values change; the contract stays
the same.

`MediaController` implements the generated `MediaApi`:

- 200 with the stored `Content-Type`, `Cache-Control: public,
  max-age=31536000, immutable`, `Content-Length` and the bytes;
- 404 `NOT_FOUND` problem with `params.imageId` set, routed through
  `ProblemAdvice`;
- no session handling: `/media/{imageId}` sits outside the scoped
  prefixes in `SessionCookieFilter`.

### Demo-size limit

T4a loads the catalogue once at startup. Per-request read design
(filters, facets, sort, paging, caching) belongs to T4b and is not
covered by this decision.

### What a later CDN move changes

Only the stored `src` values. The contract does not change, because
the client always puts the server-supplied `src` into the markup and
never builds a path from the id. The SHA-256 id stays as the
content-addressed identifier, so a CDN can cache by the same id.

## Consequences

**Wins.**

- The T3 fixture loader can `docker compose exec` the loader in one
  command after `scripts/local-database-docker.sh reset`; the schema
  is the migration and the data is the JSON + image bytes in
  `src/test/resources/catalog/` (fixture path) and, when the operator
  populates `data/catalog/`, on the operator path. `data/catalog/`
  is not tracked; the default profile fails fast with
  "catalogue file not found" until the operator path is populated.
- `ddl-auto=validate` runs against the same Liquibase schema on H2 in
  PostgreSQL mode and on Postgres, so a schema drift fails fast.
- A failed `load()` writes nothing because the persist step is wrapped
  in a `TransactionTemplate`; a JPA unique-constraint violation or any
  save failure rolls back the whole batch.

**Costs.**

- One-time load cost grows with catalogue size (a single `load()` at
  startup reads every fixture row). T4b's per-request read design is
  not covered here.
- The `spec_row.value → row_value` rename is a deviation from the
  brief's table layout; the API is unaffected because the contract
  never named the column. The decision is recorded here so a future
  schema-rename can revert it on Postgres-only environments where H2
  semantics do not bind.
- Image bytes live in the database. The demo's row count stays under
  ~1k × 4 images × tens-of-KB, well under Postgres limits, but a
  larger catalogue would want object storage and a `media_uri` column
  instead of `bytes`.

## Date and status

2026-09-19 — Valid.

## Sources

- docs/02-backend.md §4.1, §5, §6.1–6.2, §7.1, §7.3, §9.
- docs/04-adatbazis.md §3, §4, §5.
- docs/decisions/0002 — Liquibase changelog and portable constraints.
- docs/decisions/0003 — H2 in PostgreSQL mode for tests.
- docs/decisions/0004 — contract validator, JaCoCo gate, context path,
  JSON inclusion.
- Spring Framework 6.1 Reference, `TransactionTemplate`.
- Liquibase 5.0.3 documentation, `type` field behaviour.

## Note: paths after the monorepo move (MIM-411)

- The `docs/0N` citations above refer to the same files under `backend/docs/`.
- `data/catalog/` is the git root's `data/catalog/`, the one copy of the catalogue: the backend image carries it and the frontend fixture is generated from it.
- `data/catalog/` is tracked in git now, so the "is not tracked" sentence under Consequences no longer holds.
- `scripts/local-database-docker.sh reset` is now `deploy/compose.sh down -v`, which drops the PostgreSQL volume, catalogue and images together.
