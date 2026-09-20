# FIX-13 — Remove `createNodeServer`, the hand-rolled OpenAPI validator, and the unwired operation-parity script

Status: DONE — 1ff9a87, a2f560e. Deletes the unreferenced createNodeServer module and the redundant OpenAPI validator/parity scripts across its two legitimate commits.
Severity: major
Source: A2 finding 4 (`createNodeServer` is dead code), A2 finding 5 (the hand-rolled
OpenAPI structural validator duplicates a standard linter), decision **D17** (the docs/fix
package itself was over-engineered; standard scripts only) and decision **D19 item 6** (four
undeclared transitive dependencies).

## Why this is wrong

The user's brief for this audit was explicit that necessity is in scope, not only
correctness: *"necsak a kodot nezzetek hanem hogy szukseg van-e ra vagy nincs"* ("do not
only look at the code but at whether it is needed or not"). Three pieces of this repository
fail that test, and a fourth is a defect this task's own edits would otherwise reintroduce.

`src/mocks/node.ts` exports one function, `createNodeServer`, which nothing calls. It is
114 lines of MSW server lifecycle that has never run.

`scripts/validate-contract.mjs` is 662 lines, roughly half of which re-implements what an
off-the-shelf OpenAPI linter does with no configuration: `$ref` resolution, operationId
uniqueness, status-code sanity and example-against-schema validation. The other half
re-implements four project-specific business invariants that `tests/contract/schema.spec.ts`
**already asserts independently, in vitest, today** (Evidence, below) — with one exception,
the `package.json` `api:generate` wiring check, which has no vitest case anywhere yet and
which the deleted script mislabelled as T03-AC05 (the real T03-AC05 is a different
requirement — see Evidence below).

`scripts/check-operation-parity.mjs` is invoked by nothing: `grep -n '"scripts"' -A 20
package.json` lists no entry that runs it, and its five T26-AC01…AC05 checks are already
independent `describe` blocks in `tests/contract/operation-matrix.spec.ts`. It is the same
defect as `createNodeServer` — code that exists to be a gate but is not wired to run as one
— except this one is 7.5 KB rather than 128 lines.

**Decision D17 changes the disposition this task ships.** The user's instruction —
*"nem kell ennyi script es npm parancs sem, standardek kellenek lint, test, coverage stb,
plan tul lett tervezve javitasd"* ("this many scripts and npm commands are not needed
either; standards are what is needed — lint, test, coverage and so on; the plan was
over-engineered, fix it") — means this task no longer keeps the validator's own npm script
green by adding a linter beside the hand-rolled script (the shape this file specified
before D17). It deletes `scripts/validate-contract.mjs`, its `scripts/validate-contract.spec.mjs`
node:test companion, and `scripts/check-operation-parity.mjs` outright, and removes the two
npm-script entries that invoked the first of them — `package.json:11` and `:14` — from
`package.json`. The four project-specific business invariants do not disappear: three of
them already have a vitest equivalent, and the fourth gains one in this same change. Nothing
this task deletes has surviving requirement coverage that goes unrepresented afterward.

**D19 item 6 adds one more defect this task's own deletions would otherwise make worse.**
`js-yaml`, `ajv`, `ajv-formats` and `@apidevtools/json-schema-ref-parser` are imported by
`tests/contract/schema.spec.ts:14-17`, `tests/contract/sdk-transport.spec.ts` and
`tests/contract/response-validation.ts:4` (import block) and declared in `package.json`
**nowhere**. They resolve today only because npm hoisted them as transitive dependencies of
`ng-openapi-gen`, `@angular/build` and `eslint`. Deleting `scripts/validate-contract.mjs`
does not fix this — the three surviving files keep importing all four — so this task
declares them explicitly. **`npm ci` is not at risk**: `package-lock.json` is committed and
`npm ci` installs exactly the tree on disk, deterministically. The real exposure is that a
future bump of a parent package — `ng-openapi-gen` for `@apidevtools/json-schema-ref-parser`
and `js-yaml`, `@angular/build` and `eslint` for `ajv` and `ajv-formats` — can stop hoisting
one of the four and break an import in a change that has nothing to do with the contract
suite. `istanbul-lib-coverage` is the fifth undeclared package the same audit found, and it
is **not** declared here: its only importer, `scripts/check-coverage.mjs`, is deleted by
FIX-08, so declaring it here would add a dependency nothing in the repository uses.

## Evidence

### Part 1 — `createNodeServer` has no caller

`src/mocks/node.ts:61-81`:

```ts
export function createNodeServer(
  baseOptions: Partial<CreateHandlersOptions> & Pick<CreateHandlersOptions, 'apiRoot'>,
): NodeServerHandle {
  const options = resolveOptions(baseOptions);
  let handlers = createHandlers(options);
  const server = setupServer(...handlers);
```

Measured on `db6d295`:
`grep -rln "src/mocks/node.ts" --exclude-dir=node_modules --exclude-dir=.git .` returns four
paths — `tests/contract/operation-matrix.spec.ts`, `docs/index.html`, `docs/tasks/T05.md`
and `docs/tasks/tasks.json` — and `grep -rn "createNodeServer" src tests e2e scripts docs`
finds the identifier only inside `src/mocks/node.ts` itself. The one reference from test
code does not import it; `tests/contract/operation-matrix.spec.ts:381` reads the file as
**text**:

```ts
    const nodeSource = await readFile(resolve(__dirname, '../../src/mocks/node.ts'), 'utf8');
```

The real Node-side server used by the suite is built in `tests/setup-msw.ts:41-42`:

```ts
  const { setupServer } = await import('msw/node');
  server = setupServer();
```

`src/mocks/browser.ts` is **not** dead and is not touched by this task: it is imported by
`src/core/bootstrap-demo.ts:20` and dynamically imported by `src/main.ts:56`.

### Why "wire it in" is not the answer here, and what is left unresolved

A2 offers "delete or wire into `tests/setup-msw.ts`". Wiring it in cannot work as the code
stands. `createNodeServer` calls `createHandlers(options)` (`src/mocks/node.ts:65`), which
returns the dispatcher shell plus every registered business handler
(`src/mocks/create-handlers.ts:69-74`), and passes the whole list to `setupServer(...)`.
`tests/setup-msw.ts:13-16` starts the shared server with an **empty** handler list on
purpose:

```ts
 * The handlers list starts empty on purpose: T02 owns the gate that
 * proves unhandled requests fail the suite; each test registers the
 * exact handlers it needs via `server.use(...)` so the absence of a
 * handler is a deliberate signal.
```

Registering all 16 routes globally would make every `/api/v1/*` request handled, and
`tests/network-isolation.spec.ts` — the T02 gate — would pass by construction rather than
by evidence. That is a worse outcome than dead code.

**The unresolved D1 item, named rather than silently dropped.** `docs/tasks/T05.md:20`
lists `src/mocks/node.ts` among T05's owned files and T05's interface line at `:29` names
`startMocks(): Promise<void>`. The delivered file exports no `startMocks` at all, so it
matches neither the specification nor any caller: it is not the module T05 asked for and it
is not a module anything uses.

The two halves of that packet line now part company. **The `startMocks` name is settled:**
decision **D10** ("A spec neve nyer" — "the spec's name wins") renames
`src/core/bootstrap-demo.ts`'s `prepareMocks` to it, and **FIX-51** carries that rename as
its Part 2. Nothing about it is this task's; the function is in a file this task does not
open. **The `src/mocks/node.ts` file entry stays unresolved.** Deleting the module does not
close a specification line that asks for it, and this task does not pretend to; **FIX-39**,
which owns the unreached acceptance criteria, is where that line is accounted for. Under D1
the documentation is not edited to match the code, so `docs/tasks/T05.md` is not touched
here.

### Part 2 — the validator and the parity script are redundant, not merely duplicative

`scripts/validate-contract.mjs` builds its own validator from `js-yaml`,
`@apidevtools/json-schema-ref-parser`, `Ajv` and `ajv-formats` (`:29-32`). Its own header
enumerates what it checks (`:1-23`), and its section banners name each block:

| Section banner in `scripts/validate-contract.mjs` | Kind | Already a vitest case in `tests/contract/schema.spec.ts`? |
|---|---|---|
| `Spec collection` (`:64`) | operationId collection and count | Yes — `describe('T03-AC01 operationIds', …)` at `:58` |
| `Money invariant — T03-AC02` (`:104`) | project-specific | Yes — `describe('T03-AC02 Money invariant', …)` at `:98` |
| `Repeated query-array encoding — T03-AC02` (`:163`) | project-specific | Yes — `describe('T03-AC02 status codes & repeated query arrays', …)` at `:138`, the same `describe` also covers the next row |
| `Status code sanity — T03-AC02` (`:196`) | generic | Yes — same `describe` at `:138` |
| `Example validation — T03-AC01` (`:242`) | project-specific | **No.** `grep -n "examples" tests/contract/schema.spec.ts` returns nothing today. The `$ref` case at `:87` proves references resolve and the fixture case at `:325` validates the **fixtures**; neither validates the specification's own examples against their declared schemas, which is the third clause of `docs/tasks/T03.md:44`. This is the **second** gap Part 2 below closes, and it is moved rather than dropped. |
| `Idempotency key on mutations — T03-AC04` (`:360`) | project-specific | Yes — `it('idempotency-key-required-on-mutations: …')` at `:259`, inside `describe('T03-AC04 business invariants (not enforced by JSON Schema)', …)` at `:210` |
| `package.json contract — T03-AC05` (`:391`) | project-specific | **No.** `grep -n "AC05" tests/contract/schema.spec.ts` returns nothing today — this is the one gap Part 2 below closes. This check is not actually T03-AC05 (`docs/tasks/T03.md:48` is a different requirement, "Contract-breaking changes require a decision entry and regenerated SDK, handlers and test registry in one change"); the deleted script mislabelled it and the new case is named for what it asserts instead. |
| `Fixture shape — T03-AC03` (`:415`) | project-specific | Yes — `describe('T03-AC03 fixture shape', …)` at `:284`, five `it` cases covering the 16-product count, multi-variant, out-of-stock, low-stock and operator-name checks, plus the full Product-schema validation at `:325` |

**So the script is not "half redundant" the way it looked before this task existed — it is
entirely redundant except for two checks, and Part 2 moves both.**
`tests/contract/schema.spec.ts` already proves everything
`scripts/validate-contract.mjs` proves except (a) that `package.json` declares the
`api:generate` script, a nine-line assertion, and (b) that the specification's own
examples validate against their declared schemas — `assertExamplesValidate`
(`scripts/validate-contract.mjs:255-355`), which `docs/tasks/T03.md:44`'s third clause
requires and which no vitest case covers. Measured: `grep -c "examples:"
docs/api/openapi.yaml` prints `8` and `grep -c "example:"` prints `0`, and every one of
the eight sits under a `components.schemas.<Name>` object, so only the **schema-level**
half of that function does any work against this contract. The operation media-type
half matches nothing and is not carried over; say so in the commit body, so a later
contract that adds a media-type example is not silently unchecked. `package.json` declares no `@redocly/cli`,
`@stoplight/spectral-cli`, `swagger-cli` or `oasdiff` either, and a prior A2 measurement
against a standard linter recorded, for the historical record, that the generic structural
half is sound: `npx @redocly/cli lint docs/api/openapi.yaml` printed *"validated in 84ms …
Your API description is valid. 🎉 You have 9 warnings."* — zero errors, no configuration.
This task does **not** add `@redocly/cli` as a dependency or a script: under D17 a one-time
measurement that a generic check passes is not a reason to keep running a bespoke
reimplementation of it forever, and `schema.spec.ts`'s own Ajv-based checks already run on
every `npm run test`.

`scripts/check-operation-parity.mjs` is a second instance of the same shape. Its own header
comment states its exit codes: *"0  every operationId maps to a registered handler AND no
extra business routes exist beyond the dispatcher shell. 1  one or more operationIds have no
handler, the openapi.yaml has the wrong number of operationIds, or the slice files
registered business routes the contract never declared."* `tests/contract/operation-matrix.spec.ts:10`
carries its own comment: *"The five top-level describe blocks correspond to
T26-AC01…AC05."* Measured: `grep -n "^describe" tests/contract/operation-matrix.spec.ts`
returns `T26-AC01 operation inventory parity` at `:103`, `T26-AC02 request/response +
Problem-code contract` at `:149`, `T26-AC03 business-error code coverage` at `:221`,
`T26-AC04 demo and node mock share the domain` at `:378`, `T26-AC05 schema fixtures are
enforced at runtime` at `:428`. All five acceptance criteria the CLI script exists to prove
already have an independent vitest proof, and — unlike `scripts/validate-contract.mjs`,
which was at least wired to an npm script (`package.json:11`) — nothing in `package.json` invokes
`check-operation-parity.mjs` at all: `grep -n '"scripts"' -A 20 package.json` lists sixteen
entries and none of them names it.

## What to change

**Two commits, because this task now carries two independent subjects: deleting one piece of
dead Node code (Part 1), and deleting two redundant validation scripts plus declaring the
packages their surviving vitest coverage depends on (Parts 2 and 3).** This is the same
exception the package's own `README.md` already grants FIX-51 for the same reason — one file,
two subjects that share no line of code. See `## Commit` below for exactly which files go in
which commit.

### Part 1 — delete `src/mocks/node.ts` (**Commit 1**)

Unchanged by D17. Delete the file. Its only export has no caller, and `NodeServerHandle`,
`resolveOptions`, `loadCatalogFixture` and `PRODUCTION_SCENARIO_NAME` inside it exist only to
serve that export.

Also edit `src/mocks/create-handlers.ts:12-15`'s header comment, which still names the file
this part deletes:

```ts
 * The factory is deliberately side-effect-free: it never touches
 * `globalThis`, never reads from `sessionStorage`, never starts the
 * worker. The browser entry (`mocks/browser.ts`) and the node entry
 * (`mocks/node.ts`) own the worker lifecycle.
```

Replace the last sentence so it no longer names a module the repository will not have:

```ts
 * The factory is deliberately side-effect-free: it never touches
 * `globalThis`, never reads from `sessionStorage`, never starts the
 * worker. The browser entry (`mocks/browser.ts`) owns the worker
 * lifecycle.
```

Without this edit, "How to verify" step 7's `grep -rn "createNodeServer\|mocks/node" src tests e2e scripts` still matches this comment and can never return nothing.

Then delete the source-text test that reads it, `tests/contract/operation-matrix.spec.ts:379-384`:

```ts
  it('createHandlers and createStrictHandlers share the same registry', async () => {
    const browserSource = await readFile(resolve(__dirname, '../../src/mocks/browser.ts'), 'utf8');
    const nodeSource = await readFile(resolve(__dirname, '../../src/mocks/node.ts'), 'utf8');
    expect(browserSource.includes('createHandlers') || browserSource.includes('createStrictHandlers')).toBe(true);
    expect(nodeSource.includes('createHandlers')).toBe(true);
  });
```

Delete that `it` block only. **Keep the two cases after it** (`:386-393` and `:395` onward):
they assert the property T26-AC04 actually cares about — that the browser and node option
sets produce the same route list and the same `GET /config` response — by calling
`createStrictHandlers` rather than by grepping a file, and neither imports `node.ts`.
Delete the `readFile` / `resolve` imports at the top of the spec only if nothing else in
the file uses them; check with `grep -n "readFile\|resolve(" tests/contract/operation-matrix.spec.ts`
before removing either. **Note for the executor: after Part 2 deletes
`scripts/check-operation-parity.mjs`, that file is no longer read as text by anything, so
this `grep` is still the correct check — do not skip it on the assumption Part 2 already
answered it.**

Do not touch `docs/tasks/T05.md`, `docs/tasks/tasks.json` or `docs/index.html`. Under D1
the documentation is specification.

### Part 2 — delete the hand-rolled validator and the unwired parity script (**Commit 2**)

**Step 2a — delete three files.**

```bash
rm scripts/validate-contract.mjs scripts/validate-contract.spec.mjs scripts/check-operation-parity.mjs
```

**Step 2b — add the one missing vitest case, and correct the header comment that named the
file just deleted.**

`tests/contract/schema.spec.ts:1-8` currently reads:

```ts
// tests/contract/schema.spec.ts — T03-AC01/AC02/AC04 contract-level assertions.
//
// Vitest suite that reads docs/api/openapi.yaml (the wire contract) plus the
// products fixture, dereferences $refs with @apidevtools/json-schema-ref-parser,
// and asserts the schema-level and business-invariant constraints the spec
// document imposes. The validator (scripts/validate-contract.mjs) enforces the
// same checks for the CLI; this suite gives the same coverage to Vitest so
// T03 can run it under `ng test` or `npx vitest run`.
```

Replace those eight lines with:

```ts
// tests/contract/schema.spec.ts — T03-AC01/AC02/AC03/AC04 contract-level
// assertions, plus a package.json contract check for the api:generate
// script T04 wires.
//
// Vitest suite that reads docs/api/openapi.yaml (the wire contract), the
// products fixture and package.json, dereferences $refs with
// @apidevtools/json-schema-ref-parser, and asserts the schema-level and
// business-invariant constraints the spec document imposes. This suite is
// the sole enforcement of these invariants: the hand-rolled CLI duplicate,
// scripts/validate-contract.mjs, is deleted (FIX-13) because every check it
// performed already had a vitest case here or gained one in the same change.
// The two it gained are the package.json api:generate declaration and the schema-level
// example validation (T03-AC01's third clause).
```

Then append, at the end of the file (after the closing `});` of the
`T03-AC03 fixture shape` describe block, currently the last line, `:332`), a new top-level
`describe` block. `readFile` and `resolve` are already imported at `:10-11`; add no new
import.

```ts
/**
 * The deleted scripts/validate-contract.mjs checked this inline
 * (assertApiGenerateScript, :395-413). It is a predicate here so the
 * negative arm is a case rather than a hand-performed rename of a
 * package.json key in the same commit that rewrites devDependencies.
 */
function declaresApiGenerate(scripts: Record<string, string> | undefined): boolean {
  return Object.prototype.hasOwnProperty.call(scripts ?? {}, 'api:generate');
}

describe('package.json contract — api:generate is declared (T04 wiring)', () => {
  it('package.json declares the api:generate script', async () => {
    const packageJsonRaw = await readFile(resolve(__dirname, '../../package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> };
    expect(
      declaresApiGenerate(packageJson.scripts),
      'package.json scripts.api:generate is required (T04 wires ng-openapi-gen; T03 asserts the name)',
    ).toBe(true);
  });

  it('the check fails when the script is renamed or absent', () => {
    expect(declaresApiGenerate({ 'zz-api:generate': 'ng-openapi-gen --config ng-openapi-gen.json' })).toBe(false);
    expect(declaresApiGenerate({})).toBe(false);
    expect(declaresApiGenerate(undefined)).toBe(false);
  });
});
```

The second case is the failing-first proof, held permanently. It covers all three ways
the assertion can be wrong — a renamed key, an empty `scripts` object, and no `scripts`
object at all — which is `.claude/rules/code-standards.md`'s "every arm of it gets a
case", and it runs on every `npm run test` rather than once in a session nobody can
re-check. **Do not rename a key in `package.json` to demonstrate this.** That file is
already being rewritten by this same commit (Step 2c removes two `scripts` entries and
the `devDependencies` block gains four names under **D19 item 6**), the restore would
have to be done by retyping — every git-undo verb is forbidden by
`.claude/rules/session-lifecycle.md` — and a mistyped restore lands in the commit.

This is a direct transcription of `assertApiGenerateScript` from the deleted
`scripts/validate-contract.mjs:395-413` — same check, same message, now asserted by vitest
instead of a hand-rolled CLI.

**Then add the example-validation case**, inside the existing
`describe('T03-AC01 operationIds', …)` block at `tests/contract/schema.spec.ts:58`, as
its fourth `it`, after the `$ref` case at `:87-97`. Add no new import: `Ajv` and
`addFormats` are already imported at `:16-17`.

```ts
  it('every schema-level example validates against its own schema', () => {
    // Ported from scripts/validate-contract.mjs's assertExamplesValidate
    // (buildAjv at :246, the schema-level loop at :304-312), deleted by
    // FIX-13. Its Ajv is built with validateFormats: false; this instance
    // repeats that exactly, so the moved check is the same check and not a
    // stricter one. The operation media-type half of that function is not
    // carried over: docs/api/openapi.yaml declares eight `examples:` blocks
    // and all eight are schema-level (grep -c "example:" returns 0).
    const exampleAjv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
    addFormats(exampleAjv);
    const schemas = dereferenced.components.schemas;
    let checked = 0;
    for (const [name, schema] of Object.entries(schemas)) {
      const examples = (schema as { examples?: unknown[] }).examples;
      if (!Array.isArray(examples)) continue;
      const validate = exampleAjv.compile(schema as Record<string, unknown>);
      examples.forEach((example, i) => {
        checked += 1;
        expect(
          validate(example),
          `${name}.examples[${i}] failed its own schema: ${JSON.stringify(validate.errors)}`,
        ).toBe(true);
      });
    }
    expect(checked, 'no schema-level example was found to validate').toBeGreaterThan(0);
  });
```

The `checked` counter is not decoration: without it a future contract that drops every
`examples:` block would leave this case passing over an empty loop, which is the exact
failure mode `docs/spec/coverage-policy.json`'s `forbidden` list names. Use the
**dereferenced** schemas, not the raw ones: the raw objects still contain `$ref` nodes
that a bare Ajv instance cannot resolve, and dereferencing preserves `examples`. Use no
`as any` and no non-null assertion (`.claude/rules/code-standards.md`).

**Step 2c — remove the two npm-script entries that named the deleted validator.**
`package.json`'s `scripts` object (`:4-20`) currently contains, among sixteen entries, two
that invoke the deleted files directly: **line 11**, whose value is
`"node scripts/validate-contract.mjs"`, and **line 14**, whose value is
`"node scripts/validate-contract.mjs && node scripts/api-drift.mjs"`.

Delete both lines and nothing else in the `scripts` object. **Do not touch any other script
key.** Reducing the remaining fourteen entries to the eleven survivors of §4.1/D19 item 3 is
**FIX-47'**'s subject (`FIX-47 — Prune the npm scripts to the standard commands of the
stack`), not this task's. **If FIX-47' has already landed when this task is executed, both
of these two entries will already be absent** — that is not a failure of this step, it is
the same edit having already happened; confirm their absence with the grep in
`## How to verify` and record in the commit body which task removed them first, rather than
treating an already-missing entry as something to restore and re-delete.

**Step 2d — edit the four places that name the two deleted script files outside `scripts/`.**
Decision **D17** authorizes this specification edit — the deleted scripts no longer exist,
so the documents that list them as owned files must not keep claiming they do — and it does
not weaken **D1**: the edit removes a stale file reference, it does not change what the
specification requires of the running application.

`docs/tasks/T03.md:23` reads:

```
- `scripts/validate-contract.mjs`
```

inside the `## Files` list (`:19-24`). Delete that one line. The list still names
`tests/contract/schema.spec.ts` at `:24`, which is where the assertions now live — no line
needs to be added.

`docs/tasks/T26.md:21` reads:

```
- `scripts/check-operation-parity.mjs`
```

inside the `## Files` list (`:19-21`). Delete that one line. **This task also owns
`T26-AC01`'s "fail CI" wording**, in `docs/tasks/T26.md:41` and in all four of its
mirrors — see item "T26-AC01: delete the CI wording (D17)" below. Apart from those two
lines of `docs/tasks/T26.md` (`:21` and `:41`), do not edit any other line of that file.

### T26-AC01: delete the CI wording (D17)

Decision **D17** is the user's *"semmilyen ci nem kell azokat torold"* ("no CI of any kind
is needed, delete those"). CI exists in this repository only as prose, and `T26-AC01` is
one of the two criteria that carry it. This task owns that criterion's wording because it
is the only task in the package that edits `docs/tasks/T26.md`
(`grep -l 'docs/tasks/T26.md' docs/fix/FIX-*.md`), and a mirror must never be rewritten
by a different commit from its source. `FIX-08` owns the matching T02-AC06 edit in
exactly the same shape.

In every location below, replace `fail CI.` with `fail the contract suite.` — the
wording `FIX-47.md:163` proposes — leaving the rest of the sentence and all surrounding
markup untouched. Locate each by content with `grep -o`, never by line number, since a
sibling task's edit to the same file shifts everything after it.

1. `docs/tasks/T26.md:41` — `- [ ] **T26-AC01** Exactly all 16 operationIds map to handlers and SDK transport tests; missing/extra business routes fail CI.`
   becomes
   `- [ ] **T26-AC01** Exactly all 16 operationIds map to handlers and SDK transport tests; missing/extra business routes fail the contract suite.`
2. `docs/tasks/tasks.json:1478` — the `T26-AC01` object's `"text"` field, inside the `T26`
   task's `acceptanceCriteria` array; same replacement, JSON-escaped as it already is.
3. `docs/index.html`, the `<li>` inside the expanded T26 packet (measured today at `:4038`):
   `<li>[ ] <strong>T26-AC01</strong> Exactly all 16 operationIds map to handlers and SDK transport tests; missing/extra business routes fail CI.</li>`
   becomes the same line with `fail the contract suite.` in place of `fail CI.`.
4. `docs/index.html`, the compact `<div class="criterion">` block on the line that also
   carries T26-AC02 through T26-AC05 (measured today at `:4006`): replace only the
   `T26-AC01` `<span>`'s text, leaving `<strong>T26-AC01</strong>`, the surrounding markup
   and the other criteria on that line untouched.
5. `docs/index.html`, the `data-search='{…}'` JSON attribute on the same `<details>`
   element (measured today at `:4002`, the `"t26-ac01"` entry inside
   `"acceptancecriteria"`) — **lower-cased**: `…missing/extra business routes fail ci.`
   becomes `…missing/extra business routes fail the contract suite.`, in the same
   lower-cased, quote-escaped form the rest of that attribute already uses. This is the
   mirror the case-sensitive `grep -c '\bCI\b'` sweep does not see; it is searchable index
   text, and leaving it makes the site's own search return "ci" for a criterion that no
   longer mentions it.

Locate all five with:

```bash
grep -n 'fail CI' docs/tasks/T26.md docs/tasks/tasks.json
grep -o '.\{40\}t26-ac01.\{140\}' docs/index.html
grep -o '.\{40\}T26-AC01.\{140\}' docs/index.html
```

`docs/tasks/tasks.json:187` reads:

```json
      "scripts/validate-contract.mjs",
```

inside the T03 task's `"files"` array (`:182-189`). Delete that one line; `:186`'s trailing
comma and `:188`'s `"tests/contract/schema.spec.ts"` need no further change.

`docs/tasks/tasks.json:1471` reads:

```json
      "scripts/check-operation-parity.mjs"
```

inside the T26 task's `"files"` array (`:1468-1472`), and it is the **last** element (no
trailing comma). Delete that line, **and** remove the trailing comma from the new last line,
`:1470`, changing `"tests/contract/response-validation.ts",` to
`"tests/contract/response-validation.ts"` — otherwise the JSON file becomes invalid.

