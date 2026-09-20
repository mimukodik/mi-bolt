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

## Frissítés a backendről

A szerződés forrása a backend repository `api/openapi.yaml` fájlja. Az `npm run api:sync` parancs a `gh api` segítségével tölti le (alapértelmezetten a `main` refet, a `--ref` kapcsolóval egy commitot vagy taget pinningelve) a `docs/api/openapi.yaml` útvonalra, majd újrafuttatja az SDK generálását. A `--dry-run` csak a forrás sha-t és méretet írja ki, letöltés és generálás nélkül. Az `npm run api:drift` továbbra is őrzi, hogy a commitolt SDK megegyezzen a commitolt szerződéssel.

> **Megjegyzés (D08):** A korábban tévesen egy `mi-bolt/` alkalmazásmappa-előtaggal hivatkozott útvonal soha nem létezett; a valódi forrás mindig a fenti `docs/api/openapi.yaml` volt, és a `docs/fix` csomag (FIX-36) azóta ki is javította a hibás hivatkozást a dokumentáció többi részében. A `scripts/validate-contract.mjs` és a `scripts/api-drift.mjs` a D17 döntés nyomán megszűnt. A szerződést ma az `npm run api:generate` (`ng-openapi-gen.json` `input` mezője), az `npm run api:drift` (ugyanaz a generálás, majd `git diff --exit-code` és `git ls-files --others --exclude-standard`) és a `tests/contract/` alatti vitest-tesztek olvassák.
