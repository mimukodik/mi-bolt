# Unit: put the Kosár and Adatok checkout steps back on the site centreline

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
- **Do not run `npm start`, `ng serve` or any server**, and do not run
  `npm install`: `node_modules` is a symlink shared with other worktrees. You
  have no browser; the rendered result is checked by another agent afterwards.

## Looking things up is mandatory

Your model is older than this stack. **This unit turns on a flexbox sizing
rule, so at least one lookup is required and its URL goes in your report.**

- CSS questions: `mcp__minimax-mcp-server`'s `web_search`, or `WebSearch` /
  `WebFetch`. MDN and the CSS Flexible Box Layout specification are the
  sources that settle this one.
- Angular questions: `mcp__angular-cli__search_documentation` (`version: 22`,
  `includeTopContent: true`, keywords not a sentence).
- **Never build a probe component to discover how something behaves.**
- If you cannot settle a fact, report `blocked` and say what you would have
  searched for. Never guess, never invent an output.

## The defect, already diagnosed in a real browser

At 1280px, `document.querySelector('main.layout-main').getBoundingClientRect()`
returns left=48, right=1232, width=1184 on `/`, `/telefonok`,
`/penztar/szallitas`, `/penztar/ellenorzes` and `/penztar/siker/:id`, matching
the header and the DEMO banner. On **`/penztar/kosar`** it returns left=177,
right=1103, width=926, and on **`/penztar/adatok`** left=185.66, right=1094.34,
width=908.69. It is visible: the DEMO banner's text starts at x=48 while the
cart's "A kosarad" heading starts at x≈177.

**The cause, measured rather than guessed.** `src/app/shared/shell/app-shell.scss`
declares:

```scss
:host {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
:host > ng-content { display: contents; }
```

`display: contents` on the `<ng-content>` unwraps it, so the `<main class="layout-main">`
that `CheckoutLayout` projects into `AppShell` becomes a **direct flex item** of
`app-app-shell`. The container is `flex-direction: column`, so width is the
**cross axis**. `src/app/layouts/checkout-layout.scss` declares on that same
element:

```scss
.layout-main {
  display: block;
  ...
  max-width: var(--layout-container-max);
  margin: 0 auto;
  ...
}
```

Those two `auto` cross-axis margins are what breaks it. A flex item with an
`auto` cross size normally stretches to the container's cross size, but **only
when neither cross-axis margin is `auto`**. With `margin: 0 auto` the stretch
is suppressed, the item is sized shrink-to-fit against the available 1184px,
and the auto margins absorb the remainder. Three of the five checkout steps
have content wide enough to reach 1184px, so their margins compute to `0px` and
they look correct by accident. The cart (926px of content) and the contact form
(908.69px) do not.

Measured at four widths on `/penztar/kosar`: 375px → margin 0 (content needs
the full width); 640px → margin 25px; 1024px → margin 1px (a near-coincidence,
not a fix); 1280px → margin 129px.

## Read these files first

- `src/app/layouts/checkout-layout.scss` — the whole file, especially
  `.layout-main` around lines 12-20 and the `@media (min-width: 1024px)` block
- `src/app/layouts/checkout-layout.html`
- `src/app/shared/shell/app-shell.scss` and `app-shell.html`
- `src/app/layouts/shop-layout.scss` and `src/app/layouts/marketing-layout.scss`
  — their `.layout-main` rules, for the comparison in Step 2
- `src/styles/tokens.css` lines 85-88 — `--layout-container-max: 1320px` and
  the three gutter tokens

## Step 1 — the fix

In `src/app/layouts/checkout-layout.scss`, add **`width: 100%;`** to the
`.layout-main` rule, beside the existing `max-width` and `margin: 0 auto`.
Add a short comment above it saying why: the element is a flex item of
`AppShell`, whose `:host` is `display: flex; flex-direction: column`, so an
`auto` cross size with `auto` cross-axis margins is sized shrink-to-fit instead
of stretched; an explicit `width: 100%` removes the shrink-to-fit path and lets
`max-width` and `margin: 0 auto` behave as they do in ordinary block flow.

**Do not use `align-self: stretch` instead, and check me on this before you
write anything.** The stretch rule in the flexbox specification is conditional
on *neither cross-axis margin being `auto`*, so `align-self: stretch` on an
element that still carries `margin: 0 auto` does not restore stretching. Look
that up, quote the sentence you find, and put the URL in your report. **If what
you find contradicts me, do not write `width: 100%` — report `blocked`, quote
the source, and stop.** I would rather be corrected than have the wrong fix
land.

`box-sizing` is already `border-box` on this element, and `.layout-main`'s
padding is vertical only (`padding: var(--space-6) 0 var(--space-7)`, and
`var(--space-7) 0 var(--space-8)` above 1024px), so `width: 100%` adds no
horizontal overflow. Confirm both by reading, and say so.

Change nothing else in that file. The `:host` gutter ladder, the `.steps`
rules and the media queries all stay exactly as they are.

## Step 2 — check the other two layouts, and change them only if they need it