`docs/index.html` names the same two files in six places (three per task: the `data-search`
JSON attribute, the compact file-list `<div>`, and a full `<li>` list). **Line numbers will
have shifted if any earlier `docs/fix/` step or sibling task already edited this file; locate
each by content, not by number, before editing.** At the working-tree state measured for this
task:

- `:2758` — inside the `data-search='{"id": "t03", …}'` attribute, the substring
  `"files": ["docs/mi-bolt/api/openapi.yaml", "docs/mi-bolt/api/fixtures/products.json",
  "docs/mi-bolt/api/fixtures/config.json", "docs/mi-bolt/api/fixtures/checkout-options.json",
  "scripts/validate-contract.mjs", "tests/contract/schema.spec.ts"]` — delete exactly
  `"scripts/validate-contract.mjs", ` (with its trailing comma and space) so the array reads
  `…"checkout-options.json", "tests/contract/schema.spec.ts"]`.
- `:2761` — inside `<h3>Fájlfelelősség</h3><div class="file-list">…</div>`, delete the exact
  substring `<code>scripts/validate-contract.mjs</code>`.
- `:2779` — the whole line is `<li><code>scripts/validate-contract.mjs</code></li>`; delete
  the entire line.
- `:4002` — inside the `data-search='{"id": "t26", …}'` attribute, the substring
  `"files": ["tests/contract/operation-matrix.spec.ts", "tests/contract/response-validation.ts",
  "scripts/check-operation-parity.mjs"]` — delete exactly `, "scripts/check-operation-parity.mjs"`
  (with its leading comma and space) so the array reads
  `["tests/contract/operation-matrix.spec.ts", "tests/contract/response-validation.ts"]`.
