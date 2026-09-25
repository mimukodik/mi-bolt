# yettel.hu design source and reference

## 1. Purpose and provenance

This document is the mandatory design reference for the MiBolt frontend. It
replaces the retired `mi-bolt-design` skill; every token, type ramp, recipe
and feature inventory it carries comes from `docs/design/yettel/` and is the
single source of truth for the visual language the implementation takes over
(the user's brief, in English: exact colours, font settings, rounding, button style, card style).
Nothing here is invented: every value is grepped from the captured CSS or
pages, and the selector or file it came from is named beside it. A later
brief that wants a different value either cites this document or names the
new measurement, and never re-derives a number in passing.

The sources are `docs/design/yettel/pages/list-mobiltelefon.html`
(yettel.hu/mobiltelefon, the devices list), four device pages under
`docs/design/yettel/pages/device-*.html` (Apple iPhone 17 256GB, Samsung
Galaxy A37 128GB, Google Pixel 11 256GB, Xiaomi Redmi 17 4 128GB), and
`docs/design/yettel/pages/home.html`, fetched live on 2026-09-20. The CSS
is `docs/design/yettel/css/portal.css`
(`static.yettel.hu/compiled/css/portal-vcorbisappportalhu.css?r-7.9.013`,
3.6 MB, minified, one physical line); the three font faces live under
`docs/design/yettel/fonts/`. The capture is taken for the internal demo on
the same reasoning as the catalogue images in the backend's decision record
`docs/decisions/0005`: the workspace cannot host copyrighted material and
the source pages and stylesheets are kept for reference, not for
redistribution. Screenshots of the captured pages at Full HD (1920x1080) and
mobile (390x844) are under `docs/design/yettel/screenshots/` (home, list,
list-filters, device and cart at both sizes, device-gallery at Full HD only);
the comparison against the Angular build sits in the browser pass in
`.claude/rules/browser-verification.md`.

## 2. Colour tokens

Frequencies below are the orchestrator's measurement of 2026-09-20 over
`docs/design/yettel/css/portal.css`, not re-derived here; the `selectors`
column lists three rules from the same file that use the value, all grepped
with `grep -oE '[^}]{0,180}\{[^}]*<token>[^}]*\}' docs/design/yettel/css/portal.css`.

| Token | Hex | Use | Frequency (2026-09-20) | Selectors |
| --- | --- | --- | --- | --- |
| `--color-primary` | `#002340` | Primary navy: header bar, primary buttons, active pagination, prices, headings, brand fill, footer | 773 | `.btn--primary{color:#fff;background:#002340}`, `.header__wrapper{background:#002340;color:#fff}`, `.portal-footer{background-color:#002340}` |
| `--color-accent` | `#b4ff00` | Lime accent: selected variant ring, active thumbnail, discount label, primary-inverse button, brand-logo fill on dark surfaces, selected swatches | 173 | `.btn-lime{color:#212529;background-color:#b4ff00;border-color:#b4ff00}`, `.label-discount{background-color:#b4ff00;color:#002340}`, `.product-variant-item--selected{box-shadow:0 0 0 2px #b4ff00 inset;font-weight:700}` |
| `--color-text` | `#002340` | Default text on light surfaces (navy is the body text colour on cards and surfaces) | (see primary) | `.product-card__price{color:#002340}`, `.product-card__tariff-picker{color:#002340}`, `.balance-info-table__value{color:#002340}` |
| `--color-text-muted` | `#80919f` | Secondary text: helper copy, prices struck through, disabled captions | 74 | `.text-muted{color:#80919f !important}`, `.cart-item__piece-price{color:#80919f}`, `.nav-link{background-color:transparent;color:#80919f}` |
| `--color-text-light` | `#9194a0` | Tertiary text: hint copy, helper paragraphs, pagination inactive | 43 | `.product-card__tariff{color:#9194a0}`, `.banner-width-text-card-collection__item .product-list-controls{color:#9194a0}`, `.hero-quicklink__description{color:#9194a0}` |
| `--color-text-on-primary` | `#232841` | Inset text on the navy container/cards (darker than navy to read on lime and light-blue backgrounds) | 68 | `.product-card__manufacturer{color:#232841}`, `.product-card__name{color:#232841}`, `.filter-form__label{color:#232841}` |
| `--color-text-inverse` | `#ffffff` | Text on dark backgrounds (header, footer, navy buttons); the CSS spells it as `color:#fff` | n/a (used as `#fff`) | `.btn--primary{color:#fff}`, `.header__wrapper{background:#002340;color:#fff}`, `.tooltip-inner{color:#fff;background-color:#002340}` |
| `--color-text-body` | `#4e4e4e` | Body text on the default white page background (set on `body`) | n/a | `body{margin:0;font-family:"portal-font-regular",sans-serif,arial;font-size:1rem;font-weight:normal;line-height:1.5;color:#4e4e4e;text-align:left;background-color:#fff}` |
| `--color-text-strong` | `#212529` | Strong text inside lime/light-blue/sky buttons where navy would not contrast | 72 | `.btn-lime{color:#212529;background-color:#b4ff00}`, `.btn-sky{color:#212529;background-color:#c4dfe9}`, `.btn-secondary{color:#212529;background-color:#c4dfe9}` |
| `--color-surface` | `#ffffff` | Default surface (page background) | n/a (white via `background-color:#fff`) | `body{background-color:#fff}`, `.header{...background-color:#fff}` (search box) |
| `--color-surface-alt` | `#f2f4f5` | Light grey sections: panel bodies, summary containers, product-prices block, mobile filter, FAQ section | 70 | `.product-prices__container{padding:24px 16px 0;border:2px solid #f2f4f5;border-radius:16px;background-color:#fff}`, `.mobile-filter__tariff-quick-filter{min-height:148px;background-color:#f2f4f5;border-radius:16px}`, `.featured{background-color:#f2f4f5}` |
| `--color-surface-sky` | `#c4dfe9` | Sky-blue call-out boxes, info panels, configurator cards, alert-secondary | 114 | `.information-box{background-color:#c4dfe9;color:#002340;border-radius:8px;padding:16px 16px 16px 45px}`, `.alert{display:flex;background-color:#c4dfe9;border-radius:0 0 16px 16px}`, `.configurator-login-head{padding:16px;border-radius:8px;background:#c4dfe9}` |
| `--color-line` | `#e5e9ec` | Default 1–2px border on inputs, panels, product-variant-items, configurator cards, thumbnails | 122 | `.product-variant-item{box-shadow:0 0 0 1px #e5e9ec inset;border-radius:8px}`, `.solid-input-group{box-shadow:0 0 0 2px #e5e9ec inset;border-radius:8px}`, `.configurator-card__item{border-radius:16px;box-shadow:0 0 0 2px #e5e9ec inset}` |
| `--color-line-strong` | `#dddfe1` | Stronger outline: social-button box, compare bar, news-item separator | 43 | `.social-buttons{padding:0.7em;border:1px solid #dddfe1;background-color:#e5e9ec}`, `.affix{box-shadow:0 2px 3px 1px #dddfe1}`, `.datapackage-box{border:1.2px solid #dddfe1;box-shadow:4px 5px 18px -2px #dddfe1}` |
| `--color-success` | `#5cb85c` | Success green: valid feedback, success button, success badge | 34 | `.valid-feedback{color:#5cb85c}`, `.btn-success{color:#fff;background-color:#5cb85c;border-color:#5cb85c}`, `.badge-success{color:#fff;background-color:#5cb85c}` |
| `--color-error` | `#d9534f` | Error red: invalid feedback, danger button, error badge, invalid input ring | 35 | `.invalid-feedback{color:#d9534f}`, `.btn-danger{color:#fff;background-color:#d9534f;border-color:#d9534f}`, `.is-invalid{border-color:#d9534f}` |

The CSS defines no design custom properties: the only `var(--…)` in
`portal.css` is `var(--app-height)`, a viewport-height helper used five
times by the `.questionnaire-*` rules, and every colour, radius and size is
a literal value. The tokens above are the
proposed names for the Angular build: a single `:root { --color-* }` block
maps each name to the hex on the row above, and the recipes below keep
referring to the tokens rather than the hex.

## 3. Typography

Three faces are declared as `@font-face`, all with `font-style:normal`,
`font-weight:normal`, `font-display:swap`, and `woff` listed first then
`woff2` (the captured files are both present, and the order in the rule is
the order the browser tries them):

```css
@font-face {
  font-family: "portal-font-regular";
  src: url("/bundles/phoenix-static/font/typo/font-regular.woff?r-7.9.013") format("woff"),
       url("/bundles/phoenix-static/font/typo/font-regular.woff2?r-7.9.013") format("woff2");
}
@font-face {
  font-family: "portal-font-bold";
  src: url("/bundles/phoenix-static/font/typo/font-bold.woff?r-7.9.013") format("woff"),
       url("/bundles/phoenix-static/font/typo/font-bold.woff2?r-7.9.013") format("woff2");
}
@font-face {
  font-family: "portal-font-light";
  src: url("/bundles/phoenix-static/font/typo/font-light.woff?r-7.9.013") format("woff"),
       url("/bundles/phoenix-static/font/typo/font-light.woff2?r-7.9.013") format("woff2");
}
```

(Verified by `grep -oE '@font-face\{[^}]+\}' docs/design/yettel/css/portal.css`;
the same three faces are re-declared once with single quotes for an
announcement bundle, and four icon-font faces
(`Font Awesome 5 Free`, `Font Awesome 5 Brands`, `phoenix-icon`,
`portal-icon`) follow — those are not part of this design.)

For the Angular build the `src` paths become
`url("/fonts/font-regular.woff") format("woff"), url("/fonts/font-regular.woff2") format("woff2")`
once the three `woff`/`woff2` pairs from `docs/design/yettel/fonts/` are
moved into `public/fonts/`. The `format('woff2')` declaration stays second
because that is the order the captured CSS declares them in.

Body text (`body{...}` rule, grep
`body\{[^}]*font-family[^}]*\}`):

```text
font-family: "portal-font-regular", sans-serif, arial;
font-size:   1rem;
font-weight: normal;
line-height: 1.5;
color:       #4e4e4e;
background-color: #fff;
```

`portal-font-regular` is used 314 times in the captured stylesheet,
`portal-font-bold` 792 times, `portal-font-light` 553 times
(`grep -oE 'portal-font-(regular|bold|light)' docs/design/yettel/css/portal.css | sort | uniq -c`;
the file is minified to one physical line, so plain `grep -c` would return
1 for every face and is the wrong tool here). The list and device
pages reach for them as:

- `portal-font-regular` on body copy, plain paragraphs, button text — e.g.
  `body{font-family:"portal-font-regular",sans-serif,arial;...}`,
  `.product-card__compare{font:13px "portal-font-regular",sans-serif,arial}`,
  `.product-card__button{font:14px "portal-font-regular",sans-serif,arial}`.
- `portal-font-bold` for headings, prices, form labels, primary buttons —
  e.g. `.typo__headings--3{font-family:"portal-font-bold",sans-serif,arial;font-size:28px;letter-spacing:-2%;line-height:36px}`,
  `.product-card__price{font-family:"portal-font-bold",sans-serif,arial;font-size:20px}`,
  `.filter-form__label{font-family:"portal-font-bold",sans-serif,arial;font-size:14px}`.
- `portal-font-light` for descriptions, helper text, prices struck through —
  e.g. `.product-card__tariff{font-family:"portal-font-light",sans-serif,arial;font-size:14px;line-height:20px;color:#9194a0}`,
  `.product-card__description{font-family:"portal-font-light",sans-serif,arial;font-size:12px;line-height:16px}`,
  `.product-card__price-price{font-family:"portal-font-light",sans-serif,arial;font-size:14px;line-height:20px}`.

The eight-step heading scale `typo__headings--1` … `typo__headings--8` is
the de-facto ramp the device page uses (the list page uses raw `h1`, `h2`,
`h3` whose default sizes are 2.5 rem / 2 rem / 1.75 rem from the same
stylesheet):

| Class | Family | Size | Line height | Letter spacing |
| --- | --- | --- | --- | --- |
| `typo__headings--1` | `portal-font-bold` | 72px | 74px | -2px |
| `typo__headings--2` | `portal-font-bold` | 48px | 52px | -2% |
| `typo__headings--3` | `portal-font-bold` | 28px | 36px | -2% |
| `typo__headings--4` | `portal-font-bold` | 20px | 28px | 0 |
| `typo__headings--5` | `portal-font-bold` | 16px | 24px | 0 |
| `typo__headings--6` | `portal-font-bold` | 14px | 20px | 0 |
| `typo__headings--7` | `portal-font-bold` | 12px | 16px | 0 |
| `typo__headings--8` | `portal-font-bold` | 12px | 16px | — |

(`grep -oE 'typo__headings--[0-9]\{[^}]*\}' docs/design/yettel/css/portal.css`.)

## 4. Radii, spacing, shadows

Border-radius values, measured by `grep -oE 'border-radius:[0-9]+px' docs/design/yettel/css/portal.css | sort | uniq -c | sort -rn` on 2026-09-20. The `50%` row is measured with `grep -o -F 'border-radius:50%' docs/design/yettel/css/portal.css | wc -l`, which the pixel pattern does not reach. The top values dominate the visual language; the rest are scattered single-purpose radii.

| Radius | Count (2026-09-20) | Use | Selectors |
| --- | --- | --- | --- |
| `8px` | 165 | Inputs, search-box group, brand-box, product-card content, dropdown menus, product-variant-item, mobile-filter button, thumbnail, filter pill | `.solid-input-group{min-height:48px;border:0;border-radius:8px;background-color:#fff;box-shadow:0 0 0 2px #e5e9ec inset}`, `.product-card__content{margin-bottom:25px;border:2px solid #f3f3f3;border-radius:8px}`, `.product-variant-item{display:inline-flex;align-items:center;margin-right:8px;margin-bottom:6px;padding:13px 16px 11px;border-radius:8px;box-shadow:0 0 0 1px #e5e9ec inset}` |
| `16px` | 63 | Cards, modal content, configurator-card item, product-prices container, mobile-filter quick filter, modal alerts | `.modal-content,.overlay-modal__content{border-radius:16px;box-shadow:0 12px 12px rgba(0,0,0,0.05),0 24px 48px rgba(0,0,0,0.2)}`, `.configurator-card__item{background-color:#01385e;border-radius:16px}`, `.product-prices__container{padding:24px 16px 0;border:2px solid #f2f4f5;border-radius:16px;background-color:#fff;z-index:5}` |
| `24px` | 17 | Pill buttons, tab switchers, badge-styled chips | `.btn,.tariff-card__btn-alternate,.tariff-table__btn-alternate,.tariff-advert__box-button,.tariff-card-box__btn-alternate,.tariff-card__btn,.tariff-details-modal__button,.tariff-table__btn,.tariff-card-box__btn,.tariff-card-box__btn--auto-width{font-family:"portal-font-bold",sans-serif,arial;font-size:16px;line-height:24px;display:inline-flex;position:relative;align-items:center;justify-content:center;padding:12px 24px;border:0;border-radius:24px;outline:none !important;cursor:pointer}`, `.portal-tab-switcher{background-color:#002340;border:solid 2px #80919f;border-radius:24px;display:inline-flex;position:relative}`, `.tariff-tab{display:inline-flex;align-items:center;justify-content:center;padding:10px 20px;border-radius:24px;cursor:pointer}` |
| `14px` | 15 | Smaller inner radii on some spec blocks (`.specification__boxes boxes`) | `.boxes__title{background-color:#f2f4f5;color:#002340}`, `.boxes__container{border:solid 2px #f2f4f5;border-radius:8px}` — note the boxes use 8px; 14px appears on a smaller set of card-internal elements |
| `4px` | 29 | Custom-control indicator (checkbox/radio) | `.custom-control-indicator{width:20px;height:20px;border:2px solid #e5e9ec;border-radius:4px}` |
| `3px` | 40 | Cart upsell, custom-control, fallback inputs | `.cart-upsell__product{padding:15px;border:1px solid #dddfe1;border-radius:3px;text-align:center}`, `.product-card__compare-add{width:60px;height:60px;border:2px solid #ebeced;border-radius:50%}` |
| `50%` | 80 | Avatars, the brand-logo, progress rings, color-picker swatches | `.product-card__color-picker{width:12px;height:12px;margin-bottom:12px;border-radius:50%;box-shadow:0 0 2px rgba(0,0,0,0.4);cursor:pointer}`, `.product-card__color-picker--selected{width:24px;height:24px;border:2px solid #fff;border-radius:50%}`, `.brand-logo{fill:#002340}` |

Container max widths (grep `grep -oE '\.container-[a-z]+\{[^}]*\}' docs/design/yettel/css/portal.css`,
plus the explicit `.header__container` and `.portal-footer` rules):

- `.container-sm` `max-width:540px`
- `.container-md` `max-width:720px`
- `.container-lg` `max-width:960px`
- `.container-xl` `max-width:1140px`
- `.header__container` `max-width:1140px` (`.header__container{...width:100%;max-width:1140px}`)
- `.portal-footer` `position:relative;max-width:1920px;margin:0 auto;margin-top:-16px;border-top:0;background-color:#002340`
- `.header` `position:fixed;top:0;left:0;right:0;max-width:1920px;margin:0 auto`
- `.layout .layout__main` `max-width:1920px;margin:0 auto` (above 1921px)

Gutters are 15px each side (`.container, .header__container, .tariff-cards__container{width:100%;padding-right:15px;padding-left:15px;margin-right:auto;margin-left:auto}`).

Box-shadow is used sparingly on cards; the product card itself is a flat
surface with a 2px border, not a shadowed card. The card with the explicit
shadow is `.tariff-card-box` and `.tariff-card`:

- `.tariff-card,.tariff-card--ghost{border:0;border-radius:5px;background:#0566a1;font-size:15px;box-shadow:0 0 10px rgba(0,0,0,0.2)}`
- `.tariff-card-box{display:flex;flex-direction:column;min-width:210px;background-color:#fff;box-shadow:0 0 10px rgba(0,0,0,0.2)}`
- `.b2c-tariff-card{position:relative;background-color:#fff;color:#002340;box-shadow:0 6px 6px 0 rgba(0,0,0,0.05),0 12px 24px 0 rgba(0,0,0,0.1)}`
- `.modal-content,.overlay-modal__content{border-radius:16px;box-shadow:0 12px 12px rgba(0,0,0,0.05),0 24px 48px rgba(0,0,0,0.2)}`
- `.chosen-tariff-card{box-shadow:0 1px 5px rgba(0,0,0,0.05)}` (selected plan summary)

(All verified with
`grep -oE '[^}]{0,180}\{[^}]*box-shadow:[^}]*\}' docs/design/yettel/css/portal.css | grep -E 'product-card|configurator-card|tariff-card|chosen-tariff-card'`.)

## 5. Recipes

### Primary button (`.btn--primary`, filled navy)

```text
font-family: "portal-font-bold", sans-serif, arial
font-size:   16px
line-height: 24px
display:     inline-flex
align-items: center
justify-content: center
padding:     12px 24px
border:      0
border-radius: 24px
cursor:      pointer
color:       #fff
background:  #002340
```

Source:
`.btn--primary,.btn--default,.btn--green,.btn__form,.btn--logout,.btn.btn--grey,.btn--grey.tariff-card__btn-alternate,.btn--grey.tariff-table__btn-alternate,.btn--grey.tariff-advert__box-button,.btn--grey.tariff-card-box__btn-alternate,.btn--grey.tariff-card__btn,.btn--grey.tariff-details-modal__button,.btn--grey.tariff-table__btn,.btn--grey.tariff-card-box__btn,.btn--grey.tariff-card-box__btn--auto-width,.btn__icon--small,.btn--success,.btn--warning,.btn--orange,.btn--yellow,.btn--blue,.btn--green,.btn--gray{color:#fff;background:#002340}`.

Hover/focus:
`.btn--primary:focus` and `.btn--primary:hover` sit in one long selector list
shared with the other contained buttons (`.btn--contained`, `.btn--electric`,
`.btn--default`, `.btn--green`, `.btn__form`, `.btn--logout`, the `.tariff-*`
buttons); the shared declaration block is
`{color:#fff;background-color:#01385e}` (a single shade darker on hover).

Disabled:
`.btn--primary[disabled]` shares the same long selector list; the declaration
block is `{color:#80919f;background:#e5e9ec}` (muted text on the line colour).

### Primary-inverse button (lime on light, `.btn--primary-inverse`)

```text
color:       #002340
background:  #b4ff00
```

Source:
`.btn--primary-inverse,.btn--gray-inverse{color:#002340;background:#b4ff00}`.
Hover: `.btn--primary-inverse:focus` and `.btn--primary-inverse:hover` share a
rule with `.btn--contained-light`, `.btn--white`, `.btn--white-contained`,
`.btn--white-electric` and `.btn--gray-inverse`; the declaration block is
`{color:#002340;background-color:#c5ff64}`.

### Outlined button (`.btn-outline-navy`, `.btn-outline-lime`)

```text
.btn-outline-primary   { color: #002340; border-color: #002340; }
.btn-outline-navy      { color: #002340; border-color: #002340; }
.btn-outline-lime      { color: #b4ff00; border-color: #b4ff00; }
.btn-outline-secondary { color: #c4dfe9; border-color: #c4dfe9; }
.btn-outline-danger    { color: #d9534f; border-color: #d9534f; }
```

Source for the navy and lime outlines (the full set shares the border-radius
of 24px set on `.btn` itself).

### Text link button (`.btn-link-no-decoration`)

```text
font-weight: normal
color: #002340
text-decoration: underline
```

Source: `.btn-link-no-decoration{font-weight:normal;color:#002340;text-decoration:underline}`.

### Text field (`.form-control`)

Read from the captured `yettel/css/portal.css` on 2026-09-22.

- Focus: `.form-control:focus{color:#474747;background-color:#fff;border-color:#0069c0;outline:0;box-shadow:none}`. The same selector list covers `.search-box__term:focus` and `.cart .cart-item__piece-control-field:focus`. MiBolt: `--color-focus-input` (`#0069c0`), no outline, no ring, on every bordered text field; the borderless header search boxes keep the navy outline ring.
- Invalid: `.form-control.is-invalid{border-color:#d9534f;padding-right:calc(1.25em + 1rem);background-image:<a 12x12 red circled "!" SVG>;background-repeat:no-repeat;background-position:right calc(.3125em + .25rem) center;background-size:calc(.625em + .5rem) calc(.625em + .5rem)}`, applied to the cart quantity field too. MiBolt matches `aria-invalid="true"` instead of the class and copies the SVG byte for byte.
- Invalid and focused: `.form-control.is-invalid:focus{border-color:#d9534f;box-shadow:0 0 0 .2rem rgba(217,83,79,0.25)}`. MiBolt: `--color-error-halo`.
- Recorded, not corrected: a border colour change is a weaker focus indicator than the outline ring it replaces. Yettel fidelity decides for this demo (owner, 2026-09-22).

### Alert (`.information-box`)

Read from the captured `yettel/css/portal.css`.

- Box: `.information-box{font-family:"portal-font-light",sans-serif,arial;font-size:14px;line-height:20px;position:relative;margin-top:0;padding:16px 16px 16px 45px;border-radius:8px;background-color:#c4dfe9;color:#002340}`.
- Icon: `.information-box__icon{display:inline-block;position:absolute;top:16px;left:16px;width:27px;height:24px;background:url(".../exclamation-mark.svg") no-repeat}`.
- MiBolt: the shared `StatusMessage` and the contact form's error summary take this box: no border and no left bar, `--radius-control` (8px), `--space-4` (16px) padding, and a 20px severity icon in front of the text (an `i`, a `!` or a check, drawn in the ring of the success page's check-circle). The icon is a flex item on the 12px gap, pinned to the top like yettel's (`align-self: flex-start`, 16px from the top edge on a wrapped message), so the text starts at 48px where yettel's starts at 45px. The info ground is the sky `#c4dfe9`; success and error keep this project's `--color-status-*-soft` tints (§9), because yettel's solid `.alert-danger` (`#d9534f`) is too loud for an inline message. The icon carries the severity colour: navy on info, `--color-status-success` on success, `--color-status-error` on error. This replaced the 4px left bar and the 1px border every alert carried before, on the owner's ask for a checkout facelift (in English: "the order flow needs a minimal facelift too, I don't like the layout or the elements, for example alerts").

