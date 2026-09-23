# Adatbázis elvárások

## 1. Kötelező szabály

**Az adatbázis-konténert kizárólag a `scripts/local-database-docker.sh` szkripten keresztül
szabad kezelni.**

Tilos közvetlenül `docker`, `docker compose`, `docker exec` vagy külső `psql` parancsot kiadni a
konténerre. Nem azért, mert nem működne, hanem mert a szkript kezeli az env fájlt, a
projektnevet, az egészségellenőrzést és a hibás állapotokat — a mellette elmenő beavatkozás ezt
megkerüli, és olyan állapotot hagy hátra, amit a szkript már nem ismer fel.

Ez a szabály a fejlesztőre és minden automatizált ügynökre egyaránt vonatkozik.

**A tesztek pedig egyáltalán nem érhetik el ezt a konténert.** Sem elindítani, sem csatlakozni
nem szabad hozzá tesztből: a tesztek mockolva vagy memóriában futó adatbázissal futnak. A
részletek és az ebből fakadó feszültség a `02-backend.md` 7.0 szakaszában.

### A szkript parancsai

```
./scripts/local-database-docker.sh start      # vagy: up
./scripts/local-database-docker.sh stop       # vagy: down
./scripts/local-database-docker.sh restart
./scripts/local-database-docker.sh reset
./scripts/local-database-docker.sh status
./scripts/local-database-docker.sh check      # vagy: ping, check-run
./scripts/local-database-docker.sh logs
./scripts/local-database-docker.sh psql       # vagy: cli — SQL-konzol a konténerben
./scripts/local-database-docker.sh --help
```

SQL futtatásához a `psql` alparancs való, nem saját kliens.

---

## 2. Amit a konténer ad

Ezek a repó jelenlegi beállításai, nem javaslatok:

| | |
|---|---|
| Kép | `postgres:16.15-alpine3.24` |
| Compose projekt | `mi-bolt-local` |
| Konténer | `mi-bolt-postgres` |
| Port | **55433** a gazdagépen → 5432 a konténerben |
| Kötet | `mi-bolt-postgres-data` — **szándékosan Docker named volume** |
| Kapcsolatok | `max_connections=250` |
| Egészségellenőrzés | `pg_isready`, 2 másodpercenként |

Alapértelmezett hitelesítés (helyi, eldobható értékek, nem titok):
`mi_bolt` / `mi_bolt` / `mi_bolt_local`, adatbázis `mi_bolt`.

Kapcsolati URL: `postgresql://mi_bolt:mi_bolt_local@localhost:55433/mi_bolt`

A hitelesítés a `.docker-compose.local-database.env` fájlból jön, ami **gitignore-olt**; első
futáskor a szkript másolja a példafájlból. Ebbe a fájlba semmilyen valódi titok nem kerülhet.

**Adatmentés és költöztetés:** a kötet szándékosan named volume, ezért az adat mozgatása
`pg_dump` / `pg_restore` útján történik, nem a kötet másolásával.

---

## 3. Alkalmazás-oldali elvárások

A `src/main/resources/application.properties` jelenleg csak az alkalmazás nevét tartalmazza. Az
adatforrás beállítása még hiányzik, és a fenti porthoz és hitelesítéshez kell illeszkednie.

- A kapcsolati adatok **környezeti változóból** jöjjenek, a fenti értékekkel mint helyi
  alapértelmezés. Jelszó nem kerülhet a verziókezelőbe.
- A sémát **nem** a JPA generálja. Az `spring.jpa.hibernate.ddl-auto` értéke fejlesztésben
  legfeljebb `validate` lehet, `update` és `create` semmiképp — a séma forrása a migráció.
- Az alkalmazásnak **nem szabad elindulnia** olyan adatbázissal, aminek a sémája nem egyezik az
  elvárttal. A néma továbbfutás rosszabb, mint a korai leállás.

---

## 4. Séma-elvárások

A részleteket a `02-backend.md` 5. szakasza tartalmazza. Amit adatbázis-szinten ki kell
kényszeríteni:

- A termék `slug`-ja **egyedi**; a variáns `slug`-ja a terméken belül egyedi, az azonosítója
  globálisan egyedi.
- Egy munkamenethez **egy aktív kosár** tartozhat.
- Egy kosárban **egy variáns legfeljebb egyszer** szerepelhet — ezt egyedi megszorítás védje, ne
  csak alkalmazáslogika. Ez az, ami két párhuzamos kérésnél megakadályozza a duplikált sort.
- A rendelésszám **egyedi**.
- Az idempotencia-kulcs a metódussal, az útvonallal és a munkamenettel együtt **egyedi**.
- Az adminisztrátor felhasználóneve (`admin_user.username`) **egyedi**.
- A készlet **nem mehet nulla alá**. Ezt adatbázis-szintű megszorítás védje.
- Pénzértékek **egész forintban**, egész típusú oszlopban. Lebegőpontos típus pénzre tilos.

---

## 5. Migráció

**Eszköz: Liquibase**, changelog-alapon. A Spring Boot indításkor futtatja és ellenőrzi.

Elvárások:

- A séma teljes története verziókezelt changelog-fájlokban él, és **üres adatbázisból
  reprodukálható**.
- A changelog-készletek **előre felé** haladnak; egy már futtatott changeset-et nem írunk át,
  helyette újat veszünk fel.
- Az alkalmazás indulásakor ellenőrzi, hogy a séma naprakész-e, és **nem indul el** elavult
  sémával.
- A `04-adatbazis.md` 4. szakaszában felsorolt megszorítások (egyediség, készlet nem negatív,
  egész pénzérték) a changelog részei, nem alkalmazáslogika.

**A kezdőadat elkülönül a sémától.** A katalógus betöltése külön, **újrafuttatható** lépés, nem
séma-changeset — a demót újra és újra fel kell tölteni, és a katalógus változása nem
sémaváltozás. A `reset` utáni újratöltésnek egyetlen parancsból mennie kell.
