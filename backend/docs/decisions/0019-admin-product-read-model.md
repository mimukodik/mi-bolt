# 0019 — Admin product read model

## Situation

The admin lists and edits every product, archived ones included, with
filters the shop does not offer (status, featured, out of stock, seven sort
fields). The shop's `ProductRepository` hides archived rows (ADR 0017), and
its query shapes serve the shop's list and detail pages.

## Decision

`AdminProductRepository` repeats the shop's split fetch queries without the
archive filter: products with colours and images in one statement, their
variants in a second, then highlights and spec groups for a detail.
`AdminProductQueryService` filters, sorts and pages in memory over that
list, with the product id as the tie-break in both directions; a detail
answers `ETag: "<version>"`. Measured with Hibernate statistics on the
test fixture: a list page runs 2 SQL statements whatever the filters, and a
detail runs 5. These counts are a measurement, not a gate.

## Consequences

Filtering in memory reads every product row for every list page. For the
48-product demo catalogue (`data/catalog/catalog.json`) that costs less
than the query plans a paged SQL filter over seven sort keys would need; a
database-side filter and page is the upgrade path if the catalogue grows.
The query parameters bind through the generated interface's defaults, so
the service never sees a null status, sort, direction, page or page size.

## Note: paths after the monorepo move (MIM-411)

- `data/catalog/` is the git root's `data/catalog/`, the one copy of the catalogue: the backend image carries it and the frontend fixture is generated from it.
