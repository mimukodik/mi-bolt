// tests/contract/admin-tags.ts — shared list of admin-tagged operations
// (MIM-331, plan F4 D13).
//
// The OpenAPI contract 2.1.0 declares 32 operations: 17 shop operations
// plus 15 admin operations, each admin operation tagged exactly one of
// `AdminAuth`, `AdminUsers`, `AdminProducts`, `AdminMedia`. The shop
// contract suite asserts the 17-operation shape; the shop SDK excludes
// the four tags; the admin SDK includes them; `ng-openapi-gen.admin.json`
// is the admin generator's configuration. Keeping the tag list in one
// place lets every spec-load point and the SDK-split spec reference the
// same constant.

export const ADMIN_TAGS = ['AdminAuth', 'AdminUsers', 'AdminProducts', 'AdminMedia'] as const;

/**
 * Returns `true` when `operation` is an OpenAPI operation object whose
 * `tags` array contains at least one admin tag. Anything that is not an
 * object with a `tags` array (path-level keys, vendor extensions, errors)
 * is treated as a non-admin operation.
 */
export function isAdminOperation(operation: unknown): boolean {
  if (operation === null || typeof operation !== 'object') return false;
  const tags = (operation as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return false;
  return tags.some(
    (tag) => typeof tag === 'string' && (ADMIN_TAGS as readonly string[]).includes(tag),
  );
}

type PathItem = Record<string, unknown>;
type OpenApiLike = {
  paths?: Record<string, PathItem>;
  components?: unknown;
  [key: string]: unknown;
};

const NON_OPERATION_KEYS = new Set(['parameters', 'summary', 'description', '$ref']);
const HTTP_METHOD_KEYS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/**
 * Returns a copy of `spec` whose `paths` keeps only the shop operations.
 * Per path item, every non-operation key (`parameters`, `summary`,
 * `description`, `$ref`) is kept verbatim, and every HTTP-method key
 * (`get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace`)
 * is kept verbatim when its operation is not an admin operation, and
 * dropped when it is. A path item left with no HTTP-method key is
 * dropped from `paths`. `components` and every other top-level key are
 * kept as they are. The input is never mutated.
 */
export function withoutAdminOperations<T>(spec: T): T {
  if (spec === null || typeof spec !== 'object') return spec;
  const source = spec as OpenApiLike;
  const copy: Record<string, unknown> = { ...source };
  const paths = source.paths;
  if (paths && typeof paths === 'object') {
    const filteredPaths: Record<string, PathItem> = {};
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      if (pathItem === null || typeof pathItem !== 'object') continue;
      const sourcePathItem = pathItem as PathItem;
      const nextPathItem: PathItem = {};
      let hasHttpMethod = false;
      for (const key of NON_OPERATION_KEYS) {
        if (key in sourcePathItem) {
          nextPathItem[key] = sourcePathItem[key];
        }
      }
      for (const key of HTTP_METHOD_KEYS) {
        const value = sourcePathItem[key];
        if (value === undefined) continue;
        if (isAdminOperation(value)) continue;
        nextPathItem[key] = value;
        hasHttpMethod = true;
      }
      if (hasHttpMethod) filteredPaths[pathKey] = nextPathItem;
    }
    copy.paths = filteredPaths;
  }
  return copy as T;
}
