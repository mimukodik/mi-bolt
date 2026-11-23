# MiBolt MVP — execution contract

These files under docs/ are a planning handoff inside the application repository. They are NOT a completed Angular app. The project instructions are the repository root `CLAUDE.md` and `.claude/`; this document does not overwrite them.

## Design authority

`docs/design/general-mimukodik/` is the storefront’s visual reference. Use it for colour, typography, radii and component styling. The screen specification and contract define shopping behavior.

Public demo UI stays Hungarian; everything else committed to this repository is English. The original reference raster still contains superseded brand text; it remains immutable evidence, not live website text. Render the current brand as MiBolt in all functional UI.

## Non-negotiable engineering boundaries

Use latest stable Angular major 22 only, CSR/standalone/zoneless, signals and modern template control flow. No SSR or prerender. Use OpenAPI 3.1.0, `ng-openapi-gen`, and MSW-only business API data. No live backend, real payment, real email, tracking, social or external commerce SaaS. Do not substitute a component fixture, SDK spy or HttpTestingController for network-level MSW in business tests.

Read docs/spec/architecture.md, docs/spec/screens.md, docs/spec/components.md, docs/spec/testing.md and docs/spec/acceptance.md before work. Implement the tracked work in its dependency order. Each task needs failing behavior tests, minimal implementation, passing tests and independent skill-based review. Deliver the unit coverage floor each project's aggregate is measured against — statements 80, branches 75, functions 80, lines 80, as `docs/spec/testing.md` §1 describes — plus the behavioral/state coverage matrix; do not hide unvisited code. The end-to-end suite was reinstated on 2026-09-22: Playwright under `e2e/`, written only by the `playwright-test-*` agents, its CI job skipped until the first spec lands. The coverage policy explicitly separates owned runtime code from generated/vendor/test-only files.

Only O01 (3D) is optional and requires explicit approval. Do not add tariffs, billing, login, newsletter, chat, recommendation SaaS or a partner switcher to fill space. Keep fictional products/prices clearly marked as demo data. The admin application under projects/admin (MIM-296) is outside this shop specification.

Never claim a planned test has run. Evidence must name commands, revisions, viewports, outputs and remaining limitations.

## Package paths and runtime output

All `docs/...` paths are relative to the Angular workspace root, `frontend/`. `tests/...` and `scripts/...` also refer to that root; `src/...` and `public/...` refer to the storefront project, `frontend/projects/storefront/`; never to this docs folder. Do not scaffold an application inside `docs/`. The OpenAPI source of truth is `contracts/commerce/openapi.yaml` at the git root, read by `frontend/ng-openapi-gen.json` and `frontend/ng-openapi-gen.admin.json`; run the generator from `frontend/`. No second hand-maintained OpenAPI file is permitted.

The acceptance IDs in `docs/spec/acceptance.md` remain the scope authority and the work is tracked in Linear — the machine-readable task packets were deleted with `docs/tasks/`; the prompt adds independent subagent review and real browser verification gates. A planning status or old prototype screenshot is not application evidence.
