#!/usr/bin/env node
// scripts/runtime-manifest.mjs
//
// Emit a deterministic manifest of every owned runtime TypeScript
// source file in the repository. The `check-coverage.mjs` gate
// reads this manifest and demands 100% coverage on each entry; the
// manifest is the explicit denominator for the 100% promise.
//
// Excludes:
//   - **/*.spec.ts, **/*.test.ts           (test code; covered by
//                                           its own gate elsewhere)
//   - **/*.d.ts                            (type-only declarations;
//                                           the TS compiler gates them)
//   - src/app/api/generated/**             (generated SDK; validated
//                                           separately by the
//                                           contract tests)
//   - public/mockServiceWorker.js          (MSW worker bundle)
//
// Classifications:
//   - runtime       — owned application source that ships to the
//                     browser and must have 100% coverage.
//   - bootstrap     — main.ts entrypoint (also runs in the browser).
//   - generated     — openapi-generated SDK; required to appear in
//                     the manifest but the gate only enforces
//                     `runtime` and `bootstrap` files.
//   - tests         — included for the manifest's own self-checks
//                     but the gate skips these.
//   - styles        — pure CSS, outside the JS coverage denominator.
//
// The script is idempotent; the output is deterministic for a
// given tree state (sorted, POSIX paths).

import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.angular',
  '.git',
  'dist',
  'coverage',
  'playwright-report',
  '.idea',
  '.vscode',
  '.codex',
  '.gemini',
  '.agents',
]);

const EXCLUDE_FILES = new Set([
  'mockServiceWorker.js',
]);

const TEST_SUFFIXES = ['.spec.ts', '.test.ts'];

function isExcludedDir(name) {
  return EXCLUDE_DIRS.has(name) || name.startsWith('.angular');
}

function classify(relativePath) {
  const posix = relativePath.split(sep).join('/');
  if (TEST_SUFFIXES.some((s) => posix.endsWith(s))) return 'tests';
  if (posix.endsWith('.d.ts')) return 'types';
  if (posix === 'src/main.ts') return 'bootstrap';
  if (posix.startsWith('src/app/api/generated/')) return 'generated';
  if (posix.startsWith('src/styles/')) return 'styles';
  if (posix.endsWith('.css')) return 'styles';
  if (posix.endsWith('.html')) return 'templates';
  if (posix.startsWith('src/app/')) return 'runtime';
  if (posix === 'src/index.html') return 'index-html';
  if (posix.startsWith('src/environments/')) return 'runtime';
  if (posix.startsWith('public/')) return 'assets';
  return 'other';
}

async function walk(dir, acc) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isExcludedDir(entry.name)) continue;
      await walk(join(dir, entry.name), acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDE_FILES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(repoRoot, full);
    acc.push({ relative: rel.split(sep).join('/'), absolute: full });
  }
}

async function main() {
  const entries = [];
  await walk(repoRoot, entries);

  const files = entries
    .filter(({ relative: rel }) => rel.startsWith('src/') || rel.startsWith('public/'))
    .map(({ relative: rel, absolute }) => ({
      absolute,
      relative: rel,
      classification: classify(rel),
    }))
    .sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0));

  const counts = files.reduce((acc, f) => {
    acc[f.classification] = (acc[f.classification] ?? 0) + 1;
    return acc;
  }, {});

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    root: repoRoot,
    counts,
    files,
  };

  const out = process.argv[2] ?? 'coverage/runtime-manifest.json';
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `runtime-manifest: wrote ${files.length} files (${Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}) to ${out}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`runtime-manifest: failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});