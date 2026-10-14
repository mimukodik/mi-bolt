// tests/contract/admin-tags.ts — shared list of admin-tagged operations
// (MIM-331, plan F4 D13).
//
// The OpenAPI contract 2.2.0 declares 34 operations: 19 shop operations
// plus 15 admin operations, each admin operation tagged exactly one of
// `AdminAuth`, `AdminUsers`, `AdminProducts`, `AdminMedia`. The shop
// contract suite asserts the 19-operation shape; the shop SDK excludes
// the four tags; the admin SDK includes them. Keeping the tag list in one
// place lets every spec-load point and the SDK-split spec reference the
// same constant.

import { isRecord } from '../../projects/shop-mocks/src/is-record';

export const ADMIN_TAGS = ['AdminAuth', 'AdminUsers', 'AdminProducts', 'AdminMedia'] as const;

const ADMIN_TAG_SET: ReadonlySet<string> = new Set<string>(ADMIN_TAGS);

/** `true` when `tag` is one of `ADMIN_TAGS`. */
export function isAdminTag(tag: unknown): boolean {
  return typeof tag === 'string' && ADMIN_TAG_SET.has(tag);
}

/**
 * Returns `true` when `operation` is an OpenAPI operation object whose
 * `tags` array contains at least one admin tag. Anything that is not an
 * object with a `tags` array (path-level keys, vendor extensions, errors)
 * is treated as a non-admin operation.
 */
export function isAdminOperation(operation: unknown): boolean {
  if (!isRecord(operation)) return false;
  const tags = operation['tags'];
  return Array.isArray(tags) && tags.some(isAdminTag);
}

const NON_OPERATION_KEYS: readonly string[] = ['parameters', 'summary', 'description', '$ref'];
export const HTTP_METHOD_KEYS: readonly string[] = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
];

/**
 * Returns a copy of `spec` whose `paths` keeps only the shop operations.
 * Per path item, every non-operation key (`parameters`, `summary`,
 * `description`, `$ref`) is kept verbatim, and every HTTP-method key is
 * kept verbatim when its operation is not an admin operation, and dropped
 * when it is. A path item left with no HTTP-method key is dropped from
 * `paths`. `components` and every other top-level key are kept as they
 * are. The input is never mutated.
 */
export function withoutAdminOperations<T extends object>(spec: T): T {
  // Callers (schema.spec.ts / response-validation.ts / sdk-transport.spec.ts)
  // hand in a yaml.load(...) result cast to an OpenAPI-like shape; a malformed
  // YAML file can yield null/undefined back. `Reflect.get` throws on those,
  // so guard before the indexed access and degrade to the input (matching
  // the OLD defensive behaviour) instead of crashing the suite.
  if (spec === null || spec === undefined) return spec;
  const paths: unknown = Reflect.get(spec, 'paths');
  if (!isRecord(paths)) return spec;
  const filteredPaths: Record<string, Record<string, unknown>> = {};
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    const nextPathItem: Record<string, unknown> = {};
    let hasHttpMethod = false;
    for (const key of NON_OPERATION_KEYS) {
      if (key in pathItem) nextPathItem[key] = pathItem[key];
    }
    for (const key of HTTP_METHOD_KEYS) {
      const value = pathItem[key];
      if (value === undefined || isAdminOperation(value)) continue;
      nextPathItem[key] = value;
      hasHttpMethod = true;
    }
    if (hasHttpMethod) filteredPaths[pathKey] = nextPathItem;
  }
  return { ...spec, paths: filteredPaths };
}
