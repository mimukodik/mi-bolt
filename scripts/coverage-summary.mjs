#!/usr/bin/env node
// Print a GitHub-flavored markdown coverage summary from an istanbul/nyc
// json-summary file. Reads the `total` object only; the column order and
// the `### Unit coverage` heading are what the PR check workflow appends
// to `$GITHUB_STEP_SUMMARY`.
import { existsSync, readFileSync } from 'node:fs';

const heading = '### Unit coverage';

const arg = process.argv[2];
if (!arg) {
  console.log(heading);
  console.log('coverage-summary.json path is required');
  process.exit(0);
}

if (!existsSync(arg)) {
  console.log(heading);
  console.log('coverage-summary.json not found');
  process.exit(0);
}

let total;
try {
  const raw = readFileSync(arg, 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed === 'object' && parsed !== null && 'total' in parsed) {
    const candidate = parsed.total;
    if (typeof candidate === 'object' && candidate !== null) {
      total = candidate;
    }
  }
} catch {
  console.log(heading);
  console.log('coverage-summary.json could not be parsed');
  process.exit(0);
}

if (!total) {
  console.log(heading);
  console.log('coverage-summary.json has no `total` object');
  process.exit(0);
}

const rows = [
  ['Statements', total.statements],
  ['Branches', total.branches],
  ['Functions', total.functions],
  ['Lines', total.lines],
];

const pct = (entry) => {
  if (!entry) return 'n/a';
  const covered = typeof entry.covered === 'number' ? entry.covered : 0;
  const totalCount = typeof entry.total === 'number' ? entry.total : 0;
  return totalCount === 0 ? '100.0%' : ((covered / totalCount) * 100).toFixed(1) + '%';
};

const num = (entry) => (entry && typeof entry.total === 'number' ? String(entry.total) : 'n/a');

const lines = [heading, '', '| Metric | Covered | Total | Pct |', '| --- | ---: | ---: | ---: |'];
for (const [label, entry] of rows) {
  const covered = entry && typeof entry.covered === 'number' ? String(entry.covered) : num(entry);
  lines.push(`| ${label} | ${covered} | ${num(entry)} | ${pct(entry)} |`);
}
console.log(lines.join('\n'));
