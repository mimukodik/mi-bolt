# MiBolt storefront integration test plan

## Application Overview

MiBolt is a Hungarian demo storefront: an Angular application served from the Playwright base URL with the in-page MSW mock behind it (no backend, no database). The purchase path is the phone listing `/telefonok`, the product page `/telefonok/<slug>`, the cart `/penztar/kosar` and the checkout wizard `/penztar/adatok` -> `/penztar/szallitas` -> `/penztar/ellenorzes` -> `/penztar/siker/<orderId>`; a card payment leaves the SPA for the demo payment application under `/demo-fizetes/<paymentIntentId>` and returns through `/penztar?paymentIntentId=...`.

Two facts govern every scenario here. First, the mock keeps its state (cart, checkout draft, payment intents, receipts) in the browsing context's `sessionStorage`, and the demo access gate starts signed in on the default scenario, so one fresh browser context IS an empty cart with no sign-in step; that is why each scenario is independent and can run in any order. Second, the same specs run in both integration viewports: at 1920x1080 and wider the catalogue's filters are the sidebar (`filter-panel`, test ids `filter-*`), and at 390x844 they are the drawer opened by the `filter-trigger` button with its own test ids (`drawer-*`, applied with `drawer-apply`, because the sidebar is `display: none` below 1024px). A facet step therefore names the control of whichever mount its viewport shows. Controls built on the `app-button` primitive are host elements carrying the test id, so a press targets the native `button` inside them: `page.getByTestId('<id>').getByRole('button')`. Prices come from the `app-price-block` primitive, whose digits sit in `[data-testid="price-amount"]` with the `Ft` glyph as a separate span beside them, so a price is read as a number from that element.

Products are never named by slug or product name: every scenario picks its card by what the screen shows (the first card with no "Elfogyott" marker, or a card carrying it). The cash-on-delivery scenario additionally needs a cart at or below 300 000 Ft, the mock's `CASH_ON_DELIVERY_MAX_CART_HUF`. The two card scenarios need the demo payment application served on the port the shop's dev server proxies `/demo-fizetes` to (4210 in `angular.json`).

## Test Scenarios

### 1. Catalogue: browse, filter, sort and page

**Seed:** `e2e/seed.spec.ts`

#### 1.1. the catalogue lists the phone cards with their price and their stock marker

**File:** `e2e/integration/catalogue-lists-the-phone-cards.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid: the loading state `catalog-loading` gives way to `catalog-grid`. - expect: The `h1` reads "Mobiltelefonok". - expect: `catalog-grid` holds at least one `product-card`. - expect: `result-count` reads "<n> találat a szűrt feltételek szerint" with n greater than 0 (it reads "Keresés a katalógusban…" while the first response is in flight).
2. Read the parts of the first `product-card`. - expect: The card shows the product name in its heading and a variant line with the colour name and "<n> GB". - expect: The price block labelled "Egyszeri készülékár" shows digits in `price-amount` with a separate "Ft" glyph beside them. - expect: `product-card-cta` reads "Megnézem" and its accessible name is "<product name> részleteinek megnyitása".
3. Read the stock markers across the visible cards: a card whose shown variant is out of stock carries `product-card-stock`, an in-stock one carries no such element. - expect: A `product-card-stock` element, when present, reads exactly "Elfogyott". - expect: The default scenario ships both kinds (the catalogue fixture holds 92 variants, five of them at stock 0), so a card without the marker exists on the first page and is what the later scenarios treat as buyable.
4. Read the toolbar. - expect: `catalog-sort` offers "Ajánlott sorrend", "Legújabb elöl", "Legrégebbi elöl", "Népszerűség szerint", "Ár szerint növekvő", "Ár szerint csökkenő", "Név szerint (A–Z)" and "Név szerint (Z–A)", and currently reads "Ajánlott sorrend". - expect: `catalog-page-size` offers "12 / oldal" and "24 / oldal" and currently reads "12 / oldal". - expect: The facet groups "Keresés", "Gyártó", "Szín", "Tárhely", "Ár (Ft, egész szám)" and "Egyéb" are reachable: in the sidebar `filter-panel` at the full HD viewport, and behind the "Szűrők" trigger `filter-trigger` at the mobile viewport.
5. Read the pager. - expect: `catalog-pagination` is visible, because the catalogue holds more entries than one page of 12. - expect: `pagination-current` reads "1", `pagination-prev` is disabled and `pagination-next` is enabled.

#### 1.2. filtering by manufacturer narrows the catalogue

**File:** `e2e/integration/catalogue-filter-by-manufacturer.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid (at least one `product-card`). Note the number in `result-count`. - expect: `result-count` reads "<n> találat a szűrt feltételek szerint". - expect: 12 `product-card` elements are rendered (the default page size).
2. Read the first ENABLED manufacturer facet button of the "Gyártó" group: `filter-brand-<value>` in the sidebar, or `drawer-brand-<value>` after opening the drawer with `filter-trigger` at the mobile viewport. - expect: The button's label is "<brand display name> (<count>)" and its count is greater than 0. - expect: A brand whose count is 0 is disabled and is skipped: the catalogue lists every brand with zero counts included.
3. Activate that manufacturer filter. - expect: The button exposes `aria-pressed="true"` and shows its "✓" mark. - expect: The URL query string carries `brand=<value>`. - expect: `applied-filters` appears with exactly one `applied-chip`, whose text is the lowercased brand key, and `applied-chip-remove-brand` is present. - expect: `filter-trigger` (the mobile trigger) reports its selected count as "Szűrők (1)".
4. Check the effect on the grid. - expect: Every visible `product-card` name starts with that brand's display name. - expect: The result count reads "<m> találat a szűrt feltételek szerint" with m smaller than the unfiltered n. - expect: The manufacturer facet buttons still list every brand, each with its own recalculated count.

