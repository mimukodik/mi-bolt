/**
 * E2E network-isolation proof - T02-AC05.
 *
 * The page deliberately issues an unhandled `/api/v1/...` request
 * and an external `fetch('https://example.com/x')`. Both calls MUST
 * surface in the network log, and the MSW worker must fail the
 * fetch on the unhandled business route.
 *
 * The two tests below that assert "no pending HTTP requests" and "no
 * open WebSockets" are T02-AC05's other half, moved here under
 * decision D20 item 3: the requirement is unchanged, only where it
 * is proved moved. Each test exposes its own copy, scoped to itself,
 * on the single `page` fixture this file uses.
 */
import { expect, test as base } from '@playwright/test';

/**
 * The page-side fetch attempt against an unhandled `/api/v1` route
 * can only end one of two ways: it resolves (any status, 2xx through
 * 5xx, because the request reached a real network stack) or it
 * throws (because MSW's `onUnhandledRequest: 'error'` refused to let
 * an unmatched request leave the worker). The discriminated union
 * keeps those two outcomes distinct instead of collapsing them into
 * a single boolean, so the assertions below can require the throw
 * specifically rather than merely a non-2xx response.
 */
type FetchAttemptResult =
  { readonly ok: true; readonly status: 0 } | { readonly ok: false; readonly message: string };

function isRejectedFetch(
  result: FetchAttemptResult,
): result is { readonly ok: false; readonly message: string } {
  return result.ok === false;
}

base.describe('T02-AC05 E2E network isolation', () => {
  base('unhandled /api/v1 business route surfaces in the request log', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/this-route-does-not-exist')) {
        apiCalls.push(req.url());
      }
    });

    await page.goto('/');
    await expect(page.getByTestId('hero-section')).toBeVisible();

    const result = await page.evaluate(async (): Promise<FetchAttemptResult> => {
      try {
        await fetch('/api/v1/this-route-does-not-exist');
        return { ok: true, status: 0 };
      } catch (err) {
        return { ok: false, message: String(err) };
      }
    });
    // A resolved fetch here — 2xx, 404, 500, anything — means the
    // request reached the network and MSW did not intervene. Only
    // the catch branch proves the worker blocked egress, so the
    // assertion has to require the throw itself, not just a
    // non-2xx-looking result. `isRejectedFetch` pins that mechanism:
    // it fails a fetch that merely resolved with a bad status, since
    // that shape carries no `message`.
    expect(apiCalls.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
    expect(isRejectedFetch(result)).toBe(true);
    if (isRejectedFetch(result)) {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  base('external fetch is recorded by the page-level request listener', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (req.url().startsWith('https://example.com/')) {
        external.push(req.url());
      }
    });
    await page.goto('/');
    await expect(page.getByTestId('hero-section')).toBeVisible();
    const result = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/x');
        return 'fetched';
      } catch {
        return 'failed';
      }
    });
    expect(external.length).toBeGreaterThan(0);
    expect(result).toBe('failed');
  });

  base('no pending HTTP requests after navigation completes', async ({ page, context }) => {
    const pendingRequests = new Map<string, { method: string; count: number }>();
    const settle = (req: { url(): string }): void => {
      const existing = pendingRequests.get(req.url());
      if (!existing) return;
      existing.count -= 1;
      if (existing.count <= 0) pendingRequests.delete(req.url());
    };
    page.on('request', (req) => {
      const existing = pendingRequests.get(req.url());
      if (existing) {
        existing.count += 1;
      } else {
        pendingRequests.set(req.url(), { method: req.method(), count: 1 });
      }
    });
    page.on('requestfinished', settle);
    page.on('requestfailed', settle);
    await context.exposeBinding('__miboltPendingRequests', () =>
      Array.from(pendingRequests.entries()),
    );

    await page.goto('/');
    await expect(page.getByTestId('hero-section')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const pending = await page.evaluate(
      () =>
        (
          window as unknown as {
            __miboltPendingRequests?: () => Array<[string, { method: string; count: number }]>;
          }
        ).__miboltPendingRequests?.() ?? [],
    );
    expect(pending).toEqual([]);
  });

  base('no open WebSockets after navigation completes', async ({ page, context }) => {
    const openSockets = new Set<string>();
    page.on('websocket', (ws) => {
      const url = ws.url();
      openSockets.add(url);
      ws.on('close', () => openSockets.delete(url));
    });
    await context.exposeBinding('__miboltOpenSockets', () => Array.from(openSockets));

    await page.goto('/');
    await expect(page.getByTestId('hero-section')).toBeVisible();

    const open = await page.evaluate(
      () =>
        (
          window as unknown as {
            __miboltOpenSockets?: () => string[];
          }
        ).__miboltOpenSockets?.() ?? [],
    );
    expect(open).toEqual([]);
  });
});
