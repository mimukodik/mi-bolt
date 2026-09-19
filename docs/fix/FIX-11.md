# FIX-11 — Make `api:drift` detect the drift it exists for

Status: DONE — ca65cd5. Replaces api:drift with a real drift check and regenerates the SDK; byte-identical to the committed tree.
Severity: blocker
Source: A2 finding 6 (added by the orchestrator, contradicting A2's own earlier
"byte-identical / genuinely unedited" conclusion — see Evidence), A1 (the lint target).

## Why this is wrong

`docs/tasks/T04.md:45` states the property the gate exists to hold: *"Clean only
src/app/api/generated before regeneration; generate twice and obtain byte-identical
content. git diff --exit-code passes after generation."* `scripts/api-drift.mjs:1-14`
restates it in its own header — *"Regenerates src/app/api/generated/ from
docs/api/openapi.yaml and **exits 1 if the working tree does not match**"*. It does not.

Two defects, and the second is the worse one:

1. The committed SDK under `src/app/api/generated/` does not match what the generator
   produces: 27 of the 56 tracked files had their `/* eslint-disable */` header stripped by
   hand, exactly the edit the `DO NOT EDIT` banner on the next line forbids.
2. **`npm run api:drift` exits `0` anyway.** A gate that reports green on the very
   condition it was written to fail is worse than no gate, because every later session reads
   its green as evidence.

Under D1 the specification is right and the code is wrong: neither the hand-edit nor the
gate's blindness is defensible.

## Evidence

### The gate is blind, and the reason is one line

`scripts/api-drift.mjs:116-129`:

```js
// The byte-identical check is the T04-AC03 floor. The git-diff check is
// the next layer: it surfaces drift introduced by edits to the contract
// that the developer forgot to commit. If git is unavailable (e.g. CI
// checkout on a shallow clone without history) we still pass.
const git = spawnSync('git', ['diff', '--exit-code', '--', relative(REPO_ROOT, GENERATED_DIR)], {
  cwd: REPO_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
});
if (git.status !== 0 && git.stderr && !/Not a git repository/i.test(git.stderr)) {
  process.stderr.write(git.stdout ?? '');
  process.stderr.write(git.stderr ?? '');
  fail(`git diff reported drift: ${git.status}`);
}
```

The condition at `:125` requires `git.stderr` to be truthy. When `git diff --exit-code`
finds differences it exits `1` and writes the diff to **stdout**, leaving **stderr empty**.
`git.stderr` is therefore `''`, the `&&` short-circuits, `fail(...)` is never reached, and
the script falls through to `:131-132`:

```js
process.stdout.write(`api-drift:OK (${first.size} files, byte-identical across two runs)\n`);
process.exit(0);
```

The one case the author guarded against — the string `Not a git repository` — is the only
case in which `git.stderr` is non-empty, so the guard fires exactly when it should not and
stays silent exactly when it should fire.

### The committed SDK really is hand-edited

Measured on commit `db6d295` without running any gate, by reading the first line of every
tracked file under `src/app/api/generated/`:

| First line of the file | Count |
|---|---|
| `/* eslint-disable */` | 29 |
| a single space | 27 |

The 56 tracked files are split against themselves. The 27 with a blank first line are
`src/app/api/generated/functions.ts`, `models.ts`, `strict-http-response.ts` and all 24
files under `models/`. `src/app/api/generated/models/money.ts` begins:

```
0000000       \n   /   *       C   o   d   e       g   e   n   e   r   a
0000020    t   e   d       b   y       n   g   -   o   p   e   n   a   p
0000040    i   -   g   e   n       D   O       N   O   T       E   D   I
0000060    T   .       *   /  \n  \n
```

— a single space, a newline, then the `DO NOT EDIT` banner. The generator emits
`/* eslint-disable */` on that line, which is why the orchestrator's in-place run of
`npm run api:drift` left exactly those 27 files modified, 29 insertions and 28 deletions,
while the command still exited `0`.

### Why the fix is a rewrite, not a patch

