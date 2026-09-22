import { defineConfig, devices } from '@playwright/test';
import type { V8CoverageEntry } from 'monocart-coverage-reports';

// Default port 4400 (or 4410 for the local-backend smoke config) is chosen to
// avoid collision with the regular dev server on 4200 and the demo-payment
// dev server on 4210. E2E_PORT overrides the default for a second or third
// worktree running at the same time. `local-backend` is the S5/MIM-214 serve
// configuration and does not exist yet: `npm run e2e:smoke` fails with
// "Configuration 'local-backend' is not set" until that task lands.
const smoke = process.env['E2E_TARGET'] === 'local-backend';
const port = Number(process.env['E2E_PORT'] ?? (smoke ? 4410 : 4400));
const serveConfiguration = smoke ? 'local-backend' : 'development';
const baseURL = `http://localhost:${port}`;
const ngServeCommand = `npx ng serve --configuration ${serveConfiguration} --port ${port}`;
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
          MI_BOLT_E2E_STATIC_DIR: 'dist/mi-bolt/browser',
        },
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The four values below are Playwright's own recommended CI block:
  // https://playwright.dev/docs/test-configuration (read 2026-09-22).
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    [
      'monocart-reporter',
      {
        name: 'MiBolt e2e coverage',
        outputFile: './coverage/e2e/index.html',
        coverage: {
          // Coverage is collected here and gated by scripts/check-e2e-coverage.mjs (the e2e npm script chains it). The script's thresholds mirror the unit coverageThresholds in angular.json (lines 102-108); keep both in sync.
          entryFilter: (entry: V8CoverageEntry) =>
            entry.url.includes('/main') || entry.url.includes('/chunk-'),
          sourceFilter: (sourcePath: string) =>
            sourcePath.includes('src/') && !sourcePath.includes('src/app/api/generated/'),
          reports: ['v8', 'console-summary', 'lcovonly', 'json-summary'],
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
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'integration', testDir: './e2e/integration', use: { ...devices['Desktop Chrome'] } },
    { name: 'smoke', testDir: './e2e/smoke', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer,
});
