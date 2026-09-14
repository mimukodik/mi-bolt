# Retrospectives

This folder holds the outputs of the `retrospective` skill, named
`<YYYY-MM-DD>-<id8>.md` where `id8` is the first 8 characters of the session
id. Every processed session gets a file here, even when the skill found
nothing worth proposing; in that case the file still contains the session
summary and a `## Not proposed` section ending with the line `No proposal.`.

A file named `<YYYY-MM-DD>-<id8>.skipped.md` marks a session where the
SessionStart hook offered a retrospective and the user declined it.

A `.skipped.md` marker keeps its session off the SessionStart hook's pending
list unconditionally. A finished retrospective file usually does the same, but
not always: a session that kept working after its file was written can be
offered again. `.claude/hooks/CLAUDE.md` owns the marker rule and gives the
exact conditions.

When a proposal file has actual proposals in it, they are proposals only;
the skill never applies them automatically. Before applying one, the user
must be asked with the AskUserQuestion tool which proposal to accept.

Once the user has answered, an `Outcomes` section in the same file records
what became of every proposal in it, so a proposal the user declined is never
mistaken for one that was approved and then lost. The skill does not write
that section, because it finishes before the user is asked;
`packages/shared/.agents/skills/retrospective/SKILL.md` defines its shape and
`.claude/rules/session-lifecycle.md` says when the orchestrator adds it.

A file is kept rather than deleted once its proposals are applied: it is the
only record of what was decided, and the SessionStart hook goes by the file
names in this directory and by their modification times, never by what is
inside them, so deleting a file can put its session back on the pending list
and rewriting one can take it off.

The reports here are also a searchable corpus, not only an archive:
`pnpm claude:memory search "<term>"` matches them alongside the shared memory,
so a session can find what an earlier one learned without knowing which
session produced it. `.claude/shared-memory/CLAUDE.md`, under
"What `search` reads", owns how those hits are ranked, paged and filtered, and
`.claude/CLAUDE.md`, under "Shared memory", says how a session may use such a
hit, which is not how a memory entry is used.

That search deliberately skips two kinds of file in this directory. This
`README.md` is documentation about the archive rather than a record of any
session, and a `.skipped.md` marker records only that an offer was declined,
so neither carries session evidence a search could usefully match.
`isRetrospectiveReport` in `scripts/agent-memory/store/retrospective.ts`
is what excludes them, so any further kind of non-report file added here has
to be excluded there too, or it starts turning up as a hit.

The `.skipped.md` suffix itself is spelled out twice, so renaming it means
changing both places: `SKIPPED_MARKER_SUFFIX` in
`.claude/hooks/common/pending-sessions.ts`, which the SessionStart hook matches
decline markers by, and `SKIPPED_SUFFIX` in the same
`scripts/agent-memory/store/retrospective.ts`, which `isRetrospectiveReport`
excludes them by. Collapsing the two into one shared constant was tried and
rejected: the hooks package cannot import the memory tool's code, and the memory
tool's store layer is pure, so the store will not reach into hook code either.
Only the memory tool's test suite does, and that is what keeps the two spellings
in step: `scripts/agent-memory/store/retrospective.test.ts` imports the hook's
exported constant and asserts `isRetrospectiveReport` still rejects a name built
from it, in the case named "rejects the exact suffix the SessionStart hook
writes a decline as". Change one copy alone and that test goes red naming the
other. Run it with
`pnpm vitest run scripts/agent-memory/store/retrospective.test.ts`.
