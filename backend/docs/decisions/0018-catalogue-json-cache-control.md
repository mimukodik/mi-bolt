# 0018 — Catalogue JSON Cache-Control

## Situation

Product JSON carried no cache header: `ProductsController` returned bare
`ResponseEntity.ok(...)`, so a browser could reuse a stale product response
after an admin edit by its heuristic freshness. The owner asked that an admin
change show in the shop on the next load (MIM-296 decisions, item 6).

## Decision

`GET /products`, `GET /products/{slug}` and `GET /products/{slug}/related`
answer `Cache-Control: no-cache` (RFC 9111 §5.2.2.4,
https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.4). Media keeps
`public, max-age=31536000, immutable` (`MediaController`), safe because a
changed image gets a new content-hash id. Admin JSON gets Spring Security's
`no-cache, no-store, max-age=0, must-revalidate` from its own chain (ADR 0015);
nothing added here.

## Consequences

With no validator on these responses every load refetches the body; for 48
products that is cheap. `ShallowEtagHeaderFilter` would add 304 answers but
hashes every body; it is the upgrade path if the catalogue grows. The contract
documents the header as optional since 2.1.0.
