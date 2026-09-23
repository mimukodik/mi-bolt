# Backend generálás — prompt a Claude Code CLI-hoz

Indíts egy Claude Code CLI munkamenetet **a `mi-bolt-backend` repó gyökerében**, Opus modellel,
és másold be az alábbi promptot. Előtte tedd be a specfájlt a repóba `api/openapi.yaml` néven.

> **Megjegyzés a spec helyéről:** azt, hogy a specfájl végül melyik repóban él és hogyan jut el a
> másikhoz, még nem döntöttük el (lásd `00-attekintes.md`). Az `api/openapi.yaml` itt munkahipotézis;
> ha másik elrendezés mellett döntesz, a promptban írd át az útvonalat.

---

## A prompt

```
Ebben a Spring Boot projektben be kell üzemelni az OpenAPI-ból történő szerverkód-generálást.
A cél: az api/openapi.yaml fájlból API-interfészek és DTO-k generálódjanak a buildbe,
implementáció nélkül. A szerződés az igazság forrása; a specfájlt NEM módosíthatod.

A projekt adottságai, ezekhez kell illeszkedni:
- Spring Boot 4.1.1
- Gradle 9.7.1, Groovy DSL (build.gradle)
- Java 21 toolchain
- spring-boot-starter-webmvc (Spring Boot 4-es elnevezés), spring-boot-starter-data-jpa
- gyökércsomag: com.example.mi_bolt_backend

FELADAT

1. Vedd fel az org.openapi.generator Gradle plugint (7.25.0 vagy frissebb) a build.gradle-be.
   Mielőtt beírod a verziót, ellenőrizd a Gradle Plugin Portalon, mi a legfrissebb elérhető,
   és azt használd.

2. Állítsd be a generálást:
   - generatorName: "spring"
   - inputSpec: az api/openapi.yaml abszolút útvonala a projektből
   - outputDir: a build könyvtár alá (pl. build/generated/openapi)
   - apiPackage: com.example.mi_bolt_backend.api
   - modelPackage: com.example.mi_bolt_backend.api.model
   - configOptions:
       interfaceOnly = true          (csak interfész és DTO, implementáció nélkül)
       useSpringBoot4 = true         (Spring Boot 4 célzás, jakarta névtér)
       documentationProvider = none
       annotationLibrary = none
       openApiNullable = false
   A többi elérhető configOption-t nézd meg a generátor dokumentációjában, és csak akkor vegyél
   fel továbbit, ha indokolt — ne halmozz kapcsolókat találomra.

3. Kösd be a buildbe:
   - a generált src/main/java könyvtár kerüljön a main forráskészlet java.srcDirs-ébe
   - a compileJava (és minden JavaCompile taszk) függjön a generáló taszktól
   - a generált kód NEM kerülhet verziókezelésbe — ellenőrizd, hogy a build/ ki van zárva

4. Futtasd a generálást és fordítsd le a projektet. Ha hiba van, javítsd, és írd le, mi volt.

ELLENŐRZÉS — ezt mindenképp végezd el és jelentsd

A szerződésben két diszkriminált unió van, és ez a generálás legkockázatosabb pontja.
Nyisd meg a generált forrásokat, és nézd meg, mi lett belőlük:

   a) DeliverySelection -> HomeDeliverySelection / PickupPointSelection
      (diszkriminátor mező: optionId, értékei home_delivery és pickup_point)
   b) OrderRequest -> CardOrderRequest / CashOnDeliveryOrderRequest
      (diszkriminátor mező: paymentMethod, értékei card és cash_on_delivery)

Mindkettőre válaszolj konkrétan:
- Létrejött-e használható Java típushierarchia (interfész vagy ősosztály + két implementáció)?
- Vannak-e Jackson annotációk (@JsonTypeInfo, @JsonSubTypes), és helyesek-e az alosztály-nevek
  és a diszkriminátor-értékek?
- Fordul-e a kód?
- Deszerializálódik-e helyesen? Írj egy-egy kis egységtesztet, ami egy JSON-ból a helyes
  altípust várja, és futtasd le.

Ellenőrizd azt is, hogy az allOf kompozíciót használó sémák (CatalogItem, Product,
ColorFacetValue) értelmes DTO-kat adtak-e, és hogy a rajtuk lévő unevaluatedProperties
megszorítás nem okozott-e hibát. Ha ez a kulcsszó akadályozza a generálást, JELEZD — ne a
specet írd át, hanem számolj be róla.

HA A DISZKRIMINÁLT UNIÓK GENERÁLÁSA HASZNÁLHATATLAN

Ne kezdj el körülötte kézzel javítgatni. Ehelyett próbáld ki alternatívaként az
openapi-processor-spring eszközt (openapiprocessor.io), ami natívan OpenAPI 3.1-re készült,
ugyanezzel a két ellenőrzéssel. Aztán írd le, melyik adott jobb eredményt, és miért — a döntést
én hozom meg, ne válassz helyettem.

AMIT NEM SZABAD

- A specfájlt módosítani. Ha a szerződésben látsz hibát, jelezd, ne javítsd.
- Generált kódot kézzel szerkeszteni vagy verziókezelésbe tenni.
- Üzleti logikát, kontrollert vagy entitást írni. Ez a feladat KIZÁRÓLAG a generálás beüzemelése.
- Az adatbázis-konténerhez hozzányúlni. Ha adatbázis kell, azt kizárólag a
  scripts/local-database-docker.sh szkripten keresztül szabad kezelni — közvetlen docker vagy
  psql parancs tilos. Ehhez a feladathoz valószínűleg nem is kell adatbázis.
- Függőséget verziószám nélkül vagy találomra felvenni.

VÉGÜL

Foglald össze röviden: mit vettél fel, milyen verzióval, hogyan fut a generálás, mi lett a két
diszkriminált unióval, és mi az, ami nem működött vagy bizonytalan maradt.
```

