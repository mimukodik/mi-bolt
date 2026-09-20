# FIX-39 — Delete the traceability gate and remove the thirteen skipped specs

Status: PLANNED — not executed.
Severity: major
Source: measured baseline, `npm run check:traceability`; A7 RQ13/RQ14/RQ19; superseded by
decision **D17** (the plan was over-engineered: standard scripts, no bespoke gates) and
its own §5 argument that `verify:traceability` does not survive, both dated 2026-09-17.

## Why this is wrong

This task used to carry two gates. `npm run check:test-policy` is no longer any part of
it — **`FIX-46`** owns the whole of that gate's replacement, moving its rule into ESLint.
What remains here is `scripts/check-traceability.mjs`, which D17 deletes, and the two
pieces of real work that survive its deletion.

**The gate proved a citation exists, never that an assertion does.**
`scripts/check-traceability.mjs:113` matches `/\b(T\d{2}-AC\d{2})\b/g` against every
`*.spec.*` file under `tests/` and `e2e/` and counts a criterion "reached" the moment its
identifier appears anywhere — inside a comment, inside a string, inside a `describe`
title, no different. A gate whose pass condition is "a string appears in a title"
restates a bookkeeping convention; it does not catch a defect, and
`.claude/rules/planning-deliverables.md`'s own test — "a check whose failure would show
up in the next test run does not need its own gate" — is exactly why D17 removes it. The
user's words: *"nem kell ennyi script es npm parancs sem, standardek kellenek lint, test,
coverage stb, plan tul lett tervezve javitasd"* ("this many scripts and npm commands are
not needed either; standards are what is needed — lint, test, coverage and so on; the
plan was over-engineered, fix it").

**The requirement behind the gate does not go with it.** Forty-three of 161 acceptance
criteria are unreached at baseline, and most of those genuinely lack a test that asserts
anything about them — that fact does not stop being true because nothing measures it by
regex anymore. `docs/spec/testing.md:137` (§8, Required evidence) asks for "requirement
traceability" per release, and **`FIX-40`** item 4 already commissions
`docs/mi-bolt/execution/traceability.md` as the human record that replaces the regex.
Reading each still-unreached criterion, deciding honestly whether the application does
what it says, and either writing a real assertion for it or reporting it as unimplemented
work is **`FIX-72`**'s job, split out of this task (`RULINGS-B2`, finding S7b-15,
decision **D25**) because a per-criterion judgment pass over roughly 24 criteria in seven
packets is not the same logical change as deleting the gate and rewriting thirteen
skipped guards. That work does not become optional because the tool that used to count
it is gone; if anything it matters more, because after **`FIX-72`** there is no automated
backstop at all, only what its own record says. **This task's own job is narrower: delete
the gate, and remove the thirteen skips that block `FIX-46`'s lint rule.**

**`FIX-72` is the closing task of the repair package for this requirement, and it is the
one most likely to be done wrongly.** An executor who reads "close the unreached
criteria" as license to paste identifiers into comments has gone as wrong there as one who
was told to "make the gate green" would have gone under the old version of this task. The
explicit prohibition **`FIX-72`** carries (moved from this file's former "What to change"
item 3, unchanged in substance) is, if anything, more load-bearing now that no gate exists
to catch the shortcut: read it before writing anything there.

**Ten of the forty-three describe the optional 3D viewer, and deleting the gate is what
settles them — it does not skip them.** `O01` is `docs/tasks/tasks.json:1750`'s only task
marked `"optional": true`; `docs/spec/execution-rules.md:17` says "Only O01 (3D) is
optional and requires explicit approval"; `T16-AC05` requires the baseline to ship no 3D
at all. The user's answer on 2026-09-17 to this exact problem was *"Gate tanulja meg"*
("let the gate learn it") — decision **D7**. Decision **D17/§5 settles what that answer
means once the gate itself is gone: "D7 ('Gate tanulja meg') is satisfied by D17, not
contradicted. D7's substance is that the ten optional-3D criteria must not count as
failures. With the gate gone, nothing counts them."** So D7 is met by removal, not
reversed by it, and this task's commit body says so in those terms. **The 3D viewer
remains unapproved and unbuilt.** This task adds no `@google/model-viewer` dependency and
creates none of O01's own files.

**This task must land before `FIX-46`.** `FIX-46`'s ESLint rule forbids every
`test.skip(` call in `tests/**`, `e2e/**` and `src/**/*.spec.ts`, and this task is what
removes the thirteen call sites that exist today. Landing `FIX-46` first would leave its
own rule red from the moment it is written — the same shape as `FIX-07` running before
`FIX-08` elsewhere in this package. **This task and `FIX-46` also share one file,
`docs/tasks/T27.md`, plus its `docs/tasks/tasks.json` and `docs/index.html` mirrors — the
two tasks must never run concurrently.**

## Evidence

### The traceability gate, measured verbatim on commit `db6d295`

