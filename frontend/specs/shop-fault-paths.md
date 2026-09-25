# MiBolt shop fault-path test plan

## Application Overview

MiBolt is a Hungarian demo storefront (Angular, served from the Playwright base URL) with the whole backend mocked in the page by MSW: no server, no database. The buyer's path is the home page `/`, the phone list `/telefonok`, a product page `/telefonok/<slug>` and the cart `/penztar/kosar`; the demo gate starts signed in on the default scenario, and the mock keeps the cart in the browsing context's `sessionStorage`, so one fresh context IS an empty cart with no sign-in step.

A fault scenario is read from `?mi-scenario=<name>` when the page loads and is held by the mock's handlers for the rest of the browsing context, in-app navigation included. `?mi-scenario=fail-<operation>` answers that one endpoint with a 503 `SERVICE_UNAVAILABLE` Problem on every call, and `?mi-scenario=offline-<operation>` makes it fail as a network error; every other endpoint keeps working. A `page.goto` without the query resumes the scenario the tab loaded last, and `?mi-scenario=default` switches to the default scenario and a different, empty cart, so each scenario below opens its first page with the query and then moves on by clicking; a `page.goto` that must stay in the fault keeps the query, and the in-app navigation that drops `mi-scenario` from the address bar does not drop the fault.

Two facts govern what a fault looks like on screen. First, no server message ever reaches the page: the SDK's failure is not an `Error` instance, so each screen prints its own Hungarian copy with a general "Ismeretlen hiba …" line, and the same endpoint failing as a 503 or as a network error therefore renders byte-for-byte the same screen — which is why only one of the two kinds is written up for the operations other than the phone list. Second, every failure renders the shared error state (`error-state`, role `alert`, or role `status` on the home page) built from the screen's own title, message and retry control, and the retry control re-issues the very request the fault breaks, so while the fault is active the same error state comes back word for word.

Products are never named by slug or product name anywhere in this plan: a scenario picks its card by what the screen shows (the first card without an "Elfogyott" marker) and reaches a product page by clicking that card's `product-card-cta`.

Scope note: the `cart-quantity` fault (a PATCH of one cart line's quantity) is deliberately not covered, and no scenario was written for it. The cart line renders its quantity as read-only text and the storefront never issues `PATCH /api/v1/cart/items/:variantId` — its only cart calls are `GET /cart`, `POST /cart/items` and the line's remove — so with that fault active the shopper sees nothing different on any screen. Within the remaining five operations the faults that render no differently from one another are folded into one scenario each: the phone list's 503 and network error are the two required cases and get a scenario each, and the product, related-products, cart and cart-add faults get one scenario each.

## Test Scenarios

### 1. Shop: service faults

**Seed:** `e2e/seed.spec.ts`

#### 1.1. the phone list answers 503, so the home page's featured row and the catalogue both show their error state and their retry keeps failing

**File:** `e2e/integration/shop-fault-product-list-503.spec.ts`

**Steps:**

1. Open the home page with the phone-list fault on the URL's first load: `/` with `?mi-scenario=fail-products`, then wait for the hero to render. - expect: `hero-heading` is rendered, so the home page itself is intact and only the featured row is broken. - expect: `featured-section` shows `error-state` with role `status`, whose title reads exactly "A kiemelt termékek nem tölthetők be". - expect: Its message reads exactly "Ismeretlen hiba a termék betöltése közben.": the 503's own Problem text never reaches the page. - expect: `retry-button` reads "Újrapróbálom". - expect: No `featured-grid` and no `featured-card-*` element is rendered.
2. Press `retry-button` ("Újrapróbálom") in the featured row. - expect: The row re-requests the list, so the four card skeletons `featured-card-skeleton-0` … `featured-card-skeleton-3` may show while the request runs. - expect: The same `error-state` comes back with the same three lines — "A kiemelt termékek nem tölthetők be", "Ismeretlen hiba a termék betöltése közben.", "Újrapróbálom" — because the fault answers every call with 503.
3. Click `featured-all-link` ("Összes telefon") to reach the catalogue in-app; the fault survives the click and the address bar becomes `/telefonok`. - expect: The `h1` reads "Mobiltelefonok". - expect: `result-count` reads exactly "A katalógus betöltése nem sikerült.". - expect: `catalog-error` holds `error-state` with role `alert`, titled "Nem sikerült betölteni a katalógust.", with the message "Ismeretlen hiba a katalógus betöltése közben." and a button reading "Újrapróbálom". - expect: No `product-card` is rendered. - expect: The brand and colour facet groups are empty (no `filter-brand-*` and no `filter-color-*` button), while the three `filter-storage-*` buttons, `catalog-sort` and `catalog-page-size` are still on screen. - expect: `catalog-loading` and `catalog-pagination` are not rendered.
4. Press the catalogue's "Újrapróbálom" (`catalog-error`'s button). - expect: The list is requested again and the same `error-state` returns with the same three lines. - expect: The checker stays on `/telefonok` and no `product-card` is rendered, so the retry cannot succeed while the fault is active.

