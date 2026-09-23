// Moves every path of the mi-bolt frontend and imports the backend files the
// rule table below selects, staging all of it in one git index. The script is
// idempotent: a second run on an applied tree prints ALREADY APPLIED.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_SHA = '7c5366bf9084459c46b4ca8b7f8212d29976020a';
const BACKEND_SHA = '82535a332e1c2423723e33061d097a959d93456a';

const MAX_BUFFER = 256 * 1024 * 1024;
const ADD_CHUNK = 200;
const EXPECTED_RENAMED = 864;
const EXPECTED_ADDED = 371;

const FRONTEND_RULES = [
  {
    id: 'F-stay',
    op: 'stay',
    match: (p) =>
      ['CLAUDE.md', '.mcp.json', '.editorconfig', '.gitignore', 'README.md', 'AGENTS.md'].includes(p) ||
      ['.claude/', '.github/', '.vscode/', '.idea/', '.agents/', '.codex/', '.gemini/'].some((prefix) => p.startsWith(prefix))
        ? p
        : undefined,
  },
  {
    id: 'F-storefront',
    op: 'move',
    match: (p) =>
      p.startsWith('src/') ||
      p.startsWith('public/') ||
      ['tsconfig.app.json', 'tsconfig.spec.json', 'vitest.config.ts'].includes(p)
        ? 'frontend/projects/storefront/' + p
        : undefined,
  },
  { id: 'F-workspace', op: 'move', match: (p) => 'frontend/' + p },
];

const BACKEND_RULES = [
  {
    id: 'B-exclude',
    op: 'exclude',
    match: (p) =>
      ['.mcp.json', 'AGENTS.md'].includes(p) ||
      ['.claude/', '.agents/', '.codex/', '.gemini/'].some((prefix) => p.startsWith(prefix))
        ? null
        : undefined,
  },
  {
    id: 'B-env-example',
    op: 'import',
    match: (p) => (p === '.docker-compose.local-database.env.example' ? 'deploy/.env.example' : undefined),
  },
  { id: 'B-catalog', op: 'import', match: (p) => (p.startsWith('data/catalog/') ? p : undefined) },
  { id: 'B-contract', op: 'import', match: (p) => (p === 'api/openapi.yaml' ? 'contracts/commerce/openapi.yaml' : undefined) },
  {
    id: 'B-kommunikacio',
    op: 'import',
    match: (p) => (p === 'docs/01-kommunikacio.md' ? 'contracts/commerce/kommunikacio.md' : undefined),
  },
  { id: 'B-docs', op: 'import', match: (p) => (p.startsWith('docs/') ? 'backend/' + p : undefined) },
  {
    id: 'B-gradle-root',
    op: 'import',
    match: (p) =>
      ['gradlew', 'gradlew.bat', 'settings.gradle'].includes(p) || ['gradle/', 'config/'].some((prefix) => p.startsWith(prefix))
        ? 'backend/' + p
        : undefined,
  },
  { id: 'B-build', op: 'import', match: (p) => (p === 'build.gradle' ? 'backend/services/commerce/build.gradle' : undefined) },
  {
    id: 'B-service-scripts',
    op: 'import',
    match: (p) =>
      ['scripts/smoke.sh', 'scripts/local-database-docker.sh', 'scripts/demo-stack.sh'].includes(p)
        ? 'backend/services/commerce/' + p
        : undefined,
  },
  { id: 'B-tools', op: 'import', match: (p) => (p.startsWith('scripts/') ? 'tools/' + p.slice('scripts/'.length) : undefined) },
  {
    id: 'B-tools-package',
    op: 'import',
    match: (p) => (p === 'package.json' ? 'tools/package.json' : p === 'pnpm-lock.yaml' ? 'tools/pnpm-lock.yaml' : undefined),
  },
  {
    id: 'B-docker',
    op: 'import',
    match: (p) =>
      ['Dockerfile', '.dockerignore', 'docker-compose.yml', 'docker-compose.local-database.yml'].includes(p)
        ? 'backend/services/commerce/' + p
        : undefined,
  },
  { id: 'B-git', op: 'import', match: (p) => (['.gitignore', '.gitattributes'].includes(p) ? 'backend/' + p : undefined) },
  {
    id: 'B-workflow',
    op: 'import',
    match: (p) => (p === '.github/workflows/pr-check.yml' ? '.github/workflows/backend-pr-check.yml' : undefined),
  },
  { id: 'B-readme', op: 'import', match: (p) => (p === 'README.md' ? 'backend/README.md' : undefined) },
  { id: 'B-src', op: 'import', match: (p) => (p.startsWith('src/') ? 'backend/services/commerce/' + p : undefined) },
];

