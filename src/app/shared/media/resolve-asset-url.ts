/**
 * Resolve a logical `/assets/…` path against the deployment's base URI.
 *
 * `docs/spec/architecture.md:159` fixes this contract: only a normalised
 * logical `/assets/` path is accepted, the leading slash is stripped, the
 * remainder is resolved against `document.baseURI`, and any result that
 * escapes the deployment's own `assets/` prefix is rejected. The rule
 * exists so that no untrusted remote URL can reach an `<img src>`: every
 * asset URL the application renders passes through here first.
 */
export class AssetUrlError extends Error {}

const LOGICAL_PREFIX = '/assets/';

export function resolveAssetUrl(path: string, documentBaseUri: string): string {
  // Rejects an absolute URL, a protocol-relative `//host/…`, a relative
  // path and any prefix other than `/assets/` in one condition: none of
  // them starts with `/assets/`.
  if (!path.startsWith(LOGICAL_PREFIX)) {
    throw new AssetUrlError(`asset path must start with ${LOGICAL_PREFIX}: ${path}`);
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
  const resolved = new URL(path.slice(1), base);
  const allowedPrefix = new URL('assets/', base).pathname;
  if (!resolved.pathname.startsWith(allowedPrefix)) {
    throw new AssetUrlError(`asset URL left ${allowedPrefix}: ${resolved.href}`);
  }
  return resolved.href;
}
