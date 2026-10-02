# Adatbázis elvárások

## 1. Kötelező szabály

**A helyi adatbázist a git gyökeréből futó mise-taskok kezelik**, a `deploy/compose.yaml`
`postgres` szolgáltatásaként. Minden más Compose-parancs is a `deploy/compose.sh` burkolón át
megy, soha nem közvetlenül `docker`, `docker compose` vagy külső `psql` paranccsal: a burkoló
hozza létre első futáskor a `deploy/.env` fájlt, és azt a Compose-t használja, amelyik a gépen
van (`docker compose` vagy `docker-compose`).

Ez a szabály a fejlesztőre és minden automatizált ügynökre egyaránt vonatkozik.

**A tesztek pedig egyáltalán nem érhetik el ezt a konténert.** Sem elindítani, sem csatlakozni
nem szabad hozzá tesztből: a tesztek mockolva vagy memóriában futó adatbázissal futnak. A
részletek és az ebből fakadó feszültség a `02-backend.md` 7.0 szakaszában.

### A parancsok

A git gyökeréből:

```
mise run db                  # csak a PostgreSQL; megvárja, amíg egészséges
mise run backend             # az adatbázis, majd a backend natívan (bootRun)
mise run backend:docker      # az adatbázis és a backend konténerben
mise run stop                # minden konténer leáll; a kötet megtartja az adatot
deploy/compose.sh ps         # a konténerek állapota
deploy/compose.sh logs -f postgres
deploy/compose.sh exec postgres psql -U mi_bolt -d mi_bolt   # SQL-konzol a konténerben
```

SQL futtatásához a konténerben futó `psql` való, nem saját kliens.

---

## 2. Amit a konténer ad

Ezek a `deploy/compose.yaml` és a `deploy/.env.example` beállításai, nem javaslatok:

| | |
|---|---|
| Kép | `postgres:16.15-alpine3.24`, digesttel rögzítve |
| Compose projekt | `mi-bolt-local` (`COMPOSE_PROJECT_NAME`) |
| Szolgáltatás | `postgres` |
| Port | **55433** a gazdagépen (`MIBOLT_POSTGRES_PORT`) → 5432 a konténerben |
| Kötet | `mi-bolt-postgres-data` (`MIBOLT_POSTGRES_VOLUME`) — **szándékosan Docker named volume** |
| Kapcsolatok | `max_connections=250` |
| Egészségellenőrzés | `pg_isready`, 2 másodpercenként |

Alapértelmezett hitelesítés (helyi, eldobható értékek, nem titok):
`mi_bolt` / `mi_bolt` / `mi_bolt_local`, adatbázis `mi_bolt`.

Kapcsolati URL: `postgresql://mi_bolt:mi_bolt_local@localhost:55433/mi_bolt`

A hitelesítés a `deploy/.env` fájlból jön, ami **gitignore-olt**; első futáskor a
`deploy/compose.sh` másolja a `deploy/.env.example` fájlból. Ebbe a fájlba semmilyen valódi
titok nem kerülhet.

Egy második stack a fejlesztőé mellett saját `COMPOSE_PROJECT_NAME`, `MIBOLT_POSTGRES_VOLUME`
és portok mellett fut; a `deploy/compose.sh` megtagadja, hogy egy másik projekt a fejlesztő
kötetét használja.

Egy git worktree-nek saját stackje van a `deploy/stack.sh` paranccsal: ez egy port-sávot
(„slot”) foglal le magának egy 20 elemű, gépszintű nyilvántartásból, és a saját projektnevét,
portjait meg kötetét a gitignore-olt `deploy/.worktree-stack.env` fájlban tárolja. A worktree
törlése előtt a `deploy/stack.sh reset --yes` törli a saját kötetét és felszabadítja a foglalt
sávot, különben a konténer, a kötet és a port a worktree eltávolítása után is megmarad.

**Adatmentés és költöztetés:** a kötet szándékosan named volume, ezért az adat mozgatása
`pg_dump` / `pg_restore` útján történik, nem a kötet másolásával.

---

## 3. Alkalmazás-oldali elvárások

A `backend/services/commerce/src/main/resources/application.properties` a kapcsolatot három
környezeti változóból olvassa, a fenti értékekkel mint helyi alapértelmezéssel:
`MIBOLT_DB_URL` (`jdbc:postgresql://localhost:55433/mi_bolt`), `MIBOLT_DB_USER` (`mi_bolt`),
`MIBOLT_DB_PASSWORD` (`mi_bolt_local`).

- A kapcsolati adatok **környezeti változóból** jönnek. Valódi jelszó nem kerülhet a
  verziókezelőbe.
- A sémát **nem** a JPA generálja: a `spring.jpa.hibernate.ddl-auto` értéke `validate`,
  `update` és `create` semmiképp — a séma forrása a migráció.
- Az alkalmazásnak **nem szabad elindulnia** olyan adatbázissal, aminek a sémája nem egyezik
  az elvárttal. A néma továbbfutás rosszabb, mint a korai leállás.

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

**Gördülő kiadás: a régi és az új commerce átmenetileg egyszerre fut.** A Helm chart
`RollingUpdate` stratégiája `maxUnavailable: 0`, `maxSurge: 1` értékekkel megtartja a régi
podot, amíg az új befejezi a migrációt és a katalógus betöltését, majd Ready lesz.
Ezért a migráció csak hozzáadó és a régi kód olvasásaival, írásaival kompatibilis lehet:
új tábla, új nullable oszlop vagy index. A Hibernate a leképezett oszlopokat validálja;
a hozzáadott, nem leképezett oszlopokat figyelmen kívül hagyja.

Oszlop törlése vagy átnevezése, inkompatibilis típusváltás vagy megszorítás szigorítása
**expand/contract** lépésekben, több kiadáson át történik: először hozzáadjuk az új sémát,
majd átállítjuk a kódot és az adatokat, és csak akkor távolítjuk el a régi alakot, amikor
már egyik futó verzió sem használja. A visszaállított alkalmazásnak is kompatibilisnek kell
lennie a már migrált sémával; az új migráció nem feltételezheti, hogy a régi pod leállt.

Az admin munkamenet folyamaton belül él: minden kiadás elveszíti, és az átfedés alatt
is megszakadhat. A demó 7. lépésében a régi pod eltűnése után újra be kell jelentkezni
a stabil adminba.

**A kezdőadat elkülönül a sémától.** A katalógus betöltése külön, **újrafuttatható** lépés, nem
séma-changeset — a demót újra és újra fel kell tölteni, és a katalógus változása nem
sémaváltozás. A `reset` utáni újratöltésnek egyetlen parancsból mennie kell.
