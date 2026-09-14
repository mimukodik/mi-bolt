// verify-skill-evidence.spec.mjs — T00-AC03 test surface.
//
// Runs under the built-in `node:test` runner via `node --test
// scripts/*.spec.mjs`. The verify-skill-evidence.mjs script exports
// validateSkillEvidence with override hooks so each test can mutate a
// single aspect of the resolved manifest (sha256, version, references)
// and observe the corresponding failure; the end-to-end "actual
// skill-location.json" check spawns the CLI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  validateSkillEvidence,
  parseMetadataVersion,
  parseFrontmatter,
} from './verify-skill-evidence.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'verify-skill-evidence.mjs');
const SKILL_LOCATION = resolve(
  __dirname,
  '..',
  'docs/mi-bolt/execution/skill-location.json',
);
const REPO_ROOT = resolve(__dirname, '..');

function makeSkillFixture({ sha256, version, omitRefs = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'skill-fixture-'));
  const skillMd = `---
name: mi-bolt-design
metadata:
  version: "${version ?? '1.0.1'}"
---
stub`;
  const sha = sha256 ?? 'computed-stub';
  const refsDir = join(dir, 'references');
  mkdirSync(refsDir, { recursive: true });
  for (const ref of [
    '01-visual-foundation.md',
    '02-components.md',
    '03-page-recipes.md',
    '04-content-commerce.md',
    '05-accessibility-responsive.md',
    '06-workflow-validation.md',
    '07-source-notes.md',
  ]) {
    if (!omitRefs.includes(ref)) {
      writeFileSync(join(refsDir, ref), '# stub');
    }
  }
  const locationPath = join(dir, 'skill-location.json');
  writeFileSync(
    locationPath,
    JSON.stringify(
      {
        skill: 'mi-bolt-design',
        approvedVersion: '1.0.1',
        resolvedVersion: '1.0.1',
        entry: join(dir, 'SKILL.md'),
        root: dir,
        sha256: { 'SKILL.md': sha },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, 'SKILL.md'), skillMd);
  return { dir, locationPath, sha, version: version ?? '1.0.1' };
}

test('verify-skill-evidence: rejects when sha256 mismatches', async () => {
  const { dir, locationPath, sha } = makeSkillFixture({
    sha256: 'a'.repeat(64),
  });
  try {
    const result = await validateSkillEvidence({
      skillLocationPath: locationPath,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.kind === 'sha256-mismatch'),
      `expected a sha256-mismatch error, got ${JSON.stringify(result.errors)}`,
    );
    const mismatch = result.errors.find((e) => e.kind === 'sha256-mismatch');
    assert.equal(mismatch.declared, 'a'.repeat(64));
    assert.equal(typeof mismatch.computed, 'string');
    assert.equal(mismatch.computed.length, 64);
    assert.notEqual(mismatch.computed, sha);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify-skill-evidence: rejects when metadata.version differs from approvedVersion', async () => {
  const { dir, locationPath } = makeSkillFixture({ version: '1.0.0' });
  try {
    const result = await validateSkillEvidence({
      skillLocationPath: locationPath,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.kind === 'version-mismatch'),
      `expected a version-mismatch error, got ${JSON.stringify(result.errors)}`,
    );
    const mismatch = result.errors.find((e) => e.kind === 'version-mismatch');
    assert.equal(mismatch.declared, '1.0.1');
    assert.equal(mismatch.found, '1.0.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify-skill-evidence: rejects when a required reference file is missing', async () => {
  const { dir, locationPath } = makeSkillFixture({
    omitRefs: ['04-content-commerce.md'],
  });
  try {
    const result = await validateSkillEvidence({
      skillLocationPath: locationPath,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.kind === 'reference-file-missing'),
      `expected a reference-file-missing error, got ${JSON.stringify(result.errors)}`,
    );
    const missing = result.errors.find(
      (e) => e.kind === 'reference-file-missing',
    );
    assert.equal(missing.file, '04-content-commerce.md');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify-skill-evidence: accepts the actual skill-location.json', () => {
  const result = spawnSync('node', [SCRIPT, SKILL_LOCATION], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  if (result.status !== 0) {
    process.stderr.write(`stdout:\n${result.stdout}\n`);
    process.stderr.write(`stderr:\n${result.stderr}\n`);
  }
  assert.equal(
    result.status,
    0,
    'verify-skill-evidence.mjs must exit 0 against the actual skill-location.json',
  );
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary, 'skill:OK');
  assert.equal(payload.errors.length, 0);
});

test('parseMetadataVersion extracts version from indented metadata block', () => {
  const yaml = `name: mi-bolt-design
metadata:
  version: "1.0.1"
  language: "en"
`;
  assert.equal(parseMetadataVersion(yaml), '1.0.1');
});

test('parseFrontmatter returns null when the file lacks frontmatter', () => {
  assert.equal(parseFrontmatter('no frontmatter here'), null);
});