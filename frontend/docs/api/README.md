# API contract and mock data

The single normative wire contract is [`contracts/commerce/openapi.yaml`](../../../contracts/commerce/openapi.yaml) at the git root; the backend and the frontend both generate from it. This folder holds the frontend-side description and the mock fixture.

## Where it sits in the project

- Contract: `contracts/commerce/openapi.yaml` (from the git root). A second, hand-maintained copy is not permitted.
- Generator configuration: `frontend/ng-openapi-gen.json` (shop) and `frontend/ng-openapi-gen.admin.json` (admin); both take `../contracts/commerce/openapi.yaml` in their `input` field.
- SDK output: `frontend/projects/shop-api/src/generated/` and `frontend/projects/admin/src/app/api/generated/`. Never edited by hand.
- Mock data: `fixtures/catalog.json`, the generated MSW fixture. Its source is `data/catalog/catalog.json` at the git root; `npm run fixtures:catalog` generates it and `npm run fixtures:catalog:check` verifies that it has not drifted.

Generation runs from the `frontend/` folder:

```sh
npm run api:generate
```

`npm run api:drift` runs the same generation and then checks with `git diff --exit-code` and `git ls-files --others --exclude-standard` that the committed SDK matches the committed contract. The vitest tests under `frontend/tests/contract/` read the contract too. The full list of test and release commands is in the [test strategy](../spec/testing.md).

## Two SDKs, one spec (MIM-331)

The single `contracts/commerce/openapi.yaml` generates two SDKs: `ng-openapi-gen.json` runs against the shop (`projects/shop-api/src/generated`, with `excludeTags` covering the four admin tag names so the shop SDK ships only the 19 shop operations), and `ng-openapi-gen.admin.json` runs against the admin application (`projects/admin/src/app/api/generated`, with `includeTags` set to the same four admin tags so the admin SDK ships only the 15 admin operations). `npm run api:generate` and `npm run api:drift` chain both generators and diff both outputs. `tests/contract/admin-tags.ts` is the one list of admin tags, and `tests/contract/sdk-split.spec.ts` pins the tag-list parity between the two configurations and the constant.
