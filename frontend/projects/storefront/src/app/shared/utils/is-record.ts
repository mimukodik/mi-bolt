/**
 * Object-shape predicate for app code: a non-null, non-array object.
 * Mirrors the mocks layer's guard so `src/app` never imports from `projects/shop-mocks/src`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
