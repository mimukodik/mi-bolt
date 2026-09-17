# FIX-05 — Add the `engines` field to package.json

Status: PLANNED — not executed.
Severity: minor
Source: A1 I2

## Why this is wrong

`docs/spec/architecture.md:23` states the supported Node range for this project as a
fact about the Angular 22.0 family: *"The published compatibility table currently lists
the 22.0 family with Node ^22.22.3 || ^24.15.0 || ^26.0.0, TypeScript >=6.0.0 <6.1.0,
and RxJS ^6.5.3 || ^7.4.0."* `package.json` does not declare that range anywhere, so the
one file every contributor reads first says nothing about which Node versions this
project supports. Under D1 the specification is right and the manifest is incomplete.

## Evidence

`package.json:22-23` — the two fields that sit where `engines` belongs:

```json
  "private": true,
  "packageManager": "npm@11.17.0",
```

`grep -c '"engines"' package.json` prints **`0`**. There is no `.npmrc` and no `.nvmrc`
in the repository either (`ls -a` at the root confirms both absences), so nothing
anywhere records the supported Node range.

The project does own a script that checks Node engine ranges, but it checks the wrong
side of the dependency arrow. `scripts/verify-toolchain.mjs:1-9`:

```js
// verify-toolchain.mjs — read package.json, query npm for each declared
// dependency, and enforce the T00 toolchain invariants: no prerelease tag in
// any declared version, Node engines must accept Node ^22.x || ^24.x ||
// >=26, and the declared TypeScript version must exist on the npm registry.
```

and `:177`:

```js
    const nodeCheck = checkNodeEngines(item.engines);
```

where `item` is one of the sixteen packages in `EXPECTED_DEPS` (`:22-38`), read from
`npm view`. It asks *"does each dependency accept our Node?"* It never asks, and cannot
ask, *"which Node does this project accept?"*, because that value does not exist in the
repository.

## What to change

Two files deleted, one field added, three documentation files corrected.

### 1. `package.json` — add `engines` after `packageManager`

```json
  "private": true,
  "packageManager": "npm@11.17.0",
  "engines": {
    "node": "^22.22.3 || ^24.15.0 || ^26.0.0"
  },
```

The range string is copied character for character from `docs/spec/architecture.md:23`.
It is not a threshold anyone chose: `.claude/rules/planning-deliverables.md` requires
every number in a plan to trace to the user, the task, the spec or a rule file, and this
one traces to the spec line quoted above. Do not widen it, do not narrow it, and do not
substitute the version of Node the executing machine happens to be running.

Do not add anything else. In particular:

- **Do not add a `.npmrc` with `engine-strict=true`.** Without it npm prints a warning on
  an out-of-range Node rather than failing the install, which is npm's documented default
  behaviour. Turning a warning into a hard install failure is a policy change nobody
  asked for, and `docs/spec/architecture.md:23` asks for the range to be recorded, not
  for installs to be blocked. Recording it is the whole task.
- **Do not add a `.nvmrc`.** Same reason: it would pick one Node version out of a range
  of three majors, and nothing in the spec picks one.

### 2. Delete `scripts/verify-toolchain.mjs` and `scripts/verify-toolchain.spec.mjs`, and correct the T00 packet

`docs/spec/testing.md:113` currently lists `npm run verify:toolchain` in its command
section, but `package.json:4-20` has no such script and never has —
`scripts/verify-toolchain.mjs` has never been invoked by anything. D17
(`docs/fix/FIX-47.md`) removes the command from the specification rather than wiring it
up: `npm ci` already fails on an unsatisfiable `engines` range, which is npm's own
enforcement of the field this task adds in step 1, so a bespoke script that re-queries
`npm view` per dependency over the network adds nothing the specification still requires.

Delete both files:

```bash
git rm scripts/verify-toolchain.mjs scripts/verify-toolchain.spec.mjs
```

Then remove one line from each of three documentation files, all of which list
`scripts/verify-toolchain.mjs` as a T00 deliverable:

- `docs/tasks/T00.md` — delete the line `- \`scripts/verify-toolchain.mjs\`` from the
  `## Files` section (currently `:23`, immediately above
  `` `scripts/verify-skill-evidence.mjs` ``). Leave every other line in that section
  untouched, including `scripts/verify-skill-evidence.mjs`.
- `docs/tasks/tasks.json` — delete the array entry `"scripts/verify-toolchain.mjs",` from
  the `T00` object's `files` array (currently `:11`).
- `docs/index.html` — the string `scripts/verify-toolchain.mjs` appears three times: once
  inside an embedded JSON data array as `"scripts/verify-toolchain.mjs", `, once inside a
  rendered `<code>` file-list as `<code>scripts/verify-toolchain.mjs</code>`, and once
  inside a rendered `<li>` entry as `<li><code>scripts/verify-toolchain.mjs</code></li>`.
  Remove all three. Locate them with
  `grep -o '.\{40\}scripts/verify-toolchain\.mjs.\{40\}' docs/index.html` rather than by
  line number — some lines are tens of kilobytes long and every citation shifts once a
  sibling task edits the file; locate by content.

**FIX-05 shares `docs/tasks/T00.md`, `docs/tasks/tasks.json` and `docs/index.html` with
FIX-38, which removes the neighbouring `scripts/verify-skill-evidence.mjs` line from the
same three files. The two tasks must never be executed concurrently: land one to
completion and commit it before starting the other, or the two edits collide on
overlapping lines of the same files.**

## Out of scope

- **Upgrading any dependency.** A1 I1 lists several packages a minor or a patch behind
  (`@angular/core` 22.1.6 against 22.1.7, `eslint` 10.9.1 against 10.10.0,
  `typescript-eslint` pinned at 8.69.0 against 8.70.0). All of them are inside their
  ranges or correctly constrained by an Angular peer requirement, and none is this
  task's. Do not run `npm update`.
