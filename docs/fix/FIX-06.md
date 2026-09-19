# FIX-06 — Move the feature specs out of root `tests/` and co-locate them

Status: PARTIAL — e7834aa. Open: AC08's required `file:line — test — symptom — owner` failure-list format was never produced in the commit body; the 24-spec co-location itself landed and lint/build are green on the current tree.
Severity: major
Source: A1 F1, A5 Part 1

## Why this is wrong

`docs/spec/architecture.md:101` says where tests belong, in one sentence: *"Tests live
beside feature units where useful; top-level tests owns shared/contract fixtures."*
Twenty-four of the thirty files that remain under `tests/` once FIX-62 has landed are feature-level unit specs named
after individual pages, facades and mock handlers, not shared fixtures. The user raised
this directly: *"test filleok sem jo helyen vannak"* ("the test files are not in the
right place either"), and gave the reason in the same breath: *"ezert kertem az hogy
stacket is nezzetek meg hogy standardoknak megfelelee"*.

It is not only a tidiness problem. After FIX-04 the repository has one unit-test runner,
`@angular/build:unit-test`, and **that runner cannot see a spec outside `src/`** — its
discovery globs run with `cwd` set to the project source root. So from FIX-04's commit
until this one lands, every spec under `tests/` is executed by nothing at all. This task
is what puts them back in front of a runner.

## Evidence

### The placement itself

`tests/` holds 32 files today and 30 once **FIX-62** has deleted the two coverage-canary specs, which it must do before this task runs. `find tests -type f | sort` lists them. Six of those are shared
fixtures, contract specs or gate proofs — `tests/setup-msw.ts`,
`tests/network-isolation.spec.ts`, `tests/contract/response-validation.ts`,
`tests/contract/schema.spec.ts`, `tests/contract/operation-matrix.spec.ts` and
`tests/contract/sdk-transport.spec.ts`. The other twenty-four — twenty-six before FIX-62 — are named after features:
`cart.facade.spec.ts`, `catalog.facade.spec.ts`, `home-page.spec.ts`,
`product-page.spec.ts`, `checkout-f2.spec.ts`, `layouts.spec.ts`, `cart-mock.spec.ts`,
`order-mock.spec.ts` and so on.

Each file's own import list settles where it belongs. Two examples, verbatim:

`tests/cart.facade.spec.ts` imports `'../src/app/features/cart/cart.facade'`,
`'../src/app/features/cart/cart-mutation-queue'` and
`'../src/app/core/navigation/cart-count-facade'`.

`tests/order-mock.spec.ts` imports `'../src/mocks/orders/commit-order'`,
`'../src/mocks/checkout/quote-domain'` and `'../src/mocks/cart/cart-domain'`.

The split is also internally inconsistent: `src/app/features/catalog/` already holds
`catalog-page.spec.ts` and `product-card.spec.ts` beside the very facade that
`tests/catalog.facade.spec.ts` tests from the other side of the repository.

### Why a spec outside `src/` cannot be run by the builder

`node_modules/@angular/build/src/builders/unit-test/test-discovery.js:59-66`:

```js
        const globMatches = await (0, tinyglobby_1.glob)(dynamicPatterns, {
            cwd: projectSourceRoot,
            absolute: true,
            expandDirectories: false,
            ignore: ['**/node_modules/**', ...normalizedExcludes],
        });
```

`angular.json:14` sets `"sourceRoot": "src"`. The builder's default `include` is
`['**/*.spec.ts']` (`node_modules/@angular/build/src/builders/unit-test/options.js:92`),
and it is globbed from `src`. This is the implementation, not a setting: no value of the
`include` option reaches `tests/`.

### The MSW setup file will hand back `null` the moment these specs move

`tests/setup-msw.ts:34`:

```ts
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
```

and `:36-42`:

```ts
let server: ReturnType<typeof import('msw/node').setupServer> | null = null;

if (!isBrowser) {
  // Dynamic import keeps `msw/node` (and the @mswjs/interceptors
  // `node:http` references) out of the browser bundle entirely.
  const { setupServer } = await import('msw/node');
  server = setupServer();
```

That test asks *"is there a DOM?"* when what it means is *"is this a real browser?"*
After FIX-04 the unit suite runs under **jsdom inside a Node process**, so `window` and
`document` both exist, `isBrowser` is `true`, and `server` stays `null`. Five specs that
are about to move call methods on it:

```text
tests/cart-mock.spec.ts:715        server.use(...handlers);
tests/catalog-mock.spec.ts:603     server.use(...buildCatalogHandlers(makeHandlerOptions()));
tests/checkout-f1-f2.spec.ts:58    server.use(handler);
tests/checkout-mock.spec.ts:964    server.use(...handlers);
tests/order-mock.spec.ts:1087      server.use(...handlers);
```

Every one of those becomes `Cannot read properties of null`. **Repairing that guard is
part of this task, not an optional extra**, because without it the move makes five
working suites fail.

### The setup file also carries a block that FIX-04 made dead

`tests/setup-msw.ts:57-130` installs a Node `fs` resolver for the Angular **JIT**
compiler's `ɵresolveComponentResources` queue. Its own comment at `:57-62` says why:

```ts
// Resolve any `templateUrl` / `styleUrl` the JIT compiler has queued
// by the time the test files start importing components. The default
// `ResourceLoader` (XHR) cannot reach the on-disk files from jsdom;
```

There is no JIT compiler in the suite after FIX-04 — the builder compiles AOT and
resolves `templateUrl` / `styleUrl` itself. The block walks the entire workspace tree
looking for files by basename (`findFileInWorkspace`, `:71-94`) on every spec run. It is
dead weight and it goes.

## What to change

### 1. Move twenty-four files, one at a time

Use `git mv` for every one, so git records a rename and **no copy is left behind**. A
leftover `*.spec.ts` in the old location is not harmless: the contract runner added in
step 4 collects `tests/**/*.spec.ts`, so a forgotten copy runs in a Node environment
with no DOM and fails, while looking like a new bug rather than a leftover.

| # | From | To |
|---|---|---|
| 1 | `tests/add-to-cart.spec.ts` | `src/app/features/product/add-to-cart.spec.ts` |
| 2 | `tests/cart-mock.spec.ts` | `src/mocks/cart/cart-mock.spec.ts` |
| 3 | `tests/cart-page.spec.ts` | `src/app/features/cart/cart-page.spec.ts` |
| 4 | `tests/cart.facade.spec.ts` | `src/app/features/cart/cart.facade.spec.ts` |
| 5 | `tests/catalog-mock.spec.ts` | `src/mocks/catalog/catalog-mock.spec.ts` |
| 6 | `tests/catalog.facade.spec.ts` | `src/app/features/catalog/catalog.facade.spec.ts` |
| 7 | `tests/checkout-delivery.spec.ts` | `src/app/features/checkout/checkout-delivery.spec.ts` |
| 8 | `tests/checkout-f1-f2.spec.ts` | `src/mocks/checkout/checkout-f1-f2.spec.ts` |
| 9 | `tests/checkout-f2.spec.ts` | `src/app/features/checkout/checkout-f2.spec.ts` |
| 10 | `tests/checkout-f6.spec.ts` | `src/app/features/checkout/checkout-f6.spec.ts` |
| 11 | `tests/checkout-f8.spec.ts` | `src/app/features/checkout/checkout-f8.spec.ts` |
| 12 | `tests/checkout-mock.spec.ts` | `src/mocks/checkout/checkout-mock.spec.ts` |
| 13 | `tests/checkout-state.spec.ts` | `src/app/features/checkout/checkout-state.spec.ts` |
| 14 | `tests/contact-step.spec.ts` | `src/app/features/checkout/contact-step.spec.ts` |
| 17 | `tests/home-page.spec.ts` | `src/app/features/home/home-page.spec.ts` |
| 18 | `tests/layouts.spec.ts` | `src/app/layouts/layouts.spec.ts` |
| 19 | `tests/mocks-handlers.spec.ts` | `src/mocks/mocks-handlers.spec.ts` |
| 20 | `tests/order-mock.spec.ts` | `src/mocks/orders/order-mock.spec.ts` |
| 21 | `tests/order-submission.spec.ts` | `src/app/features/checkout/order-submission.spec.ts` |
| 22 | `tests/product-gallery.spec.ts` | `src/app/features/product/product-gallery.spec.ts` |
| 23 | `tests/product-page.spec.ts` | `src/app/features/product/product-page.spec.ts` |
| 24 | `tests/review-step.spec.ts` | `src/app/features/checkout/review-step.spec.ts` |
| 25 | `tests/success-page.spec.ts` | `src/app/features/checkout/success-page.spec.ts` |
| 26 | `tests/variant-selection.spec.ts` | `src/app/features/product/variant-selection.spec.ts` |

**Twenty-four `git mv` commands, one per row, no file listed twice.** Every destination
directory already exists; verify with
`for d in src/app/features/product src/app/features/cart src/app/features/home src/app/features/checkout src/app/features/catalog src/app/layouts src/mocks/cart src/mocks/catalog src/mocks/checkout src/mocks/orders; do test -d "$d" || echo "MISSING $d"; done`,
which must print nothing. No destination filename collides with a spec already under
`src/`; the fourteen that are there today are `src/app/app.spec.ts`, the two under
`src/app/features/catalog/` (`catalog-page.spec.ts`, `product-card.spec.ts`) and eleven
under `src/app/shared/ui/`.

The destination for each file was read off its own import list, not guessed.
`tests/cart-page.spec.ts` is the one row A5 Part 1 marked "confirm first": it imports
nothing from `src` at all (it is one of the source-text specs — see FIX-07), and its
header comment at `:1-2` names `T18 — cart screen (S4.1)`, so `src/app/features/cart/` is
its home.

**Move the source-text specs too, unchanged.** Rows 1, 3, 7, 22, 23 and 24 are files that
assert against source text rather than behaviour. Moving them is mechanical and belongs
here; rewriting them is FIX-07's, and FIX-07 rewrites them **in their new location**.
Do not rewrite an assertion in this task and do not delete one of these files.

### 2. Rewrite the relative imports in the moved files

Every moved file imports its subject with a `'../src/…'` prefix. That prefix is wrong the
moment the file moves. Replace the leading `../src/` with the path from the file's **new
directory** to `src/`:

| New directory | Replace the leading `../src/` with |
|---|---|
| `src/app/features/<feature>/` | `../../../` |
| `src/app/layouts/` | `../../` |
| `src/mocks/<subdir>/` | `../../` |
| `src/mocks/` | `../` |

Worked example. `tests/cart.facade.spec.ts` moves to
`src/app/features/cart/cart.facade.spec.ts`, so

```ts
import { CartFacade } from '../src/app/features/cart/cart.facade';
import { Repository } from '../src/mocks/repository';
```

becomes

```ts
import { CartFacade } from '../../../app/features/cart/cart.facade';
import { Repository } from '../../../mocks/repository';
```

and the first of those two may be shortened to `'./cart.facade'`, which is the form the
specs already under `src/` use (`src/app/features/catalog/product-card.spec.ts:46`
imports `'./product-card'`). Shortening a same-directory import is encouraged; anything
deeper is left as the mechanical rewrite produces it.

Six files import the MSW setup with `'./setup-msw'` — rows 2, 5, 8, 12 and 20 of the
table, plus `tests/network-isolation.spec.ts`, which is **not** moving. For the five that do
move, all of which land under `src/mocks/<subdir>/`, that becomes:

```ts
import { server } from '../../../tests/setup-msw';
```

When every rewrite is done, `grep -rn "\.\./src/" src/` must print nothing, and
`grep -rn "from './setup-msw'" src/` must print nothing.

### 3. Repair `tests/setup-msw.ts`

Two edits, both in that file, and it stays where it is —
`docs/spec/architecture.md:101` puts shared fixtures at the top level. **FIX-62** edits
this same file too, its `:2` header-comment line only (one word removed); its edit is
one line for one line, so either order is safe and it does not affect the line count
this section's `:57-130` deletion depends on.

Before editing, note the one thing in this task that reading alone cannot settle: whether
`await import('msw/node')` resolves when the Angular builder bundles this file. It is the
expected outcome — the suite runs under jsdom inside an ordinary Node process, where the
`node:` built-ins `@mswjs/interceptors` needs are present, and the builder is not in
browser mode so it does not apply the `browser` export condition — but it is a resolution
question and the only proof is running it. If `npm run test` fails with a module
resolution error naming `msw/node` or `node:http`, **stop and report it** rather than
reintroducing a guard that returns `null`: a `null` server is what the rest of this
section exists to remove, and five suites depend on a real one.

Replace `:34`:

```ts
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
```

with a test for a real browser rather than for a DOM:

```ts
const isNodeProcess =
  typeof process !== 'undefined' && Boolean(process.versions?.node);
```

and invert the guard at `:38` accordingly — `if (isNodeProcess) {` in place of
`if (!isBrowser) {`. Update the paragraph at `:18-21` that explains the old guard so it
describes the new one: jsdom is a DOM inside a Node process, `msw/node` works there, and
only a real browser runner has no `process`.

Then **delete lines 57 to 130 entirely** — the whole `if (typeof process !== 'undefined'
&& process.versions?.node)` block that installs the JIT resource resolver, including
`findFileInWorkspace` and `fileResourceResolver` — and delete the paragraph at `:23-30`
that documents it. Keep `export { server };` at the end. FIX-04 removed the JIT compiler
from the suite; this block has nothing left to resolve for.

### 4. Give the remaining `tests/` tree its runner back

After the moves, `tests/` holds exactly six files, and **it stays at six**: the move table
above is closed at twenty-four rows and no later task adds to either. Eight tasks in
Phases E and F create a new spec (**FIX-26**, **FIX-28**, **FIX-29**, **FIX-30**,
**FIX-41**, **FIX-52**; **FIX-27** and **FIX-31** create none) and every one of them puts
it beside the code it tests under `src/`, for the reason stated at the top of this file —
`ng test`'s runner cannot see a spec outside `src/`, and the contract runner created in
step 4 below runs `tests/**/*.spec.ts` in a Node environment with no Angular compiler. The
six:

```text
tests/setup-msw.ts
tests/network-isolation.spec.ts
tests/contract/operation-matrix.spec.ts
tests/contract/response-validation.ts
tests/contract/schema.spec.ts
tests/contract/sdk-transport.spec.ts
```

`docs/spec/architecture.md:101` requires `tests/contract/**` to stay at the top level, and
it has never had a gate of its own — `grep -c '"test:contract"' package.json` prints `0`
today. D17 (`docs/fix/FIX-47.md`) does not add a `test:contract` npm script either: a
script naming one subdirectory of one runner is a selection, not a gate, and
`npx vitest run --config vitest.contract.config.ts` is that selection's own, standard
invocation. Create the runner configuration; do not create a package script for it.

New file `vitest.contract.config.ts` at the repository root:

```ts
// vitest.contract.config.ts — the Node-only contract and isolation suite.
//
// `docs/spec/architecture.md:101` keeps shared and contract fixtures at
// the top level. Run with `npx vitest run --config vitest.contract.config.ts`
// — this suite has no npm script of its own; see docs/fix/FIX-47.md. They
// are not Angular component tests: they read the OpenAPI document, drive
// the generated SDK over MSW's Node server and prove the unhandled-request
// policy. `ng test` cannot reach them, because its discovery globs run with
// cwd set to the project source root.
//
// No plugin belongs in this file. If a spec here needs the Angular
// compiler, it belongs beside the code it tests, under src/.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup-msw.ts'],
  },
});
```

**Do not add a `test:contract` entry to `package.json`.** Run the suite directly with
`npx vitest run --config vitest.contract.config.ts`, which is the command
`docs/fix/FIX-47.md`'s rewritten command list gives it.

### 5. Register the setup file with the Angular builder

In `angular.json`, inside the `test` target's `options` object (which begins at `:92`),
add one key beside `runnerConfig`:

```json
            "setupFiles": ["tests/setup-msw.ts"],
```

The builder resolves that path against the workspace root —
`node_modules/@angular/build/src/builders/unit-test/options.js:120-121`:

```js
        setupFiles: options.setupFiles
            ? options.setupFiles.map((setupFile) => (0, path_1.toPosixPath)(node_path_1.default.join(workspaceRoot, setupFile)))
```

so `"tests/setup-msw.ts"` is the correct spelling. This is what makes the MSW server's
`beforeAll` / `afterEach` / `afterAll` hooks register once per test file rather than once
per worker, which is what `docs/spec/testing.md:28` requires: *"beforeAll server.listen
with fail-closed unhandled policy; beforeEach fresh repository/scenario; afterEach verify
no unexpected/unhandled request… afterAll close."*

This restores an arrangement that already worked rather than inventing one: the
`vitest.config.ts` FIX-04 replaced carried `setupFiles: ['tests/setup-msw.ts']` at its
line 509, and the specs that call `setupServer()` of their own —
`cart.facade.spec.ts`, `checkout-f8.spec.ts`, `checkout-state.spec.ts`,
`order-submission.spec.ts`, `success-page.spec.ts`, `variant-selection.spec.ts` and the
already-co-located `catalog-page.spec.ts:38` — ran alongside it under the old direct
`vitest run`. If one of them now reports an interceptor conflict, that is a real finding
to record with the spec's name; do not resolve it by dropping the setup file, which would
return the five mock suites to a `null` server.

### 6. If the two Angular-importing contract specs will not run

`tests/contract/operation-matrix.spec.ts` and `tests/contract/sdk-transport.spec.ts`
import the generated SDK and `@angular/core/testing`. A bare Vitest run has no Angular
compiler, which is the failure the plugin FIX-04 deleted was written for. **Do not bring
that plugin back under any circumstances.** Instead, follow this decision procedure,
which has a determinate outcome:

Run `npx vitest run --config vitest.contract.config.ts`. If both files pass, you are done
— stop here.

If either fails with a decorator, metadata or "Invalid or unexpected token" error, move
exactly those two files and nothing else:

```text
git mv tests/contract/operation-matrix.spec.ts src/app/api/contract/operation-matrix.spec.ts
git mv tests/contract/sdk-transport.spec.ts    src/app/api/contract/sdk-transport.spec.ts
```

creating `src/app/api/contract/` with `mkdir -p` first. Their imports then become:

- `'../../src/app/api/generated/…'` → `'../generated/…'`
- `'../../src/app/core/api/demo-session.interceptor'` → `'../../core/api/demo-session.interceptor'`
- `'../../src/mocks/…'` → `'../../../mocks/…'`
- `'../setup-msw'` → `'../../../../tests/setup-msw'`
- `'./response-validation'` (in `operation-matrix.spec.ts` only) →
  `'../../../../tests/contract/response-validation'`

`tests/contract/response-validation.ts` stays where it is; it is a pure Node helper
(`js-yaml`, `ajv`, `node:fs/promises`) and `grep -rn "response-validation" tests/` shows
`operation-matrix.spec.ts:67` as its only consumer. Record in the commit body which
branch of this procedure was taken and the exact error that decided it.

## Out of scope

- **Rewriting any assertion — FIX-07.** The six source-text specs move with their
  contents untouched. If a moved spec fails on its own assertions after the move, record
  it and hand it on; do not repair it here.
- **Coverage thresholds and the `src/mocks/**` classification — FIX-08.** The coverage
  numbers will move a lot in this commit; that is expected and is not this task's to
  gate.
- **`vitest.config.ts` and the `angular.json` `runnerConfig` key — FIX-04.** The only
  edit to the `test` target here is the `setupFiles` key in step 5.
- **`e2e/`.** Root-level `e2e/` with `testDir: './e2e'` (`playwright.config.ts:32`) is
  the standard Playwright layout and matches `docs/spec/architecture.md:97`. Not a
  placement problem, not moved, not touched. The 41 failures there are FIX-09's.
- **`src/app/coverage-canary/`.** **FIX-62** deletes the directory and its five files
  entirely, under decision **D19** item 1, and **lands before this task** so the two
  `git mv` moves this file used to plan for `tests/coverage-canary.spec.ts` and
  `tests/coverage-canary-negative.spec.ts` are never made — see the removed rows 15-16.
  This task does not touch this directory, does not move any file into it and does not
  re-create it.
- **Adding `tests/**` to `lintFilePatterns`.** FIX-01 deliberately scoped lint to `src/`.
  After this task most of `tests/` is gone and what remains is six files; whether to lint
  them is a question for after FIX-39, not here.
- **Deleting the `tests/` directory.** Six files stay in it by design.

## How to verify

From the repository root, npm only, in this order.

**Before starting, confirm FIX-62 has landed**: `ls tests/coverage-canary*.spec.ts` must
report `No such file or directory`. If it does not, FIX-62 has not landed and this task
must not be started — stop and report.

1. `ls tests/` and `ls tests/contract/`

   Together they must list exactly six files and nothing else:
   `setup-msw.ts`, `network-isolation.spec.ts`, and under `contract/`
   `operation-matrix.spec.ts`, `response-validation.ts`, `schema.spec.ts`,
   `sdk-transport.spec.ts` — or four, if step 6's fallback branch was taken.

2. `grep -rn "\.\./src/" src/` — must print nothing.

3. `grep -rn "from './setup-msw'" src/` — must print nothing.

4. `npm run test`

   Must collect **38** spec files (14 that were already under `src/`, plus the 24 moved),
   or 40 if step 6's fallback was taken. Every file must be collected and executed; zero
   `document is not defined`, zero `Cannot read properties of null (reading 'use')`.

5. `npx vitest run --config vitest.contract.config.ts`

   Must exit **0**.

6. `npm run build` — must exit **0**.

7. `npm run lint` — must exit **0**, since the moved files are now inside
   `lintFilePatterns`' `src/**/*.ts` glob and are linted for the first time. Repair what
   it reports under the same rules FIX-02 set: fix the code, never the rule, and never
   add an `eslint-disable`.

8. `git status --short` — every moved file appears as a rename (`R`). A `D` beside an
   untracked `??` for the same basename means `git mv` was not used and a copy may have
   been left behind; go back and check `ls tests/`.

**On step 4's exit code:** as in FIX-04, a non-zero exit is not automatically this task's
failure. The 24 moved specs have not been executed since before FIX-04 landed, so their
real pass/fail state is unknown. What this task must achieve is that every one of them is
**collected and executed**. Assertion failures that survive are recorded in the commit
body with the FIX number that owns each, exactly as FIX-04 did, and are not silenced.
`docs/spec/acceptance.md:26` (AC22) forbids adding `.skip`, `.todo` or `.only` to make a
run green.

Gates that are red for reasons this task does not fully fix, so the executor does not
chase them beyond what steps 4 and 7 above already require: `npm run test`'s coverage
thresholds are **FIX-08**'s to turn on, and `npx playwright test` is **FIX-09**'s.
`npm run lint` and the collection half of `npm run test` are this task's own
responsibility. Do not run `npm run api:drift` or `npx playwright test` while working on
this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-06-AC01** `ls tests/ tests/contract/` lists exactly the six files named in
      step 1 of "How to verify" (four under `tests/contract/` if the step-6 fallback was
      taken, with the two moved files then present under `src/app/api/contract/`). No
      `*.spec.ts` remains anywhere under `tests/` other than
      `network-isolation.spec.ts`, `schema.spec.ts` and, unless moved,
      `operation-matrix.spec.ts` and `sdk-transport.spec.ts`.
- [ ] **FIX-06-AC02** `git status --short` shows every one of the 24 moves as a rename,
      and `git diff --staged --name-status | grep -c "^R"` prints at least `24`.
- [ ] **FIX-06-AC03** `grep -rn "\.\./src/" src/` prints nothing and
      `grep -rn "from './setup-msw'" src/` prints nothing.
- [ ] **FIX-06-AC04** `npm run test` collects **38** spec files (40 with the fallback),
      and `npm run test 2>&1 | grep -cE "document is not defined|reading 'use'"` prints
      `0`.
- [ ] **FIX-06-AC05** `npx vitest run --config vitest.contract.config.ts` exits `0`, and
      `node -p "require('./package.json').scripts['test:contract']"` prints `undefined` —
      no `test:contract` npm script exists.
- [ ] **FIX-06-AC06** `tests/setup-msw.ts` is under 60 lines
      (`wc -l tests/setup-msw.ts`), contains no occurrence of
      `resolveComponentResources` or `findFileInWorkspace`
      (`grep -cE "resolveComponentResources|findFileInWorkspace" tests/setup-msw.ts`
      prints `0`), and its guard tests `process.versions.node` rather than `document`.
- [ ] **FIX-06-AC07** `npm run build` exits `0` and `npm run lint` exits `0`.
- [ ] **FIX-06-AC08** The commit body lists every remaining assertion failure as
      `file:line — test name — one-line symptom — owning FIX number`, and records which
      branch of step 6's decision procedure was taken, with the error that decided it.
      `git diff --staged | grep -cE "\.(skip|todo|only)\("` prints `0`.
- [ ] **FIX-06-AC09** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change relocates spec files, rewrites their
      import paths, repairs a test setup file and adds a test runner configuration file.
      `git diff --staged --name-only` lists no non-spec file under
      `src/app/**` and no file under `public/`, so nothing that reaches a rendered surface
      changed. This is the exemption `.claude/rules/browser-verification.md` grants to a
      build or test-infrastructure change, stated explicitly rather than left out
      silently. **If the diff does list a non-spec file under `src/`, the exemption
      lapses** and the change that put it there is out of this task's scope: undo it.
- [ ] **FIX-06-AC10** The `mi-bolt-design` R01–R26 record is in the commit body. R01
      through R25 are marked **N/A — this task moves test files and repairs test
      infrastructure, and renders nothing a person can see**. **R26 is applicable and
      met**: the commit body names every file moved with its source and destination, the
      commands run with their exit codes, the deliberate deviations (six source-text
      specs moved unrewritten, `tests/contract/**` kept at the top level per
      `docs/spec/architecture.md:101`) and the remaining limitations (the assertion
      failures handed to FIX-07 and FIX-08). Skill provenance is stated once in
      `docs/fix/README.md` section 3, "Every task records the design rules": the
      installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns
      it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit — all 24 moves, the import rewrites, the setup-file
repair, the contract runner configuration and the `angular.json` `setupFiles` key
together. Splitting the moves across two commits would leave the suite half-collected in
between. Do not bundle it with FIX-04 or FIX-07. Commit only after every acceptance
criterion above passes.

Say in the commit body that co-locating these specs so one runner collects them — this
task's own subject — is exactly what makes `test:unit:coverage` (the second, disjoint
unit runner FIX-04 removed) redundant: after this commit every spec has exactly one
runner, `ng test` for the co-located ones and `vitest.contract.config.ts` for the six that
stay at the top level, with no overlapping second invocation left to remove.

