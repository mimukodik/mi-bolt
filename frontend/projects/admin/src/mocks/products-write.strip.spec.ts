/**
 * Spec for the free-text stripping inside `products-write.handlers.ts`: the
 * nine free-text members (`brand`, `name`, `description`, each `highlights`
 * item, each colour `name` and `alt`, each spec group `title`, each spec row
 * `label` and `value`) are stored stripped with Java's `String.strip()` on
 * create and replace, while `slug`, colour `code` and every variant member
 * stay as sent. Every expected value is a literal read from the seeded
 * catalogue's product 5 (`honor-600-lite`), never computed with the handler
 * code under test.
 */
import { describe, expect, it } from 'vitest';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminProductInput } from '../app/api/generated/models/admin-product-input';

import { useMswServer } from '../testing/msw-server';
import {
  inputOf,
  post,
  productUrl,
  productsUrl,
  put,
  requireProduct,
  setup,
} from '../testing/mock-spec-helpers';

useMswServer();

/** Pads a string with the padding the brief's edge cases share: a tab, a leading space and a trailing newline. */
function pad(value: string): string {
  return ` \t${value} \n`;
}

function paddedInputOf(product5: AdminProduct, slug: string): AdminProductInput {
  return {
    ...inputOf(product5),
    slug,
    featured: false,
    brand: pad(product5.brand),
    name: pad(product5.name),
    description: pad(product5.description),
    highlights: product5.highlights.map(pad),
    colors: product5.colors.map((color) => ({
      code: color.code,
      name: pad(color.name),
      swatchHex: color.swatchHex,
      imageId: color.image.id,
      alt: pad(color.image.alt),
    })),
    specGroups: product5.specGroups.map((group) => ({
      title: pad(group.title),
      rows: group.rows.map((row) => ({ label: pad(row.label), value: pad(row.value) })),
    })),
  };
}

describe('productsWriteHandlers free-text stripping', () => {
  it('create stores the nine free-text members stripped', async () => {
    const db = setup();
    const product5 = requireProduct(db, 5);
    const input = paddedInputOf(product5, 'honor-600-lite-strip');

    const response = await post(productsUrl(), db, input);

    expect(response.status).toBe(201);
    const stored = requireProduct(db, 49);
    expect(stored.brand).toBe(product5.brand);
    expect(stored.name).toBe(product5.name);
    expect(stored.description).toBe(product5.description);
    expect(stored.highlights).toEqual(product5.highlights);
    expect(stored.colors.map((c) => [c.name, c.image.alt])).toEqual(
      product5.colors.map((c) => [c.name, c.image.alt]),
    );
    expect(stored.specGroups).toEqual(product5.specGroups);
  });

  it('create keeps slug, colour code and variant slugs as sent', async () => {
    const db = setup();
    const product5 = requireProduct(db, 5);
    const input = paddedInputOf(product5, 'honor-600-lite-strip');

    const response = await post(productsUrl(), db, input);

    expect(response.status).toBe(201);
    const stored = requireProduct(db, 49);
    expect(stored.slug).toBe('honor-600-lite-strip');
    expect(stored.colors.map((c) => c.code)).toEqual(product5.colors.map((c) => c.code));
    expect(stored.variants.map((v) => v.slug)).toEqual(product5.variants.map((v) => v.slug));
  });

  it('replace stores the nine free-text members stripped', async () => {
    const db = setup();
    const product5 = requireProduct(db, 5);
    const before = {
      brand: product5.brand,
      name: product5.name,
      description: product5.description,
      highlights: product5.highlights,
      colors: product5.colors.map((c) => [c.name, c.image.alt]),
      specGroups: product5.specGroups,
    };
    const input = paddedInputOf(product5, product5.slug);

    const response = await put(productUrl(5), db, input, { 'If-Match': '"0"' });

    expect(response.status).toBe(200);
    const stored = requireProduct(db, 5);
    expect(stored.brand).toBe(before.brand);
    expect(stored.name).toBe(before.name);
    expect(stored.description).toBe(before.description);
    expect(stored.highlights).toEqual(before.highlights);
    expect(stored.colors.map((c) => [c.name, c.image.alt])).toEqual(before.colors);
    expect(stored.specGroups).toEqual(before.specGroups);
  });

  it('a no-break space survives, as Java strip keeps it', async () => {
    const db = setup();
    const product5 = requireProduct(db, 5);
    const input: AdminProductInput = {
      ...inputOf(product5),
      slug: 'honor-600-lite-strip',
      featured: false,
      brand: ' ' + product5.brand + ' ',
    };

    const response = await post(productsUrl(), db, input);

    expect(response.status).toBe(201);
    expect(requireProduct(db, 49).brand).toBe(' ' + product5.brand + ' ');
  });

  it('a U+001F unit separator is stripped, as Java strip removes it', async () => {
    const db = setup();
    const product5 = requireProduct(db, 5);
    const input: AdminProductInput = {
      ...inputOf(product5),
      slug: 'honor-600-lite-strip',
      featured: false,
      brand: '\u001f' + product5.brand,
    };

    const response = await post(productsUrl(), db, input);

    expect(response.status).toBe(201);
    expect(requireProduct(db, 49).brand).toBe(product5.brand);
  });
});
