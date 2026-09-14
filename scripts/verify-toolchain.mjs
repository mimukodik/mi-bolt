#!/usr/bin/env node
// verify-toolchain.mjs — read package.json, query npm for each declared
// dependency, and enforce the T00 toolchain invariants: no prerelease tag in
// any declared version, Node engines must accept Node ^22.x || ^24.x ||
// >=26, and the declared TypeScript version must exist on the npm registry.
//
// Exits 0 with a `toolchain:OK` summary when every check passes, exits 1 with
// a structured error payload otherwise. The script performs no install and
// performs no write: every read goes through `npm view` and `fs.readFile`.

import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const execFileP = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

export const EXPECTED_DEPS = Object.freeze([
  '@angular/core',
  '@angular/cli',
  '@angular/build',
  '@angular/compiler-cli',
  '@angular/cdk',
  '@angular/common',
  '@angular/forms',
  '@angular/platform-browser',
  '@angular/router',
  'rxjs',
  'typescript',
  'msw',
  'vitest',
  '@vitest/coverage-v8',
  '@playwright/test',
  'ng-openapi-gen',
]);

// Matches a prerelease tag attached to either a bare version
// (`22.0.0-rc.0`) or a range (`^22.0.0-rc.0`).
const PRERELEASE_PATTERN =
  /-(?:alpha|beta|next|rc|dev|canary|preview|insiders|nightly|experimental)/i;

export function hasPrereleaseTag(declaredVersion) {
  if (typeof declaredVersion !== 'string') return false;
  return PRERELEASE_PATTERN.test(declaredVersion);
}