- `:4005` — inside `<h3>Fájlfelelősség</h3><div class="file-list">…</div>`, delete the exact
  substring `<code>scripts/check-operation-parity.mjs</code>`.
- `:4021` — the whole line is `<li><code>scripts/check-operation-parity.mjs</code></li>`;
  delete the entire line.

`tests/contract/response-validation.ts:1-5` currently reads:

```ts
/**
 * T26 — OpenAPI-backed schema validators shared by the contract
 * parity suite (`tests/contract/operation-matrix.spec.ts`) and the
 * CLI parity script (`scripts/check-operation-parity.mjs`).
 *
```

Replace lines 2-4 with:

```ts
 * T26 — OpenAPI-backed schema validators used by the contract
 * parity suite (`tests/contract/operation-matrix.spec.ts`).
 *
```

Touch **only** these five lines of `tests/contract/response-validation.ts`. Everything else
in the file — the live-MSW-traffic validation A2 recorded as something no static linter can
do — is untouched.

### Part 3 — declare the four transitively-resolved packages (**Commit 2**, same commit as Part 2)

`package.json`'s `devDependencies` object (`:35-57`) currently declares 21 packages and none
of the four `tests/contract/*.ts` files import directly. Replace the whole
`"devDependencies": { … }` object with:

```json
  "devDependencies": {
    "@angular/build": "^22.1.8",
    "@angular/cli": "^22.1.8",
    "@angular/compiler-cli": "^22.1.0",
    "@angular/platform-browser-dynamic": "^22.1.6",
    "@apidevtools/json-schema-ref-parser": "14.2.1",
    "@axe-core/playwright": "^4.13.0",
    "@eslint/js": "^10.0.1",
    "@playwright/test": "^1.63.0",
    "@tailwindcss/postcss": "^4.1.12",
    "@vitest/browser-playwright": "^4.1.11",
    "@vitest/coverage-v8": "^4.1.0",
    "ajv": "8.20.0",
    "ajv-formats": "3.0.1",
    "angular-eslint": "22.5.0",
    "eslint": "^10.9.1",
    "js-yaml": "4.3.2",
    "jsdom": "^28.0.0",
    "msw": "^2.15.0",
    "ng-openapi-gen": "^1.0.5",
    "postcss": "^8.5.3",
    "prettier": "^3.8.1",
    "tailwindcss": "^4.1.12",
    "typescript": "~6.0.2",
    "typescript-eslint": "8.69.0",
    "vitest": "^4.0.8"
  }
```

