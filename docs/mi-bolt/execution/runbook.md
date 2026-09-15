# T29 — Runbook

Status: SNAPSHOT AGAINST `907e5a5fbafe257fc73473c5035a84aca88f9a3d`.

Audience: anyone who needs to launch the MiBolt demo, reproduce
the gate run, or close the blockers listed in
`docs/mi-bolt/execution/acceptance-report.md`. Every command
below has been triple-checked (path exists, package present,
script resolves) before being listed here.

## Demo-notice pledge

The shell renders this Hungarian pledge on every page (R15,
source-of-truth file:
`src/app/shared/shell/demo-notice.ts`):

```text
MiBolt demó — nincs valódi vásárlás, nincs fizetés, nincs kiszállítás.
```

Any demo session that ends with a successful checkout does not
dispatch an order, charge a card, or send an email — the MSW
worker owns every network request and the success route is a
`mockServiceWorker.js`-backed receipt lookup.

## Toolchain lock

Versions (recorded `docs/mi-bolt/execution/toolchain-lock.json`,
2026-09-14; same versions still installed):

| Component | Version |
|---|---|
| Node | 26.5.0 |
| Angular | 22.1.6 |
| Angular CLI / `@angular/build` | 22.1.8 |
| TypeScript | 6.0.3 (declared `~6.0.2`, Angular peer `>=6.0 <6.1`) |
| RxJS | 7.8.x |
| ng-openapi-gen | 1.0.5 |
| MSW | 2.15.0 |
| Vitest | 4.x + `@vitest/coverage-v8@4.1.11` |
| Playwright | 1.63.0 |

Skill (T29 mandatory):

| Item | Value |
|---|---|
| Approved version | 1.0.1 |
| Resolved entry | `/Users/eggp/projects/puffancs/mi-bolt/.claude/skills/mi-bolt-design/SKILL.md` |
| SHA-256 | `40faf71e00a3a494d88485eee16f4c3f27669ad13c0b2da8ba67202e9a29e8e5` |
| Source-of-truth file | `docs/mi-bolt/execution/skill-location.json` |

## Repository layout quick reference

| Path | What lives there |
|---|---|
| `src/app/` | Standalone Angular 22 components, facades, layouts |
| `src/app/api/generated/` | Generated SDK (32 models, 6 services) |
| `src/mocks/` | MSW worker, MSW Node, handler / domain / persistence |
| `src/styles/tokens.css` | Design tokens (orange `#FF6A00`, charcoal `#1B2024`) |
| `docs/api/openapi.yaml` | OpenAPI 3.1 source (per D08) |
| `scripts/` | Toolchain / contract / drift / coverage / budget / traceability / policy / serve-static gate scripts |
| `tests/` | Vitest unit specs |
| `e2e/` | Playwright E2E specs |
| `dist/mi-bolt/browser/` | Default Angular build output (currently empty because of `cmd 10` blocker) |
| `dist/t13-catalog/browser/` | T13-catalog ship — used as the static host for the design / a11y / deployment specs against the current source tree |

## Install

Use npm 11.17+ (per `packageManager` in `package.json`):

```sh
npm ci
```

If npm reports peer warnings around `vitest@4.x` ↔
`@vitest/coverage-v8@4.1.11`, they are expected and resolve in
the runner; the lock pins exact versions.

## Gate order (canonical pipeline per `docs/spec/testing.md`)

The T29 gate run recorded in `/tmp/t29-gates.txt` follows this
order. Run from `/Users/eggp/projects/puffancs/mi-bolt/`.

1. **Toolchain / skill**

   ```sh
   node scripts/verify-toolchain.mjs
   node scripts/verify-skill-evidence.mjs
   ```

   Both should exit 0. Captured (cmd 01, 02): PASS.

2. **API contract, generation, drift**

   ```sh
   npm run api:validate
   npm run api:generate
   npm run api:drift
   ```

   Captured (cmd 03, 04, 05): PASS.

