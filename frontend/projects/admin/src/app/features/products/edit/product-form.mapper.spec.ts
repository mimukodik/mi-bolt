import { describe, expect, it } from 'vitest';

import type { AdminProduct } from '../../../api/generated/models/admin-product';
import type { AdminProductInput } from '../../../api/generated/models/admin-product-input';
import { seedCatalog } from '../../../../mocks/seed';

import { toFormModel, toModelPointer, toProductInput } from './product-form.mapper';
import type { ColorModel, ProductFormModel } from './product-form.model';

/** The `AdminProductInput` the contract expects for `product`, built without going through the mapper. */
function expectedInputFrom(product: AdminProduct): AdminProductInput {
  return {
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    description: product.description,
    is5g: product.is5g,
    releasedAt: product.releasedAt,
    rank: product.rank,
    popularityScore: product.popularityScore,
    featured: product.featured,
    highlights: product.highlights,
    colors: product.colors.map((color) => ({
      code: color.code,
      name: color.name,
      swatchHex: color.swatchHex,
      imageId: color.image.id,
      alt: color.image.alt,
    })),
    variants: product.variants.map((variant) => ({
      slug: variant.slug,
      colorCode: variant.colorCode,
      storageGb: variant.storageGb,
      price: variant.price,
      stock: variant.stock,
    })),
    specGroups: product.specGroups,
  };
}

/** A form model with every field filled, valid enough for `toProductInput` to accept it. */
function validModel(): ProductFormModel {
  const color: ColorModel = {
    key: 'color-1',
    code: 'piros',
    name: 'Piros',
    swatchHex: '#ff0000',
    alt: 'Piros telefon',
    image: {
      id: 'img-1',
      src: '/api/v1/media/img-1',
      alt: 'Piros telefon',
      width: 10,
      height: 10,
    },
  };
  return {
    slug: 'teszt-telefon',
    brand: 'Teszt',
    name: 'Teszt Telefon',
    description: '',
    is5g: true,
    releasedAt: new Date(2026, 0, 1),
    rank: 1,
    popularityScore: 1,
    featured: false,
    highlights: [{ key: 'h-1', text: 'Gyors' }],
    colors: [color],
    variants: [
      {
        key: 'variant-1',
        id: null,
        colorKey: color.key,
        storageGb: 128,
        price: 100_000,
        salePrice: null,
        stock: 5,
      },
    ],
    specGroups: [
      { key: 'group-1', title: 'Kijelző', rows: [{ key: 'row-1', label: 'Méret', value: '6.1"' }] },
    ],
  };
}

describe('toFormModel / toProductInput round trip', () => {
  for (const product of seedCatalog().products) {
    it(`rebuilds ${product.slug} unchanged`, () => {
      expect(toProductInput(toFormModel(product)), product.slug).toEqual(
        expectedInputFrom(product),
      );
    });
  }
});

describe('toFormModel: a variant whose colorCode matches no colour', () => {
  it('maps colorKey to null instead of throwing', () => {
    const base = seedCatalog().products[0];
    const product = { ...base, variants: [{ ...base.variants[0], colorCode: 'no-such-code' }] };

    const model = toFormModel(product);

    expect(model.variants[0].colorKey).toBeNull();
  });
});

describe('toFormModel / toProductInput colour rename', () => {
  it('carries a renamed colour code onto its variants’ colorCode and slug', () => {
    const model = validModel();
    model.colors[0].code = 'kek';

    const input = toProductInput(model);

    expect(input.variants[0].colorCode).toBe('kek');
    expect(input.variants[0].slug).toBe('kek-128gb');
  });
});

describe('releasedAt local date handling', () => {
  it('reads a wire date into a local-midnight Date and back unchanged', () => {
    const product = { ...seedCatalog().products[0], releasedAt: '2026-09-01' };

    const model = toFormModel(product);

    expect(model.releasedAt).not.toBeNull();
    const date = model.releasedAt;
    if (date === null) {
      throw new Error('unreachable: asserted above');
    }
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(1);
    expect(toProductInput(model).releasedAt).toBe('2026-09-01');
  });

  it('formats a late-evening local Date as its own calendar day, never a day later', () => {
    const model = validModel();
    model.releasedAt = new Date(2026, 11, 31, 23, 30);

    expect(toProductInput(model).releasedAt).toBe('2026-12-31');
  });
});

describe('toProductInput empty-field guards', () => {
  it('throws naming /releasedAt when releasedAt is empty', () => {
    const model = validModel();
    model.releasedAt = null;
    expect(() => toProductInput(model)).toThrow('/releasedAt');
  });

  it('throws naming /rank when rank is empty', () => {
    const model = validModel();
    model.rank = null;
    expect(() => toProductInput(model)).toThrow('/rank');
  });

  it('throws naming /popularityScore when popularityScore is empty', () => {
    const model = validModel();
    model.popularityScore = null;
    expect(() => toProductInput(model)).toThrow('/popularityScore');
  });

  it('throws naming /colors/0/image when a colour has no image', () => {
    const model = validModel();
    model.colors[0].image = null;
    expect(() => toProductInput(model)).toThrow('/colors/0/image');
  });

  it('throws naming /variants/0/colorKey when a variant links to no colour', () => {
    const model = validModel();
    model.variants[0].colorKey = 'no-such-colour';
    expect(() => toProductInput(model)).toThrow('/variants/0/colorKey');
  });

  it('throws naming /variants/0/storageGb when a variant has no storage', () => {
    const model = validModel();
    model.variants[0].storageGb = null;
    expect(() => toProductInput(model)).toThrow('/variants/0/storageGb');
  });

  it('throws naming /variants/0/price when a variant has no price', () => {
    const model = validModel();
    model.variants[0].price = null;
    expect(() => toProductInput(model)).toThrow('/variants/0/price');
  });

  it('throws naming /variants/0/stock when a variant has no stock', () => {
    const model = validModel();
    model.variants[0].stock = null;
    expect(() => toProductInput(model)).toThrow('/variants/0/stock');
  });
});

describe('toModelPointer', () => {
  it('maps a colour image pointer onto the model’s image field', () => {
    expect(toModelPointer('/colors/2/imageId')).toBe('/colors/2/image');
  });

  it('maps a variant colorCode pointer onto the model’s colorKey field', () => {
    expect(toModelPointer('/variants/1/colorCode')).toBe('/variants/1/colorKey');
  });

  it('maps a variant slug pointer onto the model’s storageGb field', () => {
    expect(toModelPointer('/variants/1/slug')).toBe('/variants/1/storageGb');
  });

  it('maps a variant price/amount pointer onto the model’s price field', () => {
    expect(toModelPointer('/variants/1/price/amount')).toBe('/variants/1/price');
  });

  it('maps a bare variant price pointer onto the model’s price field', () => {
    expect(toModelPointer('/variants/1/price')).toBe('/variants/1/price');
  });

  it('maps a highlight pointer onto the model’s text field', () => {
    expect(toModelPointer('/highlights/3')).toBe('/highlights/3/text');
  });

  it('leaves a spec group row pointer unchanged', () => {
    expect(toModelPointer('/specGroups/0/rows/2')).toBe('/specGroups/0/rows/2');
  });

  it('leaves an unrelated pointer unchanged', () => {
    expect(toModelPointer('/brand')).toBe('/brand');
  });
});