function fail(reason) {
  fs.writeSync(2, reason + '\n');
  process.exit(1);
}

function takeValue(argv, index, name) {
  const next = argv[index];
  if (next === undefined || next.startsWith('--')) fail(`${name} needs a value`);
  return next;
}

function parseArgs(argv) {
  const opts = { repo: process.cwd(), backendRepo: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repo') opts.repo = takeValue(argv, ++i, '--repo');
    else if (arg === '--backend-repo') opts.backendRepo = takeValue(argv, ++i, '--backend-repo');
    else if (arg === '--dry-run') opts.dryRun = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (opts.backendRepo === null || opts.backendRepo === undefined) fail('--backend-repo is required');
  return opts;
}

// git ls-tree and git ls-files are scoped to the working directory they run
// in, so a --repo pointing below the root would select a subtree (or nothing at
// all) and the run would report success over paths it never looked at.
function requireRepoRoot(repo) {
  const root = fs.realpathSync(
    execFileSync('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
  );
  if (root !== fs.realpathSync(repo)) fail(`--repo must be the repository root, not ${repo}`);
}

function readTree(repo, sha) {
  const raw = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '-z', sha], { maxBuffer: MAX_BUFFER }).toString('utf8');
  return raw
    .split('\0')
    .filter((line) => line !== '')
    .map((line) => {
      const tab = line.indexOf('\t');
      const meta = line.slice(0, tab).split(' ');
      return { mode: meta[0], blob: meta[2], path: line.slice(tab + 1) };
    });
}

function collect(repoName, repo, sha, rules) {
  const unmatched = [];
  const entries = [];
  for (const item of readTree(repo, sha)) {
    const rule = rules.find((candidate) => candidate.match(item.path) !== undefined);
    if (rule === undefined) {
      unmatched.push(item.path);
      continue;
    }
    entries.push({
      repo: repoName,
      rule: rule.id,
      op: rule.op,
      src: item.path,
      dst: rule.match(item.path),
      mode: item.mode,
      blob: item.blob,
    });
  }
  return { entries, unmatched };
}

function bySrc(a, b) {
  if (a.src < b.src) return -1;
  if (a.src > b.src) return 1;
  return 0;
}

function validate(unmatched, entries) {
  const destinations = new Map();
  for (const entry of entries) {
    if (entry.dst === null) continue;
    destinations.set(entry.dst, (destinations.get(entry.dst) ?? 0) + 1);
  }
  const duplicates = Array.from(destinations)
    .filter(([, count]) => count > 1)
    .map(([dst]) => dst)
    .sort();
  for (const p of unmatched) fs.writeSync(2, `no rule matched: ${p}\n`);
  for (const dst of duplicates) fs.writeSync(2, `destination used twice: ${dst}\n`);
  if (unmatched.length > 0 || duplicates.length > 0) process.exit(1);
}

function buildManifest(opts) {
  const frontend = collect('frontend', opts.repo, FRONTEND_SHA, FRONTEND_RULES);
  const backend = collect('backend', opts.backendRepo, BACKEND_SHA, BACKEND_RULES);
  const entries = [...frontend.entries.sort(bySrc), ...backend.entries.sort(bySrc)];
  validate([...frontend.unmatched, ...backend.unmatched], entries);
  return { frontendSha: FRONTEND_SHA, backendSha: BACKEND_SHA, entries };
}

