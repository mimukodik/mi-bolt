# Backend elvárások

Hely: `backend/services/commerce/`. A `contracts/commerce/kommunikacio.md` és a `04-adatbazis.md` ennek a dokumentumnak a
része — az ott leírt szabályok itt is kötelezőek.

---

## 1. Technológiai keret

Ez a szolgáltatás jelenlegi állapota, ehhez kell illeszkedni:

| | |
|---|---|
| Spring Boot | **4.1.1** |
| Gradle | **9.7.1**, Groovy DSL (`build.gradle`) |
| Java | **21** toolchain |
| Web réteg | `spring-boot-starter-webmvc` (Boot 4-es elnevezés, nem `-web`) |
| Perzisztencia | `spring-boot-starter-data-jpa` |
| Adatbázis | PostgreSQL 16, Dockerben — lásd `04-adatbazis.md` |
| Teszt | `spring-boot-starter-webmvc-test`, `spring-boot-starter-data-jpa-test` |

A gyökércsomag `com.example.mi_bolt_backend`.

---

## 2. Kódgenerálás

**Elvárás: a szerződésből generált interfészek, nem kézzel írt kontrollerek.**

- Az `openapi.yaml`-ből **API-interfészek és DTO-k** generálódnak, implementáció nélkül.
- A generált kód a `build/` alá kerül, **soha nem a verziókezelőbe**, és soha nem szerkeszthető
  kézzel.
- A fordítás függ a generálástól: `compileJava` csak a generálás után futhat.
- A generált interfészeket `@RestController` osztályok **implementálják**. A kontroller nem
  deklarál saját útvonalat, HTTP metódust vagy státuszkódot — mindaz a szerződésből jön.

**Miért egyelemű `enum` a `const` helyett.** A szerződésben a `oneOf`-ágak diszkriminátor mezői
egyelemű `enum`-ot használnak, nem `const`-ot. Ez tudatos: a `const` kulcsszót a Java generátor
nem tudja kódgenerálási szinten kezelni, az egyelemű `enum` viszont mindkét oldalon működik, és
szemantikailag ugyanaz. Ezt **nem szabad visszaírni** `const`-ra. Az `openapi-generator` 7.25.0
pluginnál a szülő interfész `String getOptionId()`-t, a gyerekek viszont `OptionIdEnum
getOptionId()`-t generálnak, és a kód nem fordul; a T1-es beüzemelés ezt a `prepareOpenApiSpec`
taszkkal kerüli meg a `docs/decisions/0001-openapi-generator-and-discriminator-workaround.md`
szerint.

---

## 3. Rétegzés

Három réteg, világos felelősséggel:

**Kontroller** — a generált interfész implementációja. Kizárólag átalakít: HTTP-ből domain
hívás, domain eredményből DTO. Itt nincs üzleti szabály, nincs adatbázis-hívás.

**Szolgáltatás** — az összes üzleti szabály és invariáns. Tranzakcióhatárok itt vannak. Ez a
réteg nem ismer HTTP-t: nem lát fejlécet, nem ad státuszkódot, hanem domain kivételeket dob.

**Tároló** — JPA repository-k. Lekérdezés és perzisztencia, szabály nélkül.

**Hibakezelés.** Egy központi `@RestControllerAdvice` képezi le a domain kivételeket a
`Problem` válaszokra: státusz, `code`, `params`, `fieldErrors`, `traceId`. Az egyes
kontrollerek nem építenek hibaválaszt.

---

## 4. Domain-invariánsok

Ez a dokumentum lényege. Minden pont **kötelező viselkedés**.

### 4.1 Katalógus

1. Egy listaelem **(termék, tárhely) pár**. A `total` listaelemeket számol, nem termékeket és
   nem variánsokat.
2. A szűrők **facetek között ÉS**, **faceten belül VAGY** kapcsolatban állnak.
3. A facet-darabszámok **diszjunktívak**: egy facet számolásakor a saját kiválasztását ki kell
   hagyni, a többiét nem. Enélkül a felhasználó nem látja, mit eredményezne egy másik választás.
4. A `priceRange` a **jelenlegi találathalmaz** legkisebb és legnagyobb ára.
5. A `recommended` rendezés a **kurált `rank`** szerint megy, azonos érték esetén a termék
   azonosítója bont, egy terméken belül pedig **növekvő tárhely** a sorrend. Ha `q` is jelen
   van, a `recommended` **relevanciát** jelent.
