# MiBolt MVP — execution contract

These files under docs/ are a planning handoff inside the application repository. They are NOT a completed Angular app. The repository root AGENTS.md is created or carefully merged in T00; this document does not overwrite existing project instructions.

## Design authority

`docs/design/yettel.md` is the design reference for every implementation and every verification or review of a rendered surface: it carries the colour tokens, typography, radii and recipes captured from yettel.hu under `docs/design/yettel/`, and the feature inventories against the backend contract. Cite it for each value used or checked; a value it does not carry is measured on `docs/design/yettel/css/portal.css` and added there before use. The `mi-bolt-design` skill and `docs/mi-bolt/execution/skill-location.json` were retired on 2026-09-20; the task packets under `docs/tasks/` that cite them are the original planning record, not current instructions.

Public demo UI stays Hungarian; everything else committed to this repository is English. The original reference raster still contains superseded brand text; it remains immutable evidence, not live website text. Render the current brand as MiBolt in all functional UI.

## Non-negotiable engineering boundaries

Use latest stable Angular major 22 only, CSR/standalone/zoneless, signals and modern template control flow. No SSR or prerender. Use OpenAPI 3.1.0, `ng-openapi-gen`, and MSW-only business API data. No live backend, real payment, real email, tracking, social or external commerce SaaS. Do not substitute a component fixture, SDK spy or HttpTestingController for network-level MSW in business tests.

Read docs/spec/architecture.md, docs/spec/screens.md, docs/spec/components.md, docs/spec/testing.md and docs/spec/acceptance.md before work. Implement task packets in the dependency DAG. Each task needs failing behavior tests, minimal implementation, passing tests and independent skill-based review. Deliver exact 100% unit AND independent E2E source metrics plus the behavioral/state coverage matrix; do not lower the requirement or hide unvisited code. The coverage policy explicitly separates owned runtime code from generated/vendor/test-only files.

Only O01 (3D) is optional and requires explicit approval. Do not add tariffs, billing, login, newsletter, chat, recommendation SaaS or a partner switcher to fill space. Keep fictional products/prices clearly marked as demo data.

Never claim a planned test has run. Evidence must name commands, revisions, viewports, outputs and remaining limitations.

## Package paths and runtime output

All `docs/...` paths are relative to the application repository root. Source-code paths such as `src/...`, `tests/...`, `e2e/...`, `scripts/...`, `public/...` and `AGENTS.md` also refer to that root, never to this docs folder. Do not scaffold an application inside `docs/`. The OpenAPI source of truth stays at `docs/api/openapi.yaml`. Copy the configuration blueprint `docs/api/ng-openapi-gen.json` to the repository root as `ng-openapi-gen.json` in T04; run the generator from that root. No second hand-maintained OpenAPI file is permitted.

Task packets and acceptance IDs remain the scope authority; the prompt adds independent subagent review and real browser verification gates. Runtime records go under `docs/mi-bolt/execution/`, created during execution. A planning status or old prototype screenshot is not application evidence.
