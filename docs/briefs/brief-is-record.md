# Unit: replace nine `as Record<string, unknown>` casts with one type guard

You are working in a git worktree of the mi-bolt Angular 22 workspace. Your
working directory is the worktree root. Every path below is relative to it.

**You MUST execute every command with the Bash tool and paste the real tool
result; invented output is a failure.**

## Why this unit exists

`.claude/rules/code-standards.md` says: "Strict generics. `as` is forbidden;
use `satisfies`. `any` is forbidden; use `unknown` plus a type guard." and
"Always use the type guards that already exist in the project. If none fits
and one is needed, write it."

Nine places narrow an `unknown` value to an index signature with a bare cast.
A cast asserts; a guard proves. None of the existing guards fits, so this unit
writes one and routes all nine through it.

## Read these files first

Read all of them before writing anything:

- `src/mocks/business-route-predicates.ts` — the precedent for a small
  predicate module in `src/mocks/`. Match its file shape, its docblock style
  and its export style.
- `src/mocks/idempotency.ts` — lines 60-75.
- `src/mocks/payment/payment.handlers.ts` — lines 185-200 and 240-250.
- `src/mocks/cart/cart.handlers.ts` — lines 228-252.
- `src/mocks/checkout/quote-domain.ts` — lines 140-170, 220-230 and 265-278.

## Step 1 — write the guard

Create `src/mocks/is-record.ts` with exactly this export, plus a short
docblock in the style of `business-route-predicates.ts`:

```ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

Do not add any other export to that file. Do not put it in
`src/app/shared/utils/` — the nine call sites are all under `src/mocks/`, and
`business-route-predicates.ts` is the precedent for keeping a mocks predicate
in `src/mocks/`.

## Step 2 — write its test

Create `src/mocks/is-record.spec.ts`. It is a plain Vitest spec with no
TestBed. Use `import { describe, expect, it } from 'vitest';`. Assert exactly
these cases, each with its own `it`:

- `isRecord({})` is `true`
- `isRecord({ a: 1 })` is `true`
- `isRecord(null)` is `false`
- `isRecord(undefined)` is `false`
- `isRecord([])` is `false`
- `isRecord([1, 2])` is `false`
- `isRecord('x')` is `false`
- `isRecord(42)` is `false`

Use exact-value assertions: `expect(isRecord(null)).toBe(false)`. A truthiness
check does not settle a boolean.

## Step 3 — route the nine call sites through it

These are the nine, with the current line number. Line numbers may shift as
you edit; find each by its exact text, not by the number.

| File | Line | Current text |
|---|---|---|
| `src/mocks/idempotency.ts` | 69 | `const obj = value as Record<string, unknown>;` |
| `src/mocks/payment/payment.handlers.ts` | 193 | `const record = body as Record<string, unknown>;` |
| `src/mocks/payment/payment.handlers.ts` | 245 | `return HttpResponse.json(replay.body as Record<string, unknown>, {` |
| `src/mocks/cart/cart.handlers.ts` | 235 | `const record = body as Record<string, unknown>;` |
| `src/mocks/cart/cart.handlers.ts` | 246 | `const record = body as Record<string, unknown>;` |
| `src/mocks/checkout/quote-domain.ts` | 146 | `return (value as Record<string, unknown>)[key];` |
| `src/mocks/checkout/quote-domain.ts` | 161 | `const record = value as Record<string, unknown>;` |
| `src/mocks/checkout/quote-domain.ts` | 225 | `const record = value as Record<string, unknown>;` |
| `src/mocks/checkout/quote-domain.ts` | 272 | `const record = value as Record<string, unknown>;` |

For each one: read the function it sits in, then replace the cast with a guard
check. The shape depends on what the function does with the value, so decide
per site:

- Where the surrounding code already tested the value is a non-null object
  before the cast, replace that test with `if (!isRecord(value)) { … }` and use
  the narrowed value afterwards. The existing early-return or fallback is what
  the guard's false branch does; do not invent a new one.
- Where the cast is inline inside a larger expression, such as
  `(value as Record<string, unknown>)[key]`, hoist it:
  `if (!isRecord(value)) return undefined;` then `return value[key];` — but
  only after reading what that function's declared return type is, and
  returning whatever it already returns for a value it cannot read.
- Where the value is an MSW response body being handed to
  `HttpResponse.json(...)`, the guard's false branch must keep the handler's
  existing behaviour for a body it cannot narrow. Read the surrounding handler
  and match it.

**Do not change any runtime behaviour.** Every one of these nine sites must
behave exactly as it does now for every input it currently accepts. If you
find a site where a guard would change behaviour and you cannot preserve it,
leave that site alone, and say so in your report with the file, the line and
the reason.

Import it as `import { isRecord } from '../is-record';` or `'./is-record'`,
whichever the file's own depth requires. Check the relative depth per file:
`src/mocks/idempotency.ts` is one level, `src/mocks/payment/payment.handlers.ts`
is two.

## Step 4 — do not touch these files

Another session is editing these right now. Writing any of them is a failure
of this unit:

- `src/mocks/persistence.ts` (it has a tenth `as Record<string, unknown>` at
  line 365 — **leave it**, it is not part of this unit)
- `src/app/shared/shell/**`
- `src/app/features/home/hero.html`, `hero.scss`
- `docs/fix/FIX-70.md`, `docs/fix/FIX-34.md`
- `scripts/coder-agent/**`
- anything under `e2e/`

## Step 5 — gates

Run each of these and paste the real output. Wait on each command's own exit;
do not background one and poll a log.

```
npm run test
npx eslint src/mocks/is-record.ts src/mocks/is-record.spec.ts src/mocks/idempotency.ts src/mocks/payment/payment.handlers.ts src/mocks/cart/cart.handlers.ts src/mocks/checkout/quote-domain.ts
npx prettier --check src/mocks/is-record.ts src/mocks/is-record.spec.ts src/mocks/idempotency.ts src/mocks/payment/payment.handlers.ts src/mocks/cart/cart.handlers.ts src/mocks/checkout/quote-domain.ts
npm run build
```

Acceptance, each measurable:

- `npm run test` exits 0. Before your change it reports **62 test files, 925
  tests**. After, it must report **63 test files** and **933 tests** (925 plus
  your 8 new cases). If either number differs, say so and say why.
- `npx eslint` over the six files above exits 0.
- `npx prettier --check` over the same six exits 0.
- `npm run build` exits 0.
- This command must print `0`:
  `grep -c "as Record<string, unknown>" src/mocks/idempotency.ts src/mocks/payment/payment.handlers.ts src/mocks/cart/cart.handlers.ts src/mocks/checkout/quote-domain.ts | grep -v ":0" | wc -l`
- This command must print `1` (the guard's own return type, which is not a
  cast): `grep -c "Record<string, unknown>" src/mocks/is-record.ts`

## Step 6 — run the code review

Before you report done, run the `/code-review xhigh --fix` skill over your
change with the Skill tool. Report its result in the `code_review` field of
your report. A report claiming this ran without the Skill call having happened
is a failure.

## Step 7 — commit

Exactly two commands, from the worktree root, with these exact paths:

```
git add -- src/mocks/is-record.ts src/mocks/is-record.spec.ts src/mocks/idempotency.ts src/mocks/payment/payment.handlers.ts src/mocks/cart/cart.handlers.ts src/mocks/checkout/quote-domain.ts
```

```
git commit -m "refactor: prove the record shape with a guard instead of a cast" -m "Nine call sites under src/mocks/ narrowed an unknown value to Record<string, unknown> with a bare cast. .claude/rules/code-standards.md forbids that: a cast asserts, a guard proves. None of the existing guards fitted, so this adds isRecord in src/mocks/is-record.ts, next to business-route-predicates.ts which is the precedent for a mocks-local predicate module. Runtime behaviour is unchanged at every site: each guard's false branch keeps whatever the surrounding code already did for a value it could not read. src/mocks/persistence.ts:365 carries a tenth such cast and is deliberately untouched, because another session owns that file this run." -- src/mocks/is-record.ts src/mocks/is-record.spec.ts src/mocks/idempotency.ts src/mocks/payment/payment.handlers.ts src/mocks/cart/cart.handlers.ts src/mocks/checkout/quote-domain.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`: the number of Bash tool calls you made this turn.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 5, with the command's real output.
- `sites_changed`: the nine, one line each, saying which guard shape you used.
- `sites_left_alone`: any site you could not convert without changing
  behaviour, with file, line and reason, or `none`.
- `self_check`:
  - `invariant_tests`: for `isRecord`, name the test that proves it and the
    single production line whose removal makes that test fail. A test that
    stays green after the removal is not proof — actually delete the line,
    re-run, paste the failure, then restore it.
  - `exact_value_assertions`: confirm every new assertion compares to an exact
    value rather than truthiness.
- `code_review`: the result of the `/code-review xhigh --fix` pass.
- `commit`: the sha, from `git log --oneline -1`.
- `tasks_done`: your own task list entries completed this turn, by id and
  subject.
- `open_tasks`: every entry still pending or in progress, or `none`.
