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
//   MI_BOLT_E2E_STATIC_DIR   served directory (default
//                            `dist/mi-bolt/browser`).
//   PORT                     listen port (default 4200).
//   HOST                     listen address (default 127.0.0.1).
//
// The server is intentionally tiny — no caching layer, no
// compression, no directory listings — because every byte of its
// behaviour must be reproducible from this file.

import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from 'node:http';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_DIR = resolve(
  repoRoot,
  process.env['MI_BOLT_E2E_STATIC_DIR'] ?? 'dist/mi-bolt/browser',
);
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
 * Resolve a request URL to a path inside STATIC_DIR, rejecting any
 * attempt to escape via `..` segments. Returns null when the URL is
 * not a safe candidate for file lookup (the SPA fallback handles
 * the rest).
 */
function safeResolveFromUrl(rawUrl) {
  // The request URL is always a path-only string for an HTTP server
  // bound to 127.0.0.1, but parse defensively in case a client sends
  // an absolute URL.
  let urlPath;
  try {
    urlPath = new URL(rawUrl, `http://${HOST}`).pathname;
  } catch {
    return null;
  }
  // Decode percent-encoded segments without throwing on malformed
  // input — the SPA fallback will pick up the bad request.
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  // Strip the trailing slash so `/telefonok/` resolves to the same
  // file the SPA fallback would have answered for `/telefonok`.
  const trimmed = decoded.replace(/\/+$/, '') || '/';
  const candidate = normalize(join(STATIC_DIR, trimmed));
  return !candidate.startsWith(STATIC_DIR + sep) && candidate !== STATIC_DIR ? null : candidate;
}

/**
 * Decide the cache-control headers for a static file response.
 * Hashed application bundles and the `/assets/` directory are
 * immutable; the document shell and the MSW worker are not, because
 * they must be revalidated so a deploy never strands the user on an
 * outdated service worker registration.
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
function sendSpaFallback(res) {
  const indexPath = join(STATIC_DIR, 'index.html');
  try {
    sendFile(res, indexPath);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('index.html missing in static directory');
  }
}

/**
 * Per-request dispatcher. The order matters:
 *   1. `/api/*` always returns 404 + problem+json, never SPA shell.
 *   2. Real files (mockServiceWorker.js, assets, hashed bundles,
 *      favicon) are served as themselves.
 *   3. Everything else falls back to `index.html`.
 */
function handle(request, res) {
  const urlPath = request.url ?? '/';
  // Only GET and HEAD go through the SPA fallback; other methods
  // surface as 405 so a misconfigured POST is not silently served
  // the shell.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }
  if (urlPath.startsWith('/api/') || urlPath === '/api') {
    sendApiProblem(
      res,
      404,
      'business-api-not-served-by-static-host',
      `The T28 static host does not proxy ${urlPath}; the MSW service worker owns business traffic.`,
    );
    return;
  }
  const candidate = safeResolveFromUrl(urlPath);
  if (candidate !== null) {
    try {
      const stat = statSync(candidate);
      if (stat.isFile()) {
        sendFile(res, candidate);
        return;
      }
    } catch {
      // missing or unreadable — fall through to SPA fallback below.
    }
  }
  sendSpaFallback(res);
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
