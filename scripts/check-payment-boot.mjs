#!/usr/bin/env node
/**
 * Boots the demo-payment application under `ng serve` and asserts that the
 * mock service-worker script is served at the app's own base path. This is
 * the gate MIM-254 adds: the `demo-payment` project had no `assets` entry
 * in `angular.json`, so the MSW worker bundle was never copied into
 * `dist/demo-payment/**`, and `src/mocks/browser.ts` hard-coded a
 * root-absolute URL that the dev server's base-path middleware 404s.
 *
 * A unit test cannot catch either: jsdom has no Service Worker, the
 * production build skips MSW behind `isDevMode()`, and the failure lives
 * in the dev server's asset and base-path handling — not in any code the
 * test suite imports. Port 4299 is this script's alone and is outside the
 * ranges the workspace reserves for runners and browser verification.
 *
 * Exit code:
 *   0  - the worker bundle is served at the app's base path and the index
 *        page answers with a 200
 *   1  - the dev server did not come up in time, or one of the two
 *        fetches returned an unexpected status / content type
 */
import { spawn } from 'node:child_process';

const PORT = 4299;
const BASE_PATH = '/demo-fizetes';
const SERVE_URL = `http://localhost:${PORT}${BASE_PATH}`;
const WORKER_URL = `${SERVE_URL}/mockServiceWorker.js`;
const READY_TIMEOUT_MS = 180_000;
const READY_MARKER = 'Local:';

class GateFailure extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'GateFailure';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function startServe() {
  return spawn('npx', ['ng', 'serve', 'demo-payment', '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForReady(child) {
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (stdout.includes(READY_MARKER) || stderr.includes(READY_MARKER)) {
      return;
    }
    if (child.exitCode !== null) {
      throw new GateFailure(
        `ng serve exited before becoming ready (exit ${child.exitCode}).\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
      );
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
  throw new GateFailure(
    `ng serve did not become ready within ${READY_TIMEOUT_MS / 1000}s.\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
  );
}

async function assertOk(url, { requireContentType } = {}) {
  const res = await fetch(url);
  if (res.status !== 200) {
    throw new GateFailure(`expected 200 for ${url}, got ${res.status}`);
  }
  if (requireContentType) {
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes(requireContentType)) {
      throw new GateFailure(
        `expected content-type of ${url} to include "${requireContentType}", got "${contentType}"`,
      );
    }
  }
}

function killChild(child) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 5_000);
  });
}

async function main() {
  const child = startServe();
  try {
    await waitForReady(child);
    await assertOk(WORKER_URL, { requireContentType: 'javascript' });
    await assertOk(SERVE_URL);
    process.stdout.write('check-payment-boot: OK\n');
  } catch (error) {
    if (error instanceof GateFailure) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(`check-payment-boot: ${error.stack ?? error}\n`);
    }
    process.exitCode = 1;
  } finally {
    await killChild(child);
  }
}

main();
