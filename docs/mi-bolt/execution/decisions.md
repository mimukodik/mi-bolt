# MiBolt execution decisions

Recorded runtime decisions that deviated from or clarified the spec,
each with its concrete evidence pointer. Anything that changed scope,
fixed a path or made a spec ambiguity explicit lands here.

## D01 — O01 3D optional feature
**Status:** NOT_ENABLED
**Reason:** No explicit approval received; O01 stays out of scope.
The acceptance gate remains open for future approval but no code,
dependency, asset or test for 3D is introduced in baseline.

## D02 — Skill source
**Status:** APPLIED
**Path:** `/Users/eggp/projects/puffancs/mi-bolt/.claude/skills/mi-bolt-design/`
**Version:** 1.0.1
**SHA-256 (SKILL.md):** `40faf71e00a3a494d88485eee16f4c3f27669ad13c0b2da8ba67202e9a29e8e5`
**Reason:** Installed at the harness's `.claude/skills` location; not
copied or reconstructed from the docs package.

## D03 — Angular version lock
**Status:** APPLIED
**Version:** 22.1.6 (CLI 22.1.8)
**Reason:** Latest stable 22.x verified on 2026-09-14 from official npm
metadata; not a prerelease.

## D04 — TypeScript peer version
**Status:** APPLIED
**Version:** ~5.9.x
**Reason:** Package.json's `typescript: ~6.0.2` does not exist; pinned
to the actual Angular 22 peer dep range.

## D05 — Single OpenAPI source
**Status:** APPLIED
**Path:** `docs/mi-bolt/api/openapi.yaml`
**Reason:** Spec mandates one wire source. T04 copies the
`ng-openapi-gen.json` config to the repo root; no second hand-maintained
copy is created.

## D06 — Toolchain declaration lock (T00)
**Status:** APPLIED
**Reason:** The T00 packet required `verify-toolchain.mjs` to pass
against the real `package.json`, so every dependency the script checks
must be declared with a registry-resolvable, prerelease-free range whose
Node engines accept the runner.

**TypeScript range (`~6.0.2`):** The packet described `~6.0.2` as
non-existent on the npm registry and instructed a downgrade to `~5.9.0`.
Verified `npm view typescript versions` on 2026-09-14: 6.0.2 and 6.0.3
are both present. The Angular 22 compiler-cli peer dep is
`typescript: ">=6.0 <6.1"`, so the registry constraint and the Angular
22 peer both demand the 6.0.x line; the packet's `~5.9.0` instruction
would have broken the build. Per the packet's escape clause ("or
whatever the actual Angular 22 peer requires"), the declaration stays
at `~6.0.2`, which resolves to 6.0.3 — the version already present in
`node_modules`.

**Missing dependencies:** The packet's `EXPECTED_DEPS` list (15
packages) covers more than the initial repo declared. Added to
`package.json`:

- `@angular/cdk` `^22.0.0` (dependencies)
- `msw` `^2.15.0` (devDependencies)
- `@vitest/coverage-v8` `^4.1.0` (devDependencies, peer of installed
  `vitest@4.1.11`)
- `@playwright/test` `^1.63.0` (devDependencies)
- `ng-openapi-gen` `^1.0.5` (devDependencies)

**Result:** `node scripts/verify-toolchain.mjs` exits 0 with
`toolchain:OK`; `node --test scripts/verify-toolchain.spec.mjs` and
`node --test scripts/verify-skill-evidence.spec.mjs` are green (3 + 6
tests).

## D07 — Product / scope contract (concrete, not deferred)
**Status:** APPLIED
**Source files:**
- screen families: `docs/spec/screens.md` (S1 Home, S2 Catalogue, S3
  Product, S4 Cart/Contact/Delivery/Review/Success as states of the
  purchase family)
- layouts: `docs/spec/architecture.md` §1 (MarketingLayout,
  ShopLayout, CheckoutLayout — three reusable shells)
- product / commercial decisions: `docs/spec/architecture.md` §2
  (Fixed scope)

**Contract recorded on 2026-09-14:**

- **Four screen families** are in scope: home, catalogue, product,
  purchase flow. Cart, contact, delivery/payment, review and success
  are mandatory states of the fourth family, not additional
  unrelated screens.
- **Three layout shells** satisfy the layout requirement:
  MarketingLayout (S1), ShopLayout (S2 + S3), CheckoutLayout (S4
  states). No fourth shell is introduced.
- **Products are fictional**: 16 fictional device products from one
  fictional MiBolt provider. No real operator, no real catalog data
  and no proprietary research is shipped.
- **Pricing is one-time in whole HUF** for every device product. No
  subscriptions, monthly plans, installments or insurance.
- **No real payment, no real email, no real order dispatch.** No
  payment provider is integrated, no transactional email is sent and
  no logistics order is dispatched. The success route is an
  authoritative receipt lookup backed by MSW, not a guard-generated
  fake; a successful demo checkout remains a demo.

This entry is the concrete product/scope contract for T00–T29. Any
later task that introduces real payment, real email, real order
dispatch, an additional operator, monthly plans, installments,
insurance, login, user profiles, account verification, an admin UI,
product comparison, a CMS, a localization framework, analytics,
social login, chat or a provider switcher is a scope change and
must raise its own decision before any code lands.

## D08 — Real OpenAPI source path
**Status:** APPLIED
**Path:** `docs/api/openapi.yaml`
**Reason:** T04 owns the SDK generation. The README at
`docs/api/README.md` historically claimed the contract lives at
`docs/mi-bolt/api/openapi.yaml`; that path does not exist in the
repository (verified with `ls docs/mi-bolt/api/` on 2026-09-14 —
the directory contains only `docs/mi-bolt/execution/`). The actual
file is `docs/api/openapi.yaml`. Both `scripts/validate-contract.mjs`
(which already used `docs/api/openapi.yaml`) and the new
`scripts/api-drift.mjs` resolve to the real path; the project-root
`ng-openapi-gen.json` and the SDK output (`src/app/api/generated/`)
are wired to it.

**Config drift introduced by T04:** `ng-openapi-gen.json` is copied
from `docs/api/ng-openapi-gen.json` with two changes:
1. `input` is `docs/api/openapi.yaml` (the real file, not the
   README claim of `docs/mi-bolt/api/openapi.yaml`).
2. `excludeParameters: ["X-Demo-Session", "If-Match"]` is added so
   the demo-session interceptor and the `withIfMatch(version)` helper
   are the only way these headers reach the wire, matching the
   "added centrally" wording in T04-AC05.

The README at `docs/api/README.md` is corrected in the same commit
to point at the real path and to reference D08.