```text
check-traceability summary:
  requirements: reached=17/20 (unreached=3)
  acceptanceCriteria: reached=118/161 (unreached=43)
  scenarios: reached=124/127 (unreached=3)

unreached requirements:
  - RQ18: requirement RQ18 (Research transfer evaluation; optional 3D discussion) lists tasks T00, O01 but no spec file references any of those tasks
  - RQ19: requirement RQ19 (Decomposed tasks, dependency DAG and strict per-task acceptance) lists tasks T00, T29 but no spec file references any of those tasks
  - RQ20: requirement RQ20 (Separate overall acceptance and reproducible handoff) lists tasks T29 but no spec file references any of those tasks

unreached task ACs (excluding gate-owned tasks):
  - T01: missing T01-AC01, T01-AC02, T01-AC03, T01-AC04, T01-AC05
  - T05: missing T05-AC01, T05-AC05
  - T06: missing T06-AC01, T06-AC02, T06-AC03, T06-AC04, T06-AC05
  - T10: missing T10-AC01, T10-AC02, T10-AC03, T10-AC04, T10-AC05
  - T13: missing T13-AC01, T13-AC02, T13-AC03, T13-AC04, T13-AC05
  - T15: missing T15-AC01, T15-AC02, T15-AC03, T15-AC04, T15-AC05
  - T25: missing T25-AC02
  - T28: missing T28-AC01, T28-AC04, T28-AC05, T28-AC06
  - T29: missing T29-AC01, T29-AC02, T29-AC03, T29-AC04, T29-AC05
  - O01: missing O01-AC01, O01-AC02, O01-AC03, O01-AC04, O01-AC05, O01-AC06

unreached scenarios:
  - E125: scenario E125 (Deferred local model, scenario=3d-approved) has no spec file that references it
  - E126: scenario E126 (3D failure fallback, scenario=3d-model-error) has no spec file that references it
  - E127: scenario E127 (3D keyboard and model variation, scenario=3d-approved) has no spec file that references it
check-traceability:FAIL — 16 unreached item(s); first row of each bucket printed above.
```

5 + 2 + 5 + 5 + 5 + 5 + 1 + 4 + 5 + 6 = **43**. This is not a target to reproduce by
re-running a tool this task deletes; it is the worklist for What to change item 2, and it
is kept here verbatim so a reader can check what this task did and did not close against
what actually existed at baseline.

**Six of the forty-three, plus the three scenarios and one requirement above, describe
work this task does not do.** O01's six criteria, E125–E127 (each carries its own
`"optional": true` in `docs/tasks/test-scenarios.json`) and RQ18 are the optional 3D
viewer — see "Why this is wrong". They are excluded from item 2's worklist entirely, not
closed and not reported as unimplemented work, because reporting a 3D criterion as
"unimplemented" would read as a defect to fix, and building it is exactly what is
forbidden without approval.

**RQ19 and RQ20 are a different case, and they are not closable here.** Both
`docs/tasks/T29.md` and `docs/tasks/tasks.json`'s T29 entry are `FIX-40`'s to write, and
`FIX-40` runs **after** this task — it lands second-to-last in the package, while this
task lands before `FIX-46` (`FIX-46.md:278-281`). So the T29 packet this task would need
does not exist yet when this task runs. Report RQ19 and RQ20 as unimplemented work owned
by **FIX-40**, with their packet lines quoted, exactly as item 2 does for every other
criterion it cannot close. Do not write a spec naming `T29` here.

### Thirteen `test.skip(` call sites, not the six the old gate report showed

```text
$ grep -rn "test\.skip(" e2e/
e2e/design/viewport-matrix.spec.ts:145:            test.skip(true, `no primary CTA defined for route ${route.id}`);
e2e/design/state-matrix.spec.ts:108:        test.skip(true, `${surface.routeId} not yet built (T17–T24)`);
e2e/design/state-matrix.spec.ts:122:        test.skip(
e2e/design/state-matrix.spec.ts:138:          test.skip(
e2e/design/state-matrix.spec.ts:149:          test.skip(
e2e/design/state-matrix.spec.ts:179:      test.skip(true, 'cart route not yet implemented (T17–T24)');
e2e/design/state-matrix.spec.ts:186:      test.skip(true, 'cart-page not present in current build');
e2e/a11y/keyboard.spec.ts:103:        test.skip(
e2e/a11y/keyboard.spec.ts:167:      test.skip(true, '/telefonok not reachable');
e2e/a11y/keyboard.spec.ts:172:      test.skip(true, 'filter-trigger not present in current build');
e2e/a11y/keyboard.spec.ts:201:      test.skip(true, '/telefonok not reachable');
e2e/a11y/keyboard.spec.ts:206:      test.skip(true, 'filter-trigger not present in current build');
e2e/a11y/keyboard.spec.ts:231:      test.skip(true, '/telefonok not reachable');
```

Six, six and one. `state-matrix.spec.ts:108` is reached through a data flag rather than a
literal call in the test body — `:79-98`:

