#!/usr/bin/env node
/**
 * find-contract-consumers.mjs
 *
 * Purpose: given a name from the commerce OpenAPI contract (a schema, an
 * operation, a property, or an enum value), find every place in the repo
 * that is a candidate consumer of it, sorted into fixed buckets by area, so
 * a contract change does not miss a consumer. Answering this by hand takes
 * several greps with different spellings (exact, kebab-case file names,
 * get/set accessors, upper/lower enum case) and then sorting the hits by
 * hand; this script does both in one pass.
 *
 * Prerequisites: a git checkout of this repo; git; Node 26.
 *
 * Command (path relative to this skill's directory; run from the repo root):
 *   node scripts/find-contract-consumers.mjs \
 *     --kind schema|property|enum|operation <Name>
 *
 * Exit codes:
 *   0 - <Name> is present in the contract as <kind>, whether or not any
 *       consumer bucket has a hit.
 *   1 - <Name> is not present in the contract as <kind>.
 *   2 - usage error (missing/bad --kind, bad <Name> spelling) or layout
 *       drift (a bucket root no longer exists on disk, or the repo/git
 *       environment itself is broken).
 *
 * Read-only guarantee: this script only runs `git grep` and `git ls-files`,
 * via execFileSync with argument arrays (never a shell string), plus plain
 * file reads with node:fs. No writes, no network. Every repo-wide search
 * excludes the whole top-level directory that holds the skills root (the
 * directory that holds the MiBolt skills; the parent of this skill's
 * directory), not just that root directory itself, so a sibling skill's
 * draft text is never counted as a consumer.
 *
 * Hits are candidates, not confirmed consumers: a word match such as
 * `getCart` also matches unrelated code such as an entity getter
 * `CartItem.getCart`. Confirm each hit by opening it.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path, { join } from 'node:path';

// The skills root is the parent of this skill's own directory, so this
// script keeps working when the directory that holds the MiBolt skills
// moves.
const SKILLS_ROOT = path.resolve(import.meta.dirname, '..', '..');

const VALID_KINDS = ['schema', 'property', 'enum', 'operation'];
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Text-parsing regexes for deriving an operation's METHOD and path from the
// contract file, so the operation kind also finds a URL that names no
// operationId. These match the contract's own indentation, not a YAML parse.
const OPERATION_ID_RE = /^\s*operationId:\s*(\S+)\s*$/;
const METHOD_RE = /^ {4}(get|put|post|delete|patch|head|options|trace):\s*$/;
const PATH_RE = /^ {2}(\/\S*):\s*$/;
const SERVERS_RE = /^servers:\s*$/;
const SERVER_URL_RE = /^- url:\s*(\S+)\s*$/;
const BACKTICK = String.fromCharCode(96);
// A {param} segment in the derived path, generalised to also match a route
// param (:productId), a template literal (${String(id)}), a literal id, or a
// string concatenation (" + id + ").
const PARAM_ALTERNATION = `([^/"'${BACKTICK}[:space:]]+|["'${BACKTICK}] *\\+ *[^"'${BACKTICK}+]+\\+ *["'${BACKTICK}])`;

const BUCKET_LABELS = {
  1: 'contract',
  2: 'generated shop SDK',
  3: 'generated admin client',
  4: 'storefront',
  5: 'demo-payment',
  6: 'core-api',
  7: 'admin app',
  8: 'admin mocks',
  9: 'shop mocks',
  10: 'contract tests',
  11: 'e2e',
  12: 'backend main',
  13: 'backend test',
  14: 'catalogue data and fixture',
  15: 'docs',
  16: 'other',
};

// Bucket roots, checked for existence up front; a missing one exits 2 (SKILL.md, "Find every consumer first").
// One entry per bucket id; each root is repo-root-relative.
const BUCKET_ROOTS = {
  1: [
    'contracts/commerce/openapi.yaml',
    'contracts/commerce/kommunikacio.md',
    'contracts/commerce/samples',
    'contracts/commerce/sequences',
  ],
  2: ['frontend/projects/shop-api/src/generated'],
  3: ['frontend/projects/admin/src/app/api/generated'],
  4: ['frontend/projects/storefront/src'],
  5: ['frontend/projects/demo-payment/src'],
  6: ['frontend/projects/core-api/src'],
  7: ['frontend/projects/admin/src'],
  8: ['frontend/projects/admin/src/mocks'],
  9: ['frontend/projects/shop-mocks/src'],
  10: ['frontend/tests/contract'],
  11: ['frontend/e2e', 'frontend/specs'],
  12: ['backend/services/commerce/src/main'],
  13: ['backend/services/commerce/src/test'],
  14: ['data/catalog', 'frontend/docs/api/fixtures'],
  15: ['backend/docs', 'frontend/docs'],
  // 16 (other) is the catch-all; it has no root of its own.
};

// Path classifiers in priority order (most specific first), so a path under
// two candidate roots (e.g. the admin generated client and admin mocks are
// both under the admin app tree) lands in the more specific bucket.
const PATH_CLASSIFIERS = [
  [1, (p) =>
    p === 'contracts/commerce/openapi.yaml' ||
    p === 'contracts/commerce/kommunikacio.md' ||
    p.startsWith('contracts/commerce/samples/') ||
    p.startsWith('contracts/commerce/sequences/')],
  [2, (p) => p.startsWith('frontend/projects/shop-api/src/generated/')],
  [3, (p) => p.startsWith('frontend/projects/admin/src/app/api/generated/')],
  [8, (p) => p.startsWith('frontend/projects/admin/src/mocks/')],
  [7, (p) => p.startsWith('frontend/projects/admin/src/')],
  [4, (p) => p.startsWith('frontend/projects/storefront/src/')],
  [5, (p) => p.startsWith('frontend/projects/demo-payment/src/')],
  [6, (p) => p.startsWith('frontend/projects/core-api/src/')],
  [9, (p) => p.startsWith('frontend/projects/shop-mocks/src/')],
  [10, (p) => p.startsWith('frontend/tests/contract/')],
  [11, (p) => p.startsWith('frontend/e2e/') || p.startsWith('frontend/specs/')],
  [12, (p) => p.startsWith('backend/services/commerce/src/main/')],
  [13, (p) => p.startsWith('backend/services/commerce/src/test/')],
  [14, (p) =>
    p.startsWith('data/catalog/') ||
    p.startsWith('frontend/docs/api/fixtures/')],
  [15, (p) => p.startsWith('backend/docs/') || p.startsWith('frontend/docs/')],
];

const CONTRACT_FILE = 'contracts/commerce/openapi.yaml';
const NOT_SEARCHED_FOOTER =
  'not searched: backend generated sources under ' +
  'backend/services/commerce/build/generated/openapi (untracked, regenerated by the build)';
const CANDIDATES_FOOTER =
  'hits are candidates: confirm each ' +
  '(a word match such as getCart also matches the entity getter CartItem.getCart)';
const OPERATION_PATH_MISS_FOOTER =
  'path search misses a URL assembled from a constant plus a suffix, or ending in a concatenated parameter';

function usageError(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function fatal(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// PascalCase/camelCase -> kebab-case, e.g. "PriceRange" -> "price-range",
// "getCart" -> "get-cart". Matches ng-openapi-gen's file naming.
function toKebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// camelCase property -> PascalCase accessor suffix, e.g. "amount" -> "Amount".
function toPascalCase(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function runGit(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // `git grep` exits 1 when it finds nothing; that is not a failure here.
    if (error.status === 1 && typeof error.stdout === 'string') {
      return error.stdout;
    }
    fatal(`git ${args.join(' ')} failed: ${error.message}`);
  }
}

function parseGrepOutput(output) {
  const hits = [];
  for (const line of output.split('\n')) {
    if (line === '') continue;
    const match = line.match(/^(.+?):(\d+):(.*)$/s);
    if (!match) continue;
    hits.push({ file: match[1], line: Number(match[2]), text: match[3] });
  }
  return hits;
}

function firstLine(repoRoot, relPath) {
  try {
    const content = readFileSync(join(repoRoot, relPath), 'utf8');
    const nl = content.indexOf('\n');
    return nl === -1 ? content : content.slice(0, nl);
  } catch {
    return '';
  }
}

function gitGrepWord(repoRoot, pattern, pathspecs) {
  const output = runGit(repoRoot, ['grep', '-n', '-I', '-w', '-F', '-e', pattern, '--', ...pathspecs]);
  return parseGrepOutput(output);
}

// POSIX ERE search (the operation path search and the schema models/<kebab> search).
function gitGrepEre(repoRoot, pattern, pathspecs) {
  const output = runGit(repoRoot, ['grep', '-n', '-I', '-E', '-e', pattern, '--', ...pathspecs]);
  return parseGrepOutput(output);
}

// Files whose content contains a literal string (the schema kind's barrel-import pass).
function gitGrepFilesContaining(repoRoot, literal, pathspecs) {
  const output = runGit(repoRoot, ['grep', '-l', '-I', '-F', '-e', literal, '--', ...pathspecs]);
  return output.split('\n').filter((line) => line !== '');
}

function gitLsFiles(repoRoot, patterns) {
  const output = runGit(repoRoot, ['ls-files', '--', ...patterns]);
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((file) => ({ file, line: 1, text: firstLine(repoRoot, file) }));
}

function checkBucketRoots(repoRoot) {
  for (const roots of Object.values(BUCKET_ROOTS)) {
    for (const root of roots) {
      if (!existsSync(join(repoRoot, root))) {
        fatal(`bucket root missing: ${root}; the layout changed, update the script`);
      }
    }
  }
}

// Every operation's {name, method, path}, derived by text parsing:
// walking upward from each operationId line, the nearest method line above
// it gives the method, and continuing upward from there, the nearest path
// line gives the path.
function parseOperations(content) {
  const lines = content.split('\n');
  const operations = [];
  for (let i = 0; i < lines.length; i++) {
    const idMatch = lines[i].match(OPERATION_ID_RE);
    if (!idMatch) continue;
    let method = null;
    let path = null;
    for (let j = i - 1; j >= 0; j--) {
      if (method === null) {
        const methodMatch = lines[j].match(METHOD_RE);
        if (methodMatch) method = methodMatch[1];
        continue;
      }
      const pathMatch = lines[j].match(PATH_RE);
      if (pathMatch) {
        path = pathMatch[1];
        break;
      }
    }
    operations.push({ name: idMatch[1], method, path });
  }
  return operations;
}

// The first `- url:` line after `servers:`, e.g. `/api/v1`.
function parseServerPrefix(content) {
  const lines = content.split('\n');
  let inServers = false;
  for (const line of lines) {
    if (SERVERS_RE.test(line)) {
      inServers = true;
      continue;
    }
    if (inServers) {
      const urlMatch = line.match(SERVER_URL_RE);
      if (urlMatch) return urlMatch[1];
    }
  }
  return null;
}

function deriveOperationPath(repoRoot, name) {
  const content = readFileSync(join(repoRoot, CONTRACT_FILE), 'utf8');
  const operations = parseOperations(content);
  const serverPrefix = parseServerPrefix(content);
  const target = operations.find((op) => op.name === name);
  if (!target || !target.method || !target.path || !serverPrefix) {
    fatal(`cannot derive the path of ${name} from ${CONTRACT_FILE}; the layout changed, update the script`);
  }
  return { target, operations, serverPrefix };
}

// POSIX ERE for `git grep -E` matching the operation's path in source, each
// {param} segment generalised. The path must be directly preceded by a quote,
// a backtick, or the server prefix, not by any non-identifier character or
// start of line, which keeps most prose out (SKILL.md, "Read it this way").
function buildPathPattern(path, serverPrefix) {
  const segments = path.split('/').filter((segment) => segment !== '');
  const parts = segments.map((segment) =>
    /^\{[^}]+\}$/.test(segment) ? PARAM_ALTERNATION : escapeRegExp(segment),
  );
  const prefix = `(['"${BACKTICK}]|${escapeRegExp(serverPrefix)})`;
  const suffix = '([^A-Za-z0-9_/-]|$)';
  return `${prefix}/${parts.join('/')}${suffix}`;
}

function checkMembership(repoRoot, kind, name) {
  const content = readFileSync(join(repoRoot, CONTRACT_FILE), 'utf8');
  const escaped = escapeRegExp(name);
  if (kind === 'schema') {
    const byRef = content.includes(`#/components/schemas/${name}`);
    const byKeyLine = new RegExp(`^ {4}${escaped}:\\s*$`, 'm').test(content);
    return byRef || byKeyLine;
  }
  if (kind === 'operation') {
    return new RegExp(`^\\s*operationId:\\s*${escaped}\\s*$`, 'm').test(content);
  }
  // property and enum: a whole word.
  return new RegExp(`\\b${escaped}\\b`).test(content);
}

function gatherHits(repoRoot, kind, name, operationInfo, wholeRepoPathspecs) {
  const hits = [];

  if (kind === 'schema') {
    hits.push(...gitGrepWord(repoRoot, name, ['contracts']));
    hits.push(...gitLsFiles(repoRoot, [
      `contracts/commerce/samples/${name}.json`,
      `contracts/commerce/samples/${name}.*.json`,
    ]));
    const kebab = toKebabCase(name);
    // ERE, not -w -F: a word boundary treats "-" as a boundary, so
    // models/cart would also match models/cart-item.
    hits.push(...gitGrepEre(repoRoot, `models/${kebab}['"]`, wholeRepoPathspecs));
    hits.push(...gitGrepWord(repoRoot, `api.model.${name};`, wholeRepoPathspecs));
    // Barrel pass: a file that imports the models barrel names no
    // per-model path, so it is invisible to the search above.
    const barrelFiles = gitGrepFilesContaining(
      repoRoot,
      "from '@mi-bolt/api/models'",
      wholeRepoPathspecs,
    );
    if (barrelFiles.length > 0) {
      hits.push(...gitGrepWord(repoRoot, name, barrelFiles));
    }
  } else if (kind === 'operation') {
    const nameHits = gitGrepWord(repoRoot, name, wholeRepoPathspecs);
    const kebab = toKebabCase(name);
    nameHits.push(...gitLsFiles(repoRoot, [`*/fn/*/${kebab}.ts`]));
    hits.push(...nameHits);

    // Path search: the shop mocks, admin mocks, contract suite's own
    // handlers and backend API tests address an operation by method and URL,
    // rarely by name, so the name search alone misses them.
    const pattern = buildPathPattern(operationInfo.target.path, operationInfo.serverPrefix);
    const pathHits = gitGrepEre(repoRoot, pattern, wholeRepoPathspecs);
    const nameKeys = new Set(nameHits.map((hit) => `${hit.file}:${hit.line}`));
    for (const hit of pathHits) {
      const key = `${hit.file}:${hit.line}`;
      if (nameKeys.has(key)) continue;
      nameKeys.add(key);
      hits.push({ ...hit, pathOnly: true });
    }
  } else if (kind === 'property') {
    const pascal = toPascalCase(name);
    hits.push(...gitGrepWord(repoRoot, name, wholeRepoPathspecs));
    hits.push(...gitGrepWord(repoRoot, `get${pascal}`, wholeRepoPathspecs));
    hits.push(...gitGrepWord(repoRoot, `set${pascal}`, wholeRepoPathspecs));
  } else if (kind === 'enum') {
    hits.push(...gitGrepWord(repoRoot, name, wholeRepoPathspecs));
    const upper = name.toUpperCase();
    const lower = name.toLowerCase();
    if (upper !== name) hits.push(...gitGrepWord(repoRoot, upper, wholeRepoPathspecs));
    if (lower !== name) hits.push(...gitGrepWord(repoRoot, lower, wholeRepoPathspecs));
  }

  const seen = new Set();
  const deduped = [];
  for (const hit of hits) {
    const key = `${hit.file}:${hit.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(hit);
  }
  return deduped;
}

function classify(file, skillsDirPrefix) {
  if (file.startsWith(`${skillsDirPrefix}/`)) return null;
  for (const [id, test] of PATH_CLASSIFIERS) {
    if (test(file)) return id;
  }
  return 16;
}

function bucketHits(hits, skillsDirPrefix) {
  const buckets = new Map();
  for (let id = 1; id <= 16; id++) buckets.set(id, []);
  for (const hit of hits) {
    const id = classify(hit.file, skillsDirPrefix);
    if (id === null) continue;
    buckets.get(id).push(hit);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  }
  return buckets;
}

function report(buckets, kind, operationInfo) {
  const lines = [];
  if (kind === 'operation') {
    const { target, operations, serverPrefix } = operationInfo;
    lines.push(
      `operation: ${target.method.toUpperCase()} ${target.path} ` +
        `(path also searched, each {param} generalised, directly behind a quote, a backtick or ${serverPrefix})`,
    );
    const shared = operations.filter((op) => op.path === target.path && op.name !== target.name);
    if (shared.length > 0) {
      lines.push(
        `path shared with: ${shared.map((op) => `${op.method.toUpperCase()} ${op.name}`).join(', ')}`,
      );
    }
  }
  const emptyLabels = [];
  for (let id = 1; id <= 16; id++) {
    const hits = buckets.get(id);
    const label = BUCKET_LABELS[id];
    if (hits.length === 0) {
      emptyLabels.push(`${id}. ${label}`);
      continue;
    }
    lines.push(`${id}. ${label} (${hits.length})`);
    for (const hit of hits) {
      const text = hit.text.length > 160 ? hit.text.slice(0, 160) : hit.text;
      const marker = hit.pathOnly ? '[path] ' : '';
      lines.push(`  ${hit.file}:${hit.line}: ${marker}${text}`);
    }
  }
  lines.push('');
  lines.push(`empty buckets: ${emptyLabels.length ? emptyLabels.join(', ') : 'none'}`);
  lines.push(NOT_SEARCHED_FOOTER);
  if (kind === 'operation') {
    lines.push(OPERATION_PATH_MISS_FOOTER);
  }
  lines.push(CANDIDATES_FOOTER);
  process.stdout.write(lines.join('\n') + '\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 3 || argv[0] !== '--kind') {
    usageError(
      'usage: find-contract-consumers.mjs --kind schema|property|enum|operation <Name>',
    );
  }
  const [, kind, name] = argv;
  if (!VALID_KINDS.includes(kind)) {
    usageError(`--kind must be one of ${VALID_KINDS.join('|')}, got: ${kind}`);
  }
  if (!NAME_PATTERN.test(name)) {
    usageError(`<Name> must match ${NAME_PATTERN}, got: ${name}`);
  }

  // Run from the repo root (prerequisite); bucket roots and the contract
  // file are resolved relative to it. Kept as process.cwd() rather than
  // `git rev-parse --show-toplevel` so the only git subcommands this script
  // ever runs are `grep` and `ls-files`, per the read-only guarantee above.
  const repoRoot = process.cwd();
  if (!existsSync(join(repoRoot, '.git'))) {
    fatal(`not a git checkout: ${repoRoot} has no .git; run this from the repo root`);
  }

  // The top-level directory that holds the skills root, so a repo-wide
  // search excludes a sibling skill's own draft text wherever that directory
  // sits.
  const skillsDirPrefix = path.relative(repoRoot, SKILLS_ROOT).split(path.sep)[0];
  const wholeRepoPathspecs = ['.', `:!${skillsDirPrefix}`];

  checkBucketRoots(repoRoot);

  if (!checkMembership(repoRoot, kind, name)) {
    process.stderr.write(
      `${name} is not in the contract as kind ${kind}; for a new one, use an existing sibling as the template (references/contract-change-chain.md)\n`,
    );
    process.exitCode = 1;
    return;
  }

  const operationInfo = kind === 'operation' ? deriveOperationPath(repoRoot, name) : null;

  const hits = gatherHits(repoRoot, kind, name, operationInfo, wholeRepoPathspecs);
  const buckets = bucketHits(hits, skillsDirPrefix);
  report(buckets, kind, operationInfo);
  process.exitCode = 0;
}

main();
