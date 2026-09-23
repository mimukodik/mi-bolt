# Framework facts

How a fact about Angular, the CLI, the build, or any other tool in this stack
is established: read from that tool's own documentation, never discovered by
experiment. Loaded at launch as a project rule (no `paths` scope, so it reaches
every subagent except the built-in Explore and Plan agents). Referenced from
`.claude/CLAUDE.md`.

## Look it up; do not probe

**A question about how the framework behaves is answered from the
documentation, not from a probe.** No scratch component, no throwaway app, no
experiment built to see what happens. Before writing anything that depends on
how Angular, the Angular CLI, the `@angular/build` builders, Vitest or MSW
behave, read it. Playwright joined that list on 2026-09-22 when the
end-to-end suite was reinstated: a question about Playwright's own behaviour
is read from https://playwright.dev/docs, not measured by a throwaway spec.

The reason is the version. This workspace runs Angular 22, TypeScript 6 and
ESLint 10, all newer than the model's training data, and that gap is an
argument for reading the documentation rather than for measuring the framework
by hand. A probe answers one narrow question at the cost of a build cycle and
returns a belief with nothing behind it; the documentation answers the
question, says why, and gives the supported alternative.

The instruments, in order:

- **`mcp__angular-cli__search_documentation`**, with `version: 22` and
  `includeTopContent: true` when the page text is wanted rather than a list of
  links. It queries angular.dev's index for that major version. Its `version`
  parameter is a number, and the field to read back is `searchedVersion`,
  which says which index actually answered. Query it with keywords
  (`"content projection ng-content"`), not a sentence: a natural-language
  query returns `{"results":[]}` where the keyword form returns the page.
  Every agent definition under `.claude/agents/` carries this tool except
  `real-browser-sonnet`, `scout-haiku` and the three `playwright-test-*`
  definitions, so an agent that writes or reviews
  code here has it; grep the definitions rather than trusting this sentence
  once they change.
- **`mcp__angular-cli__get_best_practices`**, for the version-specific coding
  standards, and `mcp__angular-cli__list_projects` for the workspace's own
  projects, builders and test framework.
- **`WebSearch` and `WebFetch`**, for anything angular.dev does not cover, and
  for release notes, issues and changelogs.

**The URL goes in the report, beside the claim.** `.claude/CLAUDE.md`
("Verification and evidence") already requires that of every statement not
measured in this session; this file says which tools to reach for first when
the statement is about the framework.

**This binds a spawn prompt as much as a report.** A framework fact written
into a prompt carries its source or it does not go in. Handing an agent an
unsourced belief turns it into an instruction the agent has no way to doubt,
and `.claude/rules/session-lifecycle.md` ("Agent definitions and subagent
prompts") covers the same failure for claims about this branch's history.

## Measuring this repository is a different thing, and is unchanged

Everything the gates and the shell already do stays required: running
`npm --prefix frontend run test`, `npm --prefix frontend run lint` and
`npm --prefix frontend run build` and reading the exit codes; grepping the
tree; reading `frontend/angular.json`, `frontend/package.json` and
`frontend/eslint.config.mjs`; `git log -S` to find when a line
arrived. Reading the installed source under `node_modules/` to settle what a
version actually ships is also measurement, not a probe.

What is banned is discovering *documented framework behaviour* by experiment.
The test is whose behaviour the question is about: this repository's, or the
framework's.

## The case this rule was written from

A `coder-sonnet` agent building the catalogue extraction needed to know whether
several `<ng-content>` elements sharing the default selector work across
`@switch` branches. It built an isolated probe component, measured that none of
the branches received the projected content, adopted a single unconditional
default slot as the workaround, and reported the finding. The orchestrator then
copied that finding into two further spawn prompts as a measured fact.

One `search_documentation` call returns
https://angular.dev/guide/components/content-projection, which states it
outright:

> IMPORTANT: You should not conditionally include `<ng-content>` with `@if`,
> `@for`, or `@switch`. Angular always instantiates and creates DOM nodes for
> content rendered to a `<ng-content>` placeholder, even if that
> `<ng-content>` placeholder is hidden. For conditional rendering of component
> content, see Template fragments.

The probe found the prohibition and missed the remedy: the supported approach
is **template fragments**, an `ng-template` plus `ngTemplateOutlet`, not the
single-slot workaround that shipped. The same page also gives two facts the
probe was never going to surface — projected content is checked when the
**parent** runs change detection, so `OnPush` on the receiving component does
not skip it, and it resolves its dependencies from the **parent's** injector
rather than the receiving component's `viewProviders`.

The rule is the user's, in their own words: "nem kell angular csapdakat
merni!!! weben mindent fent van es ott van angular mcp!!!! miert okoskodtok?
nagyon uj angular verzioval foglalkozzunk amit nem ismertek, tippelgetes
helyett weben le van irva minden!" ("there is no need to measure Angular
traps!!! everything is up on the web and the Angular MCP is right there!!!!
why are you being clever? we are working with a very new Angular version that
you do not know, instead of guessing everything is written down on the web!").