```ts
  {
    state: 'default',
    routeId: 'cart-default',
    path: '/penztar/kosar',
    assertion: { kind: 'testid', testId: 'cart-page' },
    built: false,
  },
  // …
  {
    state: 'default',
    routeId: 'success',
    path: '/penztar/siker/DEMO-000001',
    assertion: { kind: 'testid', testId: 'success-page' },
    built: false,
  },
```

and `:105-110`:

```ts
      if (surface.built === false) {
        test.skip(true, `${surface.routeId} not yet built (T17–T24)`);
        return;
      }
```

Both rows' own comments say the pages **are** built — "as of T17", "as of T24" — for "the
t13-catalog build", a build that is not what the suite runs against now. A data flag that
suppresses an assertion is the practice `docs/spec/coverage-policy.json`'s `forbidden`
list bans ("skip/todo/only"), wearing a different name.

### What "closing a criterion" does and does not mean here

The gate's regex could be satisfied by pasting an identifier into a comment; nothing
enforced that the paste be an assertion. Removing the gate does not remove that risk —
it removes the false signal that made the risk look checked. What to change item 2's
explicit prohibitions exist for exactly this reason and are unchanged from the version of
this task written when the gate still existed.

## What to change

### 1. Delete `scripts/check-traceability.mjs`

The whole file. `grep -rn "check-traceability" --include="*.ts" --include="*.mjs" src
scripts tests e2e` should return only the file's own path before this change and nothing
after.

### 2. Remove the npm entry that invoked it — check first

```bash
grep -n '"check:traceability"' package.json
```

`package.json` names this script `check:traceability` today (`:18`, measured on commit
`db6d295`); it was never renamed to `verify:traceability` because D17 removes the command
before decision D10's rename would have reached it.

- **If the grep prints a line**, delete it from the `scripts` block, adjusting the
  neighbouring trailing comma so the block stays valid JSON.
- **If it prints nothing**, `FIX-47` has already pruned `package.json` to the eleven
  survivors and removed this line as part of that commit. Record "already absent, removed
  by FIX-47" in the commit body rather than treating this item as skipped.

### 3. *(moved)* Closing the criteria that genuinely remain — `FIX-72`

Deciding, per criterion, whether the behaviour a packet describes exists today and then
writing a test that fails when it is removed is a judgment pass over roughly 24
criteria in seven packets. It is not the same logical change as deleting a gate and
rewriting thirteen guards, and bundling the two puts an open-ended pass inside the
commit that removes the check which would have caught a shortcut taken in it.
**`FIX-72` owns it**, runs after this task and before **FIX-40**, and carries the
worklist, the four steps and the prohibitions unchanged. This task's Evidence section
stays as it is: it is where FIX-72's worklist is measured.

### 4. Remove all thirteen skips — one at a time, per the table below

Eleven of the thirteen calls sit **inside** an `if (…) { … return; }` or
`{ … continue; }`. Deleting only the `test.skip(` line leaves the `return;`/`continue;`
behind, and the test then runs to completion having asserted nothing — a silent pass that
reads exactly like a real one. **Delete the whole guard — condition, body and its
`return;`/`continue;` — and put back whatever assertion the guard was suppressing.** The
exact replacement for each of the thirteen is given below; apply them verbatim rather than
deriving them.

After each site, the assertion either passes or fails:

- **If it passes**, the guard was stale and the removal is the whole fix.
- **If it fails because the application is broken**, that failure belongs to **`FIX-09`**,
  which owns the 41 Playwright failures measured at baseline. Record which assertions newly
  fail, name `FIX-09`, and do not repair the application from inside this task.
- **If it fails because the spec file's own data cannot drive the flow** — see site 1
  below — that is not one of `FIX-09`'s application failures. Record it by name as a
  defect this task found and does not own, and do not re-add a skip to quiet it.

#### `e2e/a11y/keyboard.spec.ts:100-109` (site 1)

Current:
```ts
    for (const step of FLOW) {
      const check = await gotoAndCheck(page, step.path, step.waitFor);
      if (!check.ok || step.built === false) {
        test.skip(
          true,
          `${step.name}: ${step.path} not reachable (status=${check.ok ? 0 : check.status}); T17–T24 pages still landing`,
        );
        skippedSteps += 1;
        continue;
      }
```
Replace with:
```ts
    for (const step of FLOW) {
      const check = await gotoAndCheck(page, step.path, step.waitFor);
      expect(
        check.ok,
        `${step.name}: ${step.path} not reachable (status=${check.ok ? 0 : check.status})`,
      ).toBe(true);
```
`step.built === false` is dead — all eight `FLOW` rows carry `built: true` (`:58-72`) — so the
orphan cleanup below removes the field with the guard.

**Expect this one to fail, and read the failure carefully before reporting it.** The `FLOW`
walks `/penztar/adatok` → `/penztar/szallitas`, and `deliveryGuard`
(`src/app/features/checkout/checkout.guards.ts`) redirects to `/penztar/adatok` until
`session.contact` is set. `KeyboardStep.action` (`:43-48`) has no `fill` kind, so the flow has
no way to fill the contact form and the guard can never be satisfied. **That is a defect in
this spec file's own data, not one of `FIX-09`'s.** Report it by name; do not extend the
action union here.

