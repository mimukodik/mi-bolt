# Unit: take the two `NgOptimizedImage` usages back to a plain `<img>`

You are working in a git worktree of the mi-bolt Angular 22 workspace. Your
working directory is the worktree root. Every path below is relative to it.

**You MUST execute every command with the Bash tool and paste the real tool
result; invented output is a failure.**

## How this sandbox behaves — read this before your first command

- **No pipes, no output redirection, no `$(...)`, no heredocs, no `find`, no
  multi-operator chains** (`a | b; c`). Run one bare command and read the tool
  result, which already carries the output and the exit code. Each refusal
  costs a whole tool call.
- Use the native **Grep** and **Read** tools for anything you would have piped.
- `git checkout`, `git restore`, `git reset`, `git stash` and `git clean` are
  refused by the sandbox and forbidden by this workspace's rules.
- `git push` is not yours to run, ever.
- You may write to `/tmp` as well as to the worktree.
- **Do not run `npm start`, `ng serve`, or any server**, and do not run
  `npm install`: `node_modules` is a symlink shared with other worktrees.

## Looking things up is mandatory

Your model is older than this stack — Angular 22, TypeScript 6 and ESLint 10
all post-date your training, so anything you *recall* about them is a guess.
**This unit is about an Angular directive, so at least one lookup is expected.**

- `mcp__angular-cli__search_documentation` (pass `version: 22`,
  `includeTopContent: true` for the page text, **keywords not a sentence**) or
  `mcp__angular-cli__get_best_practices`.
- Anything angular.dev does not cover: `mcp__minimax-mcp-server`'s
  `web_search`, or `WebSearch` / `WebFetch`.
- **Never build a probe component to discover how the framework behaves.**
- The URL goes in your report beside the claim it supports.
- If you cannot settle a fact, report `blocked` and say what you would have
  searched for. Never guess, never invent an output.

## Why this unit exists

