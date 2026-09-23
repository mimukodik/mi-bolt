# 0020 — Admin catalogue write API

## Situation

`docs/02-backend.md` §9 forbids accepting a price, a stock or an amount from a
request body, so that a shopper can never set a price. The admin catalogue
surface exists to set exactly those. Contract 2.1.0 adds
`POST /admin/products`, `PUT /admin/products/{productId}`,
`POST /admin/products/{productId}/archive` and `…/restore` behind the admin
session and CSRF checks (ADR 0015).

## Decision

- **The §9 exception.** Price and stock are accepted from the body of
  `POST /admin/products` and `PUT /admin/products/{productId}` only, behind
  the admin chain; `docs/02-backend.md` names the exception.
- **Validation in three stages, each answered whole.** Bean validation of the
  body (every violation in one answer, 400 when one is `REQUIRED`, else 422);
  then `AdminProductValidator`'s cross-field rules, answered the same way;
  then the database rules, collected in this order: `/slug` `SLUG_TAKEN` on
  create or `SLUG_IMMUTABLE` on replace, `/colors/{i}/imageId`
  `UNKNOWN_IMAGE` per colour, and `/featured` `FEATURED_LIMIT` with
  `params.max` 4 when the product would be a fifth featured active product.
- **Identity.** A variant id is `<slug>--<colorCode>--<storageGb>`. The slug
  never changes after creation and a variant keeps its id while its (colour
  code, storage) pair exists, because `cart_item.variant_id` references it
  without cascade and the shop URL carries the slug.
- **Versions.** Every write sets `product.updated_at` from the application
  clock. That makes the product row dirty, so `@Version` rises exactly once
  even when only a child row changed. Answers carry `ETag: "<version>"`.
  Archive, restore and replace require `If-Match`: absent is 428
  `PRECONDITION_REQUIRED`, another version 412 `PRODUCT_VERSION_CONFLICT`
  with `params.expected` and `params.received`.
- **Archive and restore.** Archive sets `archived_at`, restore clears it. A
  product already in the target state answers 200 unchanged, after the
  `If-Match` check. Restoring a featured product while four active products
  are featured answers 409 `FEATURED_LIMIT`. Archived products stay
  editable.
- **Replace.** Colours are matched by `code` and variants by (colour code,
  storage): a kept pair is updated in place, a new pair is inserted with its
  derived id, and a dropped pair is deleted, variants before colours.
  Dropping a variant that an unexpired cart holds answers 409
  `VARIANT_IN_CART` with `params.variantIds`; lines in expired carts are
  deleted first, and that shopper still gets the one-time 410
  `CART_EXPIRED` (ADR 0011). A uniqueness collision inside one replace
  answers 409 `CATALOG_CONSTRAINT_CONFLICT`, and a concurrent write between
  the version check and the flush answers 412.

## Consequences

- A created product is live in the shop at once; there is no draft state.
- The featured limit is checked when a product is created, restored or
  replaced, never when another product is archived. The check first locks
  the one row of `featured_limit_lock` (changeset 0009), so two writes that
  could each add a featured product run one after the other.
- Swapping two variant slugs in one replace is refused rather than
  engineered around.
- A 412 raised at the flush, after a concurrent write, carries only
  `params.received`: the winning version is not known inside the failed
  transaction.

## Note: paths after the monorepo move (MIM-411)

- The `docs/0N` citations above refer to the same files under `backend/docs/`.
