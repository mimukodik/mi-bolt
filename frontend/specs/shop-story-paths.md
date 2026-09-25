# Shop story paths

## Application Overview

MiBolt is a Hungarian demo storefront: an Angular application served from the Playwright base URL with the in-page MSW mock behind it (no backend, no database). Every scenario below starts from a fresh page, and the mock's default scenario is already signed in, so no scenario needs a sign-in step.

Three screens carry the six rows. The home page `/` is the `hero` region with its `hero-cta` and `hero-shortcuts` cards, the `featured` region with its four `product-card`s, and the `how-demo-works` region. The catalogue `/telefonok` is `product-card`, `result-count`, the facet panel (`filter-*` in the `filter-sidebar`), `applied-filters`, `catalog-sort`, `catalog-page-size` and the pager's `pagination-current`. An address no route matches renders `not-found-page` with `not-found-home-link` and `not-found-catalog-link`.

The same specs run at both viewports. At 1920x1080 the catalogue's facets are the `filter-sidebar` (`filter-*` test ids); below 1024 px that sidebar is `display: none` and the same facets are the drawer behind the `filter-trigger` button, with their own `drawer-*` test ids whose edits take effect only on `drawer-apply` ("Szűrők alkalmazása"). Every step names the control of whichever mount its viewport shows. The home page's shortcut cards, the catalogue's sort, page size and pager, and the 404's two links use the same test ids at both widths; the header's "Mobiltelefonok" nav link and its "Keresés a telefonok között" search box are hidden below 1024 px behind the header's menu toggle, so the chrome of a page is asserted through the header's brand link where those two are hidden.

Products are never named by slug or product name: a phone is picked by what the screen shows, and the slug is read from the address bar when a later step needs it.

Row coverage. Each of E018, E019, E020, E107, E025 and E035 has one scenario below, and every control those rows name exists in this build. E019's "Use 5G then stock shortcut" is the home page's `shortcut-5g` and `shortcut-instock`, both visible at both widths, so no row needed the nearest scenario the screen offers instead.

## Test Scenarios

### 1. Shop: home, navigation and catalogue stories

**Seed:** `e2e/seed.spec.ts`

#### 1.1. [E018] the hero's call to action opens the catalogue

**File:** `e2e/integration/shop-story-hero-cta-opens-catalogue.spec.ts`

**Steps:**

1. Open `/` and wait for the `hero` region through its `hero-heading` test id. - expect: `hero-heading` reads "A következő mobilod. Egyszerűen.". - expect: `hero-cta` reads "Megnézem a telefonokat" and `hero-cta-secondary` reads "Hogyan működik?". - expect: The document title is "MiBolt — Kezdőlap".
2. Click `hero-cta`, the main call to action. - expect: The address bar is the catalogue path with no query string. - expect: The catalogue's level-1 heading reads "Mobiltelefonok" (this row asserts the heading, not keyboard focus: the project does not test focus). - expect: The document title becomes "MiBolt — Mobiltelefonok". - expect: The wait marker is `result-count`, which only the catalogue renders: a wait on `product-card` alone is already satisfied by the home page's `featured` grid.
3. Read the catalogue's own markers. - expect: `result-count` reads "55 találat a szűrt feltételek szerint". - expect: Exactly 12 `product-card` elements are rendered, the default "12 / oldal". - expect: `catalog-sort` reads "Ajánlott sorrend" and `catalog-page-size` reads "12 / oldal". - expect: The width difference is visible here: at full HD `filter-sidebar` is shown with its `filter-*` facets, below 1024 px it is `display: none` and `filter-trigger` reads "Szűrők".

#### 1.2. [E019] the 5G and the stock home shortcut open the catalogue on their query

**File:** `e2e/integration/shop-story-home-shortcuts-filter.spec.ts`

**Steps:**

