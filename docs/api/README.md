# API-szerződés és mock-adatok

Az egyetlen normatív wire-szerződés az [openapi.yaml](openapi.yaml). A fájl és a `fixtures/` eredeti tartalma változatlan maradt a dokumentáció átrendezésekor. A generált JSON-változatot és a levezethető műveletlistát nem duplikáljuk.

## Helye a projektben

- Szerződés: `docs/api/openapi.yaml` (a projekt gyökeréből). Ezt validáld, és ebből generálj. Ne hozz létre második, kézzel karbantartott `api/openapi.yaml` példányt a projekt gyökerében.
- Generátorminta: [ng-openapi-gen.json](ng-openapi-gen.json). A T04 másolja a projekt gyökerébe `ng-openapi-gen.json` néven. A `$schema`, az `input` és az `output` útvonalakat a **projekt gyökeréből** kell értelmezni.
- SDK-kimenet: `src/app/api/generated/`. Kézzel nem módosítható.
- Mock-adatok: `docs/api/fixtures/`. A MSW-implementáció innen vezesse le a determinisztikus fixture-készletét; a dokumentáció HTML-jeit és képernyőképeit ne másolja a runtime buildbe. A buildhez szükséges előállított fixture-másolatot drift-ellenőrzés védje, ne legyen második kézzel szerkesztett adatforrás.

A generátorkonfiguráció átvétele és a függőség telepítése után a projekt gyökeréből futtatandó parancs:

```sh
npm run api:generate
```

Ennek a T04-ben létrehozott package scriptnek a tartalma: `ng-openapi-gen --config ng-openapi-gen.json`. Ez előírt megvalósítási lépés, nem már létező vagy itt lefuttatott alkalmazásparancs. A teszt- és release-parancsok teljes listája: [tesztstratégia](../spec/testing.md).

## Syncing from the backend

The contract's source is the backend repository's `api/openapi.yaml`. `npm run api:sync` downloads it through `gh api` (the `main` ref by default; `--ref` pins a commit or a tag) into `docs/api/openapi.yaml` and then regenerates the SDK. `--dry-run` only prints the source sha and size, without downloading or generating. `npm run api:drift` still guards that the committed SDK matches the committed contract.

> **Megjegyzés (D08):** A korábban tévesen egy `mi-bolt/` alkalmazásmappa-előtaggal hivatkozott útvonal soha nem létezett; a valódi forrás mindig a fenti `docs/api/openapi.yaml` volt, és a hibás hivatkozást azóta a dokumentáció többi része sem tartalmazza. A `scripts/validate-contract.mjs` és a `scripts/api-drift.mjs` a D17 döntés nyomán megszűnt. A szerződést ma az `npm run api:generate` (`ng-openapi-gen.json` `input` mezője), az `npm run api:drift` (ugyanaz a generálás, majd `git diff --exit-code` és `git ls-files --others --exclude-standard`) és a `tests/contract/` alatti vitest-tesztek olvassák.

## Two SDKs, one spec (MIM-331)

The single `docs/api/openapi.yaml` file generates two SDKs: `ng-openapi-gen.json` runs against the shop tree (`src/app/api/generated`, with `excludeTags` covering the four admin tag names so the shop SDK ships only the 17 shop operations), and `ng-openapi-gen.admin.json` runs against the admin application (`projects/admin/src/app/api/generated`, with `includeTags` set to the same four admin tags so the admin SDK ships only the 15 admin operations). `npm run api:generate` and `npm run api:drift` chain both generators and diff both outputs, so a contract 2.1.0 sync that drifts the wrong way fails the same drift guard the shop relied on. `tests/contract/admin-tags.ts` is the one list of admin tags, and `tests/contract/sdk-split.spec.ts` pins the tag-list parity between the two configurations and the constant.
