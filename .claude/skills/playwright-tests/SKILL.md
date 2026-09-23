---
name: playwright-tests
description: >-
  How end-to-end tests get written, repaired and watched in mi-bolt-frontend:
  the `playwright-test-planner` → `-generator` → `-healer` chain, the
  orchestrator's part around it, and the stuck-agent watch. Load it for any
  Playwright or e2e work: "write an e2e test", "add a Playwright spec", "the
  e2e suite is red", "a test is failing under e2e/", "npm run e2e", a plan
  under `specs/`, or a `test.fixme()` question. Not for unit tests
  (`npm --prefix frontend run test`) and not for a browser verification pass,
  which stays `real-browser-sonnet` through the chrome-devtools MCP.
---

# Playwright tests

The paths under `e2e/`, `specs/` and `projects/`, and `playwright.config.ts`,
are relative to `frontend/`, the Angular workspace, which is also the
directory `.mcp.json` starts the `playwright-test` server in, so the agents
name these paths the same way. A `.claude/` or `.github/` path is from the
repository root, and so is every command here, which is why a command names
`frontend/` itself.

## 1. When this skill runs

Any end-to-end work in this repository. Unit tests
(`npm --prefix frontend run test`) are not this skill's, and neither is
browser verification: a change to a rendered surface is still verified by
`real-browser-sonnet` through the chrome-devtools MCP under
`.claude/rules/browser-verification.md`. Playwright specs do not replace that
pass; they are regression tests that outlive the change.

