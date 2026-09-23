# Üzembe helyezés (deploy)

Ez a leírás azt rögzíti, hogyan kerül a backend egy szerverre. A projekt demo
MVP, kiválasztott hoszting platformja nincs; ami itt áll, az minden olyan
gépen működik, ahol Docker fut és elérhető egy PostgreSQL 16 adatbázis. Ha
később platform (Render, Fly.io, egy VPS stb.) kerül kiválasztásra, annak a
lépései külön szakaszként ide kerülnek.

## 1. Ami a futáshoz kell

| Összetevő | Elvárás |
| --- | --- |
| Konténerfuttató | Docker (a `backend/services/commerce/Dockerfile` többlépcsős: Gradle build, majd `eclipse-temurin:21-jre` futtatókép) |
| Adatbázis | PostgreSQL 16, egy üres adatbázis és egy felhasználó, aki abban táblát hozhat létre (a sémát a Liquibase építi induláskor) |
| Hálózat | A konténer 8080-as portja; az API a `/api/v1` útvonalprefixen válaszol |
| Katalógus | A `data/catalog` könyvtár (`catalog.json` + `images/`, 48 termék, 85 kép) a kép építésekor bekerül a képbe (`COPY --from=catalog . ./data/catalog`, `ENV MIBOLT_CATALOG_PATH=/app/data/catalog` a Dockerfile-ban); az első induláskor üres adatbázisba ez töltődik be. Mountolás csak akkor kell, ha a katalógust kép-újraépítés nélkül kell cserélni |

Az alkalmazás Spring Boot Actuatort használ; az élőségellenőrzés a
`GET /api/v1/actuator/health/readiness` kérés válasza: 503, amíg az indítási
lépések (katalógusbetöltés, admin bootstrap) le nem futottak, utána 200.

## 2. Konfiguráció

Minden beállítás környezeti változó; a
`backend/services/commerce/src/main/resources/application.properties` adja az
alapértelmezést.

| Változó | Alapértelmezés | Szerveren |
| --- | --- | --- |
| `MIBOLT_DB_URL` | `jdbc:postgresql://localhost:55433/mi_bolt` | `jdbc:postgresql://<host>:5432/<db>` |
| `MIBOLT_DB_USER` | `mi_bolt` | az adatbázis-felhasználó |
| `MIBOLT_DB_PASSWORD` | `mi_bolt_local` | a jelszó; soha nem kerül fájlba a repóban |
| `MIBOLT_ADMIN_INITIAL_PASSWORD` | üres (generált) | az első admin jelszava; ha üres, a szerver generálja, és induláskor egyszer kiírja a logba |

Az üzleti paraméterek (`mibolt.checkout.*`, `mibolt.payment.*`,
`mibolt.session.lifetime`, `mibolt.idempotency.retention`) az
`application.properties`-ben vannak; a demóhoz az alapértékek valók.

## 3. Kép építése és kiadása

A repó gyökeréből, a `contracts` és `catalog` build-kontextusokkal:

```bash
docker build \
  -f backend/services/commerce/Dockerfile \
  --build-context contracts=contracts \
  --build-context catalog=data/catalog \
  -t mi-bolt-commerce:<verzió> \
  backend
```

A build a Gradle wrapperrel a konténerben fut (`./gradlew :services:commerce:bootJar`),
tehát a gépen nem kell JDK. A kész kép mérete ~590 MB. Regisztrumba:

```bash
docker tag mi-bolt-commerce:<verzió> <registry>/mi-bolt-commerce:<verzió>
docker push <registry>/mi-bolt-commerce:<verzió>
```

A `<verzió>` a `git describe --always` vagy a merge commit rövid hash-e; a
`latest` címke kerülendő, mert visszagörgetéskor nem mondja meg, mi fut.

## 4. Indítás a szerveren

