# Citation check

What `.claude/skills/mibolt-project-map/scripts/check-skill-references.mjs`
checks in a MiBolt skill, what it prints, how it exits, and how to write a
citation it can read. The script's header comment states each check exactly;
this file is the working summary of it.

## Running it

It runs from anywhere inside the checkout, finds the repository root through
git, and is read-only: it runs `git rev-parse --show-toplevel`, `git ls-files`
(also with `--cached --others --exclude-standard`) and
`mise tasks --all --json`, and writes nothing. It needs git, Node (the
`mise.toml` pin) and, unless `--no-mise` is given, mise on the PATH. The
command line is in `SKILL.md`, "Keep this skill current".

- With no directory it checks every `mibolt-*` directory under
  `.claude/skills/`. A directory it is given must be one of those and hold
  `SKILL.md`; anything else ends with `not a skill directory: <arg>`.
- `--show-anchors` also prints the current text of every line an anchor
  points at, up to ten lines per range, and never changes the exit code.
- `--no-mise` skips mise and reports every `mise run` token and every bare
  task name UNVERIFIED.

## What it checks

In `SKILL.md` and `references/*.md` it checks that relative links resolve;
that backticked repository paths with their line anchors, globs and script
paths exist in a fresh checkout; that `mise run` tasks, bare task names such
as `backend:docker`, and npm scripts are defined; and it fails any line on
which a home-directory path, a temp-directory path or a file URL begins. A
Gradle task, written in the form
`backend/gradlew -p backend :services:commerce:build`, is found only when
`backend/services/commerce/build.gradle` registers it, `backend/mise.toml`
runs it or `.github/workflows/backend.yml` calls it, and is reported
UNVERIFIED otherwise; UNVERIFIED is not a pass.

## Output and exit codes

It prints one line per finding, in the form
`FAIL|UNVERIFIED <skill-relative-file>:<line> <kind> <token> — <reason>`, then
one summary line per skill. It exits 0 when nothing failed, 1 on any FAIL,
and 2 on a usage or prerequisite error: an unknown option, a directory that is
not a MiBolt skill, a working directory outside a git checkout, or mise
missing or failing without `--no-mise`. Each of those is settled before the
first line is printed, so an exit 2 comes with nothing on stdout; the message
goes to stderr.

Excerpts of two runs on this skill, on 2026-09-26; the counts and line numbers
move with every edit:

```text
$ node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs --show-anchors .claude/skills/mibolt-project-map
...
ANCHOR SKILL.md:171 backend/services/commerce/src/main/resources/application.properties:50 -> backend/services/commerce/src/main/resources/application.properties
  50: mibolt.checkout.free-shipping-threshold-huf=30000
...
mibolt-project-map: 383 checked, 0 FAIL, 0 UNVERIFIED

$ node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs --no-mise .claude/skills/mibolt-project-map
UNVERIFIED SKILL.md:86 mise mise run api:generate — mise task check skipped (--no-mise)
...
UNVERIFIED references/citation-check.md:30 mise backend:docker — mise task check skipped (--no-mise)
...
mibolt-project-map: 383 checked, 0 FAIL, 11 UNVERIFIED
```

## Write citations the checker can read

- Name a task as `mise run deploy:check` wherever it should be checked. A bare
  task name in backticks is checked only when its first part is a top-level
  entry of the repository, as in `backend:docker` or `deploy:check`; a bare
  `dev:docker` or `stack` is not checked at all.
- Keep placeholders and ellipses out of backticked paths and commands: a path
  holding a `<name>` placeholder is checked as a literal path, the first word
  after `node`, or after `python` in a `uv run` line, that is not an option is
  taken as a script path from the repository root, and a placeholder task or
  script name is checked as a real one. Put a template in a fenced code block
  instead: the path and command checks read only backticked tokens, while the
  hygiene check reads every line. Cite a command that runs from another
  directory, such as a script in `frontend/package.json`, by its `path:line`
  anchor rather than backticking the command.
- Backtick only a path a fresh checkout holds: a tracked path, or a new file no
  ignore rule covers. A gitignored output backticked from the repository root,
  such as the service's build directory or a `node_modules` directory, fails
  the check on every machine whether or not it was built there. Name it
  relative to its area directory, as `build/` in `backend/services/commerce/`,
  which the checker does not read as a repository path, or cite the
  configuration line that defines it. A glob must match such a file or a
  directory.
- The checker cannot tell whether an anchored line still says what the skill
  claims. Run it with `--show-anchors` after a change to a cited file, and
  read the printed lines against the sentences that cite them.
