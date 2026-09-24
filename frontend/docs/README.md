# MiBolt MVP — documentation ready to be placed in the project

## Where it lives

The documentation is in the monorepo's `frontend/docs/` folder, in a flat layout:

```text
docs/
├── README.md        this entry point
├── spec/            architecture, screens, components, tests,
│                    acceptance and technology decisions
├── api/             SDK generation, fixtures
├── design/          yettel design reference, demo images
└── briefs/          the archive of the earlier runner briefs
```

This is design and execution documentation, **not a finished Angular application**.

## Starting development

This needs repository access, command execution, real subagent spawning, a browser tool and the design reference [`design/yettel.md`](design/yettel.md). The [execution rules](spec/execution-rules.md) carry the reconnaissance, the roles, the mandatory review/fix cycle, the dependency-based order, the test gates and the final handover.

## What is where

| Goal | Entry point |
|---|---|
| Architecture and component communication | [Architecture](spec/architecture.md), [components](spec/components.md) |
| Exact screens and responsive states | [Screen specification](spec/screens.md), [design entry](design/README.md) |
| API and SDK generation | [API entry](api/README.md), [OpenAPI](../../contracts/commerce/openapi.yaml) |
| Tests and overall project acceptance | [Test strategy](spec/testing.md), [acceptance](spec/acceptance.md) |
| Mandatory execution rules | [Execution rules](spec/execution-rules.md) |
| Technologies adopted from the research and excluded | [Decisions](spec/technology-decisions.md), [source list](spec/sources.md) |

The interactive handover report (`index.html`) and the clickable prototype (`design/prototype.html`) were removed on 2026-09-22: they showed the pre-yettel plan, and the spec files under `spec/` and `design/yettel.md` are the live source.

## What was removed

The machine-readable task, requirement and acceptance descriptors (`tasks/`) and the `spec/traceability.md` built on them were removed; the register is Linear. Their prose counterparts (`spec/acceptance.md`, `spec/test-scenarios.md`, `spec/testing.md`) stay. Removed earlier were the skill copy, the raw research and the original ZIPs, the old validation logs/helper scripts, the generated OpenAPI JSON, the task CSV and the redundant exports. Source identification and the decisions taken from the research stay under `spec/`.

## Important execution details

Every `docs/...` reference in this package is relative to the Angular workspace root (`frontend/`); `src/...` paths point at the shop's source (`frontend/projects/storefront/src/...`). The OpenAPI source is `contracts/commerce/openapi.yaml` at the git root; the shop SDK is generated into the `shop-api` library, `frontend/projects/shop-api/src/generated/`. The [API entry](api/README.md) records the details.

The work log, reviewer reports and evidence are tracked in Linear. The package contains no empty or pre-set "PASS" evidence. The old visual prototype does not replace the fresh tests and browser verification of the Angular application being built.

O01 3D is not part of the baseline without separate approval. The unit coverage threshold is 80/75/80/80 per project (statements/branches/functions/lines), and the e2e suite has been part of the project again since 2026-09-22; the authoritative description is the [test strategy](spec/testing.md). Versions must be checked again at execution time; the documentation's dated version data is not automatically current.
