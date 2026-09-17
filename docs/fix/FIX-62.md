# FIX-62 — Delete the coverage-canary subsystem D19 removed

Status: PLANNED — not executed.
Severity: major
Source: Decision **D19** item 1 (closing `D17-DESIGN.md` §4.4), and decision **D20** items
2 and 3, which route two further consequences of the same deletion to this task (the E004
scenario entry and the open-socket assertion move); recorded as unowned in `FIX-09`'s "Why
this is wrong" and "Out of scope" sections — *"No FIX number in this package is confirmed
to own that deletion"* — and in `FIX-47`'s §105 note — *"None of those files or that route
is this task's to delete"*. This task is the owner both named and neither took.

## Why this is wrong

`docs/spec/testing.md` §1 used to make independent E2E source coverage a headline
requirement, on top of the unit coverage gate **FIX-08** already turns on. The user
decided to drop it: *"Menjen, a funkcionális suite marad"* ("let it go, the functional
suite stays"), decision **D19** item 1. That is a decision about a *requirement*, not
about one script — and the apparatus built to prove it reaches eleven files across four
directories, plus one route object inside a twelfth file that also serves other routes,
all eleven of which exist only because that requirement existed:

- `src/app/coverage-canary/` — five files (`canary-page.ts`, `canary-page.html`,
  `canary-page.scss`, `canary.ts`, `unused.ts`) and the `/canary` route in
  `src/app/app.routes.ts` that serves them — a demo-shop route shipped for no purpose
  but to be measured.
- `e2e/coverage-canary.spec.ts` and `e2e/coverage-canary-negative.spec.ts` — the
  Playwright specs that drove the route to prove per-branch E2E coverage.
- `tests/coverage-canary.spec.ts` and `tests/coverage-canary-negative.spec.ts` — their
  unit-level twins, proving the same branches through Vitest.
- `e2e/fixtures/coverage.ts` and `e2e/fixtures/test.ts` — the Playwright fixture layer
  that collected v8 coverage per navigation and exposed the `coverage` fixture the two
  E2E specs above consumed.

It has never produced output: `coverage/e2e/coverage-final.json` has never existed
(`BASELINE.md:13`). Playwright ships no coverage gate of its own; `docs/spec/testing.md:55`
concedes the Coverage API is Chromium-only, and `:57` pre-authorises building a *second*
bespoke pipeline if the first one fails to map correctly. It is the largest single
purpose-built subsystem in the repository, built to prove a requirement the user has now
removed, and every file in the list above exists for no other reason.

**This is not a small edit inside a file another task owns.** `FIX-09` (the wildcard
route-order fix) found it while explaining why twelve of its forty-one baseline Playwright
failures are not its to fix, and said so rather than deleting the directory itself, because
"deleting a directory this task does not otherwise touch is a wider change than this
task's own subject." `FIX-47` (the npm-script prune) found the same eleven files while
explaining why `coverage:e2e:check` and `test:e2e:coverage` disappear, and said the same
thing. Both are right that it is not theirs. It is this task's.

**The three-browser functional E2E suite is untouched, and decision D12 stands.** Nothing
here removes a Playwright project, a browser, or a scenario that exercises a real user
journey. Only the bespoke coverage-collection layer and the route it existed to measure
go.

**Decision D20 routes two further consequences of this same deletion to this task.** Item
2: the specification's own scenario catalogue still names the subsystem as scenario E004,
and the user chose to delete that entry rather than leave it describing something that no
longer exists — *"Az E004 is törlődik"* ("E004 is deleted too"). Item 3: `docs/spec/testing.md:53`
and T02-AC05 require that no WebSocket stays open and no HTTP request stays pending at the
end of a run, and the only proof of that half lived in the deleted
`e2e/coverage-canary.spec.ts`, through the deleted `e2e/fixtures/coverage.ts`'s
`__miboltOpenSockets` and `__miboltPendingRequests` bindings — the user chose to move the
two assertions and the two helpers they need into `e2e/network-isolation.spec.ts` rather
than drop the proof — *"Átköltöztetjük a megmaradó tesztbe"* ("we move them into the test
that survives"). **No specification line changes for item 3; only where the proof lives.**

## Evidence

Every path below was read from disk in this session, on commit `db6d295`.

### The five files under `src/app/coverage-canary/`

```text
$ ls -la src/app/coverage-canary/
canary-page.html   canary-page.scss   canary-page.ts   canary.ts   unused.ts
```

`canary-page.ts` is a standalone Angular component that reads a `branch` query param and
renders `A` or `B` via `branch()` from `canary.ts`. `unused.ts` is deliberately unimported
dead code — its own header comment says so: *"deliberately not referenced by any spec,
component or bootstrap so the runtime manifest contains it but the unit/E2E coverage
reports have zero execution for it."* Both exist only to be measured by the gate D19
removes.

### The route, `src/app/app.routes.ts`

The exported `routes` array's last element today:

```ts
  {
    path: 'canary',
    loadComponent: () =>
      import('./coverage-canary/canary-page').then((m) => m.CoverageCanaryPage),
    title: 'MiBolt — coverage canary',
  },
];
```

This is a dynamic `loadComponent` import — there is no static top-of-file `import` of
`CoverageCanaryPage` to remove separately. Deleting this one route object is the whole of
the routing change.

### The four spec files, all of which import only `branch`/`defaultBranch` from `canary.ts`

```text
$ grep -n "^import" e2e/coverage-canary.spec.ts e2e/coverage-canary-negative.spec.ts \
    tests/coverage-canary.spec.ts tests/coverage-canary-negative.spec.ts
e2e/coverage-canary.spec.ts:12:import { expect } from '@playwright/test';
e2e/coverage-canary.spec.ts:14:import { test } from './fixtures/test';
e2e/coverage-canary-negative.spec.ts:11:import { expect } from '@playwright/test';
e2e/coverage-canary-negative.spec.ts:13:import { test } from './fixtures/test';
tests/coverage-canary.spec.ts:11:import { describe, expect, it } from 'vitest';
tests/coverage-canary.spec.ts:13:import { branch, defaultBranch } from '../src/app/coverage-canary/canary';
tests/coverage-canary-negative.spec.ts:11:import { describe, expect, it } from 'vitest';
tests/coverage-canary-negative.spec.ts:13:import { branch, defaultBranch } from '../src/app/coverage-canary/canary';
```

No other spec file imports `src/app/coverage-canary/` or `../src/app/coverage-canary/`.
`grep -rln "coverage-canary\|CoverageCanaryPage" --include="*.ts" --include="*.html" src/
tests/ e2e/` returns exactly six files: `e2e/coverage-canary-negative.spec.ts`,
`src/app/app.routes.ts` (the route's own `loadComponent` string), `tests/coverage-canary.spec.ts`,
`tests/coverage-canary-negative.spec.ts`, and `src/app/coverage-canary/canary-page.ts` and
`unused.ts` (their own class name and directory-name doc comment). This is a text grep, not
an import graph, so it does not list every file touched by this deletion by itself — the
four spec files' own `import` lines, quoted above, are what establish that.

### The two fixtures, and who else reaches them

```text
$ grep -rln "fixtures/test\|fixtures/coverage" e2e/
e2e/coverage-canary-negative.spec.ts
e2e/coverage-canary.spec.ts
e2e/network-isolation.spec.ts
e2e/fixtures/test.ts
e2e/fixtures/coverage.ts
```

`e2e/fixtures/test.ts` extends the base Playwright `test` with two fixtures: `scenario`
(a deterministic `ScenarioDescriptor`, used by titlePath hashing) and `coverage` (from
`e2e/fixtures/coverage.ts`, the v8-coverage collector). `e2e/fixtures/coverage.ts` also
exposes two page bindings, `__miboltOpenSockets` and `__miboltPendingRequests`
(`e2e/fixtures/coverage.ts:228,231`).
`grep -n "__miboltOpenSockets\|__miboltPendingRequests" -r src/ e2e/ tests/` returns six
hits across exactly two files: the two `exposeBinding(...)` calls in
`e2e/fixtures/coverage.ts` that define them, and four reads inside
`e2e/coverage-canary.spec.ts:57,59,72,74`. No other file reads either binding. Deleting
both fixture files is safe for every consumer **except** `e2e/network-isolation.spec.ts`
— see "What to change" below, which is the one file this task edits rather than deletes.

### `e2e/network-isolation.spec.ts` does not use `scenario` or `coverage`

```ts
import { expect, test as base } from '@playwright/test';

import { test as miboltTest } from './fixtures/test';

base.describe('T02-AC05 E2E network isolation', () => {
  miboltTest(
    'unhandled /api/v1 business route surfaces in the request log',
    async ({ page }) => {
      …
```

Both of its test bodies destructure only `{ page }` — neither `scenario` nor `coverage` is
read anywhere in the file (`grep -n "scenario\|coverage" e2e/network-isolation.spec.ts`
matches only the header comment, not a fixture use). It imports the extended `test` purely
to reach `page`, which the base Playwright `test` already provides. So deleting
`e2e/fixtures/test.ts` does not need to leave this spec without a fixture it actually
uses — it needs the import corrected, not preserved.

Both of its two test cases navigate to `/canary?branch=true` and wait for
`page.getByTestId('canary-branch')` purely to have *a* page loaded with MSW registered
before firing the deliberate `/api/v1/this-route-does-not-exist` and
`https://example.com/x` calls. Neither call is scoped to the canary route or its testid:

```ts
      const apiCalls: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/v1/this-route-does-not-exist')) {
          apiCalls.push(req.url());
        }
      });
      await page.goto('/canary?branch=true');
      await expect(page.getByTestId('canary-branch')).toHaveText('A');
      …
      expect(apiCalls.length).toBeGreaterThan(0);
      expect(result.ok).toBe(false);
```

Everything the assertion actually checks — that the deliberate calls surface in the
network log and that both fail — is independent of which route is loaded first.

### `docs/tasks/T02.md`'s `## Files` section still names three of the deleted files

```text
$ sed -n '17,26p' docs/tasks/T02.md
## Files

- `tests/setup-msw.ts`
- `e2e/fixtures/test.ts`
- `e2e/fixtures/coverage.ts`
- `scripts/check-coverage.mjs`
- `scripts/runtime-manifest.mjs`
- `playwright.config.ts`
- `tests/coverage-canary.spec.ts`
```

`scripts/check-coverage.mjs` and `scripts/runtime-manifest.mjs` (lines 22-23) are already
**FIX-08**'s to remove from this same list — see `FIX-08.md`, "What to change" §2. The
other three deleted paths on this list — `e2e/fixtures/test.ts`, `e2e/fixtures/coverage.ts`
and `tests/coverage-canary.spec.ts` — are not named in any other FIX file's file list edit,
so this task removes them in the same commit, the same way FIX-08 removes its two. Their
mirrors: `docs/tasks/tasks.json:122-123,127` (inside the `T02` object's `files` array,
which opens at `tasks.json:120`), and `docs/index.html` in three rendered locations —
measured today at `:2700` (the `data-search` JSON attribute on the T02 `<details>` block),
`:2703` (the compact `<div class="file-list">`) and `:2718`/`:2719`/`:2723` (the full `<ul>`
inside the expanded task packet). Locate them by `grep -o` pattern rather than trusting
these line numbers once FIX-08 has landed and shifted them:

```bash
grep -o '.\{40\}e2e/fixtures/test\.ts.\{40\}' docs/index.html
grep -o '.\{40\}e2e/fixtures/coverage\.ts.\{40\}' docs/index.html
grep -o '.\{40\}tests/coverage-canary\.spec\.ts.\{40\}' docs/index.html
```

### The E004 scenario entry, in all three places — decision D20 item 2

`docs/spec/test-scenarios.md:10`, verbatim, today:

```text
|E004|coverage|coverage-canary|Execute true branch only|Both independent coverage gates fail; completing false branch makes both pass.|
```

`docs/tasks/test-scenarios.json:62-79`, verbatim, today — the whole `E004` object inside
the top-level array:

```json
  {
    "id": "E004",
    "group": "coverage",
    "title": "Unvisited branch canary",
    "scenario": "coverage-canary",
    "action": "Execute true branch only",
    "expected": "Both independent coverage gates fail; completing false branch makes both pass.",
    "layers": [
      "unit-or-gate",
      "integration-or-e2e"
    ],
    "optional": false,
    "status": "specified-not-run",
    "tasks": [
      "T02",
      "T27"
    ]
  },
```

`docs/index.html:4310-4316`, verbatim, today — the rendered `<tr>` for the same row:

```html
<tr>
<td>E004</td>
<td>coverage</td>
<td>coverage-canary</td>
<td>Execute true branch only</td>
<td>Both independent coverage gates fail; completing false branch makes both pass.</td>
</tr>
```

All three are the same catalogue entry, mirrored three times. No other file in the
repository names `E004` — `grep -rn "E004" docs/` (measured 2026-09-17, excluding
`docs/fix/`) returns exactly these three lines. The IDs in this catalogue are stable
identifiers, not a contiguous sequence renumbered on deletion: `E003` is followed by `E005`
today with no gap-filling expected, so removing `E004` leaves `E003` and `E005` as they are
— do not renumber anything after it.

### T02-AC05's two proofs, and which one this task must not lose — decision D20 item 3

`docs/spec/testing.md:53`, verbatim, today:

> Closed-world network checks combine MSW's unhandled/response events, expected operation
> ownership, browser CSP and isolated runner network namespace/firewall (dependencies and
> browser executables provisioned earlier). Unknown business endpoints fail; same-origin
> static app chunks/images/worker are explicitly allowlisted. No external DNS/HTTP business
> traffic is allowed. A deliberate negative test proves egress blocks. Playwright request
> observation alone is not sufficient evidence for SW-owned traffic.

`docs/tasks/T02.md:49`, verbatim, today — **T02-AC05**:

> - [ ] **T02-AC05** Deliberately issue an unhandled /api/v1 request and an external fetch;
>   both cause test failure. Assert MSW request ownership and no open sockets; route
>   interception alone is insufficient for SW-owned traffic.

"MSW request ownership" is proved today by `e2e/network-isolation.spec.ts`, which survives
this task unchanged in that respect (step 5 below only repairs its import). "No open
sockets" — the other half of the same criterion — was proved only by
`e2e/coverage-canary.spec.ts:49-77`, two tests read here verbatim, both deleted by step 3:

```ts
  test('no pending HTTP requests after navigation completes', async ({
    page,
  }) => {
    await page.goto('/canary?branch=true');
    await expect(page.getByTestId('canary-branch')).toHaveText('A');
    const pending = await page.evaluate(() =>
      (
        window as unknown as {
          __miboltPendingRequests?: () => Array<[string, string]>;
        }
      ).__miboltPendingRequests?.() ?? [],
    );
    expect(pending).toEqual([]);
  });

  test('no open WebSockets after navigation completes', async ({
    page,
  }) => {
    await page.goto('/canary?branch=true');
    await expect(page.getByTestId('canary-branch')).toHaveText('A');
    const open = await page.evaluate(() =>
      (
        window as unknown as {
          __miboltOpenSockets?: () => string[];
        }
      ).__miboltOpenSockets?.() ?? [],
    );
    expect(open).toEqual([]);
  });
```

Both bindings they read are exposed by `e2e/fixtures/coverage.ts:228-233`, also deleted by
step 4, verbatim:

```ts
  await context.exposeBinding('__miboltOpenSockets', () =>
    Array.from(openSockets),
  );
  await context.exposeBinding('__miboltPendingRequests', () =>
    Array.from(pendingRequests.entries()),
  );
```

and the two event-listener blocks that build `openSockets` and `pendingRequests`,
`e2e/fixtures/coverage.ts:191-226`. Step 5 below carries all four — the two assertions and
the two tracking mechanisms behind the two bindings — into `e2e/network-isolation.spec.ts`,
adapted from `context`-level, multi-page tracking (the coverage fixture serves every
Playwright test in the suite) to the single `page` fixture `network-isolation.spec.ts`
already uses, since no specification line requires the multi-page form, only the assertion
and its evidence.

### The three stale comments — decision D20 item 3

`tests/setup-msw.ts:2`, verbatim, today (inside the file's opening doc comment):

```text
 * MSW unit setup — boots the Node service worker for the canary and
```

`vitest.config.ts:3`, verbatim, today (inside the file's opening comment block):

```text
// Runs the contract and canary specs under tests/**. The
```

`src/mocks/browser.ts:8`, verbatim, today (inside the file's opening doc comment):

```text
 * "open sockets" check in `e2e/fixtures/coverage.ts` to prove the
```

All three describe the subsystem step 1 through step 4 delete. **The `vitest.config.ts:3`
edit collides with FIX-04, not FIX-08.** `docs/fix/FIX-04.md`, "What to change" §1, replaces
the entire file — all 534 lines, header included — with a 14-line file that has no mention
of "canary" anywhere (`docs/fix/FIX-04.md:244-268`); `docs/fix/FIX-08.md:162-164` confirms
this from the other side: *"FIX-04's rewrite deletes both the setting and the comment"*,
speaking of the adjacent `all: false` line and its comment, not of an edit FIX-08 itself
makes. FIX-08's own "What to change" section has no step that touches `vitest.config.ts` at
all (`grep -n "^### " docs/fix/FIX-08.md` lists three numbered steps: `angular.json`, the
two script deletions, and the T02-AC06 CI clause). **If FIX-04 lands before this task,
`vitest.config.ts:3` no longer exists and step 8 below is a no-op for that one file** —
confirm with `grep -c canary vitest.config.ts` before editing (`0` if FIX-04 landed first,
`1` if not); do not treat a `0` as a defect. If FIX-04 has not landed yet, edit the line as
quoted above.

## What to change

### 1. Delete five files and the directory they leave empty

```bash
git rm src/app/coverage-canary/canary-page.ts src/app/coverage-canary/canary-page.html \
  src/app/coverage-canary/canary-page.scss src/app/coverage-canary/canary.ts \
  src/app/coverage-canary/unused.ts
```

`git rm` on the last file in a directory leaves the directory itself absent from the
working tree; do not `mkdir` it back or leave an empty directory some other way.

### 2. Delete the route in `src/app/app.routes.ts`

Remove the `path: 'canary'` route object entirely — the six lines quoted in "Evidence"
above (currently `:201-206`, from the opening `{` through the closing `},`); the array's
closing `];` stays as its terminator.

**This task's landing order against FIX-09 is not fixed, and either order works.** FIX-09
moves the `'primitives'` block ahead of the wildcard and, if the `'canary'` block is still
present when FIX-09 runs, moves it too — FIX-09's own text says so: *"If the `'canary'`
block … is still present when this task runs, move it too … If it has already been
deleted, this step moves only `'primitives'`."* So:

- **If FIX-62 lands first**, the `'canary'` block is gone before FIX-09 runs, and FIX-09
  moves only `'primitives'`.
- **If FIX-09 lands first**, the `'canary'` block has already been moved ahead of the
  wildcard (to keep the array's structure), and this task deletes it from its new
  position instead of its old one — the same six lines, wherever they now sit in the
  file.

Do not invent a hard dependency between the two tasks by requiring one to land first;
confirm the block's current position with `grep -n "path: 'canary'" src/app/app.routes.ts`
before editing, rather than assuming line `:202`.

### 3. Delete the four spec files

```bash
git rm e2e/coverage-canary.spec.ts e2e/coverage-canary-negative.spec.ts \
  tests/coverage-canary.spec.ts tests/coverage-canary-negative.spec.ts
```

### 4. Delete the two fixture files

```bash
git rm e2e/fixtures/coverage.ts e2e/fixtures/test.ts
```

Do this **after** step 5 below, or in the same commit, never before it — deleting these
first leaves `e2e/network-isolation.spec.ts`'s import broken until the retarget lands.

### 5. Retarget `e2e/network-isolation.spec.ts` — repair, not delete, and carry the open-socket proof into it (decision D20 item 3)

**Route: `/`, the home page.** It is declared first in `src/app/app.routes.ts`
(`path: ''`), before the `'**'` wildcard, so it renders correctly regardless of whether
`FIX-09`'s route-order fix has landed yet — unlike `/primitives`, which is shadowed by the
wildcard until FIX-09 runs, and unlike `/penztar/*`, which redirects to the empty-cart
guard until FIX-10 lands. It needs nothing from either task. Its root element carries
`data-testid="hero-section"` (`src/app/features/home/hero.html:2`).

**Import: drop `./fixtures/test` entirely and use the already-imported `base`.** The file
already imports `test as base` from `@playwright/test` and calls `base.describe(...)`; the
extended import existed only to reach `page`, which `base` already provides. Replace both
occurrences of `miboltTest(` with `base(` and delete the `import { test as miboltTest }
from './fixtures/test';` line and the blank line after it.

**Assertion: preserve the subject — that a deliberate business-route call and a deliberate
external fetch both fail to reach the network — replacing only the readiness wait.**

**Two more test cases, moved rather than dropped.** `e2e/coverage-canary.spec.ts`'s "no
pending HTTP requests after navigation completes" and "no open WebSockets after navigation
completes" tests (quoted in Evidence above) are T02-AC05's other half and this task deletes
their file in step 3. Add them as two more test cases in the same `base.describe(...)`
block, with **no change to what either assertion checks** — `expect(pending).toEqual([])`
and `expect(open).toEqual([])` stay exactly as they read in Evidence. What changes is where
the two bindings they read come from: the deleted coverage fixture exposed them on
`context` for every test in the suite, tracking every page a multi-page context might open;
these two new tests instead expose their own copy on the `context` fixture `base` already
provides, scoped to the one test, and track only the single `page` fixture already in use —
`network-isolation.spec.ts` never opens a second page, so the per-page dispatch
`e2e/fixtures/coverage.ts:197-226` used (`context.on('page', (page) => { … })`) is
unnecessary here and is not carried over; the listener registrations inside it
(`page.on('websocket', …)`, `page.on('request', …)`, `page.on('requestfinished', …)`,
`page.on('requestfailed', …)`) are, attached directly to the `page` fixture. Navigate to
`/` and wait for `hero-section`, the same readiness wait the other two tests in this file
use, before reading either binding.

Full replacement file:

```ts
/**
 * E2E network-isolation proof — T02-AC05.
 *
 * The page deliberately issues an unhandled `/api/v1/...` request
 * and an external `fetch('https://example.com/x')`. Both calls MUST
 * surface in the network log, and the MSW worker must fail the
 * fetch on the unhandled business route.
 *
 * The two tests below that assert "no pending HTTP requests" and "no
 * open WebSockets" are T02-AC05's other half, moved here from the
 * deleted `e2e/coverage-canary.spec.ts` under decision D20 item 3:
 * the requirement is unchanged, only where it is proved moved. The
 * `__miboltOpenSockets` / `__miboltPendingRequests` page bindings
 * they read were exposed by the deleted `e2e/fixtures/coverage.ts`
 * on every test's `context`, for every page it might open; each test
 * below exposes its own copy, scoped to itself, on the single `page`
 * fixture this file already uses.
 */
import { expect, test as base } from '@playwright/test';

base.describe('T02-AC05 E2E network isolation', () => {
  base(
    'unhandled /api/v1 business route surfaces in the request log',
    async ({ page }) => {
      const apiCalls: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/v1/this-route-does-not-exist')) {
          apiCalls.push(req.url());
        }
      });

      await page.goto('/');
      await expect(page.getByTestId('hero-section')).toBeVisible();

      const result = await page.evaluate(async () => {
        try {
          await fetch('/api/v1/this-route-does-not-exist');
          return { ok: true, status: 0 };
        } catch (err) {
          return { ok: false, message: String(err) };
        }
      });
      // MSW's onUnhandledRequest='error' rejects the request; the
      // page sees a network error. We assert (a) the attempt was
      // observed by the page-level request listener and (b) the
      // fetch itself was rejected so the network was not allowed.
      expect(apiCalls.length).toBeGreaterThan(0);
      expect(result.ok).toBe(false);
    },
  );

  base(
    'external fetch is recorded by the page-level request listener',
    async ({ page }) => {
      const external: string[] = [];
      page.on('request', (req) => {
        if (req.url().startsWith('https://example.com/')) {
          external.push(req.url());
        }
      });
      await page.goto('/');
      await expect(page.getByTestId('hero-section')).toBeVisible();
      // The page cannot actually reach example.com (the runner
      // network is isolated), but the attempt MUST show up in the
      // request log.
      const result = await page.evaluate(async () => {
        try {
          await fetch('https://example.com/x');
          return 'fetched';
        } catch {
          return 'failed';
        }
      });
      // The page cannot actually reach example.com (the runner
      // network is isolated), but the attempt MUST show up in the
      // request log AND the fetch must end with 'failed' so the
      // test proves no outbound traffic succeeded.
      expect(external.length).toBeGreaterThan(0);
      expect(result).toBe('failed');
    },
  );

  base(
    'no pending HTTP requests after navigation completes',
    async ({ page, context }) => {
      const pendingRequests = new Map<
        string,
        { method: string; count: number }
      >();
      const settle = (req: { url(): string }): void => {
        const existing = pendingRequests.get(req.url());
        if (!existing) return;
        existing.count -= 1;
        if (existing.count <= 0) pendingRequests.delete(req.url());
      };
      page.on('request', (req) => {
        const existing = pendingRequests.get(req.url());
        if (existing) {
          existing.count += 1;
        } else {
          pendingRequests.set(req.url(), { method: req.method(), count: 1 });
        }
      });
      page.on('requestfinished', settle);
      page.on('requestfailed', settle);
      await context.exposeBinding('__miboltPendingRequests', () =>
        Array.from(pendingRequests.entries()),
      );

      await page.goto('/');
      await expect(page.getByTestId('hero-section')).toBeVisible();

      const pending = await page.evaluate(() =>
        (
          window as unknown as {
            __miboltPendingRequests?: () => Array<
              [string, { method: string; count: number }]
            >;
          }
        ).__miboltPendingRequests?.() ?? [],
      );
      expect(pending).toEqual([]);
    },
  );

  base(
    'no open WebSockets after navigation completes',
    async ({ page, context }) => {
      const openSockets = new Set<string>();
      page.on('websocket', (ws) => {
        const url = ws.url();
        openSockets.add(url);
        ws.on('close', () => openSockets.delete(url));
      });
      await context.exposeBinding('__miboltOpenSockets', () =>
        Array.from(openSockets),
      );

      await page.goto('/');
      await expect(page.getByTestId('hero-section')).toBeVisible();

      const open = await page.evaluate(() =>
        (
          window as unknown as {
            __miboltOpenSockets?: () => string[];
          }
        ).__miboltOpenSockets?.() ?? [],
      );
      expect(open).toEqual([]);
    },
  );
});
```

Nothing about the first two tests changes: both their titles and both assertions' subject
are untouched. The two moved tests keep the exact assertion each had in
`e2e/coverage-canary.spec.ts` (`expect(pending).toEqual([])`,
`expect(open).toEqual([])`) and the exact title each had there; only the navigation target
(`/` instead of `/canary?branch=true`, since the canary route is gone) and the binding's
scope (exposed per-test on `context` here, instead of once per suite by a shared fixture)
change. `__miboltPendingRequests`'s return type keeps the original fixture's `Array<[string,
{ method: string; count: number }]>` shape — the source spec typed it more loosely as
`Array<[string, string]>` (Evidence, above), but since both tests only ever assert the array
is empty, no consumer reads a element's shape and the type carried here is the accurate one
for what `pendingRequests.entries()` actually returns.

### 6. Correct `docs/tasks/T02.md`, `docs/tasks/tasks.json` and `docs/index.html`

Remove the three lines named in "Evidence" from `docs/tasks/T02.md`'s `## Files` section
(`` - `e2e/fixtures/test.ts` ``, `` - `e2e/fixtures/coverage.ts` ``, `` - `tests/coverage-canary.spec.ts` ``),
the three matching entries from the `T02` object's `files` array in
`docs/tasks/tasks.json`, and the same three strings from `docs/index.html`'s three rendered
copies of that list (locate them with the `grep -o` commands above, not by line number).
**If FIX-08 has already landed, `scripts/check-coverage.mjs` and
`scripts/runtime-manifest.mjs` will already be gone from all three files** — leave the
remaining lines (`tests/setup-msw.ts`, `playwright.config.ts`) untouched either way. Do not
touch any `Txx-ACyy` acceptance criterion in any of the three files; that is not this
edit's concern.

### 7. Delete scenario E004 from the specification (decision D20 item 2)

This is a specification edit. **It is allowed here because the user decided it directly**
— *"Az E004 is törlődik"* ("E004 is deleted too") — the same standing **D11**, **D14**,
**D16**, **D17** and **D19** already established for this package: the user, not the
executor, moves a specification line. **D1** is not weakened by this edit and no other task
in this package may cite it as a precedent for editing a specification line the user has
not spoken to.

Remove the single table row quoted in Evidence from `docs/spec/test-scenarios.md`:

```text
|E004|coverage|coverage-canary|Execute true branch only|Both independent coverage gates fail; completing false branch makes both pass.|
```

Remove the single JSON object quoted in Evidence, lines 62-79, from the top-level array in
`docs/tasks/test-scenarios.json` — the `{` at `:62` through the matching `},` at `:79`,
inclusive. Confirm the object's boundaries with
`sed -n '60,82p' docs/tasks/test-scenarios.json` before deleting rather than trusting these
line numbers if anything earlier in the file has already shifted them. The array's own
enclosing `[` and `]` are untouched, and no other object in the array is renumbered,
reordered or otherwise edited.

Remove the single `<tr>...</tr>` block quoted in Evidence, lines 4310-4316, from
`docs/index.html`. Locate it by content rather than by line number if FIX-08 or anything
else editing this file has landed first:
`grep -n '<td>E004</td>' docs/index.html` must find the row; delete from the `<tr>`
immediately before that line through its matching `</tr>`.

### 8. Correct the three stale comments (decision D20 item 3)

**FIX-06** edits this same file at `:18-21`, `:23-30`, `:34`/`:38` and deletes `:57-130`;
this task's one-line-for-one-line edit at `:2` preserves the line count FIX-06's absolute
`:57-130` deletion depends on, so either order is safe.

Replace `tests/setup-msw.ts:2`:

```text
 * MSW unit setup — boots the Node service worker for the canary and
```

with:

```text
 * MSW unit setup — boots the Node service worker for the
```

joining it with `:3`'s existing `* contract-layer test runs.` unchanged, so the sentence
reads "boots the Node service worker for the contract-layer test runs." Do not touch any
other line of this file's header; this task's only edit here is the one word "canary and"
removed from this one sentence.

Replace `vitest.config.ts:3`, **only if it still exists** — see the collision note in
Evidence, and run `grep -c canary vitest.config.ts` first:

```text
// Runs the contract and canary specs under tests/**. The
```

with:

```text
// Runs the contract specs under tests/**. The
```

Leave every other line of the header comment block untouched. If FIX-04 has already landed
and `grep -c canary vitest.config.ts` prints `0`, this half of step 8 is already satisfied
by FIX-04's own rewrite and there is nothing to edit; record that in the commit body rather
than editing a file that no longer has anything to fix.

Replace `src/mocks/browser.ts:8`:

```text
 * "open sockets" check in `e2e/fixtures/coverage.ts` to prove the
```

with:

```text
 * "open sockets" check, now in `e2e/network-isolation.spec.ts`, to prove the
```

Leave `:1-7` and `:9-20` — the rest of the module header — untouched; this changes only
which file the comment points to, not what it claims about the isolation gate. This is the
one line of this file this task edits; `FIX-10` and `FIX-51` already collide over other
parts of `src/mocks/browser.ts` (README's one-file collision table), and this task does not
add a third editor to any line but this one.

## Out of scope

- **`docs/spec/testing.md:55-57` (the E2E-coverage paragraphs and the "T02 is a HARD
  prerequisite" paragraph) and the two `package.json` script names,
  `coverage:e2e:check`/`test:e2e:coverage`.** **FIX-47** already owns both, confirmed by
  its own text: *"the two `package.json` names and the two `testing.md` paragraphs are"*
  its to delete, *"none of those files or that route"* is. Do not edit `testing.md` or
  `package.json` here.
- **`scripts/check-coverage.mjs`'s `--e2e` half and the rest of that script.** **FIX-08**
  deletes the whole file (its own coverage-driven, not route-driven). Do not touch it.
- **`docs/spec/testing.md:53`'s wording and T02-AC05's own text.** Decision D20 item 3
  moves the "no open sockets" **proof**, not the requirement — neither line changes. See
  step 5.
- **`FIX-06.md` rows 15-16**, which plan to `git mv` `tests/coverage-canary.spec.ts` and
  `tests/coverage-canary-negative.spec.ts` into `src/app/coverage-canary/` rather than
  delete them, and `FIX-06.md:392-394`'s note that `src/app/coverage-canary/` "is a
  required deliverable … and is correctly placed." Both predate decision **D19** and are
  now wrong. **This task does not edit `FIX-06.md`** — it is not this task's file — but
  landing this task before FIX-06 avoids the collision: FIX-06's `git mv` on a path this
  task has already deleted is a no-op FIX-06's executor discovers immediately, rather than
  FIX-06 first relocating two files this task then has to find and delete at a different
  path. See "Where this sits in the stream."
- **`FIX-51-AC01`**, which instructs its executor to open `/canary?branch=true` to
  re-confirm the route-order cause of `e2e/network-isolation.spec.ts`'s pre-fix failure.
  That criterion is about a defect `FIX-09` owns and predates this task's route deletion;
  it is not this task's to rewrite. See "Where this sits in the stream."
- **Any line of `tests/setup-msw.ts`, `vitest.config.ts` or `src/mocks/browser.ts` other
  than the one this task's step 8 names in each.** `tests/setup-msw.ts` is shared across
  many tasks and only its `:2` comment is this task's; `vitest.config.ts` is otherwise
  **FIX-04**'s file; `src/mocks/browser.ts` otherwise belongs to **FIX-10** and **FIX-51**
  (README's one-file collision table), and this task does not add a fourth editor to
  anything but the one line step 8 names.
- **`src/mocks/node.ts`.** Its own header comment calls itself "the entry point used by the
  canary unit … server," but the module and the comment are **FIX-13**'s to delete
  entirely, not this task's — see `FIX-08.md`'s own note pointing the same file at FIX-13.
- **Any file under `src/app/features/`, `src/app/shared/`, `src/mocks/`, or any spec other
  than the five named above.** This task's whole file list is: `src/app/coverage-canary/`
  (deleted), `src/app/app.routes.ts` (one route removed), `e2e/network-isolation.spec.ts`
  (retargeted and extended), `tests/setup-msw.ts`, `vitest.config.ts` (conditionally),
  `src/mocks/browser.ts` (one comment line each), `docs/spec/test-scenarios.md`,
  `docs/tasks/test-scenarios.json`, `docs/tasks/T02.md`, `docs/tasks/tasks.json` and
  `docs/index.html`. Nothing else.
- **The remaining 12 baseline Playwright failures this deletion resolves.** They are
  counted inside **FIX-09**'s "group 1" (`e2e/coverage-canary.spec.ts` (3),
  `e2e/coverage-canary-negative.spec.ts` (1) and `e2e/network-isolation.spec.ts` (2), each
  × 2 projects = 12) and FIX-09 already explains that group disappears once this task
  lands, whichever order the two run in. This task does not re-run the full Playwright
  suite to prove that count; FIX-09-AC04 already accounts for it.

## How to verify

From the repository root, npm only. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

1. `ls src/app/coverage-canary/ e2e/coverage-canary.spec.ts \
   e2e/coverage-canary-negative.spec.ts tests/coverage-canary.spec.ts \
   tests/coverage-canary-negative.spec.ts e2e/fixtures/coverage.ts e2e/fixtures/test.ts` —
   every one must report "No such file or directory".

2. `grep -n "path: 'canary'" src/app/app.routes.ts` — must print nothing.

3. `grep -rln "coverage-canary\|CoverageCanaryPage" --include="*.ts" --include="*.html" \
   src/ tests/ e2e/` — must print nothing.

4. `grep -n "fixtures/test\|fixtures/coverage" e2e/network-isolation.spec.ts` — must print
   nothing; `grep -n "base(" e2e/network-isolation.spec.ts | wc -l` must print `4` — the
   original two tests plus the two moved from `e2e/coverage-canary.spec.ts`.

5. `grep -rn "e2e/fixtures/test.ts\|e2e/fixtures/coverage.ts\|tests/coverage-canary.spec.ts" \
   docs/tasks/` — must print nothing.

6. `npx ng build --configuration e2e` — must exit **0**. There is no `build:e2e` npm
   script even though `docs/spec/testing.md:122` lists `npm run build:e2e`; this is the
   equivalent, the same substitution **FIX-09**'s own "How to verify" step 0 uses.

7. Start the static host in the background and stop it again when the check is finished:

   ```bash
   PORT=4200 MI_BOLT_E2E_STATIC_DIR=dist/mi-bolt/browser node scripts/serve-static.mjs
   ```

   `npx playwright test e2e/network-isolation.spec.ts` — must exit **0**, 8 passed (4
   tests × 2 Playwright projects). Do
   **not** run the full `npx playwright test` here: it rewrites 49 tracked screenshots
   under `e2e/design/screenshots/` and that regeneration belongs to **FIX-09**, not this
   task.

8. `npm run build` — must exit **0**.

9. `grep -c "E004" docs/spec/test-scenarios.md docs/tasks/test-scenarios.json docs/index.html`
   — every one of the three counts must be `0`.

10. `grep -n "canary" tests/setup-msw.ts src/mocks/browser.ts` — must print nothing.
    `grep -c canary vitest.config.ts` — must print `0`; if FIX-04 has not landed, this task's
    own edit is what makes it `0` (see step 8 of "What to change"), and if FIX-04 has
    already landed, FIX-04's own rewrite already made it `0` and this task records that
    rather than editing a file with nothing left to fix.

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the
coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do
not run `npm run api:drift` or the full `npx playwright test` while working on this task:
both rewrite tracked files and leave the working tree dirty.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task deletes an internal measurement route and its fixtures and renders nothing a
person can see.** AC07's browser pass exists to prove the route table — that `/canary` is
gone and that `/` (and, once FIX-09 lands, `/primitives`) still render — not to review a
screen's design.

- **R26 applies**: the commit body names every file deleted, the landing order against
  FIX-09, the E004 scenario entry removed from all three specification mirrors, the two
  open-socket assertions and their two helpers moved into `e2e/network-isolation.spec.ts`
  with no specification line changed, the three stale comments corrected (recording whether
  `vitest.config.ts`'s had already been closed by FIX-04), and the two findings this task
  still could not close itself — the stale `FIX-06.md` rows and `FIX-51-AC01`'s stale
  re-measurement instruction — named in "Out of scope" and in this task's report to the
  orchestrator.
- R01–R25: N/A. The change touches no brand asset, imagery, colour, spacing, type, copy,
  price field, provider, variant, filter, target size, breakpoint, dialog or offer on any
  screen that survives this task; the one screen it stops serving, `/canary`, was never a
  business screen.

## Acceptance criteria

- [ ] **FIX-62-AC01** `src/app/coverage-canary/` and its five files no longer exist —
      `ls src/app/coverage-canary/` reports "No such file or directory", and
      `git status --short` shows all five as deleted (`D`).
- [ ] **FIX-62-AC02** `src/app/app.routes.ts`'s exported `routes` array no longer contains
      a `path: 'canary'` element. `grep -n "path: 'canary'" src/app/app.routes.ts` prints
      nothing. Every other route in the array is byte-for-byte unchanged, **except** for
      whatever reordering **FIX-09** already made to keep the wildcard last, if FIX-09
      landed first — record in the commit body which order the two tasks landed in.
- [ ] **FIX-62-AC03** `e2e/coverage-canary.spec.ts`, `e2e/coverage-canary-negative.spec.ts`,
      `tests/coverage-canary.spec.ts` and `tests/coverage-canary-negative.spec.ts` no
      longer exist.
- [ ] **FIX-62-AC04** `e2e/fixtures/coverage.ts` and `e2e/fixtures/test.ts` no longer
      exist, and `grep -rn "fixtures/test\|fixtures/coverage" e2e/` prints nothing.
- [ ] **FIX-62-AC05** `e2e/network-isolation.spec.ts` imports only from `@playwright/test`,
      navigates to `/` in all four test cases, waits on
      `page.getByTestId('hero-section')`, and the first two assertions
      (`apiCalls.length`/`result.ok` and `external.length`/`result`) are unchanged from
      before this task. The two moved tests assert `expect(pending).toEqual([])` and
      `expect(open).toEqual([])`, each exposing its own `__miboltPendingRequests` /
      `__miboltOpenSockets` binding on the `context` fixture before navigating.
      `npx playwright test e2e/network-isolation.spec.ts` exits `0` with 8 tests passed
      (4 tests × 2 Playwright projects); quote the summary line in the commit body.
- [ ] **FIX-62-AC06** `docs/tasks/T02.md`'s `## Files` section, the `T02` object's `files`
      array in `docs/tasks/tasks.json`, and all three rendered copies in
      `docs/index.html` no longer list `e2e/fixtures/test.ts`, `e2e/fixtures/coverage.ts`
      or `tests/coverage-canary.spec.ts`. Every other file in each of the three lists is
      unchanged — in particular, do not remove `tests/setup-msw.ts` or
      `playwright.config.ts`, and do not touch any `Txx-ACyy` line.
- [ ] **FIX-62-AC07** **Real-browser check, mandatory**, run through the
      `real-browser-sonnet` agent per `.claude/rules/browser-verification.md`, against the
      `--configuration e2e` build served by `scripts/serve-static.mjs`:
      - `/canary` — `take_snapshot` shows the 404 page (`data-testid` for the route's own
        content is absent, and the document title is `MiBolt — Az oldal nem található`).
        `take_screenshot`.
      - `/` — `take_snapshot` shows `data-testid="hero-section"` present and rendered.
      - If **FIX-09** has landed by the time this check runs, also verify `/primitives`
        renders `data-testid="primitives-showcase"` rather than the 404 page, since this
        task's route deletion must not regress FIX-09's fix. If FIX-09 has not landed,
        record that `/primitives` is expected to still 404 for FIX-09's reason and is not
        this task's to explain.
      `list_console_messages` must report **zero** errors on both `/canary` and `/` at
      viewport width **1440**, and `list_network_requests` must show no failed request
      behind either. Capture a screenshot of any failure mode and report it rather than
      hiding it.
- [ ] **FIX-62-AC08** `grep -rln "coverage-canary\|CoverageCanaryPage" --include="*.ts" \
      --include="*.html" src/ tests/ e2e/` prints nothing.
- [ ] **FIX-62-AC09** `npx ng build --configuration e2e` and `npm run build` both exit `0`.
- [ ] **FIX-62-AC10** `git status --short` shows exactly: five deletions under
      `src/app/coverage-canary/`, `src/app/app.routes.ts` modified, four deletions
      (`e2e/coverage-canary.spec.ts`, `e2e/coverage-canary-negative.spec.ts`,
      `tests/coverage-canary.spec.ts`, `tests/coverage-canary-negative.spec.ts`), two
      deletions (`e2e/fixtures/coverage.ts`, `e2e/fixtures/test.ts`),
      `e2e/network-isolation.spec.ts` modified, `docs/tasks/T02.md`,
      `docs/tasks/tasks.json`, `docs/index.html` modified, `docs/spec/test-scenarios.md`
      and `docs/tasks/test-scenarios.json` modified, `tests/setup-msw.ts` and
      `src/mocks/browser.ts` modified, and `vitest.config.ts` modified **only if** FIX-04
      had not already landed (record which) — and **nothing else**. In particular no file
      under `src/app/api/generated/` appears, and no `git restore`, `git checkout --`,
      `git stash`, `git reset` or `git clean` was used at any point.
- [ ] **FIX-62-AC11** The E004 scenario entry is gone from all three mirrors, and the
      three stale comments no longer name the deleted subsystem.
      `grep -c "E004" docs/spec/test-scenarios.md docs/tasks/test-scenarios.json
      docs/index.html` prints `0` for each, and every other scenario ID in all three files
      is unchanged and unrenumbered — `grep -c "^|E0" docs/spec/test-scenarios.md` prints
      one fewer than it did at the baseline. `grep -n "canary" tests/setup-msw.ts
      src/mocks/browser.ts` prints nothing, and `grep -c canary vitest.config.ts` prints
      `0` either because this task's own edit made it so or because FIX-04's rewrite
      already had — record in the commit body which one applied.
      `src/mocks/browser.ts`'s edited line still names `e2e/network-isolation.spec.ts` as
      where the open-sockets check now lives. Record all counts in the commit body.
## Commit

This task is exactly one commit: the five coverage-canary source files deleted, the route
removed, the four spec files deleted, the two fixture files deleted, the
`e2e/network-isolation.spec.ts` retarget and extension with the two moved assertions and
their two helpers, the E004 scenario entry removed from its three mirrors, the three stale
comments corrected, and the documentation-packet corrections. Do not bundle it with
FIX-09, FIX-47 or FIX-08. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's `type: summary` style:

```text
chore: delete the coverage-canary subsystem D19 removed
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**Either order against FIX-09 works, and neither task should be made to wait on the
other for that reason alone.** FIX-09 already tolerates the `'canary'` block being present
or absent when it runs; this task tolerates the block being at its original position or
already moved next to `'primitives'`. Read the file before editing rather than assuming a
line number, in both tasks.

**Land before FIX-06, if the orchestrator can choose.** `FIX-06.md` rows 15-16 currently
plan to `git mv` `tests/coverage-canary.spec.ts` and `tests/coverage-canary-negative.spec.ts`
into `src/app/coverage-canary/`, and its own text calls that directory "a required
deliverable … correctly placed" — both written before decision **D19** and now wrong. If
this task lands first, FIX-06's executor finds two rows in its own move table pointing at
files that no longer exist and has to treat them as a discovered defect in its own file,
same as any other stale citation FIX-06 might find; if FIX-06 lands first, this task's
executor has to locate the two files at their new path under `src/app/coverage-canary/`
instead of `tests/`, delete `src/app/coverage-canary/` entirely regardless (since FIX-06's
move would have added files to a directory this task removes outright), and record that in
the commit body. Neither order is broken, but landing this task first avoids the wasted
move. **This task does not edit `FIX-06.md` to say so** — it is not this task's file — and
the orchestrator is told directly, in this task's report, so the correction can be made
where FIX-06 is next opened.

**`FIX-51-AC01` will read stale once this task lands**, whichever order the two run in: it
tells its executor to open `/canary?branch=true` to re-confirm that FIX-09's route-order
bug, not this task's deletion, is what fails `e2e/network-isolation.spec.ts`. Once
`/canary` no longer exists, opening it 404s for a different reason (the route is gone, not
shadowed), and AC01's own fallback — "if something else renders, stop and report" — would
fire on a correct deletion. This is not this task's file to edit; named here and in this
task's report so the orchestrator can route the correction to FIX-51.

**FIX-08 is unaffected by this task landing.** FIX-08.md already records that D19 item 1
"removes that collector entirely, so there is no longer a report for anything to produce
and nothing for FIX-08 to re-measure as a consequence" of the coverage-canary route or its
absence.

**Either order against FIX-04 works for step 8's `vitest.config.ts:3` edit, and this task
does not depend on FIX-04 landing first.** If FIX-04 has already landed, its own rewrite
(`docs/fix/FIX-04.md`, "What to change" §1) already removed the "canary" mention along
with the rest of the 534-line file, so this task's edit to that one file becomes a no-op it
records rather than performs — see the collision note in Evidence and step 8. If FIX-04 has
not landed, this task makes the edit itself. Neither order breaks either task.

**FIX-51 edits the same header comment block in `src/mocks/browser.ts` (`:11-14`) that this
task's step 8 edits at `:8`, for an unrelated reason** — FIX-51 Part 1 rewrites the
paragraph describing `installBusinessRouteBypass()`'s two handlers, four lines below the
line this task corrects. Both edits are single, content-addressed line replacements rather
than line-number-dependent, so either order is safe; landing this task first is marginally
simpler for FIX-51's executor, since it then edits a header that already reads correctly
above its own change rather than one still naming the deleted fixture.
