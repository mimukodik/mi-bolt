# Smoke: purchase on the real stack

## Application Overview

Two smoke scenarios that drive a full storefront purchase on the real backend at http://localhost:4301 (no MSW). Each journey starts at the phone listing, picks the first in-stock product, completes the checkout (contact, home delivery, same-as-delivery billing, terms), and either finishes on the receipt page directly (cash on delivery) or round-trips through the /demo-fizetes/ payment app (card) before landing back on the receipt. The product is chosen by stock label at run time so orders from earlier runs cannot exhaust it.

## Test Scenarios

### 1. Smoke: purchase on the real stack

**Seed:** `e2e/seed.spec.ts`

#### 1.1. cash on delivery purchase reaches the receipt

**File:** `e2e/smoke/cash-on-delivery-purchase-reaches-the-receipt.spec.ts`

**Steps:**

1. Navigate to `/telefonok`. The phone listing page renders a header for the `telefonok` category and a grid of product cards, each marked with the test id `product-card`. - expect: The phone listing page is open. - expect: At least one `product-card` whose child `product-card-stock` label reads `Raktáron` (in stock) is visible.
2. Pick the first `product-card` whose `product-card-stock` label reads `Raktáron`. Open that card by clicking its `product-card-cta` (the call-to-action on the card, e.g. a `Megnézem` or equivalent button). The product detail page loads for that phone. - expect: The product detail page for the picked phone is open. - expect: The page exposes an `add-to-cart-button`.
3. If the product page asks for a variant (e.g. storage capacity, colour), pick the first available variant before adding to cart. Skip this step when the product page shows no variant selector. - expect: Either a variant is selected (when a variant selector is present and required) or no variant selector is visible. - expect: The `add-to-cart-button` is enabled.
4. Click `add-to-cart-button`. The cart updates; the header shows the new item count. - expect: The `add-to-cart-button` registers the click. - expect: The cart icon/indicator in the header reflects the added quantity (count goes up by the added amount).
5. Open the cart page (cart icon / `cart-continue` link from header or add-to-cart toast). The cart page lists the added line. - expect: The cart page is open and shows the picked phone (with chosen variant, if any) as a single line. - expect: The cart page exposes a `cart-continue` button that proceeds to checkout.
6. Click `cart-continue` to leave the cart and enter the checkout flow. The checkout opens on the contact step. - expect: The contact step of the checkout is visible. - expect: The contact form exposes a submit action with test id `contact-submit`.
7. Fill the contact step: a full name, an e-mail address, and a Hungarian mobile phone number (e.g. `+36 30 123 4567` or `06301234567`). Submit via `contact-submit`. The delivery step appears. - expect: The contact form accepts the full name, e-mail and Hungarian mobile. - expect: `contact-submit` advances the checkout to the delivery step.
8. On the delivery step, choose the home delivery option. Click the `delivery-option` corresponding to home delivery. Fill a valid Hungarian address: recipient name, country `Magyarország`, city, street and house number, and a four-digit postal code (e.g. `1052`). Confirm the delivery section via `delivery-confirm`. - expect: The home delivery option is selected. - expect: The address form accepts the four-digit postal code and the rest of the required Hungarian fields. - expect: After `delivery-confirm`, the checkout advances to the review step.
9. On the review step, keep billing the same as delivery (no separate billing address is entered). Pick the `Utánvét (demó)` / cash on delivery option by clicking its `payment-option`. The payment summary shows `Utánvét (demó)`. Accept the terms via `review-consent-terms-input` (checkbox / switch). Submit the order via `review-submit`. - expect: Billing is the same as delivery (no separate billing block filled). - expect: `Utánvét (demó)` is the selected `payment-option`. - expect: `review-consent-terms-input` is checked. - expect: `review-submit` submits the order.
10. The order is created and the browser is redirected to the receipt at `/penztar/siker/<orderId>`. Read the order number from `receipt-order-number` and the payment row from `receipt-row-payment`. The page is the `order-receipt` surface. - expect: The URL matches `/penztar/siker/<orderId>` where `<orderId>` is the backend-assigned id. - expect: `order-receipt` is visible. - expect: `receipt-order-number` shows a non-empty order number. - expect: `receipt-row-payment` reads `Utánvét (demó)`.