6. A `featured=true` legfeljebb **négy** listaelemet ad vissza, kurált sorrendben.
7. Tartományon kívüli lap: **üres `items`**, változatlan `total` és `totalPages`, és a `page`
   mező **a kért értéket** tükrözi. Nem clamp-elünk, és nem adunk 404-et.
8. **Ismeretlen query paraméter → 400.** A hallgatólagos elnyelés tilos.
9. `minPrice` nem lehet nagyobb `maxPrice`-nál; ha az, az 400.
10. A listaelem `colors` tömbje ugyanannak a terméknek és tárhelynek a **többi színét**
    sorolja, mindegyiknél a saját árával, elérhetőségével és variáns-azonosítójával — ebből
    működik a kártyán belüli színváltás.
11. A `variantSlug` **egy terméken belül egyedi**, és útvonalszegmensként használható.
12. Az `image.src` a szerver által előállított, **használatra kész URL** — gyökér-relatív vagy
    abszolút. A kliens változtatás nélkül használja, és soha nem épít képútvonalat azonosítóból.
    Részletek a 6.2 szakaszban.

### 4.2 Kosár

13. Egy variáns **pontosan egy kosársor**. Ugyanannak a variánsnak az ismételt hozzáadása
    összevonódik a meglévő sorral; új sor nem keletkezik.
14. A mennyiség mindig **abszolút**, soha nem különbség.
15. Az összevont mennyiség nem lépheti túl a sor maximumát. Ha túllépné, a válasz **hiba**
    (`QUANTITY_LIMIT`), nem csendes csonkolás.
16. A `maxQuantity` a készlet és a globális tételkorlát közül a kisebb. Az `availability` és a
    `maxQuantity` **soha nem mondhat ellent**: nulla maximum mellett nem lehet `in_stock`.
17. Ha a készlet a kosárban lévő mennyiség alá csökken, a szerver **lecsökkenti a sort** és
    `QUANTITY_REDUCED` értesítést ad. Ellentmondó állapotot nem hagyhat maga után.
18. `lineCount` a sorok száma, `totalQuantity` a mennyiségek összege. A fejléc jelvényén ez
    utóbbi jelenik meg.
19. A kosár **30 napig** él, és **minden sikeres művelet** előretolja az `expiresAt`-ot. A
    munkamenet-süti `Max-Age`-e ezzel együtt mozog.
20. A sor törlése **idempotens**: a katalógusban nem létező variánsra 404, a katalógusban létező
    de kosárban nem lévő variánsra **200** a jelenlegi kosárral.
21. A `DELETE /cart/items` **egy kéréssel** üríti a kosarat, és a verziót **egyszer** növeli.
22. A `GET /cart` létrehoz egy üres kosarat, ha a munkamenetnek még nincs.

### 4.3 Checkout

23. A piszkozat **tartós**: a kosárral együtt él, oldalfrissítést és fülváltást túlél, és csak a
    rendelés véglegesítésekor törlődik.
24. A `PATCH /checkout` **összefésül**: csak a küldött szakaszok íródnak felül, a többi
    érintetlen marad.
25. Részleges állapot megengedett a rendelésig. A `complete` mező akkor igaz, ha minden kötelező
    szakasz megvan **és** a kosár nem üres.
26. A **számlázási adat minden rendeléshez kötelező**, átvételi pontos átvételnél is.
27. A szállítási cím **csak házhoz szállításnál** létezik; átvételi pontnál a mező nem része a
    kérésnek. Ezt a `oneOf` szerkezet kényszeríti ki, de a szolgáltatásnak is ellenőriznie kell.
28. Az összegzés **minden olvasáskor újraszámolódik**. Nincs külön árajánlat-lépés és nincs
    ötperces árzár.
29. A `GET /checkout/options` **a kosár értékétől függ**: a szállítási díj tükrözi az ingyenes
    szállítás küszöbét, és egy adott összeg fölött az utánvét `available: false` értékkel és
    `CART_VALUE_TOO_HIGH` indokkal érkezik. A konkrét küszöbértékeket a megvalósításkor kell
    rögzíteni, de **nem lehet mindkét opció mindig elérhető**.

### 4.4 Fizetés

