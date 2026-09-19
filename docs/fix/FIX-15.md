# FIX-15 — Delete the dead components and the speculative hook

Status: DONE — 627d6e0. Verified against the tree 2026-09-20: src/app/home/ is absent, mobile-drawer-host.* intact, quote-state.ts has no onDestroy hook. AC03 and AC04 were criteria whose own premise FIX-06 and db6d295 had already removed, not open work.
Severity: minor
Source: A6 4.1, 4.2, 4.4 and 4.8; A3 settled question 1 and finding 10. **A6 4.4 is wrong
and this task does not carry out its recommendation — see Evidence.**

## Why this is wrong

`.claude/CLAUDE.md` ("Simplicity first") rules out speculative code: *"No abstractions for
single-use code. No 'flexibility' or 'configurability' that was not requested."*
`.claude/rules/code-standards.md` ("A cut feature leaves nothing behind") is the harder
version, quoting the user directly: *"nem hagyunk szemetet"* ("we leave no rubbish").
`docs/spec/architecture.md:71-99` lists the intended source tree and `src/app/home/` is
not in it.

Three things in `src/` exist and are reachable by nothing: a placeholder home page that a
later task superseded, two orphaned catalogue files, and a `destroyRef.onDestroy` callback
whose own comment says it is *"kept as a hook for future cleanup work"*.

## Evidence

### 1. `src/app/home/` is dead — 3 files

`ls src/app/home/` returns `home-page.html` (4 lines), `home-page.scss` (2 lines) and
`home-page.ts` (50 lines). Measured on `db6d295`: `grep -rn "app/home/home-page" src`
returns nothing, and the live route imports the other one —
`src/app/app.routes.ts:115-119`:

```ts
        loadComponent: async () => {
          const m = await import('./features/home/home-page');
          await resolveLazyResources();
          return m.HomePage;
        },
```

The file's own docblock (`src/app/home/home-page.ts:4-7`) describes it as a placeholder:
*"The page renders a one-line Hungarian welcome placeholder; business data, real catalogue
tiles and the catalogue shortcut live in later task packets."* Those later packets shipped.
A3 settled question 1 reaches the same verdict independently.

Note that A6 4.1 and A3 finding 10 disagree on the count — three files and four. The
directory holds **three**. The count is not load-bearing; delete the directory.

### 2. `catalog-page.html` and `catalog-page.scss` are orphans **only until FIX-14 runs**

`src/app/features/catalog/catalog-page.ts` declares its template and styles inline
(`:66-595`) and never references the two files beside it. They are unreferenced today.

**FIX-14 makes them live**, by moving the inline template and styles into exactly those two
files. So the order between the two tasks is not a preference:

> **If FIX-14 has already landed, do not delete these two files. They are the component's
> template and stylesheet.** Check before touching them:
> `grep -n "templateUrl\|styleUrl\|template:\|styles:" src/app/features/catalog/catalog-page.ts`.
> A `templateUrl:` means FIX-14 landed and this bullet is finished work. A `template:`
> means it has not, and the two files are still orphans — but deleting them then costs
> FIX-14 nothing, because FIX-14 overwrites them from the inline content either way.

The safe instruction, which holds in both orders: **delete these two files only if
`catalog-page.ts` still carries an inline `template:`.** Otherwise leave them and record in
the commit body that FIX-14 already claimed them.

### 3. A6 4.4 is wrong: `MobileDrawerHost` is **not** dead

A6 4.4 reports *"`grep -rln "MobileDrawerHost" src --include="*.spec.ts"` returns **zero
files**. Built for a purpose never realized; unreferenced by anything."* The grep is
correct and the conclusion is not: the spec that mounts it is not under `src/`.
`grep -rn "MobileDrawerHost" src tests e2e` on `db6d295` returns:

```
tests/layouts.spec.ts:34:import { MobileDrawerHost } from '../src/app/core/navigation/mobile-drawer-host';
tests/layouts.spec.ts:314:        MobileDrawerHost,
tests/layouts.spec.ts:330:    const f = TestBed.createComponent(MobileDrawerHost);
src/app/layouts/layouts.spec.ts:667:    const f = TestBed.createComponent(MobileDrawerHost);
```

