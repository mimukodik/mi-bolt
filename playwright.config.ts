import { defineConfig, devices } from '@playwright/test';

// Ports come from the workspace ledger in
// .claude/rules/frontend-browser.md; E2E_PORT overrides it for a second or
// third worktree running at the same time (see 00-overview, "Parallel
// worktrees"). `local-backend` is the S5/MIM-214 serve configuration and does
// not exist yet: `npm run e2e:smoke` fails with
// "Configuration 'local-backend' is not set" until that task lands.
const smoke = process.env['E2E_TARGET'] === 'local-backend';
const port = Number(process.env['E2E_PORT'] ?? (smoke ? 4410 : 4400));
const serveConfiguration = smoke ? 'local-backend' : 'development';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The four values below are Playwright's own recommended CI block:
  // https://playwright.dev/docs/test-configuration (read 2026-09-22).
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'on-first-retry', testIdAttribute: 'data-testid' },
  projects: [
    {
      name: 'seed',
      testDir: './e2e',
      testMatch: /seed\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'integration', testDir: './e2e/integration', use: { ...devices['Desktop Chrome'] } },
    { name: 'smoke', testDir: './e2e/smoke', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx ng serve --configuration ${serveConfiguration} --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
