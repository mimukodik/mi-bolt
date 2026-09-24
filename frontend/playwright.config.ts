import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import type { CoverageResults, V8CoverageEntry } from 'monocart-coverage-reports';
import { DEMO_STORAGE_STATE } from './e2e/fixtures/backend-ready';

// Resolved from this file's own location, not the cwd: `-c <path>` runs and
// IDE runs start Playwright from other directories.
const configDir = __dirname;

// Default port 4400 (or 4410 for the local-backend smoke config) is chosen to
// avoid collision with the regular dev server on 4200 and the demo-payment
// dev server on 4210. E2E_PORT overrides the default for a second or third
// worktree running at the same time. E2E_BASE_URL points a run at an app that
// is already serving, such as the container stack (`mise run stack`, web on
// 4200) or a preview deployment, and then no server is started for it.
const smoke = process.env['E2E_TARGET'] === 'local-backend';
const port = Number(process.env['E2E_PORT'] ?? (smoke ? 4410 : 4400));
const serveConfiguration = smoke ? 'local-backend' : 'development';
// Treat E2E_BASE_URL="" the same as unset everywhere it is read below: an
// empty string passed through as a URL would break baseURL (and downstream
// `new URL(...)` calls), while `=== undefined` would still skip the
// webServer, leaving the two halves of the config disagreeing.
const suppliedBaseURL = process.env['E2E_BASE_URL'] || undefined;
const baseURL = suppliedBaseURL ?? `http://localhost:${port}`;
const ngServeCommand = `npx ng serve storefront --configuration ${serveConfiguration} --port ${port}`;
// In CI, Playwright runs against the built app served by scripts/serve-static.mjs (user, 2026-09-22).
// The smoke config keeps `ng serve` in CI because its /api proxy lives in the dev server.
// env: { [key: string]: string; }  (playwright/types/test.d.ts:10993)
const webServer =
  smoke || !process.env['CI']
    ? {
        command: ngServeCommand,
        url: baseURL,
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      }
    : {
        command: 'node scripts/serve-static.mjs',
        env: {
          PORT: String(port),
          MI_BOLT_E2E_STATIC_DIR: 'dist/storefront/browser',
        },
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      };

// The e2e gate uses the unit thresholds, read from angular.json so the two
// never drift (owner, 2026-09-22: the threshold lives in configuration, not in a script).
const angularJson = JSON.parse(readFileSync(join(configDir, 'angular.json'), 'utf8')) as {
  projects: {
    storefront: {
      architect: { test: { options: { coverageThresholds: Record<string, number | boolean> } } };
    };
  };
};
const unitThresholds = angularJson.projects['storefront'].architect.test.options.coverageThresholds;
const thresholds: Record<'statements' | 'branches' | 'functions' | 'lines', number> = (
  ['statements', 'branches', 'functions', 'lines'] as const
).reduce(
  (acc, key) => {
    const raw = unitThresholds[key];
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(
        `playwright.config.ts: angular.json coverageThresholds.${key} is ${String(raw)} (must be a finite number)`,
      );
    }
    acc[key] = value;
    return acc;
  },
  {} as Record<'statements' | 'branches' | 'functions' | 'lines', number>,
);

/** True when at least one *.spec.ts exists under `dir`, recursively. */
function hasSpec(dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (hasSpec(join(dir, entry.name))) return true;
    } else if (entry.name.endsWith('.spec.ts')) {
      return true;
    }
  }
  return false;
}
// The gate arms only for a run that collects coverage (E2E_COVERAGE_GATE=1: the
// Chromium projects; Firefox and WebKit collect none, e2e/fixtures/coverage.ts)
// and only once e2e/integration holds a spec; the seed alone is not the suite.
const gated =
  process.env['E2E_COVERAGE_GATE'] === '1' && hasSpec(join(configDir, 'e2e/integration'));
const skipReason = 'e2e coverage gate skipped: no spec under e2e/integration yet';

