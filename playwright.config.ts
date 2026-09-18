import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the MiBolt design suite and the T02
 * coverage / network-isolation suites.
 *
 * `serviceWorkers: 'allow'` is the T02 contract: the MSW worker
 * MUST be able to register so it can intercept business requests
 * without them leaking past the test browser. The Chromium-only
 * coverage gate uses `resetOnNavigation: false` (plus per-navigation
 * flushes inside `e2e/fixtures/coverage.ts`) to keep counters across
 * full reloads and lazy chunk loads.
 *
 * The E2E coverage suite uses the production build served by a
 * plain static HTTP server. The Vite dev server compiles each
 * module into an anonymous ESM script that V8 coverage reports
 * without a URL, so the `e2eToIstanbul` converter cannot map the
 * V8 segments back to source files. The production build emits
 * `<script src="chunk-X.js" type="module">` tags with real URLs
 * (and `.js.map` source maps) so the coverage chain is reliable.
 *
 * `MI_BOLT_E2E_STATIC_DIR` overrides the served directory and
 * `MI_BOLT_E2E_BASE_URL` overrides the base URL; the CI workflow
 * sets both so the network namespace sees only the local origin.
 */
const STATIC_DIR = process.env['MI_BOLT_E2E_STATIC_DIR'] ?? 'dist/mi-bolt/browser';
const BASE_URL = process.env['MI_BOLT_E2E_BASE_URL'] ?? 'http://127.0.0.1:4200';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
    // Headless is the T02 / orchestrator contract: no headed
    // browser windows must open during the test runs. Setting it
    // explicitly here so the future addition of a `launchOptions`
    // block cannot silently regress this.
    headless: true,
  },
  webServer: {
    // T28 ships `scripts/serve-static.mjs` — the minimal
    // localhost-only static host that owns the deployment
    // contract for this repo. The host applies the SPA fallback,
    // the `/api/*` 404 problem+json policy and the
    // `no-cache`/`immutable` cache-control split the design
    // review requires. The earlier `http-server` command is kept
    // here only as a comment so a future operator understands
    // what it replaced.
    command: `PLAYWRIGHT_HEADLESS=1 PORT=4200 MI_BOLT_E2E_STATIC_DIR=${STATIC_DIR} node scripts/serve-static.mjs`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
  projects: [
    {
      name: 'mi-bolt-design',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mi-bolt-narrow',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
