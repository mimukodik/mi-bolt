/**
 * Unit tests for `stock/stock-ledger.ts`.
 *
 * The ledger is the mock's per-handler-list view of what committed
 * orders sold per variant, plus the variant ids a once-only fault
 * took. `remaining`, `applyToVariant`, `applyToProduct` and
 * `applyToEntry` never mutate their argument; `recordSale` and `take`
 * only change the ledger.
 */
import { describe, expect, it } from 'vitest';

import { StockLedger } from './stock-ledger';
import type { OrderReceipt } from '@mi-bolt/api/models/order-receipt';
import type { OrderLine } from '@mi-bolt/api/models/order-line';

describe('StockLedger', () => {
  it('L-01 a sale lowers what is left and a sold-out variant reads out of stock', () => {
    const ledger = new StockLedger();
    const v1 = { id: 'v1', maxQuantity: 3, availability: 'in_stock' as const };

    expect(ledger.applyToVariant(v1)).toEqual({
      id: 'v1',
      maxQuantity: 3,
      availability: 'in_stock',
    });

    ledger.recordSale([{ variantId: 'v1', quantity: 2 }]);
    expect(ledger.applyToVariant(v1)).toEqual({
      id: 'v1',
      maxQuantity: 1,
      availability: 'in_stock',
    });

    ledger.recordSale([{ variantId: 'v1', quantity: 1 }]);
    expect(ledger.applyToVariant(v1)).toEqual({
      id: 'v1',
      maxQuantity: 0,
      availability: 'out_of_stock',
    });
  });

  it('L-02 a taken variant has nothing left', () => {
    const ledger = new StockLedger();
    ledger.take('v1');

    const v1 = { id: 'v1', maxQuantity: 5, availability: 'in_stock' as const };
    const v2 = { id: 'v2', maxQuantity: 5, availability: 'in_stock' as const };

    expect(ledger.remaining(v1)).toBe(0);
    expect(ledger.applyToVariant(v1)).toEqual({
      id: 'v1',
      maxQuantity: 0,
      availability: 'out_of_stock',
    });
    expect(ledger.isTaken('v1')).toBe(true);
    expect(ledger.applyToVariant(v2)).toEqual({
      id: 'v2',
      maxQuantity: 5,
      availability: 'in_stock',
    });
  });

  it('L-03 receipts seed the sales', () => {
    const baseLine: OrderLine = {
      variantId: 'v0',
      quantity: 0,
      productName: '',
      colorName: '',
      storageGb: 256,
      unitPrice: { amount: 0, currency: 'HUF' },
      lineTotal: { amount: 0, currency: 'HUF' },
    };
    const baseReceipt: OrderReceipt = {
      id: 'r1',
      orderNumber: 'DEMO-000001',
      createdAt: '2026-09-20T10:00:00.000Z',
      status: 'confirmed',
      items: [],
      subtotal: { amount: 0, currency: 'HUF' },
      shippingFee: { amount: 0, currency: 'HUF' },
      paymentFee: { amount: 0, currency: 'HUF' },
      total: { amount: 0, currency: 'HUF' },
      paymentMethod: 'cash_on_delivery',
      delivery: {
        optionId: 'home_delivery',
        address: {
          countryCode: 'HU',
          postalCode: '1052',
          city: 'Budapest',
          line1: 'Petőfi utca 1.',
        },
      },
      billing: {
        name: 'Teszt Elek',
        address: {
          countryCode: 'HU',
          postalCode: '1052',
          city: 'Budapest',
          line1: 'Petőfi utca 1.',
        },
      },
      contactEmail: 'teszt@pelda.hu',
      notice: 'simulation',
    };
    const receipts: OrderReceipt[] = [
      {
        ...baseReceipt,
        id: 'a',
        items: [
          {
            ...baseLine,
            variantId: 'v1',
            quantity: 1,
            lineTotal: { amount: 100, currency: 'HUF' },
          },
        ],
      },
      {
        ...baseReceipt,
        id: 'b',
        items: [
          {
            ...baseLine,
            variantId: 'v1',
            quantity: 2,
            lineTotal: { amount: 200, currency: 'HUF' },
          },
          {
            ...baseLine,
            variantId: 'v2',
            quantity: 1,
            lineTotal: { amount: 100, currency: 'HUF' },
          },
        ],
      },
    ];

    const ledger = new StockLedger();
    ledger.seedFromReceipts(receipts);

    const v1 = { id: 'v1', maxQuantity: 5, availability: 'in_stock' as const };
    const v2 = { id: 'v2', maxQuantity: 5, availability: 'in_stock' as const };

    expect(ledger.applyToVariant(v1).maxQuantity).toBe(2);
    expect(ledger.applyToVariant(v2).maxQuantity).toBe(4);
  });

  it('L-04 nothing changes its argument', () => {
    const ledger = new StockLedger();
    ledger.recordSale([{ variantId: 'v1', quantity: 1 }]);

    const v1 = { id: 'v1', maxQuantity: 3, availability: 'in_stock' as const };
    const variantSnapshot = { ...v1 };
    expect(ledger.applyToVariant(v1)).not.toBe(v1);
    expect(v1).toEqual(variantSnapshot);

    const v1Full = {
      id: 'v1',
      slug: 'v1-slug',
      colorCode: 'graphite',
      colorName: 'Grafit',
      swatchHex: '#343B43',
      storageGb: 256 as const,
      price: { amount: 339_990, currency: 'HUF' as const },
      availability: 'in_stock' as const,
      maxQuantity: 3,
      images: [],
    };
    const v2Full = {
      id: 'v2',
      slug: 'v2-slug',
      colorCode: 'gold',
      colorName: 'Arany',
      swatchHex: '#D4AF37',
      storageGb: 256 as const,
      price: { amount: 339_990, currency: 'HUF' as const },
      availability: 'in_stock' as const,
      maxQuantity: 2,
      images: [],
    };
    const product = {
      id: 'p-01',
      slug: 'demo-1',
      brand: 'demo',
      name: 'Demo',
      highlights: [''],
      is5g: true,
      releasedAt: '2026-01-01T00:00:00.000Z',
      description: 'demo',
      variants: [v1Full, v2Full],
      specGroups: [{ id: 'g', title: 'G', rows: [] }],
    };
    const productSnapshot = JSON.parse(JSON.stringify(product)) as typeof product;
    const applied = ledger.applyToProduct(product);
    expect(applied).not.toBe(product);
    expect(product).toEqual(productSnapshot);
    expect(applied.variants[0]?.maxQuantity).toBe(2);
    expect(product.variants[0]?.maxQuantity).toBe(3);
  });
});
