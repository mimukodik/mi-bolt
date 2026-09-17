# FIX-58 — Run the E2E suite in Firefox and WebKit as the spec requires

Status: PLANNED — not executed.
Severity: major
Source: Decision **D12**; `docs/spec/testing.md:109` and `:125` (as they read before decision **D17**); `playwright.config.ts:66-81`. Deferred with its reason by `FIX-47`'s out-of-scope section; this task completes it.

## Why this is wrong

`playwright.config.ts:66-81` declares two projects, `mi-bolt-design` at 1440 and
`mi-bolt-narrow` at 390, and **both of them spread `devices['Desktop Chrome']`**. Every
end-to-end test this project has ever run has run in Chromium and only Chromium.

`docs/spec/testing.md:125` used to name an npm script for exactly this gap — the entry
for the "Chromium/Firefox/WebKit functional suite" — and the repository had no such
script. **FIX-47** was right to refuse a Chromium-only
script under that name. Its out-of-scope section said so in the terms this task
inherits: *"Do not add the script as a Chromium-only run under that name: a script that
claims three browsers and runs one is the exact defect class this task exists to
remove."*

**Decision D17 goes one step further and removes the script name itself, not only the
Chromium-only fake of it.** Under D17's standard-commands pass, `FIX-47` is rewritten as
`FIX-47 — Prune the npm scripts to the standard commands of the stack`, and the script
name above is not among the eleven survivors: `npx playwright test` with three
configured projects **is** the three-browser run, and `--project=<name>` is Playwright's
own documented selector
(https://playwright.dev/docs/test-projects), so a wrapped script would be a second name
for a standard invocation. **D12 is untouched by this — only the script name goes.** The
user settled the requirement itself directly: *"Kapjon saját taskot"* ("give it its own
task"), and nothing about D17 revisits that. This task still adds the two browsers; it
just does not wrap the resulting command in a new `package.json` entry.

## Evidence

**Both projects are Chromium.** `playwright.config.ts:66-81`:

```ts
  projects: [
    {
      name: 'mi-bolt-design',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mi-bolt-narrow',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
```

**No script exists today, and none is added by this task.** `package.json`'s `scripts`
block holds 16 entries on `db6d295` and none names the cross-browser suite; `grep -n
"test:e2e" package.json` returns nothing, and it returns nothing after this task too —
see "What to change" item 3.

**The two device descriptors this task needs exist in the installed Playwright.**
Measured by reading `@playwright/test` 1.63.0 from `node_modules`:

```
Desktop Firefox   -> defaultBrowserType: "firefox"
Desktop Safari    -> defaultBrowserType: "webkit"
```

**Neither browser is installed.** Playwright's browser cache on the machine this package
was written on holds `chromium-1243`, `chromium_headless_shell-1243` and `ffmpeg-1011`,
and no Firefox or WebKit build. `npx playwright install firefox webkit` is therefore a
real prerequisite, not a formality.

**`testMatch` is a per-project option in the installed version**, which is what makes the
scoping in "What to change" possible rather than a hope. `node_modules/playwright/types/
test.d.ts:692-703`: *"Only the files matching one of these patterns are executed as test
files. Matching is performed against the absolute file path."*

**The screenshot question is already settled for the suite this task will run, and it
is not settled for the suite it must not run.** This is the single most important
measurement in this file.

- `e2e/checkout-f8.spec.ts` writes three screenshots and **already namespaces them by
  project** (`:58`, `:84`, `:97`):

  ```js
      path: `e2e/checkout-f8-screenshots/${test.info().project.name}-01-cart.png`,
  ```

  and `.gitignore:320` ignores `e2e/checkout-f8-screenshots/`, so
  `git ls-files e2e/checkout-f8-screenshots` counts **0**. Adding two projects adds two
  more untracked, distinctly named images per step. Nothing collides and nothing enters
  the repository.
- `e2e/deployment/deep-links.spec.ts` writes no screenshot at all;
  `grep -n "screenshot" e2e/deployment/deep-links.spec.ts` returns nothing.
- `e2e/design/viewport-matrix.spec.ts:120-123` builds its path from the **viewport name
  and the route only**, with no project segment:

  ```js
          const screenshotDir = resolve(
            SCREENSHOT_ROOT,
            viewport.name,
          );
  ```

  and `e2e/design/state-matrix.spec.ts:158-164` does the same with `states/<state>/`.
  `git ls-files e2e/design/screenshots | wc -l` counts **49** tracked images. With
  `fullyParallel: true` (`playwright.config.ts:33`), every additional project that
  collects those two files races the others for the same 49 paths.

**A false CI claim sits in this same file, and this task is the one that owns fixing
it.** `playwright.config.ts:22-24`:

```ts
 * `MI_BOLT_E2E_STATIC_DIR` overrides the served directory and
 * `MI_BOLT_E2E_BASE_URL` overrides the base URL; the CI workflow
 * sets both so the network namespace sees only the local origin.
```

`.github/` does not exist — `ls -la .github` returns "No such file or directory" — and no
CI workflow has ever existed in this repository. This is a false statement in committed
code, and decision **D19 item 5** assigns its removal to this task because this task
already owns `playwright.config.ts` for the Firefox and WebKit projects. See item 2
below.

## What to change

### 1. `playwright.config.ts` — two new projects, scoped so they cannot leak

Append to the `projects` array at `:66-81`:

```ts
    {
      name: 'mi-bolt-firefox',
      testMatch: ['**/e2e/checkout-f8.spec.ts', '**/e2e/deployment/*.spec.ts'],
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mi-bolt-webkit',
      testMatch: ['**/e2e/checkout-f8.spec.ts', '**/e2e/deployment/*.spec.ts'],
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
      },
    },
```

Each decision, with the evidence for it:

- **`testMatch` is not optional and is the whole safety of this change.** A project with
  no `testMatch` collects every spec under `testDir`, so a bare
  `npx playwright test e2e/design/state-matrix.spec.ts` would suddenly run in four
  browsers and four writers would race for the same 49 tracked images. Scoping the two
  new projects to the functional specs makes that impossible from the configuration side,
  rather than relying on every future caller to remember a `--project` flag.
- **The two existing projects are left exactly as they are.** No `testMatch` is added to
  them, because every suite in the repository is expected to keep running in Chromium.
- **`devices['Desktop Safari']` is how Playwright selects WebKit**; there is no
  `Desktop WebKit` descriptor. Its `defaultBrowserType` is `webkit`, quoted above.
- **The viewport is pinned to 1440 × 900**, matching `mi-bolt-design`, so the three
  browsers differ in engine and in nothing else. The descriptors' own defaults are
  1280 × 720 for both, which would make a Firefox failure indistinguishable from a
  narrow-viewport failure.
- **The project names follow the file's existing convention** (`mi-bolt-` plus what the
  project is), which `.claude/rules/code-standards.md` requires: a reader returning in two
  days can tell what `mi-bolt-firefox` runs without opening the file.

### 2. `playwright.config.ts` — delete the false CI clause

`playwright.config.ts:22-24`, quoted in full in Evidence above, claims a CI workflow sets
`MI_BOLT_E2E_STATIC_DIR` and `MI_BOLT_E2E_BASE_URL`. No such workflow exists or ever has —
decision **D17** removes CI from the specification entirely rather than building one, and
`.github/` has never existed in this repository. The two environment variables themselves
are real and are read at `:26-29`; only the claim about who sets them is false. Replace
the three-line comment with:

```ts
 * `MI_BOLT_E2E_STATIC_DIR` overrides the served directory and
 * `MI_BOLT_E2E_BASE_URL` overrides the base URL; set either by hand
 * when serving from something other than the default static host.
```

**Do not touch the three `process.env['CI']` reads at `:34`, `:36` and `:63`**
(`forbidOnly: !!process.env['CI']`, `workers: process.env['CI'] ? 1 : undefined`,
`reuseExistingServer: !process.env['CI']`). Those are Playwright's own
`create-playwright` scaffold idiom, not the false claim — they read an environment
variable that happens to be unset in every environment this repository runs in today, and
deleting working configuration to chase a documentation defect would be a second mistake
in the same file. Only the comment naming a workflow that sets them is removed.

### 3. No wrapper script

Under decision **D17**, this task adds no entry to `package.json`. `npx playwright test`
naming the three projects added by item 1 **is** the three-browser run, and there is no
aggregate release-gate script left to extend — **`FIX-47'`** (`FIX-47 — Prune the npm
scripts to the standard commands of the stack`) removes that script too, because an
`&&` chain of every gate written as an npm script is a CI pipeline in disguise and the
user deleted CI outright. Running the three-browser suite is the direct command "How to
verify" below gives.

The two browsers must still be downloaded once before that command can run:

```bash
npx playwright install firefox webkit
```

**Do not add an npm script for it and do not add a `postinstall` hook.** With no CI
pipeline and no declared package-script list to name it in, wrapping a one-off local
prerequisite in a script would be inventing a command nobody asked for, the same
over-engineering D17 exists to remove. "How to verify" below carries the exact prerequisite
wording this task's design pass settled on.

### 4. Tests

`playwright.config.ts` is configuration, not application code, and the repository has no
harness that asserts on it. The proof this task offers is the measured run required by
AC03 and AC04: the same two functional specs executing in three named projects, with the
per-project results recorded.

## Out of scope

- **The eleven survivor npm scripts and `docs/spec/testing.md`'s rewritten command list —
  `FIX-47'`.** Do not add, rename or re-order any `package.json` script, and do not open
  `testing.md`.
- **The design and a11y suites, and anything that writes into
  `e2e/design/screenshots/`.** Never point a command at `e2e/design` or `e2e/a11y`. The
  49 tracked images there have no project segment in their paths, and **FIX-09** owns
  them.
- **The E2E source-coverage subsystem — removed under decision D19 item 1, not merely out
  of scope for this task.** `e2e/fixtures/coverage.ts`, `e2e/fixtures/test.ts`,
  `e2e/coverage-canary*.spec.ts`, `tests/coverage-canary*.spec.ts` and the
  `src/app/coverage-canary/` route are deleted by other tasks (**FIX-62**).
  This task does not touch any of them and does not add anything that would revive
  Chromium-only coverage collection.
- **The 41 Playwright failures — `FIX-09`.** If a functional spec is red in Chromium
  today, it will be red in the other two. Record which failures are engine-specific and
  which are the existing Chromium failures, and fix neither here.
- **`e2e/network-isolation.spec.ts`.** **FIX-62** owns this file — it replaces it wholesale
  under D20 item 3. Its current redness traces to a routing reason **FIX-09** owns
  (`/canary` is declared after the `**` wildcard at `app.routes.ts:181`), and this task's
  three-project run never names it.
- **Renaming `mi-bolt-design` or `mi-bolt-narrow`.** Several files reference those project
  names.
- **Making `e2e/design`'s screenshots project-aware — `FIX-68`**, under **D15** item 13.
  It is not this task's: it touches 49 tracked images and two suites that other FIX
  numbers work in. Name FIX-68 in the commit body.
- **`.github/`.** This task does not create it. Deleting the false CI clause is a
  documentation-accuracy fix, not a step toward building the CI pipeline the user removed.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`),
`npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41
failures (`FIX-09`).

**Step 0 — the local prerequisite, run once before anything else:**

> Run `npx playwright install firefox webkit` once before step 1. It downloads browser
> binaries into Playwright's own cache outside this repository, changes no tracked file,
> and needs no npm script; record its exit code in this task's evidence.

```bash
npm run build                           # expected exit 0
npx playwright test --project=mi-bolt-design --project=mi-bolt-firefox \
  --project=mi-bolt-webkit e2e/checkout-f8.spec.ts e2e/deployment
                                        # record the exit code and the per-project results
git status --short e2e/design/screenshots
                                        # expected: no output — see below
grep -c "CI workflow" playwright.config.ts
                                        # expected: 0
```

**The `git status` command is the guard, not a formality.** If it prints anything, the new
projects collected the design suites and the `testMatch` scoping is wrong. Fix the
configuration; do not stage the images and do not use `git restore`, `git checkout --` or
`git clean` to tidy them away — `.claude/rules/session-lifecycle.md` forbids it.

To see the failures per engine while iterating, name one project at a time:

```bash
npx playwright test --project=mi-bolt-firefox e2e/checkout-f8.spec.ts
npx playwright test --project=mi-bolt-webkit e2e/deployment
```

**Never run a bare `npx playwright test` in this task.** It rewrites 49 tracked
screenshots and belongs to **FIX-09**.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R14 applies in an unusual direction**: running the checkout flow in two more engines
  is the first chance this project has had to see whether its rendered states hold outside
  Chromium. Any state that renders differently in Firefox or WebKit is a finding for the
  record, not something to patch inside this task.
- **This task is exempt from browser verification, and the reason is recorded in the commit
  body.** It edits exactly one file, `playwright.config.ts`: two entries appended to the
  `projects` array and one false comment deleted. It changes no component, template,
  stylesheet, route, label or rendered surface, so there is nothing a person can see or click
  that differs afterwards — the *"build script"* case
  `.claude/rules/browser-verification.md` names, claimed here explicitly as that rule requires
  ("If I think a change is exempt, I say so explicitly and say why").

  **The three-project Playwright run this task performs is not offered as that verification and
  is not a substitute for it.** The rule requires the loop to run through
  `mcp__chrome-devtools__*` via the `real-browser-sonnet` agent, with `take_snapshot`,
  `take_screenshot` and `list_console_messages` returning zero errors; this task does none of
  those and invokes no such agent. AC03 and AC04 are this task's own subject — proving the two
  new projects collect and run — and they are evidence of that and of nothing else.

  **What the Firefox and WebKit run does produce is a finding surface, and it is reported, not
  verified.** Any state that renders differently in either engine is recorded in the commit body
  as a new observation with its screenshot path, and belongs to whichever FIX number owns that
  screen. This is the first time this application has been rendered outside Chromium, so an
  empty findings list is itself worth stating.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R13, R15–R25: N/A — this change adds two entries to a configuration array and
  corrects one false comment. It introduces no brand asset, colour, dimension, font,
  layout, copy, data source, focus behaviour or component.

## Acceptance criteria

- [ ] **FIX-58-AC01** `playwright.config.ts` declares four projects, and
      `grep -c "Desktop Firefox" playwright.config.ts` and
      `grep -c "Desktop Safari" playwright.config.ts` each print `1`. The two existing
      projects are byte-for-byte unchanged.
- [ ] **FIX-58-AC02** `grep -c "CI workflow" playwright.config.ts` prints `0`, and
      `grep -cE "process.env\['CI'\]" playwright.config.ts` still prints `3` — the false
      claim is gone and the three real reads survive. `package.json` gains no new script:
      `grep -n "test:e2e" package.json` prints nothing, unchanged from the `db6d295`
      baseline.
- [ ] **FIX-58-AC03** `npx playwright test --project=mi-bolt-design
      --project=mi-bolt-firefox --project=mi-bolt-webkit e2e/checkout-f8.spec.ts
      e2e/deployment` ran to completion and the run reported results for all three
      projects — `mi-bolt-design`, `mi-bolt-firefox` and `mi-bolt-webkit`. The exit code
      and the per-project pass/fail counts are recorded in the commit body. A non-zero
      exit does not fail this criterion; a run that silently covered fewer than three
      projects does.
- [ ] **FIX-58-AC04** **Cross-browser evidence for the purchase flow.** For each of the
      three projects, `e2e/checkout-f8-screenshots/` contains the three images named
      `<project>-01-cart.png`, `<project>-02-delivery.png` and `<project>-03-review.png`,
      or the run's own report records why that project did not reach that step. Nine
      images, or a written reason for each missing one.
- [ ] **FIX-58-AC05** `git status --short e2e/design/screenshots` prints nothing after
      the three-project run, and `git ls-files e2e/design/screenshots | wc -l` still
      prints `49`. This is what proves the new projects cannot collect the design suites.
- [ ] **FIX-58-AC06** `git ls-files e2e/checkout-f8-screenshots | wc -l` prints `0`: the
      per-project images stay untracked, as `.gitignore:320` already provides.
- [ ] **FIX-58-AC07** The commit body records the `npx playwright install firefox webkit`
      prerequisite verbatim with its exit code, states that no npm script was added for it
      and why (decision D17), and names the failures that are engine-specific separately
      from the pre-existing Chromium failures `FIX-09` owns.
## Commit

This task is exactly one commit: the two projects and the CI-clause correction in
`playwright.config.ts`, and nothing else — it touches no other file. Do not bundle it with
**FIX-47'**, whose `package.json` and `docs/spec/testing.md` edits are its own commit, or
with **FIX-09**, which owns the failures this run will surface. Commit only after every
acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
test: add the Firefox and WebKit projects and correct the false CI comment
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
