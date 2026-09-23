# 0017 — Product archive and shop exclusion

## Situation

The admin removes a product from the shop by archiving it (`product.archived_at`,
a `TIMESTAMP WITH TIME ZONE` set by changeset 0008; `NULL` means active).
The owner's rule on 2026-09-22 is "archive, not delete": `cart_item` keeps a
foreign key to `product_variant` without cascade (`0003-cart.yaml:64-70`),
and `order_line` keeps a snapshot of the variant, so a hard delete would
break existing carts and historical orders. The shop must therefore hide
archived products and refuse to sell a variant of an archived product.

## Decision

- `archived_at NULL` means the product is active; a non-null value is the
  archive moment. The column is set by the admin; the shop never writes it.
- Every shop read path skips archived products:
  - `GET /products` (list and facets): `ProductRepository.findAllWithColors`
    gains `where p.archivedAt is null`. The four `fetch*` queries stay
    unchanged because they only initialise collections on the entities
    query 1 returned; with the archive clause in query 1, none of them ever
    see an archived product.
  - `GET /products/{slug}`: `findBySlug` becomes
    `findBySlugAndArchivedAtIsNull`, derived from the Spring Data method
    name. An archived product is `404 NOT_FOUND`, same `Problem` body as an
    unknown slug.
  - `GET /products/{slug}/related`: the same `loadCatalogue()` drives this
    path, so the subject is missing from the candidates and the endpoint
    returns `404 NOT_FOUND` for an archived subject; for any other subject,
    Apple never appears in the related list.
- `GET /media/{imageId}` is unchanged by design. The URL is content-
  addressed and may be cached or hot-linked, so an archived product's
  image stays reachable.
- The cart uses `CatalogService.orderableMax(ProductVariant)` at the four
  call sites that previously called `maxQuantity(stock)`: `addItem` (line 92),
  `setQuantity` (line 133), `reconcile` (line 214), and the per-line max on
  the view (line 249). `orderableMax` returns `0` when the product's
  `archivedAt` is non-null, otherwise `maxQuantity(stock)`.
- The shopper-visible consequences are the existing stock-0 paths:
  - `GET /cart` runs the reconciliation pass on every request; a line whose
    product is archived has `orderableMax == 0`, so the line is dropped and
    an `ITEM_REMOVED` notice is added; the cart version is bumped (ADR 0011
    "A notice counts as a change").
  - `POST /cart/items` of an archived product's variant answers
    `409 OUT_OF_STOCK` (the existing "Variant is not orderable" title).
  - `PATCH /cart/items/{variantId}` of an archived line answers
    `409 QUANTITY_LIMIT` with `params.max = 0` (the existing max check).
  - `POST /orders` calls `cartService.getCart` (rule 47), so an archive that
    landed before the order is reported through the notice list and the
    order answers `409 OUT_OF_STOCK` with `params.notices` containing
    `ITEM_REMOVED`.
- Accepted race: an archive that lands between `cartService.getCart` and
  `ProductVariantRepository.decrementStock` (`OrderService.java:179-188`)
  still completes the order, because the conditional update is keyed on
  stock, not on the product's archive status. Documented as a known race,
  not a fix target: the window is sub-second in practice and an order that
  lands before the archive is consistent with the catalogue the shopper
  saw at checkout.
- Query counts stay 5 / 6 / 5 (list, detail, related; ADR 0008): only `where`
  clauses change; the entity fan-out is untouched.

## Consequences

- A reader of the code can tell which products the shop sees by following
  the two query strings; no in-memory filter is needed.
- A reader of the cart code can tell that the four quantity-cap call sites
  now route through one helper that knows about archiving.
- The race in `OrderService.place` is acknowledged but not closed. Closing
  it would require a second conditional update on `product.archived_at`
  inside `decrementStock`, which Hibernate does not express cleanly and
  would couple the variant repository to the product table; the cost is
  not justified for the demo MVP.

## Date and status

2026-09-23 — Accepted. MIM-327 B7.
