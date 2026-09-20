# scripts/coder-agent/

`coder-agent.sh` runs detached `claude -p` sessions and keeps their state in
`sessions/<name>/` next to it. stdout is machine output (one JSON object per
line), stderr is for humans, and `watch` is the one command written for a
human reader. `coder-agent.sh --help` is the full reference; this file is
what an agent needs to drive it.

## Driving a coder session

- Start in a directory:
  `scripts/coder-agent/coder-agent.sh start --name <n> --dir <repo> --prompt-file task.md -- <claude args>`
- Start in a fresh worktree:
  `... start --name <n> --worktree <branch> --repo <repo> --worktree-dir <workspace>/worktrees-<project> --pre 'pnpm install' --prompt-file task.md -- <claude args>`
  (worktree at `<workspace>/worktrees-<project>/<branch>`, never at the
  default `<repo>/.worktrees/`, per "Conventions measured in this workspace"
  below; `rm <n> --worktree` removes it, the branch stays).
- Permissions are the caller's job, after `--`. In `-p` mode the default mode
  denies every tool call that would prompt, and `--permission-mode auto` is
  ignored (measured on Claude Code 2.1.278: init reports `default`, Write is
  denied). `--permission-mode acceptEdits` allows edits but still denies Bash
  commands that are not allowlisted (a pipe such as `find ... | wc -l` was
  refused); `--dangerously-skip-permissions` allows everything.
- The `.claude/` of the working directory is loaded exactly as in an
  interactive session: CLAUDE.md, agents, skills, hooks, `.mcp.json`,
  `settings.json`. `settings.local.json` is git-ignored, so a worktree does not
  have it and its allowlist does not apply there.
- Environment for the claude process comes from `.env` next to the script
  (override with `CODER_AGENT_ENV_FILE`), dotenv format, parsed not sourced,
  given to claude only, never to the pre-commands. That env file holds live
  production credentials, so it is opaque whichever path
  `CODER_AGENT_ENV_FILE` resolves to: never read it, print it, grep it, or
  list its keys, not even with the values masked, and never copy any part of
  it into a prompt, a log or a tracker comment. The runner loads it itself;
  that it exists is all a driver needs to know (user, 2026-09-19:
  "scripts/coder-agent/.env olvasasa tiltott! mert production kodok vannak
  benne" — "reading scripts/coder-agent/.env is forbidden! because there are
  production codes in it"). When a turn fails on that file, diagnose it from
  the script instead: the header comment above `CLAUDE_ENV` and the
  `load_env_file` function are the whole of the behaviour, and on a bad line
  the runner fails the turn before claude starts and writes `<file>: line N
is not KEY=value` or `<file>: line N has an invalid variable name` to the
  turn's stderr (`logs <n> --stderr`) — the line number, never the line.
- Watchdog: `--idle-timeout SEC` ends a turn whose output has not grown for
  SEC seconds (status `hung`); `--max-time SEC` ends it after SEC seconds
  (status `timeout`). A long tool call emits nothing, so it counts as idle;
  size the idle value for the longest command the coder may run. Both are
  stored with the session; off when not given.
- Wait and read: `wait <n> [--timeout SEC]` prints the final result object and
  exits with claude's exit code; `result <n>` prints the final text (`--json`
  for the object; exit 1 when `is_error` is true).
- Follow state changes without polling: `watch-status <n|session_id>
[--follow] [--timeout SEC]` prints one JSON line per event and blocks in between:
  `snapshot` with the descriptor, then `change` with the changed field names
  and the full descriptor, `timeout` with exit 124. Without `--follow` it
  returns after the first change, with it once the session stops running.
- Continue: `resume <n> --prompt-file next.md [--wait]`. Refuses while the
  session runs (exit 3) and after a failed pre-command.
- Housekeeping: `list --json`, `status <n> --json`, `logs <n> --stderr|--pre`,
  `stop <n> [--force]`, `rm <n> [--force] [--worktree]`.
- Exit codes: 1 usage, 2 not found, 3 wrong state, 124 wait timeout, otherwise
  claude's own.

## Conventions measured in this workspace

- Worktrees for runner sessions go outside the repository they come from, in
  a directory at the workspace root, today `worktrees-mi-bolt-backend/`
  (user, 2026-09-19: "a worktree mappanak ne a projecten belul adjal meg
  mappat" — "do not give me a folder inside the project for the worktree
  folder"). `--worktree` takes the worktree name rather than a branch: the
  path is `<worktree-dir>/<name>` and the branch defaults to that same name
  unless the separate `--branch` flag overrides it. So pass the branch as the
  worktree name and leave `--branch` off:
  `--worktree-dir <workspace>/worktrees-<project> --worktree <branch>` puts
  the worktree at `<workspace>/worktrees-<project>/<branch>`, where a `/` in
  the name nests a directory.
- Every `--pre` path that points outside the worktree has to be absolute. A
  pre-command runs with the new worktree as its working directory, so a
  relative hop resolves from wherever that worktree now sits: the measured
  case is the `--pre` that copies the spring-tools jar, which needs the
  absolute source path instead of the `../../` that reached it from the
  default `<repo>/.worktrees`.
- Every brief carries "You MUST execute every command with the Bash tool and
  paste the real tool result; invented output is a failure", every report
  carries `bash_tool_calls_made`, and the caller cross-checks it against the
  tool_use count in `logs <n> | jq` before trusting the report. Measured
  2026-09-19: without such a sentence the runner's model fabricated every
  command output of a turn without making a single tool call.
- The runner commits and stops there. In `-p` mode `git push` was denied even
  with `--allowedTools "Bash(git push:*)"` (measured 2026-09-19), and what
  denied it has not been identified: no `ask` rule in this workspace matches
  `git push`. So `--allowedTools` cannot be relied on to grant that command.
  The push and the pull request are the orchestrator's in any case, per
  `.claude/CLAUDE.md` ("How I work: coordinate, do not do").
- A cross-session `SendMessage` to a running `-p` session is delivered at its
  next tool round (measured 2026-09-19: enqueued and injected as a user
  attachment about 5 s after the send). `logs <n>` omits injected messages,
  so delivery is checked in the session's own transcript,
  `~/.claude/projects/<dir-slug>/<session_id>.jsonl`. `resume` stays the
  channel between turns.
- Size `--idle-timeout` at 2400 or more, or leave it off: a subagent run
  inside the session is one tool call that emits nothing for its whole
  length, which the watchdog above counts as idle. `--max-time` is the real
  guard and is set whatever the idle value is; the measured T3 run used
  `--idle-timeout 2400 --max-time 7200` for a unit of that size.
- A `-p` session kills every background process it started when its turn
  ends (measured 2026-09-19: a Chromium under a running import died with
  "Target page, context or browser has been closed"), so a brief whose work
  outlives one command says how to wait for it: start it in the background,
  poll it in the foreground with `sleep N && tail`, and never end the turn
  while it runs. "Wait for the orchestrator" is not an instruction such a
  session can follow, because it has no way to sit idle and stay alive; the
  go comes in the same brief or in the next `resume`.

## Statuses

`running`, `done`, `failed`, `stopped`, `hung`, `timeout`, `pre-failed`,
`crashed` (pid file left behind, process gone).

## Do not

- Do not parse `sessions/` files for results; use `result` or `wait`.
- Do not start a second turn on a running session; `resume` refuses.
- Do not run `watch` from a script; it is for a person at a terminal. Its
  history pass prints the main transcript and each subagent file in turn, so
  only the live part is in chronological order across agents.
