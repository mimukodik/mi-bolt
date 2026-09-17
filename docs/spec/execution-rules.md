# MiBolt MVP — execution contract

These files under docs/mi-bolt are a planning handoff inside the application repository. They are NOT a completed Angular app. The repository root AGENTS.md is created or carefully merged in T00; this document does not overwrite existing project instructions.

## Mandatory skill rule

**Using `mi-bolt-design` is STRICTLY MANDATORY for every implementation execution and every verification/review, without exception.** Resolve the separately installed skill using the harness's actual skill discovery or existing configured skill locations. Record its entrypoint, root, approved version 1.0.1 and SHA-256 in `docs/mi-bolt/execution/skill-location.json`. Read the skill and task-relevant references before implementation, and independently before each acceptance/re-review. Do not copy, reinstall, recreate or embed the skill inside this documentation package. A missing skill is a real blocker, not permission to invent its content. No API/testing/build task may skip the rule: mark individual visual rules not applicable with a reason, while retaining demo-data, truthfulness and review constraints.

The separately managed skill and all its related textual files stay in English. Public demo UI stays Hungarian. The original reference raster still contains superseded brand text; it remains immutable evidence, not live website text. Render the current brand as MiBolt in all functional UI.

## Non-negotiable engineering boundaries

Use latest stable Angular major 22 only, CSR/standalone/zoneless, signals and modern template control flow. No SSR or prerender. Use OpenAPI 3.1.0, `ng-openapi-gen`, and MSW-only business API data. No live backend, real payment, real email, tracking, social or external commerce SaaS. Do not substitute a component fixture, SDK spy or HttpTestingController for network-level MSW in business tests.

Read docs/mi-bolt/spec/architecture.md, docs/mi-bolt/spec/screens.md, docs/mi-bolt/spec/components.md, docs/mi-bolt/spec/testing.md and docs/mi-bolt/spec/acceptance.md before work. Implement task packets in the dependency DAG. Each task needs failing behavior tests, minimal implementation, passing tests and independent skill-based review. Deliver exact 100% unit AND independent E2E source metrics plus the behavioral/state coverage matrix; do not lower the requirement or hide unvisited code. The coverage policy explicitly separates owned runtime code from generated/vendor/test-only files.

Only O01 (3D) is optional and requires explicit approval. Do not add tariffs, billing, login, newsletter, chat, recommendation SaaS or a partner switcher to fill space. Keep fictional products/prices clearly marked as demo data.

Never claim a planned test has run. Evidence must name commands, revisions, viewports, outputs and remaining limitations.

## Package paths and runtime output

All `docs/mi-bolt/...` paths are relative to the application repository root. Source-code paths such as `src/...`, `tests/...`, `e2e/...`, `scripts/...`, `public/...` and `AGENTS.md` also refer to that root, never to this docs folder. Do not scaffold an application inside `docs/mi-bolt`. The OpenAPI source of truth stays at `docs/mi-bolt/api/openapi.yaml`. Copy the configuration blueprint `docs/mi-bolt/api/ng-openapi-gen.json` to the repository root as `ng-openapi-gen.json` in T04; run the generator from that root. No second hand-maintained OpenAPI file is permitted.

The implementation controller follows `docs/mi-bolt/VEGREHAJTASI-PROMPT.hu.md`. Task packets and acceptance IDs remain the scope authority; the prompt adds independent subagent review and real browser verification gates. Runtime records go under `docs/mi-bolt/execution/`, created during execution. A planning status or old prototype screenshot is not application evidence.
