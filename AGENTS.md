# AGENTS.md — MiBolt

This file is the entry point for any agent doing work in the MiBolt repository.
The specification lives under `docs/`. What follows states the rules that are
specific to this repository and names the file that owns each of the others; it
does not restate them.

## The design authority is `docs/design/yettel.md`

The visual language of this application is the one captured from yettel.hu
under `docs/design/yettel/` and written up in `docs/design/yettel.md`: colour
tokens, typography, radii, the button, card, filter, header and gallery
recipes, and the list- and device-page feature inventories against the
backend contract. Every implementation and every review of a rendered surface
cites that document for each value it uses or checks; a value it does not
carry is measured on `docs/design/yettel/css/portal.css` and added there
before it is used. The earlier `mi-bolt-design` skill, its R01–R26 audit
table and `docs/mi-bolt/execution/skill-location.json` are retired
(2026-09-20), and the task packets and repair notes that cited them were
deleted with it.

## Where the rest of the rules live

| Subject                                                                 | Owner                                   |
| ----------------------------------------------------------------------- | --------------------------------------- |
| TypeScript, Angular, component, state, template and service conventions | the root `CLAUDE.md`                    |
| The execution contract and the non-negotiable engineering boundaries    | `docs/spec/execution-rules.md`          |
| Architecture, screens, components, testing, acceptance                  | `docs/spec/`                            |
| The wire contract                                                       | `docs/api/openapi.yaml`                 |
| Task packets and the dependency graph                                   | `docs/tasks/`                           |
| The design authority, the captured yettel.hu source and the prototype   | `docs/design/yettel.md`, `docs/design/` |

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
