# MiBolt MVP — projektbe helyezhető dokumentáció

## Hová kerüljön?

A dokumentáció a monorepó `frontend/docs/` mappájában van, lapos elrendezésben:

```text
docs/
├── README.md        ez a belépő
├── spec/            architektúra, képernyők, komponensek, tesztek,
│                    elfogadás és technológiai döntések
├── api/             SDK-generálás, fixture-k
├── design/          yettel design reference, demo images
└── briefs/          a korábbi runner-briefek archívuma
```

Ez tervezési és végrehajtási dokumentáció, **nem kész Angular alkalmazás**.

## Fejlesztés indítása

This needs repository access, command execution, real subagent spawning, a browser tool and the design reference [`design/yettel.md`](design/yettel.md). A [végrehajtási szabályok](spec/execution-rules.md) tartalmazzák a felderítést, a szerepköröket, a kötelező review-/javítási ciklust, a dependency-alapú sorrendet, a tesztkapukat és a végső átadást.

## Hol mit találsz?

| Cél | Belépő |
|---|---|
| Architektúra és komponenskommunikáció | [Architektúra](spec/architecture.md), [komponensek](spec/components.md) |
| Pontos képernyők és reszponzív állapotok | [Képernyő-specifikáció](spec/screens.md), [design belépő](design/README.md) |
| API és SDK-generálás | [API belépő](api/README.md), [OpenAPI](../../contracts/commerce/openapi.yaml) |
| Tesztek és teljes projektelfogadás | [Tesztstratégia](spec/testing.md), [elfogadás](spec/acceptance.md) |
| Kötelező végrehajtási szabályok | [Execution rules](spec/execution-rules.md) |
| Kutatásból átvett és kizárt technológiák | [Döntések](spec/technology-decisions.md), [forrásjegyzék](spec/sources.md) |

The interactive handover report (`index.html`) and the clickable prototype (`design/prototype.html`) were removed on 2026-09-22: they showed the pre-yettel plan, and the spec files under `spec/` and `design/yettel.md` are the live source.

## Mi került ki?

A gépi task-, követelmény- és elfogadási leírók (`tasks/`) és a rájuk épülő `spec/traceability.md` a monorepó-migrációban kikerültek; a nyilvántartás a Linear. A prózai párjuk (`spec/acceptance.md`, `spec/test-scenarios.md`, `spec/testing.md`) marad. Korábban kikerült a skill másolata, a nyers kutatások és eredeti ZIP-ek, a régi validációs logok/segédszkriptek, a generált OpenAPI JSON, a task-CSV és a redundáns exportok. A forrásazonosítás és a kutatásból levont döntések a `spec/` alatt megmaradnak.

## Fontos végrehajtási részletek

A csomag minden `docs/...` hivatkozása az Angular workspace gyökeréhez (`frontend/`) képest értendő; a `src/...` útvonalak a bolt forrására (`frontend/projects/storefront/src/...`) mutatnak. Az OpenAPI forrása a git gyökerében lévő `contracts/commerce/openapi.yaml`; a bolt SDK-ja a `frontend/projects/storefront/src/app/api/generated/` mappába generálódik. A részleteket az [API belépő](api/README.md) rögzíti.

A végrehajtás a `docs/mi-bolt/execution/` alatt hozza majd létre a valós munkanaplót, skill-helyet, reviewer-jelentéseket és bizonyítékokat. Üres vagy előre „PASS”-ra állított evidence nincs a csomagban. A régi látványprototípus nem helyettesíti a készülő Angular alkalmazás friss tesztjeit és böngészős ellenőrzését.

Az O01 3D külön jóváhagyás nélkül nem része a baseline-nak. A unit-lefedettség küszöbe projektenként 80/75/80/80 (statements/branches/functions/lines), és az e2e-csomag 2026-09-22 óta újra része a projektnek; a hiteles leírás a [tesztstratégia](spec/testing.md). A verziókat végrehajtáskor ismét ellenőrizni kell; a dokumentáció dátumozott verzióadatai nem automatikusan aktuálisak.
