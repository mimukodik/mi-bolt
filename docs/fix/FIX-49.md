# FIX-49 — Build `resolveAssetUrl` and complete the asset manifest

Status: PLANNED — not executed.
Severity: major
Source: A7 F11 (release and traceability sweep), A2 (mock and fixture sweep), `docs/spec/architecture.md:159`. Recorded as unowned in `FIX-40` and `FIX-36`; this task is its owner.

## What decision D14 changed in this file, and what it did not

This task was first written with two reasons for building `resolveAssetUrl`: so
assets would resolve under a `/mi-bolt/` sub-path deployment, and so one boundary
would enforce the "no untrusted remote image fetch" rule. **The user then dropped the
sub-path: "es base href-et torroljuk, nem kell" ("and let's delete the base href, we
don't need it"), which is decision D14.** The first reason is gone with it.

**The second reason is untouched, and it is why this task still exists.**
`docs/spec/architecture.md:159` is a specification line and **D1** still makes it
binding: it names a file, a signature and a consumer, none of which the repository
has, and the rules it states — only a normalised logical `/assets/` path is accepted,
no `..`, no encoded traversal, no protocol-relative input, no absolute URL, reject
anything resolving outside the assets prefix — are about what may reach an `<img src>`
and have nothing to do with where the application is mounted. Every one of them still
has to be implemented.

What has gone out of this file with D14:

- **Evidence item 4's three measurements** of why a `/mi-bolt/` deployment could not be
  produced. There is no such deployment to produce, so there is nothing to bound. Item 4
  now carries the one fact from that area this task still depends on — that the helper
  resolves against `document.baseURI`, which needs `<base href="/">` to be the origin
  root — and it is a dependency on **FIX-54**, not a blocker this task records.
- **The old FIX-49-AC05**, which required the executor to record that "T28-AC02's
  `/mi-bolt/` half is still unmet". After **FIX-54** there is no `/mi-bolt/` half of
  T28-AC02 to be unmet. **AC05 is now a check that FIX-54's removal is the reason**,
  rather than a record of a blocker.
- **The framing of the `/mi-bolt/` unit-test rows.** They stay, because
  `architecture.md:159` asks for them in as many words and because a base URI that is
  not the origin root is what proves the "strip the leading slash and resolve against
  `document.baseURI`" rule. They are now a test of the helper's algorithm and nothing
  more; they are not evidence for a deployment.

**`FIX-54` owns decision D14** — the removal of the sub-path machinery itself, and
whatever is to happen to the `/mi-bolt/` clause inside `architecture.md:159` and to
`docs/tasks/T28.md:43`. This task touches none of it and makes no assumption about
what `FIX-54` does to those two lines. Read `docs/fix/FIX-54.md` before starting.

## Why this is wrong

Two things the specification names by path do not exist.

`docs/spec/architecture.md:159` mandates a shared helper at an exact path, with an
exact signature, and names `ProductImage` as its consumer. The file is not in the
repository, `ProductImage` binds the wire model's raw `src` string straight into
`<img src>`, and the fixture layer hardcodes absolute `/assets/` paths. Under **D1**
the specification is right and the code is wrong. The practical consequence is that
nothing in the application enforces the "no untrusted remote image fetch" rule the
same spec line states: a wire model whose `src` were an absolute URL to another host
would be bound straight into `<img src>` and fetched.

`docs/design/asset-manifest.json` is the provenance register that
`docs/design/assets/README.md` and `docs/design/README.md` both point readers at. It
lists the four WebP illustrations and omits the four SVG sources that sit beside
them, although `docs/design/README.md`'s last paragraph documents their existence and
`docs/design/assets/README.md` says in as many words to "Keep SVG sources here for
provenance." A provenance register that omits half of what it is the register for is
the defect; design rule **R14** — numerical and material claims come from an approved
source — is the rule behind it.

## Evidence

### 1. The helper the architecture mandates

`docs/spec/architecture.md:159`, quoted in full:

> ProductImage uses `resolveAssetUrl(path: string, documentBaseUri: string): string`
> from `src/app/shared/media/resolve-asset-url.ts`. Only a normalized logical
> `/assets/` path with no `..`, encoded traversal, protocol-relative or absolute-URL
> input is accepted. Strip the leading slash and resolve against `document.baseURI`;
> reject any resulting URL outside the configured same-origin base assets prefix.
> Test `/` and `/mi-bolt/` deployments and malformed paths. No untrusted remote image
> fetch is allowed.

`docs/design/assets/README.md` repeats the same contract, character for character on
the signature, so two specification documents agree.

It does not exist:

```
$ find src -iname "*resolve-asset-url*"
$ grep -rln "resolveAssetUrl" src/
$ echo $?
1
```

Neither command produces output, and `src/app/shared/` contains only `shell/` and
`ui/` — there is no `media/` directory.

### 2. `ProductImage` binds the raw wire value

`src/app/shared/ui/product-image/product-image.html:12-23`:

```html
    @case ('loaded') {
      <img
        class="photo absolute inset-0 w-full h-full object-contain block"
        [src]="image().src"
        [alt]="image().alt"
```

`src/app/shared/ui/product-image/product-image.ts:39-61` injects nothing and has no
notion of a base URI:

```ts
export class ProductImage {
  readonly image = input.required<ImageLike>();
  readonly productName = input.required<string>();
  readonly aspectRatio = input<string>('4 / 3');

  readonly loadFailed = output<void>();

  private readonly failed = signal(false);
  readonly status = computed<'loading' | 'loaded' | 'error'>(() =>
    this.failed() ? 'error' : 'loaded',
  );
```

### 3. The values it receives are origin-root absolute

`src/mocks/cart/cart.handlers.ts:46-53`:

```ts
    images: [
      {
        id: 'demo-one-5g-graphite-256-front',
        src: '/assets/products/graphite-front.webp',
        alt: 'Demo One 5G, Grafit, 256 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
```

A leading `/` makes the browser resolve against the origin, ignoring any `<base>`
element, which is exactly what `architecture.md:159`'s "strip the leading slash and
resolve against `document.baseURI`" exists to prevent.

### 4. The sub-path deployment is gone, and it is not this task's

An earlier version of this section measured three reasons a `/mi-bolt/` deployment
could not be built or served, in order to bound what this task could prove about
**T28-AC02** (`docs/tasks/T28.md:43`). Decision **D14** removed the requirement
instead of the blockers, so the bound has nothing left to bound. **`FIX-54` owns the
removal** — the conditional `APP_BASE_HREF` provider, the `/mi-bolt/` half of
T28-AC02, and every consequence of dropping the sub-path.

What this task still needs from that area is one fact, and it is about the `<base>`
element rather than about a sub-path. `architecture.md:159` makes the helper resolve
against `document.baseURI`, and `document.baseURI` is **not** the origin root by
default:

> "By default, the base URL is the location of the document (as determined by
> `window.location`). If it is an HTML Document and there is a `<base>` element in the
> document, the `href` value of the *first* `<base>` element with such an attribute is
> used instead."
>
> — MDN, `Node.baseURI`
> (https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI, read 2026-09-17)