30. Fizetési szándék **csak kártyás fizetéshez** és **csak teljes piszkozathoz** hozható létre.
31. A backend **soha** nem kér és nem fogad kártyaszámot, ellenőrző kódot vagy lejárati dátumot.
32. Az `declined` és a `pending` **érvényes kimenet**, nem szerverhiba: a válasz **201**, az
    állapot a törzsben van.
33. Függőben lévő szándék **garantáltan terminális állapotba jut** az `expiresAt` előtt.
34. A `redirectUrl` a demó fizetési alkalmazásra mutat, amely **saját origin-en** fut (a demó
    stackben a 4210-es porton), ahogy egy valódi fizetési kapu; ezért a `redirectUrl` és a
    `returnUrl` **abszolút URL**, a `mibolt.payment.redirect-url-prefix` /
    `return-url-prefix` beállításból (környezeti változóval felülírható, MIM-251). A
    munkamenet-süti `localhost` hoston portfüggetlen, így a fizetési alkalmazás le tudja
    kérdezni a szándékot; más hoston a sütit a kapu origin-jére is ki kell adni.
35. A `POST /payment-intents/{id}/outcome` **csak a szándékot birtokló munkamenetnek** engedett,
    és **egyszer lövő**: terminális állapotú szándékra **409 `PAYMENT_ALREADY_RESOLVED`**. Ez
    véd attól, hogy egy visszagomb felülírjon egy elkönyvelt fizetést.
36. Ez a művelet **kizárólag azért létezik, mert nincs valódi fizetési szolgáltató**. Éles
    integrációnál törlendő: ott a szolgáltató értesíti a backendet, nem a böngésző.

### 4.5 Rendelés

37. **Az idempotencia-eredmény visszajátszása megelőz minden más ellenőrzést** — a kosár
    állapotának, a lejáratnak és az `If-Match`-nek a vizsgálatát is. Egy bizonytalan válasz
    utáni újraküldés az eredeti visszaigazolást adja, nem hibát.
38. Kártyás fizetésnél a `paymentIntentId` kötelező — hiánya sémasértés, tehát **400**. A
    hivatkozott szándék **mind a négy állapotára** határozott válasz jár: `succeeded` megy
    tovább, `requires_action` → **422 `PAYMENT_REQUIRED`** (a vásárló nem ment végig a fizetési
    oldalon), `pending` → **422 `PAYMENT_PENDING`** (még nem dőlt el), `declined` → **422
    `PAYMENT_DECLINED`** (új kísérlet kell, új idempotencia-kulccsal).
39. Utánvétnél a `paymentIntentId` mező **nem létezik** a kérésben.
40. Az `acceptedTerms: false` **422**-t ad `fieldErrors: [{ path: "/acceptedTerms" }]`
    tartalommal — nem sémahibát, mert a felületnek meg kell tudnia jelölni a checkboxot.
41. A `termsVersion` értékét a szerver **ellenőrzi** az aktuálisan érvényes verzió ellen.
42. A rendelés **egyetlen tranzakcióban**: készlet levonása, nyugta mentése, idempotencia-eredmény
    rögzítése, kosár lezárása, piszkozat törlése. Ezek együtt sikerülnek vagy együtt buknak.
43. A rendelés után a munkamenet **azonnal friss, üres kosarat kap**.
44. Ár, szállítási mód és kontaktadat **soha nem a rendelési kérésből** származik, hanem a
    piszkozatból.
45. A `GET /orders/{orderId}` **csak annak a munkamenetnek adja ki** a rendelést, amelyik
    létrehozta. Másnak **404**, nem 403 — a létezést sem áruljuk el.
46. A rendelésszám alakja `DEMO-` és hat számjegy. Ez **szándékos és látható**: ez közli a
    vásárlóval, hogy nem történt valódi vásárlás.

### 4.6 Ármódosulás

47. Ha a katalógusár megváltozik, a szerver **atomikusan** frissíti a kosár árait, **növeli a
    verziót**, és a fizetési vagy rendelési kísérletre **409 `PRICE_CHANGED`** választ ad. Az új
    összeg néma elfogadása tilos.

---

## 5. Adatmodell elvárások

Nem teljes séma, hanem amit teljesítenie kell.

**Katalógus.** Termék, variáns, kép, specifikációs csoport és sor. A termék `slug`-ja globálisan
egyedi; a variáns `slug`-ja a terméken belül egyedi, az azonosítója globálisan. A variánshoz
tartozik készletmennyiség, amiből a `maxQuantity` számolódik. A terméken van kurált `rank`,
megjelenési dátum és népszerűségi mutató a nyolcféle rendezéshez.

