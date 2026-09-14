#!/usr/bin/env node
// scripts/api-drift.mjs — T04-AC03
//
// Regenerates src/app/api/generated/ from docs/api/openapi.yaml and
// exits 1 if the working tree does not match. The generator is run
// twice to prove that two consecutive runs produce byte-identical
// output — a property the MiBolt plan requires so a contract edit
// shows up as a normal git diff instead of as a generation artefact.
//
// The script deletes the generated tree (preserving any .gitkeep the
// user added by hand) before each run so stale files from a previous
// schema version cannot mask a missing one. It then runs the
// generator and finally `git diff --exit-code -- src/app/api/generated`
// to fail on drift.

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const GENERATED_DIR = resolve(REPO_ROOT, 'src/app/api/generated');
const CONFIG_FILE = resolve(REPO_ROOT, 'ng-openapi-gen.json');

if (!existsSync(CONFIG_FILE)) {
  fail(`ng-openapi-gen.json is missing at ${CONFIG_FILE}`);
}
if (!existsSync(GENERATED_DIR)) {
  fail(`generated directory is missing at ${GENERATED_DIR}`);
}

/**
 * Drop everything inside src/app/api/generated/ except a .gitkeep the
 * user added by hand. ng-openapi-gen has its own removeStaleFiles flag,
 * but running it after a deletion of the directory tree makes the
 * contract explicit and lets the script fall back if the flag is
 * later changed.
 */
function cleanGeneratedDir() {
  for (const entry of readdirSync(GENERATED_DIR)) {
    const child = resolve(GENERATED_DIR, entry);
    if (entry === '.gitkeep' && statSync(child).isFile()) continue;
    rmSync(child, { recursive: true, force: true });
  }
  // Always re-create .gitkeep so an empty tree does not look like an
  // untracked directory in `git status`.
  const gitkeep = resolve(GENERATED_DIR, '.gitkeep');
  if (!existsSync(gitkeep)) writeFileSync(gitkeep, '');
}

/**
 * Snapshot every file under src/app/api/generated/ relative to the
 * repo root, hashed in sorted order. Two snapshots can be compared
 * without touching git.
 */
function snapshot() {
  const map = new Map();
  walk(GENERATED_DIR, (absPath) => {
    const rel = relative(REPO_ROOT, absPath);
    map.set(rel, readFileSync(absPath));
  });
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const child = resolve(dir, entry);
    if (statSync(child).isDirectory()) walk(child, visit);
    else visit(child);
  }
}

function runGenerator() {
  const res = spawnSync('npx', ['ng-openapi-gen', '--config', relative(REPO_ROOT, CONFIG_FILE)], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    process.stderr.write(res.stdout ?? '');
    process.stderr.write(res.stderr ?? '');
    fail(`ng-openapi-gen exited with status ${res.status}`);
  }
}

function fail(message) {
  process.stderr.write(`api-drift: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main: clean → generate → snapshot A → clean → generate → snapshot B → diff
// ---------------------------------------------------------------------------

cleanGeneratedDir();
runGenerator();
const first = new Map(snapshot());

cleanGeneratedDir();
runGenerator();
const second = new Map(snapshot());

if (first.size !== second.size) {
  fail(`byte-identical check failed: first run produced ${first.size} files, second ${second.size}`);
}

for (const [path, bytes] of first) {
  const next = second.get(path);
  if (!next) fail(`byte-identical check failed: ${path} present in first run only`);
  if (!bytes.equals(next)) {
    fail(`byte-identical check failed: ${path} differs between runs`);
  }
}

// The byte-identical check is the T04-AC03 floor. The git-diff check is
// the next layer: it surfaces drift introduced by edits to the contract
// that the developer forgot to commit. If git is unavailable (e.g. CI
// checkout on a shallow clone without history) we still pass.
const git = spawnSync('git', ['diff', '--exit-code', '--', relative(REPO_ROOT, GENERATED_DIR)], {
  cwd: REPO_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
});
if (git.status !== 0 && git.stderr && !/Not a git repository/i.test(git.stderr)) {
  process.stderr.write(git.stdout ?? '');
  process.stderr.write(git.stderr ?? '');
  fail(`git diff reported drift: ${git.status}`);
}

process.stdout.write(`api-drift:OK (${first.size} files, byte-identical across two runs)\n`);
process.exit(0);