1. Open `/` and wait for `hero-shortcuts`, then read its three cards. - expect: `shortcut-all` reads "Összes telefon" with "Válassz a készülékek közül". - expect: `shortcut-5g` reads "5G készülékek" with "Fedezd fel a demó kínálatot". - expect: `shortcut-instock` reads "Raktáron" with "Elérhető a demó készletben". - expect: All three are visible at both widths; below 720 px the row stacks instead of splitting into columns.
2. Click `shortcut-5g` and wait for the catalogue's `result-count`. - expect: The address bar carries `is5g=true`. - expect: `result-count` reads "54 találat a szűrt feltételek szerint". - expect: `applied-filters` shows exactly one `applied-chip`, reading "Csak 5G". - expect: The query reaches the 5G facet at the viewport's own mount: at full HD `filter-is5g` reports `aria-pressed="true"` and its label reads "Csak 5G" with the count 54; below 1024 px open `filter-trigger` and `drawer-is5g` reports `aria-pressed="true"`.
3. Read the grid the 5G shortcut produced. - expect: 12 `product-card` elements are rendered, each with a non-empty heading and a variant line of "<colour> · <gb> GB". - expect: The 54 matches are one fewer than the catalogue's unfiltered 55, so the query narrowed the list.
4. Open `/` again and click `shortcut-instock`, then wait for `result-count`. - expect: The address bar carries `inStock=true`. - expect: `result-count` reads "55 találat a szűrt feltételek szerint". - expect: `applied-filters` shows exactly one `applied-chip`, reading "Csak raktáron", and no 5G chip survives from the previous shortcut. - expect: The stock facet carries the query at the viewport's own mount: `filter-inStock` at full HD, `drawer-inStock` below 1024 px after `filter-trigger`, reports `aria-pressed="true"` with the count 55.
5. Keep the stock query and check the list matches it: select "24 / oldal" in `catalog-page-size`, then walk all three pages with `pagination-next` until it is disabled. - expect: No page carries a `product-card-stock` element, so no visible card reads "Elfogyott". - expect: Every visible card still shows a product heading and a variant line, so the list is the catalogue rather than an empty state. - expect: For reference, the same walk on `/telefonok` without the query finds three `product-card-stock` elements, one on each page, so zero here is the filter's effect and not the first page's own count.

#### 1.3. [E020] opening each featured card lands on that card's product and variant

**File:** `e2e/integration/shop-story-featured-cards-open-products.spec.ts`

**Steps:**

1. Open `/` and wait for `featured-grid` to hold real cards, that is until no `featured-card-skeleton-*` placeholder remains. - expect: `featured-grid` holds four `product-card` elements. - expect: The `featured` region reads "Készülékek" with "Válassz kiemelt készülékeink közül", and `featured-all-link` reads "Összes telefon". - expect: Below 640 px the four cards stack in one column, from 640 px they stand in two, and from 1024 px in four.
2. Read the four cards in order, addressing each by its position in `featured-grid` rather than by its `featured-card-<slug>` test id, because two of the four can be the same product on a different storage and then carry the same test id. For each card note the name in its heading, its variant line "<colour> · <gb> GB", and the `href` of its `product-card-cta`, whose `variant` query parameter is that card's variant. - expect: All four cards name a product and a variant, and every `product-card-cta` reads "Megnézem". - expect: Two of the four variants differ only in the storage number, so the pair is distinguished by the storage in the variant line and in the link's `variant` parameter.
3. Open the first card's `product-card-cta` and wait for `product-page`. - expect: `product-name` is filled and matches the card's heading read in step 2, so the target is neither missing nor empty. - expect: The product page's not-found state does not appear: no error state reads "A termék nem található". - expect: The address bar carries the same `variant` value the card's link carried, and its path segment is the card's product. - expect: The on-screen selection is that variant: `variant-color-group`'s legend reads "Szín: <colour>" with the matching `variant-color-<code>` button selected, and `variant-storage-group`'s legend reads "Tárhely: <gb> GB" with the matching `variant-storage-<gb>` button selected.
4. Return to `/` and repeat step 3 on the second card, then on the third and on the fourth. - expect: Each product page's `product-name` equals its own card's heading. - expect: Each `variant` query parameter equals its own card's variant, so the two cards that share a product open on their own storage rather than on a shared default. - expect: Each page shows a filled `product-name` and its variant legends, so no card leads to an empty name or an empty variant.

#### 1.4. [E107] an unmatched address shows the utility 404 and both recovery links work

