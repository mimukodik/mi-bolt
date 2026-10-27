# telekom.hu design source and reference

## 1. Purpose and provenance

This document is the design reference for the storefront's Telekom theme. It
replaces the yettel register in `docs/design/yettel.md` as the source of the
storefront's colour, type, radius and recipe values; `yettel.md` stays in the
tree as the structural reference (screen layouts, feature inventories) and as
the record of the previous theme.

The values were measured with `getComputedStyle` on the live pages in Chrome
at 1440x900 on 2026-10-27, not grepped from a captured stylesheet:

- `https://www.telekom.hu/lakossagi` — the residential home page;
- `https://www.telekom.hu/webshop/csomag-osszeallitas` — the package builder.

Screenshots of both pages are under
`docs/design/telekom/screenshots/` (`home-1440.png`,
`csomag-osszeallitas-1440.png`), captured in the same session. The capture
follows the same reasoning as the yettel one: an internal demo reference, kept
for the design, not for redistribution.

Telekom's own typeface is **TeleNeo Var**, a proprietary face. The shop does
not redistribute it; it ships Inter (SIL OFL 1.1), the closest freely
available grotesque, and the mapping is recorded in §3.

## 2. Colour tokens

The frequency column is the count of elements carrying that background on the
home page (computed styles, one page, 2026-10-27), so it ranks the palette
rather than proving usage across the site.

| Token                     | Hex       | Use                                                                                        | Seen as                                       |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `--color-accent`          | `#e20074` | Telekom magenta: the logo block, filled CTAs, active menu item, device prices, cart counter | `rgb(226, 0, 116)`, 19 backgrounds on the home page |
| `--color-accent-hover`    | `#ad0a5d` | Dark magenta: promotional copy and the pressed/hover state of a magenta control            | `rgb(173, 10, 93)` savings-chip text          |
| `--color-primary`         | `#000`    | Black: main-menu text, headings, body copy, the footer band, the summary card, black pills  | `rgb(0, 0, 0)`, 11 backgrounds                 |
| `--color-primary-hover`   | `#202020` | Near-black hover/pressed surface                                                            | `rgb(32, 32, 32)`, 4 backgrounds              |
| `--color-text-muted`      | `#626262` | Secondary copy: utility-nav links, helper text                                              | `rgb(98, 98, 98)`                             |
| `--color-surface`         | `#fff`    | Page background, header bar, card bodies                                                    | `rgb(255, 255, 255)`, 35 backgrounds          |
| `--color-surface-alt`     | `#f1f1f1` | Grey section panels, device-photo plates, icon tiles                                        | `rgb(241, 241, 241)`, 23 backgrounds          |
| `--color-line`            | `#e5e5e5` | Hairline borders and separators                                                             | project value, tuned to the grey panel        |
| `--color-line-strong`     | `#d6d6d6` | Stronger control outline                                                                    | project value                                 |
| `--color-surface-sky`     | `#f9cce3` | Soft magenta wash: label chips, call-out grounds                                            | `rgb(249, 204, 227)`                          |
| `--color-warning`         | `#efdc34` | Yellow info panel ("A nálad elérhető szolgáltatásokért kérjük, válassz!")                    | `rgb(239, 220, 52)`                           |
| mid grey                  | `#b6b6b6` | Disabled and decorative strokes                                                             | `rgb(182, 182, 182)`, 8 backgrounds           |
| chip pink                 | `#ffbddf` | Savings chip ground on the black summary                                                    | `rgb(255, 189, 223)`                          |
| chip blue                 | `#c1d9ff` | Commitment chip ground                                                                      | `rgb(193, 217, 255)`                          |
| lavender                  | `#d3d7f9` | Offer band accent                                                                           | `rgb(211, 215, 249)`                          |

Text is black on white and on the yellow and pink chips; white on black, on
magenta and inside the black summary card.

## 3. Type

telekom.hu sets every surface in `"TeleNeo Var", sans-serif` at 16px with
`line-height: 16px` on the body element; the ramp is expressed per component:

| Role                  | Size / line-height | Weight | Evidence                                         |
| --------------------- | ------------------ | ------ | ------------------------------------------------ |
| Page title (`h1`)     | 56px / 56px        | 655    | `h1.fc-basic` on the package builder             |
| Section title (`h2`)  | 32px / 32px        | 655    | `h2` "Otthoni", "Mobil"                          |
| Card title (`h3`)     | 24px / 24px        | 655    | `h3.fw-ultra` "Feltételek"                       |
| Main menu item        | 20px / 24px        | 655    | `button.menuitem-name` "Készülékek"              |
| Utility menu item     | 14px / 17.5px      | 500    | "Lakossági", "Üzleti", "Rólunk"                  |
| Body                  | 16px / 24px        | 400    | `body`                                           |
| Price                 | 24–28px            | 655    | device cards, magenta                            |

The shop maps the weights 655 → `--weight-bold` 700 and 500 →
`--weight-medium`, and uses `--type-hero` 56px (36px on mobile),
`--type-section-title` 32px (26px on mobile), `--type-page-title` 40px and
`--type-nav` 20px.

**Face substitution.** TeleNeo is proprietary, so the build loads Inter
(`projects/storefront/public/fonts/inter-var-latin.woff2` and
`inter-var-latin-ext.woff2`, SIL OFL 1.1) under three family names declared in
`src/styles/primitives.css` (`shop-font-regular`, `shop-font-bold`,
`shop-font-light`), because the component rules select a family per role
rather than a weight. The latin-ext subset carries Hungarian ő/ű.