3. **Lint**

   ```sh
   npm run lint
   ```

   Captured (cmd 06): **FAIL** — 9 errors in
   `src/app/features/checkout/{checkout-form.model.ts,checkout.guards.ts}`.
   Resolve before continuing.

4. **Build (production)**

   ```sh
   npx ng build mi-bolt --configuration=production --output-path=dist/mi-bolt-t29
   ```

   Captured (cmd 10): **FAIL** — three pre-existing TS errors
   in `catalog-page.ts:244`, `success-step.ts:419`, `:446`.
   Resolve before continuing.

5. **Unit coverage**

   ```sh
   npm run test:unit:coverage
   npm run coverage:unit:check
   ```

   Captured (cmd 07): **FAIL** — empty report; root cause is
   the 30 pre-existing Vitest failures in `tests/*`. See
   `coverage-report.md` for the per-file list.

6. **E2E coverage / design / cross-browser**

   ```sh
   npx playwright test --project=mi-bolt-design \
     e2e/design/viewport-matrix.spec.ts \
     e2e/design/state-matrix.spec.ts \
     e2e/a11y/keyboard.spec.ts
   npm run coverage:e2e:check
   ```

   The Playwright invocation needs `MI_BOLT_E2E_STATIC_DIR` to
   point at an existing build until `cmd 4` is green. Captured
   (cmd 11): PASS against `dist/t13-catalog/browser` (101 / 5 / 0).

7. **Contract parity**

   ```sh
   node scripts/check-operation-parity.mjs
   ```

   Captured (cmd 09): PASS.

8. **Traceability**

   ```sh
   node scripts/check-traceability.mjs
   ```

   Captured (cmd 13): **FAIL** — 16 unreached items (3 RQ / 43 AC / 3 scenarios);
   all are gate-/handoff-owned or 3D. See
   `docs/mi-bolt/execution/traceability.md`.

9. **Test policy**

   ```sh
   node scripts/check-test-policy.mjs
   ```

   Captured (cmd 14): **FAIL** — 6 `test.skip` findings across
   3 spec files. See
   `docs/mi-bolt/execution/coverage-report.md` "T27-AC05".

10. **Bundle budgets**

    ```sh
    MI_BOLT_E2E_STATIC_DIR=dist/t13-catalog/browser \
      node scripts/check-budgets.mjs
    ```

    Captured (cmd 12): PASS. Switch back to `dist/mi-bolt/browser`
    once `cmd 4` emits a canonical build.

11. **Skill re-read** (T29 mandatory)

    ```sh
    shasum -a 256 .claude/skills/mi-bolt-design/SKILL.md
    ```

    Captured (cmd 15):
    `40faf71e00a3a494d88485eee16f4c3f27669ad13c0b2da8ba67202e9a29e8e5`,
    matches the recorded value in `skill-location.json`.

12. **Source revision**

    ```sh
    git -C /Users/eggp/projects/puffancs/mi-bolt rev-parse HEAD
    ```

    Captured (cmd 16): `907e5a5fbafe257fc73473c5035a84aca88f9a3d`.
    This is the value baked into `release-manifest.json`.

## Launch the demo

The T28 static host is the only network surface for the demo:

```sh
PORT=4200 \
  MI_BOLT_E2E_STATIC_DIR=dist/mi-bolt/browser \
  node scripts/serve-static.mjs
```

- Host: `http://127.0.0.1:4200/` (localhost only — `0.0.0.0`
  binding is rejected).
- Static dir: `dist/mi-bolt/browser`. Until `cmd 4` emits a
  build, point this at `dist/t13-catalog/browser` for a
  verifiable run.
- SPA fallback: every non-`/api/`, non-asset URL falls back to
  `index.html`. `/api/*` always returns
  `application/problem+json` 404.
- Cache policy: `index.html` and `mockServiceWorker.js` are
  `no-cache, no-store, must-revalidate`; hashed
  `main-*.js` / `chunk-*.js` / `styles-*.css` / `/assets/...` are
  `public, max-age=31536000, immutable`.

