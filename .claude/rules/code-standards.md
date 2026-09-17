# Code standards

Loaded at launch as a project rule. Deliberately not `paths`-scoped: the
`any` / `as` ban must be in context before the first file is written, and
path-scoped rules trigger only on a read.

- Well-documented codebase, not over-explained.
- A `CLAUDE.md` belongs at the top of an area, not in every subdirectory
  under it. `scripts/CLAUDE.md` and `.claude/hooks/CLAUDE.md` each document
  their own tool's layer split and modules; those tools' `cli/`, `io/`,
  `analysis/`, `store/` and `search/` directories get no file of their own, so
  there is one place to read and one place to keep current. The file that
  exists is kept maintained. `.claude/rules/` has none because every `.md`
  there is loaded as a rule; it is documented in `.claude/CLAUDE.md` instead.
- Modern TypeScript: proper use of functional and OOP programming; generic
  interfaces are mandatory.
- Strict generics. `as` is forbidden; use `satisfies`. `any` is forbidden; use
  `unknown` plus a type guard or a generic interface.
- Always use the type guards that already exist in the project. If none fits
  and one is needed, write it.
- No machine-specific path in any committed file: no home directory, no
  `~`, no temp directory, no Claude Code project slug, no `file://` link to a
  local checkout. Locations are derived at runtime (hook input, environment
  variables, `import.meta.dirname`) or written repo-relative; docs describe
  them generically ("the user-level config file").
- **A name says what it operates on, and who owns it.** A script, a script
  directory, or a `package.json` script is named after the thing it acts on,
  not after the jargon of the technique: `coverage-changed-lines`, not
  `patch-coverage`. Anything belonging to one tool is namespaced with that
  tool's prefix, so `claude:hooks:test` rather than `hooks:test`. The test is
  whether a reader who returns in two days can tell what the name does
  without opening the file. A script directory with more than one file keeps
  its modules in named subdirectories with a `CLAUDE.md`, the same as
  `.claude/hooks/`.
- Every user-visible change is tested in a real browser with the
  chrome-devtools subagent, per `.claude/rules/browser-verification.md`.
  Typecheck and unit tests alone are never enough.
- **100% changed-line coverage.** Every line a commit adds or modifies is
  covered by a unit test in that same commit, and `pnpm coverage:changed-lines`
  is what says so: run it before committing, and it exits non-zero listing
  every uncovered `file:line`. Run it in its bare form there: `--base` and
  `--range` compare commit to commit, so run before a commit they measure only
  what is already committed and see none of the work that commit is about to
  carry, while the bare form prints `Comparing working tree against HEAD,
  including untracked files.` A `--range` run made before the commit reported
  `55/55` for lines that were already committed, and that number reached the
  commit body and the gate report reading exactly like a green gate; the same
  change measured `52/52` once it was committed. Where the gate ran in either
  of those two forms, it is re-run in that same form after the commit and that
  later number is the one recorded. The bar is the diff, not the repository:
  pre-existing uncovered code does not block, and whole-repo coverage is not
  the target. Covered means executed *and* asserted on. A line a test merely
  runs through on its way somewhere else is not covered, and neither is a line
  whose only assertion is a snapshot. When a fix changes a branch condition,
  every arm of it gets a case. When the gate reports `Cannot measure
  changed-line coverage: the suite failed in <package>`, first confirm the
  failure is outside the diff by running that package's suite on its own. If
  it is pre-existing and unrelated, rerun the gate with
  `pnpm coverage:changed-lines --skip-run`, which reads the coverage reports
  already on disk, and record in the commit body which suite was red and why
  it is not this change's. A failing suite inside the diff is never skipped,
  it is fixed.