So with `<base href="/">` present at `src/index.html:6`, a deep link such as
`/telefonok/demo-one-5g` gives `baseURI` of `<origin>/` and
`/assets/products/graphite-front.webp` resolves to
`<origin>/assets/products/graphite-front.webp`. **With that element removed**, the
same deep link gives a `baseURI` of `<origin>/telefonok/demo-one-5g` and the same
asset resolves to `<origin>/telefonok/assets/products/graphite-front.webp`, which does
not exist. **This task therefore depends on `<base href="/">` staying in the
document**, and `FIX-54` is where that is decided: D14's own record keeps the tag and
removes only the sub-path machinery, and gives the executor a browser criterion that
loads a deep link and checks the favicon request path, which is the same failure in
another guise.

**Read `docs/fix/FIX-54.md` before starting, and if the `<base>` element has been
removed, stop and report rather than working around it here.** A helper that silently
resolves assets against the current route is worse than no helper. Beyond that one
dependency this task consults no environment, no provider and no build configuration,
and it must not reach into any of those files itself. See "Out of scope".

### 5. The manifest omits the four SVG sources

`docs/design/asset-manifest.json` contains four objects, one per WebP. Beside them on
disk:

```
$ ls -1 docs/design/assets/products/
graphite-back.svg
graphite-back.webp
graphite-front.svg
graphite-front.webp
silver-back.svg
silver-back.webp
silver-front.svg
silver-front.webp
```