**File:** `e2e/integration/shop-story-unknown-path-404-recovery.spec.ts`

**Steps:**

1. Open a path that no route matches, `/nincs-ilyen-oldal`, and wait for `not-found-page`. - expect: `not-found-page` is visible, its level-1 heading reads "Az oldal nem található" and its paragraph reads "A keresett oldal nem érhető el a MiBolt demóban.". - expect: The document title is "MiBolt — Az oldal nem található". - expect: The shop's chrome is still around it: the header's "MiBolt kezdőlap" brand link is visible at both widths, and at full HD the "Mobiltelefonok" nav link and the "Keresés a telefonok között" search box are visible too, since both are hidden below 1024 px behind the header's menu toggle.
2. Click `not-found-home-link`, reading "Vissza a főoldalra". - expect: The address bar is `/`. - expect: `hero-heading` reads "A következő mobilod. Egyszerűen.", so the home recovery landed on the real home page.
3. Open a second unmatched address, `/ez/sem/letezik`, and wait for `not-found-page`. - expect: The same heading "Az oldal nem található" is shown for a multi-segment path, not only for a single unknown segment. - expect: `not-found-catalog-link` reads "Mobiltelefonok".
4. Click `not-found-catalog-link`. - expect: The address bar is the catalogue path. - expect: The catalogue's level-1 heading reads "Mobiltelefonok". - expect: `result-count` reads "55 találat a szűrt feltételek szerint" and 12 `product-card` elements are rendered, so the recovery landed on the loaded catalogue.

#### 1.5. [E025] two brands with 256 GB and the stock filter combine on variants

