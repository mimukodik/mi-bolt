#!/usr/bin/env node
// scripts/check-test-policy.mjs — T27-AC05/T27-AC06 test policy gate.
//
// Asserts that no committed spec file contains a focus/skip/disable
// directive that would let a failing requirement pass the suite
// silently. The forbidden list mirrors the `coverage-policy.json`
// "forbidden" entry (`skip/todo/only`) and extends it with every
// Vitest / Jest spelling the user is likely to use.
//
// Scope:
//   tests/**/*.spec.ts       (Vitest specs)
//   tests/**/*.test.ts
//   tests/contract/**/*.spec.ts
//
// Exits 0 with `test-policy:OK` and a per-pattern count when nothing
// trips, exits 1 with a structured finding list otherwise. The exit
// payload is machine-readable so CI can wire it directly.
//
// Usage:
//   node scripts/check-test-policy.mjs                # default scan
//   node scripts/check-test-policy.mjs --strict      # also ban
//                                                    # covergage-ignore
//                                                    # pragmas

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

const SCAN_ROOTS = ['tests'];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

const PATTERNS = [
  // Vitest / Jest - the three forbidden modifiers spelled in every
  // shape they exist in.
  { id: 'it-skip', regex: /\b(it|test|spec)\.skip\s*\(/ },
  { id: 'it-only', regex: /\b(it|test|spec)\.only\s*\(/ },
  { id: 'it-todo', regex: /\b(it|test|spec)\.todo\s*\(/ },
  { id: 'describe-skip', regex: /\b(describe|suite|context)\.skip\s*\(/ },
  { id: 'describe-only', regex: /\b(describe|suite|context)\.only\s*\(/ },
  { id: 'describe-todo', regex: /\b(describe|suite|context)\.todo\s*\(/ },
  { id: 'xit', regex: /\bxit\s*\(/ },
  { id: 'xdescribe', regex: /\bxdescribe\s*\(/ },
  { id: 'xtest', regex: /\bxtest\s*\(/ },
  { id: 'it-fixme', regex: /\b(it|test|spec)\.fixme\s*\(/ },
  { id: 'it-fails', regex: /\b(it|test|spec)\.fails\s*\(/ },
  // Quarantine / soft disable aliases. These are not real Vitest
  // APIs, but the implementation intentionally rejects
  // ANY literal mention of "quarantine" inside a spec body so a
  // future author cannot invent one.
  { id: 'quarantine-marker', regex: /\b(flaky[_-]?quarantine|quarantine|skipQuarantine)\b/i },
  // Common test-ignore comment variants. eslint-disable with
  // `no-skipped-tests` would be the proper way - any other rationale
  // is a soft skip.
  { id: 'skip-comment', regex: /@(skip|todo|ignore|xfail|fixme)\b/i },
];

const STRICT_PATTERNS = [
  // The coverage-policy forbidden list names "coverage-ignore pragmas".
  // Istanbul / nyc use /* istanbul ignore next */ and /* c8 ignore next */;
  // some scripts emit /* v8 ignore next */; we reject every spelling.
  { id: 'coverage-ignore-pragma', regex: /\/\*\s*(istanbul|v8|c8|nyc)\s+ignore\b/i },
];

function shouldScan(entry) {
  const ext = extname(entry);
  if (!SCAN_EXTENSIONS.has(ext)) return false;
  // Skip dependency / build outputs that may live inside the scan
  // roots in some workspaces.
  if (entry.includes(`${sep}node_modules${sep}`)) return false;
  if (entry.includes(`${sep}dist${sep}`)) return false;
  return true;
}

function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const child = join(dir, entry);
    const st = statSync(child);
    if (st.isDirectory()) walk(child, acc);
    else if (st.isFile() && shouldScan(child)) acc.push(child);
  }
  return acc;
}

function stripComments(src) {
  // Strip block and line comments so a literal "@skip" inside a
  // description string does not trigger the policy. We are checking
  // whether the SPEC is committing to skip a requirement, not
  // whether a comment mentions skip.
  let out = src;
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return out;
}

function scanFile(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  const stripped = stripComments(raw);
  const findings = [];
  const checks = [...PATTERNS, ...(strict ? STRICT_PATTERNS : [])];
  for (const pattern of checks) {
    const matches = stripped.match(pattern.regex);
    if (matches) {
      const lineIndex = stripped.slice(0, stripped.indexOf(matches[0])).split('\n').length;
      findings.push({
        file: relative(REPO_ROOT, absPath),
        line: lineIndex,
        pattern: pattern.id,
        snippet: matches[0],
      });
    }
  }
  return findings;
}

function parseArgs(argv) {
  const args = { strict: false, help: false };
  for (const token of argv) {
    if (token === '--strict') args.strict = true;
    else if (token === '--help' || token === '-h') args.help = true;
  }
  return args;
}

function help() {
  process.stdout.write(`Usage: check-test-policy.mjs [--strict]

Scans tests/ for Vitest focus, skip, todo,
quarantine and coverage-ignore directives that would let failing
requirements pass the suite silently. Exits 0 on a clean scan, 1 on
any finding. --strict also rejects coverage-ignore pragma comments.
`);
}

const args = parseArgs(process.argv.slice(2));
const strict = args.strict;
if (args.help) {
  help();
  process.exit(0);
}

const files = [];
for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);

let findings = [];
let scanned = 0;
for (const file of files) {
  scanned += 1;
  findings.push(...scanFile(file));
}

if (findings.length > 0) {
  const grouped = findings.reduce((acc, f) => {
    const key = `${f.file}:${f.line}`;
    acc[key] ??= { file: f.file, line: f.line, patterns: new Set() };
    acc[key].patterns.add(f.pattern);
    return acc;
  }, {});
  const lines = Object.values(grouped)
    .map((g) => `  - ${g.file}:${g.line}  ${Array.from(g.patterns).join(', ')}`)
    .join('\n');
  process.stderr.write(
    `\ntest-policy:FAIL — ${findings.length} finding(s) in ${Object.keys(grouped).length} location(s) across ${scanned} files:\n${lines}\n`,
  );
  process.stderr.write(
    'test-policy: per docs/spec/testing.md and docs/spec/coverage-policy.json, every spec must run.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `test-policy:OK — ${scanned} files scanned, no focus/skip/todo/quarantine/coverage-ignore directive committed.\n`,
);
process.exit(0);
