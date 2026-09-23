import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';

import { seedCatalog } from '../../../../mocks/seed';
import { MESSAGES, SERVER_FIELD_MESSAGES } from '../../../shared/forms/messages';

import { toFormModel } from './product-form.mapper';
import { emptyProductForm } from './product-form.model';
import type { ColorModel, ProductFormModel } from './product-form.model';
import { productFormSchema } from './product-form.schema';

/** A form model with every field filled, valid under every validator in the brief's §4. */
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
    description: 'Leírás.',
    is5g: true,
    releasedAt: new Date(2026, 0, 1),
    rank: 1,
    popularityScore: 1,
    featured: false,
    highlights: [{ key: 'h-1', text: 'Gyors' }],
    colors: [color],
    variants: [
      { key: 'variant-1', id: null, colorKey: color.key, storageGb: 128, price: 100_000, stock: 5 },
    ],
    specGroups: [
      { key: 'group-1', title: 'Kijelző', rows: [{ key: 'row-1', label: 'Méret', value: '6.1"' }] },
    ],
  };
}

function buildForm(
  model: ProductFormModel,
  featuredOthers: number | null = 0,
): FieldTree<ProductFormModel> {
  return TestBed.runInInjectionContext(() =>
    form(signal(model), productFormSchema({ featuredOthers: signal(featuredOthers) })),
  );
}

describe('productFormSchema: slug', () => {
  it('passes a valid slug', () => {
    const f = buildForm(validModel());
    expect(
      f
        .slug()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags an empty slug as required', () => {
    const model = validModel();
    model.slug = '';
    const f = buildForm(model);
    expect(
      f
        .slug()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a slug over 120 characters', () => {
    const model = validModel();
    model.slug = 'a'.repeat(121);
    const f = buildForm(model);
    expect(
      f
        .slug()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(120)]);
  });

  it('flags a slug with an uppercase letter', () => {
    const model = validModel();
    model.slug = 'Teszt-Telefon';
    const f = buildForm(model);
    expect(
      f
        .slug()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.slugPattern]);
  });
});

