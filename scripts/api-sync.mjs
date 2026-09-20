#!/usr/bin/env node
// scripts/api-sync.mjs — pull the backend contract and regenerate the SDK.
//
// The wire contract's source of truth is the backend repository's
// `api/openapi.yaml`. `npm run api:generate` regenerates the SDK from the
// file at `docs/api/openapi.yaml`; `npm run api:drift` guards that the
// committed SDK matches the committed contract. This script keeps the
// committed contract in step with the backend: it downloads the file at
// a pinnable ref through `gh api` and writes it into `docs/api/` before
// the generator runs. `--dry-run` only prints the source sha and size,
// so the consumer rewrite stays in the next unit.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OWNER = 'mimukodik';
const REPO = 'mi-bolt-backend';
const REMOTE_PATH = 'api/openapi.yaml';
const LOCAL_PATH = 'docs/api/openapi.yaml';
const USAGE = 'usage: node scripts/api-sync.mjs [--ref <ref>] [--dry-run]';

const args = process.argv.slice(2);
let ref = 'main';
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--ref') {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      process.stderr.write(`${USAGE}\n`);
      process.exit(2);
    }
    ref = value;
    i++;
    continue;
  }
  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

const metadataPath = `repos/${OWNER}/${REPO}/contents/${REMOTE_PATH}?ref=${encodeURIComponent(ref)}`;

let metadata;
try {
  const stdout = execFileSync('gh', ['api', metadataPath], { encoding: 'utf8' });
  metadata = JSON.parse(stdout);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`api-sync: gh api failed: ${message}\n`);
  process.exit(
    typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
      ? error.status
      : 1,
  );
}

if (
  typeof metadata !== 'object' ||
  metadata === null ||
  typeof metadata.sha !== 'string' ||
  typeof metadata.size !== 'number'
) {
  process.stderr.write('api-sync: unexpected body\n');
  process.exit(1);
}

process.stdout.write(
  `api-sync: ${OWNER}/${REPO}@${ref} ${REMOTE_PATH} sha=${metadata.sha} size=${metadata.size}\n`,
);

if (dryRun) {
  process.exit(0);
}

let body;
try {
  body = execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github.raw', metadataPath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`api-sync: gh api failed: ${message}\n`);
  process.exit(
    typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
      ? error.status
      : 1,
  );
}

if (!body.startsWith('openapi:')) {
  process.stderr.write('api-sync: unexpected body\n');
  process.exit(1);
}

writeFileSync(LOCAL_PATH, body);
process.stdout.write(`api-sync: wrote ${LOCAL_PATH}\n`);

try {
  execFileSync('npm', ['run', 'api:generate'], { stdio: 'inherit' });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`api-sync: npm run api:generate failed: ${message}\n`);
  process.exit(
    typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
      ? error.status
      : 1,
  );
}
process.stdout.write('api-sync: regenerated src/app/api/generated\n');
