# FIX-51 — Close the MSW bypass hole, and rename `prepareMocks` to `startMocks`

Status: DONE — both parts landed: the same-origin bypass now gates on origin as well as pathname and a new `installCrossOriginBlock()` answers any foreign-origin request with an explicit 403, with evaluation order (business → same-origin bypass → cross-origin block → same-origin catch-all) resolving the overlap deterministically (9dd2174); and `prepareMocks` became `startMocks` (d1ff677). This document's plan quoted a pre-FIX-10 shape of `src/mocks/browser.ts` and assumed the predicate could be imported directly; it could not — that module's scope calls `setupWorker()` from `msw/browser`, which throws under vitest, and the first version of the new spec failed every case with `Invariant Violation: [MSW] Failed to execute setupWorker in a non-browser environment` before reaching the predicate at all. The predicate was extracted into `src/mocks/business-route-predicates.ts`, which imports no `msw`. Open: this document's own real-browser network check (service-worker interception cannot be reproduced in jsdom) is deferred to the batched browser-verification pass.
Severity: blocker
Source: A2 (API, contract and mock sweep). Recorded as unowned in `FIX-10`'s out-of-scope section; this task is its owner. Part 2 carries decision **D10** against `docs/tasks/T05.md:29`.

## Why this is wrong

Two things, and they are two commits. The first is what this task was written for and
what its severity is set by; the second is a rename decision **D10** landed here.

### The bypass hole — Part 1

`installBusinessRouteBypass()` exists so the page can still load its own chunks,
source maps and assets while MSW owns the business API. It decides with one test:
does the request's **pathname** start with `/api/`? If not, it passes the request
through to the real network. A pathname says nothing about a host, so a request to
any external origin whose path is not `/api/…` — a script, a font, a telemetry
beacon, another company's API — is passed through rather than blocked.

`docs/tasks/T05.md:49` (**T05-AC05**) states the requirement the other way round:

> Unknown API endpoints cannot pass through; local app/media assets are explicitly
> allowed. External scripts, fonts, telemetry and business hosts are disallowed.

`docs/spec/architecture.md` §8 builds the whole demo on the premise that the page
reaches no network at all, and `docs/spec/acceptance.md` **AC25** forbids external
traffic. The bypass implements the first half of T05-AC05's second sentence — local
assets allowed — and none of the third.

### The bootstrap entry point's name — Part 2

`docs/tasks/T05.md:29` declares the module's contract with its neighbours and names
`startMocks(): Promise<void>`. `src/core/bootstrap-demo.ts:36` exports
`prepareMocks(): Promise<string>`. Under **D1** the packet is right and the code is
wrong; the only question was whether D1 reaches an identifier at all, and the user
answered it — **"A spec neve nyer"** ("the spec's name wins"), decision **D10**. An
earlier version of this file left that question open with a recommendation attached;
it is closed, and no task reopens it.

## Evidence

### The predicate looks only at the path

`src/mocks/browser.ts:91-104`:

```ts
/**
 * Install a global passthrough for every non-business route. The
 * dev server still serves its own Vite chunks, source maps and the
 * mockServiceWorker.js bundle; intercepting those would break the
 * page. The `onUnhandledRequest` callback in `startMockWorker`
 * retains the `error` policy for `/api/...` URLs only.
 */
export function installBusinessRouteBypass(): void {
  const bypassAllNonApi: HttpHandler = http.all(
    ({ request }) => !new URL(request.url).pathname.startsWith('/api/'),
    () => passthrough(),
  );
  worker.use(bypassAllNonApi);
}
```

`new URL('https://telemetry.example/collect').pathname` is `/collect`, which does not
start with `/api/`, so the predicate returns `true` and the resolver returns
`passthrough()` — the request goes to the network.

**The custom predicate is a supported MSW form and does match cross-origin requests**,
so this is not a mis-typed call that silently never fires. The installed MSW
(2.15) declares it at
`node_modules/msw/lib/core/handlers/HttpHandler.d.ts:41`:

```ts
type HttpRequestPredicate<Params extends PathParams> = Path | HttpCustomPredicate<Params>;
```

with `Path = string | RegExp` at
`node_modules/msw/lib/core/utils/matching/matchRequestUrl.d.ts:1`. The handler is
registered, the predicate runs against every request the service worker sees, and
the page's own origin is never consulted.

