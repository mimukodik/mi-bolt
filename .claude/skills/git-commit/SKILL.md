---
name: git-commit
description: >-
  Creates one git commit in this workspace inside a forked coder-sonnet
  subagent: index hygiene, selective staging, Conventional Commits message,
  post-commit verification. Use whenever changes must be committed. The fork
  never sees this conversation, so pass everything in the arguments:
  `files: <paths> | subject: <type>: <subject> | body: <why>`, plus an
  optional `repo: <path>`. `<type>` is one of feat, fix, test, docs, chore,
  refactor, build, verify.
argument-hint: "files: <path> [<path>...] | subject: <type>: <subject> | body: <why> [| repo: <path>]"
context: fork
agent: coder-sonnet
scope: dev
---

# Git Commit

You were forked to create exactly one commit. You do not see the conversation
that produced the change, so everything you need is in the arguments below.
Run only one commit fork at a time in a repository; the index is shared.

Arguments:

```text
$ARGUMENTS
```

Expected fields, separated by `|`:

- `files:` the paths to commit, relative to the repository root. Required.
- `subject:` the first line of the message. Required.
- `body:` the why, context, and non-obvious decisions. Optional for trivial
  commits, required otherwise.
- `repo:` the repository root. Optional; defaults to the current working
  directory. Use `git -C <repo>` for every git command and never `cd`.

If `files:` or `subject:` is missing, or a listed path does not exist, stop
and report what is missing. Do not guess the file list from `git status` and
do not invent a message.

## Pre-commit hygiene (mandatory)

1. **Inspect**: run `git status -u`, `git diff -- <files>`, and
   `git diff --cached --name-only`.
2. **Inherited index**: files staged by an earlier session or agent are still
   in the index, and a plain `git commit` writes the whole index. Commit with
   explicit pathspecs so only the listed files are recorded and the rest of
   the index stays untouched.
3. **Secrets and cruft**: refuse to commit `.env` files, credentials, tokens,
   webhook URLs, log dumps, scratch scripts, or debug prints you can see in
   the diff of the listed files. Report them instead of committing.
4. **No unrelated edits**: if the diff of a listed file contains formatting
   churn or changes that do not match the subject, report it and stop.
5. **Never** run `git add .`, `git add -A`, `git commit -a`, `git push`,
   `git reset --hard`, or anything that touches files you were not given.

## Message format

```text
<type>: <subject> [(<ticket>)]

[optional high-signal body explaining context and why]
```

Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `build`, `verify`.
The frontmatter `description` names the same eight, because the caller sees
only that; a change to one list is a change to both.

Rules:

1. **Length (50/72)**: subject at most 50 characters, body wrapped at 72.
2. **Subject**: imperative mood, present tense, lowercase start, no trailing
   period.
3. **No noisy scopes**: `<type>: <subject>` unless a scope is strictly needed.
4. **Body**: keep the given body; wrap it, do not rewrite its meaning. Add
   nothing you were not told.
5. **Ticket**: keep a ticket reference such as `(PX-544)` or `(#61)` when it
   is in the subject.
6. **Language**: English.

**Whose text is whose.** The message-format rules above are this skill's own
domain: subject length, body wrapping, imperative mood and casing, and scope
noise. Fix those minimally, keep every word of the given meaning, and say in
the report exactly what changed and why. Everything else in the given message
belongs to the caller: wording, structure, claims, ordering. None of it is
rewritten. If something there looks wrong, say so in the report and commit the
text as given. A type that is not in the list above is a third case: stop and
report rather than pick one, because a guessed type changes what the commit
claims to be.

A caller who says "verbatim", "exactly as given", or "word for word" is
protecting their meaning, not asking for a malformed log entry, so that
instruction does not lift the format rules. Fix them and name the fix in the
report; silence about it is the failure mode, not the fix. The same
instruction applied two different ways across two calls, one over-long subject
trimmed and the next one left alone, is what this paragraph exists to prevent:
the outcome must not depend on how the caller happened to phrase it.

Where the caller explicitly asks for a violation to come back rather than be
edited, that instruction wins: name the rule and how the given text breaks it,
and leave the text alone. If they said to stop, stop before the commit; if
they said only not to reword, commit as given. Either way the report says
which of the two happened, so the caller can tell a deliberate pass from a
silent one.

