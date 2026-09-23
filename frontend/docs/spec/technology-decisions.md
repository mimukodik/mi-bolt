# Research transfer decisions

## Recommendation

Keep the baseline device webshop deliberately small. From the supplied research adopt useful **interaction patterns** (filtering, exact SKU selection, thumbnails/zoom, sticky cost summary), not an operator framework. There is no necessary external technology beyond the requested Angular/OpenAPI/MSW/testing stack.

3D is the only reasonable separate demonstration enhancement. The uploaded Yettel research specifically reports Binkies3D URLs, while its Swiper identification is explicitly uncertain. The vendor's own site confirms a hosted viewer/model-library product; that does not authorize copying an operator integration, model asset, account ID or claim of pricing. [U03,S16]

Recommended 3D choice, only after approval: **one locally hosted, licensed GLB device model through @google/model-viewer**, lazy-loaded after an explicit interaction with a static poster/gallery fallback. No AR, automatic rotation, third-party model requests, remote decoder download or analytics. A 360-degree image sequence is an alternative only if suitable licensed angle images already exist; it is not geometrically equivalent to a 3D model. A custom Three.js viewer is unnecessary engineering for this scope. [S17,S18; alternatives are project recommendations]

The license/availability of a suitable model is a real dependency. No model asset was supplied, procured or granted permission by this plan. That is why O01 is conditional, not a hidden promise that any real phone can be shown in 3D for free. The rest of the webshop does not depend on this decision.

**O01 rejected on 2026-09-23 (Linear MIM-372).** The product owner decided not to build the 3D view because licensed device models are too expensive for this demo (in their words, in English: "no, this is too expensive"). The research behind the decision: the yettel.hu rotator is the hosted Binkies3D "Engage 3D" player, whose models reach the page only as `blob:` URLs and may not be extracted (Binkies Terms of Service, section 3.C); the yettel.hu legal notice (section 3) forbids copying or adapting site content without written permission; a Binkies subscription is negotiated with sales, with no public price and no trial; a royalty-free per-device model costs money (a Galaxy A55 model is listed at USD 99 on CGTrader), and free CC-BY models exist only for some devices. The recommendation above is kept as the recorded choice if the decision is ever revisited; nothing in the codebase depends on it.

## Evidence quality

The uploaded reports mix observed script/tag names with hypotheses about frameworks, bundle contents, A/B testing, versions and server behavior. They were reviewed, but the original live websites were not re-instrumented here. Custom element prefixes do not by themselves establish Stencil/Lit. A .swiper CSS class does not prove a current Swiper version. A listed pixel is not a payment gateway. Copied commercial prices/stock/product labels are not approved fixtures. The table keeps those distinctions explicit.

## Adoption matrix

### Binkies3D

Evidence: Yettel report: named vendor script URLs; vendor confirms product viewer.

**Decision: Do not import SaaS integration in baseline.** A hosted operator-specific viewer conflicts with offline/deterministic mock boundaries and needs its own licensing/integration agreement. Preserve the 3D UX idea, not copied account IDs/scripts.

Sources: S16,U03.

### @google/model-viewer

Evidence: Official local glTF/GLB web component and loading patterns.

**Decision: Optional O01, one licensed local device.** User-activated lazy load, locally hosted model/poster/decoders, static gallery fallback; no AR or telemetry. Viewer does not supply legal rights to product models.

**Superseded on 2026-09-23:** O01 was rejected as too expensive (Linear MIM-372); see Recommendation.

Sources: S17,S18.

### Swiper

Evidence: Telekom report shows swiper-container tags; Yettel report explicitly uncertain.

**Decision: Not needed for baseline gallery.** Small gallery can use Angular signals, CSS scroll-snap and accessible next/previous controls. Add a carousel library only for a separately demonstrated requirement.

Sources: U02,U03.

### Operator Web Components / Stencil / Lit

Evidence: os-/od- tags reported; framework/tool identity inferred, not established.

