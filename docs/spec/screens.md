# Four screen families, three layout shells

The request is interpreted as **homepage + catalogue + product + complete purchase flow**. Three reusable shells satisfy the layout requirement without inventing an extra unrelated screen: MarketingLayout, ShopLayout, CheckoutLayout. Cart/contact/delivery/review/success are mandatory states of the fourth family, not omitted screens. This interpretation is fixed in the delivered plan.

## Global geometry and visual contract

Use `docs/design/yettel.md` as the design reference at execution AND verification; it is not embedded in this docs package. The original raster still displays a superseded brand and placeholder commercial claims; preserve it only as source evidence. All live UI is **MiBolt**. Remove absent-scope services, social/account/newsletter controls and unverified offer promises. This is not a pixel-perfect reconstruction of raster text.

Container max1320px; gutters mobile16px, tablet24px, desktop48px minimum. Desktop 12-column alignment, gap24px, header64px. At1440px content margin60px. 4px spacing grid, mostly8px multiples. Cards8px radius, inputs/buttons6px. Body16px/1.5, support14px, metadata12px only; hero52/34px, H1 36/28px, section28/24px, card18px, price28/26px. Orange#FF6A00 with dark#171B1F button text; dark#1B2024 shell; white shopping panels, subtle#F5F6F7 sections, #A83B00 accessible orange-toned links. Product image ratio4:3 and object-fit contain.

Below640px one catalogue column. 640–1023px two columns with filter drawer. 1024–1279px 264px sidebar plus2-column catalogue. >=1280px sidebar+3 columns. Home featured grid: 1/2/4 by mobile/tablet/desktop. The1280 breakpoint is an explicit content-fit exception to the baseline skill breakpoint set: three cards plus sidebar do not fit comfortably at1024px. It uses the same tokens, not a new visual language.

Every purchase target >=44x44px. Normal controls48px height. Layout must be verified at320,390,768,1024,1440,1920. Motion120–160ms and panel<=220ms, reduced-motion honored. Fixed buy rails reserve their height plus safe-area; no focus can be hidden under a rail.

## Route map

| Family | Route | Layout | Prerequisite / exit |
|---|---|---|---|
| S1 Home | `/` | MarketingLayout | catalogue via hero/featured/shortcuts |
| S2 Catalogue | `/telefonok` + query | ShopLayout | valid query canonicalization; details route |
| S3 Product | `/telefonok/:slug?variant=:variantId` | ShopLayout | product+variant validation; add to cart |
| S4 Cart | `/penztar/kosar` | CheckoutLayout | can be empty; next requires valid nonempty cart |
| S4 Contact | `/penztar/adatok` | CheckoutLayout | active valid cart |
| S4 Delivery/payment | `/penztar/szallitas` | CheckoutLayout | valid saved contact |
| S4 Review | `/penztar/ellenorzes` | CheckoutLayout | valid contact/delivery/method + fresh quote |
| S4 Success | `/penztar/siker/:orderId` | CheckoutLayout | authoritative receipt lookup, not guard-generated fake data |
| Utility | `**` | ShopLayout | 404 with Home/Catalogue links |

`/kosar` may redirect to canonical `/penztar/kosar`; do not introduce a second cart state owner. Backend API paths are independent of these UI route names.

## S1 — Home

**Purpose:** give a clear first action and explain the simulation. Header: MiBolt brand left, a single Mobiltelefonok nav link (the home page has no menu entry of its own; decided 2026-09-22), search and cart right. Compact demo banner immediately below header. Hero charcoal, live heading “A következő mobilod. Egyszerűen.”; accent second line, two concise sentences, primary “Megnézem a telefonokat”, secondary “Hogyan működik?”. Device illustration right; do not put functionality inside an image.

**Desktop sequence:** 64px header → demo strip → 360–420px hero → three restrained category shortcuts → featured heading/link → four consistent cards → three how-it-works tiles → dark footer. Categories: Összes telefon, 5G készülékek, Raktáron. Featured card CTA “Részletek”. Cards keep unit price and action aligned.

