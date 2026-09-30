import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Api } from '@mi-bolt/api/api';
import type { Promotion } from '@mi-bolt/api/models/promotion';
import { of, throwError } from 'rxjs';
import { PromotionState, saleOriginal } from './promotion';

describe('server-authoritative sale presentation', () => {
  const value = {
    price: { amount: 100, currency: 'HUF' as const },
    originalPrice: { amount: 200, currency: 'HUF' as const },
    availability: 'in_stock',
    promotion: {
      active: true,
      serverNow: '2026-10-31T22:58:00Z',
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-10-31T23:00:00Z',
    },
  };
  it('marks an active selected in-stock variant', () => {
    expect(saleOriginal(value)).toEqual(value.originalPrice);
  });
  it('does not inherit a promotion on a sold-out or unpromoted variant', () => {
    expect(saleOriginal({ ...value, availability: 'out_of_stock' })).toBeNull();
    expect(saleOriginal({ price: value.price })).toBeNull();
  });
  it('fails closed for expired and invalid responses', () => {
    expect(
      saleOriginal({
        ...value,
        promotion: { ...value.promotion, serverNow: value.promotion.endsAt },
      }),
    ).toBeNull();
    expect(saleOriginal({ ...value, promotion: { ...value.promotion, endsAt: 'bad' } })).toBeNull();
    expect(saleOriginal({ ...value, price: { amount: 201, currency: 'HUF' } })).toBeNull();
  });
});

describe('campaign lifecycle', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  const active: Promotion = {
    text: 'Halloween',
    active: true,
    serverNow: '2026-10-31T22:59:59Z',
    startsAt: '2026-10-01T00:00:00Z',
    endsAt: '2026-10-31T23:00:00Z',
  };
  it('invalidates at the server boundary even with an unrelated browser clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
    const invoke = vi
      .fn()
      .mockReturnValueOnce(of(active))
      .mockReturnValue(of({ ...active, active: false, serverNow: active.endsAt }));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: Api, useValue: { invoke } }],
    });
    const state = TestBed.inject(PromotionState);
    state.start();
    state.start();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(state.active()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(state.active()).toBe(false);
    expect(state.invalidated()).toBe(true);
  });
  it('refetches at campaign start and fails closed on a failed response', () => {
    vi.useFakeTimers();
    const planned = { ...active, active: false, serverNow: '2026-09-30T23:59:59Z' };
    const invoke = vi
      .fn()
      .mockReturnValueOnce(of(planned))
      .mockReturnValueOnce(of(active))
      .mockReturnValue(throwError(() => new Error('network')));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: Api, useValue: { invoke } }],
    });
    const state = TestBed.inject(PromotionState);
    state.start();
    expect(state.active()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(state.active()).toBe(true);
    state.refresh();
    expect(state.campaign()).toBeNull();
    expect(state.invalidated()).toBe(true);
  });
});