`docs/design/assets/README.md`, second paragraph:

> At implementation, copy `products/*.webp` to `public/assets/products/`. **Keep SVG
> sources here for provenance.**

and `docs/design/README.md`'s last paragraph:

> Az `assets/products/` négy eredeti, fiktív készülékillusztráció WebP-változatát és
> szerkeszthető SVG-forrását tartalmazza. […] a [forrásjegyzék](asset-manifest.json)
> és [asset-szabályok](assets/README.md) megtartásával.

("The `assets/products/` folder contains the WebP versions and the editable SVG
sources of four original, fictional device illustrations […] keeping the
[source register](asset-manifest.json) and the [asset rules](assets/README.md).")

The register is named as the place provenance lives, and half the material is absent
from it. `FIX-36`'s out-of-scope section records the gap and deliberately leaves the
file at four entries; this task is its owner.

Each SVG declares the same dimensions as its WebP:

```
$ head -c 90 docs/design/assets/products/graphite-front.svg
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 320 400">
```

and `graphite-back.svg`, `silver-front.svg` and `silver-back.svg` each declare
`width="320" height="400"` as well, so no dimension in the new entries is invented.

Nothing reads `asset-manifest.json` programmatically — `grep -rn "asset-manifest"
scripts/ src/ tests/ e2e/` returns no hits — so adding entries breaks no validator.

## What to change

### 1. Create `src/app/shared/media/resolve-asset-url.ts`

The signature is fixed by `architecture.md:159` and may not be changed:
`resolveAssetUrl(path: string, documentBaseUri: string): string`. Implement exactly
the rules that line states, and no others.

```ts
/**
 * Resolve a logical `/assets/…` path against the deployment's base URI.
 *
 * `docs/spec/architecture.md:159` fixes this contract: only a normalised
 * logical `/assets/` path is accepted, the leading slash is stripped, the
 * remainder is resolved against `document.baseURI`, and any result that
 * escapes the deployment's own `assets/` prefix is rejected. The rule
 * exists so that no untrusted remote URL can reach an `<img src>`: every
 * asset URL the application renders passes through here first.
 */
export class AssetUrlError extends Error {}

const LOGICAL_PREFIX = '/assets/';

export function resolveAssetUrl(path: string, documentBaseUri: string): string {
  // Rejects an absolute URL, a protocol-relative `//host/…`, a relative
  // path and any prefix other than `/assets/` in one condition: none of
  // them starts with `/assets/`.
  if (!path.startsWith(LOGICAL_PREFIX)) {
    throw new AssetUrlError(`asset path must start with ${LOGICAL_PREFIX}: ${path}`);
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new AssetUrlError(`asset path is not valid percent-encoding: ${path}`);
  }
  if (decoded !== path) {
    throw new AssetUrlError(`asset path must be unencoded: ${path}`);
  }

  const base = new URL(documentBaseUri);
  const resolved = new URL(path.slice(1), base);
  const allowedPrefix = new URL('assets/', base).pathname;
  if (!resolved.pathname.startsWith(allowedPrefix)) {
    throw new AssetUrlError(`asset URL left ${allowedPrefix}: ${resolved.href}`);
  }
  return resolved.href;
}
```

Five decisions in that code, each with its reason. **The behaviour of the last two
was measured before this task was written**, with `node -e` against the same inputs
the test table below uses; the results are quoted under item 4.

- **It throws rather than returning a sentinel**, because `architecture.md:159` fixes
  the return type as `string` and "reject" cannot be expressed in a `string`. The one
  consumer catches; see item 2.
- **A custom `AssetUrlError`** so a consumer can distinguish a rejected path from an
  unrelated `TypeError` thrown by `new URL`. `.claude/rules/code-standards.md`
  requires a type guard where none exists; `instanceof AssetUrlError` is the guard.
- **`decoded !== path` rejects every percent-encoded path, not only encoded
  traversal.** That is stricter than `architecture.md:159`'s wording and is
  deliberate: a blocklist of encodings is the shape that gets bypassed, and none of
  the asset filenames in this repository contains a character that needs encoding —
  `ls docs/design/assets/products/` and `ls public/assets/` show eight and five
  lowercase hyphenated names. Record that in the commit body, because a future asset
  with a space in its name would be rejected by this rule.
- **`new URL(path.slice(1), base)`** is literally "strip the leading slash and
  resolve against `document.baseURI`". Do not use string concatenation; it produces a
  different answer when `documentBaseUri` lacks a trailing slash.
- **Traversal is caught by the resolved prefix check, not by a `..` string search.**
  Measured: `new URL('assets/../../etc/passwd', 'https://example.test/mi-bolt/')` is
  `https://example.test/etc/passwd`, whose pathname does not start with the allowed
  `/mi-bolt/assets/`, so it is rejected; the same input against
  `https://example.test/` resolves to `/etc/passwd` and is rejected against
  `/assets/`. This is the check that does the work, and it catches `./../`,
  `%2e%2e` (which `decodeURIComponent` turns into `..`, so the encoding rule catches
  it first) and every other spelling, which a substring search would not. **Do not
  add a separate `path.includes('..')` guard and do not add a same-origin check**: a
  relative reference resolved against a base can never change origin, so such a check
  could never fire, and `.claude/CLAUDE.md` ("Simplicity first") forbids error
  handling for impossible scenarios.