### The fallback has the same hole

`src/mocks/browser.ts:141-160`:

```ts
  await worker.start({
    onUnhandledRequest(request, print) {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        print.error();
        throw new Error(
          `[mi-bolt] unhandled business route: ${request.method} ${request.url}`,
        );
      }
      // Static assets, source maps, the mock worker bundle itself
      // and the Vite dev server chunks all bypass MSW silently.
    },
```

Same test, same blind spot. Today it is unreachable for a cross-origin request
because the bypass handler matches first, but it is the second place the rule is
written and it is written the same wrong way.

### What this is **not** the cause of

A2 raised the failing `e2e/network-isolation.spec.ts` as possibly caused by this
hole, without confirming it. **It is not.** That spec navigates to
`/canary?branch=true` (`e2e/network-isolation.spec.ts:25` and `:54`) and then asserts
`page.getByTestId('canary-branch')`. `src/app/app.routes.ts` declares its top-level
routes in this order:

```
:109  path: ''
:125  path: 'telefonok'
:156  path: 'kosar'
:167  path: 'penztar'
:181  path: '**'        <-- catch-all
:194  path: 'primitives'
:202  path: 'canary'
```

Angular's router matches in array order and `**` matches everything, so `/canary` is
unreachable and renders `NotFoundPage`. The spec fails at its first assertion, before
it ever issues the external `fetch`. **`FIX-09`** owns moving the wildcard to the end
of the array, and that is the cause. Confirming this was step one of this task and
the result is recorded here so the executor does not repeat it; re-measure it as
FIX-51-AC01 rather than taking it on trust.

### Two adjacent items the audit attached to this finding, neither of them this task's

- **`tests/contract/operation-matrix.spec.ts:379-384` reads `src/mocks/node.ts` as
  source text**, so deleting that module would break the contract suite.
  **`FIX-13` already deletes that assertion in the same commit as the module** — its
  "What to change" Part 1 says *"Then delete the source-text test that reads it,
  `tests/contract/operation-matrix.spec.ts:379-384`"*, and its **FIX-13-AC03** requires
  that `grep -cE "readFile\(.*src/mocks" tests/contract/operation-matrix.spec.ts` print
  `0` while `grep -c "src/mocks" …` still prints `8`. There is no ordering hazard left
  and nothing for this task to do. Do not open that file.
- **`docs/tasks/T05.md:20` lists `src/mocks/node.ts`**, which the repository does not
  provide. `FIX-13` deletes that module and names the packet line as "the unresolved
  D1 item" it deliberately does not close; under **D1** the specification is not
  edited to match the code. That half stays where `FIX-13` left it and is not this
  task's.
- **`docs/tasks/T05.md:29` declares `startMocks(): Promise<void>`** where the
  repository exports `prepareMocks(): Promise<string>`. This half **was** reserved for
  the user and is now decided: see Part 2 of "What to change".

## What to change