Who may write a spec is settled in `.claude/rules/code-standards.md` ("Only
the `playwright-test-*` agents write end-to-end tests"): every `*.spec.ts`
under `e2e/` comes from `playwright-test-generator` or `playwright-test-healer`,
from a plan `playwright-test-planner` saved under `specs/`. The orchestrator,
a `coder-agent.sh` runner and every other agent keep out of those files.

## 2. The ground the agents stand on

- Layout: `e2e/seed.spec.ts` (the conventions file, read by every agent before
  it plans, generates or heals; **the conventions live there and this skill
  does not repeat them**), `e2e/integration/` (specs on the MSW-mocked app),
  `e2e/smoke/` (specs on the real backend), `e2e/fixtures/` (the `coverage`
  fixture every spec imports `test` from), `specs/` (the planner's Markdown
  plans).
- `playwright.config.ts` has eight projects: `seed` (only `e2e/seed.spec.ts`)
  and six `integration-{chromium,firefox,webkit}-{fullhd,mobile}` projects
  (each runs `e2e/integration/**`) start the development build with MSW on
  port 4400 (`E2E_PORT` overrides it); the fullhd and mobile viewports are
  1920×1080 and 390×844; only the Chromium projects collect V8 coverage
  through monocart-reporter, because `page.coverage` is Chromium-only. The
  `smoke` project (`e2e/smoke/**`) starts the `local-backend` configuration
  on 4410 and needs the backend running.
- Commands, from the repository root: `npm --prefix frontend run e2e` runs
  `seed` plus the two Chromium projects with the V8 coverage gate armed via the
  `onEnd` hook inside `playwright.config.ts` (Firefox and WebKit projects run
  without coverage); `npm --prefix frontend run e2e:all` runs the seed and every
  `integration-*` project; `npm --prefix frontend run e2e:smoke` runs the
  `smoke` project; `npm --prefix frontend run e2e:install` installs all three
  browsers. The CI matrix in `.github/workflows/frontend.yml` installs each
  matrix entry's browser per-job.
- The backend of `e2e/integration/**` is MSW inside the page. There is no server
  to seed: `projects/storefront/src/mocks/repository.ts` is page-side memory.
  `e2e/smoke/**` waits on the `local-backend` configuration.

## 3. Flow A: writing tests

Playwright describes the chain this way (https://playwright.dev/docs/test-agents,
read 2026-09-22): the planner "explores the app and produces a Markdown test
plan", the generator "transforms the Markdown plan into the Playwright Test
files", the healer "executes the test suite and automatically repairs failing
tests".

1. The orchestrator starts the app itself on 4401 or 4402
   (`.claude/rules/browser-verification.md`: starting servers is the
   orchestrator's); 4400 belongs to the config's own `webServer`.
2. Spawn `playwright-test-planner` with the screens, the user journey, the
   server URL and the seed path, so the plan's `**Seed:**` line reads
   `e2e/seed.spec.ts`. It calls `planner_setup_page` first, explores, and saves
   the plan with `planner_save_plan` under `specs/` (Playwright's own example is
   `specs/basic-operations.md`).
3. The orchestrator reads the plan and cuts it: **one `playwright-test-generator`
   spawn per top-level plan item**, never one spawn for the whole plan. The
   generator writes one test per file with `generator_write_test`, into
   `e2e/integration/` (or `e2e/smoke/`), and nothing else.
4. `playwright-test-healer` only when a generated test is red (flow B).
5. The orchestrator runs `npm --prefix frontend run e2e` itself and reads the
   exit code and the four `e2e coverage` lines. A subagent's green report is not
   a run (`.claude/rules/code-standards.md`).

## 4. Flow B: fixing a failure

Spawn `playwright-test-healer` with the failing test's title and file. Its loop
is `test_run` → `test_debug` → snapshot, console and network → edit → `test_run`
again. Two things its own definition says, both of which change how its result
is read:

- It is told "Do not ask user questions, you are not interactive tool, do the
  most reasonable thing possible to pass the test". It will not stop to ask.
- It may mark a test `test.fixme()` when it is confident the test is right and
  the application is wrong.

So **every healer run ends with the orchestrator running
`git diff -- frontend/e2e frontend/specs | grep -n 'test.fixme('`** from the
repository root: a green suite after a healer can mean a test was switched
off. The pathspec is relative to the directory git runs in, so a bare
`e2e specs` from the root matches nothing and reads as a clean result. A
`test.fixme()` the healer added names a defect in the application; it goes to
the user or to the unit that owns the production code (`.claude/CLAUDE.md`,
"Surgical changes"), never into a closing paragraph, and never gets fixed
inside the spec.

## 5. Watching the agents

They get stuck on a bad selector in Chrome, and a message alone does not
recover them: a subagent blocked inside a tool call reads nothing until that
call returns (`.claude/CLAUDE.md`, "Cleanup").

**One Monitor per spawned agent**, over the agent's own JSONL output file (the
Agent tool result names it), `timeout_ms: 1800000`, re-armed on expiry; one
watch per agent and nothing else. A noisy monitor is stopped unasked.

Four stuck signals, evaluated together in one 30-second poll so the monitor
emits only on a signal. The numbers are proposals measured on nothing yet
(`.claude/rules/planning-deliverables.md`); adjust them from the first real
runs and record what you measured:

1. the same tool with the same first 100 characters of input three times in a
   row;
2. four of the last six calls are `browser_snapshot` with no `browser_click`,
   `browser_type`, `browser_navigate` or `generator_write_test` between them
   (the snapshot loop);
3. a tool result carrying `Timeout NNNNms exceeded` or `strict mode violation`
   twice for the same locator;
4. no new tool call for five minutes, or a line matching `rate_limit|API Error`
   (a rate limit always goes to the user).

Signal 4 is why the watch is a poll and not `tail -f | grep`: silence is the
failure a stream filter cannot see.

```bash
# Monitor command; OUT is the agent's output file. macOS stat.
OUT="$1"; last=""
while true; do
  age=$(( $(date +%s) - $(stat -f %m "$OUT" 2>/dev/null || date +%s) ))
  calls=$(jq -rc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|"\(.name) \((.input|tostring|gsub("\n";" "))[0:100])"' "$OUT" 2>/dev/null | tail -6)
  rep=$(printf '%s\n' "$calls" | sort | uniq -c | sort -rn | head -1)
  n=$(printf '%s' "$rep" | awk '{print $1+0}')
  snaps=$(printf '%s\n' "$calls" | grep -c browser_snapshot || true)
  err=$(tail -c 20000 "$OUT" | grep -oE 'Timeout [0-9]+ms exceeded|strict mode violation|rate_limit|API Error' | tail -1)
  sig=""
  [ "${n:-0}" -ge 3 ] && sig="repeated call x$n: $(printf '%s' "$rep" | sed 's/^ *[0-9]* //')"
  [ "${snaps:-0}" -ge 4 ] && sig="snapshot loop: $snaps of the last 6 calls"
  [ -n "$err" ] && [ -z "$sig" ] && sig="$err"
  [ "$age" -ge 300 ] && sig="silent for ${age}s"
  [ -n "$sig" ] && [ "$sig" != "$last" ] && { echo "[$(date +%H:%M:%S)] $sig"; last="$sig"; }
  sleep 30
done
```

Tried once on 2026-09-22 against a finished `real-browser-sonnet` output file:
the `jq` line parses the harness JSONL and the repeat count is 1 on a clean
run; a seeded triple repeat counts 3.

The recovery, in order:

1. On the first signal, `SendMessage` naming the bad locator and the
   replacement to try. It lands only if the agent reaches another tool round,
   which is why it is not the whole answer.
2. If the same signal fires at the next poll: `TaskStop`, then a **fresh
   spawn**, never a resume (a session is not continued in this repository),
   carrying the plan item it was on, the files already written (listed from
   `e2e/` and `specs/` on disk, not from the dead agent's report), the banned
   locator with the timeout pasted, and the instruction to continue at the
   next unwritten scenario.
3. `ListAgents` afterwards; a row whose report was used holds a slot and gets
   `TaskStop`.

Not stuck: a long `test_debug` pause (the healer waits on a paused page), and a
`browser_navigate` right after an `ng serve` rebuild. Both resolve on their own.

## 6. The boundary

The three agents touch nothing outside `e2e/` and `specs/`. The planner and the
generator hold no write tool for source; the healer holds `Edit` and `Write`
and could reach anywhere, so every healer spawn prompt states the boundary
again. A production change an end-to-end test turns out to need goes to the
unit that owns that code, never into the spec.