**Munkamenet.** A süti értékéhez tartozó rekord, lejárattal. Egy munkamenethez **egy aktív
kosár** tartozik.

**Kosár és piszkozat.** A kosár tételekkel, a piszkozat a négy szakasszal. A **verziószámláló
közös** — egyetlen mező, amit mindkettő mutációja növel.

**Fizetési szándék.** Állapot, összeg, létrehozás és lejárat, a munkamenethez kötve.

**Rendelés.** Sorok, összegek, fizetési és szállítási mód, szállítási és számlázási cím,
kontakt e-mail, rendelésszám. A rendelésszám egyedi. A rendelés a létrehozó munkamenethez van
kötve.

**Idempotencia.** Kulcs + metódus + útvonal + munkamenet, a normalizált kérés lenyomatával és a
tárolt válasszal, 24 órás megőrzéssel.

**Tranzakciós elvárás.** A rendelés véglegesítése és az ármódosulás kezelése atomi. Egyidejű
kosárműveletek nem hozhatnak létre két sort ugyanarra a variánsra, és nem vihetik a készletet
nulla alá.

---

## 6. Kezdőadat és képek

### 6.1 Katalógus — külön feladat, nem ennek a dokumentumnak a része

A demó katalógusa legyen **a lehető legnagyobb**. A kezdőadat forrása a **yettel.hu
telefon-kínálata**: minden termék és minden variáció.

**A gyűjtést külön feladatként kell elvégezni** — ez a dokumentum csak rögzíti, hogy szükség van
rá, és megmondja, milyen adat kell hozzá. A végrehajtáskor **letöltő szkript** készül hozzá, ami
az adatot összeszedi és a betöltéshez használható alakra hozza; ez a szkript nem része ennek a
specifikációnak.

Termékenként: márka, terméknév, rövid kiemelések (`highlights`), leírás, specifikációs csoportok
és sorok, 5G képesség, megjelenési dátum, kurált sorrend (`rank`), népszerűségi mutató
(`popularityScore`), és hogy kiemelt-e.

Variánsonként (szín × tárhely): színkód, színnév, színminta hexakód, tárhely, ár egész forintban,
készletmennyiség.

**Két dolgot normalizálni kell a gyűjtés során.** A forrásoldal a tárhelyeket külön termékként
kezeli, és a tárhelyet a névbe írja — nálunk viszont egy termék alatt van a teljes variánsmátrix,
tehát a szín-tárhely kombinációkat egy termék alá kell vonni. A forrásoldalon az árak részben
előfizetéshez kötöttek; nálunk **egyösszegű készülékár** kell, havi részlet nélkül.

**Elvárás az adat szórására.** Legyen benne több márka, mindhárom tárhelyméret, több szín, néhány
nem-5G készülék és néhány elfogyott variáns. Enélkül a facetek és a szűrők üresen állnak a
bemutatón, és pont az nem látszik, amire a katalógus épült.

### 6.2 Képek

A képeket **a backend tárolja és szolgálja ki**. Ez tudatosan ideiglenes: most a működő backend a
cél, a tartalomszolgáltató hálózatra költözés egy későbbi refactor-kör.

**A kiszolgáló művelet: `GET /media/{imageId}`.** Munkamenet nélkül elérhető — a kép
semmilyen munkamenethez kötött adatot nem hordoz —, de a demókapu sütije (`mibolt_demo_access`)
kell hozzá, mint minden bolti híváshoz (ADR 0022).

Elvárások a művelettől:

- Az **azonosító tartalomból származik** (a fájl tartalmának lenyomatából). Ebből két dolog
  következik: egy megváltozott kép **új azonosítót** kap, és egy régi URL **soha nem szolgál ki
  új tartalmat**. Enélkül egy képcsere után a böngészők és a köztes gyorsítótárak hetekig a régit
  mutatnák.
- Emiatt a válasz **korlátlanul gyorsítótárazható**: `Cache-Control: public, max-age=31536000,
  immutable`.
- Ismeretlen azonosító **404**.
- A támogatott formátumok: `image/webp`, `image/jpeg`, `image/png`. A válasz `Content-Type`-ja a
  tárolt tartalomnak felel meg.

