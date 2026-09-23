# Fix round: the counter announces "Nincs találat." to a screen reader at the moment of a retry

Your commit `0002e18` was reviewed and **one blocking finding** came back. Everything else in it is clean and stays exactly as it is: the four files, the `tabindex="-1"`, the `resultCountEl` pair, `focusResultCount()` and its three call sites, the five tests, and the decision to add no SCSS rule. **Do not redo or rework any of that.**

The same sandbox rules and the same lookup rules as your first turn still apply. One correction you already received and must keep applying: `npx vitest run <one spec file>` does not work here — `npm run test` is the only run whose result means anything.

## The finding

`resultCountLabel()` in `src/app/features/catalog/catalog-toolbar.ts` reads:

```ts
  readonly resultCountLabel = computed<string>(() => {
    if (this.status() === 'loading') return 'Keresés a katalógusban…';
    if (this.total() === 0) return 'Nincs találat.';
    return `Találatok: ${String(this.total())}`;
  });
```

It has no branch for the error state. It never needed one before, because nothing drew a user's attention to that element. **Your fix now does**: `onRetry()` calls `focusResultCount()` as its first statement, so focus lands on that div while the facade's status is still `'error'`. A screen-reader user who presses the retry button hears **"Nincs találat."** — "No results found" — at the exact moment they asked to retry after a server error. With previous data on screen it is worse: they hear the stale count, `Találatok: N`, announced as if it were current.

The label can never say anything about an error today, because `toolbarStatus()` in `src/app/features/catalog/catalog-page.ts` collapses every non-loading status onto `'success'`:

```ts
  readonly toolbarStatus = computed<AsyncStatus>(() =>
    this.controlsDisabled() ? 'loading' : 'success',
  );
```

So `'error'` never reaches the toolbar at all.

## The fix, decided — do not redesign it

Two edits, both inside files you already own.

### 1. `src/app/features/catalog/catalog-page.ts` — let `'error'` through

`toolbarStatus()` passes `'error'` through and keeps mapping everything else exactly as it does now: `controlsDisabled()` still wins and yields `'loading'`, and every remaining status still becomes `'success'`. Read `asyncStatus()` directly above it — it already narrows `CatalogStatus` onto `AsyncStatus`, and `'error'` is a member of `AsyncStatus`; confirm that by reading `src/app/shared/types/async-status.ts` rather than assuming, and say in your report what the union actually contains.

Update the computed's docstring so it describes the new mapping instead of the old one.

**Check this before you write it, and report what you find:** the toolbar's template binds `[disabled]="status() === 'loading'"` on both `<select>` elements. Confirm that passing `'error'` through changes nothing there, because `'error'` was previously mapped to `'success'` and neither value is `'loading'`. If you find any other consumer of `CatalogToolbar`'s `status` input whose behaviour would change, **stop and report `blocked`** rather than writing the edit.

### 2. `src/app/features/catalog/catalog-toolbar.ts` — give the label an error branch

Add the branch **above** the `total() === 0` test, so an error is never reported as an empty result set:

```ts
    if (this.status() === 'error') return 'A katalógus betöltése nem sikerült.';
```

That exact string. It is the counter's short form of what `ErrorState` already renders above it ("Nem sikerült betölteni a katalógust."), so the page does not say two different things about one failure. Do not invent a different wording, do not add an emoji, and do not add a retry instruction to it — the retry button is already on screen and named.

Update `resultCountLabel()`'s docstring: it currently explains at length why `AsyncStatus` has no `refreshing` member and what that cost. Keep that explanation, and add a sentence saying the error branch exists because `CatalogPage.focusResultCount()` moves focus here from `onRetry()`, so this text is what a screen reader announces at that moment.

## Do not touch

Everything outside these two files, and in particular:

- `src/app/shared/ui/async-content/**` and `src/app/shared/ui/error-state/**` — the error state's own wording is theirs
- `src/app/features/catalog/applied-filters.*`, `pagination.*`, `filter-panel.*`, `filter-drawer.*`
- `src/app/features/checkout/**`, `src/app/features/cart/**`, `src/mocks/**`, `src/styles/**`
- `docs/**`, `.claude/**`, `scripts/**` (there is no end-to-end suite in this project by decision, 2026-09-20)