The guard at `:125` is `git.status !== 0 && git.stderr && !/Not a git repository/i.test(git.stderr)`.
`git diff --exit-code` writes its output to **stdout**, never to stderr, so
`git.stderr` is `''` on every real drift and the `&&` chain short-circuits before
`fail(...)` is ever reached — that branch can never fire. A plain npm `&&` chain,
`npm run api:generate && git diff --exit-code -- src/app/api/generated`, has no such
branch to get wrong: `git diff --exit-code`'s own exit code (`1` on a difference) is
what `&&` propagates, with nothing standing between the check and the result. **This is
why the fix below deletes the 132-line script rather than patching its stderr guard**:
the bespoke script was the invention that broke the gate, and the standard two-command
chain is what `docs/fix/FIX-47.md`'s survivor list keeps as `api:drift`.

### The contradiction inside A2, named

A2's "Checked and found adequate" section concludes: *"Generated SDK is genuinely
un-edited. Regenerated into a scratch dir and `diff -rq` against `src/app/api/generated`
returned empty — byte-identical."* **That conclusion is wrong, and the reason it is wrong
is the method.** Regenerating into a scratch directory and diffing compares one generator
run against another generator run, which is the byte-identical property
`scripts/api-drift.mjs:96-114` already proves; it never looks at the committed bytes. The
in-place run is what `api:drift` actually performs, and it disagrees. This task follows the
in-place measurement. A scratch-directory regeneration would settle nothing here and must
not be used as evidence for this task's acceptance.

### Which header is correct

The generator's. `eslint.config.js` has **no** `ignores` entry for
`src/app/api/generated/**`. Measured: `grep -n "ignores" eslint.config.js` returns nothing,
and the whole file is 82 lines whose only blocks are `files: ['**/*.ts']` at `:9`,
`files: ['src/app/shared/ui/**/*.ts']` at `:59` and `files: ['**/*.html']` at `:73`. So
once FIX-01 makes `npm run lint` run at all, the
generated tree is linted, and `/* eslint-disable */` is the header that keeps a
machine-written file out of the rule set. Restoring it is the fix; adding an `ignores`
entry to `eslint.config.js` instead is **not**, and is FIX-02's file anyway.

## What to change

Three things, in this order.

### Part 1 — delete `scripts/api-drift.mjs` and replace `package.json`'s `api:drift`

D17 (`docs/fix/FIX-47.md`) keeps the `api:drift` **name** and rewrites what it runs:
regenerate, then let `git diff --exit-code` fail the command on any difference — the
standard regenerate-and-diff idiom, with no first-party Angular equivalent to reach for
instead (`node_modules/@angular/build/builders.json` ships only `application`,
`dev-server`, `extract-i18n`, `karma`, `ng-packagr` and `unit-test`).

Delete the script:

```bash
git rm scripts/api-drift.mjs
```

Replace the `api:drift` entry in `package.json`'s `scripts` object with this exact final
value:

```json
    "api:drift": "npm run api:generate && git diff --exit-code -- src/app/api/generated && test -z \"$(git ls-files --others --exclude-standard -- src/app/api/generated)\""
```

The first two commands have the property the deleted script's broken guard did not:
`git diff --exit-code`'s own exit code is what `&&` propagates, with no branch standing
between the check and the result, so a modified or deleted **tracked** file always fails
the command.