#### `e2e/a11y/keyboard.spec.ts:166-169` (site 2), `:200-203` (site 4), `:230-233` (site 6)

All three are the same three lines. Current (site 2 shown; the other two are identical except
for their indentation, which is the same, and their position):
```ts
    if (!check.ok) {
      test.skip(true, '/telefonok not reachable');
      return;
    }
```
Replace each with:
```ts
    expect(check.ok, '/telefonok not reachable').toBe(true);
```
`/telefonok` is a real route — `src/app/app.routes.ts:125`, ahead of the `**` wildcard at
`:181` — so an unreachable catalogue is a failure, not a precondition to wait for.

#### `e2e/a11y/keyboard.spec.ts:170-174` (site 3)

Current:
```ts
    const trigger = page.getByTestId('filter-trigger');
    if ((await trigger.count()) === 0) {
      test.skip(true, 'filter-trigger not present in current build');
      return;
    }
```
Replace with:
```ts
    const trigger = page.getByTestId('filter-trigger');
    await expect(trigger).toBeVisible();
```
**and change this test's viewport at `:160` from 1440 to 390**, i.e. replace
```ts
    await page.setViewportSize({ width: 1440, height: 900 });
```
with
```ts
    // The filter trigger is `display: none` at >=1024px and
    // `display: inline-flex` below it (catalog-page.ts:413-414 and
    // :427-431), so the drawer branch is where this control is real.
    await page.setViewportSize({ width: 390, height: 844 });
```
**and change the test title at `:159`** from `'focus ring is visible on the primary CTA at 1440px'`
to `'focus ring is visible on the primary CTA at 390px'`.