## 4. Radii, spacing and shape

| Element                            | Value                 | Evidence                                              |
| ---------------------------------- | --------------------- | ----------------------------------------------------- |
| Pill button                        | `999px`               | "Megnézem", "Következő lépés", "Belépés"              |
| Device card photo plate            | `16px`                | `.device-cards__cards-card-head`                      |
| White card inside a grey panel     | `16px`                | `.details-wrapper` on the package builder             |
| Grey section panel                 | `24px`, 24px padding  | `.tier-wrapper`, `.summary-card`                      |
| Hero banner card                   | `24px` inner panel    | `.telekom-hero__panel`                                |
| Label chip                         | `6px`, 2px 8px padding| `.od-tag-static`                                      |
| Text field                         | `8px`                 | shop inputs; telekom keeps its fields near-square      |

The scale stays 8pt with a 4pt sub-step (`--space-1` … `--space-10`), unchanged
from the yettel register.

## 5. Component recipes

**Header.** White bar, no shadow, hairline under it. At the far left a
120x120 magenta square carries the white logo glyph, flush with the page edge;
the two-row nav (14px utility links above 20px black menu items) sits beside
it. The right side holds a pill search field, a cart icon with a magenta
counter and the black "Belépés" pill. The current menu item is magenta, with
no underline.

**Pill button.** Full pill (`999px`). Filled magenta with white 16/24 bold
text is the single prominent CTA; filled black with white text is the strong
secondary ("Telekom ügyfél vagyok, belépés"); a white pill with a black or
white hairline is the outline variant, depending on the ground. Height is
48–56px.

**Device card.** Grey `#f1f1f1` photo plate with 16px corners on top, then the
device name in black, the specs in `#626262`, the price in magenta and a
magenta "Megnézem" pill.

**Section panel.** A `#f1f1f1` panel with 24px corners and 24px padding groups
one subject ("Kedvezménysávod", "Otthoni"); white 16px cards sit inside it.

**Summary card.** Black card, 16px corners, white text. The recurring price is
white; a saving is a pink `#ffbddf` chip with `#ad0a5d` text; the CTA is the
magenta pill across the full width.

**Info card.** Yellow `#efdc34` card with black text, a white circular icon
badge and a black pill CTA.

**Hero.** A banner card inset from the page edges with large corners and a
photographic or gradient ground; a white panel inside carries the title in
black with a magenta accent line and a magenta pill. The home page's
shortcut row below it is a white band with grey icon tiles and magenta glyphs.

**Quick links.** Grey section panel of compact white pill links, each with a
small icon, followed by a two-column link list.

**Footer.** Black band, white text, the logo in white, a hairline separating
the legal row.

**Text field.** White field with a 1px grey border and 8px corners; on focus
the border turns magenta with no ring.

## 6. Storefront token mapping

`src/styles.css` declares the theme; `src/styles/tokens.css` names the
semantic aliases the components use.

| Storefront token                                    | Telekom value             | §   |
| --------------------------------------------------- | ------------------------- | --- |
| `--color-primary` / `--color-brand-ink`             | `#000`                    | 2   |
| `--color-primary-hover`                             | `#202020`                 | 2   |
| `--color-accent` / `--color-brand-accent`           | `#e20074`                 | 2   |
| `--color-accent-hover`                              | `#ad0a5d`                 | 2   |
| `--color-brand-price`                               | `#e20074`                 | 2   |
| `--color-surface` / `--color-surface-light`         | `#fff`                    | 2   |
| `--color-surface-alt` / `--color-surface-section`   | `#f1f1f1`                 | 2   |
| `--color-surface-sky` / `--color-brand-accent-soft` | `#f9cce3`                 | 2   |
| `--color-text` / `--color-text-primary`             | `#000`                    | 2   |
| `--color-text-muted` / `--color-text-secondary`     | `#626262`                 | 2   |
| `--color-shell-dark` / `--color-shell-hero`         | `#000`                    | 2   |
| `--color-warning` / `--color-warning-text`          | `#efdc34` / `#000`        | 2   |
| `--radius-input` / `--radius-card` / `--radius-pill`| `8px` / `16px` / `999px`  | 4   |
| `--radius-badge`                                    | `6px`                     | 4   |
| `--type-hero` / `--type-hero-mobile`                | `56px` / `36px`           | 3   |
| `--type-section-title` / `…-mobile`                 | `32px` / `26px`           | 3   |
| `--type-page-title` / `…-mobile`                    | `40px` / `30px`           | 3   |
| `--type-nav` / `--leading-nav`                      | `20px` / `24px`           | 3   |
| `--font-family-base` / `-bold` / `-light`           | `shop-font-*` (Inter)     | 3   |

## 7. Deliberate departures

- **Face.** Inter stands in for TeleNeo (§3); no TeleNeo file is shipped.
- **Disabled controls.** The project keeps its dashed outline on a transparent
  fill rather than telekom.hu's own disabled pills (owner's earlier ask; see
  `src/styles.css` theme comment).
- **Device-card CTA.** Every card carries a filled magenta "Megnézem" pill, as
  telekom.hu does. An earlier catalogue note in
  `features/catalog/product-card.ts` preferred one filled primary per section;
  this theme follows the reference instead.
- **Alerts.** The shop's soft status tints are the project's own mixes on the
  grey surface; telekom.hu uses solid grounds.
- **Halloween campaign.** `src/styles/halloween.css` remains an independent,
  server-timed campaign layer and overrides this theme only while its window
  is active.