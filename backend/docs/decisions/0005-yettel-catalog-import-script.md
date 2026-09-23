# 0005 — yettel.hu catalogue import script (MIM-205 T3)

## Situation

The demo backend needs a starter catalogue that exercises every contract feature
in `api/openapi.yaml` (storage × colour matrix, 5G flag, popularity ranking,
out-of-stock variants). The contract specifies that the seed comes from
`yettel.hu` (docs/02 §6.1), and the backend (T4) loads it at startup from
`data/catalog/catalog.json`. The catalogue must be reproducible, validated
against a fixed schema, and shipped with downloaded product images.

The import is a one-shot helper script: not run by CI, not unit-tested. The
backend that consumes it (T4) is what has contract-level tests; this script
fails loudly if the source layout drifts and never writes a partial
`catalog.json`.

## Options

1. **Self-contained Node + TypeScript project at `scripts/catalog-import/`.**
   A separate `package.json` with `playwright` (Chromium only), `tsx`, `ajv`.
   Invoked with `pnpm --dir scripts/catalog-import import`. No coupling to
   the repository's Spring tooling or the root `package.json`.
2. **Reuse the root `package.json`.** Add Playwright to the agent-tooling
   dependency set. Couples the import tooling with `.claude/hooks/` and
   `scripts/agent-memory.ts`; requires the agent-tooling workspace to grow a
   browser dependency that no other consumer needs.
3. **Java/Gradle subproject.** Reuses the JDK already required by the
   backend, but Playwright's Java port is less mature, and adding a JS engine
   to the Gradle classpath for one-off scraping is heavy.
4. **Hand-curated JSON.** A few hand-written entries to exercise the matrix.
   Cannot satisfy docs/02 §6.1's "as large as possible" expectation; the
   reviewer would treat it as missing work.

## Decision

Option 1. A self-contained Node + TypeScript project:

- Lives at `scripts/catalog-import/` with its own `package.json`, `tsconfig.json`,
  `src/`, `.gitignore`. `node_modules/` and `dist/` are gitignored inside the
  folder.
- Uses `playwright` (Chromium-only download via `playwright install chromium`),
  `tsx` for direct TS execution, `ajv` + `ajv-formats` for JSON Schema
  validation. Three runtime deps; justified one-by-one in this file.
- Outputs are committed at `data/catalog/catalog.json` and
  `data/catalog/catalog.schema.json`. Every downloaded image lands at
  `data/catalog/images/<sha256>.<ext>` and is committed too — the user
  asked for the full snapshot in the repository, so `data/catalog/images/`
  is NOT gitignored (only `data/catalog/catalog.invalid.json`, the
  transient `scripts/catalog-import/node_modules/`, `dist/` and `.cache/`
  are).
- Run from a freshly cloned worktree with:
  `pnpm --dir scripts/catalog-import install &&
   pnpm --dir scripts/catalog-import exec playwright install chromium &&
   pnpm --dir scripts/catalog-import import`
- `--limit N` flag stops after the first N listing products (and only their
  swatch siblings); non-numeric values are rejected. Useful for quick smoke
  runs. With a finite `LIMIT` the script writes
  `data/catalog/catalog.partial.json` (gitignored) so the partial snapshot
  cannot overwrite the committed full `catalog.json`. The committed
  `catalog.json` is always the result of an unbounded run.
- `--source URL` overrides the starting listing URL (default
  `https://www.yettel.hu/mobiltelefon`).
- `--refresh` re-fetches EVERY page and re-downloads EVERY image; not for
  routine use, the script header documents this. A full site refetch is
  heavy and should only run after a deliberate cache wipe.
- `--refresh-urls u1,u2,…` re-fetches only the named URLs (comma-separated);
  the cache file for any URL still incomplete after one retry is not
  written, and the URL is logged as `[page] INCOMPLETE`.
- `--verify-cache <url>` fetches one URL live, parses it, then re-parses from
  cache and compares.
- Without `--refresh`, the script serves HTML from
  `scripts/catalog-import/.cache/pages/<sha1(url)>.html` and reuses images
  already on disk via the index
  `scripts/catalog-import/.cache/images.json`. The cache survives an
  interrupted run, so a kill-and-resume never re-downloads what is already
  on disk. Cache state is gitignored.
- On a cache hit `politeGoto` swaps `waitUntil: "domcontentloaded"` for
  `waitUntil: "commit"` and the parsers skip the `acceptCookies` /
  `waitForSelector(".product-variant-item--color")` calls — the cached
  HTML is already fully rendered, so a 10 s JS wait on every product would
  add ~10 s × every cached read. A proving run reports
  `pagesFetched: 0`, `imagesDownloaded: 0` when every URL and every image
  hash was already on disk.