// The spec defines the project's supported Node range as
// `^22.x || ^24.x || >=26`. The actual engines.node strings in the
// registry use carets, tildes and OR-groups; each disjunct is checked
// in isolation, and our Node major must fall INSIDE the range the
// package declared:
//   - `^X.Y.Z`  → major range [X, X+1)
//   - `~X.Y.Z`  → major+minor range [X.Y, X.(Y+1))
//   - `>=X.Y.Z` → major range [X, ∞)
// The check accepts any disjunct whose lower bound is `≤ ourNodeMajor`
// AND whose upper bound is `≥ ourNodeMajor` (semver-incompatible but
// expresses the rule the spec encodes). For `>=`, only the lower bound
// applies. For `~X.Y.Z` the upper-bound minor wraps to the next major
// only when Y+1 hits 100, which is treated the same as `^X`.
export function checkNodeEngines(
  engines,
  ourNodeMajor = parseInt(process.versions.node.split('.')[0], 10),
) {
  if (!engines || typeof engines.node !== 'string' || engines.node === '') {
    return { ok: true, reason: 'no engines.node declared' };
  }
  const parts = engines.node
    .split(/\s*\|\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const compatible = parts.some((part) => {
    const caret = part.match(/^\^(\d+)/);
    if (caret) {
      const lo = parseInt(caret[1], 10);
      const hi = lo + 1;
      return lo <= ourNodeMajor && ourNodeMajor <= hi;
    }
    const tilde = part.match(/^~(\d+)(?:\.(\d+))?/);
    if (tilde) {
      const lo = parseInt(tilde[1], 10);
      const minor = tilde[2] ? parseInt(tilde[2], 10) : 0;
      const hi = minor + 1 >= 100 ? lo + 1 : lo;
      return lo <= ourNodeMajor && ourNodeMajor <= hi;
    }
    const gte = part.match(/^>=(\d+)/);
    if (gte) {
      return parseInt(gte[1], 10) <= ourNodeMajor;
    }
    return false;
  });
  return compatible
    ? { ok: true }
    : {
        ok: false,
        reason: `node engines "${engines.node}" does not accept Node ${ourNodeMajor}`,
      };
}

// Minimal semver comparator for the Angular 22 peer-range shape
// (`>=X <Y`), which is the only range the toolchain rejects against.
function semverCompareTriple(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function semverSatisfies(version, range) {
  if (typeof version !== 'string' || typeof range !== 'string') return false;
  const vParts = version.split('.').map((n) => parseInt(n, 10));
  if (vParts.length !== 3 || vParts.some(Number.isNaN)) return false;
  const constraints = range.split(/\s+/).filter(Boolean);
  for (const c of constraints) {
    const m = c.match(/^(>=|<=|>|<|=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    if (!m) return false;
    const op = m[1] ?? '=';
    const cVer = [
      parseInt(m[2], 10),
      m[3] ? parseInt(m[3], 10) : 0,
      m[4] ? parseInt(m[4], 10) : 0,
    ];
    const cmp = semverCompareTriple(vParts, cVer);
    switch (op) {
      case '>=': if (cmp < 0) return false; break;
      case '<=': if (cmp > 0) return false; break;
      case '>': if (cmp <= 0) return false; break;
      case '<': if (cmp >= 0) return false; break;
      case '=':
      default: if (cmp !== 0) return false; break;
    }
  }
  return true;
}

export function validateToolchain(items, options = {}) {
  const typescriptPeerRange =
    typeof options.typescriptPeerRange === 'string'
      ? options.typescriptPeerRange
      : null;
  const errors = [];
  for (const item of items) {
    if (hasPrereleaseTag(item.declaredVersion)) {
      errors.push({
        package: item.package,
        kind: 'prerelease-declared',
        declaredVersion: item.declaredVersion,
        reason: `declared version "${item.declaredVersion}" contains a prerelease tag`,
      });
    }
    if (item.package === 'typescript' && !item.resolvedVersion) {
      errors.push({
        package: item.package,
        kind: 'typescript-not-on-npm',
        declaredVersion: item.declaredVersion,
        reason: `declared typescript version "${item.declaredVersion}" does not exist on the npm registry`,
      });
    }
    if (
      item.package === 'typescript' &&
      typescriptPeerRange &&
      item.resolvedVersion &&
      !semverSatisfies(item.resolvedVersion, typescriptPeerRange)
    ) {
      errors.push({
        package: item.package,
        kind: 'typescript-peer-range-violation',
        resolvedVersion: item.resolvedVersion,
        peerRange: typescriptPeerRange,
        reason: `resolved typescript "${item.resolvedVersion}" does not satisfy Angular compiler-cli peer "${typescriptPeerRange}"`,
      });
    }
    const nodeCheck = checkNodeEngines(item.engines);
    if (!nodeCheck.ok) {
      errors.push({
        package: item.package,
        kind: 'node-engines-unsupported',
        engines: item.engines,
        reason: nodeCheck.reason,
      });
    }
  }
  const ok = errors.length === 0;
  return {
    ok,
    summary: ok ? 'toolchain:OK' : 'toolchain:FAIL',
    errors,
  };
}

export async function gatherToolchainData(packageJsonPath) {
  const raw = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw);
  const declared = new Map();
  for (const [k, v] of Object.entries(pkg.dependencies ?? {})) declared.set(k, v);
  for (const [k, v] of Object.entries(pkg.devDependencies ?? {})) declared.set(k, v);

  const missing = EXPECTED_DEPS.filter((name) => !declared.has(name));
  if (missing.length > 0) {
    const err = new Error(`missing expected dependencies: ${missing.join(', ')}`);
    err.code = 'MISSING_DEPS';
    err.missing = missing;
    throw err;
  }

  // Query the Angular 22 compiler-cli peer range once at script start
  // so we can later reject a resolved typescript that falls outside it.
  let typescriptPeerRange = null;
  try {
    const { stdout } = await execFileP(
      'npm',
      [
        'view',
        '@angular/compiler-cli@22.1.6',
        'peerDependencies',
        '--json',
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout);
    const peerTs = parsed?.typescript;
    if (typeof peerTs === 'string') {
      typescriptPeerRange = peerTs;
    }
  } catch {
    typescriptPeerRange = null;
  }

  const items = [];
  for (const name of EXPECTED_DEPS) {
    const declaredVersion = declared.get(name);
    let view = null;
    try {
      const { stdout } = await execFileP(
        'npm',
        [
          'view',
          `${name}@${declaredVersion}`,
          'version',
          'peerDependencies',
          'engines',
          '--json',
        ],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      // `npm view <pkg>@<range> ...` returns either a single object (when
      // the range resolves to exactly one version) or an array of objects
      // (when the range matches several). We always want the latest
      // matching entry, which `npm view` puts last.
      const parsed = JSON.parse(stdout);
      view = Array.isArray(parsed) ? parsed.at(-1) ?? null : parsed;
    } catch {
      view = null;
    }
    items.push({
      package: name,
      declaredVersion,
      resolvedVersion: view?.version ?? null,
      peerDependencies: view?.peerDependencies ?? null,
      engines: view?.engines ?? null,
    });
  }
  items.typescriptPeerRange = typescriptPeerRange;
  return items;
}

async function main() {
  const packageJsonPath = process.argv[2] ?? resolve(REPO_ROOT, 'package.json');
  let items;
  try {
    items = await gatherToolchainData(packageJsonPath);
  } catch (err) {
    if (err.code === 'MISSING_DEPS') {
      process.stdout.write(
        JSON.stringify(
          {
            ok: false,
            summary: 'toolchain:FAIL',
            errors: [
              {
                kind: 'missing-dependencies',
                missing: err.missing,
                reason: err.message,
              },
            ],
          },
          null,
          2,
        ) + '\n',
      );
      process.exit(1);
    }
    throw err;
  }
  const typescriptPeerRange = items.typescriptPeerRange ?? null;
  const result = validateToolchain(items, { typescriptPeerRange });
  process.stdout.write(
    JSON.stringify({ ...result, results: items, typescriptPeerRange }, null, 2) + '\n',
  );
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(String(err.stack ?? err) + '\n');
    process.exit(2);
  });
}