**Two independent parts, and they are two commits, not one.** Part 1 is the bypass
hole this task is titled for: one function in `src/mocks/browser.ts`, plus its test.
Part 2 is the `startMocks` rename that decision **D10** settled, which landed on this
task because this is the file that reserved the question. They share no file and no
reasoning, so bundling them would produce a commit no reviewer could describe in one
sentence, which `.claude/rules/session-lifecycle.md` ("One commit, one logical
change") makes into two. The Commit section says how they are staged.

### Part 1 — `src/mocks/browser.ts` — `installBusinessRouteBypass()`

Replace the body so that the same-origin passthrough and the cross-origin block are
two explicit handlers registered in one call:

```ts
/**
 * Install the two global handlers that stand behind every business
 * route: a passthrough for the page's own non-business traffic, and
 * an outright block for anything addressed to another origin.
 *
 * T05-AC05 (`docs/tasks/T05.md:49`) is the rule both implement:
 * "Unknown API endpoints cannot pass through; local app/media assets
 * are explicitly allowed. External scripts, fonts, telemetry and
 * business hosts are disallowed." A pathname cannot distinguish the
 * page's own `/assets/x.webp` from `https://cdn.example/assets/x.webp`,
 * so both handlers compare origins.
 */
export function isSameOriginNonBusiness(url: URL, pageOrigin: string): boolean {
  return url.origin === pageOrigin && !url.pathname.startsWith('/api/');
}

export function installBusinessRouteBypass(): void {
  const pageOrigin = globalThis.location.origin;

  const bypassSameOriginNonApi: HttpHandler = http.all(
    ({ request }) => isSameOriginNonBusiness(new URL(request.url), pageOrigin),
    () => passthrough(),
  );

  const blockCrossOrigin: HttpHandler = http.all(
    ({ request }) => new URL(request.url).origin !== pageOrigin,
    ({ request }) => {
      console.error(`[mi-bolt] blocked external request: ${request.method} ${request.url}`);
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'External request blocked',
          status: 403,
          detail: 'The MiBolt demo makes no external requests (T05-AC05).',
        },
        { status: 403 },
      );
    },
  );

  worker.use(bypassSameOriginNonApi, blockCrossOrigin);
}
```

Add `HttpResponse` to the existing `msw` import at `browser.ts:22`, which today
reads:

```ts
import { http, passthrough, type HttpHandler } from 'msw';
```

Four points the executor must not get wrong:

- **Order inside the single `worker.use(...)` call matters.** The same-origin
  passthrough is listed first so a request to the page's own origin never reaches the
  blocking handler. Do not split this into two `worker.use` calls. Measured in the
  installed MSW at
  `node_modules/msw/lib/core/experimental/handlers-controller.js:82`, `use()`
  **prepends** and preserves the order within one call:

  ```js
      handlers[kind] = existingForKind ? [...overridesForKind, ...existingForKind] : overridesForKind;
  ```

  so two separate calls would put the blocking handler ahead of the passthrough. That
  same prepending is why the business handlers, added after this function runs at
  `browser.ts:137-140`, are still matched before either of these two.
- **The blocking resolver returns a response; it does not `passthrough()` and does not
  throw.** A returned 403 means the request is answered inside the service worker and
  nothing leaves the browser, which is what "disallowed" has to mean. Throwing would
  surface as a network error, which is indistinguishable from an offline machine.
- **`globalThis.location.origin` is read once, outside the predicates.** This module
  runs page-side — `setupWorker` is the page-side API — so `location` is the page's.
- **Do not also change `onUnhandledRequest` at `:142-156`.** With the blocking
  handler registered, no cross-origin request can reach that callback, so a second
  origin check there would be code that can never run, which `.claude/CLAUDE.md`
  ("Simplicity first") forbids. Update the **module header comment** at
  `browser.ts:11-14` instead, which currently says only that the callback "only
  throws for `/api/...` traffic"; make it describe the two handlers as well.

### Tests — `tests/mocks-browser-bypass.spec.ts`

Put it in `tests/` for the reason **FIX-31** states and **FIX-06** owns:
`vitest.config.ts:506` sets `include: ['tests/**/*.spec.ts']`, and `npm run test` is
red at baseline (**FIX-04**).

Assert the **predicate**, not the file's text. `isSameOriginNonBusiness` from "What
to change" is exported for exactly this: it is a pure function of a `URL` and an
origin string, so it needs no service worker, no jsdom `location` and no MSW.

Cases, with `pageOrigin = 'http://localhost:4200'`. The third column says which of
the two handlers the request reaches in the browser, and follows from the function's
return value plus the origin comparison:

| URL | `isSameOriginNonBusiness` | reaches |
|---|---|---|
| `http://localhost:4200/assets/products/graphite-front.webp` | `true` | passthrough |
| `http://localhost:4200/mockServiceWorker.js` | `true` | passthrough |
| `http://localhost:4200/api/v1/cart` | `false` | neither — the business handlers own it |
| `https://telemetry.example/collect` | `false` | blocked |
| `https://fonts.googleapis.com/css2?family=X` | `false` | blocked |
| `https://example.com/api/v1/cart` | `false` | blocked |
| `http://localhost:4201/assets/x.webp` | `false` | blocked — a different port is a different origin |

Three of those rows return `true` from the **current** predicate, which looks only at
the pathname, and are therefore passed to the real network today:
`https://telemetry.example/collect`, `https://fonts.googleapis.com/css2?family=X` and
`http://localhost:4201/assets/x.webp`. The `localhost:4201` row is the sharpest,
because it is the one a reader assumes is safe. Demonstrate at least that row failing
against the pre-change code (FIX-51-AC07).