#### 1.2. the phone list is unreachable, so the home page's featured row and the catalogue show the same error states as the 503

**File:** `e2e/integration/shop-fault-product-list-offline.spec.ts`

**Steps:**

1. Open the home page with the phone-list network fault on the URL's first load: `/` with `?mi-scenario=offline-products`, then wait for the hero to render. - expect: `hero-heading` is rendered; the home page itself is intact. - expect: `featured-section` shows `error-state` with role `status` whose title reads exactly "A kiemelt termékek nem tölthetők be". - expect: Its message reads exactly "Ismeretlen hiba a termék betöltése közben.", and `retry-button` reads "Újrapróbálom". - expect: This is the same screen, word for word, that the 503 of the same endpoint shows: a dropped connection and a refused request are indistinguishable to the shopper. - expect: No `featured-grid` and no `featured-card-*` element is rendered.
2. Press `retry-button` ("Újrapróbálom") in the featured row. - expect: The row re-requests the list and the same `error-state` returns with the same three lines. - expect: The skeletons `featured-card-skeleton-0` … `featured-card-skeleton-3` may show while the request runs, and the row never reaches a success state.
3. Click `featured-all-link` ("Összes telefon") to reach the catalogue in-app; the fault survives the click and the address bar becomes `/telefonok`. - expect: The `h1` reads "Mobiltelefonok". - expect: `result-count` reads exactly "A katalógus betöltése nem sikerült.". - expect: `catalog-error` holds `error-state` with role `alert`, titled "Nem sikerült betölteni a katalógust.", with the message "Ismeretlen hiba a katalógus betöltése közben." and a button reading "Újrapróbálom". - expect: No `product-card` is rendered and the brand and colour facet groups are empty. - expect: `catalog-loading` and `catalog-pagination` are not rendered.
4. Press the catalogue's "Újrapróbálom". - expect: The list is requested again and the same `error-state` returns with the same three lines, with no `product-card` rendered.

#### 1.3. one product's request answers 503, so its product page shows the error state and its retry keeps failing

**File:** `e2e/integration/shop-fault-product-detail-503.spec.ts`

**Steps:**

1. Open the catalogue with the single-product fault on the URL's first load: `/telefonok` with `?mi-scenario=fail-product`, and wait for the grid. - expect: The catalogue loads normally, because only the single-product endpoint is broken: `result-count` reads "<n> találat a szűrt feltételek szerint" with n greater than 0. - expect: At least one `product-card` is rendered.
2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker, and wait for the product page to settle. - expect: The address bar moves to that card's product page (`/telefonok/<slug>?variant=<id>`); the in-app navigation drops `mi-scenario` from the URL but the mock keeps the fault for this browsing context. - expect: `product-loading` gives way to `error-state` with role `alert`, titled "A termék nem tölthető be". - expect: The message reads "Ismeretlen hiba a termék betöltése közben." and the hint "A korábban megadott értékeket megőrizzük." is shown under it. - expect: The button reads "Újrapróbálom". - expect: `product-name`, the gallery, the "Készülékár" price block, `add-to-cart-button` and `purchase-rail` are not rendered, and `related-products` is not rendered either.
3. Press "Újrapróbálom" in the product page's error state. - expect: The product is requested again and the same `error-state` returns with the same four lines ("A termék nem tölthető be", "Ismeretlen hiba a termék betöltése közben.", "A korábban megadott értékeket megőrizzük.", "Újrapróbálom"). - expect: `product-page` is still on screen and the address bar is unchanged: the shopper stays on the product they asked for.

#### 1.4. the related-products request fails, so the product page loads without its "Hasonló készülékek" strip

**File:** `e2e/integration/shop-fault-related-products-503.spec.ts`

**Steps:**