### Skeleton loaders and their fade-out

yettel.hu ships no skeleton: `portal.css` carries no `skeleton`, `shimmer` or `placeholder-glow` selector, so the grey shimmer bars (`LoadingState`, `ProductImage`, `PriceBlock`, the filter facet rows, the product card skeleton) are MiBolt's own.

- Leaving: a skeleton never just disappears. When the data arrives, the skeleton fades out over the content that replaced it, on the owner's rule (in English: "wherever we use skeleton loaders, let us animate them out with a fade and not just remove them"; and "in Angular the CSS animation has to be used, ask the Angular MCP").
- Timing: `opacity` over 200ms `ease`, yettel's own content fade: `.home .sidebar-top+.main-content--sidebar{transition:visibility ease 0.2s, opacity 0.2s ease}`. Under `prefers-reduced-motion: reduce` the global rule in `src/styles/primitives.css` collapses it to nothing.
- MiBolt: the `appSkeletonLeave` directive sits on the root element of every skeleton a control-flow block (`@if`, `@switch`, `@for`) removes. Angular calls its `animate.leave` handler before it takes the element out (https://angular.dev/guide/animations#animateleave); the handler pins the element where it stands (`position: absolute` at its own offset and size), so the content lays out beneath it at once and nothing jumps, then adds the global `.skeleton-leave` class, a CSS opacity transition. The element goes when that fade finishes: the handler reads the element's own opacity transition with `getAnimations()`, which applies the pending class change first (CSS Transitions Level 2, "Requirements on pending style changes"), and waits for its `finished` promise, the pattern MDN shows for removing an element after its animations. An element that is not rendered starts no transition (a skeleton inside the filter drawer when the drawer closes, measured in the mobile browser pass), so the list is empty and it goes at once instead of sitting, invisible, until Angular's own four-second fallback; a shimmer animation running on the same element is not the fade and is not waited for.
- Filter facet counts: a count being re-fetched keeps its box and swaps its text for the shimmer in place, so nothing leaves the DOM; the shimmer sits on an overlay every count carries (`.facet-count::after`) and both it and the count's text cross-fade over the same 200ms `ease`, the shimmer running only while the count is busy.
- Product card skeleton: wherever a grid of product cards waits for the catalogue API (the home featured grid, the catalogue grid on its first load, the related devices strip on the product page), every card slot shows a `ProductCardSkeleton` in the card's own frame ("Product card on the list page" below: `2px solid #f3f3f3`, 8px radius, a white ground, 16px padding, a 12px gap), so the grid keeps its shape when the cards arrive. Inside it, in the card's order: a 4:3 image block, a 16px bar at 70% width for the name (the name's 16px type), a 14px bar at 50% for the colour and storage line (its 14px type), a 20px bar at 40% for the price (the md price's 20px type) and a 40px pill across the full width where the "Megnézem" button sits; every block carries `LoadingState`'s shimmer. The home grid and the related strip show four, the four cards each of them holds; the catalogue shows six, two rows of its three-column desktop grid. `appSkeletonLeave` goes on the element the control-flow block removes: each home and related `<li>`, and the catalogue's one skeleton grid. The related strip reads its own loading flag, so its section shows the skeleton while the related request runs instead of appearing only when the cards land.
- Not faded: the payment return page's skeleton, which is the whole route template and leaves with the route rather than through a control-flow block, and the static samples on the primitives showcase, which never leave.

### Product card on the list page

The card content block is a flat bordered surface, not a shadowed card:

```text
.product-card__content
  margin-bottom: 25px
  border: 2px solid #f3f3f3
  border-radius: 8px
.product-card__manufacturer, .product-card__name
  font-family: "portal-font-bold", sans-serif, arial
  font-size: 16px
  line-height: 24px
  color: #232841
  text-decoration: none
.product-card__tariff
  font-family: "portal-font-light", sans-serif, arial
  font-size: 14px
  line-height: 20px
  color: #9194a0
.product-card__price
  font-family: "portal-font-bold", sans-serif, arial
  font-size: 20px
  line-height: 28px
  color: #002340
.product-card__price-price   (instalment / per-period text)
  font-family: "portal-font-light", sans-serif, arial
  font-size: 14px
  line-height: 20px
.product-card__color-picker   (default dot on the card)
  width: 12px; height: 12px
  border-radius: 50%
  box-shadow: 0 0 2px rgba(0,0,0,0.4)
.product-card__color-picker--selected
  width: 24px; height: 24px
  border: 2px solid #fff
  border-radius: 50%
  box-shadow: -2px 3px 7px rgba(0,0,0,0.25)
.product-card__button
  display: flex; align-items: center; justify-content: center
  width: 100%; height: 40px
  border-radius: 3px
  font: 14px "portal-font-regular", sans-serif, arial
  text-align: center
  text-transform: uppercase
```

The "Akció" / discount badge that sits in the corner of a card is the
`.label-discount` chip:

```text
.label-discount { background-color: #b4ff00; color: #002340; }
```

(The badge itself inherits size and padding from the shared `.badge,.label,.info-tag,.chip{font-size:.875rem;...padding:2px 12px;border:1px solid #000}` reset; in the captured CSS the default border is overridden by the per-variant rules.)

### Filter panel and applied-filter chips on the list page

The list page's filter markup is the old `form.product-filter-form` with
named inputs (`filter[search]`, `filter[specification]`, `filter[tariff]`,
`filter[flags_only_with_installment]`, `filter[flags_only_zero_gross_price]`,
plus one `filter[specification][manufacturer][]` checkbox per brand). The
MiBolt backend will replace this; the relevant CSS for the visual layout is:

```text
.filter-form__label
  font-family: "portal-font-bold", sans-serif, arial
  font-size: 14px
  line-height: 20px
  color: #232841
.filter-form__restore
  color: #002340
  font: 14px "portal-font-regular", sans-serif, arial
  text-decoration: underline
.filter-form__display-tariff
  font-family: "portal-font-light", sans-serif, arial
  font-size: 14px
  line-height: 20px
  color: #002340
input[name="filter[search]"] (the search box, .info-search-box__input-group)
  min-height: 48px
  border: 2px solid #e5e9ec
  border-radius: 8px
  background-color: #fff
.product-list-controls__button
  font-family: "portal-font-light", sans-serif, arial
  font-size: 16px
  line-height: 24px
  display: flex; align-items: center
  width: 100%
  padding: 12px 16px
  border: 2px solid #e5e9ec
  border-radius: 8px
```

Sources:
`.filter-form__label{font-family:"portal-font-bold",sans-serif,arial;font-size:14px;letter-spacing:0;line-height:20px;color:#232841}`,
`.info-search-box__input-group{min-height:48px;margin:8px 0;border:2px solid #e5e9ec;border-radius:8px;background-color:#fff;box-shadow:none}`,
`.product-list-controls__button{font-family:"portal-font-light",sans-serif,arial;font-size:16px;line-height:24px;display:flex;align-items:center;width:100%;padding:12px 16px;border:2px solid #e5e9ec;border-radius:8px}`.

The mobile-filter modal (`.mobile-filter-modal` with
`.mobile-filter__tariff-quick-filter{min-height:148px;background-color:#f2f4f5;border-radius:16px;padding:16px;margin-bottom:24px}`) is the equivalent panel on small viewports.

### Sort control and pager

Sort control: a native `<select id="filter_order" name="filter[order]">`
styled like the rest of the inputs. The eight options on the captured list
page are:

```text
date_asc     Legrégebbi elöl
date_desc    Legújabb elöl
name_asc     Név szerint (A-Z)
name_desc    Név szerint (Z-A)
popularity   Legnépszerűbb elöl
price_asc    Legolcsóbb elöl
price_desc   Legdrágább elöl
weight_desc  Ajánlatunk    (default selected)
```

(Verified by
`grep -oE '<option[^>]*value="[^"]*"[^>]*>[^<]*</option>' docs/design/yettel/pages/list-mobiltelefon.html`.)

Pager: native Bootstrap-style pagination with navy active state.

```text
.pagination .pagination__item .pagination__link
  position: relative; display: block
  padding: 0.5rem 0.9rem
  font-family: "portal-font-bold", sans-serif, arial
  font-size: 14px
  line-height: 20px
  color: #002340
  opacity: 0.5
  border: 0
.pagination .pagination__item.active .pagination__link
  background-color: transparent
  color: #002340
  opacity: 1
.pagination .pagination__item:first-child .pagination__link,
.pagination .pagination__item:last-child  .pagination__link
  display: flex; align-items: center; justify-content: center
  width: 42px; height: 42px
  margin: 0; padding: 0
  border: 2px solid #003f73
  border-radius: 50%
  color: #002340
  font-size: 24px
.pagination-component__info-bar
  font-family: "portal-font-light", sans-serif, arial
  font-size: 20px
  line-height: 28px
  color: #002340
```

Page size: native `<select id="filter_limit" name="filter[limit]">` with
`20` (default), `50`, `100`. The MiBolt backend will restrict to 12 or 24.

### Header (logo bar, navigation, search, cart)

```text
.header
  position: fixed; top: 0; right: 0; left: 0
  display: flex; flex-direction: column
  max-width: 1920px; margin: 0 auto
  z-index: 1000
.header__container
  width: 100%; max-width: 1140px
  display: flex; align-items: center; justify-content: space-between
  padding-right: 15px; padding-left: 15px
.header__wrapper
  background: #002340
  color: #fff
.portal-header__bar (lime variant of the inner header strip)
  height: 72px
  background: #b4ff00
.brand-logo
  width: 123px; height: 32px
  margin: 8px 0
  background-color: #232841
  fill: #b4ff00   (default brand fill on navy)
.portal-header-menu__link
  font-family: "portal-font-bold", sans-serif, arial
  font-size: 20px
  line-height: 28px
  display: block
  padding: 21px 0
  border-bottom: 1px solid #e5e9ec
  color: #b4ff00
.portal-header-menu__link:hover::before (active/hover underline)
  display: block; position: absolute; top: 62px; bottom: 0; left: 0
  width: calc(100% + 48px); height: 3px
  margin-left: -24px
  border-radius: 8px 8px 0 0
  background-color: #b4ff00
  content: ""
.search-box__group
  align-items: center
  height: 48px
  padding: 0 16px
  border-radius: 8px
  background-color: #fff
.portal-header__cart-counter (the cart badge — the navy fill/white-text rule wins in source order over the lime/navy rule)
  display: inline-block; position: absolute; top: 0; right: 0
  width: 16px; height: 16px
  border-radius: 50%
  background-color: #002340
  color: #fff
  font-size: 10px
  line-height: 16px
  text-align: center
```

### Footer

```text
.portal-footer
  position: relative
  max-width: 1920px
  margin: 0 auto; margin-top: -16px
  border-top: 0
  background-color: #002340
```

(`grep -oE '[^}]{0,180}\{[^}]*portal-footer[^}]*\}' docs/design/yettel/css/portal.css`.)

### Device page: image gallery / carousel

The device page uses Swiper (the `swiper-container`, `swiper-wrapper`,
`swiper-slide`, `swiper-pagination-bullet`, `swiper-button-prev/next`
classes appear in the markup and CSS):

```text
.product-details__image-container   ← .mobile-gallery__swiper-container
  flex-shrink: 0
  position: relative; overflow: hidden
.mobile-gallery__swiper-slide
  flex-shrink: 0
  width: 100%; height: 100%
  position: relative
.thumbnail-container   ← bottom thumbnails row, 60px wide
  width: 60px
  height: 100%
  margin-bottom: 24px
  padding: 10px
  border: 2px solid #e5e9ec
  border-radius: 8px
  text-align: center
  cursor: pointer
.thumbnail-container.active
  border: 2px solid #b4ff00
  background: rgba(255,255,255,0.1)
.configurator-cards__carousel-button-next, .configurator-cards__carousel-button-prev
  /* swiper default prev/next arrow buttons, navy on light surface */
.configurator-cards__carousel-pagination .swiper-pagination-bullet
  width: 8px; height: 8px
  background-color: #fff
  box-shadow: 0 0 0 1px #80919f
.configurator-cards__carousel-pagination .swiper-pagination-bullet-active
  width: 12px; height: 12px
  background: #002340
  box-shadow: none
```

The carousel selector in the captured markup is
`flex-shrink-0 mobile-gallery__swiper-container product-details__image-container productImageCarousel`
on the container and
`swiper-slide d-flex justify-content-center align-items-center align-items-lg-start product-details__image-wrapper mobile-gallery__swiper-slide`
on each slide, so the Angular build will use Swiper with these class names
on the same elements.

### Device page: colour and storage variant selectors

The colour/storage variant items on a device page are `.product-variant-item`
chips, with the same recipe for both kinds:

```text
.product-variant-item
  display: inline-flex; align-items: center
  margin-right: 8px; margin-bottom: 6px
  padding: 13px 16px 11px
  border-radius: 8px
  text-decoration: none !important
  box-shadow: 0 0 0 1px #e5e9ec inset
.product-variant-item--color     (min-width 144px or calc(50% - 8px) on narrow)
.product-variant-item--main-model (min-width 106px or calc(50% - 8px))
.product-variant-item__color-preview
  width: 16px; height: 16px
  margin-right: 12px
  border-radius: 50%
  box-shadow: 0 0 2px rgba(0,0,0,0.6)
.product-variant-item--selected
  font-weight: 700
  box-shadow: 0 0 0 2px #b4ff00 inset
```

A second `.product-variant-item--selected` rule on the device page swaps the
lime ring for navy
(`box-shadow:0 0 0 2px #002340 inset`), and that is the rule that wins on
yettel.hu's live device page: measured in Chrome on 2026-09-22 (Apple iPhone
17 Pro, 1920x1080 and 390x844), the selected chip's computed box-shadow is
`rgb(0, 35, 64) 0 0 0 2px inset` with a bold label, and every chip is 48px
tall. MiBolt follows the measured page: a navy ring and 48px chips (MIM-233,
after the owner asked for less green on the product page). This replaces the
earlier choice of the lime ring. A keyboard-focused chip takes the input-focus blue
outline (`--color-focus-input`, `#0069c0`, yettel's own form-control focus
colour) instead of the global navy ring, so focus never reads as the navy
selection.

