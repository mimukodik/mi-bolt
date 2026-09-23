// Helper script that downloads the yettel.hu phone catalogue and writes
// data/catalog/{catalog.json,catalog.schema.json,images/<sha256>.<ext>}.
//
// Usage (run from scripts/catalog-import/):
//   pnpm exec tsx src/import.ts [--limit N] [--source URL]
//                                [--refresh] [--refresh-urls u1,u2,…]
//                                [--verify-cache <url>]
//
// Flags:
//   --limit N          parse only the first N listing products (and only
//                      their swatch siblings); rejects a non-numeric value.
//   --source URL       starting listing URL (default:
//                      https://www.yettel.hu/mobiltelefon).
//   --refresh          re-fetch EVERY page and re-download EVERY image.
//                      Not for routine use: a full site refetch is heavy
//                      and should only run after a deliberate cache wipe.
//   --refresh-urls u1,u2,…  re-fetch only the named URLs; the cache file
//                      for any URL still incomplete after the retry is
//                      not written. Use this to repair specific snapshots.
//   --verify-cache <url>  fetch a single URL live, parse it, then re-parse
//                      from cache, and compare. Useful for debugging.
//
// Decisions and field-assignment rules are documented in
// docs/decisions/0005-yettel-catalog-import-script.md.

import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync as readFileSyncSync } from "node:fs";
import { createHash } from "node:crypto";
import { argv, exit, stderr, stdout } from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createWriteStream } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 mi-bolt-catalog-import/0.1";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = join(REPO_ROOT, "data/catalog");
const IMAGE_DIR = join(DATA_DIR, "images");
const SCHEMA_PATH = join(DATA_DIR, "catalog.schema.json");
const OUTPUT_PATH = join(DATA_DIR, "catalog.json");
const PARTIAL_OUTPUT_PATH = join(DATA_DIR, "catalog.partial.json");
const INVALID_OUTPUT_PATH = join(DATA_DIR, "catalog.invalid.json");
const CACHE_DIR = join(REPO_ROOT, "scripts/catalog-import/.cache");
const PAGE_CACHE_DIR = join(CACHE_DIR, "pages");
const IMAGE_INDEX_PATH = join(CACHE_DIR, "images.json");
const IMPORT_LOG_PATH = join(CACHE_DIR, "import.log");
const POLITE_DELAY_MS = 150;
// Fixed epoch so two runs on the same source produce identical `releasedAt`.
// Recorded in decision 0005.
const RELEASE_EPOCH = "2026-09-01";

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

let pageFetched = 0;
let pageCached = 0;
let imageDownloaded = 0;
let imageReused = 0;

const args = new Map<string, string>();
for (let i = 2; i < argv.length; i += 1) {
  const a = argv[i]!;
  if (a.startsWith("--")) {
    const v = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true";
    args.set(a.slice(2), v);
  }
}
const SOURCE = args.get("source") ?? "https://www.yettel.hu/mobiltelefon";
const REFRESH = args.has("refresh");
const REFRESH_URLS = (args.get("refresh-urls") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const VERIFY_CACHE_URL = args.get("verify-cache");

// --limit must parse as a positive integer. `Number("true")` is NaN and
// would silently disable the cap; reject it explicitly.
function parseLimit(): number {
  if (!args.has("limit")) return Infinity;
  const raw = args.get("limit")!;
  if (!/^\d+$/.test(raw)) {
    stderr.write(`FATAL: --limit must be a positive integer, got "${raw}"\n`);
    exit(2);
  }
  return Math.max(1, Number(raw));
}
const LIMIT = parseLimit();

let logStream: ReturnType<typeof createWriteStream> | null = null;
async function logInit(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  logStream = createWriteStream(IMPORT_LOG_PATH, { flags: "a" });
}
function logLine(line: string): void {
  stderr.write(line + "\n");
  if (logStream) logStream.write(line + "\n");
}
function log(msg: string): void { logLine(`[import] ${msg}`); }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(input: string): string {
  // Normalise "+" to " plus " so "S26+" becomes "s26-plus" before the
  // generic non-alphanumeric filter strips the symbol; this keeps the
  // "S26+" / "S26" distinction that yettel relies on.
  const plusified = input.replace(/\+/g, " plus ");
  const ascii = plusified
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return ascii.replace(/-{2,}/g, "-");
}

function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const [, r, g, b] = m;
  return "#" + [r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function stripScripts(html: string): string {
  return html.replace(SCRIPT_RE, "");
}

function brandSlugPrefix(brand: string, familySlug: string): string {
  const f = familySlug.toLowerCase();
  const b = brand.toLowerCase();
  if (b === "honor" && f.startsWith("honor-")) return "honor";
  // Brand is "Google Pixel"; the slug starts with `google-pixel`, so
  // compare against that token. The previous code compared against
  // `google pixel` (with a space) and never matched, producing
  // `google-pixel-google-pixel-…` slugs.
  if (b === "google pixel" && f.startsWith("google-pixel")) return "google-pixel";
  if (b === "huawei" && f.startsWith("huawei")) return "huawei";
  return b.split(" ")[0]!;
}

function productSlugFor(brand: string, name: string, familySlug: string): string {
  const brandWord = brandSlugPrefix(brand, familySlug);
  const lowerName = name.toLowerCase();
  // Compare the brand word against both the space-separated and
  // hyphen-separated forms so "google-pixel" matches "google pixel"
  // (and vice versa). The previous code only checked `startsWith(brandWord + " ")`
  // which never matched when brandWord was hyphenated.
  const brandWordAlt = brandWord.replace(/-/g, " ");
  const prefix = lowerName.startsWith(brandWord + " ")
    ? brandWord + " "
    : lowerName.startsWith(brandWordAlt + " ")
    ? brandWordAlt + " "
    : null;
  if (prefix) {
    return slugify(`${brand} ${name.slice(prefix.length)}`);
  }
  return slugify(`${brand} ${name}`);
}

function ensureUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function storageFromSlug(n: number): number | null {
  const set = new Set([128, 256, 512]);
  if (set.has(n)) return n;
  const tail = n % 1000;
  return set.has(tail) ? tail : null;
}

function parseStorageFromText(text: string): number | null {
  const slash = text.match(/(\d+)\s*\/\s*(\d+)\s*gb/i);
  if (slash) {
    const n = Number(slash[2]);
    if ([128, 256, 512].includes(n)) return n;
  }
  const single = text.match(/(\d+)\s*gb/i);
  if (single) {
    const n = Number(single[1]);
    if ([128, 256, 512].includes(n)) return n;
  }
  return null;
}

function parseHuf(text: string): number | null {
  const m = text.match(/([\d\s]+)\s*Ft/i);
  if (!m) return null;
  const digits = (m[1] ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

function stripDiacriticsLower(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Stable epoch so two runs on the same source yield identical `releasedAt`.
// Recorded in decision 0005.
function deriveReleasedAt(rank: number, total: number): string {
  const epochMs = Date.parse(`${RELEASE_EPOCH}T00:00:00Z`);
  const threeYearsMs = 3 * 365 * 24 * 60 * 60 * 1000;
  const ratio = total > 1 ? (rank - 1) / (total - 1) : 0;
  const offset = Math.round(ratio * threeYearsMs);
  const t = epochMs - offset;
  return new Date(t).toISOString().slice(0, 10);
}

function popularityForRank(rank: number, total: number): number {
  if (total <= 1) return 100;
  const score = Math.round(100 - 100 * (rank - 1) / (total - 1));
  return Math.max(0, Math.min(100, score));
}

function stockFor(variantId: string): number {
  const h = createHash("sha256").update(variantId).digest();
  return h[0]! % 13;
}

// ---------- minimal dimension probe (PNG / JPEG / WebP headers) ----------

function probeImageDimensions(bytes: Buffer, ext: string): { width: number; height: number } | null {
  if (ext === "png") {
    if (bytes.length >= 24 && bytes.toString("ascii", 1, 4) === "PNG") {
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    return null;
  }
  if (ext === "jpg") {
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1]!;
      if (marker === 0xd8) { i += 2; continue; }
      if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue; }
      if (marker === 0xd9) return null;
      const segLen = bytes.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) ||
          (marker === 0xda)) {
        if (i + 9 < bytes.length) {
          return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
        }
      }
      i += 2 + segLen;
    }
    return null;
  }
  if (ext === "webp") {
    if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
      const chunk = bytes.toString("ascii", 12, 16);
      if (chunk === "VP8X") {
        const w = 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
        const h = 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
        return { width: w, height: h };
      }
      if (chunk === "VP8 ") {
        return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
      }
    }
    return null;
  }
  return null;
}

