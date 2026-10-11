#!/usr/bin/env node
// Generator for docs/api/fixtures/catalog.json.
//
// Reads data/catalog/catalog.json (the backend's single copy, in
// source order with the 48 products, 92 variants and 83 colours the
// catalogue ships with) and emits a
// fixture shaped exactly like the OpenAPI 2.0.0 contract: the
// `Product` per product and a parallel `ranking[]` array holding the
// fields the handlers need but `Product` does not carry
// (`additionalProperties: false` on ProductBase and Product).
//
// `node scripts/build-catalog-fixture.mjs` writes the file.
// `node scripts/build-catalog-fixture.mjs --check` exits 1 with a
// one-line message when the committed file is stale; the
// `fixtures:catalog:check` npm script is the CI entry point for the
// drift guard.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const SOURCE_PATH = join(ROOT, '../data/catalog/catalog.json');
const OUTPUT_PATH = join(ROOT, 'docs/api/fixtures/catalog.json');

/** Per-line maximum the cart honours; matches the backend constant. */
const MAX_PER_LINE = 5;

/** Slugify a label the way the backend's `SpecGroup.id` is computed. */
function slugify(label) {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Walk `specGroups` and replace duplicate slugs inside one product
 * with `-<position>` (0-based index of the duplicate, where the
 * first occurrence keeps its plain slug).
 */
function dedupeSpecSlugs(specGroups) {
  const seen = new Map();
  return specGroups.map((group) => {
    const base = slugify(group.label);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    return { id, title: group.label, rows: group.rows };
  });
}

/** Strip the .png from an image filename to get the content-addressed id. */
function imageId(file) {
  return file.endsWith('.png') ? file.slice(0, -4) : file;
}

function buildProducts(source) {
  const products = [];
  const ranking = [];
  const promotions = [];
  source.forEach((p, index) => {
    const id = String(index + 1);
    if (p.promotion !== undefined) {
      promotions.push({
        productId: id,
        ...p.promotion,
        variants: p.variants
          .filter((variant) => variant.salePriceHuf !== undefined && variant.salePriceHuf !== null)
          .map((variant) => ({
            variantId: variant.id,
            salePriceHuf: variant.salePriceHuf,
            referencePriceHuf: variant.referencePriceHuf ?? variant.priceHuf,
          })),
      });
    }

    // Map every colour once so the variants can pick colorName / swatchHex.
    const colourByCode = new Map();
    for (const colour of p.colors) {
      colourByCode.set(colour.code, colour);
    }

    // Variants ordered by id ascending (lexicographic), per the backend's
    // @OrderBy("id") on the JPA side. Each variant carries one image
    // resolved from its colour's image record.
    const variants = p.variants
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((variant) => {
        const colour = colourByCode.get(variant.colorCode);
        const img = colour.image;
        return {
          id: variant.id,
          slug: variant.slug,
          colorCode: variant.colorCode,
          colorName: colour.name,
          swatchHex: colour.swatchHex,
          storageGb: variant.storageGb,
          price: { amount: variant.priceHuf, currency: 'HUF' },
          availability: variant.stock > 0 ? 'in_stock' : 'out_of_stock',
          maxQuantity: variant.stock <= 0 ? 0 : Math.min(variant.stock, MAX_PER_LINE),
          images: [
            {
              id: imageId(img.file),
              src: `/api/v1/media/${imageId(img.file)}`,
              alt: img.alt,
              width: img.width,
              height: img.height,
            },
          ],
        };
      });

    const specGroups = dedupeSpecSlugs(p.specGroups);

    // The brief stores colour order in ranking[].colorOrder so the store
    // does not guess: the source `colors[]` order is the order of first
    // appearance of colorCode in the product's variants as generated
    // here.
    const colorOrder = [];
    const seenCodes = new Set();
    for (const variant of variants) {
      if (seenCodes.has(variant.colorCode)) continue;
      seenCodes.add(variant.colorCode);
      colorOrder.push(variant.colorCode);
    }

    products.push({
      id,
      slug: p.slug,
      brand: p.brand,
      name: p.name,
      highlights: p.highlights,
      is5g: p.is5g,
      releasedAt: p.releasedAt,
      description: p.description,
      variants,
      specGroups,
    });

    ranking.push({
      slug: p.slug,
      rank: p.rank,
      popularityScore: p.popularityScore,
      featured: p.featured,
      colorOrder,
    });
  });
  return { products, ranking, ...(promotions.length > 0 ? { promotions } : {}) };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');

  const raw = JSON.parse(readFileSync(SOURCE_PATH, 'utf8'));
  const source = Array.isArray(raw) ? raw : raw.products;
  if (!Array.isArray(source)) {
    throw new Error(
      `[build-catalog-fixture] expected array under 'products' in ${SOURCE_PATH}, got ${typeof source}`,
    );
  }
  const output = `${JSON.stringify(buildProducts(source), null, 2)}\n`;

  if (check) {
    let committed;
    try {
      committed = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      console.error(`[build-catalog-fixture] ${OUTPUT_PATH} missing; run without --check`);
      process.exit(1);
    }
    if (committed !== output) {
      console.error(`[build-catalog-fixture] ${OUTPUT_PATH} is out of date; rerun without --check`);
      process.exit(1);
    }
    return;
  }

  writeFileSync(OUTPUT_PATH, output);
}

main();
