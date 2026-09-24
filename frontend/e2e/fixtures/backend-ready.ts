// Global setup of the `smoke` project (playwright.config.ts, E2E_TARGET=local-backend).
// The smoke specs drive the real backend, so the run stops before the first
// test, naming the URL, when that backend is not ready, rather than passing
// silently or timing out inside a test (MIM-270).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullConfig } from '@playwright/test';

const READINESS_PATH = '/api/v1/actuator/health/readiness';

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

export default async function backendReady(config: FullConfig): Promise<void> {
  const url = readinessUrl(config);
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error: unknown) {
    throw new Error(
      `Smoke needs the real backend, but ${url} did not answer (${String(error)}). ` +
        'Start it first: mise run dev:docker, or mise run stack with E2E_BASE_URL=http://localhost:4200.',
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(`Smoke needs a ready backend, but ${url} answered ${String(response.status)}.`);
  }
}