`ShopLayout` and `MarketingLayout` project into the same `AppShell`, so their
`main.layout-main` is a flex item too. Read both stylesheets. A `grep` I ran
says neither declares `max-width` or `margin: 0 auto` on `.layout-main`, which
means neither has an auto cross-axis margin and both stretch normally — so
neither needs the fix.

**Verify that yourself** and say what you found. If either one *does* carry an
auto horizontal margin, it has the same defect and gets the same one-line fix;
say so in your report and name the file. If neither does, change neither file.

## Step 3 — the test

`src/app/layouts/` has a spec — find it with `ls src/app/layouts/` rather than
assuming its name.

Add one case asserting that `main.layout-main` inside `CheckoutLayout` carries
the declaration. The honest form is to read the rendered element's computed
style in the TestBed and assert the exact value:

```ts
expect(getComputedStyle(main).width).toBe('100%');
```

**jsdom does not do layout**, so this asserts the declaration reached the
element, not the rendered width — which is exactly the invariant worth pinning,
because the defect was the declaration's absence. If jsdom does not apply the
component stylesheet in this harness and the assertion cannot be made to pass
for a real reason, **say so plainly in your report and add no test at all**
rather than writing one that asserts something else and calls it coverage. An
assertion that would stay green with the fix removed is worth nothing here.

Whatever you do, prove it: delete the `width: 100%` line, re-run, paste what
happens, and restore it. If the suite stays green with the line gone, the test
does not prove the fix and you must say that in `self_check` rather than
claiming it does.

## Step 4 — do not touch these files

- `src/app/shared/shell/**` — `app-shell.scss` is the other half of the cause
  and it is **not** what we change; the shell's flex column is deliberate and
  every other route depends on it
- `src/app/features/**`, `src/mocks/**`, `src/styles/**`
- `docs/**`, `.claude/**`, `scripts/**` (there is no end-to-end suite in this project by decision, 2026-09-20)

Your files are `src/app/layouts/checkout-layout.scss` and the layouts spec.
If the change makes another file fail to compile, **report it rather than
editing that file**. A code review proposing a fix outside your files is
telling you about another unit's work: record it in `code_review` and do not
apply it.

## Step 5 — gates

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

Acceptance:

- `npm run test` exits 0. Before your change it reports **67 test files, 966
  tests**. Say the after numbers and why they moved.
- `npm run lint`, `npm run build` and `npm run format:check` each exit 0.
- This must print `1`:
  `grep -c "width: 100%" src/app/layouts/checkout-layout.scss`
- This must print nothing:
  `grep -n "align-self" src/app/layouts/checkout-layout.scss`

## Step 6 — run the code review

Run the `/code-review xhigh --fix` skill with the Skill tool and report the
result in `code_review`. Apply nothing it proposes outside your files.

## Step 7 — open a task list

This workspace's Stop hook requires one. Open it with TaskCreate at the start
of your turn, one entry per step, statuses kept current.

## Step 8 — commit

Two commands, from the worktree root. Add the spec path to **both** if you
touched it.

```
git add -- src/app/layouts/checkout-layout.scss
```

```
git commit -m "fix: stretch the checkout main to the site centreline" -m "At 1280px the Kosar and Adatok steps rendered 129px and 137.66px in from each side while the other three checkout steps, the home page and the catalogue all sat at 48 and 1232. AppShell's host is display flex with flex-direction column and its ng-content is display contents, so the projected main.layout-main is a direct flex item and width is the cross axis. checkout-layout.scss gave that element margin 0 auto, and a flex item whose cross size is auto is only stretched when neither cross-axis margin is auto, so the element was sized shrink-to-fit against the available 1184px and the auto margins absorbed the rest. Three steps have content wide enough to reach 1184px and looked right by accident. An explicit width of 100% removes the shrink-to-fit path and lets max-width and margin 0 auto behave as they do in ordinary block flow. ShopLayout and MarketingLayout declare no horizontal auto margin on their own layout-main, so neither had the defect and neither is touched." -- src/app/layouts/checkout-layout.scss
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`
- `spec_confirmation`: the sentence you found about flex cross-axis stretch and
  auto margins, quoted, with its URL. Say plainly whether it confirms or
  contradicts the brief.
- `fix_applied`: the `.layout-main` rule after your change, quoted whole.
- `box_sizing_and_padding`: what you read that confirms `width: 100%` adds no
  horizontal overflow.
- `other_layouts`: what `shop-layout.scss` and `marketing-layout.scss` declare
  on `.layout-main`, and whether either needed the same fix.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 5 with the command's real output.
- `test_added`: the case you added, or a plain statement that jsdom could not
  support one and why.
- `self_check`:
  - `invariant_tests`: what happened when you deleted the `width: 100%` line
    and re-ran, pasted verbatim, and confirmation that you restored it. If the
    suite stayed green, say that outright.
  - `exact_value_assertions`: confirm any assertion you added compares to an
    exact value.
- `lookups`: every lookup with its URL.
- `code_review`: the result of the `/code-review xhigh --fix` pass, including
  anything proposed outside your files that you did not apply.
- `commit`: the sha from `git log --oneline -1`.
- `tasks_done` and `open_tasks`.
- `browser_watch`: two or three lines for the browser pass — which routes,
  which element, which numbers must come back, and at which widths.