The Angular app does NOT register a `@angular/service-worker`
PWA worker. The only service worker the demo installs is
`mockServiceWorker.js` under the demo's own origin.

### `baseHref`

The shell ships `<base href="/">`. If the demo is mounted under
a sub-path (e.g. `http://127.0.0.1:4200/mi-bolt/`), build with
`BASE_HREF=/mi-bolt/ npx ng build ...` and the same
`scripts/serve-static.mjs` will serve both `/` and
`/telefonok/...` deep links from any base URL.

### Mock-seed and scenario registry

| Resource | Location |
|---|---|
| Scenarios | `docs/tasks/test-scenarios.json` (127 rows) |
| Wire contract | `docs/api/openapi.yaml` (per D08; `ng-openapi-gen` reads this) |
| Generated SDK | `src/app/api/generated/` |
| MSW worker | `src/mocks/browser.ts` (`startMockWorker(snapshot)`) |
| MSW Node | `src/mocks/node.ts` (Vitest setup) |
| `X-Demo-Session` interceptor | `src/app/core/api/demo-session.interceptor.ts` |
| `If-Match` helper | `src/app/core/api/api-root.ts` (`withIfMatch(version)`) |

A canonical seed scenario is the one the T13-catalog ship ships
with; running the demo against `dist/t13-catalog/browser` is the
fastest way to see seed data.

## Verification evidence locations

| File / dir | What it records |
|---|---|
| `/tmp/t29-gates.txt` | This turn's gate exit codes + last-5-line output |
| `coverage/runtime-manifest.json` | T02 inventory (78 runtime + 1 bootstrap) |
| `coverage/unit/coverage-final.json` | **Absence is the T27 gap**, not this turn's |
| `coverage/e2e/coverage-final.json` | **Absence is the T27 / T28 gap**, not this turn's |
| `playwright-report/` | Per-run HTML report (the cmd 11 run writes here) |
| `playwright-report/data/*.zip` | `trace: 'retain-on-failure'` traces |
| `e2e/design/screenshots/<viewport>/<route>.png` | AC02 visual catalogue (96 files for T25 / T13-catalog ship) |
| `e2e/design/screenshots/states/<state>/<route>.png` | State-matrix screenshots (6) |
| `e2e/design/screenshots/keyboard/<step>.png` | Keyboard-flow screenshots |
| `docs/mi-bolt/execution/coverage-report.md` | T27 coverage close (input) |
| `docs/mi-bolt/execution/design-review.md` | T25 design / a11y audit (input) |
| `docs/mi-bolt/execution/deployment.md` | T28 deployment contract (input) |
| `docs/mi-bolt/execution/decisions.md` | D01–D08 decision register (input) |
| `docs/mi-bolt/execution/acceptance-report.md` | T29 handoff (this turn) |
| `docs/mi-bolt/execution/traceability.md` | T29 traceability (this turn) |
| `docs/mi-bolt/execution/runbook.md` | This file |
| `release-manifest.json` | T29 machine-readable verdict (this turn) |

## Notes for closing the handoff

The five blocker families, in priority order (see
`acceptance-report.md` for the full defect list):

1. Resolve the three TS errors that block `cmd 4`
   (catalog-page.ts:244; success-step.ts:419 / :446).
2. Resolve the nine lint errors that block `cmd 3`.
3. Resolve the 30 pre-existing Vitest failures (cmd 5).
4. Replace `test.skip(...)` markers with positive / negative
   assertions (cmd 9).
5. Promote the gate-/handoff-owned ACs in `progress.json` once
   evidence is in place.

`O01 / 3D` stays `NOT_ENABLED` per `decisions.md` D01 until a
separate approval lands.

## Files

- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/runbook.md` — this file
- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/acceptance-report.md` — handoff verdict
- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/traceability.md` — reach matrix
- `/Users/eggp/projects/puffancs/mi-bolt/release-manifest.json` — release record