**Az `Image.src` a szerver által előállított, használatra kész URL.** A kliens változtatás nélkül
teszi a jelölőbe, és **soha nem épít képútvonalat** azonosítóból. Lehet gyökér-relatív
(`/api/v1/media/<id>`) vagy abszolút (egy külső szolgáltató címe) — ezt a szerver dönti el.

**Ez az, ami a későbbi költözést olcsóvá teszi:** a szerződés nem változik, csak a tárolt `src`
értékek. Ezért nem szabad a kliensnek sosem összeraknia a képútvonalat.

Fontos korrekció a korábbi állapothoz képest: a spec egy ideig azt írta, hogy az `src` **relatív
és nem kezdődik perjellel**. Ez akkor volt helyes, amikor a képek a frontend statikus mappájából
jöttek. **Most hibás lenne**: egy relatív út a *frontend* base href-jéhez képest oldódna fel,
tehát a frontend statikus kiszolgálójához menne, nem a backendhez.

További elvárások:

- A kép a **(termék, szín)** párhoz tartozik, nem a variánshoz: ugyanaz a kép szolgálja a termék
  256 és 512 GB-os változatát.
- A képfájlok **nem a verziókezelőbe** valók.
- A képtárolónak a katalógussal **együtt újratölthetőnek** kell lennie. Egy adatbázis-`reset`
  után a képek és a rájuk mutató rekordok nem csúszhatnak szét: vagy mindkettő megmarad, vagy
  mindkettő újratöltődik.

---

## 7. Tesztelési elvárások

A tesztek nem a lefedettségi számról szólnak, hanem arról, hogy a 4. szakasz invariánsai
**bizonyítottan** teljesülnek. Négy szint kell: smoke, unit, API, és a szerződés gépi
ellenőrzése.

### 7.0 Kemény szabály: a tesztek nem használhatnak Docker-adatbázist

**Egyetlen teszt sem indíthatja el, nem érheti el és nem függhet a Docker PostgreSQL
konténertől.** A tesztek vagy **mockolva** futnak, vagy **memóriában futó adatbázissal**.

Ez a szabály a fejlesztői gépre és minden automatizált futtatásra egyaránt vonatkozik. Aki
Docker-adatbázisra épülő tesztet ír, az egy olyan függőséget hoz be, ami minden más gépen és
minden automatizált futtatásban kiszámíthatatlanul viselkedik.

**Egy kivétel van, és az nem teszt.** A CI `postgres-smoke` jobja
(`.github/workflows/backend.yml`, `docs/decisions/0013`) valódi PostgreSQL 16
service-konténer ellen indítja el a lefordított jar-t üres adatbázison, és
lefuttatja a `backend/services/commerce/scripts/smoke.sh` végponti smoke-kört. Ez nem Gradle-teszt: a
`test` és `integrationTest` feladatok továbbra sem érhetik el, és a job csak
azt bizonyítja, hogy az alkalmazás a valódi adatbázison elindul és a fő
útvonal végigmegy. A kivétel oka: 2026-09-20-án négy összeolvasztott egységen
át nem indult el az alkalmazás PostgreSQL-en (`idempotency_record.response_body`,
`clob` kontra `@Lob`), miközben a H2-n futó tesztek és a CI zöldek maradtak.

**Egy feszültséget ki kell mondani.** A memóriában futó adatbázis (PostgreSQL-kompatibilitási
módban is) **nem PostgreSQL**. A Liquibase changelog PostgreSQL-specifikus elemei, a
megszorítások pontos viselkedése és a hibaüzenetek eltérhetnek. Ennek két következménye van,
és mindkettőt vállalni kell:

- A **séma-megszorításokat hordozhatóan** kell megírni, amennyire lehet — így a memóriában futó
  adatbázis is ki tudja kényszeríteni őket, és a teszt tényleg azt méri, amit mérni akarunk.
- Ahol ez nem megy, ott a teszt **mockolt tárolóval** dolgozik, és a megszorítás tényleges
  működését az éles sémán külön, kézzel kell igazolni. Ezt a dokumentumban jelölni kell, nem
  elhallgatni.

### 7.1 Smoke tesztek — kötelezőek

A smoke tesztek azt bizonyítják, hogy a rendszer **él és a fő útvonal végigmegy**. Ha ezek
elbuknak, semmi mással nem érdemes foglalkozni.

**F1 — Az alkalmazás elindul és a séma naprakész**
*Adott* üres adatbázis. *Amikor* az alkalmazás elindul. *Akkor* a migráció lefut, a séma
érvényes, az alkalmazáskontextus hiba nélkül betöltődik.

