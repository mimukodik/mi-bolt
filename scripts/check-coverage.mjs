#!/usr/bin/env node
// scripts/check-coverage.mjs
//
// `assertExactCoverage(manifest, report)` is the T02 hard gate:
// every file in the manifest that is classified `runtime` or
// `bootstrap` must appear in the Istanbul-format coverage report
// with statements, branches, functions and lines metrics at 100%.
//
// Rejection modes (mapped to a stable string the upstream caller
// can branch on):
//   - empty-report           report file missing or empty
//   - nan-metric             metric is NaN / undefined / null
//   - threshold-below-100    policy says <100 is allowed
//   - threshold-not-met      a file's metric < threshold
//   - unvisited-owned-file   a manifest entry not present in report
//
// Usage:
//   node scripts/check-coverage.mjs --unit
//   node scripts/check-coverage.mjs --e2e
//   node scripts/check-coverage.mjs --unit --manifest path --report path

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import istanbulCoverage from 'istanbul-lib-coverage';

const { createFileCoverage } = istanbulCoverage;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_THRESHOLDS = Object.freeze({
  statements: 100,
  branches: 100,
  functions: 100,
  lines: 100,
});

const ENFORCED_CLASSIFICATIONS = new Set(['runtime', 'bootstrap']);

class GateError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details ?? {};
  }
}

