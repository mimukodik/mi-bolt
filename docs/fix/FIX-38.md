# FIX-38 — Create skill-location.json and delete the unwired verification script

Status: DONE — 414c316. Created docs/mi-bolt/execution/skill-location.json (hash matched .claude/skills/mi-bolt-design/SHA256SUMS.txt) and deleted scripts/verify-skill-evidence.mjs and its .spec.mjs companion, plus their two packet references.
Severity: blocker
Source: A7 F1 (RQ02 unmet, T00-AC03 unreached), A7's broken-link list, B3's provenance
section, decision **D17**

## Why this is wrong

`docs/mi-bolt/execution/skill-location.json` does not exist. `.claude/CLAUDE.md` calls
that file "the only source of truth" for the mandatory `mi-bolt-design` skill's resolved
path, approved version and SHA-256; `docs/spec/execution-rules.md:7` requires the same
three values to be recorded there; and `docs/tasks/T00.md:46` (**T00-AC03**) makes it an
acceptance criterion. **Thirty-seven files in this repository name that path**, including
all 31 task packets, `docs/tasks/tasks.json` and the gate script written to read it. Every
one of them points at nothing.

The practical consequence is that the skill's provenance cannot be checked against
anything. Every audit report in this run had to take the installed copy on trust, and B3
said so in a section of its own. The gate that exists to catch this reports the failure
and is not wired to any command, so nothing runs it.

