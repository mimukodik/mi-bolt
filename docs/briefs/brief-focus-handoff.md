# Unit: stop four catalogue controls dropping focus on `<body>` when they remove themselves

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

Your model is older than this stack — Angular 22, TypeScript 6 and ESLint 10
all post-date your training. **This unit turns on one CSS selector rule, so at
least one lookup is required and its URL goes in your report.**

- Angular questions (`viewChild`, signals, change detection):
  `mcp__angular-cli__search_documentation` (`version: 22`,
  `includeTopContent: true`, **keywords not a sentence**) or
  `mcp__angular-cli__get_best_practices`.
- CSS and DOM questions: `mcp__minimax-mcp-server`'s `web_search`, or
  `WebSearch` / `WebFetch`. MDN and the CSS Selectors Level 4 specification
  are the sources that settle the one below.
- **Never build a probe component to discover how the framework behaves.**
- If you cannot settle a fact, report `blocked` and say what you would have
  searched for. Never guess, never invent an output.

## The defect, measured rather than inferred

Four controls on `/telefonok` leave `document.activeElement` on `BODY` after
they are activated, because activating them **removes them from the DOM**.
Measured in jsdom, which does implement focus loss on element removal, so
these are real readings and not an inference:

1. `[data-testid="applied-chip-remove-inStock"]` — one of two chips
2. `[data-testid="applied-chip-remove-is5g"]` — the last chip
3. `[data-testid="applied-filters-clear"]`
4. the `EmptyState` action button inside `[data-testid="catalog-empty"]`

A fifth has the same shape by inspection: `ErrorState`'s retry button inside
`[data-testid="catalog-error"]`. `CatalogPage.onRetry()` clears the facade's
error, so `@else if (status() === 'error')` in
`src/app/shared/ui/async-content/async-content.html:10` stops matching and the
button is destroyed under the user's hands.

A keyboard user who removes a filter is left with no focus ring anywhere and
has to tab from the top of the document again — WCAG 2.4.3 (Focus Order) and
2.4.7 (Focus Visible).

**This is a different mechanism from the pagination defect already fixed in
`38f74a9`.** That one is "activation *disables* the control" and is answered by
the HTML focus fixup rule; this one is "activation *removes* the control from
the DOM". Read `Pagination.onBoundary` in
`src/app/features/catalog/pagination.ts` — it is the precedent for the shape of
the fix, not for the fix itself, and you do not touch that file.

## The fix, decided by the user — do not redesign it

