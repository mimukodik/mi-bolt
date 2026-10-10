import { describe, expect, it, vi } from 'vitest';
import { useMswServer } from '../testing/msw-server';
import { inputOf, requireProduct, setup, put, productUrl } from '../testing/mock-spec-helpers';

useMswServer();

describe('promotion writes over HTTP', () => {
  it('persists distinct variant prices, preserves legacy writes and explicitly clears a disabled promotion price', async () => {
    const db = setup();
    const product = requireProduct(db, 5);
    const original = inputOf(product);
    const body = {
      ...original,
      promotion: {
        enabled: true,
        text: 'Halloween',
        startsAt: '2026-10-30T00:00:00Z',
        endsAt: '2026-11-01T00:00:00Z',
      },
      variants: original.variants.map((v, i) => ({
        ...v,
        ...(i === 0 ? { salePriceHuf: 99000 } : {}),
      })),
    };
    expect((await put(productUrl(5), db, body, { 'If-Match': '"0"' })).status).toBe(200);
    expect(requireProduct(db, 5).variants[0].salePriceHuf).toBe(99000);
    expect(requireProduct(db, 5).variants[1].salePriceHuf).toBeUndefined();
    expect((await put(productUrl(5), db, original, { 'If-Match': '"1"' })).status).toBe(200);
    expect(requireProduct(db, 5).promotion?.enabled).toBe(true);
    expect(requireProduct(db, 5).variants[0].salePriceHuf).toBe(99000);
    const disable = {
      ...original,
      promotion: { enabled: false },
      variants: original.variants.map((v) => ({ ...v, clearSalePrice: true })),
    };
    expect((await put(productUrl(5), db, disable, { 'If-Match': '"2"' })).status).toBe(200);
    expect(requireProduct(db, 5).variants[0].salePriceHuf).toBeUndefined();
    expect(requireProduct(db, 5).variants[0].price).toEqual(original.variants[0].price);
  });
  it('rejects enabled promotion without prices and leaves stored input unchanged on conflict', async () => {
    const db = setup();
    const product = requireProduct(db, 5);
    const body = {
      ...inputOf(product),
      promotion: {
        enabled: true,
        text: 'Halloween',
        startsAt: '2026-10-30T00:00:00Z',
        endsAt: '2026-11-01T00:00:00Z',
      },
    };
    expect((await put(productUrl(5), db, body, { 'If-Match': '"0"' })).status).toBe(422);
    expect(requireProduct(db, 5)).toEqual(product);
    expect((await put(productUrl(5), db, body, { 'If-Match': '"99"' })).status).toBe(412);
    expect(requireProduct(db, 5)).toEqual(product);
  });
});

describe('promotion bean validation', () => {
  it('rejects malformed calendar dates, precision and offsets before any write', async () => {
    const db = setup();
    const product = requireProduct(db, 5);
    for (const startsAt of [
      '2026-02-30T00:00:00Z',
      '2026-10-30T00:00:00.1234567890Z',
      '2026-10-30T00:00:00+18:01',
    ]) {
      const body = { ...inputOf(product), promotion: { enabled: false, startsAt } };
      expect((await put(productUrl(5), db, body, { 'If-Match': '"0"' })).status).toBe(400);
      expect(requireProduct(db, 5)).toEqual(product);
    }
  });
  it('rejects sale values outside contract bounds with 422 and no write', async () => {
    const db = setup();
    const product = requireProduct(db, 5);
    for (const salePriceHuf of [0, 100_000_001]) {
      const body = {
        ...inputOf(product),
        variants: inputOf(product).variants.map((v) => ({ ...v, salePriceHuf })),
      };
      expect((await put(productUrl(5), db, body, { 'If-Match': '"0"' })).status).toBe(422);
      expect(requireProduct(db, 5)).toEqual(product);
    }
  });
});

describe('campaign reference snapshot', () => {
  it('refreshes before start and keeps reference and sale after a legacy base-price write during the campaign', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
      const db = setup();
      const product = requireProduct(db, 5);
      const original = inputOf(product);
      const campaign = {
        ...original,
        promotion: {
          enabled: true,
          text: 'Halloween',
          startsAt: '2026-10-30T00:00:00Z',
          endsAt: '2026-11-01T00:00:00Z',
        },
        variants: original.variants.map((v) => ({
          ...v,
          salePriceHuf: 90000,
          price: { ...v.price, amount: 120000 },
        })),
      };
      expect((await put(productUrl(5), db, campaign, { 'If-Match': '"0"' })).status).toBe(200);
      const scheduled = {
        ...original,
        variants: original.variants.map((v) => ({ ...v, price: { ...v.price, amount: 130000 } })),
      };
      expect((await put(productUrl(5), db, scheduled, { 'If-Match': '"1"' })).status).toBe(200);
      expect(requireProduct(db, 5).variants[0].referencePriceHuf).toBe(130000);
      vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
      const active = {
        ...original,
        variants: original.variants.map((v) => ({ ...v, price: { ...v.price, amount: 80000 } })),
      };
      expect((await put(productUrl(5), db, active, { 'If-Match': '"2"' })).status).toBe(200);
      const saved = requireProduct(db, 5).variants[0];
      expect(saved.referencePriceHuf).toBe(130000);
      expect(saved.salePriceHuf).toBe(90000);
      expect(saved.price.amount).toBe(80000);
      const invalid = {
        ...active,
        variants: active.variants.map((v) => ({ ...v, salePriceHuf: 130000 })),
      };
      const response = await put(productUrl(5), db, invalid, { 'If-Match': '"3"' });
      expect(response.status).toBe(422);
      expect(requireProduct(db, 5).variants[0]).toEqual(saved);
    } finally {
      vi.useRealTimers();
    }
  });
});
