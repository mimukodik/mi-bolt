# API-szerződés és mock-adatok

Az egyetlen normatív wire-szerződés a git gyökerében lévő [`contracts/commerce/openapi.yaml`](../../../contracts/commerce/openapi.yaml); a backend és a frontend is ebből generál. Ez a mappa a frontend oldali leírást és a mock-fixture-t tartja.

## Helye a projektben

- Szerződés: `contracts/commerce/openapi.yaml` (a git gyökeréből). Második, kézzel karbantartott példány nem lehet.
- Generátorkonfiguráció: `frontend/ng-openapi-gen.json` (bolt) és `frontend/ng-openapi-gen.admin.json` (admin); mindkettő `input` mezője `../contracts/commerce/openapi.yaml`.
- SDK-kimenet: `frontend/projects/storefront/src/app/api/generated/` és `frontend/projects/admin/src/app/api/generated/`. Kézzel nem módosítható.
- Mock-adatok: `fixtures/catalog.json`, a generált MSW-fixture. A forrása a gyökér `data/catalog/catalog.json`; az `npm run fixtures:catalog` állítja elő, az `npm run fixtures:catalog:check` ellenőrzi, hogy nem tért el.

A generálás a `frontend/` mappából:

```sh
npm run api:generate
```

Az `npm run api:drift` ugyanezt a generálást futtatja, majd `git diff --exit-code`-dal és `git ls-files --others --exclude-standard`-dal ellenőrzi, hogy a commitolt SDK megfelel a commitolt szerződésnek. A szerződést a `frontend/tests/contract/` alatti vitest-tesztek is olvassák. A teszt- és release-parancsok teljes listája: [tesztstratégia](../spec/testing.md).

## Two SDKs, one spec (MIM-331)

The single `contracts/commerce/openapi.yaml` generates two SDKs: `ng-openapi-gen.json` runs against the shop (`projects/storefront/src/app/api/generated`, with `excludeTags` covering the four admin tag names so the shop SDK ships only the 17 shop operations), and `ng-openapi-gen.admin.json` runs against the admin application (`projects/admin/src/app/api/generated`, with `includeTags` set to the same four admin tags so the admin SDK ships only the 15 admin operations). `npm run api:generate` and `npm run api:drift` chain both generators and diff both outputs. `tests/contract/admin-tags.ts` is the one list of admin tags, and `tests/contract/sdk-split.spec.ts` pins the tag-list parity between the two configurations and the constant.
