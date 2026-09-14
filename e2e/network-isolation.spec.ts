/**
 * E2E network-isolation proof — T02-AC05.
 *
 * The page deliberately issues an unhandled `/api/v1/...` request
 * and an external `fetch('https://example.com/x')`. Both calls MUST
 * surface in the network log; the open-sockets check in the
 * coverage fixture must observe them, and the MSW worker must
 * fail the test on the unhandled business route.
 */
import { expect, test as base } from '@playwright/test';

import { test as miboltTest } from './fixtures/test';

base.describe('T02-AC05 E2E network isolation', () => {
  miboltTest(
    'unhandled /api/v1 business route surfaces in the request log',
    async ({ page }) => {
      const apiCalls: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/v1/this-route-does-not-exist')) {
          apiCalls.push(req.url());
        }
      });

      await page.goto('/canary?branch=true');
      await expect(page.getByTestId('canary-branch')).toHaveText('A');

      const result = await page.evaluate(async () => {
        try {
          await fetch('/api/v1/this-route-does-not-exist');
          return { ok: true, status: 0 };
        } catch (err) {
          return { ok: false, message: String(err) };
        }
      });
      // MSW's onUnhandledRequest='error' rejects the request; the
      // page sees a network error. We assert (a) the attempt was
      // observed by the page-level request listener and (b) the
      // fetch itself was rejected so the network was not allowed.
      expect(apiCalls.length).toBeGreaterThan(0);
      expect(result.ok).toBe(false);
    },
  );

  miboltTest(
    'external fetch is recorded by the page-level request listener',
    async ({ page }) => {
      const external: string[] = [];
      page.on('request', (req) => {
        if (req.url().startsWith('https://example.com/')) {
          external.push(req.url());
        }
      });
      await page.goto('/canary?branch=true');
      await expect(page.getByTestId('canary-branch')).toHaveText('A');
      // The page cannot actually reach example.com (the runner
      // network is isolated), but the attempt MUST show up in the
      // request log.
      const result = await page.evaluate(async () => {
        try {
          await fetch('https://example.com/x');
          return 'fetched';
        } catch {
          return 'failed';
        }
      });
      // The page cannot actually reach example.com (the runner
      // network is isolated), but the attempt MUST show up in the
      // request log AND the fetch must end with 'failed' so the
      // test proves no outbound traffic succeeded.
      expect(external.length).toBeGreaterThan(0);
      expect(result).toBe('failed');
    },
  );
});