### Device page: price and instalment blocks

The price block sits inside a `product-prices__container` (border-radius
16px, 2px solid `#f2f4f5`, white background) and is broken into:

- `.product-prices-section__login-icon` and `.product-prices-section__cta`
  for the call-to-action button.
- `.shield-configurator-card__headline` (the "Teljes ár:" line).
- The three configurable cards `.configurator-card` for the "tarifa",
  "készülék ár" and "biztosítás" items (tariff, device price, insurance),
  each with `.configurator-card__item` whose computed base
  fill is `background-color:#01385e` and radius is 16px. The popular card
  uses `.configurator-card--popular .configurator-card__item{box-shadow:0 0 0 3px #b4ff00 inset}`;
  the selected (non-popular) card uses
  `.configurator-card.active .configurator-card__item{background-color:#01385e;border-radius:16px}` —
  same dark fill, no inset ring (the card body switches to white-on-navy
  text via `.configurator-card.active .configurator-card__title{color:#b4ff00}`
  and similar rules).

There is no per-month "részlet" line in the captured CSS: the MiBolt
backend has one-off prices only, so the instalment / "havi" row is dropped
(see §7).

### Device page: specification table

```text
.specification__title   ← h3
  font-family: "portal-font-bold", sans-serif, arial
  font-size: 32px; line-height: 40px
  margin-bottom: 48px
  color: #002340
  font-weight: 600
.specification__boxes   ← three-column layout container (border lives on .boxes__container, not here)
  margin-bottom: 30px
  -moz-column-gap: 30px; column-gap: 30px
  -moz-column-count: 3; column-count: 3
.boxes__container
  border: solid 2px #f2f4f5
  border-radius: 8px
.boxes__title
  font-family: "portal-font-bold", sans-serif, arial
  font-size: 16px; line-height: 24px
  background-color: #f2f4f5
  color: #002340
```

