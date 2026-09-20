# T25 design review — MiBolt

## Provenance

- Commit: `5162b86` (this document is written on top of it; recheck with `git rev-parse HEAD` before relying on it later).
- npm `11.17.0`; Node per `package.json`'s `engines` field; Playwright `@playwright/test ^1.63.0` (see `package.json`).
- `mi-bolt-design` skill: resolved from `docs/mi-bolt/execution/skill-location.json` (FIX-38's deliverable) — entry `.claude/skills/mi-bolt-design/SKILL.md`, root `.claude/skills/mi-bolt-design`, approvedVersion `1.0.1`, sha256[SKILL.md] `40faf71e00a3a494d88485eee16f4c3f27669ad13c0b2da8ba67202e9a29e8e5`.

**Limitation stated up front, per `docs/spec/execution-rules.md:19`'s ban on claiming a planned test has run**: this document was produced by a coder-sonnet subagent working in an isolated git worktree with no Agent tool available to it, so it could not spawn the `real-browser-sonnet` agent that `.claude/rules/browser-verification.md` requires for a user-visible criterion. Every section below that needs a live, human-driven browser measurement (T25-AC01's 48-cell table, T25-AC02's screenshot comparison, T25-AC04's six manual checks, T25-AC05's axe results) is marked **not measured** rather than filled with an invented pass. The three Playwright suites named in T25 were run by name (a real Chromium/Firefox browser under Playwright's own automation, not through `mcp__chrome-devtools__*`), and their exit codes, pass/skip counts and skip reasons below are genuine, freshly measured evidence.

## Commands run

```
$ npx playwright test e2e/design/viewport-matrix.spec.ts
192 passed (19.4s)
exit 0
```

```
$ npx playwright test e2e/design/state-matrix.spec.ts
10 skipped
2 passed (2.2s)
exit 0
```

```
$ npx playwright test e2e/a11y/keyboard.spec.ts
2 skipped
6 passed (6.7s)
exit 0
```

```
$ npm run build
exit 0 (budget warnings only, unrelated to this document)
```