**F2 — A katalógus válaszol**
*Adott* betöltött kezdőadat és demó-belépés (`POST /demo/session` a demó jelszóval). *Amikor*
`GET /products`. *Akkor* 200; az `items` nem üres;
a `total` pozitív; a `facets` minden ága kitöltött; a `totalPages` és a `total` konzisztens a
`pageSize`-zal.

**F3 — Teljes vásárlás utánvéttel**
*Adott* betöltött katalógus és friss munkamenet. *Amikor* a következő sorozat lefut:
`GET /cart` → `POST /cart/items` → `GET /checkout/options` → `PATCH /checkout` (kapcsolat,
számlázás, szállítás, fizetés = utánvét) → `GET /checkout` → `POST /orders`.
*Akkor* a rendelés **201**-et ad `Location` fejléccel; a nyugta végösszege megegyezik a checkout
összegzésével; a készlet a megrendelt mennyiséggel csökkent; és a rákövetkező `GET /cart`
**friss, üres** kosarat ad, nem a megrendeltet.

**F4 — Teljes vásárlás kártyával, átirányítással**
*Adott* ugyanaz, de a fizetési mód kártya. *Amikor* `POST /payment-intents` → a válasz
`redirectUrl`-je → `POST /payment-intents/{id}/outcome` a `succeeded` kimenettel →
`GET /payment-intents/{id}` → `POST /orders`. *Akkor* a rendelés 201-et ad, és a nyugta fizetési
módja kártya.

**F5 — Egy munkamenet, egy kosár**
*Adott* egyetlen munkamenet-süti. *Amikor* két egymást követő kérés **ugyanazzal a sütivel** tesz
kosárba. *Akkor* mindkettő **ugyanazt a kosarat** látja, és a második válasz tartalmazza az első
hatását. Ez az a teszt, ami a „két fül, két kosár" hibát kizárja.

**F6 — A képkiszolgálás működik**
*Adott* betöltött katalógus. *Amikor* `GET /media/{imageId}` egy katalógusból kapott
azonosítóval. *Akkor* 200, kép `Content-Type`, és hosszú élettartamú `Cache-Control`.

**F7 — A verziózás véd**
*Adott* egy kosár ismert verzióval. *Amikor* két mutáció megy **ugyanazzal az `If-Match`**
értékkel. *Akkor* az első sikerül, a második **412 `CART_VERSION_CONFLICT`**.

### 7.2 Unit tesztek — lefedettség legalább 90%

- A 4. szakasz **minden számozott invariánsa** legyen tesztelve, a tesztben a sorszámára
  hivatkozva. Ha egy invariánsra nincs teszt, az hiányzó munka, nem stílus kérdése.
- **Vonal-lefedettség legalább 90%**, a **kézzel írt** főkódon mérve. A **generált forrásokat ki
  kell zárni** a mérésből: a generált DTO-k egyébként vagy felhígítanák, vagy indokolatlanul
  lerontanák a számot.
- A küszöböt a **build kényszerítse ki**, ne csak jelentse. Egy lefedettségi riport, ami senkit
  nem állít meg, nem véd semmitől.
- Külön kötelező eset: **egyidejűség** (két párhuzamos hozzáadás ugyanarra a variánsra egy sort
  eredményez), **idempotencia** (ugyanaz a kulcs és törzs kétszer ugyanazt a rendelést adja, és
  **egyszer** vonja le a készletet; más törzzsel 409), és **munkamenet-elszigetelés** (egy
  munkamenet nem látja és nem módosítja a másik kosarát, piszkozatát vagy rendelését).

### 7.3 API tesztek

Az API tesztek a HTTP réteget mérik: útvonal, státuszkód, fejléc, törzs.

- **Minden művelet** sikeres útja.
- **Minden dokumentált hibakód** a hozzá tartozó státusszal. A `contracts/commerce/kommunikacio.md` 5.3-as
  táblázata a lista: ha egy kód nincs tesztelve, nem tudjuk, hogy egyáltalán előáll-e.
- **Fejlécek**: az `ETag` jelenléte és értéke a mutációk után; az `If-Match` hiányának és
  eltérésének kezelése; a `Location` a 201-es válaszokon; a `Set-Cookie` az első munkamenetes
  kérésnél a helyes attribútumokkal.