The component does exactly what its docblock (`src/app/core/navigation/mobile-drawer-host.ts:5-15`)
says it does, for exactly the spec it says it was built for. **Do not delete
`src/app/core/navigation/mobile-drawer-host.ts`, `.html` or `.scss`.**

Why A6 missed it is itself the finding: the spec lives in the root `tests/` directory
rather than beside the component, which is the misplacement the user raised —
*"test filleok sem jo helyen vannak"* ("the test files are not in the right place
either") — and which **FIX-06** owns. Nothing else changes here.

One claim inside that docblock is unverified and this task does not act on it: it asserts
that *"Vitest transforms files under `tests/` without enabling the TypeScript
experimentalDecorators flag, so test specs cannot declare inline `@Component` classes"*,
while `vitest.config.ts` ships a plugin whose whole purpose is that transform. Settling it
belongs to FIX-04 and FIX-06, not here.

### 4. The speculative hook — `src/app/features/checkout/quote-state.ts:131-141`

```ts
  constructor() {
    // Drop the active quote when the facade invalidates it (the
    // user re-edited an earlier step). The page calls `refresh()`
    // after the user returns to the review screen, so this effect
    // only has to mark the state as `idle` — it does NOT trigger a
    // new network call automatically.
    this.destroyRef.onDestroy(() => {
      // No-op: signals dispose themselves when the injector tears
      // down. Kept as a hook for future cleanup work.
    });
  }
```

The callback body is empty and the comment says so. The five lines of comment above it
describe an effect that is not in the constructor at all.

### 5. Related finding, flagged and **not fixed here** — the 404 page renders unstyled

`src/app/features/not-found/not-found-page.ts` declares `templateUrl` and **no**
`styleUrl`; `ls src/app/features/not-found/` lists only `not-found-page.ts` and
`not-found-page.html`. The template applies a class that is defined nowhere:

```html
    <section class="not-found">
      <h1>Az oldal nem található</h1>
```

Measured: `grep -rn "\.not-found\b" src` returns nothing. A browser agent confirmed the
consequence independently — plain black text, no card, top-left aligned, no page styling of
any kind. `docs/spec/screens.md:27` also requires *"404 with Home/Catalogue links"* and the
template offers only a home link (`not-found-page.html:6`).

**Neither half is fixed by this task**, which deletes code rather than writing stylesheets,
and **FIX-41** owns the 404 page. It is recorded here so the finding is not lost.

## What to change

Four deletions and one conditional deletion. Nothing is added.

### 1. Delete the directory `src/app/home/`

All three files: `home-page.ts`, `home-page.html`, `home-page.scss`. After the deletion,
`grep -rn "app/home" src tests e2e` must return nothing.

### 2. Delete `src/app/features/catalog/catalog-page.html` and `catalog-page.scss` —
**only under the condition in Evidence section 2**

Run the check first:

```bash
grep -n "templateUrl\|styleUrl\|template:\|styles:" src/app/features/catalog/catalog-page.ts
```

- Output contains `template:` → FIX-14 has not landed; delete both files.
- Output contains `templateUrl:` → FIX-14 has landed; **keep both files** and say so in the
  commit body.

### 3. Delete the empty `onDestroy` hook — `src/app/features/checkout/quote-state.ts`

Delete `:137-140` (the `this.destroyRef.onDestroy(() => { … });` call and its inner
comment) and the five comment lines at `:132-136`, which describe behaviour that is not
there.

If the constructor body is then empty, delete the constructor. If `destroyRef` (`:105`) has
no other reader — check with `grep -n "destroyRef" src/app/features/checkout/quote-state.ts`
— delete the field and the `DestroyRef` import. Removing the orphans a change creates is
required by `.claude/CLAUDE.md` ("Surgical changes"); removing anything else is not
allowed by the same rule.

### 4. Do **not** delete `src/app/core/navigation/mobile-drawer-host.*`

Stated as a change because A6 asked for the opposite and the executor will otherwise
follow the report. Leave all three files exactly as they are.

### 5. Do **not** touch `src/app/features/not-found/`

Stated for the same reason. The finding in Evidence section 5 is recorded, not repaired.

## Out of scope

- **Extracting the inline templates — FIX-14.** In particular, do not "fix"
  `src/app/home/home-page.ts`'s inline template on the way past; the file is being deleted.
- **Moving the specs out of root `tests/` — FIX-06.** That is the reason A6 4.4 went wrong
  and it is not repaired here.
- **`src/app/coverage-canary/unused.ts`.** It is deliberately unimported so the coverage
  gate fails loudly if unvisited-file detection breaks — true on this task's baseline,
  though **FIX-62** deletes the whole `coverage-canary/` directory together with the gate
  that motivates it. Either way, this task does not delete it.
- **`src/environments/environment.development.ts` and `environment.e2e.ts`.** A6 4.6:
  wired through `angular.json` `fileReplacements` at `:54-57,65-68`. They look unimported
  to grep and are not.
- **Relocating `src/core/bootstrap-demo.ts` into `src/app/core/`** (A3 finding 11).
  **Refuted, not unowned:** `docs/spec/architecture.md:76` already puts the file at
  `src/core/bootstrap-demo.ts`, so under D1 there is nothing to relocate. `FIX-59.md:318-330`
  records the refutation; do not move it.
- **The unstyled 404 page and its missing catalogue link — `FIX-41`.** Recorded above, not
  repaired here.
- **Any pre-existing dead code this sweep notices but that is not named above.**
  `.claude/CLAUDE.md` ("Surgical changes") — *"Unrelated dead code gets mentioned, not
  deleted."* Put it in the commit body and stop.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

1. `npm run build` — must exit `0`. Green at the `db6d295` baseline. This is the check that
   catches a deletion something actually imported.

2. `npx vitest run tests/layouts.spec.ts` — must exit `0`. This is the suite that mounts
   `MobileDrawerHost`, and it is the direct proof that the component A6 asked to delete is
   load-bearing.

3. `npx vitest run tests/checkout-state.spec.ts` — must exit `0`. `QuoteController` is its
   subject.

4. Run `npm run test` before your first edit and again after your last, and record both
   coverage figures in the commit body. There is no target number: the pair is the
   evidence that this task did not reduce coverage, and **FIX-08** is what turns the
   thresholds into a gate. Do not carry the 56.42 % figure forward — it was measured by
   `npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
   denominator that no longer exist, so it cannot be compared with anything `ng test`
   reports.

5. The directory is gone and the live one is untouched:

   ```bash
   test ! -e src/app/home && echo "absent"
   grep -rn "home/home-page" src tests e2e
   ```

   The first must print `absent`. The second must print exactly five lines, every one of
   them under `features/home/home-page`: `src/app/app.routes.ts:116`,
   `tests/home-page.spec.ts:77`, `:102`, `:103`, `:104`. Fewer than five means the live
   component was deleted instead of the dead one.

   **Do not use `grep -rn "app/home\|HomePage" src tests e2e | grep -v "features/home"`.**
   `grep -v` filters the *matched line*, not the file, and the class name `HomePage`
   appears on eight lines that name no path at all — `src/app/app.routes.ts:118`
   (`return m.HomePage;`), `src/app/layouts/marketing-layout.ts:13` (a docblock) and six
   lines in `tests/home-page.spec.ts` — so that command prints eight lines after a
   perfectly correct deletion and an executor chasing it starts deleting live code.
   Separately, `grep -rn "app/home" src tests e2e` already exits 1 **today**, before
   anything is deleted, because the live route imports `./features/home/home-page` and
   nothing anywhere spells the dead directory's path; it proves nothing either way.

6. The browser run described in FIX-15-AC01.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-15-AC01** **Real-browser check, mandatory.** At viewport width 1440, open `/`,
      `/telefonok`, `/kosar` and `/penztar/ellenorzes` in turn. Each renders exactly as it
      did before the change — screenshot each before and after and compare — and
      `list_console_messages` reports zero errors on each. On `/penztar/ellenorzes`,
      exercise the quote surface the deleted hook belonged to: change a delivery option,
      return to the review step, and confirm the quote refreshes and the total updates. A
      deletion that breaks a lazy route shows up here and nowhere else.
- [ ] **FIX-15-AC02** **Real-browser check, mandatory — the drawer the doubtful deletion
      would have reached.** At viewport width 390, open `/telefonok`, open the mobile
      navigation drawer from the header, tab through it, and close it with Escape. It opens,
      traps focus and closes. Screenshot the open drawer. This is the interactive proof that
      leaving `MobileDrawerHost` and `MobileDrawer` alone was right.
- [ ] **FIX-15-AC03** `src/app/home/` does not exist —
      `test ! -e src/app/home && echo "absent"` prints `absent` — and
      `grep -rn "home/home-page" src tests e2e` prints exactly five lines, all under
      `src/app/features/home/home-page`. The second half is the guard that the **live**
      component survived; it fails if the wrong directory was deleted. The old second
      half, `grep -rn "app/home" src tests e2e` returning nothing, is dropped: it
      already returns nothing at the baseline and so passes before and after, proving
      nothing about this task.
- [ ] **FIX-15-AC04** `src/app/core/navigation/mobile-drawer-host.ts`, `.html` and `.scss`
      all still exist and are byte-identical to `db6d295`. Check with
      `git diff --stat -- src/app/core/navigation/`, which must print nothing. This
      criterion exists because a report in the audit set asked for their deletion and was
      wrong.
- [ ] **FIX-15-AC05** `grep -n "onDestroy" src/app/features/checkout/quote-state.ts`
      returns nothing, and `grep -rn "future cleanup work" src` returns nothing.
- [ ] **FIX-15-AC06** The conditional in "What to change" step 2 was evaluated, its command
      output pasted into the commit body, and the branch taken is named in one sentence —
      either "FIX-14 had not landed, both files deleted" or "FIX-14 had landed, both files
      kept as the component's template and stylesheet".
- [ ] **FIX-15-AC07** `npm run build` exits `0`, `npx vitest run tests/layouts.spec.ts`
      exits `0`, and `npm run test` exits `0`. The before and after coverage percentages
      of the last one are both recorded in the commit body.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own specs with
      `npx vitest run tests/layouts.spec.ts tests/checkout-state.spec.ts` instead.
- [ ] **FIX-15-AC08** `git status --short` lists only deletions plus
      `src/app/features/checkout/quote-state.ts`. No new file, no file under
      `src/app/features/not-found/`, none under `src/app/core/navigation/`.
- [ ] **FIX-15-AC09** The commit body records, as stated remaining limitations rather than
      as asides: that `src/app/features/not-found/not-found-page.ts` has no stylesheet and
      its `class="not-found"` is defined nowhere, so the 404 page renders unstyled; that the
      same page offers no catalogue link although `docs/spec/screens.md:27` requires one;
      and that A6 4.4's recommendation to delete `MobileDrawerHost` was not carried out,
      with the four `tests/layouts.spec.ts` line numbers that refute it.
- [ ] **FIX-15-AC10** Design rules recorded in the commit body. **Applicable and met, by
      the two browser runs above: R19** (`No results, network error, loading, success and
      disabled are distinct states`) — the checkout quote states still behave after the hook
      removal, exercised in FIX-15-AC01; **R22** (`The narrow layout must not be a
      scaled-down image of the entire desktop page`) — the 390 px run in FIX-15-AC02 shows
      the drawer branch still in use; **R23** (`Handle focus, background exclusion,
      dismissal and focus restoration in modals`) — the drawer's focus trap and Escape
      dismissal, measured in FIX-15-AC02; **R26** — the commit body names every deleted
      path, every command and exit code, and the three limitations in FIX-15-AC09. R01–R18,
      R20, R21, R24 and R25 are **N/A: this task only removes code nothing reaches, so no
      colour, token, copy, price, image, target size or cart behaviour is introduced or
      changed** — and the identical before/after screenshots are what makes that an
      observation rather than a claim. Skill provenance is stated once in
      `docs/fix/README.md` section 3, "Every task records the design rules": the installed
      path, the version, and the fact that `docs/mi-bolt/execution/skill-location.json`
      does not exist yet (**FIX-38** owns it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with FIX-14, FIX-16, FIX-17 or any other
FIX task, even though it touches the same two directories as FIX-14. Commit only after
every acceptance criterion above passes, including both browser checks.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `chore: remove screenshot assets from repo`):

```text
chore: delete the dead home placeholder and the empty quote-state hook
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**FIX-14 should land before this one.** Both tasks reach
`src/app/features/catalog/catalog-page.html` and `catalog-page.scss`, from opposite
directions: FIX-14 fills them, this task deletes them as orphans. The conditional in
"What to change" step 2 makes either order safe, but running FIX-14 first removes the need
for it.