**Mobile:** readable hero text+CTA before illustration, 16px gutters, stacked shortcut rows, single-column cards, stacked tiles. No compressed desktop screenshot. Search is second header row; menu is accessible drawer. Hero artwork may intentionally crop an illustration but product cards must not crop devices.

**States:** skeleton featured cards; featured HTTP error+Retry while hero remains usable; image fallback; menu open/focus; CTA hover/focus; cart count changes after navigation. No promotional urgency, ratings, warranty, free shipping or newsletters are invented.

**Exact outcome:** primary CTA→S2 default. Shortcuts→canonical filters. Featured→exact S3 slug/variant. Explainer is on-page content; no unsupported “plans” route.

## S2 — Catalogue

**Purpose:** find a device and enter a precise variant. Top breadcrumb Főoldal / Mobiltelefonok, H1 Mobiltelefonok, supporting demo sentence. Left264px filters. Main toolbar count, sort and page size. Applied chips between toolbar/grid; 3-column grid at wide desktop, all cards matched in height. Pagination below grid, footer after content.

**Filters:** q search in header/list toolbar; brands (three fixture brands), storage128/256/512, inclusive whole-HUF min/max,5G,stock. Price range needs two labeled number fields, not a slider requiring a new library. Filter controls expose invalid range and do not send it. 300ms search debounce, immediate desktop filter changes, page reset to1. Sorting: Ajánlott sorrend, Ár szerint növekvő, Ár szerint csökkenő, Név szerint. Page sizes12/24.

**Card:** 4:3 neutral media surface; live name, max2 features, exact selected storage/color, one-time price with “Egyszeri készülékár • demóadat”, outlined “Részletek →”. A card whose shown variant is out of stock carries the text “Elfogyott” under the price, and the card stays clickable. Entire card need not be clickable; make image/title/detail link consistent without nested controls.

**Mobile filter drawer:** header title+named44px close; scrollable fields; footer “Mégse” and “Szűrők alkalmazása”. Copy of applied state remains transient until Apply. Escape/backdrop behaves as cancel; applied URL unchanged. Initial focus=drawer heading, return=filter trigger. Filter counts computed by API, not stale CSS labels.

**States:** initial loading; current data refreshing with small progress; empty with current filters+Reset;503/network failure with Retry and retained query; invalid price; image error; out-of-range page canonicalization; back/forward restoration. Loading/error/no-results are not the same component message. Complete rows are listed in docs/tasks/test-scenarios.json.

## S3 — Product details

**Purpose:** inspect media/specifications, select exact configuration, add an available quantity. Shared shop shell/breadcrumb. Desktop left7 columns gallery, right5 columns product/configuration; light shopping canvas, no hero. Right: H1 Demo One5G, description, stock, color/storage selectors, unit price, quantity, primary “Kosárba teszem”, simulation note. More specifications below main content in disclosures. No subscription configurator.

**Gallery:** reserved main stage, previous/next44px targets, live counter, thumbnail row. Zoom opens real modal with named close and contained focus. The demo uses authorized/user-provided artwork as illustrative device media; mock data must never describe it as a verified real phone. Asset manifest links each view/variant to an explicit media source. A back-view image cannot be replaced by a front image while labeled back.

**Variant matrix:** exact combination is chosen, with color name beside swatch and selected check. Unavailable combinations disabled with reason. A variant change updates image, price, capacity, stock and max quantity atomically. Invalid deep-link variant yields explanation and blocked add until valid selection. Noninteger/out-of-limit quantity rejected, not silently changed.

**Mobile:** one column gallery then product info/options; specs follow. A compact sticky rail shows price+same add action and status; only one responsive primary control is focusable at a time. Scroll padding, safe-area and keyboard focus are validated. No auto-rotating carousel or baseline3D placeholder button.

