# FIX-40 — Make the static release and the handover real

Status: PLANNED — not executed.
Severity: blocker
Source: A7 F4, A7 F5, A7 F6, A7 F14, and A7's "T28 static release — is it real?" and "T29 handover — does it exist?" sections; decision **D17**

## Why this is wrong

Two tasks are recorded as built and neither has produced the evidence it was defined to
produce. A7's verdict on T28 is the precise one: **the mechanics are real and individually
correct; the release is not "real" in T28's sense.** The build exists, the static host
exists and behaves as specified, the budgets pass when somebody runs them by hand — and
`docs/mi-bolt/execution/deployment.md`, T28's own listed deliverable at
`docs/tasks/T28.md:20`, does not exist, so T28-AC01, AC04, AC05 and AC06 are unreached.
T29's verdict is shorter: **none of its four deliverables exists** and all five of its
criteria are unreached, while `docs/tasks/T29.md` still reads `Status: PLANNED`.

`docs/spec/execution-rules.md:19` is the rule both of them break: "Never claim a planned
test has run. Evidence must name commands, revisions, viewports, outputs and remaining
limitations." Commits `907e5a5 build: T28 — static deployment + budgets + SW cache policy`
and `3e8bbb0 build: T29 — final acceptance and handoff` are in the history; the evidence
those tasks were defined to leave behind is not.