// ---------- image index ----------

function loadImageIndex(): Map<string, { file: string; width: number; height: number }> {
  if (!existsSync(IMAGE_INDEX_PATH)) return new Map();
  try {
    const parsed = JSON.parse(readFileSyncSync(IMAGE_INDEX_PATH, "utf8")) as Record<string, { file: string; width: number; height: number }>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

let imageIndexSaveInFlight: Promise<void> | null = null;
function saveImageIndex(map: Map<string, { file: string; width: number; height: number }>): Promise<void> {
  const prev = imageIndexSaveInFlight;
  const next = (async () => {
    if (prev) await prev;
    await writeFile(IMAGE_INDEX_PATH, JSON.stringify(Object.fromEntries(map), null, 2) + "\n", "utf8");
  })();
  imageIndexSaveInFlight = next;
  return next;
}

async function downloadImage(
  ctx: BrowserContext,
  url: string,
  outDir: string,
  index: Map<string, { file: string; width: number; height: number }>
): Promise<{ hash: string; ext: string; path: string; width: number; height: number; reused: boolean; bytes: number } | null> {
  const existing = index.get(url);
  if (!REFRESH && existing && existsSync(join(outDir, existing.file))) {
    imageReused += 1;
    const bytes = readFileSyncSync(join(outDir, existing.file));
    const ext = existing.file.split(".").pop() ?? "";
    logLine(`[image] REUSED ${url} -> images/${existing.file}`);
    return {
      hash: existing.file.split(".")[0]!,
      ext,
      path: join(outDir, existing.file),
      width: existing.width,
      height: existing.height,
      reused: true,
      bytes: bytes.byteLength,
    };
  }
  // Polite delay on every actual download (network is shared with the
  // catalogue HTML fetch).
  await sleep(POLITE_DELAY_MS);
  const res = await ctx.request.get(url, { timeout: 30_000 });
  if (!res.ok()) return null;
  const ct = (res.headers()["content-type"] ?? "").toLowerCase();
  let ext = "bin";
  if (ct.includes("webp")) ext = "webp";
  else if (ct.includes("jpeg") || ct.includes("jpg")) ext = "jpg";
  else if (ct.includes("png")) ext = "png";
  if (!["webp", "jpg", "png"].includes(ext)) return null;
  const bytes = Buffer.from(await res.body());
  const hash = sha256Hex(bytes);
  const file = `${hash}.${ext}`;
  const path = join(outDir, file);
  const dims = probeImageDimensions(bytes, ext);
  if (!dims) return null;
  await writeFile(path, bytes);
  index.set(url, { file, width: dims.width, height: dims.height });
  imageDownloaded += 1;
  await saveImageIndex(index);
  logLine(`[image] DOWNLOADED ${url} -> images/${file} (${bytes.byteLength} B)`);
  return { hash, ext, path, width: dims.width, height: dims.height, reused: false, bytes: bytes.byteLength };
}

// ---------- page cache ----------

function pageCachePath(url: string): string {
  const h = createHash("sha1").update(url).digest("hex");
  return join(PAGE_CACHE_DIR, `${h}.html`);
}

// Live-fetch a page. Variant pages wait for the price block (or the
// "not sold in this colour" copy) to actually be in the DOM; listing
// pages have no price block, so they wait for the product-link nodes
// (`[data-ref="product-url"]`) instead. `requirePrice=false` selects
// the listing path. Throws on timeout so the caller can decide whether
// to retry.
async function fetchAndCache(page: Page, url: string, reason: string, requirePrice = true): Promise<string> {
  const cachePath = pageCachePath(url);
  const cachedHash = cachePath.split("/").pop()!;
  const t0 = Date.now();
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!res) throw new Error(`no response: ${url}`);
  if (res.status() >= 400) throw new Error(`HTTP ${res.status()} for ${url}`);
  await sleep(POLITE_DELAY_MS);
  let priceNonEmpty = false;
  let notSold = false;
  let productLinks = false;
  if (requirePrice) {
    // Live fetches only: wait for the price block to render so the parser
    // sees it. The container is in the server HTML but empty until the
    // price XHR lands; without this wait we cache a half-rendered page.
    try {
      await page.waitForFunction(
        () => {
          const text = document.querySelector('[data-ref="device-list-price"]')?.textContent?.trim() ?? "";
          return text.length > 0;
        },
        { timeout: 15_000 }
      );
      priceNonEmpty = true;
    } catch {
      // Fall through; check the "not sold in this colour" copy next.
    }
    if (!priceNonEmpty) {
      try {
        await page.waitForFunction(
          () => /A készüléket a kiválasztott színben jelenleg nem értékesítjük/.test(document.body.innerText ?? ""),
          { timeout: 5_000 }
        );
        notSold = true;
      } catch {
        // Neither arrived — the page is genuinely incomplete.
      }
    }
    if (!priceNonEmpty && !notSold) {
      throw new Error(`price block stayed empty for ${url}`);
    }
  } else {
    // Listing page: wait for the product-link nodes the collector reads.
    // Without this, a half-rendered listing caches before the cards land
    // and the run exits with zero URLs collected.
    try {
      await page.waitForSelector('[data-ref="product-url"]', { timeout: 15_000 });
      productLinks = true;
    } catch {
      throw new Error(`product links never rendered for ${url}`);
    }
  }
  const html = await page.content();
  await writeFile(cachePath, html, "utf8");
  pageFetched += 1;
  const tag = !requirePrice ? "FETCHED-LISTING" : notSold ? "FETCHED-NOTSOLD" : "FETCHED";
  logLine(`[page] ${tag} ${url} reason=${reason} fetched ${Date.now() - t0} ms -> pages/${cachedHash}`);
  return html;
}

async function politeGoto(page: Page, url: string, requirePrice = true): Promise<"cached" | "fetched"> {
  const cachePath = pageCachePath(url);
  const cachedHash = cachePath.split("/").pop()!;
  // --refresh-urls forces a re-download even when --refresh is off; the
  // refresh flag alone re-fetches everything.
  const forcedRefresh = REFRESH || REFRESH_URLS.includes(url);
  if (!forcedRefresh && existsSync(cachePath)) {
    const html = readFileSyncSync(cachePath, "utf8");
    await page.setContent(stripScripts(html), { waitUntil: "commit", timeout: 10_000 });
    pageCached += 1;
    logLine(`[page] HIT  ${url} <- pages/${cachedHash}`);
    return "cached";
  }
  const reason = REFRESH_URLS.includes(url) ? "refresh-urls" : REFRESH ? "explicit --refresh" : "no cache file";
  // One retry: navigation can race the price XHR the first time.
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await fetchAndCache(page, url, reason, requirePrice);
      return "fetched";
    } catch (e) {
      lastErr = e as Error;
      logLine(`[page] INCOMPLETE attempt=${attempt} ${url} (${(e as Error).message})`);
    }
  }
  logLine(`[page] INCOMPLETE ${url} (${lastErr?.message ?? "unknown"})`);
  // Leave any existing cache file alone so a previous good snapshot is
  // preserved; do NOT write a half-rendered page. Re-throw so the caller
  // records the URL in droppedVariants / droppedFamilies.
  throw lastErr ?? new Error(`incomplete ${url}`);
}

