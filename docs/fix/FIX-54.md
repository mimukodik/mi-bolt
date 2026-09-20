# FIX-54 — Drop the `/mi-bolt/` sub-path deployment

Status: PARTIAL — the `/mi-bolt/` sub-path is gone from the code and the specification: `_provideBaseHref` and its `APP_BASE_HREF`/`environment` imports deleted from `app.config.ts`, the stale `T01-AC04` test block and its only caller `hasUseValue` deleted from `app.spec.ts`, the `/mi-bolt/` clause trimmed from `api-root.ts`'s comment, and the four specification sentences, their three JSON twins and all seven `docs/index.html` mirrors edited; commit 99ea610. `<base href="/">` in `src/index.html` is deliberately untouched, per this document's stated deviation. `npm run build`, `npm run test` and `npx playwright test e2e/deployment/deep-links.spec.ts` all exit 0. Open: AC05–AC08 are the real-browser checks that are the actual proof the `<base href="/">` deviation is safe — deep-link render, the favicon network-log path, in-app navigation and the rendered `docs/index.html` report — deferred to the batched browser-verification pass.
Severity: blocker
Source: Review round item N2 (orchestrator-measured); decision **D14**; `docs/tasks/T01.md:51` (T01-AC05), `docs/tasks/T28.md:43` (T28-AC02), `docs/spec/test-scenarios.md:125` (E119).

## Why this is wrong

The specification requires the application to boot and deep-link under two base paths,
`/` and `/mi-bolt/`, in three separate places: `docs/tasks/T01.md:51` (T01-AC05),
`docs/tasks/T28.md:43` (T28-AC02) and `docs/spec/test-scenarios.md:125` (E119). Not one
of them is reachable. `src/index.html:6` hardcodes `<base href="/">`, `angular.json`
declares no `baseHref` in any configuration, `scripts/serve-static.mjs` has no base-path
option, and the only code that would select the sub-path — the ternary at
`src/app/app.config.ts:30` — is keyed on `environment.apiBase !== '/api/v1'` while all
three environment files set exactly `'/api/v1'`. The sub-path arm is dead in every
shipped configuration, and no test anywhere exercises it.