Use no `as` and no `any` (`.claude/rules/code-standards.md`).

### 2. Wire it into `ProductImage`

`src/app/shared/ui/product-image/product-image.ts` — inject the document, resolve the
source, and fold a rejection into the component's **existing** error state rather
than inventing a new one:

```ts
  private readonly doc = inject(DOCUMENT);

  /** Resolution result: the deployment-resolved image URL, or null when
   *  `resolveAssetUrl` rejected the wire value. A rejection renders the
   *  same neutral fallback as a failed network load; it never renders a
   *  broken `<img>`. */
  private readonly resolution = computed<string | null>(() => {
    try {
      return resolveAssetUrl(this.image().src, this.doc.baseURI);
    } catch (error) {
      if (error instanceof AssetUrlError) return null;
      throw error;
    }
  });

  readonly status = computed<'loading' | 'loaded' | 'error'>(() =>
    this.failed() || this.resolution() === null ? 'error' : 'loaded',
  );

  /** Non-null view of `resolution()`, and the only member the template
   *  reads. `status()` is `'loaded'` only when `resolution()` is non-null
   *  and the `@case ('loaded')` branch is its only reader, so the
   *  empty-string arm never reaches the DOM.
   *
   *  The type is `string` and not `string | null` on purpose. `[src]` on a
   *  native `<img>` is a DOM property binding, which Angular does not
   *  type-check even under `strictTemplates`
   *  (`@angular/compiler-cli` sets `checkTypeOfDomBindings: false` in both
   *  branches of `getTypeCheckingConfig()`), so a nullable value would
   *  compile there — but `FIX-59` rebinds this element to
   *  `NgOptimizedImage`, whose `ngSrc` is a directive input declared
   *  `string` with `ngAcceptInputType_ngSrc: string | SafeValue`, and
   *  directive inputs ARE checked, with `strictNullInputBindings` on. */
  readonly resolvedSrc = computed<string>(() => this.resolution() ?? '');
```

`DOCUMENT` comes from `@angular/common`. The `throw error` on the non-`AssetUrlError`
branch is deliberate: swallowing an unexpected error here would hide a real bug
behind a placeholder image.

**`src/app/shared/ui/product-image/product-image.html` — bind the resolved value, and
which attribute you edit depends on whether `FIX-59` has landed.** Check first:

```bash
grep -n "ngSrc\|\[src\]" src/app/shared/ui/product-image/product-image.html
```

- **`[src]="image().src"` at `:15` (FIX-59 has not landed).** Replace the expression
  only:

```html
        [src]="resolvedSrc()"
```

- **`[ngSrc]="image().src"` (FIX-59 has landed).** Replace the expression only:

```html
        [ngSrc]="resolvedSrc()"
```