#### 1.2. card payment round trip reaches the receipt

**File:** `e2e/smoke/card-payment-round-trip-reaches-the-receipt.spec.ts`

**Steps:**

1. Navigate to `/telefonok`. The phone listing page renders a grid of product cards, each marked with the test id `product-card`. - expect: The phone listing page is open. - expect: At least one `product-card` whose child `product-card-stock` label reads `Raktáron` (in stock) is visible.
2. Pick the first `product-card` whose `product-card-stock` label reads `Raktáron`. Open that card by clicking its `product-card-cta`. The product detail page loads. - expect: The product detail page for the picked phone is open. - expect: The page exposes an `add-to-cart-button`.
3. If the product page asks for a variant (e.g. storage capacity, colour), pick the first available variant before adding to cart. Skip this step when the product page shows no variant selector. - expect: Either a variant is selected (when a variant selector is present and required) or no variant selector is visible. - expect: The `add-to-cart-button` is enabled.
4. Click `add-to-cart-button`. The cart updates; the header shows the new item count. - expect: The `add-to-cart-button` registers the click. - expect: The cart icon/indicator in the header reflects the added quantity.
5. Open the cart page. The cart page lists the added line. Click `cart-continue` to enter the checkout on the contact step. - expect: The cart page is open and shows the picked phone as a single line. - expect: After `cart-continue`, the contact step of the checkout is visible.
6. Fill the contact step: a full name, an e-mail address, and a Hungarian mobile phone number (e.g. `+36 30 123 4567` or `06301234567`). Submit via `contact-submit`. The delivery step appears. - expect: The contact form accepts the full name, e-mail and Hungarian mobile. - expect: `contact-submit` advances the checkout to the delivery step.
7. On the delivery step, choose the home delivery option by clicking its `delivery-option`. Fill a valid Hungarian address: recipient name, country `Magyarország`, city, street and house number, and a four-digit postal code (e.g. `1052`). Confirm via `delivery-confirm`. The review step appears. - expect: The home delivery option is selected. - expect: The address form accepts the four-digit postal code and the rest of the required Hungarian fields. - expect: After `delivery-confirm`, the checkout advances to the review step.
8. On the review step, keep billing the same as delivery. Pick the card payment option (`Bankkártya (szimulált)`) by clicking its `payment-option`. The payment summary shows `Bankkártya (szimulált)`. Accept the terms via `review-consent-terms-input`. Submit the order via `review-submit`. The browser is redirected to the demo payment app under `/demo-fizetes/`. - expect: Billing is the same as delivery. - expect: `Bankkártya (szimulált)` is the selected `payment-option`. - expect: `review-consent-terms-input` is checked. - expect: `review-submit` submits the order and the URL changes to the `/demo-fizetes/` path.
9. On the demo payment app at `/demo-fizetes/`, the order amount is displayed. Click the `Sikeres fizetés` (`pay-succeeded`) button to simulate a successful card payment. - expect: The `/demo-fizetes/` page is visible and shows the order amount matching the cart total. - expect: `pay-succeeded` is visible and clickable.
10. After the successful payment simulation, the browser is redirected back to the shop to the receipt page at `/penztar/siker/<orderId>`. Read the order number from `receipt-order-number` and the payment row from `receipt-row-payment`. - expect: The URL matches `/penztar/siker/<orderId>` where `<orderId>` is the backend-assigned id. - expect: `order-receipt` is visible. - expect: `receipt-order-number` shows a non-empty order number. - expect: `receipt-row-payment` reads `Bankkártya (szimulált)`.
