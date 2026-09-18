#!/usr/bin/env node
// scripts/check-operation-parity.mjs — T26 SDK↔MSW parity CLI.
//
// Reads docs/api/openapi.yaml and walks every slice module under
// src/mocks/{catalog,cart,checkout,payment,orders} to recover the
// (method, path) pairs the registered business handlers claim. The
// spec is the source of truth for the 16-operationId inventory; the
// slice files are the source of truth for what the dispatcher
// actually exposes.
//
// The script does not need a TypeScript loader — the slice handlers
// follow a single, uniform pattern (`http.<method>(\`${wildcard}<path>\`)`)
// that a regular-expression walk can recover deterministically. A
// runtime loader would couple this gate to `tsx` or `vitest`; this
// script must run with stock Node so the gate is always available.
//
// Exit codes:
//   0  every operationId maps to a registered handler AND no extra
//      business routes exist beyond the dispatcher shell.
//   1  one or more operationIds have no handler, the openapi.yaml
//      has the wrong number of operationIds, or the slice files
//      registered business routes the contract never declared.

import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
export const SPEC_PATH = resolve(REPO_ROOT, 'docs/api/openapi.yaml');
export const REQUIRED_OPERATION_COUNT = 16;

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const SLICE_DIRS = ['catalog', 'cart', 'checkout', 'payment', 'orders'];

/**
 * Prints a structured failure payload and exits non-zero. The
 * upstream caller (CI log, shell) can grep on `check-operation-parity`
 * to find the headline message without parsing JSON.
 */
function fail(message, payload = {}) {
  const structured = { ok: false, error: message, ...payload };
  process.stderr.write(`check-operation-parity: ${JSON.stringify(structured, null, 2)}\n`);
  process.exit(1);
}

function log(message) {
  process.stdout.write(`check-operation-parity: ${message}\n`);
}

// ---------------------------------------------------------------------------
// Spec walker
// ---------------------------------------------------------------------------

function collectOperations(spec) {
  const ops = [];
  for (const [pathKey, pathItem] of Object.entries(spec?.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (!op || typeof op !== 'object' || typeof op.operationId !== 'string') continue;
      ops.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path: pathKey.startsWith('/') ? pathKey : `/${pathKey}`,
        mswPath: `${pathKey.replace(/\{([^}]+)\}/g, ':$1')}`,
      });
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Source-text walker — recovers every `http.<method>(...)` route
// declared in a slice module. The slice convention is `wildcard =
// *${apiRoot}` followed by literal template strings such as
// `${wildcard}/carts/:cartId/items`. A regex on the slice file
// surface produces the same inventory the runtime factory would,
// without booting Node with a TypeScript loader.
// ---------------------------------------------------------------------------

const ROUTE_PATTERN = /http\.(get|post|put|patch|delete)\(\s*`\$\{wildcard\}([^`]+)`/g;

async function listHandlerFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const child = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listHandlerFiles(child)));
    } else if (entry.isFile() && entry.name.endsWith('.handlers.ts')) {
      out.push(child);
    }
  }
  return out;
}

async function collectRegisteredRoutes() {
  const routes = [];
  for (const dirName of SLICE_DIRS) {
    const dir = resolve(REPO_ROOT, `src/mocks/${dirName}`);
    let files;
    try {
      files = await listHandlerFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      ROUTE_PATTERN.lastIndex = 0;
      let match;
      while ((match = ROUTE_PATTERN.exec(text)) !== null) {
        const method = match[1].toUpperCase();
        const templatePath = match[2];
        // The slice templates use `${wildcard}` interpolation and
        // sometimes include literal `:cartId` path params. We keep
        // them verbatim — the spec paths in openapi.yaml are already
        // converted to MSW colon-syntax in `collectOperations`.
        routes.push({
          method,
          path: `/api/v1${templatePath.startsWith('/') ? templatePath : `/${templatePath}`}`,
          source: file,
        });
      }
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!(await exists(SPEC_PATH))) fail('openapi.yaml is missing', { spec: SPEC_PATH });

  const raw = await readFile(SPEC_PATH, 'utf8');
  const spec = yaml.load(raw);
  const operations = collectOperations(spec);

  if (operations.length !== REQUIRED_OPERATION_COUNT) {
    fail(`expected ${REQUIRED_OPERATION_COUNT} operationIds, found ${operations.length}`, {
      operations: operations.map((o) => o.operationId),
    });
  }
  if (new Set(operations.map((o) => o.operationId)).size !== operations.length) {
    fail('duplicate operationIds in openapi.yaml', {
      operations: operations.map((o) => `${o.method} ${o.path} (${o.operationId})`),
    });
  }

  const registered = await collectRegisteredRoutes();
  // The slice templates use `${wildcard}/<path>` where `wildcard` is
  // `*` + apiRoot. The captured path therefore starts with `/api/v1`;
  // strip it so the comparison is against the OpenAPI path shape
  // (`/config`, `/carts/:cartId`).
  const API_ROOT_PREFIX = '/api/v1';
  const registeredKeys = new Set(
    registered.map((r) => {
      const stripped = r.path.startsWith(API_ROOT_PREFIX)
        ? r.path.slice(API_ROOT_PREFIX.length)
        : r.path;
      return `${r.method} ${stripped}`;
    }),
  );

  const missing = operations
    .filter((op) => !registeredKeys.has(`${op.method} ${op.mswPath}`))
    .map((op) => ({ operationId: op.operationId, expected: `${op.method} ${op.mswPath}` }));
  if (missing.length > 0) {
    fail('one or more operationIds have no matching business handler', { missing });
  }

  const operationPathSet = new Set(operations.map((op) => `${op.method} ${op.mswPath}`));
  const extraBusiness = registered.filter((r) => {
    const stripped = r.path.startsWith(API_ROOT_PREFIX)
      ? r.path.slice(API_ROOT_PREFIX.length)
      : r.path;
    return !operationPathSet.has(`${r.method} ${stripped}`);
  });
  if (extraBusiness.length > 0) {
    fail('business routes registered without a matching operationId', { extraBusiness });
  }

  log(`OK (${operations.length} operationIds, ${registered.length} business routes)`);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  fail(err?.message ?? String(err), { stack: err?.stack });
});