**File:** `e2e/integration/shop-story-two-brands-storage-stock.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for `result-count`. Read the facets at the viewport's own mount: at full HD the `filter-sidebar` with `filter-brand-*`, `filter-storage-*` and `filter-inStock`; below 1024 px open `filter-trigger` and read the same facets as `drawer-brand-*`, `drawer-storage-*` and `drawer-inStock`, where a change takes effect only on `drawer-apply`. - expect: `result-count` reads "55 találat a szűrt feltételek szerint". - expect: The brand facets show "Apple (17)" and "HONOR (8)" among the first five, both enabled. - expect: The storage facet reads "256 GB (27)" and the stock switch reads "Csak raktáron (55)".
2. Select the Apple brand: `filter-brand-apple` at full HD, `drawer-brand-apple` in the drawer. - expect: `result-count` reads "17 találat a szűrt feltételek szerint", the same 17 the Apple facet itself carries. - expect: The address bar carries `brand=apple`. - expect: `applied-filters` shows one `applied-chip` reading "apple", and the brand facet reports `aria-pressed="true"`. - expect: In the drawer the count and the chips change only after `drawer-apply` is pressed.
3. Select the second brand: `filter-brand-honor` at full HD, `drawer-brand-honor` in the drawer (then `drawer-apply`). - expect: The two brands are OR-ed: `result-count` reads "25 találat a szűrt feltételek szerint", which is the Apple facet's 17 plus the HONOR facet's 8. - expect: The address bar carries both `brand=apple` and `brand=honor`. - expect: `applied-filters` shows two chips, "apple" and "honor", and both brand facets report `aria-pressed="true"`.
4. Select the 256 GB storage: `filter-storage-256` at full HD, `drawer-storage-256` plus `drawer-apply` in the drawer. - expect: The storage facet AND-s with the brands: `result-count` reads "10 találat a szűrt feltételek szerint", the same 10 the "256 GB" facet now carries beside the two selected brands. - expect: The address bar carries `storageGb=256` beside the two `brand` parameters. - expect: `applied-filters` shows the chips "apple", "honor" and "256 GB".
5. Select the stock switch: `filter-inStock` at full HD, `drawer-inStock` plus `drawer-apply` in the drawer. - expect: The count stays at 10: "10 találat a szűrt feltételek szerint", so the filter selects another variant of the same product rather than dropping the product. - expect: The address bar carries `inStock=true` beside the other three parameters. - expect: `applied-filters` shows the fourth chip "Csak raktáron", and below 1024 px `filter-trigger` reads "Szűrők (4)".
6. Read the ten cards of the filtered grid. - expect: Each card carries exactly one variant line, "<colour> · <gb> GB", and every one of them ends in "256 GB", so each match is one variant. - expect: No card carries `product-card-stock`: the one card that read "Elfogyott" before this switch now shows the product's other 256 GB variant, and the list is still ten cards. - expect: Every heading starts with one of the two selected brands' facet labels compared case-insensitively (the facet reads "HONOR" while the headings read "Honor"), so no third brand is present.

#### 1.6. [E035] filters, sort and paging survive the browser's back and forward

**File:** `e2e/integration/shop-story-filters-sort-page-history.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for `result-count`. - expect: `result-count` reads "55 találat a szűrt feltételek szerint" with 12 `product-card` elements and no chip in `applied-filters`. - expect: `pagination-current` reads "1" and `catalog-sort` reads "Ajánlott sorrend".
2. Apply the first filter, the Fekete colour: `filter-color-fekete` in the sidebar at full HD, `drawer-color-fekete` behind `filter-trigger` plus `drawer-apply` below 1024 px. - expect: `result-count` reads "35 találat a szűrt feltételek szerint" and one chip reads "Fekete". - expect: The address bar carries `color=fekete`. - expect: 12 cards are rendered, `pagination-current` still reads "1" and `catalog-sort` still reads "Ajánlott sorrend". - expect: The first card's heading is recorded as this stop's list head.
3. Apply the second filter, the 256 GB storage: `filter-storage-256` in the sidebar at full HD, `drawer-storage-256` plus `drawer-apply` below 1024 px. - expect: `result-count` reads "16 találat a szűrt feltételek szerint" and the chips read "256 GB" and "Fekete". - expect: The address bar carries `color=fekete` and `storageGb=256`. - expect: 12 cards are rendered and `pagination-current` reads "1". - expect: The first card's heading is recorded as this stop's list head and differs from the head of step 2.
4. Change the sort: select "Ár szerint növekvő" in `catalog-sort`. - expect: The address bar carries `sort=price_asc` and `catalog-sort` reads "Ár szerint növekvő". - expect: The result count is still 16, because sorting does not filter. - expect: The visible `price-amount` digits are in non-decreasing order. - expect: The first card's heading is recorded as this stop's list head and differs from the head of step 3.
5. Change the page: press `pagination-next`. - expect: The address bar carries `page=2`, `pagination-current` reads "2" and `pagination-next` is disabled. - expect: Four `product-card` elements are rendered, the second page of the 16 matches. - expect: The chips still read "256 GB" and "Fekete" and `catalog-sort` still reads "Ár szerint növekvő". - expect: The first card's heading is recorded as this page's head and differs from the head of step 4.
6. Press the browser's Back once. - expect: The address bar no longer carries `page=2` and `pagination-current` reads "1". - expect: The selections survive: the chips read "256 GB" and "Fekete". - expect: The sort survives: `catalog-sort` reads "Ár szerint növekvő". - expect: The list is restored: 12 cards whose head is the one recorded in step 4.
7. Press Back a second time. - expect: The address bar no longer carries `sort=price_asc` and `catalog-sort` reads "Ajánlott sorrend" again. - expect: The chips still read "256 GB" and "Fekete" and `pagination-current` reads "1". - expect: The list is restored to the head recorded in step 3.
8. Press Back a third time. - expect: The address bar carries `color=fekete` only and `applied-filters` shows the single chip "Fekete". - expect: `result-count` reads "35 találat a szűrt feltételek szerint" and `pagination-current` reads "1". - expect: The list is restored to the head recorded in step 2.
9. Press Forward three times, checking one stop at a time. - expect: The first Forward restores the state of step 3: the chips "256 GB" and "Fekete", `catalog-sort` on "Ajánlott sorrend", `pagination-current` "1" and that stop's recorded head. - expect: The second Forward restores the state of step 4: the same chips, `catalog-sort` on "Ár szerint növekvő", `pagination-current` "1" and that stop's recorded head. - expect: The third Forward restores the state of step 5: `pagination-current` "2", four cards and that page's recorded head.
