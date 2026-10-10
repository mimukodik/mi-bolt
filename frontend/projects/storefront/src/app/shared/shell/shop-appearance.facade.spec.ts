import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopAppearanceFacade } from './shop-appearance.facade';

function setup(): { facade: ShopAppearanceFacade; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiConfiguration('/api/v1'),
    ],
  });
  return {
    facade: TestBed.inject(ShopAppearanceFacade),
    http: TestBed.inject(HttpTestingController),
  };
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});
describe('independent Halloween appearance', () => {
  it('uses server start and expiry despite a different browser clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const { facade, http } = setup();
    http.expectOne('/api/v1/shop-appearance').flush({
      halloweenActive: false,
      serverTime: '2026-10-30T11:59:58Z',
      nextChangeAt: '2026-10-30T12:00:00Z',
    });
    expect(facade.halloweenActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(2050);
    http.expectOne('/api/v1/shop-appearance').flush({
      halloweenActive: true,
      serverTime: '2026-10-30T12:00:00Z',
      nextChangeAt: '2026-10-30T12:00:03Z',
    });
    expect(facade.halloweenActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(3050);
    http
      .expectOne('/api/v1/shop-appearance')
      .flush({ halloweenActive: false, serverTime: '2026-10-30T12:00:03Z' });
    expect(facade.halloweenActive()).toBe(false);
    http.verify();
  });
  it('discovers an admin edit when no boundary exists and rechecks on return', async () => {
    vi.useFakeTimers();
    const { facade, http } = setup();
    http
      .expectOne('/api/v1/shop-appearance')
      .flush({ halloweenActive: false, serverTime: '2026-10-30T12:00:00Z' });
    await vi.advanceTimersByTimeAsync(30050);
    http
      .expectOne('/api/v1/shop-appearance')
      .flush({ halloweenActive: true, serverTime: '2026-10-30T12:00:30Z' });
    expect(facade.halloweenActive()).toBe(true);
    window.dispatchEvent(new Event('pageshow'));
    http
      .expectOne('/api/v1/shop-appearance')
      .flush({ halloweenActive: false, serverTime: '2026-10-30T12:00:31Z' });
    expect(facade.halloweenActive()).toBe(false);
    http.verify();
  });
  it('removes stale decoration on failure and retries', async () => {
    vi.useFakeTimers();
    const { facade, http } = setup();
    http
      .expectOne('/api/v1/shop-appearance')
      .flush({ halloweenActive: true, serverTime: '2026-10-30T12:00:00Z' });
    window.dispatchEvent(new Event('pageshow'));
    http.expectOne('/api/v1/shop-appearance').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(facade.halloweenActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    http
      .expectOne('/api/v1/shop-appearance')
      .flush({ halloweenActive: false, serverTime: '2026-10-30T12:00:30Z' });
    http.verify();
  });
});
