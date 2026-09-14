# 03 — Page Recipes

## Status and Scope

The package contains two visual references: the user-approved homepage and a previously generated catalogue concept. The recipes below are textual specifications for the other subpages, **not completed subpages that have been rendered and visually checked**. Create visual designs or working implementations from these recipes when separately requested. The catalogue concept's products, numbers, changed logo and filter results are not normative.

## Shared Page Structure

Every page follows: global shell → breadcrumbs where needed → one H1 → primary task → related content when helpful → footer. The initial viewport must make it clear where the user is and what to do next. Do not introduce a new hero, header or brand label on every page.

## P01 — Homepage

**Goal:** provide entry points to devices, mobile plans and services.

Order: dark header; dark hero; light category bar; four featured devices on desktop; three service tiles; dark footer. Place a large heading and short description on the left of the hero, with a dominant product image on the right. Use one primary and one secondary CTA. Only verified or clearly marked demo trust claims belong at the bottom of the hero.

The appearance of the reference does not verify nationwide coverage, awards, free delivery or return conditions. Remove unsupported claims or replace them with partner-approved copy.

**Narrow layout:** stack text and image; an important image must not push the CTA several screens down. Featured products become a simple list or a comfortable two-column grid, depending on the actual content width.

**Validation:** the primary CTA leads to the catalogue; the selected partner's branding remains consistent across all modules.

## P02 — Phone Catalogue

**Goal:** select a relevant device that is available for purchase.

Order: breadcrumbs → “Mobile phones” and a short description → desktop filter panel on the left / results area on the right → sorting and result count → product grid → pagination or explicit load-more action → footer. The filter panel is not part of the product-card grid.

Minimum card width is 248 px. A 1320 px content area accommodates a 264 px filter panel, a 24 px gap and a remaining product area with three columns separated by 24 px gaps. Use two columns on a narrower desktop and one on mobile when required by the content. Do not force four tiny cards beside the filters.

Filters: brand, pricing arrangement, storage, 5G and stock, where supported by the data source. Active filters and sorting may be preserved in the URL and must be restored when navigating back. After filtering, return to the first page and update the result count. Six visible cards do not automatically mean six total results; for a paginated API, use the backend's total field.

**States:** initial loading; results list; no results; network error; partially missing images; deleted product; slowly updating price. Include “Compare” only as a separately requested, functional flow.

## P03 — Product Details and Configuration

**Goal:** select a specific device variant and pricing arrangement.

Use two desktop columns: image and thumbnail row on the left; name, short description, availability, color, storage, purchase arrangement, price and CTA on the right. Lower content: detailed specifications, compatibility information and related products where verified.

Configuration order: device variant → offer with or without a plan → compatible plan → extras if requested → price summary → add to cart. An approved business flow may differ; do not arbitrarily rewrite it. Every recalculation must refer to the same configuration snapshot.

Above the CTA, show the total one-time amount and total monthly fee on separate lines. Display any commitment, installment term or upfront payment. Enable “Add to cart” only for a valid, available combination. Missing stock data does not mean the item is in stock.

**Mobile:** gallery → configuration → price and CTA → details. Use a fixed bottom CTA only if it does not cover content, handles the safe area, and shows quantity/price information consistent with the main block.

**States:** selected; nonexistent combination; out of stock; price change; adding to cart; success; failed cart update.

## P04 — Mobile Plans

**Goal:** choose according to data, call and budget needs.

After a short title and introduction, offer a subscription-type selection if needed. On desktop, compare at most three or four plans directly; align important fields at the same row heights. On mobile, stack cards instead of showing a horizontally clipped table.

Card order: name, data allowance, calls/SMS, monthly fee, commitment and limits, CTA. When bundling an offer, verify device compatibility and applicable discounts against the data. Make relevant restrictions and conditions accessible beside an “Unlimited” claim; the skill does not create new contractual claims.

**States:** not yet selected; selected; incompatible; unavailable; data-refresh error. Comparing several providers does not authorize mixing their offers in a single cart.

## P05 — Cart

**Goal:** review and correct the selection before checkout.

On desktop, place the item list on the left and a summary approximately 360–400 px wide on the right, as space allows. Each row contains an image, product name, variant, quantity, pricing arrangement and removal action. Keep a plan visibly associated with its device when they are commercially linked.

Summary: one-time device amounts → other one-time costs → discounts → shipping or its not-yet-known status → amount due now. Separately: monthly device installment → monthly service → amount due each month. Do not create a misleading “total price” by combining an indefinite service with a one-time purchase.

Provide undo or clear confirmation for removal. Do not mix old and new values during a quantity change. Verify price and availability before entering checkout; disclose any change.

**Empty:** “Your cart is empty.” and “Browse phones”. **Error:** preserve items and provide retry. An unavailable item must not disappear silently.

## P06 — Checkout

**Goal:** enter information securely and transparently, then provide the appropriate confirmation.

Steps: contact details → delivery/pickup → payment method → review. The project's original flow takes precedence; do not introduce more pages solely for appearance. The step indicator shows current and completed steps; preserve previously entered non-sensitive data when navigating back.

Keep the summary available throughout: in a desktop sidebar, or as content or an accessible collapsible block on mobile. Distinguish privacy information, contractual acceptance and optional marketing consent; the partner supplies legal copy. The demo must not request or store real payment-card numbers.

The final payment button's label must follow the approved business/legal flow. In a simulated environment, use wording such as “Complete demo order” and make it clear on the screen that no charge will occur.

**States:** field error; delivery unavailable; payment-provider error; expired offer; submitting; protection against repeated clicks. A visually disabled button alone is not server-side duplicate prevention.

## P07 — Confirmation

**Goal:** communicate the order outcome accurately.

Provide one clearly visible status, an order identifier, items, separate one-time and monthly summaries, pickup/delivery information and a next step. The recommended prefix for a demo identifier is `DEMO-`. Simulation result: “Your demo order is complete. No payment or actual order was made.”

Do not promise a sent email, tracking link or delivery time without an actual service behind it. A failed payment is not a “Successful order”. Repeated refreshes must not create new orders.

## Related Pages

Search results reuse catalogue components. Accessory listings continue the same structure with compatibility filters. Customer-support pages use a simple content layout, not a new UI system. Account, order-tracking or AI-assistant features enter scope only when separately requested.
