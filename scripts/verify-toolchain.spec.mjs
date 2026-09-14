// verify-toolchain.spec.mjs — T00-AC01/02/03 test surface.
//
// Runs under the built-in `node:test` runner via `node --test
// scripts/*.spec.mjs`. The verify-toolchain.mjs script exports the
// pure validation entrypoint so each test can drive it with focused
// sample data; the end-to-end "actual package.json" check spawns the
// CLI to exercise the same code path the orchestrator will run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  validateToolchain,
  checkNodeEngines,
} from './verify-toolchain.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'verify-toolchain.mjs');

const ANGULAR_ENGINES = { node: '^22.22.3 || ^24.15.0 || >=26.0.0' };

test('verify-toolchain: rejects prerelease tag in declared version', () => {
  const items = [
    {
      package: '@angular/core',
      declaredVersion: '22.0.0-rc.0',
      resolvedVersion: '22.0.0-rc.0',
      peerDependencies: {},
      engines: ANGULAR_ENGINES,
    },
  ];
  const result = validateToolchain(items);
  assert.equal(result.ok, false);
  assert.equal(result.summary, 'toolchain:FAIL');
  assert.ok(
    result.errors.some((e) => e.kind === 'prerelease-declared'),
    `expected a prerelease-declared error, got ${JSON.stringify(result.errors)}`,
  );
});

test('verify-toolchain: rejects typescript version that does not exist on npm', () => {
  const items = [
    {
      package: 'typescript',
      declaredVersion: '~6.0.2',
      resolvedVersion: null,
      peerDependencies: null,
      engines: null,
    },
  ];
  const result = validateToolchain(items);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.kind === 'typescript-not-on-npm'),
    `expected a typescript-not-on-npm error, got ${JSON.stringify(result.errors)}`,
  );
});

test('verify-toolchain: accepts the actual package.json declaration', () => {
  const result = spawnSync('node', [SCRIPT], {
    encoding: 'utf8',
    cwd: resolve(__dirname, '..'),
  });
  if (result.status !== 0) {
    process.stderr.write(`stdout:\n${result.stdout}\n`);
    process.stderr.write(`stderr:\n${result.stderr}\n`);
  }
  assert.equal(
    result.status,
    0,
    `verify-toolchain.mjs must exit 0 against the actual package.json`,
  );
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary, 'toolchain:OK');
  assert.equal(Array.isArray(payload.errors), true);
  assert.equal(payload.errors.length, 0);
});

test('checkNodeEngines: rejects ^10.0.0 only on Node 26', () => {
  const result = checkNodeEngines({ node: '^10.0.0' }, 26);
  assert.equal(result.ok, false);
  assert.match(
    result.reason,
    /node engines ".*" does not accept Node 26/,
    `expected rejection reason, got ${JSON.stringify(result)}`,
  );
});

test('checkNodeEngines: accepts ^22.0.0 || ^24.0.0 || >=26.0.0 on Node 26', () => {
  const result = checkNodeEngines(
    { node: '^22.0.0 || ^24.0.0 || >=26.0.0' },
    26,
  );
  assert.equal(result.ok, true);
});

test('checkNodeEngines: rejects ^22.0.0 || ^24.0.0 (no >=26 disjunct) on Node 26', () => {
  const result = checkNodeEngines(
    { node: '^22.0.0 || ^24.0.0' },
    26,
  );
  assert.equal(result.ok, false);
  assert.match(
    result.reason,
    /node engines ".*" does not accept Node 26/,
    `expected rejection reason, got ${JSON.stringify(result)}`,
  );
});

test('validateToolchain: rejects typescript resolvedVersion outside Angular 22 peer range', () => {
  const items = [
    {
      package: 'typescript',
      declaredVersion: '~5.5.0',
      resolvedVersion: '5.5.0',
      peerDependencies: null,
      engines: null,
    },
  ];
  const result = validateToolchain(items, {
    typescriptPeerRange: '>=6.0 <6.1',
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (e) => e.kind === 'typescript-peer-range-violation',
    ),
    `expected a typescript-peer-range-violation error, got ${JSON.stringify(result.errors)}`,
  );
});