**Decision D20 item 1 adds the third command to close the one case the first two do not
cover: a contract change that adds a brand-new generated file with no modification to any
existing one.** `git diff` (without `--cached`) reads tracked files only, so a new,
untracked file under `src/app/api/generated/` passes it silently — the deleted
`scripts/api-drift.mjs` used `git status --porcelain`, which does see an untracked path,
and the plain `git diff` replacement does not. **Two standard git commands are needed
because each one covers a different git state, and neither alone covers both**:
`git diff --exit-code` fails on a modified or deleted **tracked** file; `git ls-files
--others --exclude-standard` lists every **untracked** file, and `test -z` turns a
non-empty list into the third command's own failure. The user's own words close the
question of a script covering this instead: *"Egészítsük ki, marad script nélkül"* ("let
us complete it, it stays script-free") — so the fix is a second plain git command inside
the same `&&` chain, not a bespoke script re-parsing `git status`. Do not "simplify" this
back to two commands: the second one is what catches the case the first one is
structurally unable to see.

**What happens to `T04-AC03`'s "generate twice" clause, stated rather than dropped.**
`docs/tasks/T04.md:45` has three clauses: *"Clean only src/app/api/generated before
regeneration; generate twice and obtain byte-identical content. git diff --exit-code
passes after generation."* The deleted `scripts/api-drift.mjs` implemented the middle
one literally, with two runs into temporary directories compared against each other
(`:96-114`). The replacement chain runs the generator once, and that is **not** a
requirement quietly going unenforced:

- **Clause 1** is the generator's own behaviour and needs no script.
  `ng-openapi-gen.json` does not set `removeStaleFiles`, so
  `node_modules/ng-openapi-gen/lib/ng-openapi-gen.js:145` syncs `src/app/api/generated`
  and `gen-utils.js:421-431` unlinks only entries the generator did not produce.
  Nothing outside that directory is touched.
- **Clause 3** is the chain's second command, character for character.
- **Clause 2** is held more tightly than before, not less. The old check compared one
  generated run against another generated run; the new one compares a generated run
  against the committed tree, which is a fixed reference that does not move. A
  generator that is not byte-deterministic produces different bytes from the committed
  ones on some run, and `git diff --exit-code` fails the command then — the same
  observation the double run existed to make, against a stronger reference.

This is the shape decision **D20 item 1** chose in the user's own words, *"Egészítsük
ki, marad script nélkül"* ("let us complete it, it stays script-free"): a second git
command, not a second generator run inside a bespoke script. Record this paragraph's
conclusion in the commit body — that `T04-AC03` remains enforced, by which command, and
that no clause of it was dropped — because `grep -rn "T04-AC03" docs/fix/` finds this
file and no other, so the commit body is the only place a later reader will look.

### Part 2 — regenerate and commit the true output

Run `npm run api:generate`, then stage and commit **every** file it changes under
`src/app/api/generated/`. The expected diff is the 27 files above regaining
`/* eslint-disable */` on line 1. Do not hand-edit a single generated file, and do not
revert any part of the generator's output because it "looks wrong": if the generator
produces something that is genuinely unacceptable, the change belongs in
`ng-openapi-gen.json` or in `docs/api/openapi.yaml`, not in the output — and under D1 the
contract file is specification, so an edit there needs the user.

Do not touch `eslint.config.js`. Do not touch `ng-openapi-gen.json`. Do not touch
`docs/api/openapi.yaml`.

### Part 3 — correct `docs/api/README.md`

`docs/api/README.md:20` currently reads (Hungarian, verbatim):

> **Megjegyzés (D08):** A korábbi `docs/mi-bolt/api/openapi.yaml` útvonal nem létezik; a
> valódi forrás a fenti `docs/api/openapi.yaml`. A `scripts/validate-contract.mjs` és az
> új `scripts/api-drift.mjs` is ezt használja, ahogy a projekt gyökerében lévő
> `ng-openapi-gen.json` `input` mezője is.

Both named scripts are deleted under D17 — `scripts/api-drift.mjs` by this task,
`scripts/validate-contract.mjs` by **FIX-13**. Replace the second sentence so it names
what actually reads `docs/api/openapi.yaml` after this package lands:

> A `scripts/validate-contract.mjs` és a `scripts/api-drift.mjs` a D17 döntés nyomán
> megszűnt. A szerződést ma az `npm run api:generate` (`ng-openapi-gen.json` `input`
> mezője), az `npm run api:drift` (ugyanaz a generálás, majd `git diff --exit-code` és
> `git ls-files --others --exclude-standard`) és a `tests/contract/` alatti
> vitest-tesztek olvassák.

Leave the rest of the file untouched.

## Out of scope

- **`eslint.config.js` and every lint rule — FIX-02.** In particular, do not "solve" the
  header question by adding `src/app/api/generated/**` to an `ignores` list.
- **The `lint` target in `angular.json` — FIX-01.** This task does not make lint run and
  does not depend on lint running.
- **`scripts/validate-contract.mjs`, `scripts/check-operation-parity.mjs` and the contract
  vitest suite — FIX-13.** Different scripts, both deleted by that task, not this one; do
  not touch them here. Point any reference to either at **FIX-13** by number rather than
  describing what that task does to them.
- **`docs/api/openapi.yaml` and `docs/api/fixtures/**`.** Under D1 the contract is
  specification. If the regenerated SDK reveals a contract problem, report it; do not edit
  the contract here.
- **The 24 files under `src/app/api/generated/models/` as source.** They are generator
  output; the only legitimate way to change them is to re-run the generator.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

**Warning the executor needs before starting: `npm run api:drift` deletes and regenerates
the whole of `src/app/api/generated/` on every run, so it leaves the working tree dirty
whenever the committed files differ from generator output.** That is the defect, not an
accident. Expect `git status --short` to list files after every run until Part 2 has been
committed, and never use `git restore`, `git checkout --`, `git stash`, `git reset` or
`git clean` to tidy up after it — those commands are forbidden in this workspace by
`.claude/rules/session-lifecycle.md` ("Nothing is undone with git"). Re-running
`npm run api:generate` re-produces the same output deterministically, which is all the
recovery this ever needs.

1. **Before changing anything**, reproduce the defect so the fix has a before state:

   `npm run api:drift; echo "exit=$?"; git status --short src/app/api/generated | wc -l`

   Expected at the baseline: `exit=0` and a count of `27`. Record both numbers in the
   commit body — a gate that exits 0 with 27 dirty files is the finding.

2. Apply Part 1, then **without** applying Part 2 yet:

   `npm run api:drift; echo "exit=$?"`

   Must now print `exit=1`, with `git diff`'s output on **stdout** naming files under
   `src/app/api/generated`. This is the proof that the gate can fail. Record the output.

3. Apply Part 2: `npm run api:generate`, then
   `git add src/app/api/generated && git status --short src/app/api/generated`
   — 27 files staged as modified.

4. `npm run api:drift; echo "exit=$?"` — must print `exit=0`, and
   `git status --short src/app/api/generated` must now print nothing.

5. **Prove the gate's third command independently of the first two**: the untracked-file
   case decision D20 item 1 added it for. With the tree still clean from step 4
   (`git status --short src/app/api/generated` printing nothing):

   ```bash
   mkdir -p src/app/api/generated/__fix11-probe
   touch src/app/api/generated/__fix11-probe/drift.ts
   npm run api:drift; echo "exit=$?"
   ```

   Must print `exit=1`. The failure comes from the third command,
   `test -z "$(git ls-files --others --exclude-standard -- src/app/api/generated)"`: the
   probe file is untracked, the list is non-empty, and `test -z` fails on it — the first
   two commands both still succeed, since nothing tracked was modified. Then remove the
   probe and confirm the gate returns to green:

   ```bash
   rm -rf src/app/api/generated/__fix11-probe
   npm run api:drift; echo "exit=$?"
   ```

   Must print `exit=0` again. Record both runs' output in the commit body: this is the
   proof that a modified tracked file (step 2) and a brand-new untracked file (this step)
   each independently fail the gate.

   **Why a subdirectory and not a bare file.** The chain's first command is
   `npm run api:generate`, and `ng-openapi-gen` removes stale output before the git
   commands ever run: `ng-openapi-gen.json` does not set `removeStaleFiles`, so
   `node_modules/ng-openapi-gen/lib/ng-openapi-gen.js:145` calls
   `syncDirs(this.tempDir, this.outDir, this.options.removeStaleFiles !== false, …)` with
   `true`, and `gen-utils.js:421-431` unlinks every entry of the output directory the
   generator did not produce. A bare `src/app/api/generated/__probe.ts` is gone before
   `git ls-files --others` looks, the gate exits **0**, and the criterion reads as "the
   third command does not work" on the very test written to prove it does. The removal
   branch is guarded by `fs.lstatSync(destFile).isFile()` (`gen-utils.js:425`), so a
   **directory** the generator did not produce survives the sweep, and `syncDirs` never
   recurses into it because it only recurses over entries of the *source* directory
   (`gen-utils.js:405-411`). Nothing under `src/app/api/generated` is gitignored —
   `git check-ignore -v src/app/api/generated/__fix11-probe/drift.ts` exits 1 — so the
   file is listed by `git ls-files --others --exclude-standard`. Use `rm -rf` to clean
   up; do not reach for `git clean`, which `.claude/rules/session-lifecycle.md` forbids.

6. Apply Part 3, then `grep -o "scripts/api-drift.mjs\|scripts/validate-contract.mjs" docs/api/README.md | wc -l`
   — must print `2` (both names still appear, now inside the corrected sentence saying
   they are deleted, not describing them as active). `grep -c` on the same pattern prints
   `1`, because both names sit on one unwrapped line — count occurrences, not lines.

7. `npm run build` — must exit `0`. Green at the `db6d295` baseline and must stay green.

8. The contract suite — must exit `0`, matching the baseline's equivalent state. Run
   `npx vitest run --config vitest.contract.config.ts` if **FIX-06** has landed and
   `npx vitest run tests/contract` if it has not; check with
   `ls vitest.contract.config.ts`. Record which one was run.

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the
coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do
not run `npx playwright test` while working on this task; it rewrites 49 screenshots under
`e2e/design/screenshots/`.

## Acceptance criteria

- [ ] **FIX-11-AC01** With Part 1 applied and Part 2 **not yet** applied,
      `npm run api:drift` exits `1`, with `git diff`'s output on stdout naming files under
      `src/app/api/generated`. This criterion is the whole point of the task and its
      evidence is the verbatim command output pasted into the commit body.
- [ ] **FIX-11-AC02** With both Part 1 and Part 2 applied, `npm run api:drift` exits `0`
      **and** `git status --short src/app/api/generated` prints nothing. Both halves are
      required; at the baseline the first held and the second did not.
- [ ] **FIX-11-AC03** Every tracked file under `src/app/api/generated/` begins with
      `/* eslint-disable */`. Check with
      `for f in $(git ls-files src/app/api/generated); do head -1 "$f"; done | sort | uniq -c`,
      which must print a single row, count `56`. At the baseline it printed two rows, 29
      and 27.
- [ ] **FIX-11-AC04** `scripts/api-drift.mjs` no longer exists
      (`ls scripts/api-drift.mjs` reports "No such file or directory"), and
      `node -p "require('./package.json').scripts['api:drift']"` prints exactly
      `npm run api:generate && git diff --exit-code -- src/app/api/generated && test -z "$(git ls-files --others --exclude-standard -- src/app/api/generated)"`.
- [ ] **FIX-11-AC04b** The commit body records how each of `docs/tasks/T04.md:45`'s
      three clauses is enforced after this change, naming the command or the generator
      behaviour that holds it: the stale-file sync for "clean only
      src/app/api/generated", `git diff --exit-code` against the committed tree for
      "byte-identical content", and the same command for "git diff --exit-code passes
      after generation". No clause is recorded as unenforced or unowned, and the
      paragraph in "What to change" Part 1 is the wording to follow.
- [ ] **FIX-11-AC05** `npm run build` exits `0`, matching the `db6d295` baseline. The
      contract suite exits `0` as well, run with whichever runner exists at the time:
      `npx vitest run --config vitest.contract.config.ts` if **FIX-06** has landed, and
      `npx vitest run tests/contract` under the repository's `vitest.config.ts` if it
      has not — the latter is green at the baseline (`BASELINE.md:11` records
      `vitest run --coverage` at exit `0`). Record which runner was used and its exit
      code. The same branch applies to "How to verify" step 8.
- [ ] **FIX-11-AC06** `git status --short` at the end of the task lists: `package.json`
      modified; `scripts/api-drift.mjs` deleted; `docs/api/README.md` modified; and files
      under `src/app/api/generated/` modified. No spec file, no `eslint.config.js`, no
      `ng-openapi-gen.json`, no `docs/api/openapi.yaml`, and no `package-lock.json` (this
      task edits a script string, not a dependency).
- [ ] **FIX-11-AC07** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change deletes one Node script, edits one npm
      script string, restores a comment header in generated TypeScript and corrects a
      documentation sentence; no rendered surface moves, and `npm run build` exiting `0` is
      what proves the SDK still compiles into the app. That is the exemption
      `.claude/rules/browser-verification.md` grants to a build script, and per that rule it
      is stated explicitly rather than left out silently.
- [ ] **FIX-11-AC08** Design rules recorded in the commit body. **R26 applicable and met**:
      the commit body names the files changed and deleted, every command run with its exit
      code, the before/after of the 27-file split, and the remaining limitation that the
      generated tree has never actually been linted because `npm run lint` does not run yet
      (FIX-01). **R01–R25 are N/A: this task deletes a Node gate script, edits one npm
      script string, restores a machine-generated comment header and corrects a
      documentation sentence, and renders nothing a person can see.** Skill provenance is
      stated once in `docs/fix/README.md` section 3, "Every task records the design
      rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.
- [ ] **FIX-11-AC09** **Decision D20 item 1's third command is proven independently of
      the first two**, the case `git diff --exit-code` alone cannot catch: a brand-new,
      untracked file with nothing modified. With the tree clean,
      `mkdir -p src/app/api/generated/__fix11-probe && touch src/app/api/generated/__fix11-probe/drift.ts`
      then `npm run api:drift; echo "exit=$?"` prints `exit=1`, and
      `git ls-files --others --exclude-standard -- src/app/api/generated` lists exactly
      `src/app/api/generated/__fix11-probe/drift.ts`. Removing the probe
      (`rm -rf src/app/api/generated/__fix11-probe`) and re-running returns `exit=0`.
      Record both runs' output in the commit body. The probe must sit in a
      **subdirectory**; a bare file directly under `src/app/api/generated/` is deleted
      by `ng-openapi-gen`'s stale-file sweep during the chain's own first command and
      the gate then exits 0 — "How to verify" step 5 carries the mechanism and the
      source lines.

## Commit

This task is exactly one commit — Parts 1, 2 and 3 together. Do not bundle it with FIX-10,
FIX-12, FIX-13 or any other FIX task. In particular, do not split it into "fix the gate"
and "regenerate the SDK": the two halves only make sense together, and committing the
regeneration without the gate fix would leave the check as blind as it is now on a tree
that happens to be clean. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `fix: F3 success page receipt fallback
(sessionStorage)`):

```text
fix: api:drift fails on committed-tree drift; regenerate SDK
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**FIX-06 must land before this one's "How to verify" step 8 can run**, because
`vitest.contract.config.ts` does not exist until FIX-06 creates it. Nothing else has to
land before this one.

**FIX-02 cannot land before this task.** It turns on `strictTypeChecked` over
`src/**/*.ts`, which includes the 56 generated files, and **FIX-02-AC01** requires a
green `npm run lint` with no `eslint-disable` added — unreachable while 27 of them are
missing the header this task restores, because the three ways out are all closed to it
(hand-editing a `DO NOT EDIT` file, an `ignores` entry, a suppression comment).
**FIX-01 is easier after it** for the same reason and is not gated on it.

**FIX-13 should not be mid-flight when this task's Part 3 edits
`docs/api/README.md:20`**, since FIX-13 does not touch that file but does delete
`scripts/validate-contract.mjs`, which Part 3's replacement sentence names as already
gone — landing this task after FIX-13 avoids describing a deletion that has not happened
yet, though the sentence is written to be true either way.