**How to demonstrate it, since the pre-change predicate cannot be imported.** It is an
anonymous arrow inside `installBusinessRouteBypass` (`src/mocks/browser.ts:99`), not an
export, so there is no "run the spec against the old code" to perform and no second
file to put it in — `FIX-51-AC08` closes the Part 1 commit at two paths. Carry the old
predicate into the spec as a named local instead, exactly as it reads today, and assert
that the two disagree:

```ts
// The predicate this change replaces, copied verbatim from
// src/mocks/browser.ts:99 before the change. It is kept here so the
// defect stays covered: a later edit that reverts to a pathname-only
// test fails this case rather than passing silently.
const pathnameOnlyBypass = (url: URL): boolean => !url.pathname.startsWith('/api/');

it('the pathname-only predicate passed a foreign origin through; this one does not', () => {
  const foreign = new URL('http://localhost:4201/assets/x.webp');
  expect(pathnameOnlyBypass(foreign)).toBe(true);
  expect(isSameOriginNonBusiness(foreign, 'http://localhost:4200')).toBe(false);
});
```

Add the same two-line pair for `https://telemetry.example/collect` and
`https://fonts.googleapis.com/css2?family=X`, the other two rows the current predicate
answers `true` for. Those three assertions are the failing-first proof, held
permanently, in one run.

`https://example.com/api/v1/cart` behaves differently and is worth its own case. Its
pathname *does* start with `/api/`, so the current bypass declines it; the business
handlers decline it too, because MSW resolves a handler's relative path against the
page's own origin before matching
(`node_modules/msw/lib/core/utils/matching/normalizePath.js`), so `/api/v1/cart`
never matches another host. It therefore reaches `onUnhandledRequest`, whose
`/api/` test throws — so this one URL is already blocked today, by accident of its
path. After the change it is blocked deliberately, by the cross-origin handler, with
a 403 and a console line. Assert the 403, not the throw.

### Part 2 — rename `prepareMocks` to `startMocks`, returning `void`

This was an open question in an earlier version of this file, with a recommendation
attached. It is now decided. The user was asked whether D1 reaches an identifier and
answered **"A spec neve nyer"** ("the spec's name wins"), which is decision **D10**.
`docs/tasks/T05.md:29` declares the contract:

```text
createHandlers({repository,clock,ids,scenario,apiRoot}): RequestHandler[]. hydrateSnapshot(): MockSnapshot. startMocks(): Promise<void>.
```

The repository exports `prepareMocks(): Promise<string>` instead
(`src/core/bootstrap-demo.ts:36`). Under **D1** the packet is right and the code is
wrong, so the code changes. `docs/tasks/T05.md` is **not** edited.

**Dropping the return value costs nothing, and that is measured rather than argued.**
The one call site discards it already — `src/main.ts:57` is
`await prepareMocks().catch((err) => { … });`, which awaits the promise and binds
nothing — and `grep -rn "prepareMocks" src tests e2e scripts` (measured 2026-09-17)
returns hits in two files only, `src/main.ts` and `src/core/bootstrap-demo.ts`. The
scenario name the function used to return is already reachable through
`getPreparedScenario()` (`src/core/bootstrap-demo.ts:69`), which is exported and today
has no caller at all, so a future consumer has an accessor waiting rather than a
return value to restore.

**`src/core/bootstrap-demo.ts`:**

- `:36` becomes `export async function startMocks(): Promise<void> {`.
- The two `return preparedScenario;` statements — `:49`, after the
  non-demo short-circuit sets `preparedScenario = 'production'` at `:48`, and `:65`,
  after the tail sets it to the resolved scenario at `:64` — lose their value:
  `return;` at `:49`, and nothing at `:65`, since it is the last statement in the
  function. **Both assignments stay**; they are what `getPreparedScenario()` reads.
- Three comments name `prepareMocks` in prose and must follow it: the module header
  at `:4`, the function's own doc comment at `:30-35`, and the doc comment on
  `getPreparedScenario()` at `:68`. In the second, delete the sentence spanning
  `:32-33` — "Returns the active scenario name when it finishes so the caller can log
  it" — which stops being true.
- Leave `getPreparedScenario()` and `resetPreparedScenarioForTests()` exactly as they
  are, names included. `T05.md:29` names neither, so **D10** says nothing about them.