## Commit

```bash
git -C <repo> add -- <files>
git -C <repo> commit -m "<subject>" [-m "<body>"] -- <files>
```

The pathspec on `git commit` is what keeps inherited staged files out of the
commit; the explicit `add` first is what records new files.

**A message too awkward for `-m` goes to a file whole, subject included.**
Use a file when the body runs to more than one paragraph, or when any part of
the message carries a character the shell acts on inside the double quotes
above: a backtick, a `$`, a `"`, a backslash with another backslash right
after it, since that pair arrives as one backslash and silently halves the
escapes in a regex or a path the body spells out, or a backslash at the end of
a line or at the end of the message, since the shell reads it as escaping what
comes next rather than as a character of the message. Those two line ends fail
differently: a backslash at the end of the message escapes the closing quote
of `-m "<body>"`, so zsh reports `unmatched "` and nothing is committed, while
a backslash ending a line inside the body is a line continuation in zsh, bash
and sh alike, dropped along with the newline, so the commit succeeds and the
body reads `C:\tools\binand the loader reads it from there` where two lines
were intended. The 72-column body wrapping above is what puts those newlines
inside the quotes, so all it takes is a word ending in a backslash, such as a
Windows path with a trailing separator, landing at a wrap point. A lone
backslash inside a line is not one of them, because `\d` and `\|` come through
as written, and every other pairing inside a line puts a backtick, a `$` or a
`"` after the backslash and so trips one of the three above. An apostrophe is
not one of them either,
because it survives those quotes untouched, and a body full of apostrophes
still goes through `-m`. The subject goes into that same file, because
`git commit` refuses `-m` and `-F` in one call, exiting with `fatal: options
'-m' and '-F' cannot be used together`. Subject on the first line, one blank
line, then the body. Write the file with a quoted heredoc, which passes every
character through untouched: the `-m "<subject>"` form above and an unquoted
heredoc delimiter both let the shell expand what they carry, so a backticked
`git branch -f` in the subject runs for real and leaves a hole in the message
where it stood. Give the delimiter a name no line of the body could equal,
because a body line matching it ends the heredoc there and hands the rest of
the message to the shell as commands. Give the file an absolute path in the
session scratchpad, because `git -C <repo>` resolves a relative `-F` against
`<repo>` rather than against your working directory, and a message file
written inside the repository would turn up in the `git status` the Verify
section checks.

```bash
cat > <absolute-message-file> <<'COMMIT_MSG_EOF'
<subject>

<body>
COMMIT_MSG_EOF
git -C <repo> commit -F <absolute-message-file> -- <files>
```

The `add` line above is unchanged; only the commit line differs. Six commits
in one session were each tried the other way first and paid a retry apiece.

## Verify

1. `git -C <repo> show --stat HEAD` must list exactly the given files. If an
   unrelated file slipped in and the commit is not pushed, fix it with
   `git reset --soft HEAD~1`, `git restore --staged <unrelated-path>`, commit
   again, then re-stage the unrelated file if it was staged before you
   started, so the index is left as you found it. Never rewrite a pushed
   commit. `git reset --soft` and `git restore --staged` move index entries
   and leave every changed line in the working tree, so they are not the
   work-removing `git reset` / `git restore` that
   `.claude/rules/session-lifecycle.md` ("Commits") bans.
2. `git -C <repo> status --short` must show every file that was staged or
   modified before you started still in that state, minus the ones you
   committed.

## Examples

- `fix: follow configured Slack provider (PX-544)`
- `chore: pin Node version to 22 with mise`
- `docs: refresh hosted MCP closure ledger`
- `test: add hosted sandbox acceptance`

## Final report

- What was done: the short sha, the subject, and the `git show --stat HEAD`
  output, plus every format fix you made to the given message and the rule it
  satisfied.
- What was verified: the `git status --short` output after the commit, and
  the inherited-index handling.
- What is uncertain: anything in the given message that looked wrong and was
  committed as given anyway, anything you refused to commit and why, and
  missing arguments.
