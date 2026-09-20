# Orchestrated coding

Governs a build where the orchestrating session plans and verifies while the
product code is written elsewhere: by an interactive coder session, or by a
detached `claude -p` session started with `scripts/coder-agent/coder-agent.sh`,
whose driver reference is `scripts/coder-agent/CLAUDE.md`. It covers when a
build is orchestrated at all, who codes and who merges, where a runner's
worktree and its environment file stand, how many runners may run at once,
what they review themselves and how each is supervised, when a reviewer pass
may start, the review cap, what a brief carries, and how large a unit may be.
Loaded at launch as a project rule (no `paths` scope, so it reaches every
subagent except the built-in Explore and Plan agents).

## Who codes and who merges

- **A build is orchestrated from the moment the user names a coder session or
  a `coder-agent.sh` runner for the work**, and not before: until then coding
  routes through the `model-routing` table like any other task. The
  orchestrator never moves a build across that line on its own judgment,
  because everything else in this file follows from the user having asked for
  a second session, and assuming one applies these rules to work they do not
  govern.
- **`scripts/coder-agent/.env` is never read**, printed, grepped or listed,
  not even its key names with the values masked, and nothing out of it reaches
  a prompt, a log or a tracker comment. It holds live production credentials
  (user, 2026-09-19: "scripts/coder-agent/.env olvasasa tiltott! mert
  production kodok vannak benne" — "reading scripts/coder-agent/.env is
  forbidden! because there are production codes in it"), and the runner loads
  it itself, so nothing a driver does needs its contents.
- **A message to the coder session or the runner of an orchestrated build is
  part of briefing** and needs no separate question to the user, who named
  that session when they asked for the build. Any other cross-session message
  stays an outward-facing action under `.claude/CLAUDE.md` ("Asking the
  user").

## Runner sessions

- **At most two runner sessions run at once**, because the account hits a
  session limit, so the rows `coder-agent.sh list` shows as `running` are
  counted before every `start` (user, 2026-09-19 23:03Z: "60 perc múlva újra
  futhat maximum 2 párhuzamosan" — "in 60 minutes at most 2 may run in
  parallel again"). The user may lower the cap to one for a while ("most amíg
  nem szólok, ha leáll egy coder-agent akkor csak 1 fusson tovább mert
  session limitet fog kapni" — "for now, until I say otherwise, if a
  coder-agent stops let only 1 carry on, because it will hit a session
  limit"), and the lower cap holds until they lift it.
- **Every runner brief except T3's orders a `code-review xhigh --fix` pass
  before the runner reports done**, the `start` command allows the Agent and
  Skill tools so it can run one, and the report carries a `code_review` field
  with the result; the orchestrator then confirms in the runner's transcript
  that the Skill call happened, because a report is not a run. The
  instruction is the user's (2026-09-19 ~21:45Z): "agent-coder-eknek ezentúl
  mielőtt készre jelentik a munkát kötelező futtatni a
  `/code-review xhigh --fix` skill-t ... (T3-ra nem vonatkozik)" — "from now
  on the agent-coders must run the `/code-review xhigh --fix` skill before
  they report the work done ... (it does not apply to T3)", T3 being the
  TypeScript import script. The pass sits inside the coder's own turn and is
  not one of the two reviewer passes under "Review cap" below.
- **Each runner is supervised by exactly two Monitor tool watches**, and
  both are quiet by construction. The first is
  `coder-agent.sh watch-status <name> --follow --timeout 1780 --interval 5`,
  one event per state change (start, done, blocked, hung, timeout); it is what
  catches a runner stuck inside a tool call, through the runner's own
  `--idle-timeout`. The second is the scope-and-failure watch on the runner's
  transcript and working tree, and it emits only what the orchestrator would
  act on: a tool result with `is_error`, a refused permission, `BUILD FAILED`,
  a non-zero test failure count, and, checked every four minutes from
  `git status --short`, any path the brief did not list. It never emits the
  runner's ordinary commands: an event per `./gradlew`, `git add` and
  `git commit` cost one session more tokens than the runner it watched
  (user, 2026-09-20, in English: "the monitor is not good, you get signals
  too often and it costs a lot of tokens"; then "but if you do not watch the
  transcript, how do you know it is not doing something stupid or getting
  stuck?"). The transcript watch is written so that it ends when
  `watch-status` does: a bare `tail -F` outlives the session, which is how a
  T4a monitor was still armed after its runner had finished ("t4a egyik
  monitorja nem állt le, miért?" — "why did one of t4a's monitors not
  stop?"). `scripts/coder-agent/CLAUDE.md` owns what `watch-status` prints
  and how it is called.
- **A noisy monitor is stopped without being asked.** Only the signals the
  orchestrator would act on stay armed, and a monitor printing every few
  product lines is the orchestrator's to stop under `.claude/CLAUDE.md`
  ("Cleanup"); the user had to ask twice before one was ("akkor ami zaj
  miért nem állítod le?" — "then why do you not stop the noise?").
- **A small follow-up fix goes to the running runner as a steer, not to a
  round of its own, when the runner's current unit is itself small.** The
  steer carries the same spoon-fed content a brief would (the test, the exact
  code, the commit command) and lands through SendMessage while the runner is
  still on the unit; a large unit, or a fix that changes the unit's design,
  still gets its own round. The user set this on 2026-09-20 (in English:
  "you can hand such small fixes to the running agent, I think, if it is
  doing a small task, but only then, and no separate round is needed").
- **The brief's acceptance list is measured by the orchestrator, never taken
  from the report**, and the working tree is spot-checked against the brief's
  items while the runner is still on the unit rather than only at the end
  (user, 2026-09-19: "azt is figyeled hogy azt csinálják-e amit kértél
  tőlük?" — "are you also watching whether they do what you asked of them?").
- **A runner's finished work is verified by a spawned `coder-sonnet` agent
  before it lands, and the cherry-pick or the branch merge waits on that
  verdict.** The orchestrator's own measurement of the acceptance list, in the
  bullet above, does not replace it: that read checks whether the commands the
  brief named still print what it said they would, while this one is a second
  agent reading the diff against the brief and asking what the brief could not
  anticipate, above all whether a site the brief told the runner to preserve
  now behaves differently for some input. The verifier writes nothing, commits
  nothing, and runs no gate that would contend with the orchestrator's own run:
  it reports, and where it wants a gate it says so and the orchestrator runs it.
  A `blocking` finding goes back to the runner as a fix round rather than onto
  the branch. This is neither the runner's own `code-review xhigh --fix` pass,
  which sits inside the runner's turn and is the runner grading itself, nor one
  of the two reviewer passes under "Review cap" below, which are about a pull
  request. **The cherry-pick and the worktree's removal are one step, not
  two.** The moment the commit is on the branch, the worktree and its branch
  go: `coder-agent.sh rm <name> --worktree` and then `git branch -D <branch>`,
  in the same turn as the cherry-pick rather than at the end of the session.
  What settles that a runner is finished with is `git cherry <this branch>
  <runner branch>`, where a leading `-` on every line means an equivalent of
  each commit is already on the branch; a `+` means it is not and the worktree
  stays. Leaving them costs nothing visible and so accumulates: five worktrees
  and six branches sat on disk before the user asked, for the second time in
  one session, "worktree -ket megint nem kezeled ott vannak hagyva mint egy
  szemet! commitokat atvetted?" ("you are not handling the worktrees again,
  they are left lying there like rubbish! did you take the commits over?"),
  and then "miert kell erte szolnom?" ("why do I have to tell you to do it?").
  The answer is that it was not attached to a step; now it is. The tier is the
  user's and departs from the `model-routing` row for
  adversarial verification, which would send a review to `reviewer-opus`: the
  instruction names `coder-sonnet`, so `coder-sonnet` is what runs, and a later
  session reading that row is not finding an inconsistency to tidy away. The
  user's instruction, 2026-09-20: "ne felejtsd el ellenoriztetni
  kell coder-sonnet agenttek a coder-agent munkajat" ("do not forget, the
  coder-agent's work has to be verified with coder-sonnet agents") and "es ha jo
  utana cherry pick vagy brancj merge a jelenlegibe" ("and if it is good, then
  cherry-pick or branch merge into the current one").

## Review cap

- **A reviewer pass on a runner's pull request starts only once its check
  run is green.** The check is read on the pull request's current head sha,
  the way "The orchestrator is the merge gate" under "Who codes and who
  merges" above prescribes, and a check that is red goes back to the runner
  as a fix round rather than to a reviewer: a brief carrying the failing
  job's log excerpt, sent with `coder-agent.sh resume`. The runner's own
  `code-review xhigh --fix` pass under "Runner sessions" above is unchanged
  by this: it still runs before the runner reports done, and it is still not
  one of the two reviewer passes. A review of a pull request whose check
  fails is spent on a diff the runner will change anyway, and the failure is
  the runner's to fix. The instruction is the user's (2026-09-20 ~00:30Z,
  in English): "from now on, a PR made by a coder-agent has to be waited
  for: no review starts until then, because if the PR fails there is no need
  for a review yet, and the PR failure has to be handed back to the
  coder-agent; if the PR does not fail, the review we do here may start (the
  coder-agents still have to run the code-review skill)".
- **Two reviewer passes per unit, then one self-verified fix round.** The
  first pass reviews the pull request, the second is a fresh reviewer on the
  fixes. A blocking finding still open after the second pass gets one more fix
  round, verified by the orchestrator itself against that specific finding
  (the build, the coverage lines, a targeted grep or probe) and never by a
  third reviewer pass; still blocking after that, the finding and the ways out
  go to the user through AskUserQuestion. The instruction is the user's: "ne
  legyen végtelen review körök" — "no endless review loops". Two is the
  orchestrator's own number, proposed in the MIM-205 execution plan on
  2026-09-19 to implement that instruction; the quote carries the
  instruction, not the number.
- **A reviewer finding outside the unit is never fixed inside it.** It goes to
  the unit that owns it, or to the user; `.claude/CLAUDE.md` ("Surgical
  changes") owns how it is raised.

## Briefs

- **A brief is English, prescriptive, and every acceptance criterion is
  measurable**: a command to run and an output to match, not an adjective.
- **A brief spells every item out, because the runner model does not
  infer.** Each item carries the file and line anchor, the exact identifier,
  selector, constant or signature to write, the exact command that proves it
  and the output that command must print, and a "read these files first" list
  naming the getters and types the unit will call. A design choice, such as
  how to keep an entity and a generated model apart without a fully qualified
  name, is made in the brief, and the previous reviewer pass's check commands
  go into the next brief's acceptance list verbatim. The user asked for this
  after counting the rounds (2026-09-19 23:49Z: "figyelj oda az erős
  promptolásra inkább legyen szájbarágós ... nagyon sok javítási kör van még
  mindig" — "pay attention to strong prompting, let it rather be spoon-fed
  ... there are still very many fix rounds"): T3 needed four fix rounds and
  T4a three on briefs that named the rule but not the line, and the T4b
  runner compiled five times against guessed getter names.
- **The orchestrator supplies every fact the coder cannot look up**, which is
  now the fallback rather than the rule: "What a runner may reach for" below
  gives every runner the Angular CLI MCP and a web search, so `start` and
  `resume` no longer pass `--disallowedTools WebSearch WebFetch`. A fact those
  tools cannot settle still comes from the orchestrator, and the runner reports
  `blocked` rather than guessing.
- **Numbers the unit needs are in the brief before it goes out.** A
  configuration value comes from the user or from the project's own docs, and
  the brief says which. The number of a decision record the unit will write is
  the next free one, read from `docs/decisions/` and from the orchestrator's
  ledger of numbers already claimed by units still open on their branches: the
  directory alone is not enough, because on 2026-09-19 it ended at 0006 with
  0005 missing, while T3 held 0005 and T4a held 0007 on unmerged branches, so
  the next free number was 0008. `.claude/rules/planning-deliverables.md` owns
  where a configuration value may come from.
- **Every rule the brief dictates is checked against the project's own docs
  first.** A dictated "422 for an invalid query parameter" contradicted the
  docs and came back as a review finding: the brief was wrong, not the coder.
- **The brief dictates the exact commit commands, because the runner's `-p`
  sandbox refuses the usual ones**: `git add -- <paths relative to the
  shell's cwd>`, then `git commit -m "<subject>" -m "<body>" -- <the same
  paths>`, and the brief names that cwd, since a `pnpm` pre-step can leave
  the shell under `scripts/…`. Measured on 2026-09-19, on the T3 fix round
  that was stopped over it: a `-F` message file outside the worktree is
  blocked by the sandbox and one inside it shows up in `git status`,
  `git -C <abs> add` does not match the `Bash(git add:*)` allow prefix and is
  refused, and heredocs and `$(...)` are denied by the classifier. A runner
  never invokes the `git-commit` skill either: every git command that skill
  runs is a `git -C <repo>` one, and an awkward message sends it to a quoted
  heredoc and `commit -F`, so it meets those same refusals.
- **A spawned agent that invokes the `git-commit` skill from a worktree names
  the repository explicitly**, passing the worktree's own absolute path as the
  skill's `repo:` argument. Without it the skill resolves a different checkout:
  measured 2026-09-20, an agent working in a scratchpad worktree invoked it
  bare and the skill reported the orchestrator's main checkout's modified
  files, `.claude/rules/orchestrated-coding.md` and `.claude/settings.json`,
  neither of which existed in that agent's tree. It refused to commit, because
  the files it had been asked to stage were not there, so nothing landed in the
  wrong tree; a run whose paths happened to exist in both would not have
  refused. This binds the agents this session spawns rather than the `-p`
  runners, which never invoke that skill at all, for the reason the bullet
  above gives.

## What a runner may reach for

- **The Angular CLI MCP is mandatory for every runner, and so is a web search
  before it guesses.** A runner's model is older than this stack: Angular 22,
  TypeScript 6 and ESLint 10 all post-date its training, so a fact it recalls
  about them is a guess wearing a fact's clothes. The brief says, in as many
  words, that any question about how Angular, the CLI or the builder behaves is
  answered with `mcp__angular-cli__search_documentation` (`version: 22`,
  `includeTopContent: true` for the page text, keywords rather than a sentence)
  or `mcp__angular-cli__get_best_practices`, and that the URL goes in the
  report beside the claim. `.claude/rules/framework-facts.md` owns the rule
  itself and the ban on discovering documented behaviour by building a probe;
  this bullet is what puts it in a runner's hands. The user set it after a
  spawned agent measured `<ng-content>` behaviour with a probe component:
  "nagyon uj angular verzioval foglalkozzunk amit nem ismertek, tippelgetes
  helyett weben le van irva minden!" ("we are working with a very new Angular
  version that you do not know, instead of guessing everything is written down
  on the web!").
- **Web search reaches a runner through `minimax-mcp-server`, and the start
  command turns it on.** That server is configured at user scope, in the
  user-level Claude config file rather than in this repository's `.mcp.json`,
  and exposes two tools, `web_search` and `understand_image` (measured
  2026-09-20 by a JSON-RPC `initialize` plus `tools/list` against the command
  that config names, which answered `Minimax 1.30.0`; the `tools/list` returns
  nothing until the `notifications/initialized` message has been sent). A
  runner worktree does not escape a per-project disable, whatever its path
  suggests: `disabledMcpServers` is keyed by project directory, and a git
  worktree resolves to the main repository's entry rather than to one of its
  own, so while the server was disabled for this repository `claude mcp list`
  run inside a runner worktree printed `minimax-mcp-server: ... - Disabled for
  this project`, and the same command from `/tmp` or from the home directory
  printed `Connected` (measured 2026-09-20; the listing is working-directory
  sensitive, which is what makes the pair of readings the test). The user
  enabled the server for this project on 2026-09-20, and that same command in
  the worktree now prints `Connected`, so nothing has to be passed to unblock
  it. `--allowedTools` still names `mcp__minimax-mcp-server` and
  `mcp__angular-cli` alongside the Bash prefixes, because in `-p` mode an MCP
  tool that is not allowed is denied like any other. The user's instruction: "tegyuk kotelezove a netes kereses nekik ...
  mert regi modelek es angular 22 -t meg nem ismerik" ("let us make web search
  mandatory for them ... because they are old models and do not know Angular 22
  yet").
- **A runner that still cannot settle a fact reports `blocked` and says what it
  would have searched for.** It never guesses and never invents an output. The
  orchestrator then measures the fact and sends it in the next `resume`, which
  is what "The orchestrator supplies every fact the coder cannot look up" under
  "Briefs" above has always meant; the search tools narrow how often that is
  needed rather than removing the fallback.
- **The runner gets `/tmp` as a second writable directory**, passed as
  `--add-dir /tmp`. Without it the sandbox blocks a redirect there — measured
  2026-09-20: `npm run test > /tmp/test-output.txt 2>&1` came back "Output
  redirection to '/tmp/test-output.txt' was blocked. For security, Claude Code
  may only write to files in the allowed working directories for this session".
  The user asked for it directly: "adjal ezentul a `/tmp` -hez is irasi jogot a
  coder-agent -eknek" ("from now on give the coder-agents write access to
  `/tmp` as well").
- **The brief lists the command shapes the sandbox accepts, up front, because
  each refusal costs a whole tool call.** Measured 2026-09-20 across two
  runners: a pipe (`find ... | xargs grep`), an output redirection, a
  multi-operator chain (`a | b; c`) and `git checkout --` were each refused,
  four wasted calls between them. `$(...)`, heredocs and `find` go the same
  way. So the brief says plainly: run a bare command and read the tool result,
  which already carries both the output and the exit code; use the native
  `Grep` and `Read` tools for anything a pipe would have done. `git checkout`,
  `git restore`, `git reset`, `git stash` and `git clean` are refused by the
  sandbox and forbidden by `.claude/rules/session-lifecycle.md` in any case, so
  a runner that has edited a file outside its list leaves it edited and says
  so: staging by explicit pathspec already keeps it out of the commit, and the
  worktree it dies in is the orchestrator's to remove.

## The self-check block

Every brief carries this block and every report answers it: the T2 reviews
found six tests that asserted nothing and ten added lines no test executed.

- **Coverage is the build's two gates, not a per-line list.** The report
  states that `jacocoTestCoverageVerification` passed with both rules, bundle
  LINE ≥ 0.90 and every class LINE ≥ 0.80 (`build.gradle`,
  `docs/decisions/0004`, generated `api/**` and the application class
  excluded), and names any class the rule flagged and the test added for it.
  The per-line list and "a line no real route can reach is deleted" were
  retired on 2026-09-20 (user, in English: "let us lower the 100% coverage
  requirement for the backend because it slows things down a lot ... this is
  a demo MVP app that will never go live"): they cost
  T4b and T8 a fix round each on unreachable branches. `.claude/CLAUDE.md`
  ("Goal-driven execution") owns the bar and the exclusions.
- **An invariant → test table.** Every rule in the brief names the test that
  proves it and the single production line whose removal makes that test fail.
  A test that stays green after the removal is not proof.
- **Exact-value assertions.** `.exists()`, `isArray()`, `isNotEmpty()` or a
  count alone do not settle a value the brief specifies.
- **Booted-app probes.** The brief's curl list is run against the started app
  with the outputs pasted, then the app is stopped and confirmed gone.
- **Command-backed claims.** Every sentence about repository state quotes a
  command run in that same turn.
- **The report carries `self_check`** (`coverage_gates`, `invariant_tests`,
  `probes`), `tasks_done` (the coder's own list entries completed that turn,
  by id and subject) and `open_tasks` (every entry still pending or in
  progress, or `none`); a report missing a field goes back for it before the
  work is verified. The last two are the user's ask: "ezentul kerd hogy a
  jelentesebe mindig irja le milyen taskokat csinalt es van-e nyitott task-ja
  meg" — "from now on ask it to always write in its report which tasks it did
  and whether it still has an open task".

## Unit size

- **A unit is sized to what one reviewer pass can hold.** One bundling a
  schema, a loader, media handling and a facet engine is split before its
  brief goes out: T4 became T4a (schema, loader, media) and T4b (catalogue
  API) once the T2 review load was known.
- **A plan task is not a runner unit.** Before the brief goes out the task is
  cut into units one runner pass can hold, with the tests a unit of their own
  where they can be, the split the `model-routing` skill ("Size the task
  before you route it") already makes for a spawn: a catalogue API is the read
  model and mapper, then list, facets and sort, then detail and related, then
  the API tests, run in sequence on one branch or in parallel on branches of
  their own, within the cap under "Runner sessions" above. The user asked for
  it on 2026-09-20, at 00:03Z ("arra is figyelj hogy egy task != egy
  coder-agent -vel, megfeleloen darabolj" — "also mind that one task != one
  coder-agent, split it appropriately") and at 00:05Z ("peldaul t4b -nel
  szerintem teszteket biztos fel lehetett volna osztani" — "for example at T4b
  I think the tests at least could have been split off"), after T4b went out
  whole (controller, service, mapper, two test classes, a decision record) and
  took four orchestrator steers mid-run before its first green build: guessed
  getter names, an entity/generated-model name clash, a
  `MultipleBagFetchException` from fetch-joining two Lists, and `@Validated`
  turning validation into 503s.