Suggested subject line, in the repository's `type: summary` style:

```text
test: co-locate the feature specs under src and restore the contract runner
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**FIX-04 must land first.** It is what makes `ng test` execute at all, and it is what
removes the JIT compiler whose dead setup block this task deletes. Doing FIX-06 first
would move 24 specs into a runner that fails every one of them with
`ReferenceError: document is not defined`, so nothing could be verified.

**FIX-01 should land first** as well, so that step 7's `npm run lint` is a real check
rather than a command that refuses to start. FIX-02 landing first is better still,
because the moved specs are linted for the first time here and it is cheaper to meet one
rule set than two.

What depends on this task, inside this stream of nine:

- **FIX-07** — it rewrites the six source-text specs, and it does so at the paths this
  task moves them to.
- **FIX-08** — the coverage denominator and the set of files a run visits both change
  here, so turning thresholds on before this lands would gate against a number that is
  about to move.

**FIX-47' (`docs/fix/FIX-47.md`, D17's rewrite) must not land before FIX-01, FIX-04 and
FIX-06.** `test:unit:coverage` is the only currently-green unit command in the baseline
(`BASELINE.md:11`); removing it before `ng test` collects every spec (FIX-04) and before
the `tests/` tree has a runner of its own again (this task) would leave the repository
with no working unit command at all, in a window where nothing could verify anything.