The guard could never fire: the button is unconditionally in the template
(`src/app/features/catalog/catalog-page.ts:95-103`, no `@if`), so `count()` is always 1 and
`.toBeVisible()` is the check that actually distinguishes the two viewports. Without the
viewport change this test focuses a `display: none` element — `locator.focus()` performs no
visibility check (`node_modules/playwright-core/types/types.d.ts:15560-15562`: *"Calls focus on
the matching element"*, no actionability clause) — and then asserts a computed `outlineColor`
that has nothing to do with a focus ring. **If the sibling test at `:187` already proves the
390px trigger, this is a duplicate and that is a finding to report, not a reason to leave the
1440 viewport in place.**

#### `e2e/a11y/keyboard.spec.ts:204-208` (site 5)

Current:
```ts
    const trigger = page.getByTestId('filter-trigger');
    if ((await trigger.count()) === 0) {
      test.skip(true, 'filter-trigger not present in current build');
      return;
    }
```
Replace with:
```ts
    const trigger = page.getByTestId('filter-trigger');
```
The next line (`:209`) is already `await trigger.waitFor({ state: 'visible' });`, which is the
real check, and this test already sets 390 at `:194`. Nothing else changes.

#### `e2e/design/state-matrix.spec.ts:107-110` (site 7)

Unchanged from this file's existing ordered list below: the `built: false` line leaves the
`cart-default` and `success` rows, the `built` field leaves every other row and the `Surface`
type, and the whole branch goes with them.

#### `e2e/design/state-matrix.spec.ts:117-127` (site 8)

Current:
```ts
      if (status >= 400) {
        // The route is not yet implemented in the production
        // build (cart / checkout / success pages). Skip rather
        // than fail so the suite can be run incrementally while
        // the dependent tasks (T17–T24) land.
        test.skip(
          true,
          `${url} returned ${status} — page not yet implemented (T17–T24)`,
        );
        return;
      }
```
Replace with:
```ts
      expect(status, `status for ${url}`).toBeLessThan(400);
```

#### `e2e/design/state-matrix.spec.ts:129-144` (site 9)

Current:
```ts
      // Surface assertion: testid mount or text presence. A testid
      // that the surface does not yet expose (e.g. `catalog-empty`
      // before the catalogue empty-state wiring lands in the build
      // used for this run) is reported as `not-mounted` so the
      // audit captures the limitation without failing.
      if (surface.assertion.kind === 'testid') {
        const root = page.getByTestId(surface.assertion.testId);
        const mounted = (await root.count()) > 0;
        if (!mounted) {
          test.skip(
            true,
            `${surface.assertion.testId} not mounted on ${url} — empty / error surface not exposed by this build`,
          );
          return;
        }
        await expect(root.first()).toBeVisible({ timeout: 10_000 });
```
Replace with:
```ts
      // Surface assertion: the state-specific testid must be mounted
      // and visible, or the text the surface exposes in that state
      // must be on the page.
      if (surface.assertion.kind === 'testid') {
        const root = page.getByTestId(surface.assertion.testId);
        await expect(root.first()).toBeVisible({ timeout: 10_000 });
```

#### `e2e/design/state-matrix.spec.ts:145-156` (site 10)

Current:
```ts
      } else {
        const text = page.getByText(surface.assertion.match);
        const mounted = (await text.count()) > 0;
        if (!mounted) {
          test.skip(
            true,
            `text matching ${surface.assertion.match} not present on ${url}`,
          );
          return;
        }
        await expect(text.first()).toBeVisible({ timeout: 10_000 });
      }
```
Replace with:
```ts
      } else {
        const text = page.getByText(surface.assertion.match);
        await expect(text.first()).toBeVisible({ timeout: 10_000 });
      }
```

#### `e2e/design/state-matrix.spec.ts:178-188` (sites 11 and 12)

Current:
```ts
    if (response && response.status() >= 400) {
      test.skip(true, 'cart route not yet implemented (T17–T24)');
      return;
    }
    // The cart-page testid is the contract; if the t13-catalog
    // build still ships the T11 placeholder we skip gracefully.
    const cartTestid = page.getByTestId('cart-page');
    if ((await cartTestid.count()) === 0) {
      test.skip(true, 'cart-page not present in current build');
      return;
    }
```
Replace with:
```ts
    expect(response, 'navigated to /penztar/kosar').not.toBeNull();
    expect(response!.status(), 'status for /penztar/kosar').toBeLessThan(400);
    const cartTestid = page.getByTestId('cart-page');
```
`:189`'s `await expect(cartTestid.first()).toBeVisible({ timeout: 10_000 });` stays and is what
site 12's guard was suppressing.

#### `e2e/design/viewport-matrix.spec.ts:143-147` (site 13)

Current:
```ts
          const selectors = PRIMARY_CTA_BY_ROUTE.get(route.id) ?? [];
          if (selectors.length === 0) {
            test.skip(true, `no primary CTA defined for route ${route.id}`);
            return;
          }
```
Replace with:
```ts
          const selectors = PRIMARY_CTA_BY_ROUTE.get(route.id) ?? [];
          expect(
            selectors.length,
            `no primary CTA defined for route ${route.id}`,
          ).toBeGreaterThan(0);
```
The guard is unreachable today — every one of the eight `ROUTES` ids (`:53-64`) has an entry in
`PRIMARY_CTA_BY_ROUTE` (`:73-81`) — but a plain deletion would leave `?? []` feeding a
zero-iteration loop, so a route added later without a CTA entry would pass green. The assertion
is what stops that.

Every one of the three files already imports `expect` (`keyboard.spec.ts:32`,
`state-matrix.spec.ts:39`, `viewport-matrix.spec.ts:32`); no import changes.

Each guard's removal orphans the data and the bookkeeping that fed it, and
`.claude/rules/code-standards.md` ("A cut feature leaves nothing behind") makes those orphans
this change's own. Delete, per file:

**`e2e/design/state-matrix.spec.ts`**, in this order:

- the `built: false` line from the `cart-default` row and from the `success` row;
- the `built` field from every other row in `SURFACES`, where it is `built: true`;
- the field and its docstring from the `Surface` type declaration (`:54-55`);
- the branch at `:107-110` that reads it, including its `test.skip`.

Then rewrite the two comments at `:79-83` and `:91-92`, which explain a flag that no
longer exists, to say one sentence each about what the row asserts, and rewrite the
docblock paragraph at `:23-28` — *"Routes that are not yet implemented … are skipped with a
`test.skip` … The skip count is the explicit `not-yet-built` evidence recorded in
`docs/mi-bolt/execution/design-review.md`"* — which describes a mechanism this commit
removes.

**`e2e/a11y/keyboard.spec.ts`**:

- the `built?: boolean;` field and its docstring at `:53-54` of the `KeyboardStep` type;
- the `built: true` entry from all eight `FLOW` rows (`:58-72`);
- `let skippedSteps = 0;` at `:98`, its `skippedSteps += 1;` (removed with site 1's guard),
  and the `testInfo.attachments.push({ name: 'skipped-steps', … })` block at `:152-156`,
  which can now only ever attach `0`;
- the docblock sentence at `:16-21` — *"so a missing feature surfaces as a `test.skip` with
  the exact step name in the message rather than a hard failure. The skipped-step count is
  recorded as evidence in `docs/mi-bolt/execution/design-review.md`"* — rewritten to say the
  flow asserts each step and fails on an unreachable one.

**`e2e/design/viewport-matrix.spec.ts`**: nothing is orphaned; site 13 is a one-block
replacement.

**Do not touch `e2e/a11y/keyboard.spec.ts:34`.** `FIX-48` edits that line (an
out-of-repository screenshot path) in the same file; the two tasks touch different lines
and must not run at the same time.

### 5. `docs/tasks/T27.md` — remove the `check-traceability.mjs` file reference

Current text at `:17-23`:

```
## Files

- `e2e/`
- `tests/`
- `docs/mi-bolt/spec/coverage-policy.json`
- `scripts/check-traceability.mjs`
- `scripts/check-test-policy.mjs`
```

Replace with:

```
## Files

- `e2e/`
- `tests/`
- `docs/mi-bolt/spec/coverage-policy.json`
- `scripts/check-test-policy.mjs`
```

This leaves the `check-test-policy.mjs` line and the wrong `docs/mi-bolt/spec/` prefix
untouched — **`FIX-46`** removes the first (after this task has landed) and **`FIX-36b`**
owns the second. Do not remove either here.

### 6. `docs/tasks/tasks.json:1523-1529` — the same list, mirrored

Current text:

```json
    "files": [
      "e2e/",
      "tests/",
      "docs/mi-bolt/spec/coverage-policy.json",
      "scripts/check-traceability.mjs",
      "scripts/check-test-policy.mjs"
    ],
```

Replace with:

```json
    "files": [
      "e2e/",
      "tests/",
      "docs/mi-bolt/spec/coverage-policy.json",
      "scripts/check-test-policy.mjs"
    ],
```

### 7. `docs/index.html` — four occurrences, three of them shared lines

Line numbers below were measured on commit `db6d295`; locate each by the quoted
substring, not by the number, since earlier edits in this same file (from other tasks in
this package) may have moved it.

- **The `data-search` attribute** (`:4055` at baseline) contains the same JSON array as
  `tasks.json`, inline: `..."docs/mi-bolt/spec/coverage-policy.json",
  "scripts/check-traceability.mjs", "scripts/check-test-policy.mjs"], ...`. Delete the
  substring `"scripts/check-traceability.mjs", ` (the filename plus its trailing comma
  and space — it is not the last element of that array; `"scripts/check-test-policy.mjs"`
  stays and becomes the new last element for **`FIX-46`** to remove later).
- **The "Fájlfelelősség" file-list `<div>`** (`:4058` at baseline) contains
  `<code>scripts/check-traceability.mjs</code>` with no separator before or after it (the
  entries are concatenated `<code>` tags). Delete that one `<code>…</code>` element
  exactly.
- **One standalone `<li>`** (`:4075` at baseline):
  `<li><code>scripts/check-traceability.mjs</code></li>`. Delete the whole line.

After this task's edit, `grep -c "check-traceability" docs/index.html` returns `0`, and
`grep -c "check-test-policy" docs/index.html` still returns its baseline count — this task
does not remove that entry.

## Files this change touches

- `scripts/check-traceability.mjs` — deleted
- `package.json` — the `check:traceability` entry, if still present
- `e2e/a11y/keyboard.spec.ts`, `e2e/design/state-matrix.spec.ts`,
  `e2e/design/viewport-matrix.spec.ts` — skip removal
- `docs/tasks/T27.md`, `docs/tasks/tasks.json`, `docs/index.html` — the Files-list mirror

## Out of scope

- **`scripts/check-test-policy.mjs` and the ESLint rule that replaces it — `FIX-46`.**
  That task does not start until this one has landed; do not delete that script or touch
  `eslint.config.js` here.
- **`FIX-09`** owns the 41 Playwright failures. Removing a skip will expose more of them;
  report them and stop.
- **`FIX-06`** owns moving the feature specs out of root `tests/`. The old version of this
  task carried an item widening `SCAN_ROOTS` to follow that move — with the gate deleted
  there is no `SCAN_ROOTS` left to widen, and this task does not touch anything about
  where `FIX-06` puts its files.
- **`FIX-07`** owns replacing tests that assert source text instead of behaviour. If a
  criterion already has such a test citing it, note it and leave it — closing it twice is
  two tasks' work in one commit.
- **`FIX-08`** owns the coverage thresholds and `src/mocks/**`. This task does not touch
  `docs/spec/coverage-policy.json`, `angular.json` or `vitest.config.ts`.
- **`FIX-40`** owns the T28 and T29 deliverables. Nine of the unreached criteria are
  theirs (T28-AC01/04/05/06 and all five T29 criteria) and they close when that task lands
  with its tests. Do not write a T28 or T29 test here.
- **`FIX-36b`** owns the wrong `docs/mi-bolt/spec/` path prefix in `docs/tasks/T27.md` and
  its mirrors. This task's own edit to that file's Files list leaves the prefix untouched.
- **Do not lower a threshold, widen an exclusion, or delete a criterion from
  `docs/tasks/tasks.json`, `docs/tasks/test-scenarios.json`, `docs/tasks/requirements.json`
  or `docs/spec/acceptance.md`.** Under **D1** the specification is the authority. The one
  change this task makes to `docs/tasks/tasks.json` is the Files-list edit in What to
  change item 6; nothing else in that file, or in the other three, changes.
- **Building any part of the 3D viewer.** O01's six criteria, E125–E127 and RQ18 are
  excluded from **FIX-72**'s worklist entirely — not closed, not reported as unimplemented,
  not touched. See "Why this is wrong".
- **Any replacement automated gate.** This task does not add a script, an npm entry, a CI
  step or an environment variable that re-creates what `scripts/check-traceability.mjs`
  did under a new name. The human record is `docs/mi-bolt/execution/traceability.md`,
  which `FIX-40` item 4 commissions.

## How to verify

Run from the repository root. The package manager is **npm 11.17.0**; there is no pnpm
and no mise in this repository.

**Step 1 — read the gate's current output before deleting it, as a sanity check against
this file's Evidence section.**

```bash
npm run check:traceability
```

Expected exit `1`. Read the output directly from the terminal and compare it to the
verbatim block in Evidence; do **not** redirect it to a file outside the repository —
`.claude/rules/code-standards.md` forbids a temp-directory or machine-specific path in
anything committed, and this record is committed. If the numbers differ from the baseline
above, another landed task has already closed some criteria; note which ones before
continuing. **If the command fails with "Missing script: check:traceability" instead**,
`FIX-47` has already pruned `package.json` to the eleven survivors and removed this entry
before this task ran — record "already absent, removed by FIX-47" per What to change item
2 and proceed to Step 2 without a gate output to compare against.

**Step 2 — do the real work**: What to change item 4, the thirteen skip removals. Closing
the remaining unreached criteria with real assertions is **FIX-72**'s work, not this
task's.

**Step 3 — delete the gate.**

```bash
rm scripts/check-traceability.mjs
grep -n '"check:traceability"' package.json   # edit or "already absent", per What to change item 2
```

**Step 4 — remaining skips and the affected spec.**

```bash
grep -c "test\.skip(" e2e/a11y/keyboard.spec.ts e2e/design/state-matrix.spec.ts e2e/design/viewport-matrix.spec.ts
# expect 0, 0, 0
npx playwright test e2e/a11y/keyboard.spec.ts e2e/design/state-matrix.spec.ts e2e/design/viewport-matrix.spec.ts
```

**This rewrites screenshots under `e2e/design/screenshots/` and leaves the working tree
dirty.** Run it deliberately, read the result, and check `git status --short` afterwards;
regenerated screenshots are either committed with a stated reason or left out of the
commit with a stated reason. Expected: `0 skipped`. The pass/fail count is reported, not
gated — `FIX-09` owns the failures.

**Step 5 — the doc edits.** Apply What to change items 5, 6 and 7, then:

```bash
grep -c "check-traceability" docs/tasks/T27.md docs/tasks/tasks.json docs/index.html   # each 0
git diff docs/tasks/tasks.json docs/tasks/test-scenarios.json docs/tasks/requirements.json docs/spec/acceptance.md docs/spec/coverage-policy.json
```

The last command's output for `docs/tasks/tasks.json` must be exactly What to change item
6's before/after; the other four files must show no diff at all.

**Step 6 — no-regression check.**

```bash
npm run build
npx vitest run
```

Expected: both exit `0`, and `vitest run` reports no new failing file relative to the run
immediately before this task.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task deletes one Node script, removes skip guards from spec files (restoring
whatever assertion each guard was suppressing), and edits three documentation mirrors.
Writing the missing assertions for the criteria that remain unreached is `FIX-72`'s, not
this task's; this task only removes the thirteen skips and does not change what
renders.** `.claude/rules/browser-verification.md`'s exemption for a build/test script
applies and is claimed here explicitly.

- **R26 applies**: the commit body identifies every file changed, both the gate's
  before-deletion output and the doc-edit greps, each restored assertion's pass/fail
  result per skip site, each newly-failing Playwright test handed to `FIX-09`, and the
  ten 3D items as work this task explicitly does not touch, with D7's satisfaction stated
  in the terms "Why this is wrong" gives. AC11 requires it.
- R01–R25: N/A. This task removes skip guards and deletes a Node script; it changes no
  application surface, token, component, state, label or data source.

## Acceptance criteria

- [ ] **FIX-39-AC01** `scripts/check-traceability.mjs` no longer exists:
      `test -f scripts/check-traceability.mjs` fails. `grep -rn "check-traceability"
      --include="*.ts" --include="*.mjs" src scripts tests e2e` returns nothing.
- [ ] **FIX-39-AC02** `grep -n '"check:traceability"' package.json` returns nothing, and
      the commit body states whether this task removed the line or found it already
      absent because `FIX-47` had landed.
- [ ] **FIX-39-AC03** `grep -c "test\.skip(" e2e/a11y/keyboard.spec.ts
      e2e/design/state-matrix.spec.ts e2e/design/viewport-matrix.spec.ts` prints `0` for
      each of the three files. Measured at 6, 6 and 1 (13 total) on `db6d295`. **And no
      guard was left as a bare stub**: `grep -nE "^\s*(return|continue);\s*$" e2e/a11y/keyboard.spec.ts
      e2e/design/state-matrix.spec.ts e2e/design/viewport-matrix.spec.ts` returns nothing,
      and `git diff` for the three files shows, for every one of the thirteen sites, that the
      enclosing `if` and its body were removed and an `expect(…)` or the suppressed assertion
      put in their place — quote the thirteen diff hunks in the commit body, one per site.
      A site whose diff removes only the `test.skip(` line fails this criterion.
- [ ] **FIX-39-AC04** `grep -rn "built" e2e/design/state-matrix.spec.ts` returns no line
      declaring, setting or reading a `built` field — the type, the data and the branch
      that read it are all gone in the same commit. The word may still appear in prose; a
      field may not.
- [ ] **FIX-39-AC04b** The orphans named in What to change item 4 are gone in the same commit:
      `grep -rn "\bbuilt\b" e2e/a11y/keyboard.spec.ts e2e/design/state-matrix.spec.ts` returns
      no line declaring, setting or reading a `built` field (the word may still appear in
      prose; a field may not), and `grep -n "skippedSteps\|skipped-steps" e2e/a11y/keyboard.spec.ts`
      returns nothing.
- [ ] **FIX-39-AC05** *(moved)* Closing the remaining criteria with real assertions, and
      reporting the rest as unimplemented work, are **FIX-72**'s AC01 and AC02.
- [ ] **FIX-39-AC06** `npx playwright test e2e/a11y/keyboard.spec.ts
      e2e/design/state-matrix.spec.ts e2e/design/viewport-matrix.spec.ts` reports
      **`0 skipped`**. Measured at `8 skipped` across the package baseline on `db6d295`.
      Every newly-failing assertion is listed by name in the commit body with its one-line
      symptom and one of two attributions: **`FIX-09`** where the failure is the application
      being broken, or **"defect in the spec file, unowned"** where the failure is this spec's
      own data being unable to drive the flow — site 1's contact-step step is expected to be
      the second kind. No skip was re-added to make anything quiet, and no assertion was
      weakened to make it pass.
- [ ] **FIX-39-AC07** `git diff docs/tasks/tasks.json` shows exactly What to change item
      6's before/after and nothing else. `git diff docs/tasks/test-scenarios.json
      docs/tasks/requirements.json docs/spec/acceptance.md docs/spec/coverage-policy.json`
      is empty for all four files. No threshold was lowered, no exclusion widened, no
      criterion deleted.
- [ ] **FIX-39-AC08** The ten 3D items — `O01-AC01`…`O01-AC06`, `E125`, `E126`, `E127` and
      `RQ18` — are untouched by this task: not closed, not reported as unimplemented, not
      built. `grep -rn "model-viewer\|three\|3d\|gltf" src/ package.json` returns **17
      hits at baseline on `db6d295`** — almost all the English word "three" — and no new
      hit introduced by this task, and none of O01's four named source files exists. The
      commit body quotes the user's answer of 2026-09-17, *"Gate tanulja meg"*, and states
      in D17/§5's own terms that decision D7 is satisfied by this task's deletion of the
      gate rather than reversed by it.
- [ ] **FIX-39-AC09** `grep -c "check-traceability" docs/tasks/T27.md
      docs/tasks/tasks.json docs/index.html` prints `0` for all three files, and the same
      three files still show `check-test-policy` at its baseline count — **`FIX-46`**
      removes that entry after this task, not this task itself.
- [ ] **FIX-39-AC10** `npm run build` exits `0` and `npx vitest run` reports no new
      failing file relative to the run immediately before this task.
- [ ] **FIX-39-AC11** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** This task edits spec files, one Node script (by
      deleting it) and three documentation mirrors; it changes no component, template,
      stylesheet, route or rendered surface, so there is nothing a person can see or click
      that differs afterwards. Note that a passing Playwright run is explicitly **not**
      browser verification under `.claude/rules/browser-verification.md`, and is not
      offered as one here.
- [ ] **FIX-39-AC12** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body per the Design rules section above. **FIX-53** owns the same record
      for the original T00–T29 and O01 tasks.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-09`, `FIX-06`, `FIX-46` or any
other FIX task. **Run it before `FIX-46`**: `FIX-46`'s ESLint rule fails while any of the
thirteen skips named above still exist, and this task and `FIX-46` share
`docs/tasks/T27.md`, `docs/tasks/tasks.json` and `docs/index.html`, so the two must never
run concurrently. **It therefore also runs before `FIX-40` and `FIX-53`**, which land
second-to-last and last respectively (`README.md` section 4, Phase G). The package's
order for these four is settled once, in `README.md` Phase G: `FIX-39` → `FIX-46` → … →
`FIX-40` → `FIX-53`.

The commit body opens with the gate's baseline output quoted in Evidence, records the
outcome of removing all thirteen skips, and states — in D17/§5's own terms — that decision
D7 is satisfied by this task's deletion of the gate rather than reversed by it, and that
the 3D viewer remains unapproved and unbuilt. A reader of `git log` who cannot see that
statement there will read the ten 3D items dropping out of the count as work that quietly
happened. Closing the remaining unreached criteria, and reporting the rest as unimplemented
work, is **FIX-72**'s commit, not this one.

**`FIX-72` runs after this task** and carries what was item 3. Nothing in this commit
waits on it, and it does not change the `FIX-39 → FIX-46` order, which exists because
FIX-46's `no-restricted-syntax` rule fails while the thirteen skips are in the tree —
and the skips are item 4, which is here.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
test: remove every spec skip and delete the traceability gate
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
