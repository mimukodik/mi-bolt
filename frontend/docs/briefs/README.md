# Runner briefs — archived from the 2026-09-20 session

These are the prompts handed to detached `coder-agent.sh` runners on
2026-09-20, kept because the user asked for them to survive the session that
wrote them. They lived in a session scratchpad that is deleted when the session
ends.

**They are a reference, not a rule and not maintained tooling.** Nothing reads
them at runtime. `.claude/rules/orchestrated-coding.md` ("Briefs") is what
actually governs how a brief is written; these are worked examples of it.

## Why keep them

The user asked for briefs to be spoon-fed after counting how many fix rounds
vague ones were costing: *"figyelj oda az erős promptolásra inkább legyen
szájbarágós … nagyon sok javítási kör van még mindig"*. These are what that
looks like in practice, and the shape is worth copying rather than
rediscovering. Each one carries, in this order:

1. the sandbox's refusals, up front, because each one costs a whole tool call
   (no pipes, no redirection, no `$(...)`, no heredocs, no `find`, no
   multi-operator chains, no `git checkout/restore/reset/stash/clean`);
2. that looking a fact up is mandatory and where, with the URL required in the
   report beside the claim;
3. the defect as measured, with real numbers, not as a description;
4. the fix as a decision already made, with an explicit "do not redesign it";
5. the files the runner owns, named one at a time, and the files it must not
   touch;
6. tests, each one named, with an instruction to prove them red before green;
7. the gates, with the exact before and after test counts;
8. the exact `git add` and `git commit` commands, because the `-p` sandbox
   refuses `-F`, `git -C` and heredocs;
9. a report schema where every field has to be answered.

Two of them — `brief-centreline.md` and `brief-focus-handoff.md` — also show
the pattern of telling the runner to **check the orchestrator's own claim** and
report `blocked` if the sources contradict it. In the centreline case the
runner came back with the MDN sentence that confirmed it; that is cheaper than
being wrong.

## What is here

| file | unit | outcome |
|---|---|---|
| `brief-is-record.md` | `isRecord` guard, nine `as Record` casts | landed |
| `brief-event-target.md` | thirteen `event.target` casts | landed |
| `brief-cart-domain.md` | six casts under `src/mocks/` | landed |
| `brief-catalog-query.md` | four literal-union casts | landed |
| `brief-cart-facade.md` + `resume-cart-facade.md` | `CartError.code` lying about `'UNKNOWN'` | landed |
| `brief-plain-img.md` | `NgOptimizedImage` → plain `<img>` | landed |
| `brief-centreline.md` | the checkout centreline | landed |
| `brief-guard-reason.md` | unknown cart vs empty cart in the guards | landed |
| `brief-focus-handoff.md` + `resume-focus-handoff.md` | focus hand-off to the results counter, then the label fix | landed |
| `brief-deeplink-wait.md` | the checkout deep-link must not bounce | superseded (MIM-212) |

`resume-*.md` files are fix rounds: what went back to a runner after a
verification found a blocking problem. `resume-focus-handoff.md` is the better
example — it opens by saying what in the previous commit is correct and must
not be reworked, which is what keeps a fix round from turning into a rewrite.