**`src/main.ts`:**

- `:56` becomes `const { startMocks } = await import('./core/bootstrap-demo');` and
  the call on `:57` follows it.
- The two prose mentions at `:26` and `:40` name `prepareMocks`; rewrite both.

Use no `as` and no `any` (`.claude/rules/code-standards.md`).

**`FIX-12` edits the same two lines of `src/main.ts`** — it replaces the `.catch()`
with a `try`/`catch` that calls `showFatal` — so the two tasks must not run at the
same time and the orchestrator sequences them. Whichever lands second keeps both
changes: the call is `startMocks()` **and** it is inside `FIX-12`'s `try`. Say in the
commit body which order applied. Nothing else about `FIX-12`'s work is this task's.

**Tests.** No spec covers this module: `grep -rln "bootstrap-demo" tests e2e` returned
nothing on 2026-09-17, and the only hits anywhere are five files under `src/`. Run it
again before you start and record what it returns. The rename changes no behaviour, so
what proves it is the build plus a browser check that the application still boots and
MSW still intercepts — **AC12**, which repeats AC05 after Part 2's commit. Do not
write a spec that asserts the identifier's spelling by reading the file as text: that
is the defect class `FIX-07` and `FIX-07b` exist to remove.

- **`tests/contract/operation-matrix.spec.ts` — `FIX-13`.** It deletes the
  source-text read of `src/mocks/node.ts` in the same commit as the module. Do not
  open that file; see Evidence.
- **`src/mocks/node.ts` itself — `FIX-13`.**
- **`docs/tasks/T05.md` itself.** Under **D1** it is specification and it is not
  edited, neither its `src/mocks/node.ts` file entry at `:20` nor its interface line
  at `:29`. Part 2 brings the code to `:29`; `FIX-13` owns `:20`, and leaves it open
  rather than closed.
- **Renaming anything else in `src/core/bootstrap-demo.ts`.** **D10** reaches the
  identifiers `docs/tasks/T05.md:29` names and no further. `getPreparedScenario`,
  `resetPreparedScenarioForTests` and `preparedScenario` keep their names, and so does
  the file. A tidy-up sweep of "prepared" to "started" across the module is exactly the
  scope creep `.claude/CLAUDE.md` ("Surgical changes") forbids.
- **`src/main.ts`'s error handling — `FIX-12`.** Part 2 changes the name bound at
  `:56` and called at `:57`; the `.catch()` around it and the `showFatal` surface are
  `FIX-12`'s. Do not fold one into the other.

- **The route order that actually fails `e2e/network-isolation.spec.ts` —
  `FIX-09`.** Do not touch `src/app/app.routes.ts`.
- **`onUnhandledRequest` — deliberately unchanged.** See "What to change".
- **The cart-and-order persistence work — `FIX-10`.** It edits `src/mocks/browser.ts`
  as well, for **D5**'s part 2, so the two tasks must not run at the same time; the
  orchestrator sequences them. `FIX-10`'s out-of-scope section names this defect as
  unowned; after this task it is owned here.
- **Every other handler in `src/mocks/`.** This task changes one exported function.
- **Adding an allowlist of permitted external hosts.** There are none.
  `docs/spec/acceptance.md:29` (**AC25**) forbids shipping "analytics, tag manager,
  tracking pixels, session replay, social integration, chat widget, external fonts,
  consent SaaS or unnecessary operator framework", and
  `docs/spec/architecture.md:159` adds "No untrusted remote image fetch is allowed".
  A configurable allowlist would be flexibility nobody asked for
  (`.claude/CLAUDE.md`, "Simplicity first").

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

```bash
npm run build                                       # expected exit 0
npx vitest run tests/mocks-browser-bypass.spec.ts   # expected exit 0
npm run test                                        # see the note below — not expected to exit 0
```

`npm run test` is `ng test`, which fails 14 of 14 files at the `db6d295` baseline for
reasons **FIX-04** owns (`BASELINE.md:10`). Run it, record its exit code and its
failure list verbatim, and compare that list against the one taken before this task's
first edit: the bar is that this change added nothing to it, not that the suite is
green. **FIX-51-AC09** is worded the same way and is the criterion.