async function cachePage(page: Page, url: string): Promise<void> {
  if (REFRESH) return;
  const cachePath = pageCachePath(url);
  if (existsSync(cachePath)) return;
  const html = await page.content();
  await writeFile(cachePath, html, "utf8");
}

// ---------- cookie consent ----------

async function acceptCookies(page: Page): Promise<void> {
  const selectors = [
    "button.cky-btn-accept",
    "button#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button:has-text('Összes elfogadása')",
    "button:has-text('Elfogadom')",
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click().catch(() => {});
      await sleep(1500);
      return;
    }
  }
}

// ---------- listing collection ----------

async function collectListingUrls(page: Page, source: string): Promise<string[]> {
  const all = new Set<string>();
  const re = /^https:\/\/www\.yettel\.hu\/mobiltelefon\/[a-z0-9-]+-\d+gb-p\d+-residential$/;
  for (let p = 1; p <= 30; p += 1) {
    const url = p === 1 ? source : `${source}?page=${p}`;
    log(`listing page ${p}: ${url}`);
    await politeGoto(page, url, false);
    if (p === 1) await acceptCookies(page);
    await page.waitForSelector("a[href]", { timeout: 5_000 }).catch(() => {});
    const links: string[] = await page.$$eval(
      "a[href]",
      (els, reSrc) => {
        const re = new RegExp(reSrc);
        const set = new Set<string>();
        for (const a of els as HTMLAnchorElement[]) {
          const raw = (a.getAttribute("href") ?? "").replace(/&amp;/g, "&");
          const absolute = raw.startsWith("http") ? raw : (raw.startsWith("/") ? "https://www.yettel.hu" + raw : raw);
          const noQuery = absolute.split("?")[0] ?? "";
          if (re.test(noQuery)) set.add(noQuery);
        }
        return [...set];
      },
      re.source
    );
    // Add FIRST, then evaluate the stop condition. The old code broke
    // out before adding links, so the page that triggered the stop lost
    // its links — page 4 carries the only listing link to
    // apple-iphone-17-pro-max-512gb-p1123550 and that page was therefore
    // never fetched.
    for (const l of links) all.add(l);
    if (links.length < 10) {
      log(`few product links (${links.length}) on page ${p}, stopping`);
      await cachePage(page, url);
      break;
    }
    await cachePage(page, url);
  }
  return [...all];
}

