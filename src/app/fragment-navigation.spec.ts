/**
 * FIX-42: router fragment navigation. Two behaviours, neither of them a
 * source-text assertion (FIX-07):
 *
 * - `appConfig.providers` configures the router with a `withInMemoryScrolling`
 *   feature whose `anchorScrolling` and `scrollPositionRestoration` are both
 *   `'enabled'`, read off the actual `RouterScroller` instance the app's own
 *   provider factory constructs, using the same `ɵproviders` introspection
 *   `app.spec.ts` already uses for the other `appConfig` features
 *   (`hasInternalProviders` / `hasProvToken`) — never by reading
 *   `app.config.ts` as text.
 * - `HowDemoWorks` renders an element whose `id` is `how`, and that
 *   element is the same one carrying `data-testid="how-demo-works"`.
 *
 * Scroll position itself is not asserted here: jsdom has no layout engine
 * and `scrollIntoView` is a no-op there. That is measured in the browser
 * (FIX-42-AC02 to FIX-42-AC04).
 *
 * Placed beside `app.spec.ts` under `src/`, not under `tests/` as FIX-42
 * item 5 names: a TestBed spec requires `initTestEnvironment`, which only
 * the `ng test` Angular builder injects (`@angular/build`'s vitest runner,
 * `build-options.js`). Running it with bare `npx vitest run` — the command
 * FIX-42's own "How to verify" names — fails with "Need to call
 * TestBed.initTestEnvironment() first" regardless of which directory the
 * file sits in; measured directly. `tests/**\/*.spec.ts` also only runs
 * under `vitest.contract.config.ts`'s Node environment with no Angular
 * compiler, the same reason FIX-28's own regression test is placed beside
 * its code rather than under `tests/`.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { appConfig, providerManifest } from './app.config';
import { HowDemoWorks } from './features/home/how-demo-works';

interface DescribedToken {
  readonly _desc: string;
}

interface FactoryProvider {
  readonly provide: unknown;
  readonly useFactory: () => unknown;
}

function isDescribedToken(value: unknown): value is DescribedToken {
  return typeof value === 'object' && value !== null && '_desc' in value;
}

function isFactoryProvider(value: unknown): value is FactoryProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    'provide' in value &&
    'useFactory' in value &&
    typeof value.useFactory === 'function'
  );
}

function hasInternalProviders(value: unknown): value is { ɵproviders: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ɵproviders' in value &&
    Array.isArray(value.ɵproviders)
  );
}

/** Recursively searches `providers` (router features nest their own
 *  provider arrays inside the flat list) for the factory provider whose
 *  injection token was created with the given description. */
function findFactoryProviderByTokenDescription(
  providers: readonly unknown[],
  description: string,
): FactoryProvider | null {
  for (const entry of providers) {
    if (Array.isArray(entry)) {
      const found = findFactoryProviderByTokenDescription(entry, description);
      if (found !== null) return found;
      continue;
    }
    if (
      isFactoryProvider(entry) &&
      isDescribedToken(entry.provide) &&
      entry.provide._desc === description
    ) {
      return entry;
    }
  }
  return null;
}

function isRouterScrollerLike(
  value: unknown,
): value is { options: { anchorScrolling?: string; scrollPositionRestoration?: string } } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'options' in value &&
    typeof value.options === 'object'
  );
}

describe('FIX-42: fragment navigation is configured and has a real target', () => {
  it('appConfig wires the router with anchor scrolling and scroll position restoration enabled', () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers],
    });
    if (!hasInternalProviders(providerManifest.router)) {
      throw new Error('Expected the router provider to expose ɵproviders');
    }
    const scrollerProvider = findFactoryProviderByTokenDescription(
      providerManifest.router.ɵproviders,
      'Router Scroller',
    );
    if (scrollerProvider === null) {
      throw new Error('Expected a "Router Scroller" provider — withInMemoryScrolling is missing');
    }
    const scroller = TestBed.runInInjectionContext(() => scrollerProvider.useFactory());
    if (!isRouterScrollerLike(scroller)) throw new Error('Expected a RouterScroller instance');
    expect(scroller.options.anchorScrolling).toBe('enabled');
    expect(scroller.options.scrollPositionRestoration).toBe('enabled');
  });

  it('HowDemoWorks renders one element with id="how" and it is the how-demo-works section', () => {
    const fixture = TestBed.createComponent(HowDemoWorks);
    fixture.detectChanges();
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const byId = raw.querySelector('#how');
    const byTestId = raw.querySelector('[data-testid="how-demo-works"]');
    expect(byId).not.toBeNull();
    expect(byTestId).not.toBeNull();
    expect(byId).toBe(byTestId);
  });
});