**This task removes the requirement instead of building it, and that is the user's own
decision, not this task's.** Asked what to do about the gap, the user answered, unprompted:
*"es base href-et torroljuk, nem kell"* ("and let's delete the base href, we don't need
it"). Decision **D14** records it.

**Why a specification edit is allowed here.** Decision **D1** forbids any task from
editing a specification document to match the implementation. That prohibition is not
lifted by this task; it is not engaged. **D1 stops a task from overruling the
specification. It does not stop the user from changing it**, and **D14** is the user
changing it, exactly as **D11** changes `docs/spec/components.md:480-484`. Those two are
the only specification edits this package makes. Record that reasoning in the commit
body, because the next reader will check this edit against D1 first.

## Evidence

**The dead selector.** `src/app/app.config.ts:28-31`:

```ts
const _provideBaseHref: Provider = {
  provide: APP_BASE_HREF,
  useValue: environment.apiBase === '/api/v1' ? '/' : '/mi-bolt/',
};
```

All three environment files set the value the ternary tests for, so the false arm is
unreachable:

```
src/environments/environment.ts:29:  apiBase: '/api/v1',
src/environments/environment.development.ts:22:  apiBase: '/api/v1',
src/environments/environment.e2e.ts:22:  apiBase: '/api/v1',
```

`angular.json` selects between those three files through `fileReplacements`, and
`grep -n "baseHref" angular.json` prints nothing: there is no fourth configuration that
could make `apiBase` anything else.

**The document tag, and the two different jobs it does.** `src/index.html:6` and `:9`:

```html
  <base href="/">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
```

**The provider is redundant while that tag is present.** Measured by reading the
installed Angular, `node_modules/@angular/common/fesm2022/_location-chunk.mjs:70`, inside
`PathLocationStrategy`'s constructor:

```js
this._baseHref = href ?? this._platformLocation.getBaseHrefFromDOM() ?? inject(DOCUMENT).location?.origin ?? '';
```

`href` is the injected `APP_BASE_HREF`. With no provider, the strategy reads the `<base>`
tag from the DOM and arrives at the same `'/'`. With neither the provider nor the tag it
falls through to `location.origin`, an absolute URL — which is the second reason the tag
stays.

**The specification lines that carry the requirement**, all four with their exact text:

```
docs/tasks/T01.md:51:- [ ] **T01-AC05** The app boots under / and /mi-bolt/ with meaningful title and a fatal startup surface; no business feature is faked directly in a component.
docs/tasks/T28.md:43:- [ ] **T28-AC02** Static SPA fallback works for all deep links under / and /mi-bolt/. API paths never silently fallback to index.html; MSW startup failure blocks business actions.
docs/spec/test-scenarios.md:125:|E119|sdk|default|Run under root and /mi-bolt/|SDK and worker resolve same scoped logical API/media paths.|
docs/spec/architecture.md:159:… Test `/` and `/mi-bolt/` deployments and malformed paths. …
```

`docs/tasks/tasks.json:94` and `:1599` and `docs/tasks/test-scenarios.json:2252-2269`
(the `action` value at `:2257`) hold machine-readable twins of the first three, and
`docs/index.html` holds rendered copies at `:277`, `:2641`, `:2645`, `:2687`, `:4115`,
`:4149` and `:5119`. Counting the four source lines below, the sweep in "How to verify"
returns **18** lines across eleven files, and every one of them is this one requirement.

**A correction to the way this defect was first recorded.** The criterion that carries the
boot requirement is **T01-AC05**, not T01-AC04. `docs/tasks/T01.md:50` (T01-AC04) is about
the hu-HU locale and HttpClient and says nothing about a base href. The confusion comes
from `src/app/app.spec.ts:99`, which labels its own block with the wrong number and whose
comment names the right one:

```ts
describe('T01-AC04: APP_BASE_HREF provider', () => {
  it('appConfig exposes a base-href provider', () => {
    const base = providerManifest.baseHref as { provide?: unknown; useValue?: string };
    expect(base).toBeDefined();
    expect(typeof base.useValue).toBe('string');
    // Either '/' (production at /) or '/mi-bolt/' (subpath deployment);
    // the production default satisfies the T01-AC05 deployment test.
    expect(['/', '/mi-bolt/']).toContain(base.useValue);
  });
});
```

**Nothing tests the sub-path half.** `e2e/deployment/deep-links.spec.ts` is the suite that
covers T28-AC02; its eleven tests all request paths under `/` (`:41`, `:53`, `:63`, `:72`,
`:99`, `:120`, `:138`, `:159`, `:171`, `:197`). Across the whole of `e2e/`,
`grep -rn "mi-bolt/" e2e | grep -v "dist/mi-bolt"` returns two lines, both of them
references to `docs/mi-bolt/execution/design-review.md` (`state-matrix.spec.ts:28`,
`keyboard.spec.ts:21`) and neither about a sub-path; every other hit is
`dist/mi-bolt/browser`, the build output directory, whose name is the project. Removing the
requirement therefore deletes no test coverage.

## What to change

**The deviation from the literal instruction, stated plainly.** The user said to delete
the base href. This task deletes the sub-path machinery and **keeps `<base href="/">` in
`src/index.html:6`.** The tag does two jobs and only one of them is the machinery the user
does not need. Angular's router no longer needs it once the provider is gone — and no
longer needs the provider either, per the constructor line quoted above — but the
**browser** uses `<base>` to resolve every relative URL in the document, `favicon.ico` at
`:9` among them. With the tag deleted, a deep link such as `/telefonok/demo-one-5g` would
resolve that icon against the current directory and request `/telefonok/favicon.ico`,
which the static host answers with the SPA shell. `<base href="/">` is the plain default;
removing it is a separate regression, not the removal the user asked for. AC06 below
measures the favicon request path in a real browser, so if the user did mean the tag
itself, the measurement settles it rather than an argument.

### 1. `src/app/app.config.ts` — delete the provider, do not reduce it to `'/'`

Delete the whole `_provideBaseHref` constant at `:28-31` and its entry in the
`providers` array at `:45`. Delete the `APP_BASE_HREF` import at `:8` and the
`environment` import at `:13` — `:30` is the only place either is used, so both become
orphans this change created. Keep the `Provider` type import: `_provideApi` at `:32`
still uses it. Delete the `baseHref` key from `providerManifest` at `:61`.

**Deleted, not reduced to `useValue: '/'`, and the reason is measured, not stylistic.**
`_location-chunk.mjs:70` reads the `<base>` tag when the token is absent, and the tag
stays, so a provider pinned to `'/'` would be a second declaration of a value the
document already carries — the same duplicate-declaration defect this package is
removing elsewhere. `.claude/CLAUDE.md` ("Simplicity first") is the rule: nothing
speculative, no configurability that was not requested.

### 2. `src/app/app.spec.ts` — delete the block at `:99-108`

The whole `describe('T01-AC04: APP_BASE_HREF provider', …)` block goes, because the
symbol it reads (`providerManifest.baseHref`) no longer exists and the criterion it
claims to cover no longer requires a base href. Do **not** replace it with an assertion
that the key is absent: a test that a deleted thing is deleted is noise.

Add one assertion in its place, in the same file, in the nearest `describe` that already
covers `src/index.html`-level deployment facts — or a new one if none exists — asserting
that `providerManifest` has no `baseHref` key, only if the file already has a test that
enumerates the manifest's keys. If it does not, add nothing: the build is the check,
because `app.spec.ts` imports `providerManifest` and a stale key reference fails
`npm run build`.

### 3. The four specification documents — remove the `/mi-bolt/` half of each sentence

Keep every sentence's remaining meaning intact. Change only the clause that names the
sub-path.

- `docs/tasks/T01.md:51` — T01-AC05 becomes: *"The app boots under / with meaningful
  title and a fatal startup surface; no business feature is faked directly in a
  component."*
- `docs/tasks/T28.md:43` — T28-AC02 becomes: *"Static SPA fallback works for all deep
  links under /. API paths never silently fallback to index.html; MSW startup failure
  blocks business actions."*
- `docs/spec/test-scenarios.md:125` — E119's `action` column becomes `Run under root`.
  The row is not deleted: the rest of it ("SDK and worker resolve same scoped logical
  API/media paths") is still a real requirement about `resolveApiRoot` and the service
  worker scope.
- `docs/spec/architecture.md:159` — the sentence *"Test `/` and `/mi-bolt/` deployments
  and malformed paths."* becomes *"Test the `/` deployment and malformed paths."* Change
  nothing else in that paragraph; the rest of it specifies `resolveAssetUrl`, which is
  **FIX-49**'s subject and is not this task's to alter.

### 4. The three machine-readable twins

- `docs/tasks/tasks.json:94` — the `T01-AC05` `text` value, to match T01.md exactly.
- `docs/tasks/tasks.json:1599` — the `T28-AC02` `text` value, to match T28.md exactly.
- `docs/tasks/test-scenarios.json:2257` — the `E119` object's `action` value, to
  match test-scenarios.md exactly. Change nothing else in the object at `:2252-2269`.

The markdown and the JSON must end up word-for-word identical for each criterion, because
`scripts/check-traceability.mjs` reads the JSON and a human reads the markdown.

### 5. `docs/index.html` — the seven rendered copies

These seven are the whole of `docs/index.html`'s share of this task's sweep: running
`FIX-54-AC01`'s own command before the edit
(`grep -rn "mi-bolt/" src docs/spec docs/tasks docs/index.html | grep -v "dist/mi-bolt"
| grep -v "docs/mi-bolt/"`) returns eighteen lines in total, of which exactly these
seven are in this file. Re-run it first and check the seven against what it prints,
rather than trusting the numbers above — two tasks edit `docs/index.html` before this
one and every line number after an edit moves.

Lines `:277`, `:2641`, `:2645`, `:2687`, `:4115`, `:4149` and `:5119`, each a rendered
twin of one of the four sentences above. Apply the identical wording. Three of the seven
are easy to miss and must not be: `:2641` is a `data-search` JSON attribute on the T01
`<details>` element, and `:2645` and `:4115` are single lines packing several criteria into
`<div class="criterion">` blocks. Do not reformat the surrounding HTML: these are long
single lines and a reflow would bury the edit.

### 6. `src/app/core/api/api-root.ts:7` — the comment

```
// URL to `/api/v1`; we concatenate that with the runtime origin so local
// dev, the `/mi-bolt/` subpath build and any other deployment reach MSW on
```

Remove the words `the /mi-bolt/ subpath build and` so the comment stops describing a
build that no longer exists. Change no code in that file: `resolveApiRoot` reads only
`new URL(baseUri).origin`, which is unaffected by this task either way.

### 7. What this does to FIX-49, stated but not done here

`docs/spec/architecture.md:159` is the line that specifies `resolveAssetUrl`, and **it is
the only reason FIX-49 exists in the shape it was designed**: FIX-49 builds the function
to resolve assets under the sub-path, and **FIX-49-AC05** exists specifically to record
that T28-AC02's `/mi-bolt/` half is *not* closed by building it. After this task that half
does not exist, so FIX-49's sub-path test cases and AC05 have nothing left to assert.

**This task does not rewrite FIX-49, and it no longer needs to: the review round settled
it, and the reading this task offered was confirmed.** `FIX-49` has been reduced rather
than dropped, because `architecture.md:159` still requires the function for a reason this
decision does not touch — rejecting `..`, encoded traversal, protocol-relative and
absolute-URL inputs, and rejecting any resolved URL outside the same-origin assets
prefix. `FIX-49.md:26-39` records what changed: Evidence item 4's three
`/mi-bolt/`-deployment measurements are gone, the non-root base-URI test rows stay as a
test of the helper's algorithm rather than as evidence for a deployment, and
**FIX-49-AC05** now checks that this task's removal is the reason T28-AC02 has only a `/`
half — and that `<base href="/">` survives at `src/index.html:6`, which this task keeps.
**FIX-40** is affected the same way and has been reduced with it: it records T28-AC02 as
it reads on the day it runs rather than recording a `/mi-bolt/` half as an honest failure.

## Out of scope

- **`src/index.html:6` itself.** The tag stays. This is the stated deviation; it is
  measured by AC06 rather than argued.
- **`scripts/serve-static.mjs`.** It has no base-path option and now needs none. Add
  nothing to it. **FIX-40** owns the static release and **FIX-47** owns its npm script.
- **`src/app/shared/media/resolve-asset-url.ts` and the asset manifest — `FIX-49`.** Do
  not create, reduce, or delete that function here, and do not edit `FIX-49.md`.
- **`docs/design/asset-manifest.json`'s four broken `path` values — `FIX-36`.** A
  different defect in a different file.
- **Every other `docs/mi-bolt/<x>` string in `docs/index.html` and in the task packets —
  `FIX-36` and `FIX-36b`.** Those are wrong path prefixes under decision **D2**; this task
  touches **seven** lines of `docs/index.html` (item 5 lists them) and **three** JSON
  values — two in `docs/tasks/tasks.json` (`:94`, `:1599`) and one in
  `docs/tasks/test-scenarios.json` (`:2257`) — all of them criterion prose, none of them a
  path. **`docs/index.html` is `FIX-36`'s file and
  `docs/tasks/*.md` are `FIX-36b`'s**: the regions are disjoint, but the two tasks must
  never run at the same time. Whichever lands second keeps both changes and says so in its
  commit body.
- **`src/app/app.spec.ts`'s other blocks.** Only the base-href block goes.
- **The `providerManifest` pattern itself.** It is deliberate (`app.config.ts:50-56`
  explains why); this change removes one key from it, not the mechanism.
- **Renaming `dist/mi-bolt/browser` or anything else containing the string `mi-bolt`.**
  That is the project name, not the sub-path.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`). `src/app/app.spec.ts` is one of the 14
files `ng test` cannot run, so **do not gate on that command's exit code**; `FIX-04` is
what turns it green.

```bash
npm run build                       # expected exit 0
grep -rn "mi-bolt/" src docs/spec docs/tasks docs/index.html | grep -v "dist/mi-bolt" | grep -v "docs/mi-bolt/"
                                    # expected: no lines
npx playwright test e2e/deployment/deep-links.spec.ts
                                    # record the exit code; see the note below
```

The second command is the sweep that proves the requirement left every copy. **Measured on
commit `db6d295` it prints 18 lines, and that is the full inventory this task removes**, so
run it before the change as well and check that the 18 are the ones listed in Evidence.
Both exclusions are load-bearing and neither may be dropped: `dist/mi-bolt` is the build
output directory, whose name is the project rather than the sub-path, and `docs/mi-bolt/`
is the wrong path prefix that **FIX-36** and **FIX-36b** own plus the correct
`docs/mi-bolt/execution/` paths that must survive. Without the second exclusion the same
command prints 490 lines and this criterion could never pass. The sweep is deliberately not
pointed at `docs/fix/`: this package quotes the old wording as evidence and must keep it.

`npx playwright test e2e/deployment/deep-links.spec.ts` names one spec on purpose. **A
bare `npx playwright test` rewrites 49 tracked screenshots under
`e2e/design/screenshots/`** and belongs to `FIX-09`; never run it here. The deep-links
suite is red at baseline for reasons `FIX-09` owns — record its exit code and the failing
test names, and confirm only that the set of failures is no larger than before this
change.

Then the browser pass, which is mandatory and is the measurement the deviation rests on:

```bash
npm run build
PORT=4200 node scripts/serve-static.mjs   # serves dist/mi-bolt/browser on 127.0.0.1:4200
```

Stop the server when the checks are done.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R01 applies**: the brand assets — the favicon at `src/index.html:9` and everything
  under `public/assets/` — must still resolve on a deep link after the change. AC06 is the
  measurement.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R02–R25: N/A. This change removes one dependency-injection provider, deletes one unit
  test block, and edits **fifteen** sentences of prose — four specification sentences
  (item 3), three machine-readable twins (item 4), seven rendered copies in
  `docs/index.html` (item 5) and one source comment (item 6). It introduces no colour,
  no dimension, no copy the user reads, no layout, no state machine, no focus behaviour
  and no new component. The one rendered surface it touches, `docs/index.html`, changes
  by **seven** lines of body text inside existing elements, which alters no rule in the
  table.

## Acceptance criteria

- [ ] **FIX-54-AC01** `grep -rn "mi-bolt/" src docs/spec docs/tasks docs/index.html | grep -v "dist/mi-bolt" | grep -v "docs/mi-bolt/"`
      prints nothing.
- [ ] **FIX-54-AC02** `grep -n "APP_BASE_HREF" src/app/app.config.ts src/app/app.spec.ts`
      prints nothing, and `npm run build` exits 0.
- [ ] **FIX-54-AC03** `docs/tasks/T01.md:51` and the `T01-AC05` `text` value in
      `docs/tasks/tasks.json` are word-for-word identical, and the same holds for
      `docs/tasks/T28.md:43` and the `T28-AC02` `text` value, and for
      `docs/spec/test-scenarios.md`'s `E119` row and the `E119` object's `action` value in
      `docs/tasks/test-scenarios.json`.
- [ ] **FIX-54-AC04** `src/index.html:6` still reads exactly `<base href="/">`. This
      criterion records the deviation from the literal instruction; it is expected to pass
      by the tag being untouched.
- [ ] **FIX-54-AC05** **Real-browser check, deep link at `/`.** With the production build
      served by `scripts/serve-static.mjs` at 1440×900, open
      `http://127.0.0.1:4200/telefonok/demo-one-5g`. The product page renders, the URL bar
      still shows that path, and `list_console_messages` reports zero errors.
- [ ] **FIX-54-AC06** **Real-browser check, the favicon request path — this is the
      measurement that settles the deviation.** On the same deep-link load, read the
      network log: the request for `favicon.ico` has the path `/favicon.ico` and a status
      below 400. It must **not** be `/telefonok/favicon.ico`. Capture the network-log
      entry and put it in the commit body, because that entry is the evidence for keeping
      `<base href="/">`.
- [ ] **FIX-54-AC07** **Real-browser check, in-app navigation still resolves.** From the
      same page, click through to the catalogue and back to the home page using the
      header links only (no reload). Both routes render, the URLs are `/telefonok` and
      `/`, and the console stays free of errors. This is what proves the router still has
      a working base href with the provider gone.
- [ ] **FIX-54-AC08** **Real-browser check of `docs/index.html`.** Open the edited report
      in a browser and account for **all seven** edited positions, not four. Confirm
      that the four standalone criterion texts at `:277`, `:2687`, `:4149` and `:5119`
      render as edited; that the two packed `<div class="criterion">` lines at `:2645`
      and `:4115` render their T01 and T28 criteria as edited and that the other
      criteria packed on those same lines are unchanged — item 5 calls these two *"easy
      to miss"*, and until now no criterion looked at them; and that a search for the
      T01 and T28 criteria still finds them, which is what `:2641`'s `data-search`
      attribute drives. Then confirm that an in-page search for `mi-bolt/` returns no
      hit in a criterion text, that the report's own search and section navigation still
      work, and that the console reports zero errors. Screenshot each of the four
      standalone positions and both packed ones.
- [ ] **FIX-54-AC09** `npx playwright test e2e/deployment/deep-links.spec.ts` fails no
      test that passed before this change. Record both exit codes and both failing-test
      lists in the commit body; the remaining failures belong to `FIX-09`.
- [ ] **FIX-54-AC10** The commit body states, in its own words, that this is a
      specification edit made on the user's decision **D14** and not a task overruling
      **D1**, quotes the user's instruction, states the deviation (the sub-path machinery
      goes, `<base href="/">` stays) and the AC06 measurement that backs it, and records
      that **FIX-49** and **FIX-40** were both reduced before this task runs — **FIX-49**
      depends on `<base href="/">` surviving and its **AC05** stops the task if it has
      gone.

## Commit

This task is exactly one commit. The source deletion, the four specification sentences,
the three JSON twins and the four rendered copies are one change: a requirement leaving
the product. Splitting them would leave the repository in a state where the code cannot do
what the specification still asks for, which is the defect this task removes. Do not
bundle it with any other FIX task, and in particular not with **FIX-49** or **FIX-40**,
whose reduction is the review round's to decide. Commit only after every acceptance
criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: drop the /mi-bolt/ sub-path deployment requirement
```
