#!/usr/bin/env node
// scripts/check-budgets.mjs — T28 resource-budget gate.
//
// Reads the production bundle under `dist/storefront/browser/`,
// measures the gzipped size of every JavaScript and CSS asset, and
// asserts the four T28-AC04 design budgets:
//
//   1. initial JS (the `main-*.js` bundle and every chunk it pulls
//      in via `<link rel="modulepreload">` / direct import) ≤
//      300 KiB gzip;
//   2. total first-view transferred assets ≤ 1 MiB, excluding
//      optional 3D assets (T28-AC06 — currently not enabled);
//   3. per-route lazy chunk (any chunk not in the initial bundle)
//      ≤ 150 KiB gzip;
//   4. the static directory exists; if not, exit 1 with a message
//      that names the missing path.
//
// The script emits a single table on stdout and exits 1 when any
// threshold is violated. It is the source of truth for the
// `300 KiB / 1 MiB / 150 KiB` numbers that the design review
// records; any change to the thresholds must be made here AND in
// `docs/mi-bolt/execution/deployment.md`.
//
// Usage:
//
//   node scripts/check-budgets.mjs
//   node scripts/check-budgets.mjs --static-dir dist/t13-catalog/browser
//
// Environment:
//
//   MI_BOLT_E2E_STATIC_DIR overrides the served directory (shared
//   with the static server).

import { gzipSync } from 'node:zlib';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

function parseArguments(argv) {
  const options = { staticDir: null };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--static-dir') options.staticDir = argv[++index];
    else if (token === '--help' || token === '-h') {
      process.stdout.write('Usage: check-budgets.mjs [--static-dir <path>]\n');
      process.exit(0);
    }
  }
  return options;
}

const arguments_ = parseArguments(argv);
const STATIC_DIR = resolve(
  repoRoot,
  arguments_.staticDir ?? process.env['MI_BOLT_E2E_STATIC_DIR'] ?? 'dist/storefront/browser',
);

const BUDGETS = Object.freeze({
  initialJsGzipBytes: 300 * 1024, // T28-AC04 (1)
  firstViewTotalBytes: 1024 * 1024, // T28-AC04 (2)
  perRouteLazyGzipBytes: 150 * 1024, // T28-AC04 (3)
});

if (!existsSync(STATIC_DIR)) {
  process.stderr.write(
    `check-budgets: static directory not found: ${STATIC_DIR}\n` +
      `check-budgets: build with 'npx ng build storefront --configuration=production' first.\n`,
  );
  process.exit(1);
}

const indexHtmlPath = join(STATIC_DIR, 'index.html');
if (!existsSync(indexHtmlPath)) {
  process.stderr.write(
    `check-budgets: missing ${indexHtmlPath} — the production build did not produce an index.html.\n`,
  );
  process.exit(1);
}

const indexHtml = readFileSync(indexHtmlPath, 'utf8');

/**
 * Extract the entry-point `<script src="main-...js" type="module">`
 * tag from the index.html. The Angular CLI emits exactly one such
 * tag in the production shell; the script returns null when the
 * build is missing.
 */
function readMainScriptTag(html) {
  const match = html.match(/<script\s+src="([^"]+)"\s+type="module"\s*>/i);
  return match ? match[1] : null;
}

const mainScript = readMainScriptTag(indexHtml);
if (mainScript === null) {
  process.stderr.write('check-budgets: index.html does not contain a module entry script.\n');
  process.exit(1);
}

/**
Extract every <link rel="modulepreload" href="..."> target.
*/
function readModulePreloads(html) {
  const re = /<link\s+rel="modulepreload"\s+href="([^"]+)"\s*\/?>(?:\s|$)/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** Read every `<link rel="stylesheet" href="...">` target. The Angular
 * CLI may emit either a self-closing tag or one with extra
 * attributes (e.g. `media="print" onload="..."`) before the closing
 * `>`, so the regex accepts any tag whose first attributes are
 * `rel="stylesheet"` followed by an `href`. */
function readStylesheets(html) {
  const re = /<link[^>]*?rel="stylesheet"[^>]*?href="([^"]+)"[^>]*>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** Sum the byte length of every `<style>...</style>` block in the
 * document. The Angular CLI inlines critical CSS into the shell via
 * `<style>` tags so the first paint is unblocked; that text is
 * transferred on the first view alongside the JS and counts against
 * the 1 MiB budget. */
function inlineStyleBytes(html) {
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let total = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    total += Buffer.byteLength(m[1], 'utf8');
  }
  return total;
}

