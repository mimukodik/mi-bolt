# Shared memory

Repo-relative, git-committed shared memory for this workspace, read by every
Claude Code session working in any worktree of this repo. This replaces the
per-worktree auto memory file the SessionStart hook used to read from the
user's home directory, which never resolved correctly from a worktree other
than the main checkout.

## Layout

- `MEMORY.md`: the index, one line per entry, linking to a topic file.
- `<topic>.md`: one file per topic, holding the full detail for that entry.
  Its format is a heading, a `Recorded:` line, then the body:

  ```
  # <topic>
  Recorded: YYYY-MM-DD

  <body>
  ```

  `Recorded:` is the date the topic was last written, stamped by `write` and
  updated whenever the topic is rewritten; it is a last-recorded date, not a
  created date. It is evidence for a human deciding whether an entry is still
  trustworthy, not a trigger for anything automatic: an old architectural
  decision can be permanently true while a one-day-old entry can already be
  wrong, so a date alone never justifies acting on or deleting an entry.

## What the SessionStart hook injects

The hook injects only the content of `MEMORY.md` into every session's
context, so the index must stay short: one line per entry, with detail moved
into the topic file it links to. Topic files are never injected; they are
read on demand through the `claude:memory` CLI, not by opening the file
directly.

## Hard limit

The hook loads at most the first 200 lines or 25KB of `MEMORY.md`, whichever
comes first, mirroring Claude Code's own documented auto memory limit for its
`MEMORY.md`. Content beyond that cap is silently dropped from context, so an
index that grows past it needs trimming, not more entries appended.

## The Reviewed preamble line

`MEMORY.md` carries a `Reviewed: YYYY-MM-DD (N entries)` line directly under
its heading once a review has run, written by `pnpm claude:memory reviewed`
and read by `pnpm claude:memory status`. No line means no review has ever
run. `status` uses it to decide whether a review is due, checked in order:
the index at 80 percent of either cap, 10 or more entries added since the
last review, never reviewed with 5 or more entries, or 90 days elapsed since
the last review; the first of these that fires is the one reported.

## Reading and writing

This directory only defines the data; the CLI that operates on it lives in
`scripts/agent-memory/`. Use it rather than opening these files by hand, so a
session pulls in one topic instead of the whole directory:

- `pnpm claude:memory list`
- `pnpm claude:memory search "<query>"`
- `pnpm claude:memory read <topic>`
- `pnpm claude:memory write <topic> --summary "<one line>" --content "<body>"`
- `pnpm claude:memory remove <topic>`
- `pnpm claude:memory status`
- `pnpm claude:memory reviewed`

`pnpm claude:memory --help` documents every flag with its default, the
topic-name and summary limits, and the exit codes.

An entry is added only after the retrospective skill proposes it and the user
approves the proposal. No entry is written directly from a session's own
judgment.

## What `search` reads

`search` covers two corpora. First this directory, ranked by how many lines of
a file matched. Then the reports under `.claude/retrospectives/`, every hit
marked `(retrospective <date>)`, or `(retrospective, date unknown)` when the
report's file name carries no date, ranked by the report with the most
matching lines first, ties broken by the newest report, and paged so one dense
report cannot crowd out every other report that matched. Those reports are raw
session evidence rather than approved memory, and `.claude/CLAUDE.md`, under
"Shared memory", says what a session may do with a hit in one.

Four flags shape that second block. `--retrospective-page` walks the ranked
report list. The footer closing the block says how many reports it showed of
how many matched and which page of how many this is, and it names that flag
with the next page number only when reports remain after the page just
printed, so the last page and any page past the last end without it.
`--retrospective-files` sets how many reports get snippets on a page and
`--retrospective-lines` how many snippet lines each of them gets, with a line
under any snippet that got cut saying how many more hits that report holds.
`--retrospective-since <YYYY-MM-DD>` keeps only reports dated on or after that
day, and never drops a report whose file name carries no date. `--limit` caps
the memory hits alone and leaves the retrospective block untouched.

## Superseding a wrong entry

A memory entry that turns out to be wrong is not deleted and not silently
overwritten. The topic is rewritten with the correct content, and the new
body carries a line naming what changed:

```
Superseded YYYY-MM-DD: the entry previously said <X>; that stopped being true because <Y>.
```

An arXiv result and an independent vendor converged on marking supersession
rather than deleting, because the old claim is the evidence that explains why
the new one looks surprising. Deleting a topic outright is for an entry that
was never true or is no longer about anything, not for one that merely went
out of date.

## Boundary against `.claude/rules/`

`.claude/rules/` holds authored instructions: rules the user or the project
decided should always apply. This directory holds learned context: things a
session found out, not things it was told. A rule belongs in `.claude/rules/`
even if a retrospective is what surfaced the need for it; only observations,
decisions-with-reasons, and traps that already cost time belong here.
