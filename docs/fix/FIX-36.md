# FIX-36 — Correct docs/README.md, the asset manifest and the dead prompt references

Status: PLANNED — not executed.
Severity: major
Source: A7 F7, A7 F8, A7 F9; binding decisions **D2** and **D3**

## Why this is wrong

The documentation describes a directory tree that does not exist. `docs/README.md:5-21`
tells the reader that everything lives under `docs/mi-bolt/{README.md,
VEGREHAJTASI-PROMPT.hu.md, index.html, spec/, api/, design/, tasks/}`; the real layout is
flat — `docs/{spec,api,design,tasks,index.html}` plus `docs/mi-bolt/execution/`. Every
document in the package inherited that prefix, so **499 path references across 38 files
point at directories that are not there**. A fifth, separate item carries the same wrong
prefix: `docs/design/asset-manifest.json`'s four `path` values, measured outside the 499
because that count excludes JSON by construction (`--include="*.md" --include="*.html"`).
On top of that, ten references name a file, `VEGREHAJTASI-PROMPT.hu.md`, that exists
nowhere in the repository.

**This task is the first of two.** The user split the original single task:
*"Mindkettő felosztva"* ("split both"). This file owns `docs/README.md`,
`docs/index.html`, `docs/design/asset-manifest.json`, the six other documentation files
that carry the wrong prefix, and **every** reference to `VEGREHAJTASI-PROMPT.hu.md`.
`FIX-36b` owns the 31 task packets, `docs/tasks/T00.md`–`T29.md` and `docs/tasks/O01.md`,
whose citations carry the same wrong prefix. The two commits leave a documented window in
which the two halves of the package disagree; "Where this sits in the stream" below names
it and says which order makes it shortest.

Both are settled decisions, not open questions:

- **D2 — keep the flat layout and correct the documentation.** Do not move `spec/`,
  `api/`, `design/`, `tasks/` or `index.html`. `docs/mi-bolt/execution/` stays exactly
  where it is, because `.claude/CLAUDE.md` names that path and the files under it by name.
- **D3 — delete the references to `VEGREHAJTASI-PROMPT.hu.md`**, do not reconstruct the
  file. The user's words were *"ezt torold"* ("delete this").

## Evidence

### The tree that is described

`docs/README.md:5-21`:

```text
A ZIP egyetlen felső szintű mappája a `mi-bolt/`. **Ezt másold a projekt meglévő `docs/`
mappájába.** A végeredmény `docs/mi-bolt/` legyen, ne `docs/docs/...`, és ne külön
alkalmazás a dokumentáció alatt.

projekt/
├── package.json                    a készülő vagy meglévő alkalmazásé
├── src/                            az alkalmazás forrása
└── docs/
    └── mi-bolt/
        ├── README.md               ez a belépő
        ├── VEGREHAJTASI-PROMPT.hu.md
        ├── index.html              magyar interaktív áttekintő
        ├── spec/                   architektúra, képernyők, komponensek,
        │                           tesztek, elfogadás és technológiai döntések
        ├── api/                    OpenAPI YAML, generátorminta, fixture-k
        ├── design/                 prototípus, képernyőtervek, helyi demóképek
        └── tasks/                  T00–T29, opcionális O01, függőségi gráf
```

### The tree that exists

```bash
$ ls docs/
api  design  fix  index.html  mi-bolt  README.md  spec  tasks
$ find docs/mi-bolt -type f | wc -l
0
$ find docs/mi-bolt -type d
docs/mi-bolt
docs/mi-bolt/execution
docs/mi-bolt/execution/evidence
docs/mi-bolt/execution/evidence/screenshots
```

`docs/mi-bolt/` contains only an empty `execution/` chain. Every piece of content named in
that tree is one level higher.

### How far the wrong prefix reaches — measured

Measured on commit `db6d295`:

```bash
$ grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/ --include="*.md" --include="*.html" \
    | grep -v "docs/mi-bolt/execution" | wc -l
499
```

