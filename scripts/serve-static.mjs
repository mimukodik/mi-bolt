#!/usr/bin/env node
// scripts/serve-static.mjs — T28 deployable CSR demo static server.
//
// A minimal HTTPS-or-localhost static host for the production build
// under `dist/mi-bolt/browser/`. The server:
//
//   * binds 127.0.0.1 only (no 0.0.0.0) so it never leaks to the LAN;
//   * serves the `dist/mi-bolt/browser/` directory;
//   * applies SPA fallback — any GET request that does NOT start
//     with `/api/` and that does not resolve to an existing file
//     returns `index.html` so deep links survive a hard reload;
//   * rejects every `/api/*` path with HTTP 404 and an
//     `application/problem+json` body — the server NEVER silently
//     hands `/api/...` back to `index.html`, otherwise MSW would
//     start serving business traffic from the SPA shell;
//   * tags `index.html` and `mockServiceWorker.js` with
//     `Cache-Control: no-cache, no-store, must-revalidate`;
//   * tags hashed assets (`chunk-*.js`, `main-*.js`,
//     `styles-*.css`, anything under `/assets/`) with
//     `Cache-Control: public, max-age=31536000, immutable`;
//   * serves `mockServiceWorker.js` from the static root so the
//     page can register it directly without an `/assets/` prefix.
//
// Environment:
//
//   MI_BOLT_API_PROXY          when set, every `/api` or `/api/*`
//                              request is forwarded to that origin with
//                              the same method, path, query and headers
//                              (host rewritten to the target's host)
//                              instead of answering 404; a connection
//                              failure or timeout replies 502 with
//                              problem+json (timeout: MI_BOLT_API_PROXY_TIMEOUT_MS).
//   MI_BOLT_API_PROXY_TIMEOUT_MS
//                              milliseconds the proxy waits for the backend
//                              before answering 502 (default 30000).
//   MI_BOLT_PAYMENT_STATIC_DIR when set, `/demo-fizetes` and
//                              `/demo-fizetes/*` are served from that
//                              directory with the same safe resolution
//                              and SPA fallback as the shop; without
//                              it `/demo-fizetes` falls through to the
//                              shop shell.
//   MI_BOLT_PAYMENT_ONLY       when set to `1` (with MI_BOLT_PAYMENT_STATIC_DIR),
//                              the host serves only the payment app: `/api`
//                              is still proxied, `/demo-fizetes/*` is served,
//                              and every other GET answers 302 to
//                              `/demo-fizetes/`; the shop bundle is not served.
//                              Without MI_BOLT_PAYMENT_STATIC_DIR the host
//                              exits 1 at startup.
//   PORT                     listen port (default 4200).
//   HOST                     listen address (default 127.0.0.1).
//
// The server is intentionally tiny — no caching layer, no
// compression, no directory listings — because every byte of its
// behaviour must be reproducible from this file.

import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer, request as httpRequest } from 'node:http';
import { parseProxyTimeout } from './proxy-timeout.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_DIR = resolve(
  repoRoot,
  process.env['MI_BOLT_E2E_STATIC_DIR'] ?? 'dist/mi-bolt/browser',
);
const API_PROXY = process.env['MI_BOLT_API_PROXY'] ?? null;
/** Milliseconds the proxy waits for the backend before answering 502. */
const API_PROXY_TIMEOUT_MS = parseProxyTimeout(process.env['MI_BOLT_API_PROXY_TIMEOUT_MS']);
const PAYMENT_STATIC_DIR = process.env['MI_BOLT_PAYMENT_STATIC_DIR']
  ? resolve(repoRoot, process.env['MI_BOLT_PAYMENT_STATIC_DIR'])
  : null;
const PAYMENT_ONLY = process.env['MI_BOLT_PAYMENT_ONLY'] === '1';
if (PAYMENT_ONLY && PAYMENT_STATIC_DIR === null) {
  console.error('serve-static: MI_BOLT_PAYMENT_ONLY=1 needs MI_BOLT_PAYMENT_STATIC_DIR');
  process.exit(1);
}
const HOST = process.env['HOST'] ?? '127.0.0.1';
const PORT = Number.parseInt(process.env['PORT'] ?? '4200', 10);

const NO_CACHE_HEADERS = {
  'cache-control': 'no-cache, no-store, must-revalidate',
  pragma: 'no-cache',
  expires: '0',
};

