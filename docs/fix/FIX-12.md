# FIX-12 — Stop swallowing the bootstrap failure, and remove the phantom heading it leaves behind

Status: PLANNED — not executed.
Severity: blocker
Source: A2 finding 2, plus a browser finding (a second `<h1>` on `/` and on every
`/penztar/*` route) that no auditor connected to it. They are one defect.

## Why this is wrong

`docs/tasks/T05.md:45` (T05-AC01) requires the application to *"render explicit retryable
fatal state if registration/startup fails"*, and `docs/spec/components.md:19-21` makes
AppRoot's job *"coordinate fatal bootstrap surface without rendering invented commerce
data"* with required states `booting,ready,fatal`. `src/main.ts:57-59` catches the
mock-preparation failure, logs it, and boots anyway. An application whose entire data layer
is MSW cannot usefully continue without it: every screen then renders an error or an empty
state with no explanation, which is the *"invented commerce data"* case in a different
costume.

The same markup is the second half of the defect. `src/app/app.html:10-16` carries the
fatal surface — including its own `<h1>` — inside AppRoot's always-rendered template, so
every route in the application ships two `<h1>` elements in its DOM.
`docs/spec/test-scenarios.md:111` (E105) requires **"One H1"** per route. And because the
surface lives inside AppRoot's template, `showFatal()` cannot find it in any case where it
is actually needed, so the retryable fatal state T05-AC01 asks for has never been reachable
at all.

Under D1 the specification is right and the code is wrong.

## Evidence

### 1. The failure is swallowed

`src/main.ts:56-60`:

```ts
  const { prepareMocks } = await import('./core/bootstrap-demo');
  await prepareMocks().catch((err) => {
    console.error('[MiBolt] Mock preparation failed; continuing without mocks:', err);
  });
  bootstrapApplication(App, appConfig).catch(showFatal);
```

`src/core/bootstrap-demo.ts:14-16` documents the contract the caller is breaking:

```ts
 * Steps 2 and 3 run sequentially; if either fails the function
 * throws so the caller (`src/main.ts`) can render the fatal-startup
 * surface defined in `app.html`.
```

`prepareMocks()` does throw — `:45` on a production misuse and, by propagation, on any
failure inside `persistence.hydrate(...)` (`:62`) or `startMockWorker(...)` (`:63`). The
`.catch()` at `main.ts:57-59` consumes every one of them. The justification is written out
at `main.ts:44-49`: *"A failure to start the worker is logged but does NOT block bootstrap
… The worker is a development convenience; the app should still boot without it."* That is
the sentence to argue with: in this repository the worker is not a convenience, it is the
only source of product, cart, checkout, payment and order data.

### 2. `showFatal` cannot find its own markup

`src/main.ts:65-71`:

```ts
function showFatal(err: unknown): void {
  console.error('[MiBolt] Bootstrap failed:', err);
  const fatal = document.querySelector<HTMLElement>('app-fatal');
  if (fatal) {
    fatal.hidden = false;
  }
}
```

`<app-fatal>` is written at `src/app/app.html:10`, inside the template of the `App`
component. That template is only in the document **after** `bootstrapApplication` has
succeeded far enough to render `App`. So:

- If `bootstrapApplication` rejects, `App` never rendered, `document.querySelector('app-fatal')`
  returns `null`, and `showFatal` is a silent no-op.
- If the `.catch()` at `:57-59` is removed so a mock failure skips bootstrap, `App` never
  renders either, and `showFatal` is again a no-op.

**There is no path on which the fatal surface can appear.** `if (fatal)` turns the miss
into silence rather than an error, which is why nothing has ever reported it.

### 3. The phantom heading

`src/app/app.html:10-16`:

```html
<app-fatal class="block" role="alert" aria-live="assertive" hidden>
  <h1 class="m-0 mb-2 text-xl font-semibold">A MiBolt demó indítása sikertelen</h1>
  <p class="m-0 leading-relaxed">
    A bemutató nem tudott elindulni. Frissítsd az oldalt, vagy
    ellenőrizd a böngésző konzolját a részletekért.
  </p>
</app-fatal>
```