```bash
docker run -d --name mi-bolt-commerce \
  --restart unless-stopped \
  -p 8080:8080 \
  -e MIBOLT_DB_URL='jdbc:postgresql://<host>:5432/<db>' \
  -e MIBOLT_DB_USER='<user>' \
  -e MIBOLT_DB_PASSWORD='<jelszó>' \
  -v /opt/mi-bolt/catalog:/app/data/catalog:ro \
  <registry>/mi-bolt-commerce:<verzió>
```

A `/opt/mi-bolt/catalog` a repó `data/catalog` könyvtárának másolata a
szerveren. Ugyanez a `deploy/compose.sh`-val is megy: a `deploy/compose.yaml`
a PostgreSQL-t is konténerben indítja (`mi-bolt-local` Compose-projekt), a
compose fájl alapértékei érvényesek, és csak a jelszót kell megadni a
`deploy/.env` fájlban (minta: `deploy/.env.example`).

Induláskor sorrendben:

1. A Liquibase lefuttatja a `db/changelog` változásait (0001–0009); ismételt
   induláskor csak az újakat.
2. A Hibernate `ddl-auto=validate` összeveti az entitásokat a sémával; eltérés
   esetén az alkalmazás nem indul el, és a log megmondja, melyik oszlop.
3. `Started MiBoltBackendApplication in … seconds` — helyi mérés szerint kb. 5 mp. Ezután futnak az indítási lépések; eddig a `GET /api/v1/actuator/health/readiness` 503-at ad, a `GET /api/v1/products` pedig üres listát, amíg a katalógus be nem töltődött.
4. A `CatalogLoader` üres `product` tábla esetén betölti a katalógust
   (`catalogue loaded: 48 products, …`), különben átugorja
   (`catalogue present, 48 products, loader skipped`).
5. Üres `admin_user` tábla esetén létrejön az `admin` felhasználó. A jelszót egyszer, WARN szinten írja ki: generált jelszónál magát a jelszót (`initial admin created: username=admin password=… (shown once; …)`), a `MIBOLT_ADMIN_INITIAL_PASSWORD` megadásakor csak a változó nevét. Ha már van admin: `admin users present, N, bootstrap skipped`. Kikeresése: `docker logs mi-bolt-commerce 2>&1 | grep 'initial admin'` (compose: `docker compose logs commerce | grep 'initial admin'`). Az első bejelentkezés után a jelszót érdemes megváltoztatni.

Ellenőrzés:

```bash
docker logs mi-bolt-commerce 2>&1 | grep -E 'Started|catalogue|initial admin|admin users|FAILED'
curl -s -o /dev/null -w '%{http_code}\n' http://<host>:8080/api/v1/actuator/health/readiness   # 503, majd az indítási lépések után 200
curl -s -o /dev/null -w '%{http_code}\n' http://<host>:8080/api/v1/products   # 200
```

## 5. Frissítés és visszagörgetés

Frissítés: új kép építése és push, majd a futó konténer cseréje:

```bash
docker pull <registry>/mi-bolt-commerce:<új-verzió>
docker stop mi-bolt-commerce && docker rm mi-bolt-commerce
docker run … <registry>/mi-bolt-commerce:<új-verzió>     # a 4. szakasz parancsa
```

A Liquibase változáskészletek csak előre mennek: egy már alkalmazott
changeset soha nem íródik át (`backend/docs/04-adatbazis.md`), a séma javítása mindig
új changeset. Visszagörgetés ezért csak olyan verzióra biztonságos, amelynek
entitásai a már alkalmazott sémával egyeznek; ha egy kiadás changesetet is
hozott, a visszagörgetés helyett előre javítunk.

## 6. Ami tudatosan nincs benne

- Nincs TLS és nincs fordított proxy a konténerben: a 8080-as port elé a
  szerveren egy proxy (nginx, Caddy, a platform sajátja) kerül.
- Nincs healthcheck a `Dockerfile`-ban és nincs nem-root felhasználó; demo
  MVP, a döntés a T10 egységben született.
- Nincs migrációs külön lépés: a Liquibase az alkalmazással együtt fut.