const IMMUTABLE_HEADERS = {
  'cache-control': 'public, max-age=31536000, immutable',
};

/**
 * Resolve a request pathname to a path inside baseDir, rejecting any attempt to
 * escape via `..` segments. Returns null when the path is not a safe candidate
 * for file lookup (the SPA fallback handles the rest).
 *
 * Accepts a pathname string (already extracted by the caller via `new URL()`).
 */
function safeResolveFromPath(urlPath, baseDir = STATIC_DIR, prefix = '/') {
  // Decode percent-encoded segments without throwing on malformed input —
  // the SPA fallback will pick up the bad request.
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  // Strip the trailing slash so `/telefonok/` resolves to the same file the
  // SPA fallback would have answered for `/telefonok`.
  const trimmed = decoded.replace(/\/+$/, '') || '/';
  let relative = trimmed;
  if (prefix !== '/') {
    if (relative === prefix) relative = '/';
    else if (relative.startsWith(prefix + '/')) relative = relative.slice(prefix.length);
    else return null;
  }
  const candidate = normalize(join(baseDir, relative));
  return !candidate.startsWith(baseDir + sep) && candidate !== baseDir ? null : candidate;
}

/**
 * Decide the cache-control headers for a static file response.
 * Hashed application bundles and the `/assets/` directory are immutable; the
 * document shell and the MSW worker are not, because they must be revalidated
 * so a deploy never strands the user on an outdated service worker
 * registration.
 */
function cacheHeadersFor(filePath) {
  const base = filePath.split(sep).pop() ?? '';
  if (base === 'index.html' || base === 'mockServiceWorker.js' || base === 'favicon.ico')
    return NO_CACHE_HEADERS;
  return /^main-[A-Za-z0-9_-]+\.js$/.test(base) ||
    /^chunk-[A-Za-z0-9_-]+\.js$/.test(base) ||
    /^styles-[A-Za-z0-9_-]+\.css$/.test(base) ||
    filePath.includes(`${sep}assets${sep}`)
    ? IMMUTABLE_HEADERS
    : NO_CACHE_HEADERS;
}

/**
Map a file extension to a content-type for the most common static assets.
*/
function contentTypeFor(filePath) {
  const extension = extname(filePath).toLowerCase();
  switch (extension) {
    case '.html': {
      return 'text/html; charset=utf-8';
    }
    case '.js':
    case '.mjs': {
      return 'application/javascript; charset=utf-8';
    }
    case '.css': {
      return 'text/css; charset=utf-8';
    }
    case '.json': {
      return 'application/json; charset=utf-8';
    }
    case '.svg': {
      return 'image/svg+xml';
    }
    case '.ico': {
      return 'image/x-icon';
    }
    case '.png': {
      return 'image/png';
    }
    case '.jpg':
    case '.jpeg': {
      return 'image/jpeg';
    }
    case '.webp': {
      return 'image/webp';
    }
    case '.woff':
    case '.woff2': {
      return 'font/woff2';
    }
    case '.map': {
      return 'application/json; charset=utf-8';
    }
    default: {
      return 'application/octet-stream';
    }
  }
}

/**
Reply with an RFC 7807 application/problem+json body for /api/* misses.
*/
function sendApiProblem(res, status, title, detail) {
  const body = JSON.stringify({
    type: `https://mi-bolt.example/problems/${title}`,
    title,
    status,
    detail,
    instance: null,
  });
  res.writeHead(status, {
    'content-type': 'application/problem+json',
    'content-length': Buffer.byteLength(body),
    'cache-control': NO_CACHE_HEADERS['cache-control'],
  });
  res.end(body);
}

