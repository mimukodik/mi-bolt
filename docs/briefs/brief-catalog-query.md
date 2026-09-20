# Unit: replace four casts in `catalog-query.ts` with two type guards

You are working in a git worktree of the mi-bolt Angular 22 workspace. Your
working directory is the worktree root. Every path below is relative to it.

**You MUST execute every command with the Bash tool and paste the real tool
result; invented output is a failure.**

## How this sandbox behaves — read this before your first command

Each refused command costs a whole tool call, so do not discover these by
trying:

- **No pipes, no output redirection, no `$(...)`, no heredocs, no `find`, no
  multi-operator chains** (`a | b; c`). Run one bare command and read the tool
  result, which already carries the output and the exit code.
- Use the native **Grep** and **Read** tools for anything you would have piped.
- `git checkout`, `git restore`, `git reset`, `git stash` and `git clean` are
  refused by the sandbox and forbidden by this workspace's rules. If you edit a
  file outside your list, leave it edited and say so in your report: staging by
  explicit pathspec keeps it out of the commit.
- `git push` is not yours to run, ever.
- You may write to `/tmp` as well as to the worktree.
- **Do not run `npm start`, `ng serve`, or any server.** Another agent is
  driving the app on port 4200 right now and a second server would break its
  run. Do not run `npm install` either: `node_modules` is a symlink shared with
  other worktrees.

## Looking things up is mandatory

Your model is older than this stack — Angular 22, TypeScript 6, ESLint 10 all
post-date your training, so anything you *recall* about them is a guess.

- Any question about how Angular, the Angular CLI or the builder behaves goes
  to `mcp__angular-cli__search_documentation` (pass `version: 22`,
  `includeTopContent: true` for the page text, and **keywords, not a
  sentence**) or to `mcp__angular-cli__get_best_practices`.
- Anything angular.dev does not cover goes to `mcp__minimax-mcp-server`'s
  `web_search`, or to `WebSearch` / `WebFetch`.
- **Never build a probe component or a throwaway app to discover how the
  framework behaves.** Read the documentation instead.
- Put the URL in your report beside any claim it supports.
- If you still cannot settle a fact, report `blocked` and say exactly what you
  would have searched for. Do not guess and do not invent an output.

## Why this unit exists

`.claude/rules/code-standards.md` says: "Strict generics. `as` is forbidden;
use `satisfies`. `any` is forbidden; use `unknown` plus a type guard." and
"Always use the type guards that already exist in the project. If none fits
and one is needed, write it."

`src/app/features/catalog/catalog-query.ts` parses the catalogue's URL query
string. Four places there narrow a parsed value to a literal union with a bare
cast, including one that casts the constant array itself
(`(SORT_MODES as readonly string[])`) just to make `.includes` accept a wider
argument. A cast asserts; a guard proves.

## Read these files first

- `src/app/features/catalog/catalog-query.ts` — the whole file, and especially
  lines 24-40 (the `Sort` type, `SORT_MODES`, `ALLOWED_STORAGE_GB`), the
  `storageGb` block around lines 157-171, and the `sort` block around lines
  202-208.
- `src/app/shared/utils/event-target.ts` — the precedent for a small guard
  module on this branch; match its docblock style even though your guards live
  inside `catalog-query.ts` rather than in a file of their own.

Do **not** import anything from `src/mocks/`: that tree is the dev-only mock
backend and application code never depends on it.

## Step 1 — add the two guards

Both go into `src/app/features/catalog/catalog-query.ts` itself, directly below
the constants they read (around line 40), each with a one-line docblock saying
why a guard is used rather than a cast. Export both, so the spec can reach
them.

```ts
export function isSort(value: unknown): value is Sort {
  return SORT_MODES.some((mode) => mode === value);
}

export function isStorageBucket(value: number): value is 128 | 256 | 512 {
  return ALLOWED_STORAGE_GB.some((gb) => gb === value);
}
```

`SORT_MODES` is declared `as const satisfies readonly Sort[]`, so `.some` over
it compares literal members and needs no cast. If either body does not
typecheck, **report the exact TypeScript error and stop on that item** rather
than reaching for a cast to make it compile.

## Step 2 — write their tests

Create `src/app/features/catalog/catalog-query.spec.ts` — the file does not
exist yet. A plain Vitest spec, no TestBed: `import { describe, expect, it } from 'vitest';`
Assert exactly these nine cases, each its own `it`, each with an exact-value
`toBe`:

- `isSort('recommended')` is `true`
- `isSort('price_asc')` is `true`
- `isSort('cheapest')` is `false`
- `isSort('')` is `false`
- `isSort(null)` is `false`
- `isStorageBucket(128)` is `true`
- `isStorageBucket(512)` is `true`
- `isStorageBucket(64)` is `false`
- `isStorageBucket(0)` is `false`

A truthiness check does not settle a boolean; use `toBe(true)` / `toBe(false)`.

## Step 3 — route the four sites through them

**Site 1 and 2, the storage block** (around lines 164-165). Current text:

```ts
      if (!ALLOWED_STORAGE_GB.includes(num as 128 | 256 | 512)) continue;
      const bucket = num as 128 | 256 | 512;
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      parsed.push(bucket);
```