type RawVariant = {
  url: string;
  familySlug: string;
  pNumber: string;
  familyKey: string;
  brandPrefix: string;
  storage: number;
  colorName: string;
  colorSwatchHex: string | null;
  priceHuf: number | null;
  oos: boolean;
  imageUrl: string | null;
  specGroups: { label: string; rows: { label: string; value: string }[] }[];
  is5g: boolean;
  highlights: string[];
  description: string;
  productNameRaw: string;
};

async function parseVariantPage(page: Page, url: string): Promise<RawVariant | null> {
  const loaded = await politeGoto(page, url);
  if (loaded === "cached") {
    // Cached HTML is already a fully-rendered document — no JS waits needed.
  } else {
    await acceptCookies(page);
    await page
      .waitForSelector(".product-variant-item--color", { timeout: 10_000 })
      .catch(() => {});
    await sleep(POLITE_DELAY_MS);
  }

  const slugMatch = url.match(/\/mobiltelefon\/([a-z0-9-]+)-(\d+)gb-p(\d+)-residential$/);
  if (!slugMatch) throw new Error(`URL does not match expected shape: ${url}`);
  const familySlug = slugMatch[1]!;
  const brandPrefix = familySlug.split("-")[0]!;
  const storageN = Number(slugMatch[2]);
  const storageFromUrl = storageFromSlug(storageN);
  const pNumber = slugMatch[3]!;

  const h1 = await page.$eval("h1", (el) => el.textContent?.trim() ?? "").catch(() => "");
  if (!h1) throw new Error(`no h1 on ${url}`);

  const productName = h1
    .replace(/,\s*[^,]+$/, "")
    .replace(/\s+\d+\s*(?:\/\s*\d+\s*)?GB.*$/i, "")
    .trim();
  const storageFromH1 = parseStorageFromText(h1);
  const storage = storageFromH1 ?? storageFromUrl;

  // Family key combines the URL slug with the stripped h1 product name.
// Storage is parsed separately by the regex above (`<N>gb-` becomes
// `r.storage`) so storage tiers DO merge under one family — the URL
// slug portion of `familyKey` is the same for `apple-iphone-16-128gb`
// and `apple-iphone-16-256gb` after the storage digits are stripped.
// The h1 disambiguates the Samsung Galaxy S26 vs S26+ case: both
// share the URL slug `samsung-galaxy-s26-<id>` but the h1 reads
// "Samsung Galaxy S26" or "Samsung Galaxy S26+", so they end up in
// different families. A literal "+" or "Plus" suffix in the name is
// a different product and gets a "-plus" token (slugify strips "+",
// so add the marker before normalising).
  const plusToken = /\+\s*$|\bplus\b\s*$/i.test(productName) ? "-plus" : "";
  const nameToken = slugify(productName) + plusToken;
  const familyKey = `${familySlug}::${nameToken}`;

  // Colour = title attribute of the SELECTED swatch, fallback aria-label, fallback innerText
  const colour = await page.evaluate(() => {
    const sel = document.querySelector(".product-variant-item--color.product-variant-item--selected, .product-variant-item--selected.product-variant-item--color");
    const any = document.querySelector(".product-variant-item--color");
    const node = sel ?? any;
    if (!node) return { name: "", bg: "" };
    const el = node as HTMLElement;
    return {
      name: el.getAttribute("title") ?? el.getAttribute("aria-label") ?? el.innerText?.trim() ?? "",
      bg: (el.querySelector(".product-variant-item__color-preview") as HTMLElement | null)?.style.backgroundColor ?? "",
    };
  });

  // Swatch hex
  const swatchHex = rgbToHex(colour.bg ?? "");

  // Image: first product image inside `.product-details__gallery` (the
// product gallery; `.binkies-gallery` only contains blob URLs that load
// later). DOM order outside this scope is the recommendation carousel
// and shows OTHER phones' images; sorting by the width token is a
// no-op because every candidate is `300x600`. Energy labels are
// excluded by filename pattern.
  const imageUrl = await page.evaluate(() => {
    const gallery = document.querySelector(".product-details__gallery");
    if (!gallery) return null;
    const imgs = Array.from(gallery.querySelectorAll("img")) as HTMLImageElement[];
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (!src.includes("product_images")) continue;
      if (!/\.(png|webp|jpg)(\?|$)/i.test(src)) continue;
      if (/(^|\/)(energy-)?label-/i.test(src)) continue;
      return src;
    }
    return null;
  });

  // One-off price
  const priceText = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll(".product-price-details")) as HTMLElement[];
    for (const b of blocks) {
      const t = b.querySelector(".product-price-details__title")?.textContent?.trim() ?? "";
      if (t.includes("Készülék listaár")) {
        return b.querySelector(".product-price-details__price")?.textContent ?? "";
      }
    }
    return null;
  });
  const priceHuf = priceText ? parseHuf(priceText) : null;

  // OOS detection: page body contains the full-sentence copy
  // "A készüléket a kiválasztott színben jelenleg nem értékesítjük"
