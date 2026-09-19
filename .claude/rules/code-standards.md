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
  not after the jargon of the technique: `check-traceability`, not
  `trace-gate`. Anything belonging to one tool is namespaced with that tool's
  prefix, so `coverage:unit:check` rather than `unit:check`. The test is
  whether a reader who returns in two days can tell what the name does
  without opening the file. A script directory with more than one file keeps
  its modules in named subdirectories with a `CLAUDE.md`, the same as
  `.claude/hooks/`.
- Every user-visible change is tested in a real browser with the
  chrome-devtools subagent, per `.claude/rules/browser-verification.md`.
  Typecheck and unit tests alone are never enough.
- **Coverage is an aggregate floor here, not a per-line gate.** `angular.json`'s
  `coverageThresholds` measures the whole of `src/**` rather than each file:
  80% statements, lines and functions, 75% branches, which `npm run test`
  enforces and which passes today with three to five points of headroom. The
  numbers sit just under the real figures deliberately, so the gate blocks
  nothing being written now and fails the moment coverage decays.

  This replaces a 100% changed-line requirement, and the user set the budget:
  "haladnunk kene es ez demo mvp app ami sosem lesz eles" ("we need to make
  progress and this is a demo MVP app that will never go live"), and
  "browser testben ugyis kijon a hiba" ("the bug comes out in the browser
  test anyway"). `.claude/rules/planning-deliverables.md` ("An MVP instruction
  is a budget, not a mood") is why that caps verification rather than being
  weighed against tidiness, and it is written down here so the next reader can
  see it was applied rather than forgotten.

  The old rule was also unenforceable here: it named a
  `coverage:changed-lines` script that `package.json` does not define. A gate
  nobody could run was not holding the line it appeared to hold.

  Two things survive the relaxation, because they are what actually caught
  defects here rather than what the percentage claimed to:

  - **Every bug still gets a test in the same commit as its fix**, measured red
    before and green after, and the report says what made it fail. A test that
    was never seen failing is evidence of nothing; two changes on this branch
    passed before their own fix and only saying so exposed it. When a fix
    changes a branch condition, every arm of it gets a case. Covered means
    executed *and* asserted on: a line a test runs through on its way somewhere
    else is not covered, and neither is one whose only assertion is a snapshot.
  - **The browser pass is now load-bearing rather than a second opinion**, on
    the user's own reasoning above. `browser-verification.md` governs it
    unchanged. What makes that more than a hope is that jsdom cannot see a
    whole class of these defects: it does not implement the HTML focus fixup
    rule, so a disabled element keeps `document.activeElement` and every focus
    loss this branch fixed was green in the unit suite and red in Chrome.

  A failing suite inside the diff is never skipped, it is fixed.
- **"Pre-existing" is decided against the branch's merge base, not against
  which agent wrote the file.** A red test or lint result counts as
  pre-existing only when `git diff --name-status <base>...HEAD` does not list
  the failing file; the three dots are what start the comparison at the merge
  base. A file a sibling agent added twenty minutes ago is on the branch, so
  its errors belong to this branch's work. That diff reads committed history
  while the gates run before the commit, so a file `git status --short` shows
  as modified or untracked is this session's own work whatever the branch diff
  says. `<base>` is the branch this work was cut from: read it off the open
  pull request, or take `git merge-base origin/main HEAD` where the work came
  straight off `main`.
- **A subagent's green report is not a run.** Before every commit the
  orchestrator itself runs `npm run test`, `npx eslint <the changed files>`,
  `npx prettier --check <the changed files>` and `npm run build`, and reads the
  exit codes. One agent reported a typecheck green while it was exiting 1 with
  two TS2322 errors in a spec file that same agent had just written; the next
  agent called those errors pre-existing after checking only that its own files
  were not the cause. Both reports were sincere, both were wrong, and the error
  reached the orchestrator twice.
- Layers a unit test cannot reach are excluded in the coverage configuration,
  never by ignore comments scattered through the source: shell scripts, docker
  compose files, docs, generated files, and the spec files themselves. The
  exclusion list lives in one place so it can be read and argued with. For
  those layers the evidence is an executed command and its verbatim output,
  recorded in the report or the commit body, exactly as the shell script work
  on this branch was verified.
- **Grep the identifier as the repository spells it.** Prose and CSS use
  hyphens (`add-to-cart`, `filter-panel`); symbols and test ids mix camelCase
  and PascalCase (`addToCartSelection`, `AddToCart`, `filter-min-price`). Run
  every spelling before concluding a name has zero hits: `grep -rn "AddToCart"`
  and `grep -rn "add-to-cart"` return different files in `src/app/features/product/`.
- **A "these two trees are the same file" claim is checked, not assumed.**
  `.claude/skills/` and `.agents/skills/` are two independent directories here,
  not a symlink pair: `ls -lai` on the same file under each prints different
  inodes. An edit to one does not reach the other, so a correction has to be
  applied twice or the change reaches half its readers. `ls -ld` and `ls -lai`
  settle it in one command.
- **A cut feature leaves nothing behind, and the mock data is not a reason to
  keep any of it.** When the user cuts a component, a route, a filter or a
  feature, it goes out of every layer in the same change: the type union, the
  template, the SCSS, the handler, the fixture, and its tests, e2e included.
  No compatibility shim, no "the old payload still parses so nothing breaks",
  no code parked against a future rebuild. What `src/mocks/` already serves is
  not a reason to keep one either: a fixture in a shape the code no longer
  knows is not a case to design for, and a handler that tolerates it is work
  spent on a hypothetical. It goes out with the rest.

  This binds the code the current change makes dead; pre-existing dead code
  that nothing here touches stays where it is, per `.claude/CLAUDE.md`
  ("Surgical changes").

  The rule is the user's, in their own words, after two block types were kept
  under a "deferred scope" heading on exactly the reasoning above: "de
  nem!!!!!!!!! elmondtam mar millioszor mvp, nem hagyunk szemetet, es nem
  szamit a db!!!!!!! es nincs legacy kod iras!!!!!" ("but no!!!!!!!!! I have
  said a million times, MVP, we leave no rubbish, and the db does not
  matter!!!!!!! and there is no writing legacy code!!!!!"). Both went out
  entirely, e2e tests with them.

