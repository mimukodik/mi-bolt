/**
 * Pure object-shape predicate for the mocks layer (FIX-…, T… — see
 * `src/mocks/business-route-predicates.ts`, the precedent for a small
 * mocks-local predicate module with no external imports). Each of the
 * nine call sites under `src/mocks/` previously narrowed an `unknown`
 * value to a record with a bare cast; `code-standards.md` forbids that
 * — a cast asserts, a guard proves. This predicate is that proof.
 */

/**
 * True when `value` is a non-null, non-array object. Returns a type
 * guard so callers read the narrowed record instead of casting. Arrays
 * are excluded because indexing them with a string key returns
 * `undefined` and silently masks a missing field.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