- On a live fetch of a variant page `politeGoto` waits up to 15 s for the
  price block (`[data-ref="device-list-price"]`) to become non-empty, or
  5 s for the genuine "not sold in this colour" copy
  ("A készüléket a kiválasztott színben jelenleg nem értékesítjük"). On a
  live fetch of a listing page it waits up to 15 s for the product-link
  nodes (`[data-ref="product-url"]`) instead, because the price block
  never appears on listings. If the wait fails the script retries the URL
  once; if it still fails the cache file is NOT written and the URL is
  logged as `[page] INCOMPLETE` and listed in the run report under
  `failedUrls`.

### Source layout and selectors that the script depends on

The script is fragile to UI changes. The exact selectors it relies on:

- **Listing pagination**: `https://www.yettel.hu/mobiltelefon?page=N`. Walks
  pages 1..30; stops on the first page that yields fewer than 10 unique
  product anchors (real listings emit 30–60 cards; below 10 the page is
  promotional/empty and would otherwise be saved as a 5-anchor fake
  listing).
- **Product card link**: anchors matching
  `^https://www\.yettel\.hu\/mobiltelefon\/[a-z0-9-]+-\d+gb-p\d+-residential$`
  AFTER query-string stripping and host-prefixing. The page emits *relative*
  hrefs (`/mobiltelefon/<slug>`); the collector resolves them against
  `https://www.yettel.hu` before applying the regex — without that, only
  the five absolute sidebar/promo anchors on each page pass the pattern
  and the run collects 5 products instead of 100+. The `residential`
  suffix excludes business and refurbished segments.
- **Colour variants are pages**: yettel.hu renders the colour swatches as
  anchor links to distinct URLs (`-p<id>-residential` per colour); the
  script visits every sibling URL the product page exposes, parses each as
  its own variant, and dedupes the resulting raw variants by
  `(familySlug, colourCode, storageGb)`.
- **No-price drop rule**: a variant page whose only price block is the
  subscription price (`.product-price-details__title` ≠ "Készülék
  listaár") produces no variant — it is dropped and counted in the
  report's `droppedVariants` array with `reason: "no one-off price on
  page"`. The script never fabricates a price.
- **Product name**: `<h1>` text. Stripped of `, <Color>` suffix and
  `<N>GB`/`<N>/<N>GB` tail.
- **Storage**: parsed from the URL segment `-<n>gb-` (with `n % 1000` falling
  into `{128, 256, 512}`), then re-confirmed from the H1 with the
  `(\d+)/(\d+)?GB` regex. Variants outside the OpenAPI `StorageGb` enum are
  dropped and counted in the report.
- **One-off device price**: `.product-price-details` whose
  `.product-price-details__title` is `Készülék listaár`. Other prices in the
  same block (kedvezmény, havidíj, részlet) are ignored.
- **Colour swatches**: `.product-variant-item--color` items, each with a
  `.product-variant-item__color-preview` carrying the hex in
  `style.background-color`. The Hungarian colour name is read from the
  swatch's `title` attribute (not from the inner text, which is empty on
  Yettel); on the variant page the script then collects every colour
  sibling as its own variant.
- **Product image**: the first `<img src="…/product_images/….{png,webp,jpg}">`
  inside `.product-details__gallery` (the product gallery;
  `.binkies-gallery` only contains blob URLs that load later), excluding
  `energy-label` and `label-` files. The DOM order outside the gallery
  is the recommendation carousel and carries OTHER phones' images;
  sorting by the width token is a no-op because every candidate is
  `300x600`.
- **Spec groups**: yettel renders each spec group as its own `<table>`
  inside `.specification__boxes`; the group label is a thead
  `<th class="boxes__title" colspan="2">` and the rows below it are the
  group. Tables without a `boxes__title` become the "Egyéb" group.
- **5G detection**: any spec row whose label equals `5G` (case-insensitive)
  and whose value starts with `Igen`.
- **Highlights**: `.emphasized-properties__item` at the top of the page; the
  first line is treated as the label and the rest as the value.
- **Description**: the first `[class*='description']` block whose text is
  longer than 80 characters and not a cookie/compare/newsletter snippet.

Any of these may break when yettel.hu ships a redesign; the
`error parsing <url>` log line is the only signal until the script fails
schema validation.

### Field-assignment rules (deterministic from the source or the rank)