`npm start` is not part of that block: it is `ng serve` and never exits, so a
sequential run that includes it hangs. The orchestrator starts it separately, in the
background, before the browser checks below, and stops it when finished
(`.claude/rules/browser-verification.md`, steps 1 and 8).

Then the browser checks below. Stop the dev server when finished.

**Part 2 adds two commands of its own**, run after its commit:

```bash
grep -rn "prepareMocks" src tests e2e scripts        # expected: no output, exit 1
grep -rn "startMocks" src                            # expected: src/core/bootstrap-demo.ts and src/main.ts
```

Both are checks that the rename is complete, not substitutes for the browser pass:
**AC12**, which repeats AC05 after Part 2, is what shows the application still boots
and MSW still intercepts, and `.claude/rules/browser-verification.md` says a grep is
not verification.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright suite: it rewrites 49
tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task changes one function in the mock layer and one identifier on the bootstrap
path, and renders nothing.** The browser criteria below exist because the defect is
only observable in a real browser — a service worker's interception cannot be
reproduced in jsdom — not because a rendered surface changed.
`.claude/rules/browser-verification.md`'s exemption would otherwise apply; it is not
claimed, because the verification genuinely runs in a browser. Part 2 gets a browser
pass of its own for the same reason (AC12): the rename sits on the path that starts
MSW, so a mistake there shows up as an application that boots without its data layer
rather than as a compile error.

- **R15 applies**: the demo must not behave as though it reaches a real service. A
  request that leaves the page is the strongest form of that claim, and AC03 measures
  that none does.
- **R19 applies**: a blocked request produces a distinct, logged outcome rather than
  a silent one. AC04 records the console message.
- **R24 applies**: blocking an external request must not disturb the cart or any
  entered data. AC05 confirms the cart survives.
- R01–R14, R16–R18, R20–R23, R25: N/A. The change touches no brand asset, imagery,
  layout, spacing, colour, type, copy, price field, provider, variant, filter, target
  size, breakpoint, dialog or offer. It edits a request predicate. R26 is satisfied by
  the commit body and the recorded evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio, with the dev server running so
the MSW service worker is registered. Reading the diff and a green unit test are
neither of them a browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-51-AC01** Before any edit, confirm the page `e2e/network-isolation.spec.ts`
      exercises renders cleanly. **FIX-62** (decision D19 item 1) deletes the `/canary`
      route this criterion originally re-measured, so open `http://localhost:4200/` and
      record what renders: `[data-testid="hero-section"]`
      (`src/app/features/home/hero.html:2`) must be present. `/` is declared before the
      `'**'` wildcard in `src/app/app.routes.ts` (`path: ''` at `:109`, `path: '**'` at
      `:181`, measured 2026-09-17), so it renders correctly whether or not **FIX-09**'s
      route-order fix has landed yet — unlike `/primitives` (`:194`), which stays shadowed
      by the wildcard until FIX-09 runs. If something else renders, **stop and report** —
      the analysis in this file would then be wrong.
- [ ] **FIX-51-AC02** Before the change, the hole is demonstrated. With the dev server
      running, evaluate in the page:
      `await fetch('https://example.com/collect').then(r => r.status).catch(e => String(e))`
      and record both the result and what `list_network_requests` shows. Record
      whether a request to `example.com` appears in the network log. This is the
      "before" half of AC03 and must be captured first.
- [ ] **FIX-51-AC03** After the change, the same evaluation returns **403**, the
      response body is the problem JSON from "What to change", and
      `list_network_requests` shows **no** outbound request reaching `example.com` —
      the service worker answered it. Record the status, the body and the network log.
- [ ] **FIX-51-AC04** `list_console_messages` contains the
      `[mi-bolt] blocked external request: GET https://example.com/collect` line, and
      contains **no** unexpected error beyond it. Record the full console output.
- [ ] **FIX-51-AC05** The page's own traffic is unaffected. Load `/`, `/telefonok` and
      `/telefonok/demo-one-5g`, add an item to the cart, and confirm from
      `list_network_requests` that every same-origin request still succeeds — the Vite
      chunks, `/mockServiceWorker.js`, the `/assets/products/*.webp` images — and that
      `list_console_messages` reports zero errors. Record a screenshot of the product
      page with its image rendered.