// when the selected colour is OOS. The genuine "not sold in this
// colour" page also exposes the page's subscription-less list price
// (the készülékár without the discount), so we use it as the variant
// price rather than dropping the variant entirely. The regex literal
// is inlined because page.evaluate runs in the browser context and
// the outer module constants are not in scope there.
  const oos = await page.evaluate(() => {
    const t = document.body.innerText ?? "";
    return /A készüléket a kiválasztott színben jelenleg nem értékesítjük/.test(t);
  });

  // Specs: yettel renders each spec group as its OWN <table> inside
  // .specification__boxes. The group label is a thead <th
  // class="boxes__title" colspan="2">. The old code looked at <tr> rows
  // and skipped anything with fewer than 2 cells, so it never opened a
  // group and everything landed under the "Egyéb" placeholder.
  const specGroups = await page.evaluate(() => {
    const container = document.querySelector("#specification .specification__boxes") as HTMLElement | null;
    if (!container) return [] as { label: string; rows: { label: string; value: string }[] }[];
    const tables = Array.from(container.querySelectorAll("table")) as HTMLElement[];
    const groups: { label: string; rows: { label: string; value: string }[] }[] = [];
    for (const tbl of tables) {
      const title = tbl.querySelector("thead th.boxes__title")?.textContent?.trim() ?? "";
      const rows = Array.from(tbl.querySelectorAll("tbody tr")).map((tr) => {
        const cells = tr.querySelectorAll("th, td");
        if (cells.length < 2) return null;
        const label = (cells[0] as HTMLElement).innerText.trim();
        const value = (cells[1] as HTMLElement).innerText.trim().replace(/mm\s+mm$/, "mm");
        if (!label || !value) return null;
        return { label, value };
      }).filter((r): r is { label: string; value: string } => r !== null);
      groups.push({ label: title || "Egyéb", rows });
    }
    return groups.filter((g) => g.rows.length > 0);
  });

  const is5g = specGroups.some((g) => g.rows.some((r) => /^5g$/i.test(r.label.trim()) && /^igen/i.test(r.value.trim())));

  const highlightsRaw = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".emphasized-properties__item")) as HTMLElement[];
    return items.map((el) => el.innerText?.trim() ?? "").filter(Boolean);
  });
  const highlights: string[] = [];
  for (const h of highlightsRaw) {
    const lines = h.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) highlights.push(`${lines[0]} ${lines.slice(1).join(" ")}`.trim());
    else if (lines.length === 1) highlights.push(lines[0]!);
    if (highlights.length >= 6) break;
  }

  const description = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll("[class*='description']")) as HTMLElement[];
    for (const b of blocks) {
      const cls = b.className ?? "";
      if (cls.includes("modal") || cls.includes("cookie") || cls.includes("newsletter")) continue;
      const txt = b.innerText?.trim() ?? "";
      if (txt.length > 80 && !txt.includes("Összehasonlítás") && !txt.includes("Fogadd el a sütiket")) return txt;
    }
    return "";
  });

  return {
    url,
    familySlug,
    pNumber,
    familyKey,
    brandPrefix,
    storage: storage ?? 0,
    colorName: colour.name,
    colorSwatchHex: swatchHex,
    priceHuf,
    oos,
    imageUrl,
    specGroups,
    is5g,
    highlights,
    description,
    productNameRaw: productName,
  };
}

// ---------- collect swatch hrefs to expand variant URLs ----------

async function collectSwatchUrls(page: Page, url: string): Promise<string[]> {
  try {
    const loaded = await politeGoto(page, url);
    if (loaded === "fetched") {
      await acceptCookies(page);
      await page.waitForSelector(".product-variant-item--color", { timeout: 10_000 }).catch(() => {});
    }
    const re = /^https:\/\/www\.yettel\.hu\/mobiltelefon\/[a-z0-9-]+-\d+gb-p\d+-residential$/;
    const hrefs = await page.$$eval(
      ".product-variant-item--color",
      (els, reSrc) => {
        const re = new RegExp(reSrc);
        return (els as HTMLAnchorElement[]).map((a) => (a.getAttribute("href") ?? "").replace(/&amp;/g, "&").split("?")[0] ?? "").filter((h) => re.test(h));
      },
      re.source
    );
    await cachePage(page, url);
    return [...new Set(hrefs)];
  } catch (e) {
    log(`error collecting swatch URLs from ${url}: ${(e as Error).message}`);
    return [];
  }
}

// ---------- build catalog ----------

type CatalogProduct = {
  slug: string;
  brand: string;
  name: string;
  highlights: string[];
  description: string;
  is5g: boolean;
  releasedAt: string;
  rank: number;
  popularityScore: number;
  featured: boolean;
  specGroups: { label: string; rows: { label: string; value: string }[] }[];
  colors: {
    code: string;
    name: string;
    swatchHex: string;
    image: { file: string; alt: string; width: number; height: number };
  }[];
  variants: {
    id: string;
    slug: string;
    colorCode: string;
    storageGb: number;
    priceHuf: number;
    stock: number;
  }[];
};

const BRAND_PREFIX: Record<string, string> = {
  apple: "Apple",
  samsung: "Samsung",
  xiaomi: "Xiaomi",
  honor: "HONOR",
  "google-pixel": "Google Pixel",
  google: "Google Pixel",
  vivo: "Vivo",
  motorola: "Motorola",
  huawei: "HUAWEI",
};

function brandFromPrefix(prefix: string): string {
  return BRAND_PREFIX[prefix] ?? prefix[0]!.toUpperCase() + prefix.slice(1);
}