**Do not add `aria-live` or a `role` to the counter.** The review named the missing live region as a separate, pre-existing defect and it is the orchestrator's to raise with the user. Adding one here would be a feature this round did not ask for.

## Tests

Add **two** cases to the `describe('self-removing controls — focus moves to the results counter, not <body>')` block you already created in `src/app/features/catalog/catalog-page.spec.ts`. Touch no existing test, including your own five.

1. **The error case.** Reach the error state the way your fifth case already does (`harness.reject(503)`, `await harness.waitForStatus('error')`). Before clicking retry, assert the counter's `textContent` is **exactly** `'A katalógus betöltése nem sikerült.'` and, explicitly, that it is **not** `'Nincs találat.'` — the second assertion is what fails on the old code and is the point of this round.
2. **The empty case still says what it said.** Reach the empty state (`harness.respond(successPage([], 0))`, `await harness.waitForStatus('empty')`) and assert the counter's `textContent` is exactly `'Nincs találat.'`, so the new branch cannot swallow the empty-state wording.

Use `.trim()` on `textContent` if the template's whitespace requires it, and say in your report whether it did.

## Gates

Run each from the worktree root, wait on its own exit, and paste the real output.

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

- `npm run test` exits 0. Your previous turn ended at **67 test files, 972 tests**. After this round it must report **67 test files** and **974 tests**. If either number differs, say so and why.
- `npm run lint`, `npm run build` and `npm run format:check` each exit 0.
- This must print `1`:
  `grep -c "A katalógus betöltése nem sikerült." src/app/features/catalog/catalog-toolbar.ts`
- This must print nothing:
  `grep -n "aria-live" src/app/features/catalog/catalog-toolbar.html`

## Run the code review

Run `/code-review xhigh --fix` with the Skill tool over this round's change and report the result. Apply nothing it proposes outside your two source files, and **do not let it re-architect `focusResultCount()` or the five tests from the previous turn** — record any such proposal in `code_review` and leave it.

## Task list

Open one with TaskCreate at the start of this turn, one entry per step.

## Commit

A **second** commit on this branch, not an amend. Two commands, from the worktree root.

```
git add -- src/app/features/catalog/catalog-page.ts src/app/features/catalog/catalog-toolbar.ts src/app/features/catalog/catalog-page.spec.ts
```

```
git commit -m "fix: stop the catalogue counter calling a failed load an empty result" -m "The previous commit moves focus to the results counter when a control removes itself, which made a screen reader read that element at the moment the user pressed retry after a server error. resultCountLabel had no error branch, so it fell through to the zero-results test and announced Nincs talalat, or the stale previous count when there was one, at exactly the moment the user asked to retry. The label could not have said otherwise: CatalogPage.toolbarStatus collapsed every non-loading status onto success, so error never reached the toolbar. It now passes error through, unchanged in every other case, and resultCountLabel answers it with the counter-sized form of the wording ErrorState already renders above it, so the page does not describe one failure two ways. Two tests pin it: the counter reads the error wording and explicitly not the empty-state wording while the error is on screen, and the empty state still reads Nincs talalat." -- src/app/features/catalog/catalog-page.ts src/app/features/catalog/catalog-toolbar.ts src/app/features/catalog/catalog-page.spec.ts
```

No heredoc, no `$(...)`, no `-F`, no `git -C`, no `git push`, and do not invoke the `git-commit` skill.

## Your report

- `bash_tool_calls_made`
- `async_status_union`: what `AsyncStatus` actually contains, quoted from its file.
- `status_consumers`: every consumer of `CatalogToolbar`'s `status` input you found, and why passing `'error'` through changes nothing for each.
- `edits`: the two changed computeds quoted whole, with their docstrings.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet above with the command's real output.
- `tests_added`: the two cases, and whether `.trim()` was needed.
- `self_check`:
  - `invariant_tests`: delete the new `'error'` branch from `resultCountLabel()`, re-run, paste the failure, restore it. Then delete the `'error'` pass-through from `toolbarStatus()`, re-run, paste the failure, restore it. Say which of the two tests each deletion breaks.
  - `exact_value_assertions`: confirm both new assertions compare to exact strings.
- `behaviour_deltas`: what a sighted user and a screen-reader user each experience differently, before and after.
- `code_review`: the result, including anything proposed outside your two source files that you did not apply.
- `commit`: the sha from `git log --oneline -1`.
- `tasks_done` and `open_tasks`.