No bare `npx playwright test` was run for this document (it would rewrite the 49 tracked screenshots under `e2e/design/screenshots/`, per this task's own warning); a prior step in this session's work (FIX-53) already ran the full suite once and reported its screenshot-rewrite separately. This document cites only the three named-suite runs above, executed fresh for this document.

## T25-AC01 — horizontal overflow

**Not measured.** `viewport-matrix.spec.ts` passed all 192 assertions (96 overflow + CTA-size checks × 2 projects) across its own six viewports (320, 390, 768, 1024, 1440, 1920) and eight routes, but — as this task's own text explains — a passing `expect` inside `page.evaluate` prints no value, only a failing one does, so the suite's own output cannot supply the 48 real `scrollWidth`/`innerWidth` numbers this section needs. Producing them requires driving a live browser session (resize, navigate, `page.evaluate`) exactly as `viewport-matrix.spec.ts:104-114` does, which needs `mcp__chrome-devtools__*` through the `real-browser-sonnet` agent. That agent was not available to this session. What is known: all 96 of the suite's own overflow/CTA-size assertions passed in both configured projects, so no known overflow regression exists at any of the six viewports on any of the eight routes as of this commit — but the actual pixel values for the 48-row table are not recorded here.

## T25-AC02 — screenshots against the reference

**Not measured.** This comparison is explicitly not automated (per the test's own comment at `viewport-matrix.spec.ts:116-119`) and requires a human or `real-browser-sonnet` visual comparison against the supplied reference composition, which this session could not perform. `e2e/design/screenshots/` holds 49 tracked images (unchanged by this document; this document did not run the bare `npx playwright test` that rewrites them).

## T25-AC03 — keyboard flow

`npx playwright test e2e/a11y/keyboard.spec.ts` → 6 passed, **2 skipped**, exit 0 (both projects, `mi-bolt-design` and `mi-bolt-narrow`).

Both skips are the same test, one per project: `Tab / Enter / Escape drive the purchase flow end to end`. Skip reason, read from the Playwright JSON reporter's own annotation rather than assumed:

> `home loads: / not reachable (status=200); T17–T24 pages still landing`

**This message is stale and the real cause is a test-authoring defect, not an unbuilt page.** `gotoAndCheck()` calls `page.getByTestId('app-marketing-layout')`, but `app-marketing-layout` is the Angular **component selector** for the marketing layout (`src/app/layouts/marketing-layout.ts:21`, `selector: 'app-marketing-layout'`), not a `data-testid` attribute anywhere in the rendered DOM. `getByTestId` looks for `[data-testid="app-marketing-layout"]`, which does not exist, so the 5-second wait times out even though the page itself returns HTTP 200 and the marketing layout does render (confirmed independently: `grep -rn "app-marketing-layout" src/ e2e/` shows the string used only as a component selector and, separately, as a CSS-selector prefix in `viewport-matrix.spec.ts:74`, never as a `data-testid`). Because the very first `FLOW` step fails this check, `test.skip()` fires immediately and the entire keyboard flow — including the four checkout steps that are now genuinely built — never runs. This is one skipped step, not a report of five or more not-yet-built pages.

**Skipped-step count for this document: 1** (the whole test aborts at its first step; `skippedSteps` inside the test body reaches `1`, not the counter's full potential range, because `test.skip(true, …)` inside the loop stops the test rather than continuing to count further steps).

## T25-AC04 — the six manual checks

**Not measured.** 200% text enlargement, reduced motion, narrow reflow, 44px targets, contrast and sticky-CTA focus visibility all require a real, human-driven or `real-browser-sonnet`-driven browser session; none was available to this run. One partial, indirect data point: `viewport-matrix.spec.ts`'s own 44×44 CSS px CTA-size assertions (R21) passed at all six viewports across all eight routes in this run's suite execution (see T25-AC01), which is evidence toward the 44px-target check specifically, but it is the suite's own automated assertion, not this section's required manual/browser-driven check, and is not substituted for it here.

## T25-AC05 — axe results, kept separate

**Not measured.** No axe run against a live page was performed this session (no browser tool available). **No WCAG conformance is claimed from screenshots or static validation** — the sentence T25-AC05 itself requires — and none is made anywhere in this document.

## R01–R26 applicability

MiBolt is a full commerce flow (home, catalogue, product, cart, four-step checkout, success) reviewed as a whole, not a single bounded change, so nearly every rule names a real surface in the application rather than being N/A. Verdicts below are relevance judgments (does this rule govern a surface this application has), not pass/fail measurements — those measurements are T25-AC01–AC05 above, most of which are **not measured** this run.

| Rule | Verdict | Reason |
|---|---|---|
| R01 | applies | The home hero and product imagery are the approved orange MiBolt brand surface. |
| R02 | applies | `MarketingLayout`, `ShopLayout` and `CheckoutLayout` each carry header/footer chrome. |
| R03 | applies | `src/styles/tokens.css` and the shared UI primitives set the orange/charcoal/neutral palette. |
| R04 | applies | `src/styles/tokens.css` is the semantic token source every feature component consumes. |
| R05 | applies | The shop and checkout layouts constrain content width; the 1320px centerline rule governs them. |
| R06 | applies | Card and button radii are set by shared primitives in `src/app/shared/ui/`. |
| R07 | applies | Body text and heading hierarchy are set by the shared token/typography surface. |
| R08 | applies | Every checkout step and the product page have one primary CTA (`add-to-cart.ts`, each `*-step.ts`). |
| R09 | applies | Orange-button label contrast is a token-level and per-component concern across the shopping flow. |
| R10 | applies | Product imagery (`product-gallery.ts`) must carry no baked-in functional text. |
| R11 | applies | Product image aspect ratio/cropping is `product-gallery.ts` and `catalog/product-card.ts`'s concern. |
| R12 | applies | All UI copy in this application is Hungarian (see every `*.html` template under `src/app/features/`). |
| R13 | applies | Checkout pricing (`quote-domain.ts`, `order-summary.ts`) separates device price, fee and one-time costs. |
| R14 | applies | Catalogue and product pricing come from `src/mocks/` fixtures, not illustrations. |
| R15 | applies | The whole application is fictional demo data; `src/mocks/` is the only "backend". |
| R16 | N/A — there is only one brand/provider in this application; no second provider's logo, offer or cart state exists to mix. |
| R17 | applies | `variant-selector.ts` / `variant-selection.ts` must keep image, storage, stock and price in sync on a variant change. |
| R18 | applies | `catalog-query.ts` / `filter-panel.ts` own list filtering, sorting and URL state. |
| R19 | applies | Catalogue and product pages have distinct loading/empty/error states (`state-matrix.spec.ts` exercises exactly this). |
| R20 | applies | Keyboard operability and focus across the full purchase path is `e2e/a11y/keyboard.spec.ts`'s own subject — see T25-AC03 above, where a real defect was found in the test itself, not (as far as measured) in the application. |
| R21 | applies | 44×44 CSS px targets across the shopping flow — measured green in this run's `viewport-matrix.spec.ts` execution (see T25-AC01). |
| R22 | applies | The narrow layout (390px, `mi-bolt-narrow` project) must reflow, not just shrink; `viewport-matrix.spec.ts` targets this directly. |
| R23 | applies | `terms-dialog.ts` and the image-zoom dialog on the product page are this application's modals. |
| R24 | applies | The cart and checkout facades (`cart.facade.ts`, `checkout.facade.ts`) must survive a checkout error without losing state. |
| R25 | applies | No fake reviews, urgency banners or preselected paid extras may appear anywhere in the catalogue or checkout. |
| R26 | applies | This document, and the "Defects found" / "Reviewer decision" sections below, are exactly what R26 asks for. |

N/A count: 1 (R16).

## not-yet-built

One genuine `built: false` finding, from `state-matrix.spec.ts` (not from the keyboard suite, whose single skip is the AC03 defect above, not a not-yet-built page): 10 skips (5 unique tests × 2 projects) — `catalog-default`, `cart-default`, `catalog-empty`, `success` (default state) and the cart-empty-state-copy check — all skipped because the spec file's own `SURFACES`/`STATES` table hardcodes `built: false` for these rows (`state-matrix.spec.ts:87`, `:96`), even though the underlying cart and checkout features now exist in `src/app/features/cart/` and `src/app/features/checkout/` (confirmed present on disk this session). **This is stale test metadata, not a missing application feature**, and per this task's own "Out of scope" section, `FIX-39` owns `state-matrix.spec.ts`'s `built` field — this document records the finding and does not edit the spec file.

## Defects found

1. `e2e/a11y/keyboard.spec.ts:61` (and the whole `FLOW` array's `waitFor` values) — `page.getByTestId('app-marketing-layout')` targets a Playwright test-id selector against a string that is actually an Angular *component selector*, not a `data-testid` attribute. No element in the rendered DOM carries `data-testid="app-marketing-layout"`. This causes the entire keyboard-flow test to skip at its very first step in every run, permanently, regardless of how much of the checkout flow is actually built. **Owner: unowned** — no FIX-NN document in `docs/fix/` was found addressing this specific locator mismatch (`FIX-48` touches this same file but only its screenshot-root path calculation, per its own commit message).
2. `e2e/design/state-matrix.spec.ts:87,96` — hardcoded `built: false` rows for `cart-default`, `success` and related surfaces no longer match the tree; the corresponding features exist under `src/app/features/`. **Owner: FIX-39** (per this task's own text, "FIX-39 owns its `built` field").
3. `e2e/network-isolation.spec.ts:37,71` (T02-AC05's own test) fails in both configured projects, measured in this session's full-suite run (see the `docs/mi-bolt/execution/acceptance-summary.md` commit, FIX-53). **Owner: FIX-09** (general Playwright-failure owner).
4. `e2e/checkout-f8.spec.ts:28` ("F8 — DeliveryStep onConfirm persists paymentMethod without 422") fails in both configured projects, same measurement. **Owner: FIX-09.**

## Reviewer decision

**Not accepted.** T25-AC01, T25-AC02, T25-AC04 and T25-AC05 are not measured (no real-browser-sonnet access this session), and defect 1 above shows the one suite that did run this session (`keyboard.spec.ts`) is skipping its entire flow for a reason unrelated to the application's actual state. This document is complete as a record of what was and was not measured; it is not a claim that T25 passes.