/**
Stream a static file with the headers this server applies.
*/
function sendFile(res, filePath) {
  const stat = statSync(filePath);
  const headers = {
    'content-type': contentTypeFor(filePath),
    'content-length': stat.size,
    'last-modified': stat.mtime.toUTCString(),
    ...cacheHeadersFor(filePath),
  };
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

/**
Reply with the SPA fallback document.
*/
function sendSpaFallback(res, baseDir = STATIC_DIR) {
  const indexPath = join(baseDir, 'index.html');
  try {
    sendFile(res, indexPath);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('index.html missing in static directory');
  }
}

/**
 * Serves `urlPath` from `baseDir` when it resolves to a real file, otherwise
 * the directory's `index.html` (the SPA fallback for that root).
 */
function serveStatic(res, urlPath, baseDir, prefix) {
  const candidate = safeResolveFromPath(urlPath, baseDir, prefix);
  if (candidate !== null) {
    try {
      if (statSync(candidate).isFile()) {
        sendFile(res, candidate);
        return;
      }
    } catch {
      // missing or unreadable — fall through to the fallback.
    }
  }
  sendSpaFallback(res, baseDir);
}

/**
 * Per-request dispatcher. The order matters:
 *   1. `/api` proxy (when configured) forwards to the backend before the
 *      method guard so POST/PUT work for proxied API traffic.
 *   2. Non-GET/HEAD on any other path returns 405.
 *   3. `/api/*` without a proxy returns 404 + problem+json, never the SPA shell.
 *   4. `/demo-fizetes` static (when configured) uses its own fallback.
 *   5. On a payment-only host (MI_BOLT_PAYMENT_ONLY=1) everything else
 *      answers 302 to `/demo-fizetes/`.
 *   6. Real files (mockServiceWorker.js, assets, hashed bundles,
 *      favicon) are served as themselves.
 *   7. Everything else falls back to `index.html`.
 */
function handle(request, res) {
  const rawPath = request.url ?? '/';
  let urlPath;
  let forwardPath;
  try {
    const parsedUrl = new URL(rawPath, `http://${HOST}`);
    urlPath = parsedUrl.pathname.replace(/\/+/g, '/') || '/';
    forwardPath = parsedUrl.pathname + parsedUrl.search;
  } catch {
    // Malformed URL — fall through to SPA fallback instead of crashing.
    sendSpaFallback(res);
    return;
  }

  // 1. Proxied API traffic: forward before the method guard so non-GET
  // methods are preserved for the backend.
  if (API_PROXY && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
    const target = new URL(API_PROXY);
    const headers = { ...request.headers, host: target.host };
    const upstream = httpRequest(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: forwardPath,
        method: request.method,
        headers,
        timeout: API_PROXY_TIMEOUT_MS,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('timeout', () => {
      upstream.destroy(Object.assign(new Error('upstream timeout'), { code: 'ETIMEDOUT' }));
    });
    upstream.on('error', (error) => {
      process.stderr.write(`[serve-static] api proxy error: ${error?.stack ?? error}\n`);
      if (res.headersSent) {
        res.end();
      } else {
        sendApiProblem(
          res,
          502,
          'backend-unreachable',
          `The backend at ${API_PROXY} could not be reached: ${error.code ?? error.message}`,
        );
      }
    });
    request.pipe(upstream);
    return;
  }

  // 2. Only GET and HEAD go through the SPA fallback; other methods surface as
  // 405 so a misconfigured POST is not silently served the shell.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  // 3. The mock worker owns business traffic in the demo build; never hand
  // `/api/...` to `index.html`.
  if (urlPath.startsWith('/api/') || urlPath === '/api') {
    sendApiProblem(
      res,
      404,
      'business-api-not-served-by-static-host',
      `The T28 static host does not proxy ${urlPath}; the MSW service worker owns business traffic.`,
    );
    return;
  }

  // 4. Serve the payment app from its own directory when configured.
  if (PAYMENT_STATIC_DIR && (urlPath === '/demo-fizetes' || urlPath.startsWith('/demo-fizetes/'))) {
    serveStatic(res, urlPath, PAYMENT_STATIC_DIR, '/demo-fizetes');
    return;
  }

  // 5. A payment-only host has nothing else to serve: send every other path
  // to the payment app instead of exposing the shop bundle.
  if (PAYMENT_ONLY) {
    res.writeHead(302, { location: '/demo-fizetes/' });
    res.end();
    return;
  }

  // 6-7. Real files from the shop, then the shop SPA fallback.
  serveStatic(res, urlPath, STATIC_DIR, '/');
}

const server = createServer((request, res) => {
  try {
    handle(request, res);
  } catch (error) {
    // A bug must never crash the listener; reply with a 500 so the
    // caller sees the failure instead of a torn connection.
    process.stderr.write(`[serve-static] ${error?.stack ?? error}\n`);
    if (res.headersSent) {
      res.end();
    } else {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[serve-static] serving ${STATIC_DIR} on http://${HOST}:${PORT}\n`);
});

// Clean shutdown so a Ctrl-C in a developer terminal does not leak
// the listener to a sibling process.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