function dryRun(manifest) {
  const counts = new Map();
  for (const entry of manifest.entries) counts.set(entry.rule, (counts.get(entry.rule) ?? 0) + 1);
  for (const rule of [...FRONTEND_RULES, ...BACKEND_RULES]) {
    process.stderr.write(`${rule.id} ${counts.get(rule.id) ?? 0}\n`);
  }
  const opCount = (repo, op) => manifest.entries.filter((entry) => entry.repo === repo && entry.op === op).length;
  process.stderr.write(
    `TOTAL frontend stay=${opCount('frontend', 'stay')} move=${opCount('frontend', 'move')} ` +
      `backend exclude=${opCount('backend', 'exclude')} import=${opCount('backend', 'import')}\n`,
  );
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}

function trackedPaths(repo) {
  const raw = execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  return new Set(raw.split('\n').filter((p) => p !== ''));
}

function apply(opts, manifest) {
  const moves = manifest.entries.filter((entry) => entry.op === 'move');
  const imports = manifest.entries.filter((entry) => entry.op === 'import');
  const tracked = trackedPaths(opts.repo);
  if (
    moves.length > 0 &&
    imports.length > 0 &&
    moves.every((entry) => !tracked.has(entry.src) && tracked.has(entry.dst)) &&
    imports.every((entry) => tracked.has(entry.dst))
  ) {
    process.stdout.write('ALREADY APPLIED\n');
    return;
  }
  const head = execFileSync('git', ['-C', opts.repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== FRONTEND_SHA) fail(`HEAD is ${head}, expected ${FRONTEND_SHA}`);
  const dirty = execFileSync('git', ['-C', opts.repo, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  if (dirty !== '') fail('the index or the working tree already has changes');
  try {
    execFileSync('git', ['-C', opts.backendRepo, 'cat-file', '-e', `${BACKEND_SHA}^{commit}`], { stdio: 'ignore' });
  } catch {
    fail(`the backend repository has no commit ${BACKEND_SHA}`);
  }
  for (const entry of moves) {
    fs.mkdirSync(path.dirname(path.join(opts.repo, entry.dst)), { recursive: true });
    execFileSync('git', ['-C', opts.repo, 'mv', '--', entry.src, entry.dst]);
  }
  for (const entry of imports) {
    if (entry.mode !== '100644' && entry.mode !== '100755') fail(`unsupported file mode ${entry.mode} for ${entry.src}`);
    const bytes = execFileSync('git', ['-C', opts.backendRepo, 'cat-file', 'blob', entry.blob], { maxBuffer: MAX_BUFFER });
    fs.mkdirSync(path.dirname(path.join(opts.repo, entry.dst)), { recursive: true });
    fs.writeFileSync(path.join(opts.repo, entry.dst), bytes);
    fs.chmodSync(path.join(opts.repo, entry.dst), entry.mode === '100755' ? 0o755 : 0o644);
  }
  for (let i = 0; i < imports.length; i += ADD_CHUNK) {
    execFileSync('git', ['-C', opts.repo, 'add', '--', ...imports.slice(i, i + ADD_CHUNK).map((entry) => entry.dst)]);
  }
  const staged = execFileSync('git', ['-C', opts.repo, 'diff', '--cached', '--name-status', '--find-renames=100%'], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  let renamed = 0;
  let added = 0;
  let other = 0;
  for (const line of staged.split('\n')) {
    if (line === '') continue;
    else if (line.startsWith('R100')) renamed++;
    else if (line.startsWith('A')) added++;
    else {
      other++;
      process.stderr.write(line + '\n');
    }
  }
  fs.writeSync(1, `RENAMED ${renamed} ADDED ${added} OTHER ${other}\n`);
  process.exit(renamed === EXPECTED_RENAMED && added === EXPECTED_ADDED && other === 0 ? 0 : 1);
}

const opts = parseArgs(process.argv.slice(2));
requireRepoRoot(opts.repo);
const manifest = buildManifest(opts);
if (opts.dryRun) dryRun(manifest);
else apply(opts, manifest);
