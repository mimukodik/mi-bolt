/**
 * Resolve a contract image URL against the deployment's base URI.
 *
 * `docs/api/openapi.yaml:1126` fixes what arrives here: `Image.src` is a
 * ready-to-use URL the client puts into the markup unchanged and never
 * prefixes or rewrites, and the server decides its shape — the catalogue
 * serves `/api/v1/media/<imageId>`, the bundled device art
 * `/assets/products/<file>`. Any root-relative path is therefore valid
 * input, not only the `/assets/` one.
 *
 * The boundary `docs/spec/architecture.md` §18 asks for is kept, minus
 * the `/assets/` prefix that section still names: this is the single
 * place an `<img src>` value is produced, and it accepts only a
 * normalised root-relative path resolved under the deployment's own
 * base. An absolute URL, a protocol-relative `//host/…`, a
 * `javascript:`/`data:` URL, a percent-encoded path, a `.` or `..`
 * segment and anything that escapes the base are all rejected, so no
 * untrusted remote URL can reach an `<img src>` through it.
 */
export class AssetUrlError extends Error {}

export function resolveAssetUrl(path: string, documentBaseUri: string): string {
  // A single leading slash and nothing else: this rejects an absolute
  // URL, a protocol-relative `//host/…`, a `javascript:` or `data:` URL
  // and a relative path in one condition.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new AssetUrlError(`asset path must be a root-relative path: ${path}`);
  }

  // A `.` or `..` segment resolves above the path the server named. At a
  // root deployment (`<base href="/">`, `src/index.html:6`) the base-prefix
  // check below cannot catch that, because every same-origin pathname
  // starts with `/`, so the segments are refused here instead. The split
  // takes a backslash as a separator too: the URL parser treats it as one
  // for an http(s) base, so `/assets/..\..\x` escapes just like
  // `/assets/../../x` while splitting on `/` alone would miss it.
  if (path.split(/[/\\]/).some((segment) => segment === '.' || segment === '..')) {
    throw new AssetUrlError(`asset path must have no relative segment: ${path}`);
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new AssetUrlError(`asset path is not valid percent-encoding: ${path}`);
  }
  if (decoded !== path) {
    throw new AssetUrlError(`asset path must be unencoded: ${path}`);
  }

  const base = new URL(documentBaseUri);
  // The leading slash is dropped so the path resolves under the
  // deployment base rather than at the origin root: an application
  // served from `/mi-bolt/` reaches its own `/mi-bolt/api/v1/media/…`.
  const resolved = new URL(path.slice(1), base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new AssetUrlError(`asset URL left ${base.href}: ${resolved.href}`);
  }
  return resolved.href;
}
