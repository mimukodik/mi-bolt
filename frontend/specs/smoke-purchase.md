# Test Plan

## Application Overview

Two real-backend checkout journeys (no MSW) use only the hidden smoke fixture. A missing or unavailable fixture fails the run without falling back to a catalogue phone. With `MIBOLT_SMOKE_ENABLED=true`, the backend bootstraps the fixture even in an existing database and restores its stock in the order transaction. Normal catalogue stock, orders and admin data are not reset.

## Shared scenario setup and proof

1. Open `/penztar/kosar`, clear leftover lines and verify the cart page.
2. Open `/telefonok`: the Mobiltelefonok heading and product cards must render, and no canary product link may appear.
3. Open `/telefonok/mi-bolt-smoke-canary?variant=mi-bolt-smoke-canary--fekete--128` directly. Verify the product page and an enabled add-to-cart control.
4. Add one canary item, open the cart, assert exactly one line and continue to contact.
5. Fill Teszt Elek, a test email and valid Hungarian phone number, then submit.
6. Choose home delivery; fill a valid Hungarian address and keep billing the same as delivery.
7. Complete the payment-specific steps below, reaching `/penztar/siker/<orderId>`.
8. Verify a visible receipt and nonempty order number. Fetch the receipt API and require exactly one item with the exact canary variant ID and quantity 1.
9. Fetch the canary detail API and require exactly one variant, `in_stock`, `maxQuantity: 5`. Repeated runs must satisfy the same proof.

## Cash on delivery

**File:** `e2e/smoke/cash-on-delivery-purchase-reaches-the-receipt.spec.ts`

1. Verify the Utánvét option is enabled (the 10 000 Ft fixture is below the configured ceiling), select it and confirm delivery.
2. Verify the review page and Utánvét payment summary.
3. Accept terms, submit the order and verify the receipt payment row says Utánvét.
4. Run the shared receipt and canary-stock assertions.

## Card payment

**File:** `e2e/smoke/card-payment-round-trip-reaches-the-receipt.spec.ts`

1. Select Bankkártya and confirm delivery.
2. Verify the review page, Bankkártya summary and payment-start status.
3. Accept terms, start payment through the native button inside `review-payment-new` and verify the redirect to `/demo-fizetes/`.
4. Click Sikeres fizetés and verify the return to `/penztar/ellenorzes`.
5. Require approved payment status and the preserved terms selection, then submit.
6. Verify the receipt payment row says Bankkártya and run the shared receipt and canary-stock assertions.

## Release acceptance

Run both journeys with no retries or skips. Repeat the suite and exercise parallel orders; both must retain canary stock. After deployment, manually restored featured phones must remain in stock after a further stable release plus smoke. Local H2/browser checks do not substitute for the hosted stable acceptance.