- **Munkamenet-hatókör**: a képkiszolgálás süti nélkül is válaszol; minden más bolt-művelet a
  demó-belépés sütijét (`mibolt_demo_access`, lásd `docs/decisions/0022`) kéri, a kosár, checkout,
  fizetés és rendelés pedig ezen felül a munkamenet-sütit is. Az admin API-t a saját sütije védi.
- A `fieldErrors` `path` értékei valóban a kérés törzsébe mutatnak.

### 7.4 Szerződés-ellenőrzés

Minden válasznak meg kell felelnie a `contracts/commerce/openapi.yaml`-nek, és ezt **géppel** kell
ellenőrizni, nem szemre. Ez fogja el azt az esetet, amikor a kód és a szerződés észrevétlenül
elválik egymástól — ami contract-first projektben a legdrágább hiba.

---

## 8. A fejlesztés alatti döntések dokumentálása

**Minden fejlesztés közben hozott döntést dokumentálni kell.** Ez nem adminisztratív teher,
hanem a projekt működésének feltétele: a kódot nagyrészt ügynökök írják, több menetben, és egy
későbbi menet nem tudja kitalálni, miért lett valami úgy, ahogy. Dokumentálatlan döntés
előbb-utóbb visszafejtett döntés lesz — vagy csendben felülírt.

**Hol.** A `docs/decisions/` mappában, egy döntés egy fájl, sorszámozva és beszédes névvel:
`0001-liquibase-valasztas.md`, `0002-session-suti-elettartam.md`.

**Mit tartalmaz** egy bejegyzés:

- **Helyzet** — mi tette szükségessé a döntést. Elég pár mondat.
- **Lehetőségek** — mi jöhetett szóba, és mi szólt mellettük.
- **Döntés** — mit választottunk.
- **Következmények** — mit nyerünk, mit veszítünk, és mi lesz nehezebb ettől.
- **Dátum és állapot** (érvényes / felülírva, és ha felülírva, melyik bejegyzés váltotta).

**Mikor.** A döntéssel **egy menetben**, nem utólag. Egy hét múlva rekonstruált indoklás már
nem az indoklás, hanem az igazolás.

**Mi számít döntésnek.** Minden, amire egy későbbi olvasó azt kérdezné: „ezt miért így?"
Könyvtár- vagy eszközválasztás; a szerződés értelmezése ott, ahol több olvasat lehetséges; egy
invariáns megvalósításának módja, ha volt más út is; teljesítményt vagy egyszerűséget célzó
kompromisszum; és **minden eltérés ezektől a dokumentumoktól**.

**Az eltérés külön hangsúlyos.** Ha a megvalósítás során kiderül, hogy egy itt leírt elvárás
rossz, hiányos vagy megvalósíthatatlan, azt **nem csendben kell megkerülni**. Két dolgot kell
tenni: bejegyzést írni róla a `docs/decisions/` alá, és **javítani az érintett dokumentumot** —
különben ez a csomag elavul, és a következő menet már hazugságból dolgozik.

**A szerződés külön eset.** Ha a hiba a `contracts/commerce/openapi.yaml`-ben van, a specet **nem** az
implementáció írja át magától. Jelezni kell, mert a szerződés módosítása a frontendet is
érinti — és a specnek van saját kiadási rendje, git taggel.

---

## 9. Amit nem szabad

- Kézzel írt kontroller-útvonal vagy státuszkód a generált interfész megkerülésével.
- Generált kód a verziókezelőben vagy kézi szerkesztése.
- Üzleti szabály a kontroller rétegben.
- Felhasználónak szánt magyar szöveg hibaválaszban.
- Ár, készlet vagy összeg elfogadása a kérés törzséből — egyetlen kivétel a bejelentkezett adminisztrátor katalógus-karbantartó felülete (`POST /admin/products`, `PUT /admin/products/{productId}`), lásd `docs/decisions/0020-admin-catalogue-write-api.md`.
- A specben nem szereplő végpont, mező vagy státuszkód bevezetése.
- Közvetlen beavatkozás az adatbázis-konténerbe — lásd `04-adatbazis.md`.
- **Docker-adatbázisra épülő teszt.** A tesztek mockolva vagy memóriában futó adatbázissal
  futnak, kivétel nélkül.
- A lefedettségi küszöb megkerülése a generált kód beszámításával, vagy a küszöb kikapcsolása.
- Dokumentálatlan döntés, és az ezektől a dokumentumoktól való csendes eltérés.
