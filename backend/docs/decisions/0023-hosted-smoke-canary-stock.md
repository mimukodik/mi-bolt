# Hosted smoke canary stock

## Situation

Repeated hosted smoke purchases must run on a persistent demo database without
consuming normal catalogue inventory. Abandoned carts and payment attempts must
not require privileged cleanup, database resets or an external replenishment job.

## Options

Normal products with later replenishment can leak inventory on an interrupted run.
A new reset endpoint adds privileged API surface. A synthetic fixture can exercise
the existing purchase flow while keeping its stock unchanged in the order transaction.

## Decision

`mibolt.smoke.enabled` (`MIBOLT_SMOKE_ENABLED`) defaults to false and is enabled
explicitly only in demo smoke deployments. An ordered startup runner after
`CatalogLoader` creates `mi-bolt-smoke-canary` even in an already populated database.
Its only variant is `mi-bolt-smoke-canary--fekete--128`, priced at 10,000 HUF with
five units. It shares one existing immutable catalogue image, selected directly from
the image repository by ascending ID with a one-row limit. Image selection works even
when every normal product is archived and never changes those products. A repeated
bootstrap preserves the existing fixture and all other rows.

Public catalogue lists, search, facets, featured and related products always exclude
the reserved slug; its detail URL remains directly accessible. Cart, checkout,
payment and order endpoints use their normal validation and persistence paths.
With the flag enabled, order placement performs the normal conditional decrement
and immediately compensates exactly that variant belonging to the reserved product
inside the same transaction. No ordinary variant is compensated. This is an explicit
demo-only exception to rule 42's net stock decrement. The flag does not reset stock
or rewrite a previously edited fixture; operators must preserve the reserved fixture.

## Consequences

A commit keeps the canary stock unchanged; rollback undoes both stock updates.
Concurrent purchases serialize on the stock row and leave the same balance.
Abandoned carts or payment attempts never debit stock. Receipts and idempotency
records remain persisted normally, so the exception prevents inventory exhaustion,
not indefinite growth of order history. Disabling the flag prevents creation and
compensation; an existing fixture then has ordinary finite stock semantics.
No schema migration, new credentials, endpoint or response field is required.

## Date and status

2026-09-30 — accepted for MIM-451.
