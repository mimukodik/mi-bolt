# API-szerződés és mock-adatok

Az egyetlen normatív wire-szerződés az [openapi.yaml](openapi.yaml). A fájl és a `fixtures/` eredeti tartalma változatlan maradt a dokumentáció átrendezésekor. A generált JSON-változatot és a levezethető műveletlistát nem duplikáljuk.

## Helye a projektben

- Szerződés: `docs/mi-bolt/api/openapi.yaml`. Ezt validáld, és ebből generálj. Ne hozz létre második, kézzel karbantartott `api/openapi.yaml` példányt a projekt gyökerében.
- Generátorminta: [ng-openapi-gen.json](ng-openapi-gen.json). A T04 másolja a projekt gyökerébe `ng-openapi-gen.json` néven. A `$schema`, az `input` és az `output` útvonalakat a **projekt gyökeréből** kell értelmezni.
- SDK-kimenet: `src/app/api/generated/`. Kézzel nem módosítható.
- Mock-adatok: `docs/mi-bolt/api/fixtures/`. A MSW-implementáció innen vezesse le a determinisztikus fixture-készletét; a dokumentáció HTML-jeit és képernyőképeit ne másolja a runtime buildbe. A buildhez szükséges előállított fixture-másolatot drift-ellenőrzés védje, ne legyen második kézzel szerkesztett adatforrás.

A generátorkonfiguráció átvétele és a függőség telepítése után a projekt gyökeréből futtatandó parancs:

```sh
npm run api:generate
```

Ennek a T04-ben létrehozott package scriptnek a tartalma: `ng-openapi-gen --config ng-openapi-gen.json`. Ez előírt megvalósítási lépés, nem már létező vagy itt lefuttatott alkalmazásparancs. A teszt- és release-parancsok teljes listája: [tesztstratégia](../spec/testing.md).