**Decision D17 changes how the budget half is fixed.** The user's instruction —
*"nem kell ennyi script es npm parancs sem, standardek kellenek"* ("this many scripts and
npm commands are not needed either; standards are what is needed") — means this task no
longer wires `scripts/check-budgets.mjs` to a new `npm run` entry. It deletes the script
instead, and the requirement it existed to enforce is covered a different way, argued in
Evidence below.

## Evidence

### What is real

Confirmed on commit `db6d295`:

```bash
$ ls dist/mi-bolt/
3rdpartylicenses.txt  browser  prerendered-routes.json
$ ls dist/mi-bolt/browser/ | head -4
assets
chunk-0SaHn0wx.js
chunk-AEBYOITI.js
chunk-b0irB15C.js
$ cat dist/mi-bolt/prerendered-routes.json
{
  "routes": {}
}
```

- **The build artefact is real**: hashed chunks, `index.html`, `mockServiceWorker.js` and
  `assets/`. `prerendered-routes.json` is an empty builder stub, consistent with the
  no-SSR, no-prerender requirement rather than evidence against it.
- **The service worker is MSW only.** No `@angular/service-worker` dependency, no
  `serviceWorker` option in `angular.json` — which is what T28-AC03 asks for.
- **`scripts/serve-static.mjs` matches its own AC02/AC03 contract.** Its header at `:6-22`
  states, and A7 confirmed, that it binds `127.0.0.1` only, applies SPA fallback to every
  non-`/api/` path, returns 404 with `application/problem+json` for `/api/*`, tags
  `index.html` / `mockServiceWorker.js` / `favicon.ico` `no-cache, no-store,
  must-revalidate` and hashed assets `public, max-age=31536000, immutable`. It is wired as
  the Playwright `webServer` at `playwright.config.ts:61`. **It applies no compression** —
  its own header says so — so a byte served by it is the same size as the byte on disk.
- **The budgets pass, measured once by the script this task now deletes.** `node
  scripts/check-budgets.mjs` measured initial JS **52.63 KiB** gzip against a 300 KiB
  budget, first-view total **230 KiB** against 1 MiB, and the largest lazy chunk
  **109.08 KiB** gzip against 150 KiB. This task re-measures rather than copying these
  numbers forward — see "How T28-AC04's gzip figures survive the script's deletion" below.

### What is missing

```bash
$ find docs/mi-bolt/execution -type f | wc -l
0
$ ls release-manifest.json
ls: release-manifest.json: No such file or directory
```

Missing by name, each with the packet line that defines it:

| File | Defined at | Owner |
|---|---|---|
| `docs/mi-bolt/execution/deployment.md` | `docs/tasks/T28.md:20` | T28 |
| `docs/mi-bolt/execution/acceptance-report.md` | `docs/tasks/T29.md:19` | T29 |
| `docs/mi-bolt/execution/traceability.md` | `docs/tasks/T29.md:20` | T29 |
| `docs/mi-bolt/execution/runbook.md` | `docs/tasks/T29.md:21` | T29 |
| `release-manifest.json` (repository root) | `docs/tasks/T29.md:22` | T29 |
| `docs/mi-bolt/execution/progress.json` | `docs/tasks/README.md:9` | this task — see below |

### How T28-AC04's gzip figures survive the script's deletion

`scripts/check-budgets.mjs:18-22` says of itself: "It is the source of truth for the
`300 KiB / 1 MiB / 150 KiB` numbers that the design review records." Under
`.claude/rules/planning-deliverables.md`, a number whose only authority is the script that
enforces it is an agent-chosen proposal, not a gate someone else set — "an agent-chosen
number is a proposal, never a gate."

**`angular.json`'s own `budgets` array is the real build-time gate, and it is already
there.** `angular.json:36-47`, under the `production` configuration:

```json
"budgets": [
  { "type": "initial", "maximumWarning": "500kB", "maximumError": "1MB" },
  { "type": "anyComponentStyle", "maximumWarning": "4kB", "maximumError": "8kB" }
]
```

`ng build` (i.e. `npm run build`, `defaultConfiguration: production` per `angular.json`)
already fails on a `maximumError` breach. This is Angular's own numbers, already
enforced, already in the tree — nothing is added to `angular.json` by this task unless
this task's own measurement says the existing numbers are wrong.

**Angular's budgets measure raw bytes; the builder's schema has no gzip option at all** —
`node_modules/@angular/build/src/builders/application/schema.json` has no `gzip` or
`compress` key anywhere in its budget definition. T28-AC04's figures are explicitly
**gzip** ("initial JS <=300 KiB gzip … per-route lazy JS <=150 KiB gzip"), so the two
cannot be the same gate. **The split this task makes:** `angular.json`'s `budgets` array
is the build-time gate `ng build` already enforces on raw bytes, and T28-AC04's gzip
figures are **measured once and recorded** in `docs/mi-bolt/execution/deployment.md`,
which item 2 below already commissions — "Where a threshold would be invented, measure
and record instead." No line of any specification document changes.

**Two of T28-AC04's three byte figures need no gzip math at all.** Only "initial JS" and
"per-route lazy JS" say **gzip**; "total first-view transferred assets" does not repeat
the word, and `scripts/serve-static.mjs` applies no compression, so the transfer size a
real browser reports for the first view **is** the figure T28-AC04 asks for — no
computation needed beyond reading it off `list_network_requests` in the AC06 browser
session below. The other two — initial JS gzip and the largest lazy chunk's gzip — are
computed with the standard `gzip` utility against the files `index.html` names, per item 2
below. Neither needs a committed script: `gzip -c <file> | wc -c` is the standard idiom,
the same way `git diff --exit-code` is FIX-11's standard idiom for drift.

### The budget gate was never wired to anything

```bash
$ grep -n "check-budgets" package.json
(nothing)
```

`scripts/check-budgets.mjs` was a T28 deliverable (`docs/tasks/T28.md:22`) with no
`package.json` script entry, so it enforced nothing automatically on `db6d295` or since.
Under D17 this task does not finally wire it; it deletes it, because the measurement it
performed is redone by hand, once, exactly as item 2 below describes.

### A live loophole in T28's own spec file

`e2e/deployment/deep-links.spec.ts:28-29` carries a comment describing a workaround for a
build failure that no longer occurs:

```ts
 * mean the canonical `dist/mi-bolt/browser` is empty; running the
 * suite against `dist/t13-catalog/browser` exercises the same
```

and line 210 is not a comment — it is an assertion that accepts either directory:

```ts
    expect(STATIC_DIR).toMatch(/(dist\/mi-bolt\/browser|dist\/t13-catalog\/browser)/);
```

So the deep-link suite can be satisfied by pointing it at a stale intermediate build. The
build is healthy today (`npm run build` exits `0`), so the alternative has no reason to
remain. `docs/tasks/T28.md:21` lists this file as a T28 deliverable, which is why it is in
this task.

### Two uncertainties A7 could not settle, carried forward unresolved

These are recorded here as open, not as facts. Do not write either of them into
`deployment.md` as settled.

1. **"Angular's native budgets gate on raw bytes, not gzip."** A7 rated this "reasonably
   likely but not triple-confirmed": it rests on angular.dev's build documentation plus
   `angular/angular-cli#22293`, a closed "not planned" request for compressed-size
   budgets, and a third independent source was not found. Confirmed again for this task
   by reading `node_modules/@angular/build/src/builders/application/schema.json`, which
   has no gzip option; the second independent documentation confirmation
   `.claude/CLAUDE.md` asks for was still not found, so record this claim as short of the
   workspace's two-confirmation bar rather than as settled fact.
2. **Whether `angular.json`'s raw budgets and the gzip figures this task measures by hand
   are complementary or one supersedes the other.** Unresolved. Both are now real
   measurements against the same bundle; nothing says which is authoritative if they
   disagree.

### T28-AC02's `/mi-bolt/` half was removed rather than built

`docs/tasks/T28.md:43` (T28-AC02) used to require deep links to work "under / **and
/mi-bolt/**", and an earlier version of this file recorded A7 F11 — the missing
`resolveAssetUrl` boundary — as an unowned blocker standing in front of that second half.
Both halves of that situation have since been settled and neither is this task's to
resolve:

- **The user dropped the sub-path: "es base href-et torroljuk, nem kell" ("and let's
  delete the base href, we don't need it"), which is decision D14.** **`FIX-54`** owns
  the removal, `docs/tasks/T28.md:43` included. **Read what T28-AC02 says at the moment
  you write `deployment.md`, and record that, rather than either half of it from
  memory.**
- **A7 F11 is owned.** **`FIX-49`** builds `resolveAssetUrl` and completes the asset
  manifest. It is no longer an unowned blocker and this task neither builds it nor
  reports it as unowned.

This task records what T28-AC02 requires when it runs and measures the application
against exactly that. It does not argue with the criterion and it does not restore a
requirement the user removed.

### One A7 finding that no longer reproduces

A7 F12 reported `.verify-fixes/` as an untracked, non-gitignored screenshot dump at the
repository root. It is gone: `ls -d .verify-fixes` returns "No such file or directory" on
`db6d295`, most likely removed by `065c176 chore: remove screenshot assets from repo` or
`db6d295 remove wrong files`. Nothing to do. It is recorded here so that a later reader
does not go looking for it. `.visual-screenshots/` **is** gitignored (`.gitignore:319`), as
A7 F13 said.

## What to change

Everything in this task is evidence written from commands actually run. **No file below may
contain a number, a status or an output that was not produced by a command in the same
session that wrote it.** That is `docs/spec/execution-rules.md:19`, and it is the rule both
T28 and T29 broke.

### 1. Delete the unwired budget script and its packet entries

Under decision **D17**, this task does not add a new npm-script entry of any name to
`package.json`. It deletes `scripts/check-budgets.mjs` outright:

```bash
rm scripts/check-budgets.mjs
```

Then remove the three references that name the deleted script:

- `docs/tasks/T28.md:22` — the line `- \`scripts/check-budgets.mjs\`` inside the
  `## Files` list (`:19-22`). Delete that one line.
- `docs/tasks/tasks.json:1588` — `"scripts/check-budgets.mjs"` inside T28's `"files"`
  array (`:1584-1589`), and it is the **last** element (no trailing comma). Delete that
  line, **and** remove the trailing comma from the new last line, `:1587`, changing
  `"e2e/deployment/deep-links.spec.ts",` to `"e2e/deployment/deep-links.spec.ts"` —
  otherwise the JSON file becomes invalid.
- `docs/index.html:4111` — inside the `data-search='{"id": "t28", …}'` attribute, the
  substring `"e2e/deployment/deep-links.spec.ts", "scripts/check-budgets.mjs"]` — delete
  exactly `, "scripts/check-budgets.mjs"` (with its leading comma and space), leaving
  `"e2e/deployment/deep-links.spec.ts"]` in place.
- `docs/index.html:4114` — inside `<h3>Fájlfelelősség</h3><div class="file-list">…</div>`,
  delete the exact substring `<code>scripts/check-budgets.mjs</code>`.
- `docs/index.html:4131` — the whole line is
  `<li><code>scripts/check-budgets.mjs</code></li>`; delete the entire line.

**Line numbers will have shifted if a sibling task has already edited `docs/index.html`;
locate each by content, not by number, before editing.** This edit lands in the same
commit as item 6's pointer-line addition to `docs/tasks/T28.md`; make both changes to
that file in one pass.

### 2. Write `docs/mi-bolt/execution/deployment.md`

The evidence record T28 was defined to leave. It contains, each with the command that
produced it and that command's verbatim output:

- **AC01 — hosting.** The command used to serve the build (`PORT=4300 node
  scripts/serve-static.mjs`), the address it bound, and the statement that `file://` is
  not a valid deployment for this app because MSW needs a real origin to register a
  service worker on.
- **AC02 — deep links.** The routes tested under `/`, each with its HTTP status; the
  `/api/*` 404 with its `content-type: application/problem+json`; and the MSW-startup
  failure case. **Quote `docs/tasks/T28.md:43` into the document as it reads on the day
  you run this**, and measure against that text. Decision **D14** dropped the sub-path
  deployment and **`FIX-54`** owns removing its half of this criterion, so what the
  criterion asks for depends on whether `FIX-54` has landed. Do not test a `/mi-bolt/`
  deployment that the criterion no longer names, and do not record a `/mi-bolt/` result
  as a gap if the criterion no longer asks for one. See the Evidence section above.
- **AC03 — cache policy.** The `cache-control` header observed for `index.html`,
  `mockServiceWorker.js` and one hashed chunk, each quoted from a real response.
- **AC04 — budgets, the whole budget story.** Three separate measurements, none of them
  from a script this task commits:
  1. **Raw-byte budget, the build-time gate.** `npm run build`'s own exit code and, if it
     printed one, the warning/error line `@angular/build:application` emits for a budget
     breach. `angular.json:36-47`'s `budgets` array is quoted here as the gate that ran.
  2. **Initial JS gzip and largest lazy-chunk gzip, measured by hand.** List the files
     `index.html`'s `<script type="module">` and `<link rel="modulepreload">` tags name —
     that is the initial set — and gzip each with the standard tool:
     ```bash
     for f in $(grep -oE '(src|href)="[^"]+\.js"' dist/mi-bolt/browser/index.html \
       | sed -E 's/^(src|href)="//;s/"$//'); do
       printf '%s ' "$f"; gzip -c "dist/mi-bolt/browser/$f" | wc -c
     done
     ```
     Sum the printed byte counts for the **initial JS** figure. Then gzip every
     `chunk-*.js` file under `dist/mi-bolt/browser/` that the command above did **not**
     list, and record the largest single gzip size as the **largest lazy chunk** figure.
     Quote both commands and their full output in `deployment.md`. Compare each to the
     `300 KiB` and `150 KiB` figures `scripts/check-budgets.mjs` used to enforce before
     this task deleted it — those two numbers are still the design review's own record
     (`docs/tasks/T28.md:45`, T28-AC04) and this task does not change them, only how they
     are measured.
  3. **First-view total transferred bytes, read from the browser, not computed.**
     T28-AC04 does not say "gzip" for this one, and `scripts/serve-static.mjs` applies no
     compression, so the number AC06's `list_network_requests` reports **is** the figure —
     sum the transferred size of every request the first view makes. No gzip math applies
     here.
  4. **CLS ≤ 0.1, the fourth number.** Record the measured CLS from a local Lighthouse
     run, or record that it was not measured and why. Do not write a CLS figure that no
     tool produced.
- **AC05 — network log.** The full network log from the **optimized build**, not the
  development server — T28-AC05 says "check optimized build separately from coverage
  build". Every request with its origin, and the statement that no analytics, social,
  chat, consent SaaS, remote font or production API host appears.
- **AC06 — 3D.** That no 3D chunk or asset exists in the baseline bundle, with the command
  that shows it.
- **Remaining limitations**, including the two uncertainties in the Evidence section above,
  stated as open questions with their sources. A7 F11 is **not** among them: **`FIX-49`**
  owns `resolveAssetUrl` and the asset manifest. Record whether `FIX-49` had landed when
  this document was written, and if it had not, record that as a limitation naming
  `FIX-49` rather than as an unowned blocker.

### 3. Repair `e2e/deployment/deep-links.spec.ts`

Delete the stale sentence that spans `:27-30` — *"The pre-existing T13/T24 build errors
mean the canonical `dist/mi-bolt/browser` is empty; running the suite against
`dist/t13-catalog/browser` exercises the same deep-link paths on the latest working
shell."* — keeping the rest of `:27` (*"`MI_BOLT_E2E_STATIC_DIR`."*) intact, and tighten
the assertion at `:210` to the canonical directory only:

```ts
    expect(STATIC_DIR).toMatch(/dist\/mi-bolt\/browser/);
```

Run the suite afterwards. If it fails, the failure is real and belongs in `deployment.md`
as a finding; do not put the alternative back.

### 4. Write the four T29 deliverables

- **`docs/mi-bolt/execution/acceptance-report.md`** — every one of T00–T29 and O01 with its
  real status and the evidence behind it. A task with no evidence is recorded as **not
  accepted**; that is the honest and useful answer, and T29-AC01 asks for "real evidence",
  not for a full set of ticks. O01 is recorded as explicitly out of scope unless the user
  has approved it.
- **`docs/mi-bolt/execution/traceability.md`** — the RQ01–RQ20 and AC01–AC28 mapping with
  the state each is actually in, recorded by a human reading each requirement against the
  code — there is no citation-based gate to read a count from; decision **D17** removed
  it. Where a requirement's status is uncertain, say so rather than guessing.
- **`docs/mi-bolt/execution/runbook.md`** — T29-AC03's clean-checkout sequence, written as
  commands somebody can paste, limited to the eleven survivor npm scripts of decision
  **D17**/**D19 item 3** plus the two bare commands that are not package scripts:
  `npm ci`, `npm run lint`, `npm run test`, `npm run build`, `npm start`,
  `npm run build:e2e`, `npm run api:generate`, `npm run api:drift`, `npm run format`,
  `npm run format:check`, `npx playwright test`. Beside each, its measured exit code **at
  the moment the runbook is written**, and for each red one, the `FIX` number that owns
  it. Two commands dirty the working tree — `npm run api:drift` regenerates 27 files
  under `src/app/api/generated/` and `npx playwright test` rewrites 49 screenshots under
  `e2e/design/screenshots/` — and the runbook says so beside each, because that is the
  kind of surprise a runbook exists to prevent.
- **`release-manifest.json`** at the **repository root** (`docs/tasks/T29.md:22`, not under
  `docs/`): exact dependency versions, the source revision, the artefact list from
  `dist/mi-bolt/browser/` with sizes, and the statement T29-AC05 requires — that this is
  not production commerce, it persists only demo state, sends no order or email, and
  collects no real payment.

### 5. Write `docs/mi-bolt/execution/progress.json`

`docs/tasks/README.md:9` says the real execution status belongs in
`docs/mi-bolt/execution/progress.json` ("a létrehozandó"), and A7 listed it as a broken
reference. It is this task's rather than `FIX-38`'s because an honest status per task is
exactly what the acceptance report in item 4 establishes; writing it earlier would mean
inventing statuses. Derive it from the acceptance report so the two cannot disagree: one
entry per task from `docs/tasks/tasks.json`, each carrying the status the report gives it.

### 6. Update the two packet headers

`docs/tasks/T28.md:3` and `docs/tasks/T29.md:3` both read `Status: PLANNED — this packet is
an implementation specification, not execution evidence.` Leave that sentence alone — it
describes the packet, and the packet is still a specification. Add one line under each
pointing at the evidence record this task created, so a reader who opens the packet finds
the evidence in one hop. This is the same commit as item 1's `docs/tasks/T28.md` edit;
make both changes to that file together.

### Files this change touches

- `scripts/check-budgets.mjs` (deleted)
- `e2e/deployment/deep-links.spec.ts`
- `docs/mi-bolt/execution/deployment.md` (new)
- `docs/mi-bolt/execution/acceptance-report.md` (new)
- `docs/mi-bolt/execution/traceability.md` (new)
- `docs/mi-bolt/execution/runbook.md` (new)
- `docs/mi-bolt/execution/progress.json` (new)
- `release-manifest.json` (new, repository root)
- `docs/tasks/T28.md` (Files-list line removed, evidence pointer added)
- `docs/tasks/T29.md` (evidence pointer added)
- `docs/tasks/tasks.json` (one line removed from T28's `"files"` array)
- `docs/index.html` (three edits, all naming `check-budgets.mjs`)

## Out of scope

- **Do not build `resolveAssetUrl` — `FIX-49`.** A7 F11 is real and it is owned;
  building it here would put an architecture change inside a release-evidence commit.
  Record in `deployment.md` whether `FIX-49` had landed, and name it. Do not report it
  as unowned work.
- **Do not restore, test or write about the `/mi-bolt/` sub-path deployment —
  `FIX-54`.** Decision **D14** removed it on the user's own instruction. Do not edit
  `src/index.html`, `src/app/app.config.ts`, `scripts/serve-static.mjs`,
  `docs/tasks/T28.md`'s acceptance-criterion text, or `src/app/app.spec.ts`, and do not
  add a base-path option to anything so that a `/mi-bolt/` measurement becomes possible.
  Measure T28-AC02 as it reads when this task runs; see the Evidence section. This task's
  own edit to `docs/tasks/T28.md` (item 1 and item 6) touches only the `## Files` list and
  the status line, never T28-AC02's text.
- **`FIX-38`** owns `docs/mi-bolt/execution/skill-location.json` and deletes
  `scripts/verify-skill-evidence.mjs`. The runbook in item 4 names `npm run build`,
  `npm run test`, `npm run lint` and the other survivors, none of which was that script's
  concern; if `FIX-38` has not landed, cite the installed skill path directly per
  FIX-40-AC10 below.
- **`FIX-39`** owns the deletion of `scripts/check-traceability.mjs` and the removal of
  the citation-based traceability count. This task's `traceability.md` is the human
  record decision D17 leaves in the gate's place; it does not repair or reintroduce the
  deleted gate.
- **`FIX-09`** owns the 41 Playwright failures, **`FIX-08`** the coverage thresholds,
  **`FIX-01`** the lint target, **`FIX-11`** `api:drift`'s dirty working tree. The runbook
  records every red exit code and names the owner; it repairs none of them.
- **`FIX-36`** owns `docs/README.md`, `docs/tasks/README.md` and the wrong
  `docs/mi-bolt/<x>` path prefixes. This task writes new files **under**
  `docs/mi-bolt/execution/`, which is the one prefix that is correct and which FIX-36
  leaves alone.
- **`FIX-47'`** owns reducing `package.json`'s `scripts` block to the eleven survivors and
  rewriting `docs/spec/testing.md`'s command list. This task adds no `package.json` entry
  and does not open `testing.md`.
- **Do not fabricate an accepted status, a coverage figure, a Lighthouse score or a passing
  gate.** An unmeasured value is recorded as unmeasured with the reason.
  `docs/spec/execution-rules.md:19` is the rule and this task is the one most exposed to
  breaking it.
- **Do not run `git push`.** The push and the pull request belong to the orchestrating
  session, per `.claude/rules/session-lifecycle.md`.

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm.

```bash
npm run build
```

Expected: exit `0`. Run this first: every measurement below reads `dist/mi-bolt/browser/`,
and a stale `dist/` would put stale numbers into `deployment.md`. This is also the raw-byte
budget gate: a `maximumError` breach in `angular.json:36-47`'s `budgets` array fails this
command directly.

```bash
ls scripts/check-budgets.mjs
```

Expected: `No such file or directory`.

```bash
for f in $(grep -oE '(src|href)="[^"]+\.js"' dist/mi-bolt/browser/index.html \
  | sed -E 's/^(src|href)="//;s/"$//'); do
  printf '%s ' "$f"; gzip -c "dist/mi-bolt/browser/$f" | wc -c
done
```

Record every line, and sum the byte counts, into `deployment.md`'s initial-JS figure. Run
the equivalent over every `chunk-*.js` this command does **not** list for the largest
lazy-chunk figure. A7 measured initial JS 52.63 KiB gzip, largest lazy chunk 109.08 KiB
gzip at the `db6d295` baseline; re-measure rather than copying those forward, since the
build has changed if any earlier `FIX` task has landed.

```bash
PORT=4300 node scripts/serve-static.mjs
```

Serves `dist/mi-bolt/browser/` on `http://127.0.0.1:4300`. Use port **4300**, not the
default 4200, so this does not collide with a development server another task may have
running. Stop it when the measurements are done — `.claude/CLAUDE.md` ("Cleanup") makes
every process this task starts this task's to stop.

```bash
curl -sI http://127.0.0.1:4300/index.html | grep -i cache-control
curl -sI http://127.0.0.1:4300/mockServiceWorker.js | grep -i cache-control
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:4300/api/v1/products
```

Expected: `no-cache, no-store, must-revalidate` twice, then `404 application/problem+json`.
These are evidence for `deployment.md`; note that **an HTTP 200 from `curl` is explicitly
not browser verification** under `.claude/rules/browser-verification.md`. AC06 below is.

```bash
npx playwright test e2e/deployment/deep-links.spec.ts
```

Expected: exit `0`. **This run rewrites screenshots under `e2e/design/screenshots/` only if
the design specs run**; limiting it to the one file avoids that. Check
`git status --short` afterwards either way.

```bash
npm run lint; npm run test; npm run build:e2e; npm run api:generate; npm run api:drift; npm run format:check
```

Record each exit code for the runbook (item 4). **`npm run api:drift` regenerates 27
files under `src/app/api/generated/` and leaves the working tree dirty** — run it
deliberately, record the result, and check `git status --short`. `FIX-11` owns that
behaviour; do not repair it here and do not commit regenerated files without saying why.

## Acceptance criteria

- [ ] **FIX-40-AC01** All six files exist and are non-empty:
      `docs/mi-bolt/execution/{deployment.md,acceptance-report.md,traceability.md,runbook.md,progress.json}`
      and `release-manifest.json` at the repository root.
      `find docs/mi-bolt/execution -type f | wc -l` returns at least `5`; it returned `0`
      on `db6d295`.
- [ ] **FIX-40-AC02** `npm run build` exits `0`, and `deployment.md` contains, for
      AC04: the build's own exit code as the raw-byte budget result; the two gzip
      shell-pipeline commands from "How to verify" with their full output and computed
      sums; the first-view transferred-byte total read from AC06's `list_network_requests`
      session; and the measured or explicitly-unmeasured CLS. Every number in
      `deployment.md` traces to a command quoted in the same document. Check by picking
      any three numbers at random and finding the command above each.
- [ ] **FIX-40-AC03** `scripts/check-budgets.mjs` does not exist, `package.json` gains no
      new script entry (`git diff package.json` shows nothing), and `docs/tasks/T28.md`,
      `docs/tasks/tasks.json` and `docs/index.html` no longer name
      `scripts/check-budgets.mjs` — check with
      `grep -c "check-budgets" docs/tasks/T28.md docs/tasks/tasks.json docs/index.html`,
      which must print `0` for all three.
- [ ] **FIX-40-AC04** `grep -n "t13-catalog" e2e/deployment/deep-links.spec.ts` returns
      nothing, and `npx playwright test e2e/deployment/deep-links.spec.ts` exits `0`.
- [ ] **FIX-40-AC05** `runbook.md` lists every one of the **nine** runbook-relevant survivor
      npm scripts named in item 4 (of decision **D19**/**D19 item 3**'s eleven survivors,
      `ng` and `watch` are excluded — neither is a step in a clean-checkout verification
      sequence) plus `npm ci` and `npx playwright test`, each with its **measured** exit
      code at the time of writing, and every non-zero one names the `FIX` number that owns
      it. Check with
      `grep -c "npm run build\|npm run lint\|npm run test\|npm start\|npm run build:e2e\|npm run api:generate\|npm run api:drift\|npm run format\|npx playwright test\|npm ci" docs/mi-bolt/execution/runbook.md`,
      which must print at least `10`. The strings `pnpm` and `mise` appear nowhere in it.
- [ ] **FIX-40-AC06** **Real-browser check of the optimized build.** This task is **not**
      exempt: T28-AC05 requires the optimized build's network log, and T28-AC02 requires
      deep links to resolve in a browser. Serve the production build with
      `PORT=4300 node scripts/serve-static.mjs` and, through the `real-browser-sonnet`
      agent at 1440×900, record:
      (a) `http://127.0.0.1:4300/telefonok/demo-one-5g` opened by **direct navigation**
      renders the product page rather than a 404 — the SPA fallback working on a deep link;
      (b) `list_network_requests` for a full first view, with every request's origin and
      **transferred size**, the confirmation that every origin is `127.0.0.1:4300` and
      that no analytics, social, chat, consent, font or production API host appears —
      T28-AC05's own evidence — and the summed transferred bytes recorded as AC04's
      first-view-total figure;
      (c) `list_console_messages` returns zero errors, and MSW registers (the
      `mockServiceWorker.js` request is present and succeeds);
      (d) one complete purchase flow, cart through success, driven with `click` and `fill`,
      proving the release is usable and not merely served;
      (e) screenshots of the home page and the success page from the **optimized build**,
      not the development server.
      All of it goes into `deployment.md`. Per
      `.claude/rules/browser-verification.md`, a `curl` 200, a green Playwright run or a
      file-existence check is explicitly **not** this criterion.
- [ ] **FIX-40-AC07** `acceptance-report.md` records a status for every one of the 31 tasks
      in `docs/tasks/tasks.json`, and every status reading accepted names the evidence
      behind it. `progress.json` has one entry per task and every status in it equals the
      one in `acceptance-report.md` — check by diffing the two lists. O01 is recorded as
      out of scope unless the user has approved it.
- [ ] **FIX-40-AC08** `deployment.md` records the two uncertainties from the Evidence
      section as **open**, with their sources. It also quotes `docs/tasks/T28.md:43`
      verbatim as it reads on the day the document is written, and records the deep-link
      result against exactly that text — with a sentence naming **`FIX-54`** and decision
      **D14** if the `/mi-bolt/` half is gone, and naming **`FIX-49`** for
      `resolveAssetUrl`'s status. No open question is written up as settled. If a claim
      could not be confirmed, the document says "unverified" beside it, per
      `.claude/CLAUDE.md` ("Verification and evidence").
- [ ] **FIX-40-AC09** `git status --short` after the commit lists no unexpected file. In
      particular, if `npm run api:drift` or a Playwright run dirtied
      `src/app/api/generated/` or `e2e/design/screenshots/`, those files are either
      committed with a stated reason in the commit body or excluded with a stated reason.
      No process started by this task is left running.
- [ ] **FIX-40-AC10** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body, and **R26 is the rule this task exists for**: "At handoff, identify
      the files, checks, deviations and actual remaining limitations." It is met when
      `acceptance-report.md`, `runbook.md` and `deployment.md` between them name every file
      changed, every check run with its exit code, every deviation from the specification,
      and every remaining limitation — including the two open uncertainties, the status of
      `resolveAssetUrl` with **`FIX-49`** named, and every red gate with its owning `FIX`
      number.
      **R15** is applicable and met: `release-manifest.json` carries T29-AC05's statement
      that this is not production commerce. **R24** is applicable and met through AC06(d):
      the purchase flow completes against the optimized build.
      Mark **R01–R14, R16–R23, R25** N/A, each with a one-sentence reason — for example
      "R11 N/A: this task writes evidence documents and changes no image, aspect ratio or
      catalogue rendering." AC06's screenshots are evidence of the release, not a redesign.
      Cite `docs/mi-bolt/execution/skill-location.json` if `FIX-38` has landed; otherwise
      cite the installed path `.claude/skills/mi-bolt-design/` (version `1.0.1` per its
      `metadata.version` frontmatter) and record that the provenance file is still absent.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-38`, `FIX-39` or any other FIX
task.

**Run it second-to-last: after every other task in the package except `FIX-53`, which
runs last.** Its whole content is a record of the repository's state, so a record written
before the repairs land describes a repository that no longer exists by the time anyone
reads it. `FIX-53` is the one task that runs after this one, because `FIX-53.md:295-304`
item 5 cross-checks its own summary against `docs/mi-bolt/execution/traceability.md`,
which this task creates. **`FIX-39` and `FIX-72` both run before this task, not after
it** — the closing order is `FIX-39 → FIX-72 → FIX-46 → … → FIX-40 → FIX-53`
(**D25**), because `FIX-39` lands before `FIX-46` and `FIX-46` lands before this one,
and `FIX-72` (the split-out judgment pass over the remaining unreached criteria) lands
somewhere between `FIX-39` and this task — so this task's `traceability.md` and
`runbook.md` are written with FIX-39's skip removals, FIX-72's assertions, and the
gate's deletion already in the tree, and nothing updates them afterwards.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
build: write the T28 deployment record and the T29 handover evidence
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session, per `.claude/rules/session-lifecycle.md`.