| Field | Rule |
|---|---|
| `slug` | `<brand>-<name>`, both slugified (ASCII lowercase, hyphens, accents stripped). Brand prefix removed from name when it repeats the brand word. Disambiguation suffix `-2`, `-3`, ... on collision. |
| `brand` | URL prefix → manufacturer (`apple → Apple`, `google-pixel → Google Pixel`, `xiaomi → Xiaomi`, `honor → HONOR`, `samsung → Samsung`, `vivo → Vivo`, `motorola → Motorola`, `huawei → HUAWEI`). |
| `name` | `<h1>` with the trailing `, <Color>` and `<N>GB`/`<N>/<N>GB` stripped. |
| `highlights` | The first 1–6 entries from the page's `.emphasized-properties__item` (label + value). When the source has none, the first four spec rows whose label mentions camera/battery/processor/display/memory/charging are used. A final placeholder is added when both fall through. |
| `description` | The first descriptive block on the page (the source's product blurb). Whitespace collapsed and capped at 1500 characters. |
| `is5g` | `true` iff any spec row reads `5G — Igen`. |
| `releasedAt` | Deterministic date within the last three years derived from the rank: `RELEASE_EPOCH - round(rank/N * 3y)`, where `RELEASE_EPOCH` is the fixed `2026-09-01` constant in the script. yettel.hu does not expose release dates on the consumer product page, so this is reported as an `uncertain` field; two runs on the same source produce identical `releasedAt`. |
| `rank` | 1-based position in the order the listing emitted the family. |
| `popularityScore` | `round(100 - 100*(rank-1)/(N-1))` clamped to `[0, 100]`, where `N` is the position count across all families the listing emitted, including dropped ones. First product = 100; the last kept product is not necessarily 0 because dropped families still occupy a position. |
| `featured` | `true` for exactly the first four products by rank. |
| `specGroups` | Parsed from `#specification .specification__boxes`. Empty groups filtered; products with no spec rows receive a single "Egyéb" placeholder group so the contract's `minItems: 1` holds. |
| `colors[].code` | `slugify(colorName)` — same ASCII rule as product slugs. |
| `colors[].name` | The Hungarian name as printed on the swatch (e.g. "Sötétkék"). |
| `colors[].swatchHex` | The `style.background-color` of the swatch, converted to `#RRGGBB`. |
| `colors[].image.alt` | `"<productName> <colorName>"` in Hungarian. |
| `colors[].image.width`/`height` | Pixel dimensions read from the PNG/JPEG/WebP header. |
| `colors[].image.file` | `<sha256>.<ext>` where the hash is SHA-256 of the bytes and `<ext>` is `webp`/`jpg`/`png` according to the real `Content-Type`. |
| `variants[].id` | `<productSlug>--<colorCode>--<storageGb>`. |
| `variants[].slug` | `slugify("<colorName>-<storageGb>gb")`, suffixed on per-product collision. |
| `variants[].colorCode` | The colour's code from `colors[].code`. |
| `variants[].storageGb` | One of `128`, `256`, `512`. URL parsing with `n % 1000` fallback to handle the `RAMS+storage` concatenation yettel uses (e.g. `12256gb` = 12 GB RAM + 256 GB storage). |
| `variants[].priceHuf` | The `Készülék listaár` integer. When the page only lists a subscription price, the variant is dropped and counted. |
| `variants[].stock` | Base value `sha256(variantId)[0] % 13` (so 0..12). OOS variants (pages whose copy says "A készüléket a kiválasztott színben jelenleg nem értékesítjük") carry `stock: 0` directly. After the full catalogue is built, when fewer than five variants already have `stock: 0`, the bottom five by `<productSlug>/<variantId>` hash are forced to `0` so the demo always shows out-of-stock (docs/02 §6.1). |

### Image provenance and copyright

The downloaded images are yettel.hu's product shots. They are reproduced
under the same terms a customer sees them on the public site — for the
internal demo only, never redistributed. The script writes them as
content-addressed files (`<sha256>.<ext>`) so the eventual move to a CDN
changes stored URLs, not the contract (docs/02 §6.2).

### What the script does not do

- No retry on transient HTTP failures beyond the single retry in
  `politeGoto` (described above). A second-pass `--limit` run picks up
  where a partial run left off because images are content-addressed.
- No unit tests. The contract lives in `data/catalog/catalog.schema.json`
  and the script aborts on validation failure; that's the entire test bar.
- No writes to `build.gradle`, `src/`, `api/openapi.yaml`, the root
  `package.json`, or any other docs file outside this decision.

## Consequences

- The script adds about 50 MiB to a fresh worktree (Node modules + Chromium
  download). The download is one-off and the browser binary is cached under
  `~/.cache/ms-playwright/`.
- A yettel.hu redesign that changes one of the selectors listed above will
  break the script and require a new probe round; nothing in the contract
  protects against that.
- Field values like `releasedAt`, `popularityScore`, `rank`, `featured`,
  `stock` are deterministic functions of the source order and the variant
  id, so two runs with the same source produce identical `catalog.json`.
- The committed `data/catalog/images/` lives in the repository (the user
  asked for the full snapshot). A fresh checkout therefore has the bytes;
  the script's download step is a no-op when every hash is already on disk.
  Only `data/catalog/catalog.invalid.json` (the validation-failure
  fallback) is gitignored.

## Date and status

2026-09-19 — Active (MIM-205 T3).