That figure was measured before the `docs/fix/` package existed. **Every command in
this file excludes `docs/fix/` with `--exclude-dir=fix`**, because these task files quote
the wrong prefix as evidence and would otherwise be counted as defects by the gate that
is supposed to prove the defect gone. Re-measured on `db6d295` with `/usr/bin/grep` (BSD
grep 2.6.0-FreeBSD): with the exclusion, 499; without it, 516 at the time this file was
written, and rising as the `docs/fix` package grows. The excluded figure is the stable
one and is the one every criterion below uses.

Split by file type: **246** occurrences in `docs/**/*.md` across 37 markdown files, and
**253** in `docs/index.html`. A further **77** markdown occurrences and **94** in
`index.html` are `docs/mi-bolt/execution…`, which are **correct** and must survive. Three
more occurrences use the bare form with no trailing slash, and those are sentences rather
than paths: `docs/spec/execution-rules.md:3`, `:23` and `docs/spec/sources.md:133`.

The per-file distribution is one long tail and one head, and it is exactly where the
split between this task and `FIX-36b` falls:

- **`docs/index.html`** — 253 wrong, 94 `…/execution` to preserve. **This task's.**
- **Six markdown files** — 19 wrong (this task's own sweep) plus one deliberately left in
  place, 5 to preserve: `docs/README.md` (3), `docs/spec/execution-rules.md` (9),
  `docs/spec/architecture.md` (4), `docs/spec/testing.md` (1 of this task's, at `:63`; the
  second, at `:9`, is left for **FIX-47** — see "One line this task deliberately does not
  sweep" below), `docs/spec/screens.md` (1), `docs/api/README.md` (1). **This task's.**
- **The 31 task packets** — `docs/tasks/T00.md`–`T29.md` and `docs/tasks/O01.md`, 7 to 12
  occurrences each: 226 wrong, 72 to preserve. **`FIX-36b`'s.**

253 + 19 + 226 = 498, plus the one line this task leaves for **FIX-47**
(`docs/spec/testing.md:9`) = 499; 94 + 5 + 72 = 171. `docs/spec/sources.md` carries only
the bare form and so is absent from the 499, but it is still this task's to edit.

**Three corrections to the per-file counts this package had been carrying.** The totals
499 and 171 are unchanged; only the distribution behind them moves.

1. The wrong prefix is in **37** markdown files, not 38, and in **38** files altogether,
   not 39. `docs/README.md`, `docs/spec/execution-rules.md` and `docs/spec/testing.md`
   carry 3, 9 and 2, not 4, 11 and 3; `execution-rules.md`'s two bare-form occurrences had
   been counted twice, once in its per-file figure and once in the three named above.
2. **`docs/tasks/README.md` carries no wrong prefix at all.** Its only `docs/mi-bolt`
   string is `docs/mi-bolt/execution/progress.json` at `:9`, which is correct and stays.
   It is this task's file, and for one reason only: the dead prompt link at `:5`, under
   D3. `FIX-36b` does not open it.
3. `FIX-36b`'s set is therefore **31** files, not 32.

One place in the package has already been corrected by hand, and it is the model for the
rest — `docs/api/README.md:20`:

```text
> **Megjegyzés (D08):** A korábbi `docs/mi-bolt/api/openapi.yaml` útvonal nem létezik; a
> valódi forrás a fenti `docs/api/openapi.yaml`.
```

### One line this task deliberately does not sweep

`docs/spec/testing.md:9`'s first sentence currently reads:

```text
The denominator is explicit and version-controlled in docs/mi-bolt/spec/coverage-policy.json and a generated source inventory.
```

Decision **D17** rewrites that whole sentence — not just its prefix — to name
`angular.json`'s `coverageInclude`/`coverageExclude` options instead of
`coverage-policy.json`, and that rewrite is **FIX-47**'s (`FIX-47 — Prune the npm scripts
to the standard commands of the stack`). `FIX-47` runs in Phase A, before this task's
Phase G, so by the time this task runs, line `:9` has already been rewritten and no
longer carries the wrong prefix at all — sweeping it here would be a no-op at best and a
collision with `FIX-47`'s own rewrite at worst, which is the collision the design that
produced this file's D17 pass flags by name. So this one occurrence is left untouched by
the sweep in item 4 — handed to `FIX-47` whole — rather than swept as though this task
still needed to fix it. `docs/spec/testing.md:63`, the file's other wrong-prefix
occurrence, has no such overlap and is swept normally by this task.

### The asset manifest

`docs/design/asset-manifest.json` — all four entries, at lines 3, 14, 25 and 36:

```json
    "path": "docs/mi-bolt/design/assets/products/graphite-front.webp",
```

The files are really at `docs/design/assets/products/`:

```bash
$ ls docs/design/assets/products/
graphite-back.svg   graphite-front.svg   silver-back.svg   silver-front.svg
graphite-back.webp  graphite-front.webp  silver-back.webp  silver-front.webp
```

**A correction to A7 F10.** That finding reports "3 undocumented `.svg` files
(`graphite-back.svg`, `graphite-front.svg`, `silver-front.svg`)". There are **four** — it
missed `silver-back.svg` — and they are not undocumented: `docs/design/README.md`'s last
paragraph says the directory holds "négy eredeti, fiktív készülékillusztráció
WebP-változatát és szerkeszthető SVG-forrását" ("the WebP version and the editable SVG
source of four original fictional device illustrations"). They are absent from
`asset-manifest.json`, which is a different thing. See "Out of scope".

### The prompt that does not exist

```bash
$ find . -iname "*VEGREHAJTASI*" -not -path "./node_modules/*"
(nothing)
$ grep -ro "VEGREHAJTASI-PROMPT.hu.md" docs/ --include="*.md" --include="*.html" \
    --exclude-dir=fix | wc -l
10
```

The `--exclude-dir=fix` is what keeps the count honest: the `docs/fix` task files name the
missing prompt as evidence, so without it the same command prints 28.

**A correction to A7 F8 and to D3's own count.** Both say there are three references, at
`docs/README.md:4`, `docs/tasks/README.md:5` and `docs/spec/execution-rules.md:25`. The
measured figure is **ten occurrences on nine lines in four files**, and the first cited
line number is wrong:

| File | Lines | What they are |
|---|---|---|
| `docs/README.md` | 14, 27 (twice), 30 | a tree entry, a markdown link, and a line inside the starter-prompt code block. Not line 4. |
| `docs/tasks/README.md` | 5 | a markdown link, `../VEGREHAJTASI-PROMPT.hu.md` |
| `docs/spec/execution-rules.md` | 25 | prose: "The implementation controller follows …" |
| `docs/index.html` | 7, 5368, 5372, 5378 | **two live `href` attributes** (lines 7 and 5368, the second with `download`), a tree entry and a prose sentence |

The two `href`s in `docs/index.html` are clickable dead links in a rendered report, which
nobody counted. D3's instruction — delete the references — plainly covers them: leaving
two dead buttons in the reader-facing report is the opposite of what "ezt torold" asked
for. This task removes all ten.

## What to change

### 1. Scope decision: the task packets are out, and here is why

The 31 task packets carry 226 of the 499 occurrences. **They are not in this task.** The
question was put to the user with both costs on the table, and they answered it:
*"Mindkettő felosztva"* ("split both"). `FIX-36b` owns them.

The reasoning that stood here before is recorded rather than deleted, so a later reader
can see that the question was asked and answered rather than never raised. It ran: it is
one rule with one exclusion — "`docs/mi-bolt/<x>` becomes `docs/<x>` unless `<x>` is
`execution`" — applied uniformly, and a commit a reviewer can describe in one sentence is
one commit; splitting it leaves the package self-contradictory, with `docs/README.md`
describing a flat tree while the packets still tell their executor to read
`docs/mi-bolt/spec/architecture.md`; and every other file in the `docs/fix` package cites
the real paths, so leaving the packets pointing at the wrong ones keeps the trap live.

All of that is true. The user weighed it against a 41-file commit and chose the smaller
commits, accepting the inconsistent window in between. That window is real, it is not
pretended away, and "Where this sits in the stream" below names it and says which order
makes it shortest.

### 2. Rewrite `docs/README.md`

- **Lines 3–23, "Hová kerüljön?"** — replace the ZIP-copying instruction and the tree with
  a description of the layout that exists. The documentation is already in the repository;
  it is not a ZIP waiting to be copied. The replacement tree is:

  ```text
  docs/
  ├── README.md        ez a belépő
  ├── index.html       magyar interaktív áttekintő
  ├── spec/            architektúra, képernyők, komponensek, tesztek,
  │                    elfogadás és technológiai döntések
  ├── api/             OpenAPI YAML, generátorminta, fixture-k
  ├── design/          prototípus, képernyőtervek, helyi demóképek
  ├── tasks/           T00–T29, opcionális O01, függőségi gráf
  ├── fix/             a javítási csomag
  └── mi-bolt/
      └── execution/   a végrehajtás közben keletkező bizonyítékok
  ```

- **Lines 25–36, "Fejlesztés indítása"** — the two sentences and the fenced starter prompt
  exist only to hand `VEGREHAJTASI-PROMPT.hu.md` to an agent. Under **D3** they go.
  Keep the paragraph at line 38 and the bold paragraph at line 40 — they state what the
  execution needs and that the skill is mandatory, and neither depends on the missing file
  — and re-point the reader at `docs/spec/execution-rules.md`, which is the execution
  contract that does exist.
- **Line 66** (`A csomag minden \`docs/mi-bolt/...\` hivatkozása…`) is covered by the sweep
  in item 4.

### 3. Fix `docs/design/asset-manifest.json`

Four values, at lines 3, 14, 25 and 36. Each `docs/mi-bolt/design/assets/products/<file>`
becomes `docs/design/assets/products/<file>`. Change nothing else in the file: the
`source`, `view`, `color`, `commercialClaim` and `dimensions` fields are correct and the
four filenames are correct.

### 4. Sweep the wrong prefix out of this task's seven files

The rule: **`docs/mi-bolt/` becomes `docs/` everywhere except where the next segment is
`execution`, and except `docs/spec/testing.md:9`, which this task leaves untouched for
FIX-47 — see "One line this task deliberately does not sweep" in Evidence.** Applied here
to `docs/index.html` and to the six markdown files named in the Evidence section —
`docs/README.md`, `docs/spec/execution-rules.md`, `docs/spec/architecture.md`,
`docs/spec/testing.md`, `docs/spec/screens.md` and `docs/api/README.md` — seven files
carrying 272 of the 499 occurrences this task sweeps, plus the one line at
`docs/spec/testing.md:9` it deliberately leaves. The 31 task packets are `FIX-36b`'s and
are not opened here.

A three-step substitution does it, protecting the exclusion first. Run it **per file**, and
read the result before moving on. **Run it over six of the seven files as shown. For
`docs/spec/testing.md`, do not run this command over the whole file** — it would also
sweep line 9, which stays wrong on purpose. Instead, hand-edit only the line quoting
`docs/mi-bolt/tasks/test-scenarios.json`, changing that one occurrence of
`docs/mi-bolt/tasks/` to `docs/tasks/`, and leave every other line of that file, including
line 9, untouched by this step. **`FIX-47` deletes `docs/spec/testing.md:55-57` first
(Phase A, before this task's Phase G), which shifts the target sentence off the line 63 it
sits on today; locate it by content, not by line number, before editing** (as
`FIX-38.md:251-252` already does for its own file).

```bash
sed -i '' \
  -e 's|docs/mi-bolt/execution|@@KEEP@@|g' \
  -e 's|docs/mi-bolt/|docs/|g' \
  -e 's|@@KEEP@@|docs/mi-bolt/execution|g' \
  <file>
```

Two warnings the executor needs before running it:

- **The `-i ''` form is macOS/BSD `sed`. GNU `sed` wants `-i` with no argument.** Check
  which one is on the machine before running it over these six files.
- **This command has not been run in place against any file.** Its substitution logic
  was dry-run on 2026-09-17 against `docs/tasks/T03.md` without `-i`, printing to stdout
  and writing nothing: the result held 0 wrong prefixes, both of that file's
  `…/execution` strings survived, no `@@KEEP@@` marker was left behind, and
  `git status --short` stayed empty afterwards. The logic is checked; the in-place run on
  these six files (plus the one hand-edited line of `docs/spec/testing.md`) is not. AC04
  below is the gate, not the command.

Three occurrences the substitution does **not** reach, because they are sentences rather
than paths. Rewrite these three by hand:

- `docs/spec/execution-rules.md:3` — "These files under docs/mi-bolt are a planning
  handoff" → "These files under `docs/` are a planning handoff".
- `docs/spec/execution-rules.md:23` — "Do not scaffold an application inside
  `docs/mi-bolt`" → "…inside `docs/`". The same line's `All \`docs/mi-bolt/...\` paths…`
  is caught by the sweep.
- `docs/spec/sources.md:133` — "No claim is made that those omitted files exist under
  docs/mi-bolt" → "…under `docs/`".

And one that the sweep makes redundant: once `docs/api/README.md`'s own paths are correct,
its D08 note at line 20 is describing a problem that no longer exists. Rewrite it to record
that the path was corrected, rather than deleting it — the note is the package's own record
of the same defect and a reader who followed a stale link needs to find the answer.

### 5. Delete the ten `VEGREHAJTASI-PROMPT.hu.md` references

- `docs/README.md:14` — the tree line, removed with the rest of the tree in item 2.
- `docs/README.md:27` and `:30` — removed with the section in item 2.
- `docs/tasks/README.md:5` — the sentence opens "A végrehajtási rend: [magyar végrehajtási
  prompt](../VEGREHAJTASI-PROMPT.hu.md)." Drop the link and its lead-in; the rest of the
  sentence, about per-task subagents, independent review and browser verification, is still
  true and stays. Point it at `../spec/execution-rules.md` instead.
- `docs/spec/execution-rules.md:25` — drop the first sentence
  ("The implementation controller follows …"). The rest of the paragraph is independent of
  it and stays.
- `docs/index.html:7` and `:5368` — remove the two `<a class="button" …>` elements
  entirely, not just their `href`. A button that navigates nowhere is worse than no button.
- `docs/index.html:5372` — the tree line inside the `delivery` section, removed with the
  tree.
- `docs/index.html:5378` — the prose sentence that tells the agent to read the prompt;
  rewrite it to name `docs/spec/execution-rules.md`.

**Line numbers will have shifted if `FIX-47` or `FIX-38` has already edited
`docs/index.html`; locate each of the five citations above by content, not by number,
before editing** (as `FIX-38.md:251-252` already does for its own file).

### Files this change touches

Ten files: `docs/README.md`, `docs/index.html`, `docs/design/asset-manifest.json`,
`docs/tasks/README.md`, `docs/spec/execution-rules.md`, `docs/spec/architecture.md`,
`docs/spec/testing.md`, `docs/spec/screens.md`, `docs/spec/sources.md`,
`docs/api/README.md`.

`docs/tasks/T00.md`–`T29.md` and `docs/tasks/O01.md` are **`FIX-36b`'s** and are not
opened here. No file under `docs/fix/` is edited by either task.

No source file, no configuration file and no file under `src/`, `tests/`, `e2e/` or
`scripts/` is touched.

## Out of scope

- **The 31 task packets — `FIX-36b`.** `docs/tasks/T00.md`–`T29.md` and
  `docs/tasks/O01.md` keep their wrong `docs/mi-bolt/…` citations until that task runs.
  Do not sweep one of them "while the command is open": that is the split the user asked
  for, and undoing it in passing undoes their decision.
- **Do not move any directory.** D2 settles this. `spec/`, `api/`, `design/`, `tasks/` and
  `index.html` stay where they are, and `docs/mi-bolt/execution/` stays where it is.
- **Do not recreate `VEGREHAJTASI-PROMPT.hu.md`.** D3 settles this.
- **`FIX-38`** owns creating `docs/mi-bolt/execution/skill-location.json` and the
  references to execution-tree artefacts that do not exist, including
  `docs/tasks/README.md:9`'s `progress.json`. This task corrects the *shape* of a path; it
  creates no file and repairs no reference whose target is simply absent.
- **`FIX-40`** owns `docs/mi-bolt/execution/deployment.md` and the four T29 handover
  deliverables. This task leaves every `docs/mi-bolt/execution/…` string untouched, which
  is exactly what makes those two tasks possible.
- **The four `.svg` files absent from `asset-manifest.json`** are not this task's. Adding
  four entries is a content decision about what the manifest is for — `docs/design/README.md`
  already documents the SVG sources in prose — and no number in the `docs/fix` package
  owns it. Report it to the orchestrator as a finding and leave the file with four entries.
- **Under D1 no task may edit a spec document to match the implementation.** This task
  edits spec documents, and that is not a breach: D2 and D3 are the two carve-outs the user
  settled individually, and they are "about where files sit and which links exist, not
  about what the product does". Change no requirement, no acceptance criterion, no
  component contract and no UI string while sweeping the paths.

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm.

**Every command below excludes `docs/fix/`.** The `docs/fix` task files quote the wrong
prefix and the dead prompt filename as evidence, so a sweep-wide grep that includes them
can never reach `0` and would report this package's own evidence as an unfixed defect.
Measured on `db6d295` while `docs/fix` held 40 task files: the wrong-prefix count was 499
with the exclusion and 516 without; the `VEGREHAJTASI-PROMPT.hu.md` count was 10 with and
28 without. The figures with the exclusion are stable; the ones without it climb as the
`docs/fix` package grows, which is the whole reason for the flag. `--exclude-dir=fix` was
confirmed to work on this machine's `/usr/bin/grep` (BSD grep 2.6.0-FreeBSD) and is a GNU
grep flag as well.

```bash
grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/ --include="*.md" --include="*.html" \
  --exclude-dir=fix | grep -v "docs/mi-bolt/execution" | wc -l
```

Expected: `226` — the occurrences inside `docs/tasks/T00.md`–`T29.md` and
`docs/tasks/O01.md`, which are `FIX-36b`'s. `docs/spec/testing.md:9` is not in this
residue: `FIX-47` runs in Phase A, before this task's Phase G, and rewrites that line
first (see Evidence, "One line this task deliberately does not sweep"). Measured at
`499` on commit `db6d295`, so this task removes 272. Confirm the residue is only
`FIX-36b`'s with:

```bash
grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/ --include="*.md" --include="*.html" \
  --exclude-dir=fix | grep -v "docs/mi-bolt/execution" | cut -d: -f1 | sort -u
```

Expected: the 31 task-packet paths — 31 paths and nothing else. Measured at 38 paths on
`db6d295`.
**Do not shorten this to `grep -rlo`**: `-l` overrides `-o` and prints every file holding
any `docs/mi-bolt/` string, correct `…/execution` ones included, which is 39 files today
and would still be 31 plus `docs/tasks/README.md` after this task. Measured with
`/usr/bin/grep` (BSD grep 2.6.0-FreeBSD) on 2026-09-17.

```bash
grep -rn "docs/mi-bolt\([^/]\|$\)" docs/ --include="*.md" --include="*.html" \
  --exclude-dir=fix
```

Expected: no output. All three bare-form occurrences are in this task's files. Measured at
3 on `db6d295`.

```bash
grep -ro "VEGREHAJTASI-PROMPT.hu.md" docs/ --include="*.md" --include="*.html" \
  --exclude-dir=fix | wc -l
```

Expected: `0`. Measured at `10` on `db6d295`. All ten are this task's; none is in a task
packet.

```bash
grep -o "docs/mi-bolt/execution" docs/index.html | wc -l
```

Expected: `94`, unchanged. This is the guard that proves the exclusion held. Use the
`grep -o | wc -l` form, not `grep -c`: `docs/index.html` packs many references onto very
long lines, so `grep -c` counts 85 lines for those same 94 occurrences and would hide
nine of them.

```bash
node -e "for (const e of require('./docs/design/asset-manifest.json')) { const p = e.path; console.log(p, require('fs').existsSync(p)); }"
```

Expected: four lines, each ending `true`.

```bash
npm run build
```

Expected: `0`, unchanged from the `db6d295` baseline. Under decision **D17** there is no
contract-validation gate and no citation-based traceability gate left to run alongside it;
`git diff` on the ten files this task touches is what proves the sweep moved only path
strings and prose, not requirement content — see FIX-36-AC06 below.

Then the browser pass, because `docs/index.html` is a rendered surface:

```bash
python3 -m http.server 4400 --bind 127.0.0.1 --directory docs
```

then open `http://127.0.0.1:4400/index.html`. Stop the server when the checks are done.

**Use this server and not `scripts/serve-static.mjs`.** That script applies an SPA
fallback: a request for a file that does not exist comes back as `index.html` with a
`200`, which would make AC08's dead-link walk pass on a link that is broken.
`python3 -m http.server` returns a real `404`, which is what the check needs. Python 3.9
is on the machine and `--directory` has existed since 3.7, so nothing is installed for
this.

## Acceptance criteria

- [ ] **FIX-36-AC01** `docs/README.md`'s tree block lists `spec/`, `api/`, `design/`,
      `tasks/`, `fix/`, `index.html` and `mi-bolt/execution/` as children of `docs/`, and
      contains no line beginning `└── mi-bolt/` followed by `README.md`, `spec/` or
      `api/`. Every path in the block resolves: check each one with `ls`.
- [ ] **FIX-36-AC02** `grep -ro "VEGREHAJTASI-PROMPT.hu.md" docs/ --include="*.md"
      --include="*.html" --exclude-dir=fix | wc -l` prints `0`, and `docs/index.html`
      contains no `<a>` element whose `href` is `VEGREHAJTASI-PROMPT.hu.md`. The
      `--exclude-dir=fix` is load-bearing: without it the count is non-zero and always
      will be, because the `docs/fix` task files quote the filename as evidence of the
      defect they exist to remove.
- [ ] **FIX-36-AC03** All four `path` values in `docs/design/asset-manifest.json` begin
      `docs/design/assets/products/`, and the `node -e` command in "How to verify" prints
      `true` four times.
- [ ] **FIX-36-AC04** `grep -ro "docs/mi-bolt/[a-zA-Z.]*" docs/ --include="*.md"
      --include="*.html" --exclude-dir=fix | grep -v "docs/mi-bolt/execution" | wc -l`
      prints `226`, down from the measured baseline of `499`, and the residue-listing
      pipeline in "How to verify" lists only `docs/tasks/T00.md`–`T29.md` and
      `docs/tasks/O01.md` — the 31 files `FIX-36b` owns. `docs/spec/testing.md` is not in
      the residue: **FIX-47** rewrites its line `:9` in Phase A, before this task's Phase G.
      `grep -rn "docs/mi-bolt\([^/]\|$\)" docs/ --include="*.md" --include="*.html"
      --exclude-dir=fix` prints nothing. Reaching `0` on the first command needs
      `FIX-36b` and is not this task's criterion alone.
- [ ] **FIX-36-AC05** `grep -o "docs/mi-bolt/execution" docs/index.html | wc -l` prints
      `94` and `grep -ro "docs/mi-bolt/execution" docs/ --include="*.md"
      --exclude-dir=fix | wc -l` prints `77` — both unchanged from the baseline. The
      exclusion held and no correct path was swept away with the wrong ones. Of those 77,
      five are in this task's markdown files and 72 are in `FIX-36b`'s packets, so this
      criterion also proves that this commit left the packets alone.
- [ ] **FIX-36-AC06** `git diff -- docs/README.md docs/index.html
      docs/design/asset-manifest.json docs/spec/execution-rules.md
      docs/spec/architecture.md docs/spec/testing.md docs/spec/screens.md
      docs/spec/sources.md docs/api/README.md docs/tasks/README.md` shows only the path
      corrections and prose rewrites this file describes: no line naming a `Txx-ACyy`
      acceptance criterion, an `RQxx` requirement id or an `Exxx` scenario id changes its
      text, and no line is added or removed outside the tree block, the asset-manifest
      paths, the dead-prompt references and the `docs/mi-bolt/` prefix sweep. A
      documentation path sweep must move no requirement content.
- [ ] **FIX-36-AC07** `git status --short` lists exactly the ten files named in "Files
      this change touches" and nothing else. In particular no `docs/tasks/T*.md`, no
      `docs/tasks/O01.md` and no file under `docs/fix/` is modified, and no file under
      `src/`, `tests/`, `e2e/`, `scripts/`, `public/`, and no root configuration file.
- [ ] **FIX-36-AC08** **Real-browser check of `docs/index.html`.** This task is **not**
      exempt from browser verification: `docs/index.html` is a 5389-line interactive report
      with a sidebar, section buttons, a screen preview and an inline SVG dependency graph,
      and this task removes two of its buttons and edits its prose. Through the
      `real-browser-sonnet` agent, serve `docs/` with the plain static server named in
      "How to verify", open `index.html` at 1440×900 and record:
      (a) every sidebar section — Áttekintés, Képernyőtervek, Architektúra, OpenAPI és
      mock, Feladatok és gráf, 100% és elfogadás, Kutatási döntések, Végrehajtás és
      források — loads on click, with a `take_snapshot` of each;
      (b) the `Magyar végrehajtási prompt` button is gone from both the overview section
      and the delivery section, and no remaining button or link on the page resolves to a
      404 — walk every internal `href`;
      (c) the screen preview (`#preview-screen`, `#preview-width`) and the state preview
      (`#state-preview`) still render an image after the edit;
      (d) `list_console_messages` returns zero errors;
      (e) a `take_screenshot` of the overview and of the delivery section.
      Per `.claude/rules/browser-verification.md`, an HTTP 200 from `curl`, a file-exists
      check or a read of the diff is explicitly **not** this criterion.
- [ ] **FIX-36-AC09** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body. **R26** is applicable and met: the commit body identifies every file
      changed, every command in "How to verify" and their measured outputs, the corrections
      to A7 F8 and A7 F10 and the three per-file count corrections named in the Evidence
      section, and the four unlisted `.svg` files as a stated remaining limitation handed
      to the orchestrator.
      **R01–R25 are N/A**, and the single reason covers them all: this task edits
      documentation prose, four JSON string values and one static report's markup, and
      changes no application surface, token, component, state or label. Record that
      sentence rather than omitting the rules.
      Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
      the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit across the ten files named above. Do not bundle it with
`FIX-36b`, `FIX-37`, `FIX-38` or any other FIX task. `FIX-36b` in particular is a separate
commit because the user asked for this task to be split — *"Mindkettő felosztva"* ("split
both") — so folding the packets back in undoes that decision. Commit only after every
acceptance criterion above passes, including the browser pass on `docs/index.html`.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
docs: correct the docs/ tree, asset paths and the dead prompt links
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**This task runs first, and `FIX-36b` runs second.**

Between the two commits the package contradicts itself: `docs/README.md` and
`docs/index.html` describe the flat layout that exists, while the 31 task packets still
tell their executor to read `docs/mi-bolt/spec/architecture.md`, which does not. The user
accepted that window when they chose smaller commits over a consistent intermediate state.
It is not pretended away and it is not a reason to widen either task.

This order is the one that makes the window least harmful, and the reason is which
document a reader opens first. `docs/README.md` is the package's entry point and
`docs/index.html` is its rendered report; once those two tell the truth, a reader is
correctly oriented and can recognise a packet's `docs/mi-bolt/spec/…` citation as the
stale form. The reverse order leaves the entry point lying while the packets are right,
so a reader who starts where readers start is misled and then mistrusts the half that is
already correct. The packets' wrong paths are also the state the repository has been in
all along, so leaving them one commit longer breaks nothing that was not already broken.

The two commits should land back to back. Nothing else in the package needs to run
between them.

`FIX-36b` owns the repository-wide check that no `docs/mi-bolt/<x>` path other than
`…/execution` survives anywhere outside `docs/fix/`; that check cannot pass until both
commits have landed, which is why it belongs to the one that runs second. **One occurrence
this task leaves untouched on purpose**: `docs/spec/testing.md:9` (`FIX-47 — Prune the npm
scripts to the standard commands of the stack`), which rewrites the whole sentence that
line sits in. It does not become residue for `FIX-36b`'s check, because **FIX-47** runs in
Phase A, before either path-sweep task's Phase G, and has already rewritten it by the time
this task or `FIX-36b` runs — see Evidence, "One line this task deliberately does not
sweep."
