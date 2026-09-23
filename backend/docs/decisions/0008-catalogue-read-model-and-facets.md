# 0008 — Catalogue read model, facets, and 503 decision

## Situation

T4b turns the catalogue that T4a stored into the three read endpoints the
contract names: `listProducts`, `getProduct`, and `listRelatedProducts`. The
brief fixes the shape of every entry (a `(product, storage)` pair), the facet
algorithm (disjunctive counts with each facet's own selection removed), the
seven sort modes, the featured and related caps, the `minPrice ≤ maxPrice`
and `pageSize ∈ {12,24}` validations, the `MAX_PER_LINE = 5` constant for
`maxQuantity`, the `GET /media/{imageId}` prefix on every `Image.src`, and the
spec-group id rule. It also leaves three questions the unit has to settle:
the query count, the place to enforce the four validations, and what to do
about `503`.

## Options

1. **In-Java read model over the JPA entities.** Read every product once per
   request through a bounded set of repository queries, build the entries
   in memory, and apply every filter, facet, sort and paging decision in
   Java. The shape of the domain is small (a few hundred rows in the demo
   fixture) and the contract binds the read shape, not the storage shape;
   building the read model once and reusing it keeps the controller
   one-line delegation and makes every facet and sort decision a single
   readable piece of Java instead of an SQL dialect exercise.
2. **Specification / Criteria API on the JPA entities.** Build a JPA
   `Specification` chain from the request, push it into a single repository
   call, and let Hibernate generate the SQL. Cuts the query count to one
   but couples the read shape to the storage shape; the disjunctive facet
   counts become several correlated subqueries with `count(*) filter
   (where ...)`, the entry shape (a `(product, storage)` pair with a chosen
   colour) becomes a custom `@Formula` on the entity, and the sort modes
   other than `recommended` become seven hand-written `case` expressions.
3. **SQL view + a thin read-only entity.** Materialise the read shape into
   a database view and map it 1:1 to a JPA entity. Pushes the same
   complexity as option 2 into the schema, adds a migration and a
   Liquibase change, and the sort/filter SQL still has to be hand-written
   for every mode the contract defines.

## Decision

Take option 1.

### Query shape (one request = five queries)

Hibernate refuses to fetch-join more than one `List` collection in a single
query (`MultipleBagFetchException`), so the catalogue read is split into
five queries that all run inside the same `@Transactional(readOnly = true)`
method on `CatalogService`:

1. `ProductRepository.findAllWithColors` — `select distinct p from Product p
   left join fetch p.colors c left join fetch c.image order by p.rank,
   p.id`. Colours is the only bag here; `image` is a to-one, safe to join.
2. `ProductRepository.fetchHighlights(products)` — `left join fetch
   p.highlights where p in :products`.
3. `ProductRepository.fetchVariants(products)` — `left join fetch p.variants
   v left join fetch v.color where p in :products`.
4. `ProductRepository.fetchSpecGroups(products)` — `left join fetch
   p.specGroups where p in :products`.
5. `SpecGroupRepository.fetchRows(products)` — `left join fetch g.rows where
   g.product in :products`.

Queries 2–5 return the same managed entities query 1 already loaded; their
return values are discarded and their collections are initialised in place
inside the persistence context, so the service reads every collection from
the same `List<Product>` query 1 returned. `@OrderBy("position")` on the
entity fields keeps the in-memory order stable across all five calls.

For `getProduct`, `loadOne` runs `fetchColors` (colours with their images)
plus the four other fetchers on the single product `findBySlug` returned, so
the detail endpoint issues six queries. `listRelatedProducts` loads the
whole catalogue with the same five queries as the list and finds the
subject in memory, so it issues five. `CatalogQueryCountTest` pins the
three counts with Hibernate statistics: **5 queries for `GET /products`, 6
for `GET /products/{slug}`, 5 for `GET /products/{slug}/related`**.

### Facet algorithm

The brief fixes disjunctive counts: each facet is counted with its own
selection removed. The service implements this by building two filters per
facet — the inbound filters, and the same filters with that one facet
cleared — and counting entries that match the cleared filter but still
match every other filter. For `is5g` and `inStock` the count is the integer
the contract names ("entries that would remain if the filter were
switched on"). For `priceRange` the service computes min and max over the
filtered, featured-capped entries; an empty result set yields `min = max =
0 HUF`.

### Sort table

| Sort value     | Comparator                                                                              |
| -------------- | --------------------------------------------------------------------------------------- |
| `recommended`  | `rank asc`, `productId asc`, `storage asc`                                              |
| `newest`       | `releasedAt desc`, then recommended                                                      |
| `oldest`       | `releasedAt asc`, then recommended                                                       |
| `popularity`   | `popularityScore desc`, then recommended                                                |
| `price_asc`    | `entry.price asc`, then recommended                                                      |
| `price_desc`   | `entry.price desc`, then recommended                                                     |
| `name_asc`     | `(brand + " " + name)` `String.CASE_INSENSITIVE_ORDER` ascending, then `storage asc`      |
| `name_desc`    | `(brand + " " + name)` `String.CASE_INSENSITIVE_ORDER` descending, then `storage asc`    |
| `recommended` with `q` | match position ascending (earlier first), then rank, then product id, then storage asc |

### Constants and prefixes

- `CatalogService.MAX_PER_LINE = 5`. The brief sets the per-order-line cap
  at 5; the issue-owner's configuration is the source, and the constant is
  named in 0008 so a future price-volume decision has a single place to
  change.
- `CatalogService.MEDIA_SRC_PREFIX = "/api/v1/media/"`. The context path is
  read once from `server.servlet.context-path` (see `application.properties`)
  and the route is owned by `MediaApi`; the prefix is assembled here so the
  unit test can assert the exact string and the contract check passes
  against the literal `src` value.
- `FEATURED_CAP = 4`. The contract says "at most four"; the loader already
  enforces a maximum of four featured products, so this only bites if a
  future fixture grows.
- `RELATED_CAP = 4`. Same reason for the related-products endpoint.

### Spec group id rule

`SpecGroup.title` is slugified with the same rule as product slugs:
`Normalizer.normalize(..., NFD)`, strip combining marks, lowercase, replace
every non-`[a-z0-9]` run with a single dash, trim trailing dashes. Inside
one product, two groups whose titles slugify identically get a `-{position}`
suffix; across products the slug is shared (the `id` is only required to
be unique inside one product). The fixture exercises both cases on every
boot.

### Validation and 503 decision

- `minPrice > maxPrice` → `DomainException(INVALID_REQUEST)` from the
  service.
- `minPrice < 0` and `maxPrice < 0` → `DomainException(INVALID_REQUEST)`
  from the service.
- `page < 1` → `DomainException(INVALID_REQUEST)` from the service.
- `pageSize ∉ {12, 24}` → `DomainException(INVALID_REQUEST)` from the
  service.
- `storageGb=999` and `sort=foo` are caught by the existing
  `MethodArgumentTypeMismatchException` mapping.
- Unknown query parameters are caught by `UnknownQueryParameterInterceptor`
  (set up in T1).
- A malformed slug (`Bad_Slug`) is caught by the path-pattern validation on
  the generated `getProduct` and `listRelatedProducts` methods
  (`@Pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")`) and answered as `404 NOT_FOUND`
  with `params.slug`, the same body an unknown slug gets, because the
  contract declares no 400 for the two `{slug}` paths.
- **No 503 path.** Nothing in the catalogue endpoints can produce a 503:
  the read is against an in-memory catalog loaded at startup, there is no
  remote dependency, and every validation is mapped to a Problem. The
  `ProblemAdvice.handleUnexpected(Throwable)` 503 fallback still exists for
  the rest of the application (cart, checkout, payment-intents, orders) but
  is unreachable from `/products*`. A page number beyond
  `Integer.MAX_VALUE / pageSize` is computed in `long`
  (`hugePageReturnsEmptyItems`).
- `storageGb` query values arrive as strings, and the generated
  `EnumConverterConfiguration` converts only from `Integer`, so
  `StorageGbConverter` (a `Converter<String, StorageGb>` bean) binds them;
  `ProductsApiTest.storageFilter` pins it.

### ConstraintViolationException handler

The generated `CatalogApi (named ProductsApi before contract 2.1.0, see 0014)` interface carries `@Validated` on every method,
which the orchestrating session has no control over. The
`ConstraintViolationException` that AOP method validation throws before
the service runs would otherwise fall through to the 503 fallback, so
`ProblemAdvice` maps it to `400 INVALID_REQUEST` with
`params.parameter` (the last path segment) and `params.reason` (the
constraint annotation's simple name in upper case: `MIN`, `SIZE`,
`PATTERN`), the same shape the `HandlerMethodValidationException` handler
produces; a violation on the `slug` path parameter is the one exception and
is answered as 404 (see "Validation and 503 decision" above).

### Contract correction

`api/openapi.yaml` line 1341, schema `FacetValue`: the line
`additionalProperties: false` was deleted. `ColorFacetValue` is
`allOf: [FacetValue, {swatchHex}]` with its own `unevaluatedProperties:
false`; an `unevaluatedProperties` inside one `allOf` branch cannot see
properties evaluated by a sibling branch, so the only place the swatch
hex can be forbidden-for-`FacetValue`-and-allowed-for-`ColorFacetValue`
is the outer keyword. After the deletion `FacetValue` (used by `brands` and
`storageGb`) no longer forbids unknown members at the validator level; the
generated Java class still has only the `value`, `label` and `count`
fields, and the contract check in `ProductsApiTest` keeps `swatchHex`
assertions on `colors` only.

## Consequences

**Wins.**

- One request to the catalogue database issues five SQL queries (six for
  detail/related), and the result is fully in memory before the facet
  algorithm starts, so a half-dozen disjunctive passes do not turn into a
  half-dozen extra queries.
- Every facet and sort rule is a piece of plain Java next to the read it
  feeds, so a reviewer can read the brief and the service side-by-side.
- The mapper (`CatalogModels`) is the only class that constructs the
  generated DTOs. The controller imports `api.model.Product` as its return
  type and relies on the single-type import shadowing the JPA entity of the
  same name; the service imports only `ProductSort` and `StorageGb`, so no
  inline FQN is needed anywhere.

**Costs.**

- Two new types (`CatalogData` records, `CatalogModels` mapper) sit between
  the service and the controller. They exist because the generated
  `api.model` types share three names with the JPA entities; removing them
  would mean either renaming one side or keeping inline FQNs in the service.
- The `ConstraintViolationException` handler exists only because the
  generated `CatalogApi (named ProductsApi before contract 2.1.0, see 0014)` carries `@Validated`; a generator configuration
  change would remove it.
- The detail read (`loadOne`) issues its own five fetchers for one
  product instead of reusing the list's batch, because the `findBySlug`
  result lives in a different persistence context; `CatalogQueryCountTest`
  keeps the resulting counts (5 / 6 / 5) from drifting.

## Date and status

2026-09-20 — Valid.

## Sources

- docs/02-backend.md §4.1, §7.1, §9.
- docs/decisions/0004 — JaCoCo gate and contract validator.
- docs/decisions/0007 — Catalogue schema and loader.
- Hibernate 6.6 User Guide, "Fetching associations" and
  `MultipleBagFetchException`.
- Spring Data JPA 3.4 Reference, "Defining repository queries".
- OpenAPI 3.1 Specification, `unevaluatedProperties`.