**Decision D17 changes what this task does about that last sentence.** The user's
instruction — *"nem kell ennyi script es npm parancs sem, standardek kellenek"* ("this
many scripts and npm commands are not needed either; standards are what is needed") —
means this task no longer wires `scripts/verify-skill-evidence.mjs` to a new `npm run`
entry. It deletes the script instead. The record this task creates does not lose anything
by that: `.claude/CLAUDE.md` ("Design skill mandate") already makes
`skill-location.json` itself — not a script that re-reads it — the source of truth, and
the "stop and report if the hashes disagree" rule below (unchanged from before D17) is a
human check performed once, at the moment the file is written, which is exactly the kind
of check `.claude/rules/planning-deliverables.md` asks for: "Where a threshold would be
invented, measure and record instead." A script that exists only to re-run that same
one-time comparison, and that nothing had ever invoked, added no protection the record
itself does not already carry.

## Evidence

### The file is absent and the gate said so

```bash
$ find docs/mi-bolt -type f | wc -l
0
$ node scripts/verify-skill-evidence.mjs
{
  "ok": false,
  "summary": "skill:FAIL",
  "errors": [
    {
      "kind": "skill-location-unreadable",
      "path": ".../docs/mi-bolt/execution/skill-location.json",
      "reason": "ENOENT..."
    }
  ]
}
```

Measured by A7 on commit `db6d295`, and re-confirmed by `ls` twice in this run. The script
worked and the missing input was the whole problem — but the script itself is now deleted
by this task (item 3 below), because nothing ever ran it and the record it existed to
re-check is what item 1 creates directly.

### How far the dangling reference reaches

```bash
$ grep -rl "skill-location.json" docs/ scripts/ .claude/ | grep -v docs/fix | wc -l
37
```

`docs/tasks/T21.md:7` is representative of the 31 packets:

```text
Read the externally installed `mi-bolt-design` skill entrypoint recorded in
`docs/mi-bolt/execution/skill-location.json` (approved version 1.0.1) and its required
references independently at both stages.
```

### The gate was never wired to anything

```bash
$ grep -n "verify-skill-evidence" package.json
(nothing)
```

`package.json`'s `scripts` block has no entry for it, on `db6d295` or after this task:
under D17 none is added. The script was a T00 deliverable (`docs/tasks/T00.md:24`) that no
command in the repository ever ran; this task removes the deliverable rather than finally
wiring it.

### The schema the deleted script used to read, and that this task now writes directly

`scripts/verify-skill-evidence.mjs:92-96` read exactly four values before this task
deletes the file:

```js
  const skillEntry = options.skillEntryOverride ?? location.entry;
  const skillRoot = options.skillRootOverride ?? location.root;
  const declaredSha =
    options.skillSha256Override ?? location.sha256?.['SKILL.md'];
  const approvedVersion = options.approvedVersion ?? location.approvedVersion;
```

and then, at `:100`, `:110`, `:127-139` and `:143-167`, it: read `entry` as a file;
recomputed its SHA-256 and compared it to `sha256["SKILL.md"]`; parsed the YAML
frontmatter and compared `metadata.version` to `approvedVersion`; and required
`<root>/references/` to contain all seven files listed at `:19-27`
(`01-visual-foundation.md` … `07-source-notes.md`). Those are exactly the checks item 2
below performs by hand, once, at the moment the file is written — the schema survives in
the JSON this task creates even though the script that used to validate it does not.

**`entry` and `root` must be repository-relative.** A committed absolute path is
`.claude/rules/code-standards.md`'s "no machine-specific path in any committed file: no
home directory, no `~`, no temp directory" — not an option here, independent of whether a
script ever re-resolves the two fields.

### The installed skill

```bash
$ ls .claude/skills/mi-bolt-design/
assets  evals  README.md  references  scripts  SHA256SUMS.txt  SKILL.md  VALIDATION.md
$ ls .claude/skills/mi-bolt-design/references/
01-visual-foundation.md  02-components.md  03-page-recipes.md  04-content-commerce.md
05-accessibility-responsive.md  06-workflow-validation.md  07-source-notes.md
$ head -8 .claude/skills/mi-bolt-design/SKILL.md | tail -4
metadata:
  version: "1.0.1"
  language: "en"
  reviewed: "2026-09-13"
$ shasum -a 256 .claude/skills/mi-bolt-design/SKILL.md
40faf71e00a3a494d88485eee16f4c3f27669ad13c0b2da8ba67202e9a29e8e5  .claude/skills/mi-bolt-design/SKILL.md
```

All seven required reference files are present. The skill ships its own
`SHA256SUMS.txt`, whose `SKILL.md` line is
`40faf71e00a3a494d88485eee16f4c3f27669ad13c0b2da8ba67202e9a29e8e5` — identical to the
value computed above on commit `db6d295`, so the installed copy has not drifted from what
its author published.

**The version 1.0.1 is not hearsay from a task packet.** It is stated independently in
three places that do not copy one another: the skill's own frontmatter
(`metadata.version: "1.0.1"`), `docs/spec/execution-rules.md:7` ("approved version 1.0.1")
and `docs/tasks/T00.md:46` (T00-AC03). The **hash** has no such backing and is computed,
not copied — see item 2 below.

### The broken links A7 listed, and where each one goes

| A7's item | Target | Owner |
|---|---|---|
| 1. `docs/README.md` → `VEGREHAJTASI-PROMPT.hu.md` | does not exist | **`FIX-36`** (decision D3) |
| 2. `docs/tasks/README.md:5` → `../VEGREHAJTASI-PROMPT.hu.md` | does not exist | **`FIX-36`** (decision D3) |
| 3. `docs/spec/execution-rules.md:25` → same file, in prose | does not exist | **`FIX-36`** (decision D3) |
| 4. `docs/tasks/README.md:9` → `docs/mi-bolt/execution/progress.json` | does not exist | **`FIX-40`** — see below |

A full sweep of every relative markdown link under `docs/` confirms A7's "all other links
resolve":

```bash
$ for f in $(find docs -name "*.md" -not -path "docs/fix/*"); do d=$(dirname "$f"); \
    grep -o '](\([^)#][^)]*\))' "$f" | sed 's/](\(.*\))/\1/' | while read -r l; do \
      case "$l" in http*|\#*) continue;; esac; t="${l%%#*}"; [ -z "$t" ] && continue; \
      [ -e "$d/$t" ] || echo "$f -> $l"; done; done | sort -u
docs/README.md -> VEGREHAJTASI-PROMPT.hu.md
docs/tasks/README.md -> ../VEGREHAJTASI-PROMPT.hu.md
```

Two hits, both `FIX-36`'s. So **this task repairs its 37 references by creating the file
they name, not by editing prose.** Item 4 is `FIX-40`'s because an honest `progress.json`
has to state each task's real status, and establishing that is exactly what the acceptance
report in `FIX-40` produces; writing one here would mean inventing statuses.

## What to change

### 1. Create the directory and the file

`docs/mi-bolt/execution/` already exists as an empty directory. Create
`docs/mi-bolt/execution/skill-location.json` with exactly these four keys:

```json
{
  "entry": ".claude/skills/mi-bolt-design/SKILL.md",
  "root": ".claude/skills/mi-bolt-design",
  "sha256": {
    "SKILL.md": "<the value you compute in item 2>"
  },
  "approvedVersion": "1.0.1"
}
```

Both paths are repository-relative, for the reason in the Evidence section. Add no fifth
key: nothing reads a fifth key, and a key nothing reads is a claim nothing checks.

### 2. Compute the hash; do not copy one

Run the hash yourself, against the file `entry` names, at the moment the JSON is written:

```bash
shasum -a 256 .claude/skills/mi-bolt-design/SKILL.md
```

and cross-check it against the skill's own published sum:

```bash
grep " SKILL.md$" .claude/skills/mi-bolt-design/SHA256SUMS.txt
```

**Record in the commit body which file you hashed, the command you ran, the value it
printed, and whether the two agree.** They agreed on commit `db6d295`; if they do not
agree when this task runs, the installed copy has been modified since its author published
it, and that is a finding for the orchestrator — **stop and report it rather than writing
the value you computed into the file and moving on.** The whole point of the file is that
it lets somebody detect exactly that, so silently recording a drifted hash would defeat
it. This is the check; a human running it once and recording the result is the gate — no
script performs it on this task's behalf, and none is added.

Do **not** take `1.0.1` or any hash from `docs/tasks/T21.md` or any other packet. A packet
is a planning document; the installed skill is the thing being recorded.

### 3. Delete the unwired gate script and its two packet entries

Under decision **D17**, this task does not wire `scripts/verify-skill-evidence.mjs` to a
new npm-script entry of any name. It deletes the script outright, along with its
`node:test` companion:

```bash
rm scripts/verify-skill-evidence.mjs scripts/verify-skill-evidence.spec.mjs
```

Then remove the two entries that name the deleted script:

- `docs/tasks/T00.md:24` — the line `- \`scripts/verify-skill-evidence.mjs\`` inside the
  `## Files` list (`:19-24`). Delete that one line. **Do not touch line 23**
  (`- \`scripts/verify-toolchain.mjs\``) — that is **FIX-05**'s line, in the same list,
  and the two tasks must never edit `docs/tasks/T00.md` concurrently; see "Where this sits
  in the stream".
- `docs/tasks/tasks.json:12` — `"scripts/verify-skill-evidence.mjs",` inside T00's
  `"files"` array (`:7-14`). Delete that one line; `:11`'s trailing comma and `:13`'s
  `"docs/mi-bolt/execution/skill-location.json"` need no further change. **Do not touch
  `:11`** (`"scripts/verify-toolchain.mjs",`) — that is FIX-05's line.
- `docs/index.html:2585` — inside the `data-search='{"id": "t00", …}'` attribute, the
  substring `"scripts/verify-toolchain.mjs", "scripts/verify-skill-evidence.mjs", ` —
  delete exactly `"scripts/verify-skill-evidence.mjs", ` (with its trailing comma and
  space), leaving `"scripts/verify-toolchain.mjs", "docs/mi-bolt/execution/skill-location.json"]`
  in place. **Do not delete the `verify-toolchain.mjs` entry on this line** — FIX-05 owns
  it.
- `docs/index.html:2588` — inside `<h3>Fájlfelelősség</h3><div class="file-list">…</div>`,
  delete the exact substring `<code>scripts/verify-skill-evidence.mjs</code>`, leaving the
  `<code>scripts/verify-toolchain.mjs</code>` tag beside it untouched.
- `docs/index.html:2607` — the whole line is
  `<li><code>scripts/verify-skill-evidence.mjs</code></li>`; delete the entire line.

**Line numbers will have shifted if `FIX-05` or another sibling task has already edited
`docs/index.html`; locate each by content, not by number, before editing.**

### Files this change touches

- `docs/mi-bolt/execution/skill-location.json` (new)
- `scripts/verify-skill-evidence.mjs` (deleted)
- `scripts/verify-skill-evidence.spec.mjs` (deleted)
- `docs/tasks/T00.md` (one line removed from `## Files`)
- `docs/tasks/tasks.json` (one line removed from T00's `"files"` array)
- `docs/index.html` (three edits, all naming `verify-skill-evidence.mjs`)

## Out of scope

- **`FIX-36`** owns A7's broken links 1–3, the `VEGREHAJTASI-PROMPT.hu.md` references, and
  the 499 wrong `docs/mi-bolt/<x>` path prefixes. Do not edit `docs/README.md`,
  `docs/tasks/README.md` or `docs/spec/execution-rules.md` here.
- **`FIX-40`** owns `docs/mi-bolt/execution/progress.json`, `deployment.md` and the four
  T29 handover files. This task creates exactly one file under that directory.
- **`FIX-37`** owns `AGENTS.md`. It names `skill-location.json` and states honestly that
  it is absent; once this task lands, that caveat can go, and whichever of the two lands
  second makes the edit. Say in the commit body which order they landed in.
- **`scripts/verify-toolchain.mjs` and its `.spec.mjs` companion — `FIX-05`.** They sit
  beside this task's two files in the same `docs/tasks/T00.md` list, `tasks.json` array
  and `docs/index.html` file-list, and this task's edits at those three locations touch
  only the `verify-skill-evidence` entry, never the `verify-toolchain` one.
- **`FIX-39`** owns the deletion of `scripts/check-traceability.mjs` under decision
  **D17**; that gate is unrelated to this one and this task does not touch it.
- **Do not create `docs/mi-bolt/execution/tasks/Txx.md` review files.** A7 F2 is right that
  none exists for any of T00–T29/O01, and that is execution work for every task rather
  than a documentation fix. **`FIX-53`** owns it, as one summary document rather than 31
  per-task records (**D19** item 4).
- **Do not modify anything under `.claude/skills/mi-bolt-design/`.** The installed copy is
  the authority and this task records it, character for character. Changing it would
  invalidate the hash being recorded in the same commit.
- **`docs/spec/testing.md`.** Its former script-list line naming this gate is
  **FIX-47**'s subject (`FIX-47 — Prune the npm scripts to the standard commands of the
  stack`), which rewrites the whole of that section. This task does not open that file.

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm.

```bash
ls scripts/verify-skill-evidence.mjs scripts/verify-skill-evidence.spec.mjs
```

Expected: `No such file or directory`, twice.

```bash
node -e "const l=require('./docs/mi-bolt/execution/skill-location.json'); console.log(Object.keys(l).sort().join(','))"
```

Expected: `approvedVersion,entry,root,sha256`.

```bash
shasum -a 256 .claude/skills/mi-bolt-design/SKILL.md
grep " SKILL.md$" .claude/skills/mi-bolt-design/SHA256SUMS.txt
```

Expected: the same 64-character value from both.

```bash
grep -rn "verify-skill-evidence" docs/tasks/T00.md docs/tasks/tasks.json docs/index.html
```

Expected: no output.

```bash
npm run build
```

Expected: `0`, unchanged from the `db6d295` baseline. Nothing this task changes reaches
the build.

```bash
git status --short
```

Expected: exactly one new file (`docs/mi-bolt/execution/skill-location.json`), two
deletions (`scripts/verify-skill-evidence.mjs`, `scripts/verify-skill-evidence.spec.mjs`)
and three modifications (`docs/tasks/T00.md`, `docs/tasks/tasks.json`,
`docs/index.html`).

## Acceptance criteria

- [ ] **FIX-38-AC01** `docs/mi-bolt/execution/skill-location.json` has exactly the four
      keys `entry`, `root`, `sha256`, `approvedVersion`; `entry` and `root` are
      repository-relative and contain no `/Users/`, no `~`, no `/tmp`, no `file://` and no
      absolute path; and `approvedVersion` is `"1.0.1"`.
- [ ] **FIX-38-AC02** The value at `sha256["SKILL.md"]` equals the output of
      `shasum -a 256 .claude/skills/mi-bolt-design/SKILL.md` **run by the executor in this
      task**, and the commit body names the file hashed, the command, the value, and
      whether it matched `.claude/skills/mi-bolt-design/SHA256SUMS.txt`. If it did not
      match, the criterion fails and the task stops with a report rather than a commit.
- [ ] **FIX-38-AC03** `scripts/verify-skill-evidence.mjs` and
      `scripts/verify-skill-evidence.spec.mjs` do not exist, and `package.json`'s
      `scripts` block gains no entry naming either file — check with
      `grep -c "verify-skill-evidence" package.json`, which must print `0`.
- [ ] **FIX-38-AC04** `docs/tasks/T00.md`, `docs/tasks/tasks.json` and `docs/index.html`
      no longer name `scripts/verify-skill-evidence.mjs`, and each still names
      `scripts/verify-toolchain.mjs` exactly where it did before. Check with
      `grep -c "verify-skill-evidence" docs/tasks/T00.md docs/tasks/tasks.json docs/index.html`,
      which must print `0` for all three, and
      `grep -c "verify-toolchain" docs/tasks/T00.md docs/tasks/tasks.json docs/index.html`,
      which must print the same count it printed before this task's edit (1, 1 and 3
      respectively, measured on `db6d295`).
- [ ] **FIX-38-AC05** `npm run build` exits `0`, unchanged from the `db6d295` baseline.
- [ ] **FIX-38-AC06** `git status --short` lists exactly six paths: the new JSON file, the
      two deleted scripts, and the three files named in FIX-38-AC04. Nothing under
      `.claude/skills/` is modified, added or deleted, and no line naming
      `scripts/verify-toolchain.mjs` changed in any of the three shared files.
- [ ] **FIX-38-AC07** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change creates one JSON evidence file, deletes two
      Node-only scripts and edits three planning documents; none is served, imported,
      routed to, or built into `dist/`, and no rendered surface changes. That is the
      exemption `.claude/rules/browser-verification.md` grants to a build artefact or a
      documentation edit. The check was made rather than assumed: `docs/index.html` **is**
      a rendered surface, and this task edits three lines of it — but a static-report file
      list is not application UI a user interacts with, and `FIX-36` already carries the
      real-browser criterion for that page's rendered behavior. Per that rule the
      exemption is stated explicitly rather than left out silently.
- [ ] **FIX-38-AC08** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body. **R26** is applicable and met, and this task is the one that makes
      R26 checkable for every other task: the commit body identifies all six changed
      paths, the verification commands and their outputs, the hash and where it came
      from, and the items left to `FIX-36`, `FIX-40` and the orchestrator — A7 F2's
      missing per-task review files — as stated remaining limitations. **R01–R25 are
      N/A**, and one sentence covers them all: this task writes a four-key JSON evidence
      file, deletes two unwired Node scripts and edits three planning documents, and
      changes no application surface, token, component, state, label or data source.
      After this task lands, the skill's resolved path, version and SHA-256 are recorded
      where `.claude/CLAUDE.md` says they must be, and every later task cites
      `docs/mi-bolt/execution/skill-location.json` instead of the installed path with a
      provenance caveat.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-36`, `FIX-37`, `FIX-05` or any
other FIX task. It is small and it is the one every other task's design-rule record has
been citing as a gap, so it is worth landing early.

**This task shares `docs/tasks/T00.md` (and its `tasks.json` and `docs/index.html`
mirrors) with `FIX-05`. The two must never be executed concurrently.** Both edit the same
`## Files` list, adjacent lines of the same JSON array and adjacent `<code>` tags in the
same `docs/index.html` blocks; running them at once risks one overwriting the other's
edit. Land one fully, including its commit, before the other starts.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
build: record the resolved mi-bolt-design skill and delete the unwired verify script
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
