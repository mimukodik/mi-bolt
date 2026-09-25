// spec: specs/storage-story-paths.md
// seed: e2e/seed.spec.ts

import type { BrowserContext } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The MSW mock is the application's whole data layer, and the shop boots it
// before Angular: `start()` in src/main.ts awaits `startMocks()`, which hydrates
// the persistence snapshot and starts the service worker, and only then calls
// `bootstrapApplication`. When the mock's start rejects, `showFatal` renders the
// `#mi-bolt-fatal` template of src/index.html into `document.body` instead of
// bootstrapping, and returns, so no screen of the application is ever mounted.
// The template carries the title, the body sentence and the native
// `fatal-retry` button, whose only listener is `globalThis.location.reload()`;
// `showFatal` also removes the `#mi-bolt-splash` cover screen before it clones
// the template in.
const FATAL_TITLE = 'A MiBolt demó indítása sikertelen';
const FATAL_BODY =
  'A bemutató nem tudott elindulni. Frissítsd az oldalt, vagy ellenőrizd a böngésző konzolját a részletekért.';
const RETRY_LABEL = 'Újratöltés';

// A context whose service workers are blocked is the first way of stopping the
// mock: Playwright installs `navigator.serviceWorker.register = async () => {
// console.warn('Service Worker registration blocked by Playwright') }`, so the
// call resolves with nothing, MSW reads that as a broken registration and throws
// from `getWorkerInstance`, and src/main.ts logs the failure it caught with
// `console.error('[MiBolt] Bootstrap failed:', err)`. The blocked context cannot
// be un-blocked, which is why the recoverable half of the scenario uses the
// first-load-only override of the second step instead.
const BLOCKED_WARNING = 'Service Worker registration blocked by Playwright';
// The failure is logged with a string and the caught `Error`, and the engines
// preview that second argument differently: Chromium and WebKit append the
// error's message (`Error: [MSW] Failed to register the Service Worker: ...`),
// while Playwright's Firefox prints the error's name alone (`Error`). Only the
// prefix every engine prints is asserted, so the same expectation holds in all
// three; that the blocked registration is what failed is the warning's own
// assertion below.
const BOOTSTRAP_FAILURE = '[MiBolt] Bootstrap failed: Error';

// The same failure, armed once: the init script below sets this marker key in
// `sessionStorage` and replaces `navigator.serviceWorker.register` in the same
// run, so only the first page load of the scenario is broken and the reload the
// retry button starts boots the shop.
const BLOCKED_MARKER_KEY = 'mi-bolt.story-worker-blocked-once';

// Every business call of the shop goes to `/api/v1/`, and the mock is the only
// thing that answers it: a page that never renders a screen of the application
// must not send one.
const API_PREFIX = '/api/v1/';