A browser run on the baseline found this second `<h1>`, with a zero-size bounding rect, on
`/` and on every `/penztar/*` route — which is simply every route, because AppRoot's
template is on all of them. Its text is `A MiBolt demó indítása sikertelen` ("The MiBolt
demo failed to start"). `docs/spec/test-scenarios.md:111` requires one H1 per route.

**One part of the browser finding is not settled from source and the executor should know
which.** The finding was reported as something a screen-reader user browsing by heading
meets on every page. `src/app/app.scss:35-37` declares `app-fatal[hidden] { display: none; }`,
and a `display: none` subtree is normally removed from the accessibility tree, in which
case a screen reader would not announce it while the DOM query and any heading-outline tool
would still find it. This task does not depend on which of the two it is: both are the same
defect — a heading that belongs to a failure surface is sitting in the document of every
healthy page — and both are fixed by the same change. What would settle it is an
accessibility-tree dump or an axe run against a healthy route, which is **FIX-29's**
subject, not this one's. Do not spend time on it here; state in the commit body which of
the two the post-change browser run observed.

## What to change

Seven files: `src/index.html`, `src/main.ts`, `src/app/app.html`, `src/app/app.ts`,
`src/app/app.scss`, `src/styles/primitives.css` and `src/app/app.spec.ts`.

The design decision, made here so the executor does not have to make it: the
fatal surface moves **out of the Angular template** into an inert `<template>` element in
`src/index.html`, and `showFatal` clones it into the document when it is needed. That is the
only arrangement that satisfies both halves at once — a `<template>`'s content lives in a
separate document fragment, so it is not in the rendered tree, not in the accessibility
tree and not found by `document.querySelectorAll('h1')`, while still being reachable by a
plain DOM call when `bootstrapApplication` has not run.

### 1. `src/index.html` — add the inert fatal template

Insert immediately after `<app-root></app-root>` (currently `src/index.html:12`), inside
`<body>`:

```html
  <template id="mi-bolt-fatal">
    <div class="app-fatal" role="alert" aria-live="assertive">
      <h1 class="app-fatal__title">A MiBolt demó indítása sikertelen</h1>
      <p class="app-fatal__body">
        A bemutató nem tudott elindulni. Frissítsd az oldalt, vagy
        ellenőrizd a böngésző konzolját a részletekért.
      </p>
      <button type="button" class="app-fatal__retry" data-testid="fatal-retry">
        Újratöltés
      </button>
    </div>
  </template>
```

The Hungarian copy of the heading and the paragraph is carried over **verbatim** from
`src/app/app.html:11-15`. The button is new and is what makes the state *retryable*, which
is the word T05-AC01 uses; today the surface only tells the user to refresh by hand. Its
label `Újratöltés` is the ordinary Hungarian word for "reload" and matches the copy in the
paragraph above it.

The Tailwind utility classes from the old markup (`block`, `m-0 mb-2 text-xl font-semibold`,
`m-0 leading-relaxed`) are **dropped** and replaced by the three `app-fatal*` class names
above, because `src/index.html` is outside the Angular component tree and the styles now come
from a global stylesheet rather than from a component-scoped one.

### 2. `src/main.ts` — fail loudly, and build the surface when it is needed

Replace `:56-60` with:

```ts
  const { prepareMocks } = await import('./core/bootstrap-demo');
  try {
    await prepareMocks();
  } catch (err) {
    // MSW is the application's entire data layer, not a development
    // convenience: every screen would render an error or an empty
    // state with no explanation. T05-AC01 requires an explicit,
    // retryable fatal state instead of a half-booted application.
    showFatal(err);
    return;
  }
  bootstrapApplication(App, appConfig).catch(showFatal);
```

**If `FIX-51` has already landed, the imported symbol is `startMocks` and it returns
`void`**; bind and call that name instead, and change nothing else in the block above. If
it has not, write `prepareMocks` as shown and `FIX-51` renames it, this `try`/`catch`
included. Say in the commit body which of the two applied. See "Out of scope".

Replace `showFatal` (`:65-71`) with:

```ts
function showFatal(err: unknown): void {
  console.error('[MiBolt] Bootstrap failed:', err);
  const template = document.querySelector<HTMLTemplateElement>('#mi-bolt-fatal');
  if (template === null) {
    // The template is part of src/index.html and cannot legitimately
    // be absent. Fail loudly rather than leaving a blank page: the old
    // implementation's silent `if (fatal)` is why this path was never
    // noticed to be unreachable.
    throw new Error('[MiBolt] fatal surface template #mi-bolt-fatal is missing from src/index.html');
  }
  const fragment = template.content.cloneNode(true);
  document.body.appendChild(fragment);
  document
    .querySelector<HTMLButtonElement>('[data-testid="fatal-retry"]')
    ?.addEventListener('click', () => globalThis.location.reload());
}
```

Also rewrite the paragraph at `:44-49` so the file no longer documents the behaviour being
removed. Replace it with a sentence saying that a mock-startup failure renders the fatal
surface and does not bootstrap, and name T05-AC01.

### 3. `src/app/app.html` and `src/app/app.ts` — remove the surface from the component

Delete `src/app/app.html:10-16` (the whole `<app-fatal>` element) and the two sentences of
the comment at `:3-6` that describe it. The file is left with the skip link and the router
outlet.

In `src/app/app.ts`, remove `CUSTOM_ELEMENTS_SCHEMA` from the import on `:1` and the
`schemas: [CUSTOM_ELEMENTS_SCHEMA],` line at `:17`. `<app-fatal>` was the only custom
element in the template, so the schema has no remaining purpose. Delete the paragraph of
the class docblock at `:10-12` that explains it.

`src/app/app.spec.ts:30-36` is the test that pins the element being removed:

```ts
  it('exposes a fatal-startup fallback element, hidden by default', () => {
    const root = TestBed.createComponent(App);
    root.detectChanges();
    const fatal = root.nativeElement.querySelector('app-fatal');
    expect(fatal).toBeTruthy();
    expect(fatal?.hasAttribute('hidden')).toBe(true);
  });
```

Replace its body so it asserts the opposite: `querySelector('app-fatal')` is `null` and
`querySelectorAll('h1').length` is `0` on AppRoot's own element before the router has
rendered a route. Rename it to say what it now checks. Leave the rest of the file alone —
in particular the case at `:21-28`, which asserts the first `h1` in the rendered tree
contains `MiBolt`; it keeps passing because the home route's own heading
(`src/app/features/home/hero.html:3-5`, `Mobiltelefonok a MiBolt demóban`) contains that
word too, and it becomes the first `h1` once the fatal one is gone.

**That spec cannot be executed until FIX-04 lands, and the executor must not be surprised
by it.** The repository has two disjoint suites: `vitest.config.ts:506` sets
`include: ['tests/**/*.spec.ts']`, so the 30 specs under `tests/` are the ones plain
`vitest run` executes, while the 14 specs under `src/` are run only by the
`@angular/build:unit-test` builder behind `npm run test` — which is the suite that fails
14/14 at the baseline with `ReferenceError: document is not defined`. Make the edit anyway;
verification for it is the browser check and the build, and FIX-04 is what will finally run
it.

### 4. The styles move to the global stylesheet

`src/app/app.scss:27-46` holds the `app-fatal` rules. They are component-scoped, so once
the markup lives in `src/index.html` they stop applying. Move them into
`src/styles/primitives.css` — which `angular.json:28-32` loads globally, alongside
`tokens.css` and `styles.css` — renaming the selectors to match the new class names:

| `app.scss` selector | new selector in `primitives.css` |
|---|---|
| `app-fatal` | `.app-fatal` |
| `app-fatal[hidden]` | *(delete — the template is inert, nothing is hidden)* |
| `app-fatal h1` | `.app-fatal__title` |
| `app-fatal p` | `.app-fatal__body` |

Add one rule for the new button. Give it the shared control height and radius the token set
already defines rather than inventing dimensions:

```css
.app-fatal__retry {
  min-height: var(--size-control);
  border-radius: var(--radius-control);
  padding: 0 var(--space-4);
  cursor: pointer;
}
```

**Move the declarations verbatim otherwise.** Three of them are hardcoded colour literals
(`background: #fdecea`, `color: #171b1f`, `border: 1px solid #b3261e`) and FIX-17 owns
replacing those with tokens. Do not tokenise them here and do not leave them behind in
`app.scss`: whichever of the two tasks runs second applies its change to wherever the rules
then live, and neither re-does the other's work. Note in the commit body that the rules
moved, so FIX-17's executor can find them.

After the move, `src/app/app.scss` keeps only `:host` and the two `.skip-link` rules.

## Out of scope

- **Tokenising the colour and spacing literals in the moved rules — FIX-17.** Move them
  as they are.
- **The axe violations and the accessibility-tree question raised in Evidence — FIX-29.**
- **Focus management after the fatal surface appears — FIX-30 owns dialog focus.** The
  surface here is appended to `body`, not a dialog, and carries `role="alert"` already.
- **`src/core/bootstrap-demo.ts`.** Its contract is already correct; this task fixes the
  caller, not the callee. Do not move the file either (A3 finding 11 proposes relocating it
  into `src/app/core/`; no FIX number owns that and the orchestrator has been told).
- **The function's name — FIX-51.** Decision **D10** renames `prepareMocks` to
  `startMocks`, returning `void`, to match `docs/tasks/T05.md:29`; **FIX-51**'s Part 2
  carries it and it touches the same two lines of `src/main.ts` this task rewrites. The
  two tasks must not run at the same time, and the orchestrator sequences them. Whichever
  lands second keeps both changes — the call is `startMocks()` **and** it is inside this
  task's `try` — and says in its commit body which order applied. Do not rename anything
  here.
- **The MSW persistence work — FIX-10.** That task also concerns the bootstrap path but
  touches `src/mocks/` and `src/app/core/api/`, not `src/main.ts`.
- **`src/app/features/not-found/not-found-page.html`, which also has an `<h1>`.** That one
  is the route's own and correct; it is the second, always-present heading that is the
  defect. FIX-15 flags a different problem in that file.
- **Every other route's `<h1>`.** Do not go through the feature templates renumbering
  headings.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

1. `npm run build` — must exit `0`. Green at the `db6d295` baseline and must stay green.
   This is also the check that catches a missed `CUSTOM_ELEMENTS_SCHEMA` reference.

2. Run `npm run test` before your first edit and again after your last, and record both
   coverage figures in the commit body. There is no target number: the pair is the
   evidence that this task did not reduce coverage, and **FIX-08** is what turns the
   thresholds into a gate. Do not carry the 56.42 % figure forward — it was measured by
   `npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
   denominator that no longer exist, so it cannot be compared with anything `ng test`
   reports.

3. `npx vitest run tests/layouts.spec.ts` — must exit `0`. That suite mounts layout
   components and is the closest `tests/` coverage of the shell this task edits.

4. The two browser runs described in FIX-12-AC01 and FIX-12-AC02. Start the app with
   `npm start` and drive it through a real browser per
   `.claude/rules/browser-verification.md`; the agent takes the snapshots, the screenshots
   and the console reads, and the orchestrator starts and stops the server.

   To reach the failure path for FIX-12-AC02 without editing production code, unregister
   the service worker and block `/mockServiceWorker.js` before the first load: in the
   browser, `navigator.serviceWorker.getRegistrations()` then `.unregister()` on each, and
   request-block the `mockServiceWorker.js` URL, then reload. `startMockWorker`
   (`src/mocks/browser.ts:141-160`) awaits `worker.start({ serviceWorker: { url:
   '/mockServiceWorker.js' } })`, which rejects when that script cannot be fetched, and
   that rejection is exactly the one `prepareMocks()` propagates. If the executor cannot
   reproduce it that way, temporarily renaming `public/mockServiceWorker.js` is acceptable
   **provided the rename is undone and `git status --short` is clean of it before the
   commit**; say in the commit body which method was used.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-12-AC01** **Real-browser check on the healthy application, mandatory.** At
      viewport width 1440, open `/`, `/telefonok`, `/kosar` and `/penztar/adatok` in turn. On
      each, `document.querySelectorAll('h1').length` returns **`1`**, and
      `document.body.textContent.includes('A MiBolt demó indítása sikertelen')` returns
      `false`. At the baseline the first returned `2` on every one of those routes.
      `list_console_messages` reports zero errors on each route. Screenshot each route.
- [ ] **FIX-12-AC02** **Real-browser check on the failure path, mandatory.** With
      `/mockServiceWorker.js` unreachable (see "How to verify" step 4), load `/`. The page
      renders the text `A MiBolt demó indítása sikertelen` **visibly** — a non-zero
      `getBoundingClientRect()` on the rendered element — together with a button labelled
      `Újratöltés`. The router outlet's content is **not** rendered: no product grid, no
      header navigation, no empty-cart message. Clicking `Újratöltés` reloads the page.
      Screenshot the failure surface. At the baseline this path rendered the full
      application with no data and no warning of any kind.
- [ ] **FIX-12-AC03** `grep -rn "app-fatal" src/app | grep -v "^src/app/app.spec.ts:"`
      returns no match. `src/app/app.spec.ts` is the one permitted holder under
      `src/app/`, because **FIX-12-AC06** requires the rewritten case to assert
      `querySelector('app-fatal')` is `null` — deleting that assertion to make an
      unscoped grep pass would delete the regression guard this task exists to install.
      Outside `src/app/` the string survives only in `src/index.html` (as
      `#mi-bolt-fatal` and the `.app-fatal*` class names) and in
      `src/styles/primitives.css`. At the baseline the same scoped grep returned eight
      lines across four files.
- [ ] **FIX-12-AC04** `grep -n "CUSTOM_ELEMENTS_SCHEMA" src/app/app.ts` returns no match,
      and `npm run build` exits `0`. The second half is what proves the removal was safe.
- [ ] **FIX-12-AC05** `src/main.ts` contains no `.catch(` attached to the mock-bootstrap
      call. Check with `grep -nE "(prepareMocks|startMocks)\(\)\.catch" src/main.ts`, which
      must print nothing. Both names are in the pattern because **FIX-51** renames the
      function under **D10** and either order is allowed; the criterion holds whichever
      name `src/main.ts` carries when it runs.
- [ ] **FIX-12-AC06** `src/app/app.spec.ts` contains a named case asserting that a rendered
      `App` component's own element contains zero `h1` elements and zero `app-fatal`
      elements, and contains no `expect(fatal).toBeTruthy()`. **This criterion is satisfied
      by the edit, not by a green run:** the 14 specs under `src/` are executed only by
      `npm run test`, which fails 14/14 at the baseline for a reason FIX-04 owns. Record
      that in the commit body rather than claiming a passing suite.
- [ ] **FIX-12-AC07** `npm run build` exits `0`, unchanged from the `db6d295` baseline.
      `npm run test` exits with the outcome recorded per this clause: **FIX-04** owns
      `ng test`'s baseline failure of 14 of 14 files; if it has not landed, record that
      verbatim and run this task's own spec with
      `npx vitest run src/app/app.spec.ts` instead, which must exit `0`.
- [ ] **FIX-12-AC08** Design rules recorded in the commit body. **Applicable and met:
      R15** (`Clearly label demo data as demo data; do not claim a real order, payment or
      sent email after a simulation`) — the fatal surface says the demo failed to start and
      claims nothing else; **R19** (`No results, network error, loading, success and
      disabled are distinct states`) — the fatal state is now distinct from and exclusive of
      the booted application, which is the defect this task fixes; **R20** (`Every
      interactive element must support keyboard operation, visible focus and a meaningful
      accessible name`) — the new `Újratöltés` button is a native `<button>` with a visible
      text label, and the browser run in FIX-12-AC02 records reaching it with Tab and
      activating it with Enter; **R21** (`minimum 44×44 CSS px target area`) — the button's
      `min-height: var(--size-control)` is the 44 px token at
      `src/styles/tokens.css:59`, and the browser run records its measured
      `getBoundingClientRect()` height and width; **R12** (`Use Hungarian UI labels with
      correct accents`) — the carried-over copy and the new button label are Hungarian with
      correct accents; **R26** — the commit body names the files changed, the commands run
      with their exit codes, the method used to reproduce the failure path, and which of the
      two readings in Evidence section 3 the post-change browser run observed. R01–R11,
      R13, R14, R16–R18 and R22–R25 are **N/A: this task moves an error surface and its
      styles without changing any shopping screen's layout, imagery, pricing or data.**
      Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task
      records the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with FIX-10, FIX-11, FIX-13 or any other
FIX task. The two halves — the swallowed failure and the phantom heading — are one commit
because they are one defect: the heading is the failure path's own UI, rendered on every
page because the failure path was never wired up. Commit only after every acceptance
criterion above passes, including both browser checks.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `fix: F3 success page receipt fallback
(sessionStorage)`):

```text
fix: render the retryable fatal state instead of booting without mocks
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

Nothing has to land before this one.

**FIX-17 should land after it**, because this task moves `app.scss:27-46` into
`src/styles/primitives.css` and FIX-17 is the task that tokenises those declarations. If
FIX-17 lands first, this task moves the tokenised rules instead — the move is the same
either way, and neither task re-does the other's work.