- **"Pre-existing" is decided against the branch's merge base, not against
  which agent wrote the file.** A red typecheck, test, or lint result counts
  as pre-existing only when `git diff --name-status <base>...HEAD` does not
  list the failing file; the three dots are what start the comparison at the
  merge base. A file a sibling agent added twenty minutes ago is on the
  branch, so its errors belong to this branch's work, and
  `mk-migrations.spec.ts` was called pre-existing on exactly that mistake.
  That diff reads committed history, and the gates run before the commit, so
  a file `git status --short` shows as modified or untracked is this session's
  own work rather than pre-existing, whatever the branch diff says.
  `<base>` is the branch this work was cut from, the one it traces back to,
  and that is `main` only for work cut from `main`: this workspace stacks
  branches, so on one cut from an integration branch, naming `main` counts
  every stream already merged below it as this branch's own. Measured on the
  PX-614 branch on 2026-09-07, `main...HEAD` listed 451 files where
  `origin/feature/PX-488...HEAD` listed 15, and six of the 436 extra were the
  very spec files being classified, added by an earlier stream and never
  touched on this branch. A session that does not know what its branch was cut
  from can usually read that off the pull request this branch opens, whose
  base is the same branch while the stack is open, but that answer expires:
  GitHub retargets an open pull request to the merged pull request's base when
  the branch it was based on is merged and deleted
  (https://github.blog/changelog/2020-05-19-pull-request-retargeting/, read
  2026-09-07). This stack does exactly that: measured 2026-09-07,
  `git ls-remote --heads origin` no longer listed `px-611`, `px-612` or
  `px-613`, each merged into `feature/PX-488` and deleted, so a pull request
  based on `feature/PX-488` answers `main` once that branch goes the same way,
  putting those 451 files back in the diff. Where there is no pull request, or
  one whose base may have been retargeted, the candidates are this
  workspace's shared branches, `main` and whatever integration branch this
  stack sits on, and what `git branch -r` prints is not that list: 73 refs
  here on 2026-09-07, nearly all of them peers' feature branches, this
  branch's own among them. Name whichever copy of a candidate, local or
  remote-tracking, contains the commit this branch was cut from, since a copy
  behind that commit drags the parting point back and puts the base's own
  files in the diff; that is `origin/<base>` in this workspace, because
  branches are cut from the remote-tracking ref after a fetch, per
  `.claude/rules/session-lifecycle.md` ("Commits"), and the local branch of
  the same name is the copy that drifts behind it. Rank the
  candidates by where each one's history parts from this branch rather than
  against each other, since `<base>...HEAD` diffs from that parting point:
  the base is the candidate that credits this branch with the fewest commits
  above zero, and
  `git rev-list --count "$(git merge-base <candidate> HEAD)"..HEAD` prints
  that count for one candidate, so run it for each and name the smallest. A
  zero is a broken input rather than a winner, and it arrives two ways, both
  measured on that branch on 2026-09-07. A candidate that already contains
  this branch's tip parts from it at the tip, so it scores 0 while
  `git diff --name-status <candidate>...HEAD` lists no files at all and every
  red file reads as pre-existing; `git branch -r --contains HEAD` names those,
  this branch's own remote-tracking ref included. A ref that does not resolve
  scores 0 as well, because the empty command substitution leaves `..HEAD`,
  which git reads as `HEAD..HEAD`: `fatal: Not a valid object name` goes to
  stderr, `0` goes to stdout, the exit status is 0, and an unfetched or
  mistyped name outranks every real base. Fetch, correct the name, and run it
  again. Comparing the candidates to each other answers nothing once they have
  diverged, which is what an integration branch looks like as soon as anything
  else lands on `main`: on that same branch `git merge-base --is-ancestor`
  exited 1 in both directions between `origin/main` and
  `origin/feature/PX-488`, while the counts were 273 and 14. The `--skip-run`
  rerun above is allowed only after this test passes.
- **A subagent's green report is not a run.** Before every commit the
  orchestrator itself runs `mise exec -- pnpm --filter <app> typecheck`, that
  package's `test` script, and `mise exec -- pnpm coverage:changed-lines`, and
  reads the exit codes. One agent reported `pnpm --filter plan typecheck`
  green while it was exiting 1 with two TS2322 errors in a spec file that same
  agent had just written; the next agent called those errors pre-existing
  after checking only that its own files were not the cause. Both reports were
  sincere, both were wrong, and the error reached the orchestrator twice.
- Layers a unit test cannot reach are excluded in the coverage configuration,
  never by ignore comments scattered through the source: shell scripts, docker
  compose files, docs, generated files, and the spec files themselves. The
  exclusion list lives in one place so it can be read and argued with. For
  those layers the evidence is an executed command and its verbatim output,
  recorded in the report or the commit body, exactly as the shell script work
  on this branch was verified.