async function buildCatalog(
  rawVariants: RawVariant[],
  imageDir: string,
  ctx: BrowserContext,
  imageIndex: Map<string, { file: string; width: number; height: number }>
): Promise<{ products: CatalogProduct[]; report: Record<string, unknown> }> {
  // Group by family (the new familyKey includes the stripped h1 product
  // name, so "S26" and "S26+" end up in different families). First pass:
  // collect every raw into its family pool without dedup so the price
  // fallback can still see priced siblings. Real yettel duplicates
  // (same colour + storage at two different p-numbers) are deduplicated
  // at the variant-map level — different colours of the same product
  // live at different p-numbers and must NOT collide at the family
  // level.
  type FamilyPool = { familySlug: string; brand: string; name: string; familyKey: string; allRaws: RawVariant[] };
  const pools = new Map<string, FamilyPool>();
  const droppedVariants: { url: string; reason: string }[] = [];
  for (const r of rawVariants) {
    if (!STORAGE_ENUM_HAS(r.storage)) {
      droppedVariants.push({ url: r.url, reason: `storage ${r.storage} outside enum {128,256,512}` });
      continue;
    }
    // OOS variants have no on-page price but are still real SKUs: they
    // become variants with stock=0 (price comes from the family's other
    // variants for the same storage). The genuine "no price at all"
    // case (priceHuf null AND not OOS) is still dropped.
    if (r.priceHuf === null && !r.oos) {
      droppedVariants.push({ url: r.url, reason: "no one-off price on page" });
      continue;
    }
    if (!r.colorName) {
      droppedVariants.push({ url: r.url, reason: "no colour name on page" });
      continue;
    }
    const k = r.familyKey;
    let pool = pools.get(k);
    if (!pool) {
      pool = { familySlug: r.familySlug, brand: brandFromPrefix(r.brandPrefix), name: r.productNameRaw, familyKey: k, allRaws: [] };
      pools.set(k, pool);
    }
    pool.allRaws.push(r);
  }

  // Second pass: every raw that survived the filters joins the family.
  // Real duplicates (same colour + storage at different p-numbers) are
  // dropped at the variant-map level below; the family keeps them all
  // here so fallbackPrice and the colour merge see every input.
  type Family = { familySlug: string; brand: string; name: string; familyKey: string; variants: RawVariant[] };
  const families = new Map<string, Family>();
  for (const [k, pool] of pools) {
    families.set(k, { familySlug: pool.familySlug, brand: pool.brand, name: pool.name, familyKey: k, variants: pool.allRaws });
  }

  // Preserve listing order (rawVariants iteration)
  const ordered: Family[] = [];
  const seen = new Set<string>();
  for (const r of rawVariants) {
    const k = r.familyKey;
    if (seen.has(k)) continue;
    seen.add(k);
    const f = families.get(k);
    if (f && f.variants.length > 0) ordered.push(f);
  }

  const products: CatalogProduct[] = [];
  const seenSlugs = new Set<string>();
  const droppedFamilies: { family: string; reason: string }[] = [];

  for (let idx = 0; idx < ordered.length; idx += 1) {
    const fam = ordered[idx]!;
    const rank = products.length + 1;

    // Merge colours across variants (by normalised name)
    const colorMap = new Map<string, { name: string; swatchHex: string | null; imageUrl: string | null }>();
    for (const v of fam.variants) {
      const k = stripDiacriticsLower(v.colorName);
      const cur = colorMap.get(k);
      if (!cur) {
        colorMap.set(k, { name: v.colorName, swatchHex: v.colorSwatchHex, imageUrl: v.imageUrl });
      } else {
        if (!cur.swatchHex && v.colorSwatchHex) cur.swatchHex = v.colorSwatchHex;
        if (!cur.imageUrl && v.imageUrl) cur.imageUrl = v.imageUrl;
      }
    }

    const colorsOut: CatalogProduct["colors"] = [];
    for (const [, c] of colorMap) {
      if (!c.swatchHex) continue;
      if (!c.imageUrl) continue;
      const img = await downloadImage(ctx, c.imageUrl, imageDir, imageIndex);
      if (!img) continue;
      colorsOut.push({
        code: slugify(c.name),
        name: c.name,
        swatchHex: c.swatchHex,
        image: {
          file: `${img.hash}.${img.ext}`,
          alt: `${fam.name} ${c.name}`,
          width: img.width,
          height: img.height,
        },
      });
    }

    // Family-wide price fallback for OOS variants: use the median price
    // across non-OOS variants for the same storage. Sourced from the
    // pool's full raw set, not just the deduped `fam.variants`, so a
    // priced sibling that lost the p-number race still contributes
    // its price to its OOS relative.
    const pool = pools.get(fam.familyKey)!;
    const storagePrice = new Map<number, number[]>();
    for (const v of pool.allRaws) {
      if (v.priceHuf !== null && !v.oos) {
        const arr = storagePrice.get(v.storage) ?? [];
        arr.push(v.priceHuf);
        storagePrice.set(v.storage, arr);
      }
    }
    function fallbackPrice(storage: number): number | null {
      const arr = storagePrice.get(storage);
      if (!arr || arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)]!;
    }

    // Variant map: (colorCode, storage) -> {priceHuf, colorName, oos}.
    // Dedup key is (color, storage): same key at a different p-number is
    // a yettel duplicate listing and only the first is kept. Different
    // colours live at different p-numbers and must NOT collide here.
    const variantMap = new Map<string, { colorCode: string; colorName: string; storageGb: number; priceHuf: number; oos: boolean; pNumber: string }>();
    for (const v of fam.variants) {
      const code = slugify(v.colorName);
      if (!colorsOut.some((x) => x.code === code)) continue;
      const k = `${code}--${v.storage}`;
      if (variantMap.has(k)) {
        const kept = variantMap.get(k)!;
        droppedVariants.push({ url: v.url, reason: `family collision with ${kept.pNumber}` });
        continue;
      }
      let price = v.priceHuf;
      if (price === null && v.oos) price = fallbackPrice(v.storage);
      if (price === null) {
        // OOS variant with no priced sibling in the same family: the
        // decision is to keep the product absent rather than invent a
        // price, but the drop must still be visible in the report.
        if (v.oos) {
          droppedVariants.push({ url: v.url, reason: "no price on an unavailable colour and no priced sibling" });
        }
        continue;
      }
      variantMap.set(k, { colorCode: code, colorName: v.colorName, storageGb: v.storage, priceHuf: price, oos: v.oos, pNumber: v.pNumber });
    }

    if (variantMap.size === 0) {
      droppedFamilies.push({ family: fam.familySlug, reason: "no priced variant" });
      continue;
    }
    if (colorsOut.length === 0) {
      droppedFamilies.push({ family: fam.familySlug, reason: `no usable colour image (${colorsOut.length} colours, ${variantMap.size} variants)` });
      continue;
    }

    const baseSlug = productSlugFor(fam.brand, fam.name, fam.familySlug);
    const productSlug = ensureUniqueSlug(baseSlug, seenSlugs);
    seenSlugs.add(productSlug);

    const variantSlugsTaken = new Set<string>();
    const variantsOut: CatalogProduct["variants"] = [];
    for (const v of variantMap.values()) {
      const id = `${productSlug}--${v.colorCode}--${v.storageGb}`;
      const baseVSlug = slugify(`${v.colorName}-${v.storageGb}gb`);
      const vslug = ensureUniqueSlug(baseVSlug, variantSlugsTaken);
      variantSlugsTaken.add(vslug);
      // OOS variants get stock=0; everything else gets the synthetic
      // hash-derived stock. The forced-zero block below may set more.
      const baseStock = v.oos ? 0 : stockFor(id);
      variantsOut.push({
        id,
        slug: vslug,
        colorCode: v.colorCode,
        storageGb: v.storageGb,
        priceHuf: v.priceHuf,
        stock: baseStock,
      });
    }

    const mergedHighlights: string[] = [];
    for (const v of fam.variants) {
      for (const h of v.highlights) {
        if (!mergedHighlights.includes(h)) mergedHighlights.push(h);
        if (mergedHighlights.length >= 6) break;
      }
      if (mergedHighlights.length >= 6) break;
    }
    if (mergedHighlights.length === 0) {
      const sg = fam.variants[0]?.specGroups ?? [];
      for (const g of sg) {
        for (const row of g.rows) {
          if (/kamera|akkumulátor|processzor|kijelző|memória|töltés/i.test(`${row.label} ${row.value}`)) {
            mergedHighlights.push(`${row.label}: ${row.value}`.trim());
            if (mergedHighlights.length >= 4) break;
          }
        }
        if (mergedHighlights.length >= 4) break;
      }
    }
    while (mergedHighlights.length < 1) mergedHighlights.push("Új készülék a kínálatban");

    const description = fam.variants.find((v) => v.description.length > 80)?.description ??
      fam.variants[0]?.description ?? `${fam.brand} ${fam.name} – a Yettel kínálatából.`;

    const is5g = fam.variants.some((v) => v.is5g);
    const specGroups = fam.variants[0]?.specGroups ?? [];

    logLine(`[product] ${fam.familyKey} colours=${colorsOut.length} variants=${variantMap.size} specGroups=${specGroups.length} is5g=${is5g}`);

    products.push({
      slug: productSlug,
      brand: fam.brand,
      name: fam.name,
      highlights: mergedHighlights.slice(0, 6),
      description: description.replace(/\s+/g, " ").slice(0, 1500),
      is5g,
      releasedAt: deriveReleasedAt(rank, ordered.length),
      rank,
      popularityScore: popularityForRank(rank, ordered.length),
      featured: rank <= 4,
      specGroups: specGroups.length > 0 ? specGroups : [{ label: "Egyéb", rows: [{ label: "Információ", value: "A forrás nem közölt részletes specifikációt." }] }],
      colors: colorsOut,
      variants: variantsOut,
    });
  }

  // Synthetic stock: OOS variants already carry 0. Force ≥5 to 0 ONLY
  // when fewer than 5 are already 0; the bottom-hash rule deterministically
  // picks the same five every run. Recorded in decision 0005.
  const allVariants = products.flatMap((p) => p.variants.map((v) => ({ id: p.slug + "/" + v.id, v })));
  const z = allVariants.filter((x) => x.v.stock === 0).length;
  if (z < 5) {
    const sorted = [...allVariants].sort((a, b) => {
      const ha = createHash("sha256").update(a.id).digest();
      const hb = createHash("sha256").update(b.id).digest();
      return ha.compare(hb);
    });
    for (let i = 0; i < Math.min(5, sorted.length); i += 1) sorted[i]!.v.stock = 0;
  }

  return {
    products,
    report: {
      productCount: products.length,
      variantCount: products.reduce((acc, p) => acc + p.variants.length, 0),
      imageCount: products.reduce((acc, p) => acc + p.colors.length, 0),
      droppedVariants,
      droppedFamilies,
      brands: [...new Set(products.map((p) => p.brand))].sort(),
      storageGb: [...new Set(products.flatMap((p) => p.variants.map((v) => v.storageGb)))].sort((a, b) => a - b),
      non5g: products.filter((p) => !p.is5g).length,
      outOfStock: products.flatMap((p) => p.variants).filter((v) => v.stock === 0).length,
    },
  };
}