**States:** loading; notfound; request error/Retry; valid selected; unavailable pair; low stock; image failure; zoom modal; pending add; successful add with persistent named item/variant summary; cart mutation409/503. Failure never erases the selected variant or shows zero price.

## S4 — Cart and complete purchase

**Common shell:** compact dark header, MiBolt left, Demó pénztár label, back-to-phones link. Demo strip, four numbered steps Kosár / Adatok / Szállítás / Ellenőrzés. Success replaces further purchase actions. Desktop8/4-style content+summary columns with24px gap; summary width~360px when space permits, aligned to content top. Mobile single column, summary before final action; steps wrap/read without horizontal page scrolling.

### S4.1 Cart

H1 “A kosarad”. Each line: product image, name, color/storage, unit price, the quantity as read-only text (“2 db”), a “Törlöm” remove action and line total (no quantity control, like yettel.hu; owner, 2026-09-22). Subtotal, shipping “A következő lépésben választod ki”, provisional total only if labeled subtotal. CTA “Tovább az adatokhoz”. Empty H1+message+“Telefonokat nézek”. No free shipping promise or discounts. Pending disables only affected controls and contradictory continue. Remove last item returns empty state.

### S4.2 Contact

H1 “Kapcsolattartási adatok”. Full name, email, phone; visible synthetic-data reminder. All fields required; max/range constraints match API contract. Native labels and appropriate input types, field messages, error summary on attempted invalid continue. CTA “Tovább a szállításhoz”; back to cart. Save failure leaves all entries. No login, newsletter, marketing consent or password.

### S4.3 Delivery and simulated payment

H1 “Átvétel és fizetés”. Radio cards: Házhoz szállítás – demó (1990Ft) or Demó átvételi pont (0Ft, no real physical location). Conditional address for home delivery: country HU, postcode, city, address line1, optional line2. Payment radios “Utánvét – szimuláció” and “Bankkártya – szimuláció”; neither asks for actual card details. CTA “Tovább az ellenőrzéshez”. Defaults must not represent a paid addon. Any selected method is explicitly visible before final review.

### S4.4 Final review

H1 “Minden rendben?”. Item/variant/quantity/price list, contact summary with Módosítás, delivery/method with Módosítás. Current Quote drives subtotal+shipping+total. Two **unchecked** confirmations: “Elfogadom a demó rendelési feltételeit.” and “Tudomásul veszem, hogy ez egy demó, nem valódi vásárlás.” The demo terms dialog explains no payment/email/shipment and reset/persistence behavior; it is not a production contract.

Primary “Demórendelés véglegesítése” disabled until quote complete/current and both acknowledgements true. Pending stays on same view with meaningful text. Failed payment offers Retry/change method; stale quote offers refresh and re-review; stock loss links cart correction. An uncertain response says processing outcome not known, not definitive rejection. Same request/key retry is mandatory.

### S4.5 Successful simulated order

H1 “Elkészült a demórendelésed.” Order DEMO-000001, selected items, final amount, simulated delivery/payment and clear no-real-payment/order/email notice. No “Visszaigazolást küldtünk” claim. CTA “Vissza a telefonokhoz”. Receipt remains through same-tab reload, is retrieved by getOrder and cannot generate another order. Unknown orderID shows404; service error has retry. Cart badge resets from authoritative state.

## Required exceptional states and visual evidence

All default/hover/focus/selected/disabled/loading/error/success states apply according to component contracts; read-only sections do not need fabricated hover/error states. Visual screenshots cover all main screens/checkout steps at1440 and390 and the6-width reflow matrix. Additional state boards cover filter-empty/error/loading/drawer, product-unavailable/zoom/image error, cart-empty, contact-invalid, review-submitting/declined/expired/price changed and success. The interactive prototype is a design artifact; final Angular screenshots must be re-created during T25, not mistaken for already verified implementation.
