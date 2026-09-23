#!/usr/bin/env node
/**
 * Boots an Angular application under `ng serve` and asserts that the mock
 * service-worker script is served at the app's own base path. This is the
 * gate MIM-254 adds: the `demo-payment` project had no `assets` entry in
 * `angular.json`, so the MSW worker bundle was never copied into
 * `dist/demo-payment/**`, and `src/mocks/browser.ts` hard-coded a
 * root-absolute URL that the dev server's base-path middleware 404s. MIM-332
 * (unit F5) reuses the same gate for the `admin` project via `--project` and
 * `--base-path`, since the failure mode — an `assets` entry missing from the
 * project's build configuration — is the same one for any project with a
 * non-root base path.
 *
 * A unit test cannot catch either: jsdom has no Service Worker, the
 * production build skips MSW behind `isDevMode()`, and the failure lives
 * in the dev server's asset and base-path handling — not in any code the
 * test suite imports. Port 4299 is this script's alone and is outside the
 * ranges the workspace reserves for runners and browser verification; both
 * the `demo-payment` and `admin` runs use it, sequentially, never at once.
 *
 * Usage: node scripts/check-payment-boot.mjs [--project <name>] [--base-path <path>]
 *   --project    ng serve project name (default: demo-payment)
 *   --base-path  the app's served base path (default: /demo-fizetes)
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
import { writeSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    project: { type: 'string', default: 'demo-payment' },
    'base-path': { type: 'string', default: '/demo-fizetes' },
  },
});

const PORT = 4299;
const PROJECT = args.project;
const BASE_PATH = args['base-path'];
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
  return spawn('npx', ['ng', 'serve', PROJECT, '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // Ask the CLI for uncoloured output so the ready marker is byte-stable
    // across CI and local runs; stripAnsi above is what makes the gate
    // correct whether or not the CLI honours it.
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    // `npx` forks the real Angular CLI server as its own child, so the
    // process group is what we signal on shutdown — see killChild.
    detached: true,
  });
}

// The Angular CLI colours its "Local:" line when it detects CI, which puts an
// escape sequence between `Local` and the colon, so a match against the raw
// bytes can never succeed there while it succeeds on an uncoloured local run.
// Matching against the stripped text compares what a person sees.
const ANSI_PATTERN = /\u001B\[[0-9;]*[A-Za-z]/g;

function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, '');
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
    if (stripAnsi(stdout).includes(READY_MARKER) || stripAnsi(stderr).includes(READY_MARKER)) {
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
    // writeSync so the message reaches stderr before we exit; process.stderr.write
    // is async on pipes and `process.exit` does not flush it.
    try {
      writeSync(
        process.stderr.fd,
        `check-payment-boot: total budget of ${TOTAL_BUDGET_MS / 1000} seconds reached, exiting\n`,
      );
    } catch {
      // stderr closed; nothing to report.
    }
    // process.exit skips the async finally block, so kill the dev server
    // synchronously first. With detached: true, the child is a process group
    // leader, so signal the group; nothing else cleans up after we exit.
    if (child.pid !== undefined && child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Group already gone or not permitted; nothing we can do before exit.
      }
    }
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