#### 1.3. filtering by colour narrows the catalogue

**File:** `e2e/integration/catalogue-filter-by-colour.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid. Note the number in `result-count`. - expect: `result-count` reads "<n> találat a szűrt feltételek szerint".
2. Read the first ENABLED colour chip of the "Szín" group: `filter-color-<code>` in the sidebar, or `drawer-color-<code>` in the drawer opened with `filter-trigger` at the mobile viewport. - expect: The chip shows the colour's display name with its count, e.g. "Fekete (12)", and a colour swatch beside the label. - expect: The chip is enabled; a colour whose count is 0 while unselected is disabled and is skipped.
3. Activate that colour filter. - expect: The chip exposes `aria-pressed="true"` and its swatch carries the selection state. - expect: The URL query string carries `color=<code>`. - expect: The applied chip's text is the colour's display NAME (the page swaps the URL's colour code for the facet's label) and `applied-chip-remove-color` is present.
4. Check the grid. - expect: Every visible card's variant line shows that colour name. - expect: The result count is lower than the count read before the filter.

#### 1.4. filtering by storage narrows the catalogue

**File:** `e2e/integration/catalogue-filter-by-storage.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid. Note the number in `result-count`. - expect: `result-count` reads "<n> találat a szűrt feltételek szerint".
2. Read the first storage facet button of the "Tárhely" group (`filter-storage-<gb>` in the sidebar, `drawer-storage-<gb>` in the drawer) and activate it. - expect: The button's label is "<gb> GB (<count>)" and it becomes selected with `aria-pressed="true"`.
3. Check the URL and the chips. - expect: The URL query string carries `storageGb=<gb>`. - expect: The applied chip reads "<gb> GB" and `applied-chip-remove-storage` is present. - expect: The result count is lower than the count read before the filter.
4. Check the grid. - expect: Every visible card's variant line ends with "<gb> GB". - expect: The storage facet lists every size the catalogue holds, each with its recalculated count.

#### 1.5. sorting reorders the grid

**File:** `e2e/integration/catalogue-sorting-reorders-the-grid.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid. Read every card's name and the digits of its `price-amount`. - expect: 12 cards are rendered and each price is a readable number. - expect: `catalog-sort` currently reads "Ajánlott sorrend".
2. Select "Ár szerint növekvő" in `catalog-sort`. - expect: The URL query string carries `sort=price_asc`. - expect: The visible price amounts are in non-decreasing order, and the first card's amount is the smallest of the visible set. - expect: The result count is unchanged, because sorting does not filter.
3. Select "Ár szerint csökkenő" in `catalog-sort`. - expect: The URL query string carries `sort=price_desc`. - expect: The visible price amounts are in non-increasing order.
4. Select "Név szerint (A–Z)" in `catalog-sort`. - expect: The URL query string carries `sort=name_asc`. - expect: The visible card names, compared case-insensitively, are in non-decreasing alphabetical order.
5. Select "Ajánlott sorrend" again. - expect: The grid returns to the recommended order: its first card is the card read first in step 1.

#### 1.6. the page size and the pager move through the catalogue

**File:** `e2e/integration/catalogue-page-size-and-paging.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid. - expect: `catalog-page-size` reads "12 / oldal" and exactly 12 `product-card` elements are rendered. - expect: `catalog-pagination` is visible, `pagination-current` reads "1", `pagination-prev` is disabled and `pagination-next` is enabled.
2. Click `pagination-next` (its accessible name is "Következő oldal"). - expect: The URL query string carries `page=2`. - expect: `pagination-current` reads "2" and `pagination-prev` is now enabled. - expect: The first card's name differs from the first card on page 1.
3. Click `pagination-prev` (accessible name "Előző oldal"). - expect: `pagination-current` reads "1" and the first card is page 1's first card again.
4. Select "24 / oldal" in `catalog-page-size`. - expect: The URL query string carries `pageSize=24`. - expect: 24 `product-card` elements are rendered (or every entry when the result set holds fewer than 24). - expect: The list is back on its first page: `pagination-current` reads "1".