The specification groups are stackable and broken into `.boxes__container`
items within `.specification__boxes`.

## 6. List page feature inventory

What the captured yettel list page (`docs/design/yettel/pages/list-mobiltelefon.html`)
offers, against what the MiBolt backend serves per the contract
`contracts/commerce/openapi.yaml` at the git root (version 2.0.0 when this
inventory was written). `GET /api/v1/products`
takes `q`, `brand` (repeatable), `storageGb` (repeatable), `color`
(repeatable colour code), `minPrice`, `maxPrice`, `inStock`, `is5g`,
`featured`, `sort` (`ProductSort`: `recommended` (default), `newest`,
`oldest`, `popularity`, `price_asc`, `price_desc`, `name_asc`, `name_desc`),
`page` and `pageSize` (12 or 24, default 12). The response is `ProductPage`
with `items: CatalogItem[]` and `facets: Facets` (`brands`, `storageGb` and
`colors` as `{value, label, count}` lists, `colors` with `swatchHex` too,
`is5g` and `inStock` as counts, `priceRange {min, max}`). A `CatalogItem`
carries `id`, `slug`, `brand`, `name`, `highlights`, `is5g`, `releasedAt`,
`storageGb`, `variantId`, `variantSlug`, `price`, `availability`
(`in_stock` or `out_of_stock`), `maxQuantity`, `image` and
`colors: ColorOption[]`. The catalogue has no "new" flag and no
`discounted` flag.

