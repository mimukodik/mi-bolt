# AGENTS.md — MiBolt

This file is the entry point for any agent doing work in the MiBolt repository.
The specification lives under `docs/`. What follows states the rules that are
specific to this repository and names the file that owns each of the others; it
does not restate them.

## The mi-bolt-design skill is mandatory, without exception

Using the separately installed **`mi-bolt-design`** skill is strictly mandatory
for every implementation and for every verification or review in this
repository, without exception. This includes nonvisual work — build, API,
mock, test-infrastructure and documentation tasks. Read the skill and its
task-relevant references before implementation, and independently again before
acceptance.

The skill's `## 26 Verifiable Rules` table (R01–R26) is the audit checklist for
every task. Each task records the applicability and outcome of every relevant
R-rule. A nonvisual task may mark individual visual rules **not applicable**,
but each N/A carries a one-sentence reason; silent omission is not a reason.

The resolved path, approved version and SHA-256 of the installed skill are
recorded in `docs/mi-bolt/execution/skill-location.json`, which is the only
source of truth for those three values. Do not copy, reinstall, recreate or
embed the skill inside this repository. A missing skill is a blocker, not
permission to invent its content.

## Where the rest of the rules live

| Subject | Owner |
|---|---|
| TypeScript, Angular, component, state, template and service conventions | the root `CLAUDE.md` |
| The execution contract and the non-negotiable engineering boundaries | `docs/spec/execution-rules.md` |
| Architecture, screens, components, testing, acceptance | `docs/spec/` |
| The wire contract | `docs/api/openapi.yaml` |
| Task packets and the dependency graph | `docs/tasks/` |
| The repair package for the defects found in the audit | `docs/fix/` |
| Visual references and the clickable prototype | `docs/design/` |

Do not restate what any of those say. The root `CLAUDE.md` is in the same
directory as this file, so a pointer to it resolves for any agent, Claude or
not.

## Three repository facts no document owns

- The package manager is **npm**, pinned by `package.json`'s `packageManager`
  field (`npm@11.17.0`). There is no pnpm and no `mise` configuration in this
  repository, so every command in every document here is a bare `npm run …`.
- The mock API is **MSW running as a service worker in the browser**, not a
  server. `src/mocks/repository.ts` is page-side memory; there is no backend
  to ask.
- The demo persists nothing real: no order is placed, no payment is taken, no
  email is sent, and every product and price is fictional demo data that must
  stay labelled as such.

## What is not in this file

This file carries repository guidance only. Session-management rules — model
routing, subagent spawning, task tracking, Linear conventions, shared memory,
retrospectives — belong to the harness configuration that owns them and are
not copied here. A rule that already lives in another file is pointed at,
never restated: a second copy drifts from the original and the drift is
invisible.
