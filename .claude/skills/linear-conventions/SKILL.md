---
name: linear-conventions
description: >-
  Everything this workspace does when writing to Linear: how anything written
  there is worded and formatted (the two-layer human-first structure, emoji,
  the measured markdown behaviour, what Linear rewrites on the way in), what
  may never be touched (an issue description, another author's comment), what
  has to be on the issue once the work is done (two current comments: a running
  summary extended in place, plus a separate how-to-test comment), and the
  mandatory check of related issues for anything that would change their work.
  Load this before writing or editing anything in Linear: a comment, a
  sub-issue, an attachment, or any decision about what belongs in a comment
  rather than a description. Reading an issue, listing its comments, or
  fetching its description does not need it. Also load it when finishing a
  piece of work that came from a Linear issue, since that is when the closing
  comments and the related-issue check happen.
scope: dev
---

# Linear conventions

## What is mandatory

**This skill governs writing, not reading.** Opening an issue by its key or
URL, listing its comments, or fetching its description needs nothing from
here. Load it before anything goes into Linear: a comment, a sub-issue, an
attachment, or a decision about what belongs in a comment rather than a
description. Load it again when work that came from an issue is finishing,
which is when the closing comments and the related-issue check happen.

**A named issue is owed a report.** `.claude/CLAUDE.md` ("Project-specific
guidelines") is where that obligation lives; an issue key (`PX-488`), a Linear
URL, or a branch name carrying one all count as naming one. It obliges the
work, not the loading of this file: nobody has to ask for the comments
separately, they are part of the task, and this skill is loaded when the time
comes to write them.

**The description is never mine to edit.** Not an edit, not an append, not
"just one section at the end". Everything I produce goes in a comment, and that
includes indexes, plans, summaries, links and diagrams that would read
perfectly well in the description. If something genuinely belongs there, I say
so in one sentence and the user makes the edit. `.claude/CLAUDE.md` carries
this one prohibition too, because it can be broken before anyone would think to
load this skill.

**One comment, extended throughout.** One session or feature branch keeps one
running summary comment, extended in place as the work moves. A fresh comment
per batch is wrong. A new comment is created only when I have no summary
comment on that issue yet.

**Both layers, the human one first.** Testers read the issue, not only
developers. A purely technical summary is useless to a tester, and what goes
missing from it is exactly their job: what changed on screen. Every Linear text
carries the user story layer first, the technical layer after it.

**A second comment says how to test**, at the end of the work, separate from
the summary. It and the summary are the deliberate exception to the
one-comment rule, and both have to be current when the work is called done.
See "Two current comments at the end".

**Scope.** The comment summarises the work that was asked for. I do not mine
the other comments on the issue for findings and raise them unasked; that is
the scope rule in `.claude/CLAUDE.md` under "Surgical changes".

The rest of this skill has two halves. **Writing in Linear** applies to
anything put there at any time: language, formatting, emoji, attachments,
sub-issue bodies. **When the work is done** is the reporting obligation: the
two comments and what goes in them.

---

# Writing in Linear

## Language

Linear content is written in **English**, like the rest of the repository. The
conversation with the user follows the user's language; the issue does not.

## Measured Linear markdown behaviour

Measured in this workspace on 2026-09-03 by writing to PX-488 and its
sub-issues and reading the stored body back. Linear takes markdown natively, so
the Jira wiki-markup traps this convention came from do not apply here.

**Survives unchanged:** `**bold**`, backtick code spans, `##` and `###`
headings, numbered lists, tables, fenced code blocks. Fenced ` ```mermaid `
blocks survive byte identical and Linear renders them.

**Angle brackets survive**, including inside a code span. `` `<script>` `` and
`plan:<planId>` both came back intact. This is the opposite of the Jira
behaviour the original convention warned about.

**Normalised on the way in, cosmetic only:**

- `- ` list bullets are stored as `* `.
- A table delimiter row `| --- |` is stored as `| -- |`, and an empty cell as
  `|  |`.

**Actually changes meaning, so write around it:**

- **Bold wrapped around a code span gets split.** ``**One accepted `lucide-react`
  exception**`` was stored as ``**One accepted** `lucide-react` **exception**``.
  Keep the code span outside the bold, or accept the split.
- **A bare issue key in prose is auto-linked.** `PX-488` is stored as
  `<issue id="..." href="...">PX-488</issue>`. Harmless in a comment; it matters
  when round-tripping a description, because those tags and any
  `<linear-comment id="...">` anchor must be passed back verbatim or the inline
  comment they anchor is detached.

**Attachment links.** The stored body keeps the bare
`https://uploads.linear.app/<...>` URL. Linear appends a short-lived
`?signature=` JWT on every read, so a URL copied out of an API response expires
within minutes while the comment's own link keeps working. Never paste a
signed URL anywhere; use the bare asset URL.

**Size.** No cap is documented. Linear's published GraphQL schema types
`Comment.body` as an unconstrained `String!`, and no official source states a
character or byte limit
([linear/linear schema.graphql](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)).
A 14 KB comment posted without complaint. Treat the ceiling as unknown rather
than large, and split a very long report across comments rather than testing it
on something that matters.

**Not measured:** emoji rendering and the `@displayName` mention syntax. The
tool documentation states mentions work as `@displayName`; that is unverified
here.

## Emoji

A comment should read as more visual than a wall of text, which is why the
density here goes past the one-per-heading rule this convention started with.
Every section heading carries one, and so does every status marker, every
verdict cell of a results table, every item of a findings or carried-forward
list, every line of an inner list, and every step a tester is asked to
perform, wherever the table below has a row for what that line is. What to do
with a line no row fits is under the table.

They stay markers, not decoration: one per line, saying what kind of line this
is. Never a string of them, and never one dropped into the middle of a
sentence, which is where an emoji stops carrying information.

**The same meaning always takes the same glyph**, and this table is the whole
vocabulary. A marker earns its place only if it means the same thing in every
comment on every issue; one chosen fresh each time is decoration again, and it
is the reader, not the writer, who pays for that.

| Glyph | What it marks |
| --- | --- |
| 📋 | The summary: the one-line what, an index, a plan |
| 👤 | What a person sees or does: a screen, a click path, a test step |
| 🔧 | How it works underneath: files, schema, endpoint, key, parameter |
| 📝 | Commits and history |
| 🧪 | Testing: what ran, what it proved, how to test |
| 🎯 | What it aims at: an expected result, an end state, why it was done |
| 🔍 | A finding, an investigation, a root cause |
| ✅ | It works, it passed, it is done |
| ⚠️ | A caveat, a risk, an edge case |
| ❌ | It failed, it does not work |
| 🧷 | Found here and not fixed here: pre-existing, or carried forward |

**Where two rows could claim the same line, what the line is for decides.** A
verdict cell in a results table reports how a check came out, so its glyph is
✅ or ❌ and never another. A line in a findings list is read for what the
reader has to do about it, so the marker that says that outranks the one that
says how bad it is: 🧷 beats ⚠️ and ❌ on a finding this work is not fixing,
because who picks it up next is what the reader acts on, and severity alone is
not. The 🔍 on a findings heading marks the section those findings sit in
rather than each line inside it, as the worked example below shows.

A line whose kind is not in that table takes no marker rather than a new
glyph, because a glyph invented for one comment is what turns the vocabulary
back into a suggestion. Where the same unlisted kind keeps coming up, it earns
a row here first.

**Worked example**, at the density to copy:

```markdown
### 🔍 Findings

- ✅ The upload progress bar now updates from the server event.
- ⚠️ Retrying an upload clears the caption, so re-enter it before retrying.
- 🧷 A file over 2 GB fails silently, pre-existing and not fixed here.

| Check | Result |
| --- | --- |
| Typecheck | ✅ |
| Coverage floor | ✅ |
| Browser verification | ✅ Chrome, console clean |
```

## Attaching files to an issue

Three calls per file, strictly one file at a time, because the signed upload
URL expires in 60 seconds:

1. `mcp__linear-server__prepare_attachment_upload` with `issue`, `filename`,
   `contentType`, exact `size` in bytes, and a `title` / `subtitle`.
2. `PUT` the raw bytes to `uploadRequest.url` with every header from
   `uploadRequest.headers` sent verbatim, casing included. Any omitted or
   altered signed header returns HTTP 403.
3. `mcp__linear-server__create_attachment_from_upload` with the `assetUrl` from
   step 1.

Attachments are flat, so a name that repeats across directories needs a prefix
(`hu-00-execution-plan.md`) and the original repo-relative path goes in the
`subtitle`. The documented ceiling is 2 GB per file.

An attachment does not render inline in Linear; it downloads. Anything a reader
must be able to see without downloading belongs in the comment body.

## Sub-issues

When an issue is broken into sub-issues, each sub-issue's body carries what an
implementer needs to execute it alone: its acceptance criteria verbatim, its
commits, and pointers back into the attached documents. The parent keeps the
index and the dependency picture in a comment. Blocking relations go on the
sub-issues with `save_issue`'s `blocks` / `blockedBy`, which are append-only.

---

# When the work is done

## Workflow for the summary comment

1. **Read what is there.** `mcp__linear-server__list_comments` with `issueId`.
   Find my own comment by `author` plus its content. Do not assume the newest
   one is mine, and do not skip this step because I remember posting one.
2. **Extend it.** `mcp__linear-server__save_comment` with `id` set to that
   comment's id and the full new `body`. Passing `id` updates in place.
3. **Or create the first one.** `save_comment` with `issueId` and `body` and no
   `id` posts a new top-level comment. This is only for the first summary
   comment on the issue.
4. **Never touch another author's comment.** `mcp__linear-server__delete_comment`
   exists and works, which is the one place Linear is better than the Jira MCP
   this convention came from, but it is for a duplicate I created myself in this
   session. Nothing else.
5. **Reply, do not fork a thread.** `save_comment` with `parentId` replies
   inside an existing thread. Use it to answer someone, not to add work
   summaries.

`mcp__linear-server__save_issue` with `description` or `patch` is how an issue
description is edited. In this workspace that call is off limits for the
description of an issue the user owns.

## The comment template

```markdown
## 📋 <One line: what this branch did>

### 👤 What changed for the user

**<Screen or feature name>**
- 👤 Before: <what the user saw>
- 👤 After: <what the user sees now>
- 🎯 Why: <one sentence>

**<Next screen or feature>**
- 👤 Before: ...
- 👤 After: ...
- 🎯 Why: ...

### 🔧 Technical

- 🔧 **Files and libraries:** ...
- 🔧 **Schema and migrations:** ...
- 🔍 **Root cause** (for a bug): ...
- 🧪 **Tests:** what ran, what it proved
- ⚠️ **Known risks:** ...

### 📝 Commits

`git log origin/<base>..HEAD --oneline` output, whole branch.
```

Write that first section in the user's vocabulary: screen and button labels,
menu entries, column names. Not field names, not component or file names, not
store or reducer terms.

Its scope is the whole branch, so build it from `git log origin/<base>..HEAD`,
run after a `git fetch` so the ref is current, not from the last few commits.
`<base>` is the branch this one was cut from, `main` in the ordinary case and
something else on a branch cut from another feature branch; a
`task-execute-workflow` run settled it in that skill's opening questions,
where what this needs is the start point those answers settled rather than the
pull request's base, the two being the same answer unless the user named a
different start point. It is the remote-tracking ref that is named and not the
bare branch name, because a local `<base>` sitting behind its remote puts
commits that are not this branch's into the list, and a base that only ever
existed on `origin` has no local ref for `git log` to resolve at all. Naming
that ref is enough on its own, with no merge base to work out first, because
the two-dot form leaves out everything reachable from it, including work that
landed on the base after this branch was cut. Keep the two dots: for
`git log`, `origin/<base>...HEAD` is a symmetric difference and adds the base
branch's own commits to the list, which is not what the three dots in
`git diff --name-status <base>...HEAD` do in
`.claude/rules/code-standards.md`.

A change belongs there if a person can perceive it, however small it was in
the diff: a breadcrumb label, a row height, a moved column. "Technically
insignificant" is not a reason to leave out something someone can see.

## The how-to-test comment

A second, separate `save_comment` at the end of the work. Same two-layer
discipline: the steps reference what the user can see (menu entry, button
label, column name), and the technical background (endpoint, storage key, mock
parameter) comes after the step it belongs to, not instead of it. Every step
carries its own expected result, and the comment ends with the expected end
state: a tester who has followed all of them needs to know what "it worked"
looks like, not only that no step errored.

```markdown
## 🧪 How to test

1. 👤 <Click path through the visible UI>
   - 🎯 Expected: <what should appear>
   - 🔧 Behind it: <endpoint, key, parameter, if it helps>
2. ...

### ⚠️ Edge cases
- ⚠️ <signed out, empty list, error path, ...>

### 🎯 Expected end state
<What the screen shows and what the data looks like once every step above has
been followed.>
```

Where the change went through the real-browser loop in
`.claude/rules/browser-verification.md`, this comment is where that run is
published: what was driven, what the screenshots showed, that the console was
clean.

## Two current comments at the end

The two comments are one obligation with two parts, and both parts have to be
current when the work is called done. Not one comment, and not a summary last
updated halfway through the branch.

- **The summary** says what happened and what changed: the user story layer
  first, in ordinary human language, the technical layer after it.
- **The how-to-test comment** says what to test and how: the exact steps, the
  expected result at each step, and the expected end state.

The summary is still the running comment extended in place; that rule does not
change. What changes is the check at the end. Re-read the summary with
`list_comments` and confirm that its final state covers the whole branch,
instead of remembering that it was updated earlier in the session. A summary
extended mid-branch plus a how-to-test comment posted at the end looks, from
the issue's activity feed alone, like only one comment was ever written, which
is how this went wrong in the session the rule came from. Reading it back is
the check; remembering is not.

## Check the related issues before closing, and where a finding goes

**The check is mandatory. Writing is not.** When the work is done, look at the
issue's relations: its `blocks`, its `blockedBy`, and its parent.
`mcp__linear-server__get_issue` returns the blocking and related relations
only when `includeRelations` is `true`, and that parameter defaults to
`false`, so a plain read comes back without them and the check passes without
ever having run. If the tool no longer takes that parameter, ask for the
relations however its current schema spells it; the check needs the relations
in hand, not a particular flag.

The threshold for writing on a related issue is whether, without the comment,
the person who picks that issue up would do the work wrongly or differently.
Three cases qualify:

- This work disproved a premise the other issue is built on.
- This work measured a fact that changes how the other issue has to be
  solved.
- This work created a trap the other issue will certainly walk into.

So a finding has three possible homes, and the threshold above decides only
the first of them: a comment on the related issue, where one of those three
cases holds; the summary comment on the issue that was actually worked on, for
anything the reader of that issue needs; and an issue of its own, for a real
defect that no existing issue carries, which "A finding that outlives this
issue" below owns. A merely interesting finding is not a reason to write on
someone else's issue, and a "we are done" status update is not one either.

The failure mode a related-issue comment invites is an agent spraying status
notes across every linked issue until none of them is readable, and the cost
of that lands on the people who have to read those issues later. Where a
comment is warranted, keep it short: name the one thing that changes the
reader's work and link back to the full summary instead of copying it.

Worked example: a transport spike that disproves the authorisation premise the
next phase's design section rests on writes one short note on that next issue.
The same spike's test coverage numbers do not.

**A finding that outlives this issue needs a home that outlives it.** The
summary comment is the right place for anything the reader of this issue
needs and the wrong place for a defect nobody has scheduled, because once the
issue closes its comments are read by whoever audits that work and by no one
else. Where the work turns up something real that is neither this branch's to
fix nor any existing issue's to carry, it becomes an issue of its own before
this one closes, filed under the same parent as the issue being worked on
where there is one, so it sits beside that issue rather than inside it and the
parent is where a reader will find it; the summary comment then points at it
instead of holding it. The call is `mcp__linear-server__save_issue` with
`team`, `title`, and the worked issue's key or id as `parentId`, and with no
`id`: omitting `id` is what makes it create rather than update, and `title` is
required unless a `template` is passed. Filing it is an outward-facing action
like a comment on a related issue, so the **Who writes it.** paragraph below
governs who asks and who writes. On PX-614 the finding sat in a summary
comment on an issue that was minutes from `Done`, and the issue owner caught
it (in English: "but why there? we are going to close the task now that we
have finished!"). It became PX-756 under PX-488.

**Who writes it.** A subagent doing the work never writes to a related issue
on its own initiative; it reports the finding upward and stops there. Both the
check and the write belong to the orchestrator's closing step, and the
orchestrator does not write it unasked either: it asks the user first, and
then writes that one comment itself, since a write to Linear is one of the
exceptions `.claude/CLAUDE.md` ("How I work") keeps with the orchestrator and
no definition in `.claude/agents/` carries the Linear tools. Writing to a
related issue is an outward-facing action, so it is named in the question text
itself and never carried inside an option's description of some larger
question. That rule is
in `.claude/CLAUDE.md` under "Asking the user" and is not restated here.

## Where this came from

Localised from a Jira convention the issue owner uses in another project. What
changed in the move: the tool names, the formatting section (rewritten from
measurement, because Linear does not convert markdown to wiki markup), the
delete story (Linear can delete a comment; the Jira MCP could not), and the
never-touch-the-description rule, which is this workspace's own and was added
after an edit to a Linear description was rejected on 2026-09-03. What carried
over unchanged: the one-comment discipline, the two-layer human-first
structure, and the separate how-to-test comment. What this workspace has
changed since: the trigger, which now fires on writing rather than on naming
an issue; the emoji rule, raised past one marker per heading and pinned to a
fixed vocabulary; and the related-issue check, which is this workspace's own.