| Feature | yettel | MiBolt backend | Decision | Reason |
| --- | --- | --- | --- | --- |
| Sort by `name_asc/desc`, `price_asc/desc`, `date_asc/desc`, `popularity`, `weight_desc` (Ajánlatunk) | Eight options in `<select id="filter_order">` | `sort` (`ProductSort`): `recommended` (default), `newest`, `oldest`, `popularity`, `price_asc`, `price_desc`, `name_asc`, `name_desc` | take | Maps 1:1: "Ajánlatunk" → `recommended`, "Legújabb elöl" → `newest`, "Legrégebbi elöl" → `oldest`, "Legnépszerűbb elöl" → `popularity`, "Legolcsóbb elöl" / "Legdrágább elöl" → `price_asc` / `price_desc`, "Név szerint (A-Z)" / "(Z-A)" → `name_asc` / `name_desc`; the API returns 400 for an unknown value. |
| Page size 20/50/100 | Native `<select id="filter_limit">` | `pageSize` 12 or 24 | take without 50/100 | The brief sets the page size to 12 or 24. |
| Free-text search | `<input name="filter[search]">` | `q` | take | Maps 1:1. |
| Manufacturer filter (brand) | `filter[specification][manufacturer][]` checkboxes, "Még több gyártó" reveals more | `brand` (repeatable) | take | Maps 1:1; brands are Samsung, Apple, Xiaomi, Google, Honor, Motorola, Vivo from the captured page. |
| Storage filter | `filter[specification]` (generic spec filter, not dedicated) | `storageGb` (repeatable) | take | Backend has a dedicated field; the yettel implementation is generic. |
| Colour filter | not present on the captured list page | `color` (repeatable colour code) and `Facets.colors` (`ColorFacetValue`: `value`, `label`, `count`, `swatchHex`) | take without yettel reference | The backend serves the facet with swatches; the filter panel renders it as a swatch row with the §5 colour-picker recipe. |
| Price range filter | not present as a slider on the captured list page (yettel ties it to a tariff selection) | `minPrice`, `maxPrice` and `Facets.priceRange {min, max}` | take without yettel reference | The bounds of the current result set come from `priceRange`; the frontend does not compute them locally. |
| In-stock filter | not present | `inStock` (boolean query param) | take without yettel reference | The list does not echo an `inStock` field; the filter narrows the catalogue, the card derives stock from `CatalogItem.availability` (`in_stock` or `out_of_stock`); `Facets.inStock` is the count of in-stock items. |
| 5G-ready filter | not present | `is5g` | take without yettel reference | Backend has the flag. |
| Featured filter | not present | `featured` | drop from UI for now | Backend has the flag but the catalogue has no featured items in the demo; deferred. |
| Tariff filter (`filter[tariff]`, "Tarifát választok" modal) | Yes, modal with monthly price options | not served | drop | The backend has no tariff model; the filter and the modal are dropped. |
| Installment-only filter | `filter[flags_only_with_installment]` | not served | drop | No instalment model in the backend. |
| Zero gross price filter | `filter[flags_only_zero_gross_price]` | not served | drop | Same. |
| Pagination | `.pagination` with navy active state | yes, with `page` and `pageSize` | take | Maps 1:1; the visual recipe is in §5. |
| Disjunctive facet counts | not visible in the captured markup | yes: `Facets.brands`, `Facets.storageGb` and `Facets.colors` carry `count`; `Facets.is5g` and `Facets.inStock` are counts | take | Frontend renders the count beside every facet option and disables zero-count options. |
| Product card with discount badge (`.label-discount{background:#b4ff00;color:#002340}`) | Yes, lime badge | backend has no `discounted` flag and no discount signal on `Product` or `CatalogItem` | drop the badge | No data to drive it; the badge style is documented for a future flag. |
| Card-level "Új" / "Akció" badge | not present on cards | backend has no "new" flag | drop | No data to drive it. |
| Card-level colour swatches (`.product-card__color-picker`, 12px / 24px selected) | Yes | `CatalogItem.colors: ColorOption[]` (each `colorCode`, `colorName`, `swatchHex`, `variantId`, `variantSlug`, `price`, `availability`); `Product.variants: Variant[]` on the device page | take | The recipe is in §5; the list card renders every `colors[]` swatch, and selecting one swaps the card's price and link to that `variantSlug` while the image stays (the list payload carries one image per item, 2026-09-22); the home featured grid renders the same card (MIM-213); the device page uses the full `variants[]`. |

