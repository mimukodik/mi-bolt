# Citation check

What `scripts/check-skill-references.mjs` checks in a MiBolt skill, what it
prints, how it exits, and how to write a citation it can read. The script's
header comment states each check exactly; this file is the working summary of
it.

## Running it

It runs from anywhere inside the checkout, finds the repository root through
git, and is read-only: it runs `git rev-parse --show-toplevel`, `git ls-files`
(also with `--cached --others --exclude-standard`) and
`mise tasks --all --json`, and writes nothing. It needs git, Node (the
`mise.toml` pin) and, unless `--no-mise` is given, mise on the PATH. The
command line is in `SKILL.md`, "Keep this skill current". It finds the MiBolt
skills from its own location: every directory whose name starts with
`mibolt-` in the directory that holds this skill.

- With no argument it checks every MiBolt skill. Name one or more skills, as
  in `mibolt-commerce-backend`, to check only those; an unknown skill name
  ends with `unknown skill: <name>`. A MiBolt skill's directory, given as a
  path from the working directory, is also accepted, and a path that is not
  one ends with `not a skill directory: <arg>`.
- `--show-anchors` also prints the current text of every line an anchor
  points at, up to ten lines per range, and never changes the exit code.
- `--no-mise` skips mise and reports every `mise run` command it reads and
  every bare task name UNVERIFIED.

## What it checks

In `SKILL.md` and every Markdown file under `references/` it checks that
relative links resolve; that backticked paths with their line anchors and
globs, and the script path in a `node` or `uv run` command, exist in a fresh
checkout; that a line anchor sits on a file and names no line past its end, an
anchor on a directory failing with `line anchor on a directory`; that
`mise run` tasks, bare task names such as `backend:docker`, and npm scripts
are defined; that no line holds a harness-specific name or path (check (f),
below); and it fails any line on which a home-directory path, a
temp-directory path or a file URL begins. A Gradle task, written in the form
`backend/gradlew -p backend :services:commerce:build`, is found only when
`backend/services/commerce/build.gradle` registers it, `backend/mise.toml`
runs it or `.github/workflows/backend.yml` calls it, and is reported
UNVERIFIED otherwise; UNVERIFIED is not a pass.

**Where a backticked path resolves.** A token holding whitespace is not a
path. Any other token goes to the first of these rules that fits it:

1. Its first segment is scripts, references, assets or agents, or the whole
   token is `SKILL.md`: it resolves against the directory of the skill whose
   file holds it, never against the repository root, and must exist there.
   Such a token is never read as a glob: an asterisk in it is taken literally
   and fails, so name the directory instead, as in "the Markdown files under
   `references/`".
2. Its first segment is a MiBolt skill name, as in
   `mibolt-project-map/scripts/check-skill-references.mjs`: it resolves
   against the directory that holds the MiBolt skills, and a first segment of
   that form that names no skill there fails with `no such skill`. Like a
   token under rule 1, it is never read as a glob.
3. Its first segment is a top-level entry of the repository: it resolves
   against the repository root, where a token containing `*` is a glob that
   must match at least one path. A token with a colon, no slash and no line
   anchor, such as `backend:docker`, is a mise task name instead. A token that
   fits none of the three rules is not checked at all.

**Where a command is read.** A command is one of six forms: `mise run` and a
task, `npm --prefix frontend run` or `npm --prefix tools run` and a script,
the Gradle form above, `node` and a script path, or `uv run` then `python` and
a script path. It is read in two places. One is a backticked token that begins
with one of those forms, wherever the token sits, a fenced code block
included. The other is a line of a fenced code block, opened by three or more
backticks or tildes, with or without a language tag: its leading whitespace
and an optional `$ ` prompt are removed, and a line ending in `\` is joined
with the next line of the same block and reported at the line it starts on.
The result is skipped as a placeholder or a glob, with no report and no count,
when it holds `<` or `*`, and ignored when it begins with none of the six
forms, a bare task name included. A path, by contrast, is read only from a
backticked token: an unbackticked path on a fenced line is checked only as the
script path of a command there.

The script path of a `node` or `uv run ... python` command, the first word
after `node` or `python` that is not an option, goes through rules 1 and 2 and
then resolves against the repository root whatever its first segment, so a
script path that resolves nowhere always fails. Check (e) resolves its
targets in an order of its own, below.

Check (e), as the header numbers it, reads section-name citations. After
collapsing every run of whitespace, newlines included, to one space, so a
citation can wrap across lines, it finds each citation of either shape: a
backticked target, an optional `'s`, a space, an opening parenthesis and a
double-quoted name; or a backticked target, a comma, a space and a
double-quoted name. Only the first quoted name right after the target counts.

