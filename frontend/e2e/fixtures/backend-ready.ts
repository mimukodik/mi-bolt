// Global setup of the `smoke` project (playwright.config.ts, E2E_TARGET=local-backend).
// The smoke specs drive the real backend, so the run stops before the first
// test, naming the URL, when that backend is not ready, rather than passing
// silently or timing out inside a test (MIM-270).
// Once the backend is ready it signs in to the demo access gate (MIM-423) and
// saves the cookie as the smoke project's storage state, because every shop
// call except the sign-in answers 401 without it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { request, type FullConfig } from '@playwright/test';

const READINESS_PATH = '/api/v1/actuator/health/readiness';
// Node's fetch has no default timeout; a hung backend (TCP accepts but no
// HTTP reply) would block globalSetup forever. 30 s mirrors the webServer
// readiness budget at this layer.
const READINESS_TIMEOUT_MS = 30_000;
const DEMO_SESSION_PATH = '/api/v1/demo/session';
// The demo password deploy/compose.yaml gives the backend unless
// MIBOLT_DEMO_PASSWORD overrides it (MIM-423); it is not a secret.
const DEFAULT_DEMO_PASSWORD = '1MiBoltDemo1';

/** The smoke project's storage state: the signed-in demo cookie (playwright.config.ts). */
export const DEMO_STORAGE_STATE = join(__dirname, '..', '.auth', 'demo-access.json');

interface ProxyEntry {
  readonly target: string;
}

function isProxyEntry(value: unknown): value is ProxyEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'target' in value &&
    typeof value.target === 'string'
  );
}

/**
 * The URL that answers ready when the smoke's backend is up: under
 * E2E_BASE_URL the app that is already serving (its /api reaches the
 * backend), otherwise the backend the local-backend dev server proxies /api
 * to (proxy.local-backend.conf.json beside the config file).
 */
export function readinessUrl(config: Pick<FullConfig, 'configFile'>): string {
  const supplied = process.env['E2E_BASE_URL'];
  if (supplied !== undefined && supplied !== '') {
    return new URL(READINESS_PATH, supplied).toString();
  }
  if (config.configFile === undefined || config.configFile === '') {
    throw new Error(
      'backend-ready: no config file, so proxy.local-backend.conf.json cannot be found',
    );
  }
  const proxyFile = join(dirname(config.configFile), 'proxy.local-backend.conf.json');
  const proxy: unknown = JSON.parse(readFileSync(proxyFile, 'utf8'));
  const entry: unknown =
    typeof proxy === 'object' && proxy !== null && '/api' in proxy ? proxy['/api'] : undefined;
  if (!isProxyEntry(entry)) {
    throw new Error(`backend-ready: ${proxyFile} has no "/api" entry with a "target"`);
  }
  return new URL(READINESS_PATH, entry.target).toString();
}

/**
 * Signs in to the demo access gate (MIM-423) on the origin that answered
 * ready and saves the cookie to DEMO_STORAGE_STATE. The cookie is Secure;
 * Chromium still sends it to http://localhost, and cookies ignore the port,
 * so one got from the backend also serves the local dev server.
 */
async function saveDemoAccess(readiness: string): Promise<void> {
  const url = new URL(DEMO_SESSION_PATH, readiness).toString();
  const supplied = process.env['MIBOLT_DEMO_PASSWORD'];
  const password = supplied !== undefined && supplied !== '' ? supplied : DEFAULT_DEMO_PASSWORD;
  const context = await request.newContext();
  try {
    const response = await context.post(url, { data: { password } });
    if (response.status() !== 204) {
      throw new Error(
        `Smoke needs the demo sign-in, but POST ${url} answered ${String(response.status())}.`,
      );
    }
    await context.storageState({ path: DEMO_STORAGE_STATE });
  } finally {
    await context.dispose();
  }
}

export default async function backendReady(config: FullConfig): Promise<void> {
  const url = readinessUrl(config);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), READINESS_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error: unknown) {
    throw new Error(
      `Smoke needs the real backend, but ${url} did not answer (${String(error)}). ` +
        'Start it first: mise run dev:docker, or mise run stack with E2E_BASE_URL=http://localhost:4200.',
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    // Drain the body so the connection returns to the pool; the response is
    // not read on either branch otherwise.
    await response.arrayBuffer().catch(() => undefined);
    throw new Error(`Smoke needs a ready backend, but ${url} answered ${String(response.status)}.`);
  }
  await saveDemoAccess(url);
}