## 7. Device page feature inventory

| Feature | yettel | MiBolt backend | Decision | Reason |
| --- | --- | --- | --- | --- |
| Image gallery / carousel (Swiper) | `.mobile-gallery__swiper-container` with `.product-details__image-container` and `swiper-slide` per image | `Variant.images: Image[]` (each `id`, `src`, `alt`, `width`, `height`; `src` is used unchanged and may be `/api/v1/media/<id>`) | take | The visual recipe is in §5; the frontend component will wrap Swiper with the captured class names. |
| Bottom thumbnail row (60px, lime active ring) | `.thumbnail-container` + `.thumbnail-container.active{border:2px solid #b4ff00}` | gallery images served | take | Recipe is in §5. |
| Colour variant chips (`.product-variant-item--color`) | Yes, with selected navy ring (MIM-233) | `Product.variants[]` (`colorCode`, `colorName`, `swatchHex` per variant) | take | Recipe is in §5. |
| Storage variant chips (`.product-variant-item--main-model`) | Yes, same selected navy ring (MIM-233) | `Product.variants[]` (`storageGb` per variant) | take | Recipe is in §5. |
| One-off price block | `.product-prices__container` border-radius 16px, white surface | served | take | Recipe is in §5. |
| Instalment / "havi" block | `.shield-configurator-card__headline` with "Teljes ár:", three configurator cards ("tarifa" / "készülék ár" / "biztosítás": tariff, device price, insurance) | not served | drop | Backend has one-off prices only, no instalment or tariff model. |
| Tariff configurator card | `.configurator-card--tariff-shield` with `border:2px solid #b4ff00;background:rgba(255,255,255,0.1)` for selected | not served | drop | No tariff model in the backend. |
| Insurance upsell (`.configurator-card__payment`, `.shield-configurator-card__body`) | Yes, with sky-blue background (`#c4dfe9`) | not served | drop | User said no services. |
| Specification table (`.specification__boxes`, `.boxes__title`) | Yes, in `.specification__boxes` | `Product.specGroups: SpecGroup[]` (`id`, `title`, `rows: SpecRow[]` with `label`, `value`) | take | Recipe is in §5; the boxes are grouped under `.specification__title` headings. |
| Related devices (`.recommendation-item`) | Yes, with sky-blue cards and `.product-card-list` row | `GET /api/v1/products/{slug}/related` returns up to four `CatalogItem`s in relevance order, loaded separately from the product | take | The recommendation row uses the §5 card recipe and shows a placeholder until the related call returns. |
| Service upsell ("készülék-biztosítás", "kiterjesztett garancia": device insurance, extended warranty) | Yes | not served | drop | User said no services. |
| Stock state | not visible in the captured markup (covered by "Kosárba" button visibility) | derived from `CatalogItem.availability` on the list and `Variant.availability` on the device page, values `in_stock` and `out_of_stock` | take | The frontend derives in-stock from `availability === 'in_stock'` on the selected variant; there is no top-level `inStock` field on `Product` or `CatalogItem`. The in-stock line ("Raktáron") on the navy buy box is white, as measured on yettel.hu's device page on 2026-09-22 (MIM-233). |
| "Teljes ár:" headline | Yes, navy bold | served | take | Recipe is in §5; used as the single price line on the MiBolt device page. |

## 8. Checkout notes

The cart and checkout pages were not captured. The home page
(`docs/design/yettel/pages/home.html`) and the four device pages are the
only surfaces in `docs/design/yettel/pages/` and they show cart interaction
only at the level of a header cart counter (`.portal-header__cart-counter`
with a lime-on-navy pill, see §5) and the configurator's CTA buttons. The
cart page exists as screenshots only, `docs/design/yettel/screenshots/cart-1920.png`
and `cart-390.png` (reached without a login); the checkout itself was not
captured, because the step after the cart submits a real order on yettel.hu.
The MiBolt checkout keeps its current structure; the cart screenshots are the
reference for the cart page's surfaces (line items, the sticky order button,
the summary). On the mobile cart capture yettel's own chat bubble overlaps the
sticky order button, which the MiBolt cart avoids.

### Delivery step: option rows, pickup note and summary

