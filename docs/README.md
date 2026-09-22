# MiBolt MVP — projektbe helyezhető dokumentáció

## Hová kerüljön?

A dokumentáció már a projekt `docs/` mappájában van, lapos elrendezésben:

```text
docs/
├── README.md        ez a belépő
├── spec/            architektúra, képernyők, komponensek, tesztek,
│                    elfogadás és technológiai döntések
├── api/             OpenAPI YAML, generátorminta, fixture-k
├── design/          yettel design reference, screenshots, demo images
└── tasks/           géppel olvasható task-, követelmény- és
                     elfogadási leírók, függőségi gráf
```

Ez tervezési és végrehajtási dokumentáció, **nem kész Angular alkalmazás**.

## Fejlesztés indítása

This needs repository access, command execution, real subagent spawning, a browser tool and the design reference [`design/yettel.md`](design/yettel.md). A [végrehajtási szabályok](spec/execution-rules.md) tartalmazzák a felderítést, a szerepköröket, a kötelező review-/javítási ciklust, a dependency-alapú sorrendet, a tesztkapukat és a végső átadást.

## Hol mit találsz?

| Cél | Belépő |
|---|---|
| Architektúra és komponenskommunikáció | [Architektúra](spec/architecture.md), [komponensek](spec/components.md) |
| Pontos képernyők és reszponzív állapotok | [Képernyő-specifikáció](spec/screens.md), [design belépő](design/README.md) |
| API és SDK-generálás | [API belépő](api/README.md), [OpenAPI](api/openapi.yaml) |
| Taskok és dependency gráf | [Feladatjegyzék](tasks/README.md) |
| Tesztek és teljes projektelfogadás | [Tesztstratégia](spec/testing.md), [elfogadás](spec/acceptance.md) |
| Kötelező végrehajtási szabályok | [Execution rules](spec/execution-rules.md) |
| Kutatásból átvett és kizárt technológiák | [Döntések](spec/technology-decisions.md), [forrásjegyzék](spec/sources.md) |

The interactive handover report (`index.html`) and the clickable prototype (`design/prototype.html`) were removed on 2026-09-22: they showed the pre-yettel plan, and the spec files under `spec/` and `design/yettel.md` are the live source.

## Miért maradt néhány JSON-fájl?

A `tasks.json`, `requirements.json`, `project-acceptance.json` és `test-scenarios.json` a dependency-, követelmény- és acceptance-ellenőrzések géppel feldolgozható bemenete. Ezek nem régi futási logok. A tasklapok olvasható végrehajtási csomagok; az azonosítóik és feltételeik megegyeznek a gépi leíróval.

Az OpenAPI YAML, a fixture-k, a komponens-/képernyőtervek és a taskok megmaradtak. **A skill másolata, a nyers kutatások és eredeti ZIP-ek, a régi validációs logok/segédszkriptek, a generált OpenAPI JSON, a task-CSV és a redundáns exportok kikerültek.** A forrásazonosítás és a kutatásból levont döntések a `spec/` alatt megmaradnak.

## Fontos végrehajtási részletek

A csomag minden `docs/...` hivatkozása a projekt gyökeréhez képest értendő. A forráskód és a root konfigurációk a projektbe kerülnek, nem ide. Az OpenAPI forrása a docs-ban marad; az SDK a projekt `src/app/api/generated/` mappájába generálódik. A részleteket az [API belépő](api/README.md) rögzíti.

A végrehajtás a `docs/mi-bolt/execution/` alatt hozza majd létre a valós munkanaplót, skill-helyet, reviewer-jelentéseket és bizonyítékokat. Üres vagy előre „PASS”-ra állított evidence nincs a csomagban. A régi látványprototípus nem helyettesíti a készülő Angular alkalmazás friss tesztjeit és böngészős ellenőrzését.

Az O01 3D külön jóváhagyás nélkül nem része a baseline-nak. A kötelező alkalmazásscope és a 100%-os unit-követelmény változatlan; e2e-csomag a termékgazda 2026-09-20-i döntése óta nincs. A verziókat végrehajtáskor ismét ellenőrizni kell; a dokumentáció dátumozott verzióadatai nem automatikusan aktuálisak.