That is the existing 21 entries, alphabetically ordered exactly as they are today, with four
new lines inserted in their alphabetical place: `@apidevtools/json-schema-ref-parser`,
`ajv`, `ajv-formats`, `js-yaml`. **Do not add `istanbul-lib-coverage`** — its only importer,
`scripts/check-coverage.mjs`, is deleted by FIX-08, so declaring it here would add an unused
dependency.

After the edit, run `npm install` once (not `npm ci` — `npm ci` never writes
`package-lock.json`, and this step needs the lockfile to record the four packages as direct
dependencies rather than only as hoisted transitives) and commit the resulting
`package-lock.json` diff alongside `package.json`. Confirm no version moved: `npm ls js-yaml
ajv ajv-formats @apidevtools/json-schema-ref-parser` must print exactly `4.3.2`, `8.20.0`,
`3.0.1` and `14.2.1` respectively, with no `npm error` line.

## Out of scope

- **`scripts/api-drift.mjs` — FIX-11.** Do not edit it here even though it sat beside the
  deleted validator in the composite script this task deletes at `package.json:14`.
- **`docs/api/openapi.yaml` and `docs/api/fixtures/**`.** Specification under D1. If the
  suite reports something that looks like a real contract defect while you are working on
  this task, report it as a defect; do not fix it here.
