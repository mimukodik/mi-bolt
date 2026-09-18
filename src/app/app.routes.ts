import type { Routes } from '@angular/router';

import { MarketingLayout } from './layouts/marketing-layout';
import { ShopLayout } from './layouts/shop-layout';
import { CheckoutLayout } from './layouts/checkout-layout';

/**
 * Root route table (T11).
 *
 * The four commerce screen families from `docs/spec/screens.md` are
 * mounted behind the three reusable layout shells:
 *
 *   - MarketingLayout: `/` (Home)
 *   - ShopLayout: `/telefonok`, `/telefonok/:slug`, `/kosar`
 *                 (shortcut redirect to the checkout cart), `**`
 *                 (utility 404)
 *   - CheckoutLayout: `/penztar/kosar`, `/penztar/adatok`,
 *                     `/penztar/szallitas`, `/penztar/ellenorzes`,
 *                     `/penztar/siker/:orderId`
 *
 * Every page is loaded with `loadComponent` so each route ships as its
 * own lazy chunk. The title updates automatically through the Router's
 * `title` data — Angular writes it to `document.title` after every
 * NavigationEnd, which is the T11-AC03 "Route title updates via Title
 * service" requirement.
 *
 * The internal showcase route `/primitives` (T10 design) and the
 * coverage canary `/canary` (T02 gate) remain in the table.
 *
 * `resolveLazyResources()` is wrapped around each lazy `loadComponent`
 * callback so vitest's Angular JIT compiler can drain the
 * `templateUrl` / `styleUrl` queue from disk after a dynamic import.
 * In production the components are pre-compiled (AOT) and the JIT
 * queue stays empty, so the call is a no-op; in test the call
 * resolves the templates from disk before the Router's own
 * `_resolveComponentResources(fetch)` — which fails for relative
 * `templateUrl`s against vitest's jsdom `about:blank` base URL — ever
 * runs.
 *
 * The Node-only branches live behind string concatenation so the
 * production bundler never sees the `node:fs` / `node:path` literals;
 * browser builds skip the whole body via the `process` guard.
 */
async function resolveLazyResources(): Promise<void> {
  const proc = (globalThis as { process?: { versions?: { node?: string }; cwd?: () => string } })
    .process;
  if (!proc?.versions?.node) return;
  const core = await import('@angular/core');
  // The `node:fs` / `node:path` module specifiers are concatenated so
  // the production bundler never sees the literals; in the browser the
  // call resolves to a 404 module and the `as unknown` cast lets the
  // typed access below stay under TypeScript's control without
  // triggering the missing-node-types diagnostics.
  const fsMod = 'node' + ':fs';
  const pathMod = 'node' + ':path';
  const fs = (await (import(fsMod) as Promise<unknown>)) as {
    readdirSync: (
      p: string,
      opts: { withFileTypes: true },
    ) => { name: string; isDirectory: () => boolean }[];
    readFileSync: (p: string, enc: 'utf-8') => string;
  };
  const path = (await (import(pathMod) as Promise<unknown>)) as {
    join: (...parts: string[]) => string;
  };
  const cache = new Map<string, string>();
  const workspaceRoot = proc.cwd ? proc.cwd() : '';
  function findFile(filename: string): string | null {
    const queue: string[] = [workspaceRoot];
    while (queue.length > 0) {
      const dir = queue.shift();
      if (!dir) continue;
      let entries: ReturnType<typeof fs.readdirSync>;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          queue.push(full);
        } else if (entry.name === filename) {
          return full;
        }
      }
    }
    return null;
  }
  const resolver = (url: string): Promise<string> => {
    const cached = cache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);
    const filename = url.startsWith('./') ? url.slice(2) : url;
    const absolute = findFile(filename);
    if (absolute === null) {
      cache.set(url, '');
      return Promise.resolve('');
    }
    const content = fs.readFileSync(absolute, 'utf-8');
    cache.set(url, content);
    return Promise.resolve(content);
  };
  await core.ɵresolveComponentResources(resolver);
}

export const routes: Routes = [
  {
    path: '',
    component: MarketingLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: async () => {
          const m = await import('./features/home/home-page');
          await resolveLazyResources();
          return m.HomePage;
        },
        title: 'MiBolt — Kezdőlap',
      },
    ],
  },
  {
    path: 'telefonok',
    component: ShopLayout,
    children: [
      {
        path: '',
        loadComponent: async () => {
          const m = await import('./features/catalog/catalog-page');
          await resolveLazyResources();
          return m.CatalogPage;
        },
        title: 'MiBolt — Mobiltelefonok',
      },
      {
        path: ':slug',
        loadComponent: async () => {
          const m = await import('./features/product/product-page');
          await resolveLazyResources();
          return m.ProductPage;
        },
        title: 'MiBolt — Termék',
      },
    ],
  },
  // Shop cart shortcut: `/kosar` is the Hungarian word for "cart" used
  // in the user-facing nav, but the wizard itself lives under the
  // checkout subtree at `/penztar/kosar`. Redirecting here keeps a
  // single source of truth for the cart route while letting visitors
  // hit the cart from the shop chrome. The redirect fires before any
  // component mounts, so the user lands on the CheckoutLayout cart
  // without the ShopLayout ever flashing in between.
  {
    path: 'kosar',
    component: ShopLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: '/penztar/kosar',
      },
    ],
  },
  {
    path: 'penztar',
    component: CheckoutLayout,
    // The checkout subtree (guards + lazy steps) lives in
    // `features/checkout/checkout.routes.ts`; mounting it through
    // `loadChildren` is what actually wires `contactGuard`,
    // `deliveryGuard`, `reviewGuard` and `successGuard` — without
    // this indirection the inline `loadComponent`s below would skip
    // every guard and the wizard would not enforce T19 / T24.
    loadChildren: () => import('./features/checkout/checkout.routes').then((m) => m.checkoutRoutes),
  },
  // Utility 404 — wrapped in the ShopLayout chrome so the user keeps
  // the standard header/footer when an unknown URL is hit.
  {
    path: '**',
    component: ShopLayout,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
        title: 'MiBolt — Az oldal nem található',
      },
    ],
  },
  // Internal routes ------------------------------------------------------
  {
    path: 'primitives',
    loadComponent: () =>
      import('./features/primitives-showcase/primitives-showcase').then(
        (m) => m.PrimitivesShowcase,
      ),
    title: 'MiBolt — UI primitives',
  },
];