#### 1.7. a filter combination with no results shows the empty state

**File:** `e2e/integration/catalogue-filter-combination-with-no-results.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid. Note the number in `result-count`. - expect: `result-count` reads "<n> találat a szűrt feltételek szerint".
2. Apply a manufacturer filter: activate the first ENABLED facet button of the "Gyártó" group (`filter-brand-<value>`, or `drawer-brand-<value>` after `filter-trigger` at the mobile viewport). - expect: The chip row `applied-filters` shows one chip and the result count drops.
3. Read the "Ár (Ft, egész szám)" group: the "Min." input (`filter-min-price`, or `drawer-min-price` in the drawer) carries the current floor of the result set as its placeholder and the "Max." input (`filter-max-price` / `drawer-max-price`) the current ceiling. - expect: Both placeholders hold digits and the ceiling is at least the floor.
4. Type into "Min." a value above the ceiling read in the previous step (the ceiling plus one). - expect: The price filter applies: the URL query string carries `minPrice=<value>` and an applied chip reads "Min. ár: <value> Ft". - expect: No error message (`filter-price-error`) is shown, because a lone minimum is a valid range.
5. Check the empty result state. - expect: `result-count` reads "Nincs találat.". - expect: `catalog-empty` is visible with the title "Nincs a szűrőknek megfelelő készülék." and the message "Próbáld meg kevesebb szűrővel, vagy töröld az aktív szűrőket.". - expect: The empty state offers an `app-button` labelled "Szűrők törlése" (`data-async-empty-action`). - expect: No `product-card` is rendered.

#### 1.8. clearing the filters restores the full catalogue

**File:** `e2e/integration/catalogue-clearing-the-filters.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid. Note the unfiltered number in `result-count`. - expect: `result-count` reads "<n> találat a szűrt feltételek szerint" and 12 cards are rendered.
2. Apply three filters in a row: the first enabled "Gyártó" facet, the first enabled "Szín" chip and the first "Tárhely" facet (sidebar controls `filter-brand-*`, `filter-color-*`, `filter-storage-*`; their `drawer-*` twins, applied with `drawer-apply`, at the mobile viewport). - expect: `applied-filters` shows three `applied-chip` elements. - expect: The URL query string carries `brand`, `color` and `storageGb`. - expect: The result count has dropped below the unfiltered number.
3. Remove the storage chip with `applied-chip-remove-storage`. - expect: The chip row shows two chips and the removed one is gone. - expect: Every storage facet button reads `aria-pressed="false"`. - expect: The URL query string no longer carries `storageGb`, the brand and colour filters stay applied, and the result count grows.
4. Press `applied-filters-clear` ("Összes szűrő törlése"). - expect: `applied-filters` is no longer rendered. - expect: Every facet button in every group reads `aria-pressed="false"`. - expect: The URL carries none of `q`, `brand`, `color`, `storageGb`, `minPrice`, `maxPrice`, `inStock` and `is5g`. - expect: The result count is the unfiltered number read in step 1 and 12 cards are rendered again.
5. Check the panel's own reset control with nothing filtered. - expect: `filter-reset` ("Szűrők törlése") is disabled, because it clears the same state the chip row's "Összes szűrő törlése" clears.

### 2. Product: variant choice and add to cart

**Seed:** `e2e/seed.spec.ts`

#### 2.1. choosing a colour and a storage size selects that variant

**File:** `e2e/integration/product-choosing-a-colour-and-a-storage.spec.ts`

**Steps:**

