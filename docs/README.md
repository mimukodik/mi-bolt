# MiBolt MVP — projektbe helyezhető dokumentáció

## Hová kerüljön?

A dokumentáció már a projekt `docs/` mappájában van, lapos elrendezésben:

```text
docs/
├── README.md        ez a belépő
├── index.html       magyar interaktív áttekintő
├── spec/            architektúra, képernyők, komponensek, tesztek,
│                    elfogadás és technológiai döntések
├── api/             OpenAPI YAML, generátorminta, fixture-k
├── design/          prototípus, képernyőtervek, helyi demóképek
├── tasks/           T00–T29, opcionális O01, függőségi gráf
├── fix/             a javítási csomag
└── mi-bolt/
    └── execution/   a végrehajtás közben keletkező bizonyítékok
```

Ez tervezési és végrehajtási dokumentáció, **nem kész Angular alkalmazás**.

## Fejlesztés indítása

Ehhez repository-hozzáférés, parancsfuttatás, valódi subagentindítás, böngészős eszköz és a **külön telepített `mi-bolt-design` skill** szükséges. A [végrehajtási szabályok](spec/execution-rules.md) tartalmazzák a felderítést, a szerepköröket, a kötelező review-/javítási ciklust, a dependency-alapú sorrendet, a tesztkapukat és a végső átadást.

**A skill nincs a ZIP-ben, és nincs a HTML-riportba sem beágyazva. A használata ettől még minden végrehajtásnál és ellenőrzésnél szigorúan kötelező.** A végrehajtó a meglévő harness-/projekt-/globális telepítést keresse meg; ne a docs alá készítsen másolatot.

## Hol mit találsz?

| Cél | Belépő |
|---|---|
| Áttekinteni az egész tervet | [Interaktív riport](index.html) |
| Kipróbálni a látványtervet | [Kattintható prototípus](design/prototype.html) |
| Architektúra és komponenskommunikáció | [Architektúra](spec/architecture.md), [komponensek](spec/components.md) |
| Pontos képernyők és reszponzív állapotok | [Képernyő-specifikáció](spec/screens.md), [design belépő](design/README.md) |
| API és SDK-generálás | [API belépő](api/README.md), [OpenAPI](api/openapi.yaml) |
| Taskok és dependency gráf | [Feladatjegyzék](tasks/README.md) |
| Tesztek és teljes projektelfogadás | [Tesztstratégia](spec/testing.md), [elfogadás](spec/acceptance.md) |
| Kötelező végrehajtási szabályok | [Execution rules](spec/execution-rules.md) |
| Kutatásból átvett és kizárt technológiák | [Döntések](spec/technology-decisions.md), [forrásjegyzék](spec/sources.md) |

A riport a csomag helyi képeire és fájljaira hivatkozik: **a teljes `mi-bolt/` mappát tartsd együtt**. Nem tölt be külső JavaScriptet, fontot vagy képet. A `design/prototype.html` külön is megnyitható, és változatlan maradt az előző átadáshoz képest.

## Miért maradt néhány JSON-fájl?

A `tasks.json`, `requirements.json`, `project-acceptance.json` és `test-scenarios.json` a dependency-, követelmény- és acceptance-ellenőrzések géppel feldolgozható bemenete. A `spec/coverage-policy.json` a minőségi küszöböket rögzíti. Ezek nem régi futási logok. A tasklapok olvasható végrehajtási csomagok; az azonosítóik és feltételeik megegyeznek a gépi leíróval.

Az OpenAPI YAML, a fixture-k, a komponens-/képernyőtervek és a taskok megmaradtak. **A skill másolata, a nyers kutatások és eredeti ZIP-ek, a régi validációs logok/segédszkriptek, a generált OpenAPI JSON, a task-CSV és a redundáns exportok kikerültek.** A forrásazonosítás és a kutatásból levont döntések a `spec/` alatt megmaradnak.

## Fontos végrehajtási részletek

A csomag minden `docs/...` hivatkozása a projekt gyökeréhez képest értendő. A forráskód és a root konfigurációk a projektbe kerülnek, nem ide. Az OpenAPI forrása a docs-ban marad; az SDK a projekt `src/app/api/generated/` mappájába generálódik. A részleteket az [API belépő](api/README.md) rögzíti.

A végrehajtás a `docs/mi-bolt/execution/` alatt hozza majd létre a valós munkanaplót, skill-helyet, reviewer-jelentéseket és bizonyítékokat. Üres vagy előre „PASS”-ra állított evidence nincs a csomagban. A régi látványprototípus nem helyettesíti a készülő Angular alkalmazás friss tesztjeit és böngészős ellenőrzését.

Az O01 3D külön jóváhagyás nélkül nem része a baseline-nak. A kötelező alkalmazásscope és a 100%-os unit-/független E2E-követelmény változatlan. A verziókat végrehajtáskor ismét ellenőrizni kell; a dokumentáció dátumozott verzióadatai nem automatikusan aktuálisak.