Change nothing else on that element in either branch, and record in the commit body
which branch was taken.

Why `resolvedSrc` is typed `string` rather than `string | null`: the `@case ('loaded')`
branch only renders when `status()` is `'loaded'`, which the computed above guarantees
means the resolution succeeded, so the empty-string arm is unreachable at render time.
It is spelled non-nullable anyway because the second branch above binds a **directive**
input rather than a DOM property, and `NgOptimizedImage.ngSrc` is declared `string`
(`node_modules/@angular/common/types/common.d.ts:1211`, and
`static ngAcceptInputType_ngSrc: string | i0.ɵSafeValue;` at `:1324`), which
`strictTemplates` does check. A `string | null` expression there fails the build, and
`.claude/rules/code-standards.md` leaves no `as`/`!` escape.

Change nothing else in the component: `onError()`, `loadFailed`, `initial()`, the
`alt`, the width/height attributes and the three `data-testid`s all stay.

### 3. Leave `src/mocks/` alone

`cart.handlers.ts:49` and every other fixture keep their logical `/assets/…` values.
That is the input format `architecture.md:159` specifies — "a normalized logical
`/assets/` path" — so the fixtures are already correct and the helper is what
translates them. Do not rewrite a fixture to a relative path.

### 4. Tests — `tests/resolve-asset-url.spec.ts`

Put it in `tests/` for the reason **FIX-31** states and **FIX-06** owns:
`vitest.config.ts:506` sets `include: ['tests/**/*.spec.ts']`, and `npm run test` is
red at baseline (**FIX-04**).

`architecture.md:159` names the malformed-path cases outright, and the helper takes the
base URI as a parameter, so any base URI is testable here regardless of what the
project deploys.

**Keep the rows whose base URI is not the origin root, and read them for what they
are.** They do not stand for a deployment: decision **D14** dropped the `/mi-bolt/` one
and **`FIX-54`** removes the clause in `architecture.md:159` that asked for it, so
depending on when this task runs, that line may or may not still name two deployments.
The rows are kept either way, and not because a spec line asks for them. They prove the
algorithm — that the leading slash is stripped and the remainder resolved against
`document.baseURI` rather than concatenated onto the origin — and a root-only table
cannot tell that implementation apart from plain string concatenation, which is the one
thing "What to change" item 1 tells the executor not to write. Removing them would leave
the helper's only interesting branch untested. `https://example.test/mi-bolt/` is
retained as the literal in those rows purely because the measurements below were taken
with it; any non-root base URI would do.

The expected values in the accepted table below are **measured results, not
predictions**. They were produced before this task was written by running the
algorithm's two lines directly:

```bash
node -e "const b=new URL('https://example.test/mi-bolt/'); const r=new URL('/assets/products/graphite-front.webp'.slice(1), b); console.log(r.href, '| allowed', new URL('assets/', b).pathname, '| ok', r.pathname.startsWith(new URL('assets/', b).pathname))"
```

which printed
`https://example.test/mi-bolt/assets/products/graphite-front.webp | allowed /mi-bolt/assets/ | ok true`.
Re-run it for each row rather than trusting the table.

Accepted:

| `path` | `documentBaseUri` | expected |
|---|---|---|
| `/assets/products/graphite-front.webp` | `https://example.test/` | `https://example.test/assets/products/graphite-front.webp` |
| `/assets/products/graphite-front.webp` | `https://example.test/mi-bolt/` | `https://example.test/mi-bolt/assets/products/graphite-front.webp` |
| `/assets/placeholder.svg` | `https://example.test/mi-bolt/` | `https://example.test/mi-bolt/assets/placeholder.svg` |

Rejected — each must throw `AssetUrlError`, asserted by type and not by message:

`/assets/../../etc/passwd`, `/assets/%2e%2e/%2e%2e/etc/passwd`,
`//evil.example/assets/x.webp`, `https://evil.example/assets/x.webp`,
`assets/products/x.webp` (no leading slash), `/public/x.webp` (wrong prefix),
`/assets/products/x%2Ewebp` (encoded, so `decoded !== path`), and the empty string.

Add to `tests/product-image.spec.ts`, or create it if absent, two rendered cases:

- with a base URI of `https://example.test/mi-bolt/` and a wire `src` of
  `/assets/products/graphite-front.webp`, the rendered `<img>`'s `src` attribute ends
  with `/mi-bolt/assets/products/graphite-front.webp`;
- with a wire `src` of `https://evil.example/x.webp`, no `<img>` renders and
  `[data-testid="image-fallback"]` does. Both arms of the `status()` branch need a
  case (`.claude/rules/code-standards.md`).

Override `DOCUMENT` in the TestBed to control `baseURI`; do not mutate the real
document.

### 5. `docs/design/asset-manifest.json` — add the four SVG entries

Append four objects in the same shape and the same order as the existing four, so the
file reads graphite-front, graphite-back, silver-front, silver-back for each format.
Every field is taken from the file itself, the sibling entries, or the SVG's own
header — none is invented:

```json
  {
    "path": "docs/design/assets/products/graphite-front.svg",
    "source": "Editable vector source of the original unbranded geometric illustration created for this design plan",
    "view": "front",
    "color": "graphite",
    "commercialClaim": "None: fictional demo illustration, not a verified real device",
    "dimensions": [
      320,
      400
    ]
  },
```

and the same for `graphite-back.svg` (`"view": "back"`), `silver-front.svg`
(`"color": "silver"`, `"view": "front"`) and `silver-back.svg` (`"color": "silver"`,
`"view": "back"`). All four SVGs declare `width="320" height="400"`.

**Ordering against `FIX-36`.** That task rewrites the four existing `path` values
from `docs/mi-bolt/design/assets/products/*.webp` to
`docs/design/assets/products/*.webp` under decision **D2**. Both tasks edit this one
file. Run this task **after** `FIX-36`, so the eight entries end up with one path
convention. If `FIX-36` has not landed, write the four new `path` values in the
**real, flat** form shown above anyway — **D2** settles that the flat layout is
correct — and record in the commit body that the file temporarily holds two
conventions and that `FIX-36` closes it.

### 6. `docs/spec/architecture.md` and `docs/design/*.md` — no change

Under **D1** no task may edit a spec document to match the implementation. The two
documents that describe `resolveAssetUrl` are the requirement this task implements.
That includes the `/mi-bolt/` clause inside `architecture.md:159`: decision **D14**
dropped the deployment, and what becomes of the sentence that mentions it is
**`FIX-54`**'s, not this task's. Do not edit that line for any reason.

## Out of scope

- **Everything decision D14 removes — `FIX-54`.** The conditional `APP_BASE_HREF`
  provider in `src/app/app.config.ts`, the `<base>` element in `src/index.html`,
  `scripts/serve-static.mjs`, `docs/tasks/T28.md:43` and `src/app/app.spec.ts:99` are
  all that task's, and this one opens none of them. Evidence item 4 says what this
  task depends on from that direction — `<base href="/">` staying in the document —
  and what to do if it has gone, which is to stop and report rather than to
  compensate here.
- **T28-AC02.** An earlier version of this task carried an acceptance criterion whose
  job was to stop `FIX-40` recording that criterion as met, because building
  `resolveAssetUrl` did not close its `/mi-bolt/` half. **D14 removed the half**, so
  there is nothing left for this task to withhold. Do not write anything about
  T28-AC02's status into this commit: **`FIX-40`** records it, against whatever
  `FIX-54` left of it.
- **`FIX-40` itself.** Its out-of-scope section says "Do not build `resolveAssetUrl`
  … report it to the orchestrator as unowned work". After this task it is owned here.
  Do not edit `docs/mi-bolt/execution/deployment.md`; that file is `FIX-40`'s.
- **`FIX-36`'s four `path` corrections** in the same JSON file, and everything else
  under **D2** — `docs/README.md`, `docs/index.html`, the `VEGREHAJTASI-PROMPT.hu.md`
  references. This task adds four entries and changes none of the existing four.
- **`src/mocks/` and the fixtures.** Their logical `/assets/` paths are the specified
  input format. Leave them.
- **`public/assets/`.** The four WebP files are already copied there; this task moves
  and adds no binary asset.
