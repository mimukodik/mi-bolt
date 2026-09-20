# Unit: replace thirteen `event.target as …` casts with typed helpers

You are working in a git worktree of the mi-bolt Angular 22 workspace. Your
working directory is the worktree root. Every path below is relative to it.

**You MUST execute every command with the Bash tool and paste the real tool
result; invented output is a failure.**

## Why this unit exists

`.claude/rules/code-standards.md` says: "Strict generics. `as` is forbidden;
use `satisfies`. `any` is forbidden; use `unknown` plus a type guard." and
"Always use the type guards that already exist in the project. If none fits
and one is needed, write it."

Thirteen DOM event handlers reach `event.target` and assert its element type
with a bare cast. `EventTarget` is genuinely wider than the element the handler
expects — a handler can be invoked with a target that is not that element — so
the cast is an assertion the code never checks. None of the existing guards
fits, so this unit writes two and routes all thirteen through them.

## Read these files first

Read all of them before writing anything:

- `src/app/shared/utils/idempotency-key.ts` — the precedent for a small
  utility module under `src/app/shared/utils/`. Match its file shape, its
  docblock style and its export style.
- `src/app/core/navigation/header-nav.ts` — line 111 and the method around it.
- `src/app/features/catalog/filter-panel.ts` — lines 170-200.
- `src/app/features/catalog/filter-drawer.ts` — lines 140-155.
- `src/app/features/product/product-gallery.ts` — lines 175-190.
- `src/app/features/checkout/address-form.ts` — lines 222-250.
- `src/app/features/checkout/review-step.ts` — lines 282-300.

## Step 1 — write the helpers

Create `src/app/shared/utils/event-target.ts` with exactly these two exports,
each with a short docblock in the style of `idempotency-key.ts` saying why a
guard is used rather than a cast:

```ts
export function isHTMLInputElement(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement;
}

export function isHTMLSelectElement(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement;
}
```

Add nothing else to that file.

`instanceof` is the check here rather than a duck-typed property test, because
these handlers run against the real DOM in the browser and against jsdom's DOM
in the unit suite, and both provide the constructors.

## Step 2 — write its test

Create `src/app/shared/utils/event-target.spec.ts`. A plain Vitest spec, no
TestBed. `import { describe, expect, it } from 'vitest';` Build the elements
with `document.createElement`. Assert exactly these cases, each its own `it`,
each comparing to an exact value with `toBe`:

- `isHTMLInputElement(document.createElement('input'))` is `true`
- `isHTMLInputElement(document.createElement('select'))` is `false`
- `isHTMLInputElement(document.createElement('div'))` is `false`
- `isHTMLInputElement(null)` is `false`
- `isHTMLSelectElement(document.createElement('select'))` is `true`
- `isHTMLSelectElement(document.createElement('input'))` is `false`
- `isHTMLSelectElement(null)` is `false`

## Step 3 — route the thirteen call sites through them

These are the thirteen, with the current line number. Line numbers shift as
you edit; find each by its exact text, not by the number.

| File | Line | Current text |
|---|---|---|
| `src/app/core/navigation/header-nav.ts` | 111 | `const target = event.target as HTMLInputElement \| null;` |
| `src/app/features/catalog/filter-panel.ts` | 176 | `const value = (event.target as HTMLInputElement).value;` |
| `src/app/features/catalog/filter-panel.ts` | 186 | `const value = (event.target as HTMLInputElement).value;` |
| `src/app/features/catalog/filter-panel.ts` | 194 | `const value = (event.target as HTMLInputElement).value;` |
| `src/app/features/catalog/filter-drawer.ts` | 146 | `this.draftMin.set((event.target as HTMLInputElement).value);` |
| `src/app/features/catalog/filter-drawer.ts` | 150 | `this.draftMax.set((event.target as HTMLInputElement).value);` |
| `src/app/features/product/product-gallery.ts` | 182 | `const target = event.target as Node \| null;` |
| `src/app/features/checkout/address-form.ts` | 228 | `const input = event.target as HTMLInputElement;` |
| `src/app/features/checkout/address-form.ts` | 234 | `const input = event.target as HTMLInputElement;` |
| `src/app/features/checkout/address-form.ts` | 240 | `const input = event.target as HTMLInputElement;` |
| `src/app/features/checkout/address-form.ts` | 246 | `const input = event.target as HTMLInputElement;` |
| `src/app/features/checkout/review-step.ts` | 288 | `this.acceptedTerms.set((event.target as HTMLInputElement).checked);` |
| `src/app/features/checkout/review-step.ts` | 296 | `this.acknowledgedSimulation.set((event.target as HTMLInputElement).checked);` |

The shape for each of the twelve `HTMLInputElement` sites is an early return:

```ts
if (!isHTMLInputElement(event.target)) return;
```

then use `event.target` directly, which TypeScript has now narrowed. Where the
method's declared return type is not `void`, return whatever that method
already returns for a no-op, which you read from the method itself rather than
inventing.

**`src/app/features/product/product-gallery.ts:182` is different and is not an
input.** Its cast is `as Node | null`, inside what a read of the surrounding
method will show is a click-outside or focus-outside check that calls
`.contains(target)`. Do not use either new helper there. Replace the cast with
`event.target instanceof Node ? event.target : null`, or an equivalent
`instanceof` narrowing that keeps the method's existing behaviour for a target
that is not a `Node`. Read the method first and preserve exactly what it does
today when `target` is null.