---

## Miért így

**Miért `openapi-generator` és miért `useSpringBoot4`.** Ez a fő eszköz, havi kiadásokkal, és
7.16.0 óta van benne kifejezetten Spring Boot 4-et célzó opció, ami a jakarta névteret is
bekapcsolja. A projekt Boot 4.1.1-en van, tehát ez az illeszkedő beállítás.

**Miért kéri a prompt a `oneOf` külön ellenőrzését.** A generátor OpenAPI 3.1 támogatása
részleges, és a `oneOf` + `discriminator` kombináció körül több nyitott hibajegy van —
`allOf`-fal keverve megerősítetten hibás Java kódot állít elő. A mi szerződésünk nem keveri a
kettőt, de a kockázat valós, ezért nem elég, ha „lefordul": látni kell, hogy a két unió
használható típust adott, és hogy a deszerializálás tényleg a helyes altípust választja.

**Miért nincs `const` a szerződésben.** A generátor a `const` kulcsszót kódgenerálási szinten
nem kezeli. A diszkriminátor mezők ezért egyelemű `enum`-ot használnak — szemantikailag
ugyanaz, viszont mindkét oldal érti. Ezt nem szabad visszaírni.

**Miért van tartalék.** Az `openapi-processor-spring` natívan OpenAPI 3.1-re (és 3.2-re) készült
és aktívan karbantartott. Kisebb és kevésbé kitaposott eszköz, ezért nem az első választás — de
ha a fő eszköz a diszkriminált uniókon elvérzik, ez a következő, amit érdemes megnézni.

**Egy bizonytalanság, amit érdemes tudni.** Arra, hogy az `openapi-generator` Gradle plugin
hibátlanul fut-e **Gradle 9.7.1** alatt, nem találtunk megerősítést sem mellette, sem ellene. A
plugin legfrissebb kiadása és ez a Gradle-verzió gyakorlatilag egyszerre jelent meg, tehát még
nincs sok tapasztalat. Ha a plugin itt akad meg, az nem a te hibád — jelezd, és onnan döntünk.

**T1 eltérés a fenti „bizonytalanság" után hozott döntésből.** A 7.25.0-s plugin a szerződés
két diszkriminált unióját (`DeliverySelection` és `OrderRequest`) a `oneOf` + `discriminator`
alatt nem tudja lefordítható Java hierarchiaként kiadni: a szülő interfész `String getX()`
metódust kap, a gyerekek viszont `XEnum getX()`-t — ezért a T1-es beüzemelés egy
`prepareOpenApiSpec` Gradle taszkkal a `build/openapi/openapi.yaml` alá másolja a specet, és
ott a négy egyelemű `enum`-os diszkriminátor mezőt (`optionId` × `home_delivery` /
`pickup_point`, `paymentMethod` × `card` / `cash_on_delivery`) egyszerű `type: string`-re
lapítja. A generátor ezt a másolatot olvassa. Amint a fenti PR a 7.26.0-ban megjelenik, a
`prepareOpenApiSpec` taszk és a négy csere törlendő, az `inputSpec` visszairányítandó
`api/openapi.yaml`-re, és a döntés teljes részletezése a
`docs/decisions/0001-openapi-generator-and-discriminator-workaround.md` fájlban olvasható.
