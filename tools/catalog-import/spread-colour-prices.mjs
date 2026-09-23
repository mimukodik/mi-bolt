#!/usr/bin/env node
// Post-processing step that synthesises a colour-dependent price on a
// deterministic half of the multi-colour products in data/catalog/catalog.json.
//
// Why: the catalogue data prices every colour of a given storage size
// identically, even though real handsets often carry different colour
// variants at slightly different list prices (owner ask, 2026-09-22).
// The values produced here are synthetic demo numbers; they are not
// representative of any real retail pricing.
//
// This file is NOT run by the importer (src/import.ts). Run it by hand
// from the repository root with `node tools/catalog-import/spread-colour-prices.mjs`
// after an import has refreshed data/catalog/catalog.json.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG_PATH = resolve(REPO_ROOT, "data/catalog/catalog.json");

// FNV-1a 32-bit over the UTF-8 bytes of the slug. Deterministic, no
// Math.random, so two runs of the script on the same file produce the
// same output.
function hash(slug) {
  let h = 0x811c9dc5;
  const bytes = Buffer.from(slug, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function main() {
  const raw = readFileSync(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw);
  const products = catalog.products;

  let spreadCount = 0;
  const multiColour = [];

  for (const product of products) {
    const colours = new Set(product.variants.map((v) => v.colorCode));
    if (colours.size < 2) continue;
    multiColour.push(product);

    const productHash = hash(product.slug);
    if (productHash % 2 !== 0) continue;

    const step = 1000 * (3 + (productHash % 8));
    const groups = new Map();
    for (const v of product.variants) {
      const arr = groups.get(v.storageGb) ?? [];
      arr.push(v);
      groups.set(v.storageGb, arr);
    }

    let groupsSpread = 0;
    for (const [, variants] of groups) {
      const colourSet = new Set(variants.map((v) => v.colorCode));
      if (colourSet.size < 2) continue;
      const sorted = [...variants].sort((a, b) => {
        if (a.colorCode < b.colorCode) return -1;
        if (a.colorCode > b.colorCode) return 1;
        return 0;
      });
      const base = Math.min(...sorted.map((v) => v.priceHuf));
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].priceHuf = base + i * step;
      }
      groupsSpread++;
    }

    spreadCount++;
    process.stderr.write(
      `${product.slug}: ${groupsSpread} storage groups spread, step ${step}\n`
    );
  }

  process.stderr.write(
    `spread ${spreadCount} of ${multiColour.length} multi-colour products\n`
  );

  // Skip the write when nothing changed, so an empty run does not bump
  // catalog.json's mtime/SHA and pollute git status and diff-based
  // change detection.
  if (spreadCount === 0) return;

  // Atomic write: write to a temp file and rename, so a crash or signal
  // mid-write cannot leave catalog.json half-written. The sibling
  // importer uses the same pattern for the same reason.
  const tmpPath = `${CATALOG_PATH}.tmp`;
  const out = JSON.stringify(catalog, null, 2) + "\n";
  writeFileSync(tmpPath, out, "utf8");
  renameSync(tmpPath, CATALOG_PATH);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