1. Open the catalogue with the related-products fault on the URL's first load: `/telefonok` with `?mi-scenario=fail-related-products`, and wait for the grid. - expect: The catalogue loads normally: `result-count` reads "<n> találat a szűrt feltételek szerint" with n greater than 0.
2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker. - expect: The product itself is unaffected: `product-name` is rendered and not empty, `product-stock` reads "Raktáron a demó készletben", and the visible add control ("Kosárba teszem") is enabled. - expect: The strip's skeletons (`related-card-skeleton-0` … `related-card-skeleton-3`) may flash while the request runs, and then `related-products` is not rendered at all: no "Hasonló készülékek" heading and no `related-card-skeleton-*` is left. - expect: No `error-state` and no status message is shown anywhere on the page: the related failure is silent by design, because the strip is never an error state of its own.
3. Read the rest of the product page. - expect: The gallery, `variant-selector`, the "Készülékár" price block and `product-simulation-note` are all rendered, and the page keeps its normal state. - expect: The only thing missing is the recommendation strip, so a shopper on this product loses the related phones and nothing else.

#### 1.5. the cart request answers 503, so the cart page shows its error state and the rest of the shop still works

**File:** `e2e/integration/shop-fault-cart-503.spec.ts`

**Steps:**

1. Open the cart with the cart fault on the URL's first load: `/penztar/kosar` with `?mi-scenario=fail-cart`. - expect: `cart-page` is rendered and its `h1` reads "A kosarad". - expect: `error-state` with role `alert` is shown, titled "A kosár nem érhető el". - expect: The message reads "A kosár betöltése sikertelen." and the hint "A korábban megadott értékeket megőrizzük." is shown under it. - expect: The button reads "Újrapróbálom". - expect: No `cart-line`, no `cart-count`, no `cart-footer` and no empty state ("A kosarad még üres.") is rendered.
2. Press "Újrapróbálom". - expect: The cart is requested again and the same `error-state` returns with the same four lines. - expect: During the retry the error button shows its loading label "Újrapróbálom…" and then settles back to "Újrapróbálom" with the error still on screen.
3. Click `back-to-shop` ("Vissza a shopba") in the checkout header. - expect: The browser lands on `/telefonok` and the catalogue loads normally: `result-count` reads "<n> találat a szűrt feltételek szerint" with n greater than 0 and `product-card` elements are rendered. - expect: No `error-state` is on the catalogue page, so the fault reaches the cart endpoint alone. - expect: `cart-badge` in the shop header reads "0", because the cart could never be read.

#### 1.6. adding to the cart is refused, so the product page reports it and the cart stays empty

**File:** `e2e/integration/shop-fault-add-to-cart-503.spec.ts`

**Steps:**

1. Open the catalogue with the add-to-cart fault on the URL's first load: `/telefonok` with `?mi-scenario=fail-cart-add`, wait for the grid, and read `cart-badge`. - expect: The catalogue loads normally (only the add endpoint is broken). - expect: `cart-badge` reads "0": a fresh context holds an empty cart.
2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker. - expect: `product-page` is visible and the product loads normally: `product-name` is not empty, `product-stock` reads "Raktáron a demó készletben" and the "Készülékár" price block shows an amount. - expect: The add control is enabled and its button reads "Kosárba teszem".
3. Press the visible add control: the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` inside `purchase-rail` below 1024 px. - expect: The visible `status-message` with role `alert` appears reading exactly "A termék hozzáadása nem sikerült; a kosár változatlan.", with a "Bezárás" button, in the mount the viewport shows. - expect: The message never names the 503 or the server: the shopper is told the add failed and the cart is unchanged. - expect: `cart-badge` still reads "0" and no `error-state` appears on the product page. - expect: The add button is enabled again and its label is back to "Kosárba teszem".
4. Press "Bezárás" on the refusal banner. - expect: The banner is dismissed: the visible `status-message` is gone. - expect: The product page itself is unchanged — `product-name`, the price block and the enabled add control are all still there.
5. Press the same add control once more. - expect: The same refusal banner returns with the same text "A termék hozzáadása nem sikerült; a kosár változatlan.": the banner carries no retry control of its own, so pressing the add control again IS the retry, and it fails the same way. - expect: `cart-badge` still reads "0".
6. Click the header's `cart-link` to open the cart. - expect: `cart-page` shows its empty state: the title "A kosarad még üres.", the message "Nézd meg a demókészülékeket, és válaszd ki a kedvenced." and the action "Telefonokat nézek". - expect: Exactly zero `cart-line` is rendered, which proves the refused add left the cart unchanged. - expect: No refusal banner follows the shopper onto the cart page.
