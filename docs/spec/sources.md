# Sources and evidence policy

The original plan records checks dated 2026-09-14. Those dated notes are preserved for provenance, not re-certified by this documentation repack. Re-verify toolchain versions and compatibility during T00 against official sources. User-uploaded research is cited as supplied evidence, not independently reproduced live forensic analysis. Project design choices and fixture data are not claims about a real operator.

## S01 — Angular official release list

https://github.com/angular/angular/releases

2026-09-14: stable latest 22.1.6; 22.2.0-next.7 is prerelease. Recheck during execution.

## S02 — Angular version compatibility

https://angular.dev/reference/versions

Published 22.0 Node/TS/RxJS compatibility; pinned 22.1 package peers must also be checked.

## S03 — Angular v22 release event

https://angular.dev/events/v22

Signal Forms, asynchronous signals and Angular Aria marked stable in v22.

## S04 — Angular Signal Forms overview

https://angular.dev/guide/forms/signals/overview

Signal Forms model/field bindings and @angular/forms/signals imports.

## S05 — Angular signals guide

https://angular.dev/guide/signals

Signal/computed/effect concepts; state ownership rules in this plan are project decisions.

## S06 — Angular built-in template control flow

https://angular.dev/guide/templates/control-flow

@if/@for/@switch and track identity.

## S07 — ng-openapi-gen official repository

https://github.com/cyclosproject/ng-openapi-gen

OpenAPI3.0/3.1; generated functional Api; configurable Observable output; 1.0.5 provider helper.

## S08 — MSW quick start

https://mswjs.io/docs/quick-start/

Reusable handlers in browser and Node integrations.

## S09 — MSW browser start

https://mswjs.io/docs/api/setup-worker/start/

Await asynchronous worker registration before dependent application code.

## S10 — MSW setupServer

https://mswjs.io/docs/api/setup-server/

Node process interception, not a real backend or browser service worker.

## S11 — Angular code coverage

https://angular.dev/guide/testing/code-coverage

Official unit-test builder supports coverage options and thresholds.

## S12 — Vitest coverage

https://vitest.dev/guide/coverage.html

V8/Istanbul reporting and included-file behavior; enforce explicit project manifest.

## S13 — Playwright Coverage API

https://playwright.dev/docs/api/class-coverage

Native JS coverage is Chromium-only; resetOnNavigation:false is not a guaranteed reload collector.

## S14 — Playwright Network guide

https://playwright.dev/docs/network

MSW service worker can own requests that page.route/context.route do not see.

## S15 — OpenAPI3.1 specification

https://spec.openapis.org/oas/v3.1.0.html

Wire description and JSON Schema vocabulary; does not generate a stateful mock domain automatically.

## S16 — Binkies3D official site

https://binkies3d.com/

Vendor product-viewer and model-library offering; no copied operator integration or unverified pricing assumed.

## S17 — model-viewer loading examples

https://modelviewer.dev/examples/loading/

Poster/reveal/lazy-load patterns for optional local 3D viewer.

## S18 — Google model-viewer documentation

https://developers.google.com/ar/develop/webxr/model-viewer

Web component supporting glTF/GLB; AR exists but is explicitly excluded from this MVP.

## U01 — Retired design skill (superseded by `docs/design/yettel.md`)

Separately installed design skill, resolved during T00; superseded by `docs/design/yettel.md`, the current design reference.

User-provided normative design rules. Original raster remains unchanged and still has superseded brand text.

## U02 — Uploaded Telekom reverse engineering report

User-uploaded Telekom report inside the original `yettel-vs-telecom-architect-reverse.zip`; deliberately not redistributed.

Source observation/inference report; not an independently verified operator implementation inventory.

## U03 — Uploaded Yettel reverse engineering report

User-uploaded Yettel report inside the original `yettel-vs-telecom-architect-reverse.zip`; deliberately not redistributed.

Reports Binkies3D script domains and Corbis/jQuery; Swiper and some platform claims remain uncertain.

## Documentation-package boundary

Only the derived implementation decisions in `technology-decisions.md` are required for execution. The raw operator research, original uploaded ZIPs, original design skill and historical generation logs are intentionally omitted. No claim is made that those omitted files exist under docs/. This document retains source identities for attribution.