1. Open `/telefonok` and wait for the grid. - expect: At least one `product-card` carries a swatch row `product-card-swatches` with two or more `product-card-swatch` buttons.
2. Open the first in-stock card with such a swatch row: click the `product-card-cta` of the first `product-card` that has NO `product-card-stock` marker and whose `product-card-swatches` group holds at least two swatches. - expect: `product-page` is visible and `product-name` is not empty. - expect: The URL is `/telefonok/<slug>?variant=<id>`: the card's shown variant travels in the query. - expect: `product-stock` reads "Raktáron a demó készletben" for that variant.
3. Read the variant selector, going back to `/telefonok` and opening the next in-stock card with a swatch row whenever the opened product offers fewer than two storage options. - expect: `variant-color-group` lists more than one `variant-color-*` button and its legend reads "Szín: <name>". - expect: `variant-storage-group` lists more than one `variant-storage-*` button and its legend reads "Tárhely: <n> GB". - expect: The button of the selected colour carries `aria-pressed="true"` and the accessible name "<colour name>, kiválasztva"; the other colour buttons read "<colour name>, elérhető".
4. Note the device price in the "Készülékár" price block, the stock line and the selected colour and storage; then click a different `variant-color-*` button (any colour whose `aria-pressed` is "false"). - expect: That colour button now carries `aria-pressed="true"` and the legend reads "Szín: <the newly chosen colour>". - expect: The storage selection is unchanged: the storage legend still names the size chosen before. - expect: The "Készülékár" block and the status of `product-stock` follow the newly selected variant (the stock line reads either "Raktáron a demó készletben" or "Ez a konfiguráció elfogyott a demó készletből.").
5. Click a `variant-storage-*` button that is not currently selected. - expect: That storage button carries `aria-pressed="true"` and the legend reads "Tárhely: <n> GB". - expect: The colour selection is preserved and the price block shows the newly selected variant's amount.
6. Keep choosing colour and storage options until the shown combination is in stock. - expect: `product-stock` reads "Raktáron a demó készletben". - expect: The inner button of `add-to-cart-button` is enabled, and no "Ez a változat jelenleg nem elérhető." hint is shown. - expect: The "Készülékár" price block is in its success state (an amount in `price-amount`, not the `price-empty` placeholder).

#### 2.2. an out-of-stock variant cannot be added to the cart

**File:** `e2e/integration/product-out-of-stock-variant.spec.ts`

**Steps:**

1. Open `/telefonok`, wait for the grid, and page forward with `pagination-next` until a `product-card` carries the `product-card-stock` marker: the default order places the out-of-stock entries on later pages. - expect: Each press moves `pagination-current` on by one and changes the first card. - expect: At least one `product-card` on the shown page carries `product-card-stock` reading "Elfogyott".
2. Click the `product-card-cta` of the first card that carries that marker. - expect: `product-page` is visible and the URL carries that card's `?variant=<id>`. - expect: `product-stock` reads "Ez a konfiguráció elfogyott a demó készletből."
3. Read the purchase controls of that variant. - expect: The reason reads "Ez a változat jelenleg nem elérhető." in the mount the viewport shows: `add-to-cart-reason` beside `add-to-cart-button` at 1024 px and wider, `purchase-rail-reason` under the sticky rail's `purchase-cta` below 1024 px; the other mount is hidden. - expect: The visible call to action's inner button (`add-to-cart-button` at 1024 px and wider, `purchase-cta` below) is disabled, so the variant cannot be added. - expect: `cart-badge` in the header still reads "0".
4. Select another colour whose variant is also out of stock, then come back to the out-of-stock one. - expect: Every out-of-stock selection keeps `product-stock` at "Ez a konfiguráció elfogyott a demó készletből." and `add-to-cart-button` disabled. - expect: An in-stock selection instead shows "Raktáron a demó készletben" and enables the button, which proves the refusal follows the selected variant and not the product.

#### 2.3. adding the selected variant to the cart confirms it and updates the header

**File:** `e2e/integration/product-add-to-cart-confirmation.spec.ts`

**Steps:**

1. Open `/telefonok`, wait for the grid, and read `cart-badge` in the header. - expect: `cart-badge` reads "0": a fresh context holds an empty cart.
2. Open the first in-stock card: click the `product-card-cta` of the first `product-card` that has no `product-card-stock` marker. - expect: `product-page` is visible, `product-stock` reads "Raktáron a demó készletben" and the inner button of `add-to-cart-button` is enabled.
3. Read the product name, the colour, the storage and the "Készülékár" amount, then press the inner button of `add-to-cart-button` ("Kosárba teszem"). - expect: A success status message appears reading "<product name>, <colour>, <n> GB – 1 darab a kosárban." - expect: `cart-badge` reads "1". - expect: The button is enabled again when the add finishes.
4. Open the cart with the header's `cart-link`. - expect: `cart-page` is visible. - expect: Exactly one `cart-line` is rendered, its `cart-line-name` is the product name, its variant line shows the colour and "<n> GB", `cart-line-quantity` reads "1 db" and its "Részösszeg" block shows the variant's price. - expect: `cart-count` reads "Kosárban található termékek (1)" and `cart-continue` ("Tovább az adatokhoz") is enabled.

### 3. Checkout: from the cart to the receipt

**Seed:** `e2e/seed.spec.ts`

#### 3.1. a second add of the same variant raises the cart line's quantity

**File:** `e2e/integration/checkout-cart-quantity-after-a-repeat-add.spec.ts`

**Steps:**