describe('productFormSchema: brand', () => {
  it('passes a valid brand', () => {
    const f = buildForm(validModel());
    expect(
      f
        .brand()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags a whitespace-only brand as required', () => {
    const model = validModel();
    model.brand = '   ';
    const f = buildForm(model);
    expect(
      f
        .brand()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a brand over 80 characters', () => {
    const model = validModel();
    model.brand = 'a'.repeat(81);
    const f = buildForm(model);
    expect(
      f
        .brand()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(80)]);
  });
});

describe('productFormSchema: name', () => {
  it('passes a valid name', () => {
    const f = buildForm(validModel());
    expect(
      f
        .name()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags a whitespace-only name as required', () => {
    const model = validModel();
    model.name = '  ';
    const f = buildForm(model);
    expect(
      f
        .name()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a name over 200 characters', () => {
    const model = validModel();
    model.name = 'a'.repeat(201);
    const f = buildForm(model);
    expect(
      f
        .name()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(200)]);
  });
});

describe('productFormSchema: description', () => {
  it('passes an empty description', () => {
    const model = validModel();
    model.description = '';
    const f = buildForm(model);
    expect(
      f
        .description()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags a description over 2000 characters', () => {
    const model = validModel();
    model.description = 'a'.repeat(2001);
    const f = buildForm(model);
    expect(
      f
        .description()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(2000)]);
  });
});

describe('productFormSchema: releasedAt', () => {
  it('passes a chosen date', () => {
    const f = buildForm(validModel());
    expect(
      f
        .releasedAt()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags an empty releasedAt as required', () => {
    const model = validModel();
    model.releasedAt = null;
    const f = buildForm(model);
    expect(
      f
        .releasedAt()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });
});

describe('productFormSchema: rank', () => {
  it('passes an integer rank', () => {
    const f = buildForm(validModel());
    expect(
      f
        .rank()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags an empty rank as required', () => {
    const model = validModel();
    model.rank = null;
    const f = buildForm(model);
    expect(
      f
        .rank()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a non-integer rank', () => {
    const model = validModel();
    model.rank = 1.5;
    const f = buildForm(model);
    expect(
      f
        .rank()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.integer]);
  });
});

describe('productFormSchema: popularityScore', () => {
  it('passes an integer popularityScore', () => {
    const f = buildForm(validModel());
    expect(
      f
        .popularityScore()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags an empty popularityScore as required', () => {
    const model = validModel();
    model.popularityScore = null;
    const f = buildForm(model);
    expect(
      f
        .popularityScore()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a non-integer popularityScore', () => {
    const model = validModel();
    model.popularityScore = 2.2;
    const f = buildForm(model);
    expect(
      f
        .popularityScore()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.integer]);
  });
});

describe('productFormSchema: featured', () => {
  it('passes featured when 3 other products are already featured', () => {
    const model = validModel();
    model.featured = true;
    const f = buildForm(model, 3);
    expect(
      f
        .featured()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags featured when 4 other products are already featured', () => {
    const model = validModel();
    model.featured = true;
    const f = buildForm(model, 4);
    expect(
      f
        .featured()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.featuredLimit]);
  });
});

describe('productFormSchema: highlights', () => {
  it('passes one highlight', () => {
    const f = buildForm(validModel());
    expect(
      f
        .highlights()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags zero highlights', () => {
    const model = validModel();
    model.highlights = [];
    const f = buildForm(model);
    expect(
      f
        .highlights()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.highlightsMin]);
  });

  it('flags seven highlights', () => {
    const model = validModel();
    model.highlights = Array.from({ length: 7 }, (_, index) => ({
      key: `h-${String(index)}`,
      text: 'Gyors',
    }));
    const f = buildForm(model);
    expect(
      f
        .highlights()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.highlightsMax]);
  });

  it('flags a blank highlight text as required', () => {
    const model = validModel();
    model.highlights[0].text = '  ';
    const f = buildForm(model);
    expect(
      f.highlights[0]
        .text()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a highlight text over 280 characters', () => {
    const model = validModel();
    model.highlights[0].text = 'a'.repeat(281);
    const f = buildForm(model);
    expect(
      f.highlights[0]
        .text()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(280)]);
  });
});

describe('productFormSchema: colors', () => {
  it('passes one colour', () => {
    const f = buildForm(validModel());
    expect(
      f
        .colors()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags zero colours', () => {
    const model = validModel();
    model.colors = [];
    const f = buildForm(model);
    expect(
      f
        .colors()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.colorsMin]);
  });

  it('flags an empty colour code as required', () => {
    const model = validModel();
    model.colors[0].code = '';
    const f = buildForm(model);
    expect(
      f.colors[0]
        .code()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a colour code over 40 characters', () => {
    const model = validModel();
    model.colors[0].code = 'a'.repeat(41);
    const f = buildForm(model);
    expect(
      f.colors[0]
        .code()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(40)]);
  });

  it('flags a colour code with an uppercase letter', () => {
    const model = validModel();
    model.colors[0].code = 'Piros';
    const f = buildForm(model);
    expect(
      f.colors[0]
        .code()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.slugPattern]);
  });

  it('flags only the second of two colours sharing a code', () => {
    const model = validModel();
    const second: ColorModel = { ...model.colors[0], key: 'color-2' };
    model.colors = [model.colors[0], second];
    const f = buildForm(model);
    expect(
      f.colors[0]
        .code()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
    expect(
      f.colors[1]
        .code()
        .errors()
        .map((error) => error.message),
    ).toEqual([SERVER_FIELD_MESSAGES['DUPLICATE_COLOR_CODE']]);
  });

  it('flags a whitespace-only colour name as required', () => {
    const model = validModel();
    model.colors[0].name = '  ';
    const f = buildForm(model);
    expect(
      f.colors[0]
        .name()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a colour name over 80 characters', () => {
    const model = validModel();
    model.colors[0].name = 'a'.repeat(81);
    const f = buildForm(model);
    expect(
      f.colors[0]
        .name()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(80)]);
  });

  it('flags an empty swatchHex as required', () => {
    const model = validModel();
    model.colors[0].swatchHex = '';
    const f = buildForm(model);
    expect(
      f.colors[0]
        .swatchHex()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a swatchHex without the leading #', () => {
    const model = validModel();
    model.colors[0].swatchHex = 'ff0000';
    const f = buildForm(model);
    expect(
      f.colors[0]
        .swatchHex()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.hexPattern]);
  });

  it('flags a whitespace-only alt as required', () => {
    const model = validModel();
    model.colors[0].alt = ' ';
    const f = buildForm(model);
    expect(
      f.colors[0]
        .alt()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags an alt over 280 characters', () => {
    const model = validModel();
    model.colors[0].alt = 'a'.repeat(281);
    const f = buildForm(model);
    expect(
      f.colors[0]
        .alt()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(280)]);
  });

  it('flags a missing image', () => {
    const model = validModel();
    model.colors[0].image = null;
    const f = buildForm(model);
    expect(
      f.colors[0]
        .image()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.imageRequired]);
  });
});

describe('productFormSchema: variants', () => {
  it('passes one variant', () => {
    const f = buildForm(validModel());
    expect(
      f
        .variants()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags zero variants', () => {
    const model = validModel();
    model.variants = [];
    const f = buildForm(model);
    expect(
      f
        .variants()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.variantsMin]);
  });

  it('flags a null colorKey as required', () => {
    const model = validModel();
    model.variants[0].colorKey = null;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .colorKey()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('shows "Ismeretlen szín." when the linked colour is gone', () => {
    const model = validModel();
    model.variants[0].colorKey = 'no-such-colour';
    const f = buildForm(model);
    expect(
      f.variants[0]
        .colorKey()
        .errors()
        .map((error) => error.message),
    ).toEqual([SERVER_FIELD_MESSAGES['UNKNOWN_COLOR']]);
  });

  it('flags a colorKey whose variant id would pass 80 characters', () => {
    const model = validModel();
    model.slug = 'a'.repeat(70);
    model.colors[0].code = 'b'.repeat(10);
    model.variants[0].storageGb = 128;
    const f = buildForm(model);
    const message = SERVER_FIELD_MESSAGES['VARIANT_ID_TOO_LONG'].replace('{max}', '80');
    expect(
      f.variants[0]
        .colorKey()
        .errors()
        .map((error) => error.message),
    ).toEqual([message]);
  });

  it('flags an empty storageGb as required', () => {
    const model = validModel();
    model.variants[0].storageGb = null;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .storageGb()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags only the second of two variants sharing a colour and storage', () => {
    const model = validModel();
    const second = { ...model.variants[0], key: 'variant-2' };
    model.variants = [model.variants[0], second];
    const f = buildForm(model);
    expect(
      f.variants[0]
        .storageGb()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
    expect(
      f.variants[1]
        .storageGb()
        .errors()
        .map((error) => error.message),
    ).toEqual([SERVER_FIELD_MESSAGES['DUPLICATE_VARIANT']]);
  });

  it('flags an empty price as required', () => {
    const model = validModel();
    model.variants[0].price = null;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .price()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a non-integer price', () => {
    const model = validModel();
    model.variants[0].price = 100.5;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .price()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.integer]);
  });

  it('flags a negative price', () => {
    const model = validModel();
    model.variants[0].price = -1;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .price()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.notNegative]);
  });

  it('flags a price over 100 000 000', () => {
    const model = validModel();
    model.variants[0].price = 100_000_001;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .price()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.priceMax]);
  });

  it('flags an empty stock as required', () => {
    const model = validModel();
    model.variants[0].stock = null;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .stock()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a non-integer stock', () => {
    const model = validModel();
    model.variants[0].stock = 1.5;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .stock()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.integer]);
  });

  it('flags a negative stock', () => {
    const model = validModel();
    model.variants[0].stock = -1;
    const f = buildForm(model);
    expect(
      f.variants[0]
        .stock()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.notNegative]);
  });
});