becomes:

```ts
      if (!isStorageBucket(num)) continue;
      if (seen.has(num)) continue;
      seen.add(num);
      parsed.push(num);
```

The `bucket` local disappears because `num` is now narrowed. Everything else in
that `for` loop stays as it is.

**Site 3 and 4, the sort block** (around lines 205-206). Current text:

```ts
    const trimmed = sortRaw.trim();
    if ((SORT_MODES as readonly string[]).includes(trimmed)) {
      query.sort = trimmed as Sort;
    }
```

becomes:

```ts
    const trimmed = sortRaw.trim();
    if (isSort(trimmed)) {
      query.sort = trimmed;
    }
```

**Do not change any runtime behaviour.** Both blocks must accept and reject
exactly the values they accept and reject today, including the silent `continue`
for an unknown storage size and the silent skip for an unknown sort value. If
converting a site would change what a user sees, leave it alone and say so in
your report with the file, the line and the reason.

## Step 4 — do not touch these files

Another session owns these right now. Writing any of them is a failure of this
unit:

- `src/mocks/**` (every file)
- `src/app/features/cart/**`
- `docs/**`
- `.claude/**`
- `scripts/**`
- (there is no end-to-end suite in this project by decision, 2026-09-20)

Any other file under `src/app/features/catalog/` is also out of scope: this
unit is `catalog-query.ts` and its new spec, nothing else. If the change makes
another file fail to compile, **report it rather than editing that file**.

## Step 5 — gates

Run each and paste the real output. Wait on each command's own exit; do not
background one and poll a log.

```
npm run test
```

```
npx eslint src/app/features/catalog/catalog-query.ts src/app/features/catalog/catalog-query.spec.ts
```

```
npx prettier --check src/app/features/catalog/catalog-query.ts src/app/features/catalog/catalog-query.spec.ts
```

```
npm run build
```

Acceptance, each measurable:

- `npm run test` exits 0. Before your change it reports **65 test files, 944
  tests**. After, it must report **66 test files** and **953 tests** (944 plus
  your 9 new cases). If either number differs, say so and say why.
- `npx eslint` over the two files exits 0.
- `npx prettier --check` over the same two exits 0.
- `npm run build` exits 0.
- This command must print nothing:
  `grep -n "as 128 | 256 | 512" src/app/features/catalog/catalog-query.ts`
- This command must print nothing:
  `grep -n "as readonly string\[\]" src/app/features/catalog/catalog-query.ts`
- This command must print nothing:
  `grep -n "as Sort" src/app/features/catalog/catalog-query.ts`
- This command must print `2`:
  `grep -c "^export function is" src/app/features/catalog/catalog-query.ts`

## Step 6 — run the code review

Before you report done, run the `/code-review xhigh --fix` skill over your
change with the Skill tool. Report its result in the `code_review` field. A
report claiming this ran without the Skill call having happened is a failure.
If the review proposes a fix that breaks the build or the types, say so, do not
apply it, and explain why in that field.

## Step 7 — commit

Exactly two commands, from the worktree root.

```
git add -- src/app/features/catalog/catalog-query.ts src/app/features/catalog/catalog-query.spec.ts
```

```
git commit -m "refactor: narrow the catalogue query with guards, not casts" -m "catalog-query.ts parsed two URL parameters into literal unions with bare casts, which .claude/rules/code-standards.md forbids: a cast asserts, a guard proves. One of the four even cast the constant array itself, (SORT_MODES as readonly string[]), only so that .includes would accept a wider argument. isSort and isStorageBucket now sit beside the constants they read and narrow both blocks, which lets the storageGb loop drop its bucket local and the sort block assign the narrowed value directly. Runtime behaviour is unchanged: an unknown storage size still hits the silent continue and an unknown sort value is still skipped silently. The new catalog-query.spec.ts covers both guards with exact-value assertions." -- src/app/features/catalog/catalog-query.ts src/app/features/catalog/catalog-query.spec.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`: the number of Bash tool calls you made this turn.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 5, with the command's real output.
- `sites_changed`: the four, one line each, saying which guard shape you used.
- `sites_left_alone`: any site you could not convert without changing
  behaviour, with file, line and reason, or `none`.
- `behaviour_deltas`: for each of the four, name any input for which the new
  code behaves differently from the old, or say `none` for that site. Be
  honest here: a previous unit on this branch claimed "behaviour unchanged"
  and a review found an input where it was not.
- `lookups`: every documentation or web lookup you made, with the URL, or
  `none`.
- `self_check`:
  - `invariant_tests`: for `isSort` and for `isStorageBucket`, name the test
    that proves it and the single production line whose removal makes that test
    fail. Actually delete the line, re-run, paste the failure, then restore it.
  - `exact_value_assertions`: confirm every new assertion compares to an exact
    value rather than truthiness.
- `code_review`: the result of the `/code-review xhigh --fix` pass.
- `commit`: the sha, from `git log --oneline -1`.
- `tasks_done`: your own task list entries completed this turn, by id and
  subject.
- `open_tasks`: every entry still pending or in progress, or `none`.