1. Open `/telefonok`, wait for the grid, and open the first in-stock card (the first `product-card` without a `product-card-stock` marker) through its `product-card-cta`. Note the "Készülékár" amount. - expect: `product-page` is visible, `product-stock` reads "Raktáron a demó készletben" and the inner button of `add-to-cart-button` is enabled. - expect: `cart-badge` reads "0".
2. Press the inner button of `add-to-cart-button` once. - expect: The confirmation reads "<product name>, <colour>, <n> GB – 1 darab a kosárban." - expect: `cart-badge` reads "1".
3. Press the same button a second time, without changing the selected colour or storage. - expect: The confirmation now reads "<product name>, <colour>, <n> GB – 2 darab a kosárban.": the message carries the cart line's quantity, not the amount just dispatched. - expect: `cart-badge` reads "2".
4. Open the cart with the header's `cart-link`. - expect: `cart-page` is visible. - expect: Exactly one `cart-line` is rendered: the repeat add merged into the existing line instead of adding a second one. - expect: `cart-line-quantity` reads "2 db" and `cart-count` reads "Kosárban található termékek (1)". - expect: The line's "Részösszeg" block shows twice the unit price noted on the product page.
5. Read the line card's controls. - expect: The line offers no quantity control: it holds `cart-line-name`, the read-only `cart-line-quantity` text "2 db", `cart-line-remove` ("Törlöm", accessible name "Törlöm: <product name>") and the "Részösszeg" price block, and no number input or stepper (like yettel.hu, the cart line shows the quantity as text).

#### 3.2. removing the cart line empties the cart

**File:** `e2e/integration/checkout-cart-line-removal.spec.ts`

**Steps:**

1. Open `/telefonok`, wait for the grid, open the first in-stock card and add it with the inner button of `add-to-cart-button`, then open the cart with the header's `cart-link`. - expect: `cart-page` is visible with exactly one `cart-line`. - expect: `cart-line-remove` ("Törlöm") and `cart-clear` ("Kosár ürítése") are both visible.
2. Press `cart-line-remove`. - expect: No `cart-line` remains on the page. - expect: `cart-page` switches to the empty state: the title "A kosarad még üres.", the message "Nézd meg a demókészülékeket, és válaszd ki a kedvenced." and the action "Telefonokat nézek". - expect: `cart-count`, `cart-continue` and `order-summary` are gone with the line. The checkout layout's header carries no `cart-badge`, so the badge is read in step 3.
3. Press the empty state's "Telefonokat nézek" action. - expect: The browser is on `/telefonok` and the catalogue grid is rendered again. - expect: `cart-badge` in the header reads "0".

#### 3.3. the empty cart offers its way back to the catalogue

**File:** `e2e/integration/checkout-empty-cart.spec.ts`

**Steps:**