The user chose the focus target on 2026-09-20: **the results counter**, the
element that renders `Találatok: 16`. It is the result of the action, so it
tells the user what happened, and one target serves all five cases. The two
options they turned down were the filter panel heading (hidden below 1024px,
so it would need a second target) and the `<h1>` (which is exactly the
behaviour task #47 removed as distracting). **Do not propose a different
target and do not add a second one.**

That element is `<div class="result-count" data-testid="result-count">` in
`src/app/features/catalog/catalog-toolbar.html:2`. It is rendered
unconditionally — `<app-catalog-toolbar>` is unconditional in
`catalog-page.html` and the div is unconditional inside it — so it is **never
destroyed** and focusing it synchronously inside the click handler moves focus
off the doomed button before the re-render removes it. That is the same reason
`Pagination.onBoundary` works synchronously, stated in its own docstring.

## Read these files first

- `src/app/features/catalog/catalog-toolbar.ts` — the whole file, especially
  `filterTriggerRef` / `filterTriggerEl` at lines 50-58, which is the exact
  pattern you copy
- `src/app/features/catalog/catalog-toolbar.html` and `catalog-toolbar.scss`
- `src/app/features/catalog/catalog-page.ts` — the whole file, especially the
  `toolbar` / `filterTrigger` pair at lines 88-96 and the handlers at 217-279
- `src/app/features/catalog/pagination.ts` — `onBoundary` and its docstring,
  for the precedent's wording. **Do not edit this file.**
- `src/app/features/catalog/applied-filters.html` — where chips 1-3 live
- `src/app/shared/ui/async-content/async-content.html` — where 4 and 5 live
- `src/styles/primitives.css` lines 58-66 — the global `:focus-visible` rule
- `src/app/features/catalog/catalog-page.spec.ts` — the helpers at lines 72-110
  and 258-400, and the whole `describe('pagination focus — …')` block that
  starts at line 1258. That block is the template for your tests.

## Step 1 — check me on one CSS fact before you write anything

`src/styles/primitives.css:62` declares a global

```css
:focus-visible {
  outline: 2px solid var(--color-focus-light);
  outline-offset: 2px;
  border-radius: inherit;
}
```

I believe this is enough, and that **no new SCSS rule is needed**, for two
reasons you must check rather than accept:

- **It reaches into a component.** `primitives.css` is a global stylesheet
  listed in `angular.json`, and Angular's emulated encapsulation adds a
  `_ngcontent` attribute to a *component's own* selectors without restricting
  which global selectors may match its elements. Confirm this from the Angular
  documentation and quote what you find.
- **`:focus-visible` can match after programmatic focus.** The counter will be
  focused by a `.focus()` call, not by a Tab press. The CSS Selectors Level 4
  specification's own guidance is that when focus moves programmatically, the
  UA should match `:focus-visible` on the newly focused element if the
  previously focused one matched it — so a keyboard user gets the ring and a
  mouse user does not. Look this up on MDN
  (https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) and in the
  specification, quote the sentence, and put both URLs in your report.

**If what you find says a programmatically focused element can never match
`:focus-visible` in Chrome**, then a keyboard user would get no indicator at
all, which fails WCAG 2.4.7. In that case do **not** guess a replacement:
report `blocked`, quote the source, and stop. I would rather be corrected than
have a silent focus move land.

If both hold, add **no** rule to `catalog-toolbar.scss` and say so in your
report. The component-level `:focus-visible` rules already in that file are
pre-existing duplication of the global rule; **do not add a sixth one and do
not remove the existing ones.**

## Step 2 — make the counter focusable and expose it

### `src/app/features/catalog/catalog-toolbar.html`

Add **two** attributes to the existing `.result-count` div and change nothing
else on it:

- `#resultCount` — the template reference the view query below reads
- `tabindex="-1"` — programmatically focusable, never in the tab order

Do not add `role`, `aria-live` or `aria-label`. The element's text is already
the announcement.

### `src/app/features/catalog/catalog-toolbar.ts`

Add the view query beside the existing `filterTriggerRef` / `filterTriggerEl`
pair, in exactly that shape:

```ts
  private readonly resultCountRef = viewChild<ElementRef<HTMLElement>>('resultCount');
  readonly resultCountEl = computed<HTMLElement | null>(
    () => this.resultCountRef()?.nativeElement ?? null,
  );
```

Give it a docstring in the file's own voice saying what it is for and why it
is a plain public property rather than an output: the same reason
`filterTriggerEl`'s docstring gives, which is that `components.md:371`'s
declared input/output surface is unchanged by a public property a parent reads.
**Write that reasoning in your own words from that docstring; do not copy it
verbatim and do not restate the `appliedCount` paragraph.**

`ElementRef`, `computed` and `viewChild` are already imported in that file.
Add no new import.

## Step 3 — the shared hand-off in `catalog-page.ts`

Add one private method and call it from three handlers. The method:

```ts
  private focusResultCount(): void {
    this.toolbar()?.resultCountEl()?.focus();
  }
```

Its docstring must say, in your own words: which operations remove the control
the user just activated; that the counter is never destroyed, so the call is
synchronous and moves focus before the re-render rather than chasing it
afterwards; that the user chose this target because it is the result of the
action; and that this is the DOM-removal arm of the same problem
`Pagination.onBoundary` answers for the disabling arm.

Call it as the **first** statement of these three handlers, before the facade
call, so focus has left the button while it is still in the document:

- `onChipRemoved` (line 234) — covers defects 1 and 2
- `onClearAll` (line 265) — covers defects 3 and 4; it is bound both to
  `AppliedFilters.cleared` and to the empty-state action's `(pressed)`, so one
  call serves both
- `onRetry` (line 269) — covers the fifth, `ErrorState`'s retry button

**Do not add it to any other handler.** `onFiltersChanged`, `onSortChanged`,
`onPageSizeChanged` and `onPageChanged` do not remove the control they were
called from: `onPageChanged`'s case is the disabling arm and `Pagination`
already answers it, and moving focus on a sort or page-size change would take
focus off a `<select>` the user is still operating, which is the behaviour task
#47 removed.

## Step 4 — the tests

Add them to `src/app/features/catalog/catalog-page.spec.ts`, in **one new
`describe` block placed directly after** the existing
`describe('pagination focus — reaching a boundary never drops focus on <body>')`
block. **Touch no existing test.**

Open the block with a docstring comment in the style of the pagination block's,
saying what was measured and where the two environments differ: jsdom *does*
implement focus loss on element removal, so unlike the pagination case the
`<body>` half of this defect reproduces here, and `toBe(document.body)` is a
real pre-fix reading rather than an inference.

Use the file's existing helpers — `setupHarness`, `getRootElement`,
`queryButton`, `queryElement`, `successPage`, `buildSummary`,
`harness.respond`, `harness.reject`, `harness.waitForStatus`, `harness.tick`,
`harness.cleanup` — exactly as the pagination block uses them. Read their
signatures rather than assuming.

Write **five** cases, one per defect, each asserting the exact element:

1. `applied-chip-remove-inStock` — set up with a query that produces at least
   two chips, focus the button, click it, `detectChanges()`, then
   `expect(document.activeElement).toBe(queryElement(root, '[data-testid="result-count"]'))`
   and `expect(document.activeElement).not.toBe(document.body)`
2. `applied-chip-remove-is5g` as the **last** chip — same assertions
3. `applied-filters-clear` — same assertions
4. the empty-state action: `setupHarness` with a filter, `harness.respond(successPage([], 0))`,
   `await harness.waitForStatus('empty')`, then the button at
   `[data-testid="catalog-empty"] app-button button` — same assertions
5. the error-state retry: `harness.reject(503)`,
   `await harness.waitForStatus('error')`, then the button at
   `[data-testid="catalog-error"] app-button button` — same assertions

Before each click, assert `document.activeElement` **is** the button, so the
test proves focus moved rather than that it happened to be nowhere already.

If a case cannot be expressed in this harness for a real reason, **say which
and why** in your report rather than writing a weaker assertion. Do not replace
an exact-element check with a truthiness check, and do not assert only
`not.toBe(document.body)`.

## Step 5 — do not touch these files

- `src/app/features/catalog/pagination.ts`, `pagination.html`,
  `pagination.scss`, `pagination.spec.ts`
- `src/app/features/catalog/applied-filters.*` — the chips are the trigger, not
  the fix
- `src/app/shared/**`, `src/styles/**`, `src/mocks/**`
- `src/app/features/checkout/**` — another unit owns `checkout.guards.ts`
- `src/app/layouts/**`, `docs/**`, `.claude/**`, `scripts/**`, `e2e/**`

Your files are exactly four:
`src/app/features/catalog/catalog-toolbar.html`,
`src/app/features/catalog/catalog-toolbar.ts`,
`src/app/features/catalog/catalog-page.ts` and
`src/app/features/catalog/catalog-page.spec.ts`.

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

Acceptance:

- `npm run test` exits 0. Before your change it reports **67 test files, 966
  tests**. After, it must report **67 test files** and **971 tests** (966 plus
  your 5). If either number differs, say so and why.
- `npm run lint`, `npm run build` and `npm run format:check` each exit 0.
- This must print `1`:
  `grep -c "tabindex=\"-1\"" src/app/features/catalog/catalog-toolbar.html`
- This must print `4` — the method's declaration plus its three call sites:
  `grep -c "focusResultCount" src/app/features/catalog/catalog-page.ts`
  If your number differs, say what it is and which lines produced it rather
  than forcing it to four.
- This must print nothing:
  `grep -n "focusResultCount" src/app/features/catalog/pagination.ts`

## Step 7 — run the code review

Run the `/code-review xhigh --fix` skill with the Skill tool and report the
result in `code_review`. Apply nothing it proposes outside your files.

## Step 8 — open a task list

This workspace's Stop hook requires one. Open it with TaskCreate at the start
of your turn, one entry per step, statuses kept current.

## Step 9 — commit

Two commands, from the worktree root.

```
git add -- src/app/features/catalog/catalog-toolbar.html src/app/features/catalog/catalog-toolbar.ts src/app/features/catalog/catalog-page.ts src/app/features/catalog/catalog-page.spec.ts
```

```
git commit -m "fix: hand catalogue focus to the results counter when a control removes itself" -m "Removing a filter chip, clearing all filters, resetting from the empty state and retrying from the error state each destroy the button the click was made on, and the browser then hands focus back to body: measured in jsdom, which does implement focus loss on element removal. A keyboard user was left with no focus ring and had to tab from the top of the document again, failing WCAG 2.4.3 and 2.4.7. This is the DOM-removal arm of the problem Pagination.onBoundary already answers for the disabling arm, and it needs a different remedy. Focus now goes to the results counter, which the user chose because it is the result of the action and one target serves all five cases; the two alternatives were the filter panel heading, hidden below 1024px, and the h1, which is the behaviour an earlier fix removed as distracting. The counter is rendered unconditionally and is never destroyed, so CatalogToolbar exposes it the same way it already exposes the filter trigger and CatalogPage focuses it synchronously at the top of the three handlers, before the re-render removes the button. The global focus-visible rule in primitives.css supplies the indicator, so no component rule is added." -- src/app/features/catalog/catalog-toolbar.html src/app/features/catalog/catalog-toolbar.ts src/app/features/catalog/catalog-page.ts src/app/features/catalog/catalog-page.spec.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`
- `css_confirmation`: the two sentences you found for Step 1, quoted, with
  their URLs, and a plain statement of whether they confirm or contradict the
  brief. Say outright whether you added an SCSS rule and why.
- `fix_applied`: the changed `.result-count` element quoted, the new
  `resultCountEl` pair quoted, and `focusResultCount` with its docstring
  quoted.
- `handlers_touched`: the three handlers with the call site quoted, and a
  sentence on why each of the other four handlers was left alone.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 6 with the command's real output.
- `tests_added`: the five cases, and any you could not express, with the
  reason.
- `self_check`:
  - `invariant_tests`: for each of the five new cases, the single production
    line whose removal makes it fail. Delete it, re-run, paste the failure,
    restore it. One line may cover several cases — say which.
  - `exact_value_assertions`: confirm every new assertion compares to an exact
    element rather than truthiness.
- `behaviour_deltas`: what a user sees differently, keyboard and mouse
  separately.
- `lookups`: every lookup with its URL.
- `code_review`: the result of the `/code-review xhigh --fix` pass, including
  anything proposed outside your files that you did not apply.
- `commit`: the sha from `git log --oneline -1`.
- `tasks_done` and `open_tasks`.
- `browser_watch`: two or three lines for the browser pass — which route,
  which controls to activate, what `document.activeElement` must be after
  each, and at which widths.