/**
Strip a leading `./` so we can resolve the path against STATIC_DIR.
*/
function stripLeading(path) {
  return path.replace(/^\.\//, '');
}

/**
Compute the gzip size of a static file.
*/
function gzipSize(filePath) {
  const data = readFileSync(filePath);
  return gzipSync(data).length;
}

/**
 * Return the list of asset files in STATIC_DIR, recursing only into
 * the `assets/` subdirectory. Top-level directories other than
 * `assets/` are skipped because the production build does not emit
 * any other top-level directory besides `assets/`.
 */
function collectAssetFiles(root) {
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'assets') {
        for (const sub of readdirSync(full, { withFileTypes: true })) {
          const subFull = join(full, sub.name);
          if (sub.isDirectory()) {
            for (const leaf of readdirSync(subFull, { withFileTypes: true })) {
              if (leaf.isFile()) out.push(join(subFull, leaf.name));
            }
          } else if (sub.isFile()) {
            out.push(subFull);
          }
        }
      }
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
True when the file is a chunk / lazy / hashed JS asset.
*/
function isJsAsset(name) {
  return extname(name) === '.js';
}

function isCssAsset(name) {
  return extname(name) === '.css';
}

const preloads = readModulePreloads(indexHtml);
const stylesheets = readStylesheets(indexHtml);

/**
 * Initial set: the main entry plus every `modulepreload` declared
 * in index.html. Per-route lazy chunks are the JS files outside
 * this set; they are exercised on navigation, not on first view.
 */
const initialAssetPaths = [mainScript, ...preloads, ...stylesheets]
  .map(stripLeading)
  .map((rel) => resolve(STATIC_DIR, rel));

const allFiles = collectAssetFiles(STATIC_DIR);
const initialJsFiles = [];
const initialCssFiles = [];
const initialOtherFiles = [];
const lazyJsFiles = [];
const otherFiles = [];

for (const file of allFiles) {
  const rel = file.slice(STATIC_DIR.length + 1);
  if (initialAssetPaths.includes(file)) {
    if (isJsAsset(rel)) initialJsFiles.push(file);
    else if (isCssAsset(rel)) initialCssFiles.push(file);
    else initialOtherFiles.push(file);
    continue;
  }
  if (isJsAsset(rel)) lazyJsFiles.push(file);
  else otherFiles.push(file);
}

/**
 * Compute initial JS bundle size. We require every preloaded chunk
 * to resolve to a real file because the script is the gate the
 * design budget relies on; a dangling preload means the budget is
 * meaningless.
 */
const missingInitial = initialAssetPaths.filter((p) => !existsSync(p));
if (missingInitial.length > 0) {
  process.stderr.write(
    `check-budgets: index.html references missing assets:\n` +
      missingInitial.map((p) => `  - ${p}\n`).join(''),
  );
  process.exit(1);
}

const initialJsTotalGzip = initialJsFiles.reduce((sum, file) => sum + gzipSize(file), 0);
const initialCssTotalGzip = initialCssFiles.reduce((sum, file) => sum + gzipSize(file), 0);
const inlineCssBytes = inlineStyleBytes(indexHtml);
const firstViewTotalBytes =
  [...initialJsFiles, ...initialCssFiles, ...initialOtherFiles]
    .map((file) => readFileSync(file).length)
    .reduce((sum, n) => sum + n, 0) + inlineCssBytes;

const lazyJsByName = lazyJsFiles.map((file) => ({
  file,
  gzipBytes: gzipSize(file),
}));

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

const violations = [];

// AC04 (1): initial JS gzip.
if (initialJsTotalGzip > BUDGETS.initialJsGzipBytes) {
  violations.push({
    code: 'initial-js-exceeds-budget',
    message: `initial JS gzip ${formatKiB(initialJsTotalGzip)} > ${formatKiB(BUDGETS.initialJsGzipBytes)}`,
  });
}

// AC04 (2): first-view transferred bytes.
if (firstViewTotalBytes > BUDGETS.firstViewTotalBytes) {
  violations.push({
    code: 'first-view-exceeds-budget',
    message: `first-view transferred ${formatKiB(firstViewTotalBytes)} > ${formatKiB(BUDGETS.firstViewTotalBytes)} (excluding 3D)`,
  });
}

// AC04 (3): per-route lazy chunk gzip.
const offendingLazies = lazyJsByName.filter(
  (entry) => entry.gzipBytes > BUDGETS.perRouteLazyGzipBytes,
);
for (const off of offendingLazies) {
  violations.push({
    code: 'lazy-chunk-exceeds-budget',
    message: `lazy chunk ${basename(off.file)} gzip ${formatKiB(off.gzipBytes)} > ${formatKiB(BUDGETS.perRouteLazyGzipBytes)}`,
  });
}

// Render the report so the reviewer can read the measured numbers
// even when the budgets pass.
const lines = [
  'check-budgets — T28-AC04 / T28-AC06 resource gate',
  `static-dir: ${STATIC_DIR}`,
  '',
  'initial bundle:',
];
for (const file of initialJsFiles) {
  lines.push(`  - ${basename(file)}: ${formatKiB(gzipSize(file))} gzip`);
}
lines.push(
  `  total initial JS gzip: ${formatKiB(initialJsTotalGzip)} (budget ${formatKiB(BUDGETS.initialJsGzipBytes)})`,
);
for (const file of initialCssFiles) {
  lines.push(`  - ${basename(file)}: ${formatKiB(gzipSize(file))} gzip`);
}
lines.push(
  `  total initial CSS gzip: ${formatKiB(initialCssTotalGzip)} + ${formatKiB(inlineCssBytes)} inline`,
);
lines.push(
  `  total first-view transferred: ${formatKiB(firstViewTotalBytes)} (budget ${formatKiB(BUDGETS.firstViewTotalBytes)}, excluding 3D)`,
  '',
  `per-route lazy chunks (${lazyJsFiles.length}):`,
);
const sortedLazies = [...lazyJsByName].sort((a, b) => b.gzipBytes - a.gzipBytes);
const top = sortedLazies.slice(0, 10);
for (const entry of top) {
  lines.push(`  - ${basename(entry.file)}: ${formatKiB(entry.gzipBytes)} gzip`);
}
if (sortedLazies.length > top.length) {
  lines.push(`  - … ${sortedLazies.length - top.length} more lazy chunk(s) under budget`);
}

if (violations.length > 0) {
  lines.push('', `FAIL: ${violations.length} budget violation(s)`);
  for (const v of violations) {
    lines.push(`  - [${v.code}] ${v.message}`);
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(1);
}

lines.push('', 'PASS: all budgets met');
process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