describe('productFormSchema: specGroups', () => {
  it('passes one spec group', () => {
    const f = buildForm(validModel());
    expect(
      f
        .specGroups()
        .errors()
        .map((error) => error.message),
    ).toEqual([]);
  });

  it('flags zero spec groups', () => {
    const model = validModel();
    model.specGroups = [];
    const f = buildForm(model);
    expect(
      f
        .specGroups()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.specGroupsMin]);
  });

  it('flags a whitespace-only spec group title as required', () => {
    const model = validModel();
    model.specGroups[0].title = ' ';
    const f = buildForm(model);
    expect(
      f.specGroups[0]
        .title()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a spec group title over 120 characters', () => {
    const model = validModel();
    model.specGroups[0].title = 'a'.repeat(121);
    const f = buildForm(model);
    expect(
      f.specGroups[0]
        .title()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(120)]);
  });

  it('flags zero rows', () => {
    const model = validModel();
    model.specGroups[0].rows = [];
    const f = buildForm(model);
    expect(
      f.specGroups[0]
        .rows()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.specRowsMin]);
  });

  it('flags a whitespace-only row label as required', () => {
    const model = validModel();
    model.specGroups[0].rows[0].label = ' ';
    const f = buildForm(model);
    expect(
      f.specGroups[0].rows[0]
        .label()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a row label over 120 characters', () => {
    const model = validModel();
    model.specGroups[0].rows[0].label = 'a'.repeat(121);
    const f = buildForm(model);
    expect(
      f.specGroups[0].rows[0]
        .label()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(120)]);
  });

  it('flags a whitespace-only row value as required', () => {
    const model = validModel();
    model.specGroups[0].rows[0].value = ' ';
    const f = buildForm(model);
    expect(
      f.specGroups[0].rows[0]
        .value()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.required]);
  });

  it('flags a row value over 2000 characters', () => {
    const model = validModel();
    model.specGroups[0].rows[0].value = 'a'.repeat(2001);
    const f = buildForm(model);
    expect(
      f.specGroups[0].rows[0]
        .value()
        .errors()
        .map((error) => error.message),
    ).toEqual([MESSAGES.maxLength(2000)]);
  });
});

describe('productFormSchema: whole-form validity', () => {
  it('rejects the empty form', () => {
    const f = buildForm(emptyProductForm());
    expect(f().valid()).toBe(false);
  });

  it('accepts a filled copy of a seeded product', () => {
    const product = seedCatalog().products.find((candidate) => candidate.status === 'active');
    if (product === undefined) {
      throw new Error('seedCatalog(): no active product to build the case from');
    }
    const f = buildForm(toFormModel(product), 0);
    expect(f().valid()).toBe(true);
  });
});