1. Open `/penztar/kosar` in the fresh context (the mock keeps the cart in this context's `sessionStorage`, so it starts with no lines). - expect: `cart-page` is visible in its empty state: "A kosarad még üres.", "Nézd meg a demókészülékeket, és válaszd ki a kedvenced." and the action "Telefonokat nézek". - expect: No `cart-line` is rendered. The checkout layout's header carries no `cart-badge`, so the badge is read in step 2.
2. Press "Telefonokat nézek". - expect: The catalogue is shown: the `h1` reads "Mobiltelefonok" and `product-card` elements are rendered. - expect: `cart-badge` in the header reads "0".
3. Deep-link the first checkout step with the cart still empty: open `/penztar/adatok`. - expect: The contact guard sends the empty cart back to the cart page: the URL is `/penztar/kosar?navigationReason=empty-cart`. - expect: The cart page renders the navigation-reason banner with the sentence "A kosarad üres, ezért ide irányítottunk." - expect: `contact-page` is not rendered.
4. Deep-link the last step as well: open `/penztar/ellenorzes`. - expect: The review guard also lands on the cart page with the same reason sentence, so no step of the wizard is reachable with an empty cart.

#### 3.4. the contact form reports its validation errors

**File:** `e2e/integration/checkout-contact-form-validation.spec.ts`

**Steps:**

1. Open `/telefonok`, wait for the grid, open the first in-stock card, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link` and press `cart-continue` ("Tovább az adatokhoz"). - expect: `contact-page` is visible and its `h1` reads "Kapcsolattartási adatok". - expect: `contact-form` shows the hint "A csillaggal jelölt mezők kitöltése kötelező." and the persistent demo notice `contact-demo-notice`. - expect: The URL is `/penztar/adatok`.
2. Press the inner button of `contact-submit` ("Tovább a szállításhoz") with every field empty. - expect: `contact-summary` appears with the title "Kérlek, javítsd a következő mezőket a folytatás előtt:" and lists "Teljes név: A teljes név kötelező.", "E-mail cím: Az e-mail cím kötelező." and "Telefonszám: A telefonszám kötelező.". - expect: `contact-fullname-input`, `contact-email-input` and `contact-phone-input` each carry `aria-invalid="true"`. - expect: The browser stays on `/penztar/adatok`.
3. Type "Teszt Elek" into `contact-fullname-input`, "teszt@" into `contact-email-input` and "1234" into `contact-phone-input`, then press `contact-submit` again. - expect: The e-mail field's message reads "Adj meg egy érvényes e-mail címet.". - expect: The phone field's message reads "Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.". - expect: `contact-summary` lists both fields and the page does not advance.
4. Correct the form: "Teszt Elek", "teszt@example.test" and "+36 30 123 4567"; then press `contact-submit`. - expect: The wizard advances: the URL is `/penztar/szallitas` and `delivery-step` is visible with the `h1` "Átvétel és fizetés". - expect: `delivery-confirm` ("Tovább az ellenőrzéshez") is present. - expect: Return to the contact step through the browser history (`page.goBack()`, an in-app navigation in this Angular SPA). `contact-page` is visible and the form is prefilled from the saved draft: `contact-fullname-input` holds "Teszt Elek", `contact-email-input` holds "teszt@example.test" and `contact-phone-input` holds "+36301234567" (the normalised form). The mock no longer keeps the draft across a page load (owner, 2026-09-25, standard row E016), so the back step is what proves the values were saved rather than a fresh deep link to `/penztar/adatok`, which would land on the empty form with `navigationReason=incomplete`. - expect: Press `contact-submit` again: the wizard advances back to `/penztar/szallitas` with `delivery-step` visible.

#### 3.5. the delivery form reports its validation errors

**File:** `e2e/integration/checkout-delivery-form-validation.spec.ts`

**Steps:**

1. Reach `/penztar/szallitas` with a cart line and a saved contact section: add the first in-stock product from the catalogue, go to the cart with `cart-link`, press `cart-continue`, and fill and submit the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567". - expect: `delivery-step` is visible and its `h1` reads "Átvétel és fizetés". - expect: No `delivery-radio` is checked and no `payment-radio` is checked: the step deliberately starts with no default option, so no paid addon is preselected.
2. Press the inner button of `delivery-confirm` ("Tovább az ellenőrzéshez") without choosing anything. - expect: The message "Válassz szállítási módot." appears under the delivery options and "Válassz fizetési módot." under the payment selector. - expect: The browser stays on `/penztar/szallitas`: the button is never disabled for an incomplete form, it reports the errors on press.
3. Choose the "Házhoz szállítás" option by its `delivery-radio`. - expect: That option shows its "Kiválasztva" badge (`delivery-selected-badge`) and the address form `address-form` appears, with the fields `address-input-postalCode`, `address-input-city`, `address-input-line1` and `address-input-line2` and the read-only country "HU Magyarország". - expect: `summary-row-fee` shows that option's "Szállítási díj".
4. Press `delivery-confirm` again with the address still empty. - expect: The messages "Az irányítószám megadása kötelező.", "A város megadása kötelező." and "A cím megadása kötelező." appear under their fields. - expect: The billing block shows "A számlázási név megadása kötelező." only when its name is empty, and the page does not advance.
5. Type "0123" into `address-input-postalCode` and "B" into `address-input-city`. - expect: The postal code's message reads "Az irányítószám formátuma 4 számjegy, 1-es vagy 9-es kezdettel.". - expect: The city's message reads "A város 2–80 karakter hosszú lehet.".
6. Complete the step: postal code "1052", city "Budapest", address line "Fő utca 1." (the second line stays empty), keep the "A számlázási cím megegyezik a szállítási címmel" tick, choose "Utánvét" by its `payment-radio`, then press `delivery-confirm`. - expect: The billing name is prefilled from the contact step's full name, so the billing block reports no error. - expect: The chosen payment option shows its "Kiválasztva" badge and `summary-row-payment` names it. - expect: The wizard advances: the URL is `/penztar/ellenorzes` and `review-page` is visible.

#### 3.6. the review page's edit links go back to the step they belong to

**File:** `e2e/integration/checkout-back-links-between-steps.spec.ts`

**Steps:**

1. Reach the review page: add the first in-stock product, press `cart-continue`, complete the contact step, and on the delivery step choose "Házhoz szállítás", fill the address and choose "Utánvét", then press `delivery-confirm`. - expect: `review-page` is visible with `review-contact`, `review-billing`, `review-delivery`, `review-items`, `review-summary` and `review-actions`. - expect: Each of `review-contact`, `review-billing` and `review-delivery` shows a "Módosítás" control (`review-edit-contact`, `review-edit-billing`, `review-edit-delivery`).
2. Press `review-edit-contact` ("Módosítás" in the Kapcsolattartási adatok card). - expect: The browser is on `/penztar/adatok` with `contact-page` visible. - expect: The form is prefilled from the saved draft: `contact-fullname-input` holds "Teszt Elek" and `contact-email-input` holds "teszt@example.test".
3. Press `contact-submit` to go forward again. - expect: The browser is on `/penztar/szallitas` with the saved state restored: the chosen delivery option shows its "Kiválasztva" badge, `address-input-postalCode` holds "1052" and the chosen payment option is still selected. - expect: No `navigation-reason` banner is rendered, because the step was reached through the wizard rather than by a deep link.
4. Press `delivery-confirm` to return to the review page, then press `review-edit-billing` ("Módosítás" in the Számlázási adatok card). - expect: From the review page the billing edit control asks for the same step the billing block is filled on: the browser is on `/penztar/szallitas`. - expect: The billing name and the billing address are the values saved before.
5. Go forward again with `delivery-confirm` and then press `review-edit-delivery` ("Módosítás" in the Szállítási és fizetési mód card). - expect: The browser is on `/penztar/szallitas` with the saved delivery and payment state restored.
6. Press the checkout header's `back-to-shop` link ("Vissza a shopba"). - expect: The browser is on `/telefonok` and the catalogue grid is rendered. - expect: The checkout chrome (the step indicator `checkout-steps`) is gone, because the shop layout replaces the checkout layout.

#### 3.7. cash on delivery purchase reaches the receipt

**File:** `e2e/integration/checkout-cash-on-delivery-receipt.spec.ts`

**Steps:**

1. Open `/telefonok`, wait for the grid, and pick the first card that has no `product-card-stock` marker and whose `price-amount` is at most 300 000 Ft (the mock's cash-on-delivery ceiling). Click its `product-card-cta`. - expect: `product-page` is visible and `product-stock` reads "Raktáron a demó készletben". - expect: The "Készülékár" amount is at most 300 000 Ft.
2. Add the variant with `add-to-cart-button` and open the cart with `cart-link`. - expect: The confirmation message names the product, its colour and storage and "1 darab a kosárban.". - expect: `cart-page` is visible with exactly one `cart-line` and `cart-continue` enabled.
3. Press `cart-continue` ("Tovább az adatokhoz"), then fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`. - expect: `contact-page` is shown first and `delivery-step` is visible after the submit. - expect: The URL is `/penztar/szallitas`.
4. On the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", keep the billing "same as delivery" tick, and choose the "Utánvét" payment option. - expect: The "Utánvét" `payment-option` is enabled and shows its "Kiválasztva" badge: at most 300 000 Ft the cash-on-delivery ceiling is not exceeded, so no `payment-unavailable-reason` is rendered. - expect: `summary-row-delivery` names "Házhoz szállítás", `summary-row-fee` shows "Szállítási díj" with an amount in Ft, and `summary-row-payment` names "Utánvét".
5. Press `delivery-confirm` and read the review page. - expect: `review-contact` shows "Teszt Elek", "teszt@example.test" and "+36 30 123 4567". - expect: `review-billing` shows the billing name and the address "Fő utca 1. / 1052 Budapest". - expect: `review-delivery` names "Házhoz szállítás" with its address, `review-payment` reads "Utánvét", and `review-items` lists one line with "1 × <unit price> Ft". - expect: `review-summary` shows Részösszeg, Szállítási díj, Fizetési díj and Végösszeg. - expect: `review-demo-badge` reads "Demó".
6. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési feltételeit.") and press the inner button of `review-submit` ("Demórendelés véglegesítése"). - expect: The checkbox is checked and the submit button is enabled. - expect: The browser lands on `/penztar/siker/<orderId>` with an order id in the path: submitting the form navigates, it does not reload the page.
7. Read the receipt. - expect: `order-receipt` and `success-page` are visible, `success-heading` reads "Elkészült a demórendelésed." and `success-check` is rendered. - expect: `receipt-order-number` is not empty, `receipt-demo-badge` reads "DEMO". - expect: `receipt-row-payment` contains "Utánvét" and `receipt-row-delivery` names "Házhoz szállítás". - expect: `receipt-lines` lists the ordered product with its colour, storage and "1 db", and `receipt-row-status` reads "Demó rendelés visszaigazolva". - expect: `success-actions` offers "Vissza a telefonokhoz".

#### 3.8. card payment round trip reaches the receipt

**File:** `e2e/integration/checkout-card-payment-receipt.spec.ts`

**Steps:**

1. Reach the review page with a card draft: open `/telefonok`, open the first in-stock card, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, complete the contact step, and on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose the "Bankkártya" payment option and press `delivery-confirm`. - expect: `review-page` is visible, `review-payment` reads "Bankkártya" and `review-payment-status` reads "A kártyás fizetéshez indítsd el a fizetést.". - expect: `review-payment-new` is rendered with the label "Fizetés indítása".
2. Press the inner button of `review-payment-new`. - expect: The browser leaves the shop: the URL is the demo payment application under `/demo-fizetes/<paymentIntentId>`, with the intent id as a path segment.
3. Read the demo payment page. - expect: The `h1` reads "Fizetés jóváhagyása" and the lede says "Ez egy szimulált fizetési felület. Válaszd ki, hogyan viselkedjen a fizetés.". - expect: `pay-amount` shows the order's total in Ft and `pay-ref` shows the transaction id. - expect: The three outcome buttons are visible: `pay-succeeded` ("Sikeres fizetés"), `pay-declined` ("Elutasított fizetés") and `pay-pending` ("Függőben marad"); the card fields `pay-card-number`, `pay-card-holder`, `pay-card-expiry` and `pay-card-cvc` are scenery and decide nothing.
4. Press `pay-succeeded` ("Sikeres fizetés"). - expect: The browser returns to the shop: the return URL is `/penztar?paymentIntentId=<id>`, and the cold-start page navigates on to the review step. - expect: `review-page` is visible on `/penztar/ellenorzes` and `review-payment-status` reads "A fizetés jóváhagyva.".
5. Tick `review-consent-terms-input` if it is not already ticked, then check the CTA state. - expect: The terms checkbox is checked (the tick is stored against the cart's lines and survives the payment round trip). - expect: `review-submit` is enabled and no `review-cta-explanation` is rendered, because the approved payment is the last condition the CTA was missing.
6. Press the inner button of `review-submit` ("Demórendelés véglegesítése"). - expect: The browser lands on `/penztar/siker/<orderId>` and `order-receipt` is visible. - expect: `receipt-order-number` is not empty and `receipt-row-payment` contains "Bankkártya". - expect: `receipt-row-status` reads "Demó rendelés visszaigazolva" and `success-check` is rendered.

#### 3.9. a declined card payment returns to the review page and can be retried

**File:** `e2e/integration/checkout-card-payment-declined.spec.ts`

**Steps:**

1. Reach the review page with a card draft: open `/telefonok`, open the first in-stock card, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, complete the contact step, and on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya" and press `delivery-confirm`. - expect: `review-page` is visible, `review-payment` reads "Bankkártya" and `review-payment-new` offers "Fizetés indítása".
2. Press `review-payment-new` and, on the demo payment page, press `pay-declined` ("Elutasított fizetés"). - expect: The first press takes the browser to `/demo-fizetes/<paymentIntentId>`; the demo page shows the amount in `pay-amount` before the outcome is chosen. - expect: After the decline the browser is back on the shop's review page: `review-page` is visible on `/penztar/ellenorzes`.
3. Read the declined branch. - expect: `review-payment-status` reads "A szimulált fizetés elutasítva.". - expect: The branch offers `review-payment-retry` ("Újrapróbálom") and `review-payment-change` ("Fizetési mód módosítása"). - expect: With the terms ticked, `review-cta-explanation` reads "A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.", and the inner button of `review-submit` is disabled; a forced press keeps the browser on `/penztar/ellenorzes`: a declined card never places an order.
4. Press the inner button of `review-payment-retry`. - expect: A new payment starts and the browser goes back to the demo payment page under `/demo-fizetes/<paymentIntentId>` with a fresh intent id. - expect: `pay-succeeded` ("Sikeres fizetés") is offered again.
5. Press `pay-succeeded`. - expect: The browser returns to the shop and lands on the review step with `review-payment-status` reading "A fizetés jóváhagyva.".
6. Tick `review-consent-terms-input` if it is not already ticked and press the inner button of `review-submit`. - expect: The browser lands on `/penztar/siker/<orderId>` and `order-receipt` is visible. - expect: `receipt-order-number` is not empty, `receipt-row-payment` contains "Bankkártya" and `receipt-row-status` reads "Demó rendelés visszaigazolva".

## Halloween: design preview across routes

### the preview survives navigation and reopening and can be dismissed

1. Opt into `/primitives/halloween`. Expect the real home page, the preview notice and the Halloween shell.
2. Follow the header to `/telefonok`, open a product card, then open `/penztar/kosar` in the same tab. Expect the route contents, preview notice and Halloween shell on each page.
3. Reopen the cart URL, dismiss the preview, then open the catalogue. Expect the preview and its forced theme to remain disabled. Campaign data is unchanged.

### the promotion banner keeps active offers on reload and its filter can be removed

1. Open the explicit `halloween` mock scenario and follow the campaign banner. Expect `activePromotion=true` in the URL, promotional cards and visible reference prices.
2. Reload that URL. Expect the active-offer filter, promotional card and reference price to remain.
3. Remove the active-offer chip. Expect its URL parameter and chip row to disappear and the catalogue to remain usable.