**Decision: Do not copy.** Use native standalone Angular components with the supplied MiBolt design. Tag prefixes alone do not prove Stencil or Lit or that a package is reusable.

Sources: U02.

### jQuery / Corbis / portal framework

Evidence: Yettel report identifies jQuery/script names.

**Decision: Exclude.** Not necessary for the requested modern Angular22 application; no reason to recreate an operator portal architecture.

Sources: U03.

### @ngx-translate/core

Evidence: Telekom report lists a translation package; version unknown.

**Decision: Exclude from one-language MVP.** Public demo is hu-HU. Signal-driven UI uses centralized Hungarian copy. Add i18n only when a second public language is required.

Sources: U02.

### Filtering, SKU selection, sticky summary

Evidence: Interaction patterns appear in both supplied reports.

**Decision: Adopt UX patterns, not proprietary code.** These directly help selecting a device and checking a price. Implement with Router, signals, semantic forms and CSS.

Sources: U02,U03.

### Product comparison / recently viewed

Evidence: Reported in operator sites.

**Decision: Not baseline scope.** Additional state, persistence, UI and test matrix without necessity for a four-screen purchase demo.

Sources: U02,U03.

### GTM / GA4 / Google Ads / pixels / Adform / Clarity

Evidence: Both reports list marketing and session measurement scripts.

**Decision: Strictly excluded.** User explicitly requested no analytics or social; no consent-dependent marketing stack is introduced.

Sources: U02,U03.

### Exponea / Bloomreach / iGoDigital

Evidence: Reports attribute CDP/recommendation scripts.

**Decision: Strictly excluded.** No behavioral targeting, personalization backend or recommendation engine. Featured devices are deterministic approved fixtures.

Sources: U02,U03.

### CookieYes / external consent tooling

Evidence: Yettel report lists CookieYes.

**Decision: Exclude integration.** No tracking integration is shipped. This is a product-scope choice, not a blanket legal opinion about all production consent obligations.

Sources: U03.

### Salesforce chat / Telekom chat / Medallia

Evidence: Reported chat and feedback services.

**Decision: Strictly excluded.** No chat, customer service widget, survey or external communication is required for MVP ordering.

Sources: U02,U03.

### reCAPTCHA

Evidence: Reported on Yettel.

**Decision: Exclude.** No public real backend, auth or spam-facing operation. Do not simulate an unnecessary external anti-bot dependency.

Sources: U03.

### Operator installment/tariff/insurance configurator

Evidence: Both reports describe complicated commercial dependencies.

**Decision: Exclude from device-only MVP.** One-time HUF pricing only; no invented commitment, credit check, subscription, bundle or insurance calculation.

Sources: U02,U03.

### Energy labels / warranty / financing claims

Evidence: Reported real-commerce product fields.

**Decision: Do not copy unverified values.** Fictional model specs are clearly labeled. Real legal/energy/warranty data would need separate authorized product sources and review.

Sources: U02,U03.

### Angular CDK / CSS scroll-snap

Evidence: Project choice, not a claim about operator stack.

**Decision: Use only necessary behavior utilities.** CDK focus/dialog primitives and native CSS avoid a heavy visual component theme; supplied MiBolt tokens remain authoritative.

Sources: S03.

## Optional 3D acceptance boundary

One model only; aggregate compressed model/textures <=3MiB, viewer chunk measured separately, zero baseline 3D transfer, gesture/keyboard controls, loading/progress/error/unsupported fallback states, correct variant association and provenance manifest. Angular wrapper and first-party adapter join the same unit coverage policy; there is no end-to-end suite, by the product owner's decision of 2026-09-20, so verification of rendered surfaces is the real-browser pass described in `docs/spec/testing.md`. Third-party viewer internals do not become our authored code but user-visible integration behavior must be tested in browser. MSW intercepts any model-failure scenarios; the baseline static artwork does not masquerade as a verified 3D asset.