- [ ] **FIX-51-AC06** A same-origin request on a **different port** is blocked.
      Evaluate `await fetch('http://localhost:4201/assets/x.webp').then(r => r.status).catch(e => String(e))`
      and record the result; a different port is a different origin, so it must be
      403 rather than a network error. If nothing is listening on 4201, the 403 is
      still the expected answer, because the service worker responds before any
      connection is attempted.
- [ ] **FIX-51-AC07** `tests/mocks-browser-bypass.spec.ts` exists, covers all seven
      rows of the table in "What to change", and
      `npx vitest run tests/mocks-browser-bypass.spec.ts` exits 0 in **one** run.
      Inside it, the three rows the pre-change predicate answered `true` for —
      `http://localhost:4201/assets/x.webp`, `https://telemetry.example/collect` and
      `https://fonts.googleapis.com/css2?family=X` — each carry a case asserting both
      that the copied `pathnameOnlyBypass` local returns `true` and that
      `isSameOriginNonBusiness` returns `false`. That pair **is** the failing-first
      proof: there is no second run against the old code, because the old predicate is
      an anonymous arrow inside `installBusinessRouteBypass` and was never importable.
      Record the single run's output and quote the three cases' names.
- [ ] **FIX-51-AC08** `git diff --name-only` for the **Part 1** commit lists
      `src/mocks/browser.ts` and the new spec file, and nothing else; for the
      **Part 2** commit it lists `src/core/bootstrap-demo.ts` and `src/main.ts`, and
      nothing else. Neither lists `src/app/app.routes.ts`, `src/mocks/node.ts`,
      `tests/contract/operation-matrix.spec.ts` or any file under `docs/`.
- [ ] **FIX-51-AC09** `npm run build` exits 0 and `npm run test` exits
      0, after each of the two commits.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/mocks-browser-bypass.spec.ts` instead.
- [ ] **FIX-51-AC10** The commit bodies record: in Part 1, the re-measured cause of
      `e2e/network-isolation.spec.ts`'s failure from AC01 and that **FIX-09** owns it,
      and the before-and-after network logs from AC02 and AC03; in Part 2, that the
      rename carries out decision **D10** against `docs/tasks/T05.md:29` under **D1**,
      that the discarded return value had no consumer (quote AC11's greps), and which
      order this task and **FIX-12** landed in.
- [ ] **FIX-51-AC11** Part 2's rename is complete and bounded.
      `grep -rn "prepareMocks" src tests e2e scripts` returns nothing and exits 1;
      `grep -rn "startMocks" src` lists `src/core/bootstrap-demo.ts` and
      `src/main.ts` only; `grep -n "export async function startMocks(): Promise<void>" src/core/bootstrap-demo.ts`
      matches, so the declared type is `void` and not `Promise<string>`; and
      `grep -n "getPreparedScenario\|resetPreparedScenarioForTests" src/core/bootstrap-demo.ts`
      still finds both, unrenamed. Record all four outputs.
- [ ] **FIX-51-AC12** After Part 2, the application still boots and MSW still
      intercepts: repeat AC05 in the browser, with `list_console_messages` reporting
      zero errors and the product image rendered. A rename that compiles is not a
      rename that boots, and `.claude/rules/browser-verification.md` makes the green
      build and the passing greps in AC11 explicitly not verification of this.

## Commit

**This task is two commits, Part 1 then Part 2, and that is deliberate.** The rest of
this package is one task to one commit; here decision **D10** landed a second,
unrelated subject on the task that had reserved the question, and
`.claude/rules/session-lifecycle.md` ("One commit, one logical change") settles what
happens then: a commit a reviewer cannot describe in one sentence is two commits. A
cross-origin block in the mock layer and a bootstrap entry point's rename share no
file and no reason. Stage each by explicit path and do not let one carry the other's
files.

Do not bundle either commit with another FIX task — in particular not with
**FIX-10**, which edits `src/mocks/browser.ts` for a different reason and must stay
separately reviewable, not with **FIX-13**, which owns the `node.ts` deletion this
finding was originally attached to, and not with **FIX-12**, which edits the same two
lines of `src/main.ts` that Part 2 touches. Do not commit either part until every
acceptance criterion that applies to it has passed and its output is recorded.

Suggested subject lines, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: block cross-origin requests instead of passing them through MSW
refactor: rename prepareMocks to startMocks per docs/tasks/T05.md
```