- **`docs/api/README.md`.** It also names `scripts/validate-contract.mjs`; **FIX-11** owns
  that edit, not this task.
- **`docs/tasks/T05.md`, `docs/tasks/tasks.json` (the T05 entry), `docs/index.html` (the T05
  entry).** Specification under D1. `T05.md:20`'s `src/mocks/node.ts` entry stays unresolved
  and goes to **FIX-39**; `T05.md:29`'s `startMocks()` name is **FIX-51**'s Part 2 under
  decision **D10**, and no part of it is this task's.
- **`docs/tasks/T02.md:50` (T02-AC06's CI wording) and its mirrors — `FIX-08`.** The same
  shape of edit as this task's own T26-AC01 item, in the other packet; `FIX-08.md:266-284`
  owns all four of its locations. Do not touch the T02 packet here.
- **`docs/spec/testing.md`.** Its `:112-130` script list currently names, at `:115`, the
  composite script this task deletes from `package.json`; removing that line from the
  specification text is **FIX-47'**'s subject (`FIX-47 — Prune the npm scripts to the
  standard commands of the stack`), which rewrites the whole of that section. This task
  removes the script from `package.json`; it does not touch the specification document
  that used to name it.
- **`src/core/bootstrap-demo.ts` and `src/main.ts` — FIX-51.** The `prepareMocks` →
  `startMocks` rename lives there. This task does not open either file.
- **`tests/setup-msw.ts`.** Part 1 deliberately does not wire anything into it, and its
  Angular JIT resource-drain block at `:57-130` is **FIX-04's** subject. Do not edit either
  half of that file.
- **The rest of the source-text tests in `tests/contract/operation-matrix.spec.ts` and
  elsewhere — FIX-07.** Delete only the one whose subject this task removes (Part 1).
- **The coverage classification of `src/mocks/**` — FIX-08.** Deleting `node.ts` removes a
  file `coverage/unit/coverage-final.json` reports at 0/20 statements; that is a happy side
  effect, not this task's business. Name the deletion in the commit body so FIX-08 inherits
  an accurate file list.
- **`src/mocks/browser.ts`.** Live code on the real boot path.
- **`angular.json`'s `coverageThresholds`.** FIX-08's subject; this task's new
  `describe('package.json contract — api:generate is declared (T04 wiring)', …)` block runs
  under the same `ng test` target FIX-08 configures, but
  this task does not touch that configuration.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

1. `ls scripts/validate-contract.mjs scripts/validate-contract.spec.mjs scripts/check-operation-parity.mjs`
   — each must print `No such file or directory`.
2. `npx vitest run tests/contract/schema.spec.ts tests/contract/operation-matrix.spec.ts` —
   must exit `0`. Paste the full output into the commit body; it must list a passing case
   whose name contains `api:generate is declared`.
3. `grep -c "api:generate is declared" tests/contract/schema.spec.ts` — must print at least `1`.
4. `node -e "const v=Object.values(require('./package.json').scripts); console.log(v.includes('node scripts/validate-contract.mjs'), v.includes('node scripts/validate-contract.mjs && node scripts/api-drift.mjs'))"`
   — must print `false false`. This checks the two deleted script entries by the exact
   command they used to run, since neither survives under any name.
5. `node -e "const d=require('./package.json').devDependencies; console.log(d['js-yaml'], d['ajv'], d['ajv-formats'], d['@apidevtools/json-schema-ref-parser'], 'istanbul-lib-coverage' in d)"`
   — must print `4.3.2 8.20.0 3.0.1 14.2.1 false`.
6. `npm ls js-yaml ajv ajv-formats @apidevtools/json-schema-ref-parser` — each of the four
   must print a resolved version with no `npm error` line.
7. `grep -rn "createNodeServer\|mocks/node" src tests e2e scripts` — must return nothing.
   Hits under `docs/` are expected and are specification.
8. `grep -rln "validate-contract.mjs\|check-operation-parity.mjs" docs/tasks/T03.md docs/tasks/T26.md docs/tasks/tasks.json docs/index.html tests/contract/response-validation.ts`
   — must return nothing.
9. `npm run build` — must exit `0`. Green at the `db6d295` baseline.

Gates that are red for reasons this task does not fix, so the executor does not chase them:
`npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage
thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run
`npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked
files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-13-AC01** `scripts/validate-contract.mjs`, `scripts/validate-contract.spec.mjs`
      and `scripts/check-operation-parity.mjs` do not exist. Check with
      `ls scripts/validate-contract.mjs scripts/validate-contract.spec.mjs scripts/check-operation-parity.mjs`,
      which must print `No such file or directory` three times.
- [ ] **FIX-13-AC02** `src/mocks/node.ts` does not exist, and
      `grep -rn "createNodeServer" src tests e2e scripts` returns nothing.
- [ ] **FIX-13-AC03** `npx vitest run tests/contract/operation-matrix.spec.ts` exits `0`,
      and that file contains no `readFile` of any path under `src/mocks/`. Check with
      `grep -cE "readFile\(.*src/mocks" tests/contract/operation-matrix.spec.ts`, which
      must print `0` (and exits 1 on a zero count — read the printed number, not the
      exit code); at the baseline it printed `2`. Then check that the **imports were not
      collateral damage**: `grep -c "src/mocks" tests/contract/operation-matrix.spec.ts`
      must print `8`, which is the eight `import` lines at `:37`, `:38`, `:44` and
      `:49-53` that Part 1 explicitly keeps. It must **not** print `0`: `grep -c` counts
      lines and those eight name `src/mocks` paths in live imports, so a `0` here means
      the executor deleted the suite's imports, which is the one way to get this file
      wrong.
- [ ] **FIX-13-AC04** `npx vitest run tests/contract/schema.spec.ts` exits `0` and its output
      includes a passing case whose name contains `api:generate is declared`; check with
      `npx vitest run tests/contract/schema.spec.ts 2>&1 | grep -c "api:generate is declared"`,
      which must print at least `1`.
- [ ] **FIX-13-AC04b** `docs/tasks/T03.md:44`'s third clause is still enforced after the
      deletion. `npx vitest run tests/contract/schema.spec.ts -t "schema-level example"`
      exits `0` and reports exactly one passing case, and its `checked` assertion proves
      the loop ran over at least one example. Record the command and its output. Record
      in the commit body that the operation media-type half of the deleted
      `assertExamplesValidate` is deliberately not carried over, with the measurement
      that justifies it (`grep -c "example:" docs/api/openapi.yaml` prints `0`).
- [ ] **FIX-13-AC05** The new `package.json contract — api:generate is declared (T04
      wiring)` describe block is proven to discriminate, not merely to pass.
      `npx vitest run tests/contract/schema.spec.ts -t "package.json contract"` exits `0`
      and reports **two** passing cases: the positive one against the real
      `package.json`, and `the check fails when the script is renamed or absent`, whose
      three assertions cover a renamed key, an empty `scripts` object and an absent one.
      Record the command and its output. **No key in `package.json` is renamed to
      demonstrate this**: the negative arm is a case, so the file this commit is already
      rewriting is never left in a hand-restored state, and the proof survives into every
      later run instead of living only in this commit body.
- [ ] **FIX-13-AC06** `package.json`'s `scripts` object contains neither of the two deleted
      validator entries. Check with
      `node -e "const v=Object.values(require('./package.json').scripts); console.log(v.includes('node scripts/validate-contract.mjs'), v.includes('node scripts/validate-contract.mjs && node scripts/api-drift.mjs'))"`,
      which must print `false false`. If FIX-47' had already removed both entries before this
      task executed, this criterion still passes; record in the commit body which task
      removed them first.
- [ ] **FIX-13-AC07** `package.json`'s `devDependencies` declares exactly
      `"js-yaml": "4.3.2"`, `"ajv": "8.20.0"`, `"ajv-formats": "3.0.1"` and
      `"@apidevtools/json-schema-ref-parser": "14.2.1"`, and does **not** declare
      `istanbul-lib-coverage`. Check with
      `node -e "const d=require('./package.json').devDependencies; console.log(d['js-yaml'], d['ajv'], d['ajv-formats'], d['@apidevtools/json-schema-ref-parser'], 'istanbul-lib-coverage' in d)"`,
      which must print `4.3.2 8.20.0 3.0.1 14.2.1 false`. `npm install` was run afterward and
      `npm ls js-yaml ajv ajv-formats @apidevtools/json-schema-ref-parser` prints a resolved
      version for all four with no `npm error` line.
- [ ] **FIX-13-AC08** `docs/tasks/T03.md`, `docs/tasks/T26.md`, `docs/tasks/tasks.json` and
      `docs/index.html` no longer name `scripts/validate-contract.mjs` or
      `scripts/check-operation-parity.mjs`. Check with
      `grep -rln "validate-contract.mjs\|check-operation-parity.mjs" docs/tasks/T03.md docs/tasks/T26.md docs/tasks/tasks.json docs/index.html`,
      which must return nothing. `docs/tasks/tasks.json` remains valid JSON: check with
      `node -e "JSON.parse(require('fs').readFileSync('docs/tasks/tasks.json','utf8'))"`,
      which must exit `0` with no output.
- [ ] **FIX-13-AC09** `tests/contract/response-validation.ts` no longer names
      `scripts/check-operation-parity.mjs`; check with
      `grep -c "check-operation-parity" tests/contract/response-validation.ts`, which must
      print `0`. `git diff -- tests/contract/response-validation.ts` shows changes confined
      to lines 1-5.
- [ ] **FIX-13-AC10** `npm run build` exits `0`, unchanged from the `db6d295` baseline.
      `npm run test` exits with the outcome recorded per this clause: **FIX-04** owns
      `ng test`'s baseline failure of 14 of 14 files; if it has not landed, record that
      verbatim and run this task's own specs with
      `npx vitest run tests/contract/schema.spec.ts tests/contract/operation-matrix.spec.ts`
      instead, which must exit `0`.
- [ ] **FIX-13-AC11** `git diff --name-only` for the **Commit 1** commit lists
      `src/mocks/node.ts` (deleted), `src/mocks/create-handlers.ts` and
      `tests/contract/operation-matrix.spec.ts`, and nothing else; for the **Commit 2**
      commit it lists the three deleted files under `scripts/`,
      `tests/contract/schema.spec.ts`, `tests/contract/response-validation.ts`,
      `package.json`, `package-lock.json`, `docs/tasks/T03.md`, `docs/tasks/T26.md`,
      `docs/tasks/tasks.json` and `docs/index.html`, and nothing else. Neither commit
      lists any file under `src/app/`.
- [ ] **FIX-13-AC12** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change deletes two Node-only validation scripts and
      one unreferenced Node module, moves their assertions into a vitest suite, and declares
      four dev dependencies; no rendered surface is reachable from any of it, and
      `npm run build` exiting `0` is what proves the application still compiles. That is the
      exemption `.claude/rules/browser-verification.md` grants to a build/test-infrastructure
      change, and per that rule it is stated explicitly rather than left out silently.
- [ ] **FIX-13-AC13** Design rules recorded in the commit body. **R26 applicable and met**:
      the commit body names every file changed, every command run with its exit code, and the
      remaining limitation that `docs/tasks/T05.md:20` still lists `src/mocks/node.ts` as an
      owned file that the repository will no longer have — an open specification line handed
      to **FIX-39**, not closed here. The same packet's `startMocks(): Promise<void>`
      interface at `:29` is **not** a remaining limitation of this task: **FIX-51** closes it
      under decision **D10**, and the commit body says whether FIX-51 had already landed.
      **R01–R25 are N/A: this task deletes and rewrites Node-only test/tooling code and
      renders nothing a person can see.** Skill provenance is stated once in
      `docs/fix/README.md` section 3, "Every task records the design rules": the installed
      path, the version, and the fact that `docs/mi-bolt/execution/skill-location.json`
      does not exist yet (**FIX-38** owns it). Cite it from there; do not restate it here.
- [ ] **FIX-13-AC14** `grep -c 'fail CI' docs/tasks/T26.md docs/tasks/tasks.json` prints
      `0` for each file, `grep -ci 'fail ci' docs/index.html` prints `0`, and
      `grep -c 'fail the contract suite' docs/tasks/T26.md docs/tasks/tasks.json` prints
      `1` for each while `grep -ci 'fail the contract suite' docs/index.html` prints `3`.
      The three `docs/index.html` hits are the `<li>`, the `<div class="criterion">` span
      and the lower-cased `data-search` entry; name all three in the commit body.

## Commit

**This task is two commits, the same exception the package's own README already grants
FIX-51: one file, two subjects that share no line of code.** Do not bundle either commit with
FIX-10, FIX-11, FIX-12 or any other FIX task. Commit only after every acceptance criterion
above passes for the part(s) that commit carries.

**Commit 1 — Part 1 only.** Files: the deletion of `src/mocks/node.ts`, the header-comment
edit to `src/mocks/create-handlers.ts:12-15`, and the one-`it`-block edit to
`tests/contract/operation-matrix.spec.ts` (`:379-384`), and its `readFile`/`resolve`
imports only if Part 1's own check says they are unused. Verified by FIX-13-AC02 and
FIX-13-AC03.

```text
chore: delete the unreferenced createNodeServer mock module
```

**Commit 2 — Parts 2 and 3.** Files: the deletion of `scripts/validate-contract.mjs`,
`scripts/validate-contract.spec.mjs` and `scripts/check-operation-parity.mjs`; the edits to
`tests/contract/schema.spec.ts`, `tests/contract/response-validation.ts`, `package.json` and
`package-lock.json`; the edits to `docs/tasks/T03.md`, `docs/tasks/T26.md`,
`docs/tasks/tasks.json` and `docs/index.html`. Verified by FIX-13-AC01, FIX-13-AC04
through FIX-13-AC09, and FIX-13-AC14.

```text
chore: delete the redundant OpenAPI validator and operation-parity scripts; declare their vitest suite's transitive dependencies
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**Part 1 (Commit 1)** has no hard ordering dependency; it may land at any point.

**Parts 2 and 3 (Commit 2)** edit `package.json`, which several sibling tasks also edit
(`FIX-03` adds `format`/`format:check`; `FIX-05` adds the `engines` field; `FIX-47'` reduces
the `scripts` object to the eleven D19 survivors). `package.json` is a single file: this
commit and any of those must land one at a time, never concurrently. If `FIX-47'` lands
**before** this task, the two script entries this task deletes (`package.json:11` and
`:14`) are already gone from `package.json` — FIX-13-AC06 above says how to read that as a
pass rather than a failure. If this task lands **before** `FIX-47'`, `FIX-47'`'s executor
finds the two entries already absent and does not need to remove them again.

FIX-04 also edits `tests/setup-msw.ts` and FIX-11 also edits a script that was part of the
composite entry this task deletes (`scripts/api-drift.mjs`); this task touches neither
file, so they may land in any order relative to it. FIX-08 should land **after** this one,
so that the deleted
`src/mocks/node.ts` is already gone when the coverage classification for `src/mocks/**` is
turned on.
