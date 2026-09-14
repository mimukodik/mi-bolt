import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the MiBolt design suite.
 *
 * The `webServer` block starts `ng serve` from the project root before
 * the suite runs and reuses the existing development server if one is
 * already up. Viewports are restricted to the two pass-through sizes for
 * T10 — the 390-px narrow mobile layout and the 1440-px content centerline.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env['MI_BOLT_E2E_BASE_URL'] ?? 'http://127.0.0.1:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx ng serve --configuration=development --host 127.0.0.1 --port 4200',
    url: 'http://127.0.0.1:4200/primitives',
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