- **Absence is never proven from `apps/` and `packages/` alone.** This
  workspace patches the framework: `pnpm-workspace.yaml` registers
  `patches/@agent-native__core@<version>.patch` against `@agent-native/core`,
  and the patch is applied on disk. Before writing that a subsystem, table,
  route, or plugin is unused, also search `patches/`, the installed
  `node_modules/@agent-native/core/dist/`, `docs/databases.md`, and the
  `apps/*/server/plugins/*migrations.ts` files. A default plugin the patch
  removed is dead no matter what app code says, and a table the apps migrate
  is live no matter what app code says.
- **A `@agent-native/*` patch is allowed, and it is the second answer.** The
  user granted this standing, qualified "ha szukseges" ("if necessary"), so an
  app-side fix is what gets tried first and the commit body says which one was
  tried and why it could not reach the break. Build the patch with
  `mise exec -- pnpm patch <pkg>@<version>` and
  `mise exec -- pnpm patch-commit <dir>` rather than editing
  `node_modules/@agent-native/*` by hand, which the next install throws away,
  then check that the entry landed in `pnpm-workspace.yaml` under
  `patchedDependencies`. Its key is what decides the reach, and the patch file
  is named after the key: pin the version for a patch written against one
  release, as `@agent-native/core@0.175.0` does, and leave the version off for
  one meant to survive a bump, as `@agent-native/dispatch` does. The key also
  decides what a later bump does when the patch stops applying: with neither
  `ignorePatchFailures` nor `allowUnusedPatches` set anywhere in this
  workspace, pnpm 10.29.1, the version `packageManager` pins, fails the install
  for a version-pinned key and only warns for a bare-name one, leaving that
  package unpatched. A patch is a divergence from upstream that somebody
  re-applies, rewrites, or drops at every core bump, and is carried by hand
  from then on. That toll is why the patch is the second answer and not the
  first.
- **Grep the identifier as the repository spells it.** Skill and doc prose
  uses hyphens (`data-programs`); tables and columns use underscores
  (`data_programs`, `data_program_shares`). Run both spellings, plus the
  camelCase form, before concluding a name has zero hits.
- **A "symlinked into app X" claim is checked, not assumed.** `ls -la
  apps/*/.agents/skills` distinguishes symlinks from real directories, and
  several of those directories are divergent copies rather than links.
- **A cut feature leaves nothing behind, and the database is not a reason to
  keep any of it.** When the user cuts a block type, a route, a database column
  or a feature, it goes out of every layer in the same change: the type union,
  the parser, the serializer, the renderer, the registry, the schema
  definition, the fixtures, and its tests, e2e included. No compatibility
  shim, no "it still parses so an old document does not fail", no code parked
  against a future rebuild. The stored data is not a reason to keep one
  either: a row left in a shape the code no longer knows is not a case to
  design for, and a migration that preserves one is work spent on a
  hypothetical. The migration to write is the one that removes it, which the
  user settled with "Séma és drop migráció is" ("the schema and a drop
  migration too"): the column leaves the schema definition with the code, and
  the same change adds a migration that drops it. What is never removed is the
  migration that created it. The fork set is name- and version-tracked in
  `apps/<app>/server/plugins/*migrations.ts` against its own bookkeeping
  table, per the root `CLAUDE.md` ("Fork Discipline"), so deleting an entry
  leaves an applied name with nothing behind it and hands a fresh database a
  drop for a column it was never given: "we leave no rubbish" reaches the
  code, not the record of what the schema has already done. This binds the
  code the current change makes dead; pre-existing dead code that nothing here
  touches stays where it is, per `.claude/CLAUDE.md` ("Surgical changes").
  `columns` and `tabs` were kept in the `PlanBlock` union, in the MDX importer
  and in the serializer under a "deferred scope" heading on exactly that
  reasoning, and the answer was "de
  nem!!!!!!!!! elmondtam mar millioszor mvp, nem hagyunk szemetet, es nem szamit
  a db!!!!!!! es nincs legacy kod iras!!!!!" ("but no!!!!!!!!! I have said a
  million times, MVP, we leave no rubbish, and the db does not matter!!!!!!! and
  there is no writing legacy code!!!!!"); both went out entirely, e2e tests with
  them.

