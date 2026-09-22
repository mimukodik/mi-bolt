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
 *
 * The four ceilings below (FETCH_TIMEOUT_MS, KILL_GRACE_MS,
 * KILL_CEILING_MS, TOTAL_BUDGET_MS) are safety nets rather than gates: on
 * three measured green runs the whole `Production build` job took 27-30
 * seconds end to end, so every one of them is at least an order of
 * magnitude above anything the healthy path needs, and none of them can
 * fail a run that is working.
 */
import { spawn } from 'node:child_process';

const PORT = 4299;
const BASE_PATH = '/demo-fizetes';
const SERVE_URL = `http://localhost:${PORT}${BASE_PATH}`;
const WORKER_URL = `${SERVE_URL}/mockServiceWorker.js`;
const READY_TIMEOUT_MS = 180_000; // orchestrator's choice: ceiling on the dev-server startup wait.
// FETCH_TIMEOUT_MS bounds every fetch; a dev server that accepts the TCP connection
// and never answers would otherwise leave a promise pending forever.
const FETCH_TIMEOUT_MS = 30_000;
// KILL_GRACE_MS is how long we wait between SIGTERM and SIGKILL when stopping ng serve.
const KILL_GRACE_MS = 5_000;
// KILL_CEILING_MS is the absolute upper bound on how long killChild will wait.
const KILL_CEILING_MS = 10_000;
// TOTAL_BUDGET_MS bounds the whole script run; set under the CI step timeout
// (commit 2 of this unit raises it to 6 minutes) so the script reports its
// own failure instead of being killed from outside with no message.
const TOTAL_BUDGET_MS = 300_000;
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
    // `npx` forks the real Angular CLI server as its own child, so the
    // process group is what we signal on shutdown — see killChild.
    detached: true,
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
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new GateFailure(
      `request to ${url} did not answer within ${FETCH_TIMEOUT_MS / 1000} seconds`,
      { cause: error },
    );
  }
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
  if (child.exitCode !== null || child.pid === undefined) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let killTimer;
    let ceilingTimer;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(ceilingTimer);
      resolve();
    };
    child.once('exit', finish);
    // `npx` forks the real server as its own child, so `child.kill('SIGTERM')`
    // signals `npx` and not the server. Signal the whole process group with the
    // negated pid; swallow the error if the group is already gone.
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      finish();
      return;
    }
    killTimer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Group is already gone.
      }
    }, KILL_GRACE_MS);
    ceilingTimer = setTimeout(finish, KILL_CEILING_MS);
  });
}

async function main() {
  // Total-run budget. Deliberately under the CI step timeout added in the
  // commit alongside this one, so the script reports its own failure with
  // a message instead of being killed from outside with none.
  const budgetTimer = setTimeout(() => {
    process.stderr.write(
      `check-payment-boot: total budget of ${TOTAL_BUDGET_MS / 1000} seconds reached, exiting\n`,
    );
    process.exit(1);
  }, TOTAL_BUDGET_MS);
  const child = startServe();
  try {
    await waitForReady(child);
    process.stdout.write(`checking ${WORKER_URL}\n`);
    await assertOk(WORKER_URL, { requireContentType: 'javascript' });
    process.stdout.write(`checking ${SERVE_URL}\n`);
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
    clearTimeout(budgetTimer);
  }
}

main();