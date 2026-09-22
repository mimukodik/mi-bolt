#!/usr/bin/env node
// Enforce the e2e coverage gate. Reads the istanbul `json-summary` report
// monocart-reporter produces (coverage/e2e/coverage/coverage-summary.json) and
// compares statements, branches, functions and lines against the unit-test
// thresholds declared in angular.json (lines 102-108): statements 80, branches
// 75, functions 80, lines 80. Exits 1 on any under-threshold metric or when no
// coverage entry was collected at all (the json-summary file is absent).
import { existsSync, readFileSync } from 'node:fs';

const thresholds = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80,
};

const argument = process.argv[2];
if (!argument) {
  console.error('e2e coverage gate: coverage-summary.json path is required');
  process.exit(1);
}

if (!existsSync(argument)) {
  console.error(
    'e2e coverage gate failed: no coverage entry was collected (0 entries → every metric is 0%)',
  );
  for (const [metric, threshold] of Object.entries(thresholds)) {
    console.error(`e2e coverage ${metric} 0.0% (threshold ${threshold}%)`);
  }
  process.exit(1);
}

let total;
try {
  const parsed = JSON.parse(readFileSync(argument, 'utf8'));
  if (parsed && typeof parsed === 'object' && parsed.total && typeof parsed.total === 'object') {
    total = parsed.total;
  }
} catch (error) {
  console.error(
    `e2e coverage gate failed: coverage-summary.json could not be parsed (${error.message})`,
  );
  process.exit(1);
}

if (!total) {
  console.error('e2e coverage gate failed: coverage-summary.json has no `total` object');
  process.exit(1);
}

const failed = [];
for (const [metric, threshold] of Object.entries(thresholds)) {
  const entry = total[metric];
  const pct = entry && typeof entry.pct === 'number' ? entry.pct : 0;
  console.log(`e2e coverage ${metric} ${pct.toFixed(1)}% (threshold ${threshold}%)`);
  if (pct < threshold) {
    failed.push(`${metric}=${pct.toFixed(1)}%<${threshold}%`);
  }
}

if (failed.length > 0) {
  console.error(`e2e coverage gate failed: ${failed.join(', ')}`);
  process.exit(1);
}