const fullHd = { viewport: { width: 1920, height: 1080 } };
// Playwright's Firefox does not support isMobile (docs/api/class-testoptions#test-options-is-mobile), so the
// Firefox mobile project is viewport-only.
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const mobileFirefox = { viewport: { width: 390, height: 844 }, hasTouch: true };
const integration = (name: string, use: Record<string, unknown>) => ({
  name: `integration-${name}`,
  testDir: './e2e/integration',
  use,
});

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The four values below are Playwright's own recommended CI block:
  // https://playwright.dev/docs/test-configuration (read 2026-09-22).
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    ...(process.env['CI'] ? [['blob'] as const] : []),
    ['list'],
    ['html', { open: 'never' }],
    [
      'monocart-reporter',
      {
        name: 'MiBolt e2e coverage',
        outputFile: './coverage/e2e/index.html',
        coverage: {
          // Coverage is collected here and gated by the onEnd hook below (the e2e npm
          // script no longer chains a separate script). Thresholds are read from
          // angular.json so the two coverage gates never drift.
          entryFilter: (entry: V8CoverageEntry) =>
            entry.url.includes('/main') || entry.url.includes('/chunk-'),
          // The shop SDK is generated into `projects/shop-api/src/generated/`,
          // outside the storefront source, so it never reaches this filter.
          sourceFilter: (sourcePath: string) => sourcePath.includes('projects/storefront/src/'),
          reports: ['v8', 'console-summary', 'lcovonly', 'json-summary'],
          onEnd: (coverageResults: CoverageResults | undefined) => {
            if (process.env['E2E_COVERAGE_GATE'] !== '1') return;
            const failed: string[] = [];
            for (const metric of ['statements', 'branches', 'functions', 'lines'] as const) {
              const raw = coverageResults?.summary[metric]?.pct;
              const pct = typeof raw === 'number' ? raw : 0;
              console.log(
                `e2e coverage ${metric} ${pct.toFixed(1)}% (threshold ${thresholds[metric]}%)`,
              );
              if (pct < thresholds[metric])
                failed.push(`${metric}=${pct.toFixed(1)}%<${thresholds[metric]}%`);
            }
            if (failed.length === 0) return;
            if (!gated) {
              console.log(`${skipReason} (${failed.join(', ')})`);
              return;
            }
            throw new Error(`e2e coverage gate failed: ${failed.join(', ')}`);
          },
        },
      },
    ],
  ],
  use: { baseURL, trace: 'on-first-retry', testIdAttribute: 'data-testid' },
  projects: [
    {
      name: 'seed',
      testDir: './e2e',
      // Matched against the absolute path (Playwright's testMatch rule), anchored on
      // e2e/seed.spec.ts so a nested seed.spec.ts in a project folder is not picked up twice.
      testMatch: /[\\/]e2e[\\/]seed\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], ...fullHd },
    },
    integration('chromium-fullhd', { ...devices['Desktop Chrome'], ...fullHd }),
    integration('chromium-mobile', { ...devices['Desktop Chrome'], ...mobile }),
    integration('firefox-fullhd', { ...devices['Desktop Firefox'], ...fullHd }),
    integration('firefox-mobile', { ...devices['Desktop Firefox'], ...mobileFirefox }),
    integration('webkit-fullhd', { ...devices['Desktop Safari'], ...fullHd }),
    integration('webkit-mobile', { ...devices['Desktop Safari'], ...mobile }),
    {
      name: 'smoke',
      testDir: './e2e/smoke',
      // Signed in to the demo access gate by the global setup (MIM-423).
      use: { ...devices['Desktop Chrome'], ...fullHd, storageState: DEMO_STORAGE_STATE },
    },
  ],
  // A supplied base URL is already serving: no local server is started for it.
  webServer: suppliedBaseURL === undefined ? webServer : undefined,
  globalSetup: smoke ? './e2e/fixtures/backend-ready.ts' : undefined,
});