- **Every other consumer of an asset path.** `grep -rn '"/assets/' src/` before you
  start and record the list: if a component other than `ProductImage` binds an asset
  path into the DOM, that is a finding to report, not a second wiring to do here.
  `architecture.md:159` names `ProductImage` and only `ProductImage`.
- **`ProductImage`'s signature against `docs/spec/components.md:131-143`.** Any drift
  there is **`FIX-50`**'s class of work. This task adds one computed and one
  injection and changes no input or output.
- **The `mockServiceWorker.js` path and any other non-`/assets/` URL.** The helper
  covers the `/assets/` prefix the spec names and nothing else.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

```bash
npm run build                                    # expected exit 0
npx vitest run tests/resolve-asset-url.spec.ts   # expected exit 0
npx vitest run tests/product-image.spec.ts       # expected exit 0
npm run test                                     # record the exit code; a failure attributable
                                                  # to FIX-04 does not fail this task, but the
                                                  # two spec files above must pass
node -e "JSON.parse(require('fs').readFileSync('docs/design/asset-manifest.json','utf8')).forEach(e=>console.log(e.path))"
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

The `node -e` line prints one path per entry and must print eight. It also fails
loudly if the JSON is malformed, which is the cheapest check on item 5.

Then the browser checks below. They cover the deployment this project has, which after
decision **D14** is the only one: served at the origin root. The helper's behaviour
against a base URI that is **not** the origin root is proved in the unit test and by
evaluating the helper with an explicit base URI, because no deployment exercises it;
FIX-49-AC04 says how. That is a test of the resolution rule, not a claim about a
deployment.

Stop the dev server when finished.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright suite: it rewrites 49
tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R10 and R11 apply**: every product image must still render at its declared
  aspect ratio with its live `alt`, and a rejected path must fall back to the neutral
  named placeholder rather than to another device's photo. AC02 and AC03 measure
  both.
- **R14 applies to both halves**: images come from the approved local source, and the
  manifest becomes the complete register of what that source is. AC06 checks the
  entry count.
- **R19 applies**: the rejected-path case renders the component's existing `error`
  state and is distinguishable from `loaded`. AC03 measures it.
- **R04 applies**: no token, colour or dimension is introduced.
- **R15 applies**: the manifest's `commercialClaim` field keeps its existing wording
  on the four new entries, so the SVG sources carry the same "not a verified real
  device" statement as the WebP files.
- R01, R02, R03, R05, R06, R07, R08, R09, R12, R13, R16, R17, R18, R20, R21, R22,
  R23, R24, R25: N/A. The change introduces no brand asset (R01), alters no shell,
  hero or palette (R02, R03, R09), changes no width, spacing, radius, font or type
  scale (R05, R06, R07), adds and removes no action (R08), adds no string to the
  interface (R12), touches no price field, provider, variant, filter or data source
  (R13, R16, R17, R18), adds no interactive element or target (R20, R21), changes no
  breakpoint (R22), opens no dialog (R23), persists nothing (R24) and invents no
  promotional content (R25). R26 is satisfied by the commit body and the recorded
  evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, an HTTP 200 and a green unit test are none of them a browser check
(`.claude/rules/browser-verification.md`).

- [ ] **FIX-49-AC01** `src/app/shared/media/resolve-asset-url.ts` exists, exports
      `resolveAssetUrl(path: string, documentBaseUri: string): string` with exactly
      that signature, and `grep -rln "resolveAssetUrl" src/` lists it and
      `src/app/shared/ui/product-image/product-image.ts`. Both greps returned nothing
      before the change.
- [ ] **FIX-49-AC02** At 1440 on `http://localhost:4200/telefonok/demo-one-5g`, the
      gallery image renders, and
      `document.querySelector('[data-testid="image-photo"]').src` is an absolute URL
      on the page's own origin ending in
      `/assets/products/graphite-front.webp`. Record the value. Confirm from
      `list_network_requests` that the image request returned 200 and that no request
      left the page's origin. Record a screenshot.
