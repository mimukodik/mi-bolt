// projects/core-api/src/api-root.ts — T04-AC05
//
// Derives the SDK's runtime root URL from `document.baseURI` so every generated
// API call resolves against the same origin Angular itself was bootstrapped
// from, including any base-href subpath. The OpenAPI contract pins its server
// URL to `/api/v1`; we concatenate that with the runtime origin so local
// dev and any other deployment reach MSW on the same origin without
// rewriting SDK calls.
//
// The function is the only place that reads `document`. Throwing when the
// document is missing is deliberate: SSR, prerendering or Node-only execution
// must not silently ship a hard-coded origin. T02-G02 forbids SSR, so this
// throw is a guardrail for accidental regressions, not a runtime path.

const API_PATH = '/api/v1';

export function resolveApiRoot(documentLike?: Pick<Document, 'baseURI'>): string {
  if (typeof documentLike === 'undefined' && typeof document === 'undefined') {
    throw new Error(
      '[mi-bolt] resolveApiRoot(): document is missing; SDK cannot derive a same-origin root.',
    );
  }
  const baseUri = (documentLike ?? document).baseURI;
  let origin: string;
  try {
    origin = new URL(baseUri).origin;
  } catch (err) {
    throw new Error(
      `[mi-bolt] resolveApiRoot(): cannot parse document.baseURI "${baseUri}" as a URL (${String(err)})`,
      { cause: err },
    );
  }
  if (origin === 'null') {
    throw new Error(
      `[mi-bolt] resolveApiRoot(): document.baseURI "${baseUri}" has an opaque origin; SDK cannot derive a same-origin root.`,
    );
  }
  return `${origin}${API_PATH}`;
}