The user never asked for `NgOptimizedImage` ("nem kell ngoptimizedimage!!!!!!!!!!
sosem kertem ilyet" — "no NgOptimizedImage is needed!!!!!!!!!! I never asked for
such a thing"), and a real-browser pass found it also emits a console **error**
on two screens:

```
NG02955: The NgOptimizedImage directive ... has detected that this image is the
Largest Contentful Paint (LCP) element but was not marked "priority"...
```

seen on `/telefonok` at 1280px and 375px, and on the product page after a
variant reload. The decision is to remove the directive rather than silence the
warning with a `priority` attribute, because that would keep a dependency that
was never wanted.

## Read these files first

- `src/app/shared/ui/product-image/product-image.ts`, `.html` and `.scss`
- `src/app/features/home/featured-products.ts`, `.html` and `.scss` (the
  `.featured__image` rules around lines 98-110)
- `src/app/shared/ui/product-image/product-image.spec.ts` and
  `src/app/features/home/featured-products.spec.ts` if they exist — check with
  `ls` rather than assuming

## Step 0 — find every usage, do not trust this list

Run both and paste the output:

```
grep -rn "NgOptimizedImage" --include=*.ts --include=*.html src
```

```
grep -rn "ngSrc" --include=*.ts --include=*.html src
```

I expect two components plus one stale docstring mention in
`src/app/features/cart/cart-line.ts`. **If you find a third usage, it is in
scope** — treat it the same way and say so in your report.

## Step 1 — `src/app/shared/ui/product-image/`

In `product-image.html`, inside the `@case ('loaded')` block, the `<img>`
currently reads:

```html
      <img
        class="photo object-contain"
        [ngSrc]="resolvedSrc()"
        [alt]="decorative() ? '' : image().alt"
        fill
        decoding="async"
        loading="lazy"
        data-testid="image-photo"
        (error)="onError()"
      />
```

Change `[ngSrc]` to `[src]` and delete the bare `fill` attribute. Change
nothing else on that element: the class, the alt binding, `decoding`,
`loading`, the test id and the error handler all stay.

**Why deleting `fill` is safe here, and you should confirm it rather than take
my word:** `fill` is an `NgOptimizedImage` input that makes the image fill its
positioned parent. `product-image.scss`'s `.photo` rule already declares
`position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain`,
and `.root` already declares `position: relative`, so the CSS does that work
independently of the directive. Read both rules and say in your report that you
checked.

In `product-image.ts`, remove `NgOptimizedImage` from the `imports:` array and
from the `@angular/common` import statement. `DOCUMENT` is still imported from
`@angular/common` and must stay.

## Step 2 — `src/app/features/home/featured-products.`

In `featured-products.html` around line 38, the `<img>` reads:

```html
                        <img
                          [ngSrc]="src"
                          [alt]="firstImageAlt(slot.product)"
                          fill
                          decoding="async"
                          loading="lazy"
                          data-testid="image-photo"
                        />
```

Same change: `[ngSrc]` becomes `[src]`, the bare `fill` goes, nothing else
moves.

`featured-products.scss` already has `.featured__image { aspect-ratio: 4 / 5;
position: relative; overflow: hidden; }` and `.featured__image img { display:
block; width: 100%; height: 100%; object-fit: contain; }`, so the box is
already reserved and the image already fills it. Read those rules and confirm.
**If after reading you believe the image will not fill its box without `fill`**,
do not guess: say so in your report with the rule that is missing, and add the
smallest CSS that restores it — `position: absolute; inset: 0;` on
`.featured__image img` — saying you did.

In `featured-products.ts`, remove `NgOptimizedImage` from the `imports:` array
and from the `@angular/common` import statement. If that leaves the
`@angular/common` import with nothing in it, delete the whole import line.

## Step 3 — the stale docstring

`src/app/features/cart/cart-line.ts:6` mentions "lazy via NgOptimizedImage" in
a comment. After this change that is no longer true. Correct the wording so it
describes what the code does now — the image is lazy through the `<img>`
element's own `loading="lazy"`. **Comment only, no code change in that file.**

## Step 4 — the specs

Some specs may assert `ngSrc`. Run:

```
grep -rn "ngSrc" --include=*.spec.ts src
```

Any spec asserting the `ngSrc` attribute must be updated to assert `src`
instead — that is a test following the code, not a weakened assertion, and say
so per file in your report. **Do not delete an assertion and do not replace an
exact-value check with a truthiness check.** If a spec fails for any other
reason, fix the cause rather than the assertion, and explain.

If no spec covers the rendered attribute at all, add one exact-value case to
`src/app/shared/ui/product-image/product-image.spec.ts` asserting that the
`[data-testid="image-photo"]` element's `src` attribute ends with the resolved
file name and that it has no `ngsrc` attribute. Say which of the two situations
you found.

## Step 5 — do not touch these files

- `src/mocks/**`
- `src/app/features/cart/**` except the one comment in Step 3
- `src/app/features/catalog/**`, `src/app/features/checkout/**`
- `src/app/layouts/**` — another unit owns the checkout centreline
- `docs/**`, `.claude/**`, `scripts/**`, `e2e/**`

If the change makes another file fail to compile, **report it rather than
editing that file**. A code review proposing a fix outside your files is
telling you about another unit's work: record it in `code_review` and do not
apply it.

## Step 6 — gates

Run each and paste the real output. Wait on each command's own exit; do not
background one and poll a log.

```
npm run test
```

```
npm run lint
```

```
npm run build
```

```
npm run format:check
```

Acceptance, each measurable:

- `npm run test` exits 0. Before your change it reports **67 test files, 963
  tests**. Say the after numbers and, if they moved, exactly why.
- `npm run lint`, `npm run build` and `npm run format:check` each exit 0.
- This must print nothing:
  `grep -rn "NgOptimizedImage" --include=*.ts --include=*.html src`
- This must print nothing:
  `grep -rn "ngSrc" --include=*.ts --include=*.html src`
- This must print nothing (the bare attribute is gone from both templates):
  `grep -n "fill" src/app/shared/ui/product-image/product-image.html src/app/features/home/featured-products.html`
  If that grep hits an unrelated word containing "fill", say so and quote the
  line rather than editing it.

## Step 7 — run the code review

Run the `/code-review xhigh --fix` skill over your change with the Skill tool
and report the result in `code_review`. Apply nothing it proposes outside your
files.

## Step 8 — open a task list

This workspace's Stop hook requires one. Open it with TaskCreate at the start
of your turn, one entry per step, statuses kept current.

## Step 9 — commit

Two commands, from the worktree root. Add any spec path you had to touch under
Step 4 to **both** commands.

```
git add -- src/app/shared/ui/product-image/product-image.ts src/app/shared/ui/product-image/product-image.html src/app/features/home/featured-products.ts src/app/features/home/featured-products.html src/app/features/cart/cart-line.ts
```

```
git commit -m "refactor: render product images with a plain img element" -m "NgOptimizedImage was never asked for, and a real-browser pass found it emitting NG02955 at error level on /telefonok at both widths and on the product page after a variant reload, because the catalogue's first image is the LCP element and was not marked priority. Adding priority would have silenced the warning while keeping a directive nobody wanted, so the directive goes instead: [ngSrc] becomes [src] and the fill attribute is dropped in ProductImage and in the home page's featured grid. No layout changes with it, because product-image.scss's .photo already declares position absolute with inset 0 and a full width and height inside a relative .root, and featured-products.scss already reserves the box with aspect-ratio and sizes the image to 100%. cart-line.ts's docstring no longer claims the laziness comes from the directive; it comes from the img element's own loading attribute." -- src/app/shared/ui/product-image/product-image.ts src/app/shared/ui/product-image/product-image.html src/app/features/home/featured-products.ts src/app/features/home/featured-products.html src/app/features/cart/cart-line.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`
- `usages_found`: the output of both Step 0 greps, and whether anything beyond
  the expected two components plus the cart-line comment turned up.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 6 with the command's real output.
- `fill_removal`: for each of the two templates, the CSS rules you read that
  make the image fill its box without the directive, quoted, and whether you
  had to add anything.
- `specs_touched`: each spec you changed and why, or `none`, plus which of the
  two Step 4 situations you found.
- `behaviour_deltas`: anything a user could see that is different — image
  position, size, loading behaviour, alt text — or `none`, with the reasoning.
- `lookups`: every documentation or web lookup, with the URL.
- `self_check`:
  - `invariant_tests`: name the test that proves the rendered element carries a
    real `src`, and the single production line whose removal makes it fail.
    Delete the line, re-run, paste the failure, restore it.
  - `exact_value_assertions`: confirm every assertion you added or changed
    compares to an exact value rather than truthiness.
- `code_review`: the result of the `/code-review xhigh --fix` pass, including
  anything proposed outside your files that you did not apply.
- `commit`: the sha from `git log --oneline -1`.
- `tasks_done` and `open_tasks`.
- **`browser_note`**: one paragraph for the orchestrator's browser pass saying
  exactly what to look at to confirm this — which screens, which element, and
  what the console must no longer print. You cannot verify it yourself; you
  have no browser.