function readJson(path) {
  if (!existsSync(path)) {
    throw new GateError('empty-report', `coverage report not found: ${path}`, {
      path,
    });
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || (typeof raw === 'object' && Object.keys(raw).length === 0)) {
    throw new GateError('empty-report', `coverage report is empty: ${path}`);
  }
  return raw;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function resolveMetric(fileData, metric) {
  // vitest's coverage-v8 emits raw Istanbul format. The fields `s`,
  // `b` and `f` are hit counters keyed by statement/branch/function
  // map indices; the summary metrics (`statements.pct`,
  // `branches.pct`, etc.) only exist when a coverage-summary
  // reporter was used. Compute them here so the gate works against
  // the raw report without depending on json-summary output.
  const summary = fileData?._summary ?? null;
  if (summary && summary[metric]) {
    const entry = summary[metric];
    if (typeof entry.pct === 'number' && !Number.isNaN(entry.pct)) {
      return { count: entry.covered ?? 0, total: entry.total ?? 0, pct: entry.pct };
    }
  }
  const counters = fileData?.[metric[0]] ?? null; // s | b | f
  const map =
    metric === 'statements'
      ? fileData?.statementMap
      : metric === 'branches'
        ? fileData?.branchMap
        : fileData?.fnMap;
  if (!counters || !map) return { count: 0, total: 0, pct: Number.NaN };
  const total = Object.keys(map).length;
  let covered = 0;
  for (const key of Object.keys(map)) {
    const v = counters[key];
    if (Array.isArray(v)) {
      if (v.some((hit) => hit > 0)) covered += 1;
    } else if (typeof v === 'number' && v > 0) {
      covered += 1;
    }
  }
  const pct = total === 0 ? Number.NaN : Math.round((covered / total) * 10000) / 100;
  return { count: covered, total, pct };
}

function computeSummary(fileData) {
  // Use istanbul-lib-coverage when the summary fields exist; fall
  // back to local computation so raw Istanbul reports also work.
  try {
    const fc = createFileCoverage(fileData);
    const summary = fc.toSummary();
    const entries = {
      statements: summary.statements ?? summary.lines ?? null,
      branches: summary.branches ?? null,
      functions: summary.functions ?? null,
      lines: summary.lines ?? null,
    };
    return {
      statements: {
        pct: entries.statements?.pct ?? resolveMetric(fileData, 'statements').pct,
        covered: entries.statements?.covered ?? 0,
        total: entries.statements?.total ?? 0,
      },
      branches: {
        pct: entries.branches?.pct ?? resolveMetric(fileData, 'branches').pct,
        covered: entries.branches?.covered ?? 0,
        total: entries.branches?.total ?? 0,
      },
      functions: {
        pct: entries.functions?.pct ?? resolveMetric(fileData, 'functions').pct,
        covered: entries.functions?.covered ?? 0,
        total: entries.functions?.total ?? 0,
      },
      lines: {
        pct: entries.lines?.pct ?? resolveMetric(fileData, 'lines').pct,
        covered: entries.lines?.covered ?? 0,
        total: entries.lines?.total ?? 0,
      },
    };
  } catch {
    return {
      statements: resolveMetric(fileData, 'statements'),
      branches: resolveMetric(fileData, 'branches'),
      functions: resolveMetric(fileData, 'functions'),
      lines: resolveMetric(fileData, 'lines'),
    };
  }
}

function assertExactCoverage(manifest, report, thresholds = DEFAULT_THRESHOLDS) {
  for (const [metric, value] of Object.entries(thresholds)) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new GateError('threshold-below-100', `threshold.${metric} is NaN`, {
        thresholds,
      });
    }
    if (value < 100) {
      throw new GateError('threshold-below-100', `threshold.${metric}=${value} must be 100`, {
        thresholds,
      });
    }
  }

  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new GateError('empty-report', 'manifest has no files');
  }

  // Istanbul reports are a `{ "<path>": { statementMap, s, b, f, ... } }`
  // object. Build an index keyed by every plausible shape: absolute
  // path, repo-relative POSIX path, and trailing segments.
  const reportKeys = Object.keys(report);
  const reportByRel = new Map();
  for (const key of reportKeys) {
    const normalized = key.replace(/\\/g, '/').replace(/^\.\//, '');
    reportByRel.set(normalized, report[key]);
    reportByRel.set(normalized.replace(/^.*\/src\//, 'src/'), report[key]);
    reportByRel.set(normalized.replace(/^.*\/coverage\/src\//, 'src/'), report[key]);
  }

  const enforcedFiles = manifest.files.filter((f) =>
    ENFORCED_CLASSIFICATIONS.has(f.classification),
  );

  if (enforcedFiles.length === 0) {
    throw new GateError('empty-report', 'manifest contains no enforced (runtime|bootstrap) files', {
      manifestCounts: manifest.counts,
    });
  }

  const failures = [];

  for (const file of enforcedFiles) {
    const rel = file.relative;
    const data =
      report[rel] ??
      report[rel.replace(/^\.\//, '')] ??
      reportByRel.get(rel) ??
      reportByRel.get(`coverage/${rel}`);

    if (!data) {
      failures.push({ code: 'unvisited-owned-file', file: rel });
      continue;
    }

    const summary = computeSummary(data);
    const totalExecuted =
      summary.statements.covered +
      summary.branches.covered +
      summary.functions.covered +
      summary.lines.covered;
    if (totalExecuted === 0) {
      // The coverage provider emitted an empty placeholder for the
      // file. Treat it the same as a missing entry: the source
      // exists, the manifest owns it, and no run touched it.
      failures.push({ code: 'unvisited-owned-file', file: rel });
      continue;
    }

    for (const metric of Object.keys(thresholds)) {
      const m = summary[metric];
      if (Number.isNaN(m.pct)) {
        failures.push({
          code: 'nan-metric',
          file: rel,
          metric,
          raw: data[metric],
        });
        continue;
      }
      if (m.pct < thresholds[metric]) {
        failures.push({
          code: 'threshold-not-met',
          file: rel,
          metric,
          pct: m.pct,
          threshold: thresholds[metric],
        });
      }
    }
  }

  if (failures.length > 0) {
    const summary = failures
      .map((f) => `  - [${f.code}] ${f.file}${f.metric ? ` (${f.metric}=${f.pct ?? 'NaN'})` : ''}`)
      .join('\n');
    process.stderr.write(`\nALL FAILURES:\n${summary}\n`);
    throw new GateError(
      failures[0].code,
      `coverage gate failed (${failures.length} issue${failures.length === 1 ? '' : 's'}). First 10:\n${failures
        .slice(0, 10)
        .map(
          (f) => `  - [${f.code}] ${f.file}${f.metric ? ` (${f.metric}=${f.pct ?? 'NaN'})` : ''}`,
        )
        .join('\n')}`,
      { failures },
    );
  }
}

function parseArgs(argv) {
  const args = { mode: null, manifest: null, report: null, thresholds: null };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--unit') args.mode = 'unit';
    else if (token === '--e2e') args.mode = 'e2e';
    else if (token === '--manifest') args.manifest = argv[++i];
    else if (token === '--report') args.report = argv[++i];
    else if (token === '--thresholds') args.thresholds = JSON.parse(argv[++i]);
    else if (token === '--help' || token === '-h') {
      process.stdout.write(
        'Usage: check-coverage.mjs --unit|--e2e [--manifest <p>] [--report <p>]\n',
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) {
    process.stderr.write('check-coverage: missing --unit or --e2e\n');
    process.exit(2);
  }

  const manifestPath = args.manifest ?? joinSafe(repoRoot, 'coverage/runtime-manifest.json');
  const reportPath =
    args.report ??
    (args.mode === 'unit'
      ? joinSafe(repoRoot, 'coverage/unit/coverage-final.json')
      : joinSafe(repoRoot, 'coverage/e2e/coverage-final.json'));

  if (!existsSync(manifestPath)) {
    process.stderr.write(`check-coverage: manifest missing: ${manifestPath}\n`);
    process.stderr.write('check-coverage: generate it with `node scripts/runtime-manifest.mjs`\n');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let report;
  try {
    report = readJson(reportPath);
  } catch (err) {
    if (err instanceof GateError) {
      process.stderr.write(`check-coverage [${err.code}]: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  try {
    assertExactCoverage(manifest, report, args.thresholds ?? DEFAULT_THRESHOLDS);
    process.stdout.write(
      `check-coverage [${args.mode}]: PASS — ${manifest.files.length} files in manifest, ${asArray(report).length} files in report, all metrics >= 100\n`,
    );
    process.exit(0);
  } catch (err) {
    if (err instanceof GateError) {
      process.stderr.write(`check-coverage [${err.code}]: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

function joinSafe(root, rel) {
  // Use the platform-native separator so the script works on both
  // POSIX and Windows CI layouts without producing mixed slashes.
  return join(root, rel);
}

main().catch((err) => {
  process.stderr.write(`check-coverage: unexpected failure: ${err?.stack ?? err}\n`);
  process.exit(1);
});

export { assertExactCoverage, GateError, DEFAULT_THRESHOLDS };
