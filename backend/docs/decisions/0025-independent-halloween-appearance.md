# Independent Halloween appearance schedule

## Situation

BOLT-6 requires Halloween decoration to have its own period, independent of
product sale schedules. A product edit must never change shop decoration.

## Options

Derive appearance from active product promotions, configure dates in a static
property, or persist separate editable settings.

## Decision

Persist one `halloween_appearance` row with enabled, nullable start/end instants
and a JPA version, seeded disabled without dates. Admin settings use existing
session/CSRF security and quoted ETag/If-Match. Writes lock the singleton row
before checking the version and validating; rejected writes preserve state.
Enabled requires both dates and strict start-before-end.

Read appearance using the injected server Clock over `[start,end)`, independent
of products and sales. Return serverTime and the nearest future relevant
boundary to clients, with no-store cache control. The shop operation retains
the existing demo gate.

## Consequences

The additive table and disabled seed tolerate previous binaries because they
never access this table. No campaign dates are chosen at deploy time. Disabled
or invalid stored settings fail closed. Product promotions continue on their
own schedules and can run with decoration off, or vice versa.

## Date and status

2026-10-10, implemented for BOLT-6; human review pending.

Input timestamps must be exactly representable at PostgreSQL microsecond
precision. Finer instants are rejected with field-level DATETIME_PRECISION
rather than silently rounded; otherwise a valid narrow period could collapse
on persistence.