The owner asked for a minimal facelift of the order flow (in English: "the
order flow needs a minimal facelift too, I don't like the layout or the
elements"). With no captured yettel checkout, the delivery step borrows the
nearest yettel choice control, the §5 variant chip, and scales it to a row:

- **Option rows** (delivery options and payment methods alike): a white
  ground (`--color-surface-light`), no border, the chip's
  `box-shadow: 0 0 0 1px #e5e9ec inset` (`--color-line-thumb`) and an 8px
  radius (`--radius-control`); the 16px padding stays. An available row
  that is not selected takes the chip's 1px navy ring on hover. The
  selected row takes the chip's `0 0 0 2px #002340 inset` ring
  (`--color-brand-ink`) and a bold title, on the same white ground: the
  sky fill and the navy border it replaces are gone. The lime
  "Kiválasztva" badge stays, because the specs and the screen reader's
  polite announcement both hang on it.
- **Unavailable rows** wear the shared disabled look (§9, "Button variants
  after the remap"): a 2px dashed `--color-disabled-border` edge drawn as an
  inset outline like the product page's unavailable chips,
  `--color-disabled-text` on the title and the description, full opacity
  instead of the old 0.6, and `cursor: not-allowed`; the reason sentence
  keeps its error red.
- **The fee** sits right-aligned on the title line as the 20px `md` amount
  with no label (`PriceBlock` `showLabel` false): a price beside an option
  reads as that option's price, the way the receipt rows print theirs, so
  the small "Szállítási díj" / "Fizetési díj" above a 28px figure goes.
- **The pickup note** is an info `StatusMessage` (§5 Alert), persistent and
  not live, because it is part of the page rather than news about it; the
  host keeps `role="note"`.
- **The summary sidebar** names the chosen delivery option in a row of its
  own ("Szállítási mód"), so the "Szállítási díj" row prints the amount
  alone at the `md` size, where the option's name used to sit as the
  amount's label above a 28px figure.

### Review step: price change, payment status and the order button

The same facelift reaches the review step, where three surfaces still wore
the look the §5 Alert left behind:

- **The price-change notice** keeps its warning colours (the
  `--color-status-warning-soft` ground and the `--color-status-warning-text`
  text, §9) and drops the 1px warning border and the 4px left bar, as the
  Alert did; its radius becomes the Alert's 8px (`--radius-control`) and the
  16px padding stays. It stays a block of its own rather than a
  `StatusMessage`, because it carries the two totals and the confirm button.
- **The card payment status** (paid, declined, pending, unfinished, missing)
  leaves the grey bordered box and becomes a `StatusMessage`: success for a
  confirmed payment, error for a declined one, info for every other state;
  persistent and not live, the wrapper around it keeping its own
  `role="status"`. The state's buttons sit under it, with no box around them.
- **The order button's explanation** (why "Demórendelés véglegesítése" is
  disabled) starts at the button's left edge instead of being centred under a
  button that sits on the left.

## 9. Token mapping

The Angular build keeps the legacy token names the ~1000 existing `var(--…)`
usages already reference, and resolves each one to a yettel theme variable.
The theme variables are declared once, in the `@theme` block of
`src/styles.css` (Tailwind v4: `--color-*` produces the `bg`, `text` and
`border` utilities, `--radius-*` produces `rounded-*`, `--font-*` produces
`font-*`); the legacy names are declared once, in `src/styles/tokens.css`.
Every hex below is a value from §2, §3 or §4 of this document, and the
"yettel use" column names the selector or the screenshot that carries it
there.

**Lime is the brand colour.** The first version of this table read the
palette off the captured CSS, where `.btn--primary` is white on navy, and made
navy the accent. The captured screens say the opposite:
`docs/design/yettel/screenshots/home-1920.png` has a lime `#b4ff00` header
bar, lime "Megnézem" and "Belépés" pills with navy text, lime promo tiles and
a lime "Feliratkozom" pill on the navy footer, and
`docs/design/yettel/screenshots/device-1920.png` has lime "Kosárba rakom" and
"Visszahívást kérek" pills on the navy configurator card. Navy `#002340` is
what yettel writes *in*: body text, headings, the quick-links band under the
hero, the footer ground. `.btn--primary` is the exception the CSS keeps, not
the rule the site renders, so the accent tokens resolve to lime and the ink
tokens to navy.

| Legacy token | Theme variable | Hex | Where yettel uses that colour |
| --- | --- | --- | --- |
| `--color-brand-accent` | `--color-accent` | `#b4ff00` | `.btn--primary-inverse,.btn--gray-inverse{color:#002340;background:#b4ff00}` (§5) — the lime pill every CTA on `home-1920.png` and `device-1920.png` renders as |
| `--color-brand-accent-hover` | `--color-accent-hover` | `#c5ff64` | `.btn--primary-inverse:hover{color:#002340;background-color:#c5ff64}` (§5) |
| `--color-brand-accent-soft` | `--color-surface-sky` | `#c4dfe9` | `.information-box{background-color:#c4dfe9;color:#002340}` — the soft call-out tint behind selected and hovered controls (§2). It stays the sky blue: lime is now the accent's own fill, so a lime-derived tint would repeat it, and `home-1920.png` tints the "5G hálózat" tile and the hero band in exactly this blue |
| `--color-brand-ink` | `--color-primary` | `#002340` | `.btn-outline-navy{color:#002340;border-color:#002340}` (§5) — the ink that pairs with the lime fill and with the soft tint; it is text, so the remap left it alone |
| `--color-surface-light` | `--color-surface` | `#fff` | `body{background-color:#fff}` (§2) |
| `--color-surface-section` | `--color-surface-alt` | `#f2f4f5` | `.featured{background-color:#f2f4f5}` — grey section bands (§2) |
| `--color-shell-dark` | `--color-primary` | `#002340` | `.portal-footer{background-color:#002340}` (§7) and the navy quick-links band under the hero on `home-1920.png` |
| `--color-shell-hero` | `--color-primary` | `#002340` | same navy; yettel carries no darker surface than `#002340` (§2) |
| `--color-shell-line` | `--color-primary-hover` | `#01385e` | `.configurator-card__item{background-color:#01385e}` — the raised/divider tone on navy (§5) |
| `--color-text-primary` | `--color-text` | `#002340` | `.product-card__price{color:#002340}` — navy is the text colour on light surfaces (§2) |
| `--color-text-secondary` | `--color-text-muted` | `#80919f` | `.text-muted{color:#80919f !important}` (§2) |
| `--color-text-inverse` | `--color-surface` | `#fff` | the footer and the quick-links band on `home-1920.png`; §2 gives the inverse text as `#ffffff`, the same value as the default surface, so it resolves to the one white the theme declares |
| `--color-text-inverse-muted` | `--color-line` | `#e5e9ec` | yettel names no muted text for dark surfaces; `#e5e9ec` (`.product-variant-item{box-shadow:0 0 0 1px #e5e9ec inset}`, §2) is its lightest neutral and reads at 13.4:1 on `#002340` |
| `--color-border-subtle` | `--color-line` | `#e5e9ec` | `.solid-input-group{box-shadow:0 0 0 2px #e5e9ec inset}` (§2) |
| `--color-border-control` | `--color-text-muted` | `#80919f` | `.portal-tab-switcher{background-color:#002340;border:solid 2px #80919f}` — yettel's own control border (§4); it is 3.2:1 on white, where `--color-line-strong` `#dddfe1`, the other candidate, is 1.3:1 and so below the 3:1 WCAG 1.4.11 minimum a control border needs |
| `--color-status-success` | `--color-success` | `#5cb85c` | `.valid-feedback{color:#5cb85c}` (§2) |
| `--color-status-error` | `--color-error` | `#d9534f` | `.invalid-feedback{color:#d9534f}` (§2) |
| `--color-status-warning` | `--color-warning` | `#ffd500` | `.alert-warning{background-color:#ffd500;color:#332b00}` (§2) — yettel's own warning ground. The first version of this row resolved to navy `#002340` because both consumers wrote white on the token and yellow would have swallowed it; the pair is dark-on-yellow, so the row below supplies the text colour and the two consumers were switched to it on 2026-09-20 |
| `--color-status-warning-text` | `--color-warning-text` | `#332b00` | `.alert-warning{…;color:#332b00}` (§2) — the dark olive yettel writes on that yellow. It carries the DEMÓ memory bar's text, its hairline and its badge (`demo-notice.scss` `.demo-notice--memory`). Both theme variables are named `--color-warning*` rather than `--color-status-warning*`: a legacy name pointing at a theme variable of the same name is a self-referencing custom property that resolves to nothing, the failure `src/styles/tokens.css` already records for `--radius-card` |
| `--color-status-info` | `--color-surface-sky` | `#c4dfe9` | `.alert{display:flex;background-color:#c4dfe9;border-radius:0 0 16px 16px}` (§2) |
| `--color-status-success-soft` | — (a `color-mix` in `tokens.css`) | 12 % `--color-status-success` on `--color-surface-light` | Not a yettel value (MIM-240): the ground of a success alert (StatusMessage `is-success`). yettel's alerts use solid grounds, so the tinted grounds are this project's own; the alert's shape is yettel's `.information-box` (§5, "Alert") |
| `--color-status-warning-soft` | — (a `color-mix` in `tokens.css`) | 22 % `--color-status-warning` on `--color-surface-light` | Not a yettel value (MIM-240): the ground of the checkout's price-change notice (`review-step.scss` `.price-change`); yettel's `.alert-warning` is the solid `#ffd500` |
| `--color-status-error-soft` | — (a `color-mix` in `tokens.css`) | 8 % `--color-status-error` on `--color-surface-light` | Not a yettel value (MIM-240): the ground of an error alert (StatusMessage `is-error`), of the invalid terms-consent card and of the contact form's error summary |
| `--color-focus-light` | `--color-primary` | `#002340` | yettel sets `outline:none !important` on `.btn` and carries no focus recipe; navy is the brand ink and is 16.3:1 on white, where lime would be 1.35:1 |
| `--color-focus-dark` | `--color-accent` | `#b4ff00` | `.portal-header-menu__link{color:#b4ff00}` and `.thumbnail-container.active{border:2px solid #b4ff00}` — lime is what reads on navy (§5). The exceptions are the controls that are themselves lime on a navy ground — `is-secondary-on-dark`, `is-primary-on-dark` (the product page's desktop "Kosárba teszem" and the cart summary's "Tovább az adatokhoz"), the footer CTA and the two hero CTAs — whose ring is `--color-text-inverse`, and the lime header bar, where a lime ring is invisible and `--color-focus-light` is used |
| `--radius-card` | `--radius-card` | `16px` | cards, modal content, `.product-prices__container` (§4); the legacy name and the theme name are the same name and the sheet declares it once |
| `--radius-control` | `--radius-input` | `8px` | `.solid-input-group{border-radius:8px}` — the 165-use dominant radius (§4) |
| `--radius-badge` | `--radius-input` | `8px` | same 8px; the token also carries skeleton blocks and focus rings, which a 24px pill would distort (§4) |
| `--button-radius` | `--radius-pill` | `24px` | `.btn{…border-radius:24px}` (§4, §5) |
| `--font-family-base` | `--font-sans` | `"portal-font-regular", sans-serif, arial` | `body{font-family:"portal-font-regular",sans-serif,arial}` (§3) |
| `--font-family-bold` | — (literal) | `"portal-font-bold", sans-serif, arial` | §3; declared outside `@theme`, see the third note below |
| `--font-family-light` | — (literal) | `"portal-font-light", sans-serif, arial` | §3; declared outside `@theme`, see the third note below |

### Text colour is decided per surface, not per token

The accent is a fill, so whatever sits on it is navy, and whatever sits on a
navy ground is white. Three rules cover every consumer in the build:

- **Navy `--color-text-primary` on a lime `--color-brand-accent` fill.** The
  button primitive, the cart badge, the header brand mark, the checkout step
  chip, the discount and receipt badges, the hero CTA, the `not-found` primary
  link, the retry button. `.label-discount{background-color:#b4ff00;color:#002340}`
  (§5) is the same pair.
- **White `--color-text-inverse` on a navy ground.** The footer, the
  quick-links band, the hero copy, the checkout header. Unchanged by the
  remap, and unchanged by anything in this pass.
- **Navy `--color-brand-ink` for anything drawn *with* the accent on a light
  ground.** Lime on white is 1.35:1 and on the `#c4dfe9` tint 1.32:1, so a
  lime icon, badge text, hairline border or focus ring on a light surface is
  not visible at all. Four such places were swapped to the ink token in this
  pass: `how-demo-works.scss` `.how__icon`, `demo-notice.scss`
  `.demo-notice__badge` (text and border), `contact-step.scss` `.demo-notice`
  (border), `review-step.html`'s demo notice (border), and `app.scss`'s
  `.skip-link:focus` ring, which sits outside the link on the white page and
  uses `--color-focus-light`.

Four further things this table does not do, each for a measured reason.

- **The header is lime, with navy on it, and the token is not what carries
  it.** `home-1920.png` renders a lime `#b4ff00` bar with a navy wordmark,
  navy menu links, a white search box, navy icons and one navy pill
  ("Belépés") with white text, and `.portal-header__bar{height:72px;
  background:#b4ff00}` (§5) is the rule behind it. `--color-shell-dark` feeds
  the header, the footer and the hero at once, and §7 fixes the footer at
  `#002340` with white text, so the header does not take its ground from that
  token any more: `header-nav.scss` sets `background: var(--color-accent)` and
  `color: var(--color-primary)` on `.header` itself and resolves every other
  colour per surface in that same sheet — navy brand word on a navy mark with
  a lime letter, navy menu links whose hover/active underline is a 3px
  `currentColor` bar with an `8px 8px 0 0` radius (`.portal-header-menu__link`,
  §5), a white `--color-surface` search box at 48px and an 8px radius
  (`.search-box__group`, §5), a 16px navy cart counter with white 10/16 text
  (`.portal-header__cart-counter`, §5), and the checkout back link as
  `.btn-outline-navy`. Focus rings on that bar are `--color-focus-light`
  (navy): `--color-focus-dark` is lime and lime on lime is invisible, which is
  why that token no longer appears in the sheet. `--color-shell-dark` stays
  navy and still grounds the footer and the hero, which is what §7's
  `.portal-footer` and the capture's footer and quick-links band show.
- **The mobile drawer stays a light panel with navy links.** yettel's own
  mobile menu declares no ground: none of the 15 `.portal-mobile-main-menu`
  rules in `docs/design/yettel/css/portal.css` sets a `background-color`
  (`grep -oE '[^}]{0,200}\{[^}]*\}' docs/design/yettel/css/portal.css | grep
  portal-mobile-main-menu`, measured 2026-09-20), and what it does set is
  written for a light one:
  `.portal-mobile-main-menu .portal-header-menu__link{font-family:"portal-font-bold",sans-serif,arial;font-size:20px;line-height:28px;display:block;padding:21px 0;border-bottom:1px solid #e5e9ec;color:#002340}`,
  `.portal-mobile-main-menu .portal-header-menu__item{border-bottom:1px solid #f3f3f3}`
  and `.portal-mobile-main-menu__language-select{color:#9194a0}`. The drawer
  therefore keeps the panel `accessible-dialog.scss` draws in
  `--color-surface-light`, `--color-text-primary` on its links and
  `--color-surface-section` for their hover and focus tint; `mobile-drawer.scss`
  and `mobile-drawer.html` are unchanged by this pass. Navy is the ground of
  the footer and the hero, not of the menu.

- **The three weights stay numbers** (`--weight-regular: 400`,
  `--weight-medium: 500`, `--weight-bold: 700`). yettel expresses weight as a
  separate face rather than as a weight of one family — §3's three
  `@font-face` blocks are three families, all at the normal weight — so the
  bold and light faces are reached through `font-family: var(--font-family-bold)`
  and `var(--font-family-light)`, which is what the heading reset in
  `src/styles/primitives.css` and the button sheet do.
- **The bold and light faces are not theme variables.** Tailwind v4's
  `--font-*` namespace generates the font-family utilities, so a
  `--font-bold` inside `@theme` generates `.font-bold{font-family:…}` and
  takes the place of the weight utility that `--font-weight-bold: 700`
  generates. Measured on this build before the fix:
  `grep -oE '\.font-bold\{[^}]*\}' dist/mi-bolt/browser/styles-*.css`
  printed `.font-bold{font-family:var(--font-bold)}`, a single rule, while 16
  templates use the `font-bold` class for its weight and had lost it. The two
  faces are therefore plain custom properties in `src/styles/tokens.css`,
  named `--font-family-bold` and `--font-family-light` beside
  `--font-family-base`; only `--font-sans` is in `@theme`, where it has no
  clash and `font-sans` works normally.

### Button variants after the remap

Every variant shares one box, which is `.btn` itself (§4, §5):
`portal-font-bold`, `font-size:16px`, `line-height:24px`, `display:inline-flex`
centred both ways, `padding:12px 24px`, `border:0`, `border-radius:24px`, so
the pill is 12 + 24 + 12 = 48px tall. The two outlined variants carry a 1px
hairline and take that pixel back out of each padding edge
(`padding:11px 23px`), so their box is the same 48px.

| Variant | Class | Recipe | yettel source |
| --- | --- | --- | --- |
| primary | `is-primary` | navy `#002340` on lime `#b4ff00`, hover `#c5ff64`, 24px pill | `.btn--primary-inverse` (§5) |
| navy | `is-navy` | white on navy `#002340`, hover `#01385e` | `.btn--primary` (§5); the "Belépés" pill on the lime bar in `home-1920.png` |
| secondary | `is-secondary` | navy text and border on white, hover tint `#c4dfe9` | `.btn-outline-navy` (§5) |
| secondary on dark | `is-secondary-on-dark` | lime text and 1px lime border on a transparent fill, hover lime fill with navy text | `.btn-outline-lime` (§5), for the navy grounds in `home-1920.png`'s footer and `device-1920.png`'s configurator card |
| disabled (all) | `:disabled:not([aria-busy])` | 2px dashed `#80919f` border, `#4e4e4e` text, transparent fill; on a navy ground (`is-primary-on-dark`, `is-secondary-on-dark`) the border is white at 60% and the text white at 80% | departs from `.btn--primary[disabled]` (§5), see below |

**Disabled is this project's own look, not yettel's.** yettel's
`.btn--primary[disabled]` (`#80919f` on `#e5e9ec`) reads as a paler twin of
an enabled button, and on the lime primary the owner could hardly tell the
two apart (in English: "the yettel-coloured disabled button is not well
visible, you can hardly notice that it is disabled"). Every disabled control
therefore wears one recipe: a 2px dashed `--color-disabled-border` edge,
`--color-disabled-text`, a transparent `--color-disabled-bg`, full opacity and
`cursor: not-allowed`, the owner's pick of a dashed outline over a paler fill.
The button takes the 2px edge back out of its padding (`10px 22px`), so the
pill stays 48px; a button busy with its own request (`aria-busy`) keeps its
variant look and its spinner. The same edge marks the catalogue pager's
boundary arrows, the brand and colour facets with no matching phone
(`is-unavailable`), the product page's unavailable variant chips and the
gallery's end arrows; a control dimmed only while a refetch runs keeps its
plain opacity dim, because it is busy rather than unavailable.

`is-secondary-on-dark` is the outlined lime button rather than a second copy
of the lime pill: the first version of this table gave it the same fill as
`is-primary`, which made the two byte-identical and left the surface with no
restrained action at all, and `.btn-outline-lime{color:#b4ff00;
border-color:#b4ff00}` is what yettel itself puts beside a filled pill on a
navy ground. A navy pill is not the alternative — `.btn--primary` on navy is
invisible, which is why `is-navy` is for the lime bar and the light surfaces
rather than for the dark ones. The focus ring is navy `--color-focus-light`
on the light-ground variants and white `--color-text-inverse` on
`is-secondary-on-dark`, because neither navy nor lime reads against a navy
ground carrying lime. The same exception applies to the two hero CTAs, which
are a lime pill and a lime outline on the navy hero and take the white ring
too.
