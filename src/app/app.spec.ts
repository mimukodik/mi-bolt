import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';
import { appConfig, providerManifest } from './app.config';

function hasInternalProviders(value: unknown): value is { ɵproviders: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ɵproviders' in value &&
    Array.isArray(value.ɵproviders)
  );
}

function hasNameProperty(value: unknown): value is { name: string } {
  return (
    typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
  );
}

function hasProvideProperty(value: unknown): value is { provide: unknown } {
  return typeof value === 'object' && value !== null && 'provide' in value;
}

function hasProvToken(entry: unknown, expectedToken: string): boolean {
  if (typeof entry === 'function' && entry.name === expectedToken) {
    return true;
  }
  if (typeof entry !== 'object' || entry === null) return false;
  if ('ɵprov' in entry) {
    const prov = entry.ɵprov;
    if (typeof prov === 'object' && prov !== null && 'token' in prov) {
      const token = prov.token;
      if (typeof token === 'function' && token.name === expectedToken) {
        return true;
      }
      if (hasNameProperty(token) && token.name === expectedToken) {
        return true;
      }
    }
  }
  if (hasProvideProperty(entry)) {
    const provide = entry.provide;
    if (typeof provide === 'function' && provide.name === expectedToken) {
      return true;
    }
    if (hasNameProperty(provide) && provide.name === expectedToken) {
      return true;
    }
  }
  return false;
}

function hasUseValue(value: unknown): value is { useValue: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'useValue' in value &&
    typeof value.useValue === 'string'
  );
}

/**
 * Tests for T01 acceptance criteria. Each `describe` block maps to
 * one acceptance id so a failing test maps back to the spec line
 * that demanded it.
 */
describe('T01-AC05: root component', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    });
  });

  it('renders the Hungarian welcome h1 inside the home route', async () => {
    const router = TestBed.inject(Router);
    const root = TestBed.createComponent(App);
    await router.navigateByUrl('/');
    root.autoDetectChanges();
    await root.whenStable();
    const raw: unknown = root.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const heading = raw.querySelector('h1');
    expect(heading).toBeTruthy();
    expect(heading?.textContent).toContain('MiBolt');
  });

  it('does not expose a fatal-startup element in the component tree', () => {
    const root = TestBed.createComponent(App);
    root.detectChanges();
    const raw: unknown = root.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const fatal = raw.querySelector('app-fatal');
    expect(fatal).toBeNull();
    expect(raw.querySelectorAll('h1').length).toBe(0);
  });

  it('renders a skip-link to the main content', () => {
    const root = TestBed.createComponent(App);
    root.detectChanges();
    const raw: unknown = root.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const skip = raw.querySelector('a.skip-link');
    expect(skip).toBeTruthy();
    expect(skip?.getAttribute('href')).toBe('#main-content');
  });
});

describe('T01-AC02: provideZonelessChangeDetection in appConfig', () => {
  it('exports a non-empty zoneless change detection provider', () => {
    const provider = providerManifest.zonelessChangeDetection;
    // The provider is opaque at runtime; the @angular/core API returns
    // an EnvironmentProviders object whose `ɵproviders` array holds the
    // internals. A missing call to provideZonelessChangeDetection()
    // makes `providerManifest.zonelessChangeDetection` `undefined` and
    // also breaks the build, so this test double-checks the wiring.
    expect(provider).toBeDefined();
    if (!hasInternalProviders(provider)) {
      throw new Error('Expected provider with ɵproviders');
    }
    expect(Array.isArray(provider.ɵproviders)).toBe(true);
    expect(provider.ɵproviders.length).toBeGreaterThan(0);
  });
});

describe('T01-AC04: HttpClient wired with withFetch()', () => {
  it('appConfig includes the withFetch marker feature', () => {
    // `provideHttpClient(withFetch())` returns an `EnvironmentProviders`
    // object whose `ɵproviders` array carries the resolved HttpClient,
    // interceptor, and backend providers. The withFetch() feature
    // replaces the default XhrBackend with FetchBackend, so its
    // presence in the resolved list is the binding proof that
    // withFetch() was actually wired up.
    const http = providerManifest.httpClientWithFetch;
    if (!hasInternalProviders(http)) {
      throw new Error('Expected http with ɵproviders');
    }
    const list = http.ɵproviders;
    expect(list.length).toBeGreaterThan(0);
    const hasFetchBackend = list.some((entry) => hasProvToken(entry, 'FetchBackend'));
    expect(hasFetchBackend).toBe(true);
  });

  it('appConfig includes provideHttpClient internal providers (FetchBackend)', () => {
    // The provideHttpClient() spread array carries class providers whose
    // ɵfac holds a factory function; withFetch injects FetchBackend as the
    // primary backend.
    const http = providerManifest.httpClientWithFetch;
    const list = Array.isArray(http) ? http : hasInternalProviders(http) ? http.ɵproviders : [];
    const hasFetchBackend = list.some(
      (entry) => hasProvToken(entry, 'FetchBackend') || hasProvToken(entry, 'HttpHandler'),
    );
    expect(hasFetchBackend).toBe(true);
  });
});

describe('T01-AC04: APP_BASE_HREF provider', () => {
  it('appConfig exposes a base-href provider', () => {
    const base = providerManifest.baseHref;
    expect(base).toBeDefined();
    if (!hasUseValue(base)) {
      throw new Error('Expected baseHref with useValue string');
    }
    expect(typeof base.useValue).toBe('string');
    // Either '/' (production at /) or '/mi-bolt/' (subpath deployment);
    // the production default satisfies the T01-AC05 deployment test.
    expect(['/', '/mi-bolt/']).toContain(base.useValue);
  });
});

describe('T01-AC01: production providers compile cleanly', () => {
  it('appConfig is a valid ApplicationConfig shape', () => {
    expect(appConfig).toBeDefined();
    expect(typeof appConfig).toBe('object');
    expect(Array.isArray(appConfig.providers)).toBe(true);
    expect(appConfig.providers.length).toBeGreaterThan(0);
  });
});