test.describe('Shop: storage, startup and expired-cart stories', () => {
  test(
    '[E017] a demo that cannot start its mock shows the retryable fatal screen',
    { tag: '@integration' },
    async ({ browser, page }, testInfo) => {
      // The context of the first step is created inside it and closed at the
      // start of the second, the way the plan reads.
      let blockedContext: BrowserContext | null = null;
      const blockedApiCalls: string[] = [];
      const storyApiCalls: string[] = [];
      const consoleMessages: string[] = [];

      // 1. Open the demo in a context whose service workers are blocked, record
      // every request to `**/api/v1/**` and every `console` message, and open `/`
      // with an explicit timeout.
      await test.step("1. Open the demo in a context whose service workers are blocked: `browser.newContext({ serviceWorkers: 'block', baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport })`, open a page in it, record every request to `**/api/v1/**` and every `console` message, and open `/` with an explicit timeout (`page.goto('/', { timeout: 10000 })`).", async () => {
        blockedContext = await browser.newContext({
          serviceWorkers: 'block',
          baseURL: testInfo.project.use.baseURL,
          viewport: testInfo.project.use.viewport,
        });
        const blockedPage = await blockedContext.newPage();

        blockedPage.on('request', (request) => {
          if (request.url().includes(API_PREFIX)) blockedApiCalls.push(request.url());
        });
        blockedPage.on('console', (message) => {
          consoleMessages.push(`${message.type()}: ${message.text()}`);
        });

        await blockedPage.goto('/', { timeout: 10000 });

        // The fatal startup surface is shown instead of the shop. It is scoped
        // through its own `role="alert"` wrapper: the same template also sits in
        // the page inside `<template id="mi-bolt-fatal">`, whose content is not
        // part of the document tree, so the locator only ever resolves the
        // rendered copy.
        const fatal = blockedPage.getByRole('alert');
        await expect(fatal).toBeVisible();
        await expect(fatal.getByRole('heading', { level: 1 })).toHaveText(FATAL_TITLE);
        await expect(fatal.locator('p')).toHaveText(FATAL_BODY);

        // The retry is the native `button` of the template reading "Újratöltés",
        // not a control of the application.
        const retry = blockedPage.getByTestId('fatal-retry');
        await expect(retry).toBeVisible();
        await expect(retry).toHaveJSProperty('tagName', 'BUTTON');
        await expect(retry).toHaveText(RETRY_LABEL);

        // No screen of the application is rendered: the rejected `startMocks()`
        // returned before `bootstrapApplication`, so `app-root` stays empty, and
        // `showFatal` took the cover screen with the failure.
        await expect(blockedPage.getByTestId('hero-heading')).toHaveCount(0);
        await expect(blockedPage.locator('app-root')).toBeEmpty();
        await expect(blockedPage.locator('#mi-bolt-splash')).toHaveCount(0);

        // Not one business call left the page, so nothing could fall through to
        // the network and answer with data.
        expect(blockedApiCalls).toEqual([]);

        // The console carries the mock's own start failing. The error is logged
        // by `showFatal` after Playwright's block script has warned, so polling
        // for the error also proves the warning arrived. The error's own message
        // is not part of the assertion because Firefox does not print it; the
        // warning beside it names the failure the mock start hit.
        await expect.poll(() => consoleMessages.join('\n')).toContain(BOOTSTRAP_FAILURE);
        expect(consoleMessages.join('\n')).toContain(BLOCKED_WARNING);
      });

      // 2. Close that context, arm the same failure once in this page before the
      // next navigation, record the requests, open `/` with an explicit timeout
      // and wait for the fatal surface.
      await test.step("2. Close that context. In the test's own page arm the same failure once, before the next navigation: `page.addInitScript` checks its marker key `mi-bolt.story-worker-blocked-once`, and when the marker is absent it stores the marker and replaces `navigator.serviceWorker.register` with a function returning `Promise.reject(new Error('worker blocked for the story'))`. Record every request to `**/api/v1/**`, open `/` with an explicit timeout, and wait for the fatal surface.", async () => {
        await blockedContext?.close();

        // Runs before any page script on every load of the scenario; the marker
        // makes it a first-load-only override, so the reload the retry starts
        // finds `navigator.serviceWorker.register` untouched and the shop boots.
        await page.addInitScript((markerKey: string) => {
          if (window.sessionStorage.getItem(markerKey) !== null) return;
          window.sessionStorage.setItem(markerKey, '1');
          navigator.serviceWorker.register = () =>
            Promise.reject(new Error('worker blocked for the story'));
        }, BLOCKED_MARKER_KEY);

        page.on('request', (request) => {
          if (request.url().includes(API_PREFIX)) storyApiCalls.push(request.url());
        });

        await page.goto('/', { timeout: 10000 });

        // The same fatal surface, from the same template and the same `showFatal`
        // call.
        const fatal = page.getByRole('alert');
        await expect(fatal).toBeVisible();
        await expect(fatal.getByRole('heading', { level: 1 })).toHaveText(FATAL_TITLE);
        await expect(fatal.locator('p')).toHaveText(FATAL_BODY);
        await expect(page.getByTestId('fatal-retry')).toHaveText(RETRY_LABEL);

        // The demo did not half-start behind the failure.
        await expect(page.getByTestId('hero-heading')).toHaveCount(0);
        await expect(page.locator('app-root')).toBeEmpty();

        // No business API answered with data.
        expect(storyApiCalls).toEqual([]);
      });

      // 3. Press `fatal-retry` and wait for the page load it starts to settle.
      await test.step('3. Press `fatal-retry` and wait for the page load it starts to settle (`page.waitForFunction` for `hero-heading` or the fatal title, explicit `{ timeout: 6000 }`).', async () => {
        // The button's only listener is `globalThis.location.reload()`.
        await page.getByTestId('fatal-retry').click();

        // The function is evaluated inside the page; when the reload destroys the
        // document that held the fatal surface, Playwright runs it again in the
        // new one.
        await page.waitForFunction(
          (title: string) =>
            document.querySelector('[data-testid="hero-heading"]') !== null ||
            document.body.textContent?.includes(title) === true,
          FATAL_TITLE,
          { timeout: 6000 },
        );

        // The retry loads the shop, and the fatal surface is gone with the
        // document that held it.
        await expect(page.getByTestId('hero-heading')).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);

        // The shop is working again on its fresh empty cart, at the root.
        await expect(page.getByTestId('cart-badge')).toHaveText('0');
        await expect(page).toHaveURL('/');

        // The marker is still there, so the failure was armed for the first page
        // load only and the reload is the whole of what the retry needed. The
        // read comes after the assertions above proved the new page settled.
        const marker = await page.evaluate(
          (key: string) => window.sessionStorage.getItem(key),
          BLOCKED_MARKER_KEY,
        );
        expect(marker).toBe('1');
      });
    },
  );
});