- **`typescript` and `vitest`.** Both look stale and both are correct:
  `@angular/build@22.1.8`'s peer range holds `typescript` at `>=6.0 <6.1` and `vitest` at
  `^4.0.8`. Touching either breaks the build.
- **`scripts/verify-skill-evidence.mjs` and the rest of the T00 packet.** That script, its
  own line in the three documentation files above, and every other T00 deliverable are
  FIX-38's. Do not touch them here.
- **`package-lock.json`.** Adding `engines` to `package.json` does not require an install
  and must not change the lockfile. If `package-lock.json` shows as modified, an install
  was run that this task did not need; that is a separate change and does not belong in
  this commit.

## How to verify

From the repository root, npm only.

1. `node -p "require('./package.json').engines.node"`

   Must print exactly:

   ```text
   ^22.22.3 || ^24.15.0 || ^26.0.0
   ```

2. `node -e "const s=require('semver');"` is **not** available and is not needed. Check
   the running Node instead:

   `node -v`

   Record the output in the commit body. It must fall inside the declared range; if it
   does not, the executing environment is outside the project's supported set and that is
   a finding to report rather than a reason to widen the range.

3. `npm run build` — must exit **0**, unchanged from the `db6d295` baseline.

4. `git status --short` — must list exactly six paths: `package.json` modified;
   `scripts/verify-toolchain.mjs` and `scripts/verify-toolchain.spec.mjs` deleted;
   `docs/tasks/T00.md`, `docs/tasks/tasks.json` and `docs/index.html` modified.

5. `grep -rn "scripts/verify-toolchain" docs/tasks/ docs/index.html` — must print
   nothing, and `ls scripts/verify-toolchain.mjs scripts/verify-toolchain.spec.mjs` must
   both report "No such file or directory".

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the
coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do
not run `npm run api:drift` or `npx playwright test` while working on this task: both
rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-05-AC01** `node -p "require('./package.json').engines.node"` prints
      `^22.22.3 || ^24.15.0 || ^26.0.0` and nothing else.
- [ ] **FIX-05-AC02** `git status --short` lists exactly the six paths named in "How to
      verify" step 4. `package-lock.json` is unchanged, and no `.npmrc` or `.nvmrc` was
      created.
- [ ] **FIX-05-AC03** `npm run build` exits `0`.
- [ ] **FIX-05-AC04** The commit body quotes `docs/spec/architecture.md:23` as the source
      of the range, so a later reader can see the value was copied rather than chosen,
      and records the output of `node -v` on the executing machine.
- [ ] **FIX-05-AC05** `scripts/verify-toolchain.mjs` and `scripts/verify-toolchain.spec.mjs`
      no longer exist (`ls` on both reports "No such file or directory"), and
      `grep -rn "scripts/verify-toolchain" docs/tasks/ docs/index.html` prints nothing.
- [ ] **FIX-05-AC06** `docs/tasks/T00.md`'s `## Files` section, `docs/tasks/tasks.json`'s
      `T00` object and `docs/index.html`'s rendered T00 file list all still list
      `scripts/verify-skill-evidence.mjs` unchanged — FIX-38's line, left alone — and every
      other T00 deliverable in all three files is unchanged.
- [ ] **FIX-05-AC07** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change adds one declarative field to the package
      manifest, deletes two Node scripts nothing invoked, and corrects three documentation
      files' file lists; it ships no code, alters no bundle and reaches no rendered
      surface. This is the exemption `.claude/rules/browser-verification.md` grants to a
      build or configuration change, stated explicitly rather than left out silently.
- [ ] **FIX-05-AC08** The `mi-bolt-design` R01–R26 record is in the commit body. R01
      through R25 are marked **N/A — this task adds one field to `package.json`, deletes
      two unused scripts, corrects a task packet's file list and renders nothing a person
      can see**. **R26 is applicable and met**: the commit body names every file changed
      or deleted, the commands run with their exit codes, and that `verify:toolchain` is
      no longer part of the specification's command surface (`docs/fix/FIX-47.md`) rather
      than merely unrun. Skill provenance is stated once in `docs/fix/README.md`
      section 3, "Every task records the design rules": the installed path, the version,
      and the fact that `docs/mi-bolt/execution/skill-location.json` does not exist yet
      (**FIX-38** owns it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit — the `engines` field, the two deleted scripts and the
three documentation corrections together. Do not bundle it with FIX-01, FIX-03 or any
other task that happens to touch `package.json`. Commit only after every acceptance
criterion above passes.

Suggested subject line, in the repository's `type: summary` style:

```text
build: declare the supported Node range and delete the unrun toolchain script
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**Nothing has to land before FIX-05 and nothing in this stream depends on it.** It is
independent of the other eight and can be done at any point. It is placed in the
toolchain stream because the field it adds is a toolchain declaration, not because it
blocks anything.

**FIX-05 must not run concurrently with FIX-38.** Both edit `docs/tasks/T00.md`,
`docs/tasks/tasks.json` and `docs/index.html` — FIX-05 removes the
`scripts/verify-toolchain.mjs` line from each, FIX-38 removes the neighbouring
`scripts/verify-skill-evidence.mjs` line. Land one to completion and commit it before
starting the other.

Two of the other eight also edit `package.json` — **FIX-03** (adds
`eslint-config-prettier`, `format` and `format:check`) and **FIX-04** (removes
`test:unit:coverage`, adds nothing in its place). Whichever lands second rebases
trivially over the other, since the three edits touch different keys. Do not merge any of
them into one commit to avoid that rebase.