The backticked token is a target only when it is a skill name,
`mibolt-<name>`, or a path, meaning that, with any line anchor removed, it
contains a `/` or its last segment ends in a file extension, a dot and one to
ten letters or digits, as in `SKILL.md` or `mise.toml`. Any other token
followed by a quoted phrase, such as a flag or a bare value, is not a
citation: it prints no line and adds nothing to the counts. A path target is
resolved from the repository root; when nothing is there, from the skill's
own directory, so `SKILL.md` and the files under `references/` resolve inside
the skill; and when neither holds it and its first segment is a MiBolt skill
name, from the directory that holds the MiBolt skills. It may name any file,
not only a Markdown one. A skill name stands for that skill's `SKILL.md` and
every Markdown file in its references directory, read as one text. The
citation then ends one of four ways:

- A path that resolves to a file, or a skill name whose skill exists, passes
  when the name, its whitespace collapsed the same way, occurs as a substring
  of the target's collapsed text, case-sensitively, so a heading, a bold
  lead-in and a table cell all count; otherwise it fails with
  `section name not found in <target>`.
- A path that resolves to a directory is reported UNVERIFIED with
  `section target is a directory`, and the name is not checked.
- A skill name with no directory of that name holding a `SKILL.md`, or a path
  target that resolves nowhere and whose first segment is a skill name with
  no directory of that name, fails with `no such skill`.
- Any other path that resolves from none of those places fails with
  `section target not found`, except in two cases that print no line and add
  nothing to the counts: it holds no whitespace and its first path segment is
  a top-level entry of the repository, because the path check already reports
  that token as missing, or it contains `<` or `*`, a placeholder or a glob
  that is not meant to resolve.

Every citation outside those two exceptions adds one to "checked", whether it
passes, fails or is UNVERIFIED. The match is a substring of the whole target,
not of one heading, so a heading renamed while its old name still occurs
elsewhere in the target, in a sentence or a cross-reference, still passes. A
citation into the file it sits in, or into its own skill by name, always
passes, because the citation itself holds the name.

Check (f) reads every line of `SKILL.md` and of each Markdown file under
`references/`, fenced code blocks included, for a name or path specific to a
coding assistant rather than to the project, and fails each match with
`harness-specific name or path`. Each distinct match on a line is reported
once per pattern, so one line can raise two FAILs, a directory name and the
product name inside it. The patterns cover assistant configuration
directories and instruction-file names, assistant, vendor and model names,
the words for handing work to another agent, agent definition names, the
tool-protocol prefix and acronym, a browser-automation server's name,
assistant tool names, and the names of skills and tooling outside the MiBolt
set. The list itself lives only in the script's header comment; writing its
entries here would fail this file. There is no exemption marker and no flag
that turns it off, so a forbidden name fails in a code block, in a quotation
and as an example of what not to write alike. The skill's scripts and the
metadata file under `agents/` are not scanned.

## Output and exit codes

It prints one line per finding, in the form
`FAIL|UNVERIFIED <skill-relative-file>:<line> <kind> <token> — <reason>`, then
one summary line per skill. For kind `section` the token is the target
followed by the quoted name, and the line is the one the target starts on; for
kind `neutral` the token is the matched text. It exits 0 when nothing failed,
1 on any FAIL, and 2 on a usage or prerequisite error: an unknown option, an
unknown skill name, a directory that is not a MiBolt skill, a working
directory outside a git checkout, or mise missing or failing without
`--no-mise`. Each of those is settled before the first line is printed, so an
exit 2 comes with nothing on stdout; the message goes to stderr.

Excerpts of two runs on this skill from its own directory, on 2026-09-26; the
counts and line numbers move with every edit:

```text
$ node scripts/check-skill-references.mjs --show-anchors mibolt-project-map
...
ANCHOR SKILL.md:169 backend/services/commerce/src/main/resources/application.properties:50 -> backend/services/commerce/src/main/resources/application.properties
  50: mibolt.checkout.free-shipping-threshold-huf=30000
...
mibolt-project-map: 475 checked, 0 FAIL, 0 UNVERIFIED

$ node scripts/check-skill-references.mjs --no-mise mibolt-project-map
UNVERIFIED SKILL.md:87 mise mise run api:generate — mise task check skipped (--no-mise)
...
UNVERIFIED references/citation-check.md:36 mise backend:docker — mise task check skipped (--no-mise)
...
mibolt-project-map: 475 checked, 0 FAIL, 12 UNVERIFIED
```

## Write citations the checker can read

- Name a task as `mise run deploy:check` wherever it should be checked. A bare
  task name in backticks is checked only when its first part is a top-level
  entry of the repository, as in `backend:docker` or `deploy:check`; a bare
  `dev:docker` or `stack` is not checked at all.
- Keep placeholders and ellipses out of backticked paths and commands: a path
  holding a `<name>` placeholder is checked as a literal path, the script path
  in a `node` or `uv run` command is resolved by the rules above, and a
  placeholder task or script name is checked as a real one. Put a template in
  a fenced code block instead, with no backticks around its tokens, and write
  each placeholder in angle brackets, as in `<name>`. An unbackticked path
  there is checked only as the script path of a command, and a command there
  is skipped whole when `<` or `*` appears on any of its lines, continuation
  lines included, while a placeholder written any other way, an ellipsis or a
  bare word, is checked as a real name. The skip takes the whole command, so
  a script path in front of the placeholder goes unchecked with it: backtick
  that path once in the text as well, as `SKILL.md` does for this checker.
  The hygiene check and check (f) read every line, fenced or not, and check
  (e) reads every backticked target followed by a quoted name, so a
  section-citation template, which needs its backticks, keeps a placeholder in
  its target, as the template under the section-citation bullet below does.
  Cite a command that runs from another directory, such as a script in
  `frontend/package.json`, by its `path:line` anchor rather than backticking
  the command.
- Backtick only a path a fresh checkout holds: a tracked path, or a new file no
  ignore rule covers. A gitignored output backticked from the repository root,
  such as the service's build directory or a `node_modules` directory, fails
  the check on every machine whether or not it was built there. Name it
  relative to its area directory, as `build/` in `backend/services/commerce/`,
  which the checker does not read as a repository path, or cite the
  configuration line that defines it. A glob under a top-level entry must
  match such a file or a directory; a path under rule 1 or 2 cannot be a glob.
- Cite a section of another file by its name, in one of the two shapes check
  (e) reads, and copy the name verbatim, backticks included, from a heading, a
  bold lead-in or a table cell of the target as it is now. Where the target is
  rewritten section by section, as a long document or another MiBolt skill is,
  cite it by name rather than by a line anchor: an anchor into it keeps
  passing after its line has moved to other text, while a name that is gone
  fails. The target is a file or a skill name, never a directory, which has no
  text to search and is reported UNVERIFIED. A misspelt skill name or a
  missing path is caught only while it still has the form of a target,
  `mibolt-<name>` or a path with a `/` or a file extension; a target in
  neither form, such as a file with no extension named without its directory,
  is not read as a citation and prints nothing. The reverse also happens: a
  backticked command or version number that contains a `/` or ends in what
  reads as a file extension, followed by a quoted phrase in either shape, is
  taken for a path target and can fail with `section target not found`;
  reword the sentence around it.

  ```text
  `<file or mibolt-skill>` ("<section name>")
  (`<file or mibolt-skill>`, "<section name>")
  ```

- The checker cannot tell whether an anchored line still says what the skill
  claims, and check (e) confirms only that a quoted name still occurs
  somewhere in its target. Run it with `--show-anchors` after a change to a
  cited file, read the printed lines against the sentences that cite them,
  opening the file for the rest of any range the output cuts short after ten
  lines, which it marks with `... (+N more lines)`, and reread each cited
  section the same way.
- Write every anchor as `path:line` wherever it should be checked. An anchor
  written without its path, as `:N`, `(line N)` or `(lines N-M)` after a path
  the sentence already names, is neither checked nor printed by
  `--show-anchors`, because an anchor is read only inside a backticked token
  that one of the three path rules above resolves; reread each such anchor in
  its file by hand.
