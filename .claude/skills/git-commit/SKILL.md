---
name: git-commit
description: >-
  Makes one commit in this workspace, its Conventional Commits message
  composed from the diff rather than from memory of the work. Use whenever
  changes must be committed. Pass `files: <paths>`; `subject:`, `body: <why>`
  and `repo:` are optional. A commit can be refused.
argument-hint: >-
  files: <path> [<path>...] [| body: <why>] [| subject: <first line>]
  [| repo: <path>]
scope: dev
---

# Git Commit

This makes exactly one commit, and you make it: the skill loads into the
session that is committing rather than into an instance of its own. That
session remembers the work, which is what makes the reading order below
necessary rather than pedantic. Memory answers why the change was made; only
the diff answers what this commit changed.

Writing that second half from memory is how a change ends up described as
something it is not. A study of 23,247 pull requests authored by coding agents
found that among the 406 it classed as highly inconsistent with their own
diffs, a description claiming changes that were never implemented was the most
common fault, at 45.4% (https://arxiv.org/abs/2601.04886, read 2026-09-18).
Reading the change before drafting the message is what this file puts between
the two.

Run one commit at a time in a repository; the index is shared.

Arguments:

```text
$ARGUMENTS
```

Fields, separated by `|`:

- `files:` the paths to commit, relative to the repository root. Required.
- `body:` the why, and the one thing no diff can supply: a timeout raised
  from 500ms to 1000ms is visible in the diff, the production latency spike
  behind it is not. Optional, and left out where the diff is the whole story.
- `subject:` a proposed first line. Optional; with none given, write one from
  the change read below. A given one is a proposal: where the change read does
  not bear it out, rewrite it from that read and commit, rather than stopping
  over a line you can write yourself. One given under a verbatim instruction is
  the exception and comes back as a stop instead, per the carve-out at the end
  of `## Claim check`.
- `repo:` the repository root. Optional; defaults to the current working
  directory. Use `git -C <repo>` for every git command and never `cd`.

`files:` is the field worth insisting on even when you already know the
answer, because the list is a decision: which files belong together in one
commit is settled before the reads start, and `git status` cannot settle it,
carrying as it does the edits of peer sessions and concurrent agents.
With no `files:`, stop there and settle it.

**Confirm every listed path exists before anything else**, with `ls` or a
read. No git command below will tell you. `git diff HEAD -- nope.txt` prints
nothing and exits 0, and `git status -u -- nope.txt` answers `nothing to
commit, working tree clean` and exits 0 even while another file in the tree is
modified, because the pathspec filters that file out, so a mistyped path
produces a reassuring clean report. The first command that notices is the
`git add` further down, which exits 128 with `fatal: pathspec 'nope.txt' did
not match any files`, by which time the whole message is written. The
neighbouring case needs no guard because it fails loudly: where every listed
path exists but has nothing left to commit, `git commit` exits 1 and says so,
in wording that depends on what else is in the tree. Measured on git 2.50.1.

## Pre-commit hygiene (mandatory)

1. **Inspect**: run `git status -u`, `git diff HEAD -- <files>`, and
   `git diff --cached --name-only`. The `HEAD` is what keeps the whole change
   in view: part of a listed file may already sit in the index, put there by
   an earlier session or agent, and a plain `git diff -- <files>` leaves that
   part out while the commit still records it. A path `git status -u` prints
   as `??` is in neither HEAD nor the index, so no diff shows it until the
   `add` below; read that file whole instead, since every line of a new file
   is a line the commit adds. That diff and that whole-file read together are
   **the change read**, which is what every later mention of it means, and it
   comes before any of the message is drafted.
2. **Inherited index**: files staged by an earlier session or agent are still
   in the index, and a plain `git commit` writes the whole index. Commit with
   explicit pathspecs so only the listed files are recorded and the rest of
   the index stays untouched.
3. **Secrets and cruft**: never commit `.env` files, credentials, tokens,
   webhook URLs, log dumps, scratch scripts, or debug prints that the change
   read shows in a listed file. Stop instead of committing; "What reaches the
   user" at the end of this file says what happens then.
4. **No unrelated edits**: if a listed file carries formatting churn or
   changes that do not belong with the rest of the change, stop instead of
   committing.
5. **Never** run `git add .`, `git add -A`, `git commit -a`, `git push`,
   `git reset --hard`, or anything that touches files you were not given.

## Message format

```text
<type>: <subject> [(<ticket>)]

[optional high-signal body explaining context and why]
```

Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `build`, `verify`.
Pick the one the change read supports. Where a given subject names another,
one outside that list or one the change read does not bear out, take the type
that fits instead rather than stopping over a word you can write yourself.
Under a verbatim instruction the second of those two comes back as a stop
instead, since a type the change read does not bear out is a claim about what
the commit does; the carve-out at the end of `## Claim check` owns that, and it
leaves the first where it is, a type outside the list being this file's own
format rule rather than a claim.

Rules:

1. **Length (50/72)**: subject at most 50 characters, body wrapped at 72.
2. **Subject**: imperative mood, present tense, lowercase start, no trailing
   period.
3. **No noisy scopes**: `<type>: <subject>` unless a scope is strictly needed.
4. **Body**: what the commit does comes from the change read; a given `body:`
   is wrapped and carried, never reworded.
5. **Ticket**: the issue key comes from the branch name, which on an
   issue-backed branch is Linear's own `gitBranchName` copied verbatim
   (`.claude/rules/session-lifecycle.md`, "Commits"), and it goes in
   parentheses at the end of the subject, inside the 50 characters rule 1
   allows:

   ```bash
   git -C <repo> branch --show-current \
     | grep -oE '[A-Za-z]+-[0-9]+' | head -1 | tr 'a-z' 'A-Z'
   ```

   That prints `PX-617` on
   `eggprojec/px-617-p7-cutover-removals-docs-and-the-manual-database-clean`
   and prints nothing at all on `main` or `fix/develop-skills`, so a branch
   carrying no key gives a subject carrying no reference. A reference already
   in a given subject is kept as given.
6. **Language**: English, except a sentence quoted from the user, which
   appears with its English gloss beside it, so a quote that reaches you
   without a gloss gets one before it goes into the message.

**What the change read settles, and what only you can supply.** The change
read settles every sentence about what this commit does to the code: what it
adds, changes, removes, renames or fixes. Those are written from it, and where
your memory of the work and the diff disagree, the diff is what happened. You
supply the why, which no diff holds. The format rules above are this file's
own domain: subject length, body wrapping, imperative mood and casing, and
scope noise. Fix those minimally in any text you were given, keep every word
of its meaning, and note exactly what you changed and which rule it satisfied.

Text you were given sometimes carries an instruction with it: "verbatim",
"exactly as given", "word for word". That protects a meaning rather than
asking for a malformed log entry, so it does not lift the format rules: fix
them and name the fix, since silence about it is the failure mode rather than
the fix.
The same instruction applied two different ways across two calls, one
over-long subject trimmed and the next one left alone, is what this paragraph
exists to prevent. Where the instruction goes further and asks for a violation
to come back rather than be edited, that instruction wins: name the rule and
how the given text breaks it, and leave the text alone. If it said to stop,
stop before the commit; if it said only not to reword, commit as given. Either
way the user is told which of the two happened, so a deliberate pass is
distinguishable from a silent one.

## Claim check

**Read the finished message back against the change read before committing.**
Its factual half was written from that read; this pass is what catches the
half that was not. A why carries a picture of the change with it, and a
picture the code no longer matches misleads every later reader, since a
message is read long after the diff behind it is.

**A claim is a sentence about what this commit does to the code**: that it
adds, changes, removes, renames or fixes something. Nothing else in a body is
checked, because no diff could confirm or refute it: the why, the context,
the reasoning behind a decision, a risk named for the next reader, a command
and the output it printed, and a file, a rule or an approach named to say
what this commit does not do. This workspace requires some of those in a
body, so a check that flagged them would fail every commit. Naming a file the
commit leaves alone is exempt only where the sentence says so: one saying the
commit changed that file is a claim like any other.

**A claim the change read contradicts stops the commit**, as a secret or an
unrelated edit does. Quote the sentence, say what it claims the commit did,
and say what the change read shows for that file instead, so the why or the
change itself can be corrected and the commit made on the next run.

**The subject line is the exception, and the only one.** A subject the change
read does not bear out is rewritten from that read and the commit goes ahead,
for the same reason a given type outside the list is replaced rather than
argued with: it is one line you can write yourself, so a stop there costs an
invocation to ask the user for wording the change read has already given
you. The stop above is for the body, whose sentences carry a why no diff can
supply, so a wrong one there can only come back corrected. "What reaches the
user" at the end of this file carries the rewrite to the user.

**A claim too vague for the change read to settle is committed, and flagged
loudly.** "Tightens the write path" is a sentence no diff can confirm or
refute, so a stop over it would be one nobody can act on, while a sentence the
diff plainly contradicts is decidable and stops the commit above. Give each
vague one its own entry, labelled `Vague claim:`, quoting the sentence and
asking for a sharper one, ahead of everything else you have to say. At the
bottom of a mixed list it is a finding nobody reads, which costs as much as
not having made it. The commit has landed by then, so the sharper sentence
belongs to a later commit rather than to a reworded message.

**A "verbatim" instruction does not lift this check.** It protects wording
from being rewritten, which neither a stop nor a `Vague claim:` entry does,
and asking for a violation to come back rather than be fixed is asking for
more to be said about it, not less. It bites in the two places this file
rewrites rather than stops: the subject exception above, and the type
`## Message format` takes instead where the change read does not bear the
given one out. A subject or a type given under such an instruction comes back
as a stop instead, quoted with what the change read shows.

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

## What reaches the user

The commit message is this skill's output, and a commit that lands as intended
needs no telling: `.claude/CLAUDE.md` ("No interim output") rules out the
status line.

These go into your next message to the user, because each needs an answer from
them or a correction from you:

- a stop over a secret or a piece of cruft in a listed file;
- a stop over an unrelated edit in a listed file;
- a stop over a claim the change read contradicts;
- a stop over a missing `files:`;
- a stop over a listed path that does not exist;
- every `Vague claim:` entry, quoted and ahead of the rest;
- every change you made to wording you were given: the rule it satisfied, or
  for a rewritten subject what the change read showed instead.

Nothing else does. A stop you settled yourself, by naming the path you meant
or dropping the file that did not belong, still goes into that message: what
the user needs to see is the correction, and a correction nobody is told about
is indistinguishable from a commit that never had the problem.