**Do not change any runtime behaviour.** In the browser each of these handlers
is bound to the element it expects, so the guard is true on every real call and
the early return never fires. If converting a site would change what a user
sees, leave it alone and say so in your report with the file, the line and the
reason.

Import path depth differs per file — check each:
`src/app/core/navigation/header-nav.ts` needs `'../../shared/utils/event-target'`,
`src/app/features/catalog/filter-panel.ts` needs `'../../shared/utils/event-target'`.
Verify each by reading the file's other imports rather than assuming.

## Step 4 — existing specs

Some of these handlers already have unit tests that dispatch an event. Those
tests must keep passing unchanged. If one fails because its fake event carries
a target that is not a real element, **fix the test to build a real element**
rather than weakening the guard. Say in your report which spec files you
touched and why.

## Step 5 — do not touch these files

Another session is editing these right now. Writing any of them is a failure
of this unit:

- `src/mocks/**`
- `src/app/shared/shell/**`
- `src/app/features/home/hero.html`, `hero.scss`
- `docs/fix/FIX-70.md`, `docs/fix/FIX-34.md`
- `scripts/coder-agent/**`
- anything under `e2e/`

## Step 6 — gates

Run each and paste the real output. Wait on each command's own exit; do not
background one and poll a log.

```
npm run test
npx eslint src/app/shared/utils/event-target.ts src/app/shared/utils/event-target.spec.ts src/app/core/navigation/header-nav.ts src/app/features/catalog/filter-panel.ts src/app/features/catalog/filter-drawer.ts src/app/features/product/product-gallery.ts src/app/features/checkout/address-form.ts src/app/features/checkout/review-step.ts
npx prettier --check src/app/shared/utils/event-target.ts src/app/shared/utils/event-target.spec.ts src/app/core/navigation/header-nav.ts src/app/features/catalog/filter-panel.ts src/app/features/catalog/filter-drawer.ts src/app/features/product/product-gallery.ts src/app/features/checkout/address-form.ts src/app/features/checkout/review-step.ts
npm run build
```

Acceptance, each measurable:

- `npm run test` exits 0. Before your change it reports **62 test files, 925
  tests**. After, it must report **63 test files** and **932 tests** (925 plus
  your 7 new cases), unless you had to add a case to an existing spec under
  Step 4 — in which case say the number and why.
- `npx eslint` over the eight files above exits 0.
- `npx prettier --check` over the same eight exits 0.
- `npm run build` exits 0.
- This command must print nothing:
  `grep -rn "\.target as " --include=*.ts src/app`
- This command must print `2`:
  `grep -c "^export function is" src/app/shared/utils/event-target.ts`

## Step 7 — run the code review

Before you report done, run the `/code-review xhigh --fix` skill over your
change with the Skill tool. Report its result in the `code_review` field of
your report. A report claiming this ran without the Skill call having happened
is a failure.

## Step 8 — commit

Exactly two commands, from the worktree root. If Step 4 made you touch a spec
file, add its path to both commands.

```
git add -- src/app/shared/utils/event-target.ts src/app/shared/utils/event-target.spec.ts src/app/core/navigation/header-nav.ts src/app/features/catalog/filter-panel.ts src/app/features/catalog/filter-drawer.ts src/app/features/product/product-gallery.ts src/app/features/checkout/address-form.ts src/app/features/checkout/review-step.ts
```

```
git commit -m "refactor: narrow event targets with a guard instead of a cast" -m "Thirteen DOM handlers asserted event.target's element type with a bare cast. EventTarget is genuinely wider than the element each handler expects, so the assertion was never checked. .claude/rules/code-standards.md forbids the cast and asks for a guard when none of the existing ones fits. This adds isHTMLInputElement and isHTMLSelectElement in src/app/shared/utils/event-target.ts, beside idempotency-key.ts, and routes twelve sites through an early return. product-gallery.ts's site is not an input: its cast was to Node for a contains() check and is narrowed with instanceof Node instead. Runtime behaviour is unchanged: in the browser each handler is bound to the element it expects, so every guard is true on every real call." -- src/app/shared/utils/event-target.ts src/app/shared/utils/event-target.spec.ts src/app/core/navigation/header-nav.ts src/app/features/catalog/filter-panel.ts src/app/features/catalog/filter-drawer.ts src/app/features/product/product-gallery.ts src/app/features/checkout/address-form.ts src/app/features/checkout/review-step.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`: the number of Bash tool calls you made this turn.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 6, with the command's real output.
- `sites_changed`: the thirteen, one line each, saying which shape you used.
- `sites_left_alone`: any site you could not convert without changing
  behaviour, with file, line and reason, or `none`.
- `specs_touched`: any existing spec you had to change under Step 4, with the
  reason, or `none`.
- `self_check`:
  - `invariant_tests`: for each of the two helpers, name the test that proves
    it and the single production line whose removal makes that test fail.
    Actually delete the line, re-run, paste the failure, then restore it. A
    test that stays green after the removal is not proof.
  - `exact_value_assertions`: confirm every new assertion compares to an exact
    value rather than truthiness.
- `code_review`: the result of the `/code-review xhigh --fix` pass.
- `commit`: the sha, from `git log --oneline -1`.
- `tasks_done`: your own task list entries completed this turn, by id and
  subject.
- `open_tasks`: every entry still pending or in progress, or `none`.