- [ ] **FIX-49-AC03** The rejection path renders the fallback, not a broken image. In
      the page console, temporarily set `src/mocks/cart/cart.handlers.ts:49`'s
      `src: '/assets/products/graphite-front.webp'` to `https://evil.example/x.webp` and
      reload, or re-render the component directly with that value, and confirm
      `[data-testid="image-photo"]` is absent,
      `[data-testid="image-fallback"]` is present, and no network request was made to
      that host. Record the network log and a screenshot. If the state cannot be
      induced in the browser, say so and record how the unit test covered it instead;
      do not report the criterion as passed on reasoning.
- [ ] **FIX-49-AC04** The resolution rule is proven against a base URI that is not the
      origin root. Evaluate the helper with an explicit base URI — via the unit test's
      own cases, or by calling the exported function in a Node one-liner — and record
      that
      `resolveAssetUrl('/assets/products/graphite-front.webp', 'https://example.test/mi-bolt/')`
      returns `https://example.test/mi-bolt/assets/products/graphite-front.webp`. It
      proves the helper resolves against `document.baseURI` rather than concatenating
      onto the origin. After decision **D14** it is **not** a claim that any such
      deployment exists, and the record must not read as one; the base URI is a test
      input, nothing more.
- [ ] **FIX-49-AC05** The `<base>` element this task depends on is still present, and
      the executor read `FIX-54` before starting. `grep -n "base href" src/index.html`
      prints one line containing `<base href="/">` — on the unmodified file that is
      `6:  <base href="/">`, measured 2026-09-17 — and the recorded output says which
      of **FIX-54** and this task landed first. **If that grep prints nothing, the
      criterion fails and
      the task stops with a report** rather than a commit: with no `<base>` element,
      `document.baseURI` is the current document's URL (MDN, `Node.baseURI`), so every
      asset on a deep-linked route would resolve under that route's path. Evidence
      item 4 has the worked example.
- [ ] **FIX-49-AC06** `docs/design/asset-manifest.json` parses and contains **eight**
      entries, four `.webp` and four `.svg`, each with `path`, `source`, `view`,
      `color`, `commercialClaim` and `dimensions`. Every `dimensions` value is
      `[320, 400]`, matching the `width`/`height` in each SVG's own header. Record the
      output of the `node -e` command from "How to verify".
- [ ] **FIX-49-AC07** Every `path` in the manifest resolves on disk:
      `node -e "const fs=require('fs');JSON.parse(fs.readFileSync('docs/design/asset-manifest.json','utf8')).forEach(e=>{if(!fs.existsSync(e.path))throw new Error('missing: '+e.path)});console.log('all 8 resolve')"`
      prints `all 8 resolve`. If it throws on one of the four pre-existing entries,
      **FIX-36** has not yet corrected their `docs/mi-bolt/…` prefix; record that and
      say so in the commit body rather than editing those four here.
- [ ] **FIX-49-AC08** `npx vitest run tests/resolve-asset-url.spec.ts` exits 0 and its
      output shows the three accepted cases and the eight rejected cases from "What to
      change" item 4 all running.
- [ ] **FIX-49-AC09** `npm run build` exits 0 and `npm run test` exits
      0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/resolve-asset-url.spec.ts tests/product-image.spec.ts` instead.
- [ ] **FIX-49-AC10** `grep -rn '"/assets/' src/` was run and its output recorded; any
      consumer other than `ProductImage` that binds an asset path into the DOM is
      reported as a finding and left unchanged.

## Commit

This task is exactly one commit. The helper and the manifest travel together because
both are the same defect — material the specification names by path that the
repository does not have — and because the manifest's four entries are four lines of
JSON that would not survive as a commit of their own. Do not bundle it with any other
FIX task, and do not commit until every acceptance criterion above has passed and its
output is recorded.

The commit body records: that decision **D14** removed this task's sub-path reason for
existing and that **FIX-54** owns the removal, so a reader who finds the old
`/mi-bolt/` framing in an audit report knows why it is gone; AC05's `<base href="/">`
measurement and which of **FIX-54** and this task landed first; whether **FIX-36** had
already corrected the four existing manifest paths, and if not, that the file
temporarily holds two path conventions; and the output of AC10's grep.

**It does not record anything about T28-AC02.** That criterion is **FIX-40**'s to
record, against whatever **FIX-54** leaves of it.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
feat: add resolveAssetUrl and list the SVG sources in the asset manifest
```