function STORAGE_ENUM_HAS(n: number): boolean { return n === 128 || n === 256 || n === 512; }

// ---------- main ----------

async function main(): Promise<void> {
  await mkdir(IMAGE_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  // PoliteGoto writes into PAGE_CACHE_DIR; a fresh clone has nothing
  // here yet. Create it up front so the first nav doesn't crash.
  await mkdir(PAGE_CACHE_DIR, { recursive: true });
  await logInit();
  logLine(`[run] started ${new Date().toISOString()} args=${argv.slice(2).join(" ")}`);
  const imageIndex = loadImageIndex();
  pageFetched = 0; pageCached = 0; imageDownloaded = 0; imageReused = 0;

  if (VERIFY_CACHE_URL) {
    const url = VERIFY_CACHE_URL;
    const cachePath = pageCachePath(url);
    if (existsSync(cachePath)) {
      await import("node:fs/promises").then((m) => m.unlink(cachePath));
    }
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: UA, locale: "hu-HU", extraHTTPHeaders: { "Accept-Language": "hu-HU,hu;q=0.9" } });
    const page = await ctx.newPage();
    const live = await parseVariantPage(page, url);
    await cachePage(page, url);
    const fromCache = await parseVariantPage(page, url);
    await browser.close();
    const liveColors = live?.colorName ?? "";
    const cacheColors = fromCache?.colorName ?? "";
    logLine(`--verify-cache ${url}`);
    logLine(`live  colours=${liveColors}`);
    logLine(`cache colours=${cacheColors}`);
    logLine(`live  ${JSON.stringify(live)}`);
    logLine(`cache ${JSON.stringify(fromCache)}`);
    logLine(JSON.stringify(live) === JSON.stringify(fromCache) ? "IDENTICAL" : "DIFFERENT");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: "hu-HU", extraHTTPHeaders: { "Accept-Language": "hu-HU,hu;q=0.9" } });

  try {
    const listingPage = await ctx.newPage();
    const initialUrls = await collectListingUrls(listingPage, SOURCE);
    log(`collected ${initialUrls.length} listing URLs`);

    // The variant-URL seed is the first N listing URLs ONLY. The "extras"
    // loop then parses only swatch siblings of those N products. Earlier
    // the seed was every listing URL, so --limit N parsed N then everything.
    const seedUrls = initialUrls.slice(0, LIMIT);
    const allVariantUrls = new Set<string>(seedUrls);
    const productPage = await ctx.newPage();
    const rawVariants: RawVariant[] = [];
    const failedUrls: { url: string; reason: string }[] = [];
    let discoveredFromSwatches = 0;
    for (let i = 0; i < seedUrls.length; i += 1) {
      const url = seedUrls[i]!;
      try {
        // Collect sibling colour URLs before parsing this page
        const swatchHrefs = await collectSwatchUrls(productPage, url);
        for (const h of swatchHrefs) {
          if (!allVariantUrls.has(h)) { allVariantUrls.add(h); discoveredFromSwatches += 1; }
        }
        const r = await parseVariantPage(productPage, url);
        if (r) rawVariants.push(r);
        log(`parsed ${i + 1}/${seedUrls.length} (${r?.familyKey ?? r?.familySlug ?? "drop"})`);
        await cachePage(productPage, url);
      } catch (e) {
        const reason = (e as Error).message;
        log(`error parsing ${url}: ${reason}`);
        failedUrls.push({ url, reason });
      }
    }
    log(`discovered ${discoveredFromSwatches} additional variant URLs from swatches`);

    // Now parse the new variant URLs (colour-only siblings) that the
    // listing did not contain. Cap to swatch URLs of the seed set.
    const seedSet = new Set(seedUrls);
    const extras = [...allVariantUrls].filter((u) => !seedSet.has(u));
    for (const url of extras) {
      try {
        const r = await parseVariantPage(productPage, url);
        if (r) rawVariants.push(r);
        log(`parsed extra variant (${r?.familyKey ?? r?.familySlug ?? "drop"} ${r?.colorName ?? "?"})`);
        await cachePage(productPage, url);
      } catch (e) {
        const reason = (e as Error).message;
        log(`error parsing extra ${url}: ${reason}`);
        failedUrls.push({ url, reason });
      }
    }

    await listingPage.close();
    await productPage.close();

    log(`parsed ${rawVariants.length} raw variants`);

    const { products, report } = await buildCatalog(rawVariants, IMAGE_DIR, ctx, imageIndex);
    (report as Record<string, unknown>).failedUrls = failedUrls;

    const catalog = {
      generatedAt: new Date().toISOString(),
      source: SOURCE,
      products,
    };

    const schemaRaw = readFileSync(SCHEMA_PATH, "utf8");
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(schemaRaw));
    const ok = validate(catalog);

    if (!ok || products.length === 0) {
      // F3: write invalid output, don't touch catalog.json
      await writeFile(INVALID_OUTPUT_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");
      const errors = validate.errors ?? [];
      const byPath: Record<string, number> = {};
      for (const e of errors) byPath[e.instancePath ?? "<root>"] = (byPath[e.instancePath ?? "<root>"] ?? 0) + 1;
      logLine(`validation failed: ${errors.length} errors across ${Object.keys(byPath).length} instancePaths, products.length=${products.length}`);
      logLine(`first 30 errors:`);
      for (const e of errors.slice(0, 30)) {
        logLine(`  ${e.instancePath} ${e.message ?? ""} ${JSON.stringify(e.params ?? {})}`);
      }
      const droppedV = (report.droppedVariants as { url: string; reason: string }[]) ?? [];
      const droppedF = (report.droppedFamilies as { family: string; reason: string }[]) ?? [];
      const failed = (report.failedUrls as { url: string; reason: string }[]) ?? [];
      logLine(`[run] droppedVariants count=${droppedV.length}`);
      for (const d of droppedV) logLine(`[run] droppedVariant ${d.url} reason=${d.reason}`);
      logLine(`[run] droppedFamilies count=${droppedF.length}`);
      for (const d of droppedF) logLine(`[run] droppedFamily ${d.family} reason=${d.reason}`);
      logLine(`[run] failedUrls count=${failed.length}`);
      for (const f of failed) logLine(`[run] failedUrl ${f.url} reason=${f.reason}`);
      await saveImageIndex(imageIndex);
      stdout.write(JSON.stringify({ status: "blocked", reason: "validation", errorCount: errors.length, instancePaths: Object.keys(byPath).length, products: products.length, cacheDir: CACHE_DIR, pagesFetched: pageFetched, pagesCached: pageCached, imagesDownloaded: imageDownloaded, imagesReused: imageReused }, null, 2) + "\n");
      throw new Error("catalog failed schema validation");
    }

    // Write valid output. A finite --limit produces a partial catalogue
    // (only the first N listing products and their swatch siblings) and
    // is written to `catalog.partial.json` so it cannot overwrite the
    // committed full snapshot. Only the unbounded run lands on
    // `catalog.json`.
    const isPartial = LIMIT !== Infinity;
    const outPath = isPartial ? PARTIAL_OUTPUT_PATH : OUTPUT_PATH;
    const tmp = `${outPath}.tmp`;
    await writeFile(tmp, JSON.stringify(catalog, null, 2) + "\n", "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(tmp, outPath);
    await saveImageIndex(imageIndex);

    // Persist dropped lists into the run log so they survive the run.
    const droppedV = (report.droppedVariants as { url: string; reason: string }[]) ?? [];
    const droppedF = (report.droppedFamilies as { family: string; reason: string }[]) ?? [];
    const failed = (report.failedUrls as { url: string; reason: string }[]) ?? [];
    logLine(`[run] droppedVariants count=${droppedV.length}`);
    for (const d of droppedV) logLine(`[run] droppedVariant ${d.url} reason=${d.reason}`);
    logLine(`[run] droppedFamilies count=${droppedF.length}`);
    for (const d of droppedF) logLine(`[run] droppedFamily ${d.family} reason=${d.reason}`);
    logLine(`[run] failedUrls count=${failed.length}`);
    for (const f of failed) logLine(`[run] failedUrl ${f.url} reason=${f.reason}`);

    stdout.write(JSON.stringify({
      status: "ok",
      ...report,
      pagesFetched: pageFetched,
      pagesCached: pageCached,
      imagesDownloaded: imageDownloaded,
      imagesReused: imageReused,
      cacheDir: CACHE_DIR,
    }, null, 2) + "\n");
  } finally {
    await saveImageIndex(imageIndex);
    try { await ctx.close(); } catch {}
    try { await browser.close(); } catch {}
  }
}

main().catch((e) => {
  stderr.write(`FATAL: ${(e as Error).stack ?? (e as Error).message}\n`);
  exit(1);
});