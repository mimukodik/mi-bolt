# Frontend elvárások

Angular alkalmazás, saját repó. A `01-kommunikacio.md` ennek a dokumentumnak a része.

A frontend **már létezik**, a szerződés korábbi változata alapján. Ez a dokumentum ezért két
dolgot ír le: mik az elvárások a kész állapottal szemben, és **mi változott** a korábbi
spechez képest.

---

## 1. Kliensgenerálás

**Eszköz: `ng-openapi-gen`.** Megvizsgáltuk az alternatívákat, és ez marad a választás:

- A szerződés `oneOf`-ágai egyelemű `enum`-mal jelölik a diszkriminátort, amiből az
  `ng-openapi-gen` **literál típust** készít — így a `DeliverySelection` és az `OrderRequest`
  valódi diszkriminált unió lesz TypeScriptben, külön munka nélkül.
- Az `ETag` olvasásához minden művelethez generálódik egy **`$Response` utótagú változat**, ami
  teljes `HttpResponse`-t ad vissza. Ezen keresztül férünk hozzá a fejlécekhez.
- Valódi Angular `HttpClient` service-eket ad, `Observable`-ökkel.

Amit tudni kell a korlátairól:

- Az `unevaluatedProperties: false` megszorítást **figyelmen kívül hagyja**. Ez a kliensen nem
  hiányzik, csak azt jelenti, hogy a generált típus nem tiltja a nem várt mezőket.
- Az `allOf` kompozícióból **metszet típust** készít (`Base & { ... }`), nem interfész-öröklést.
  Ez működik, csak más, mint amit egy `extends` adna.
- A `securitySchemes` süti-sémából **nem generál semmit**. Erre nincs is szükség: azonos
  origin-en a böngésző magától küldi a sütit, tehát nem kell interceptor és nem kell
  `withCredentials`.

Utolsó kiadása 2025-11-24, és 50 nyitott hibajegye van. A jelenleg ismert nyitott hibája
nullable `$ref`-tömböket érint — ilyen a mi szerződésünkben nincs. Ha a projekt tovább lassul,
az `@openapitools/openapi-generator-cli` `typescript-angular` generátora a tartalék, de annak
gyengébb a `oneOf` kezelése.

**Elvárás:** a generált kód a build könyvtárba kerül, nem a verziókezelőbe, és kézzel nem
szerkeszthető. A generálás a build része, nem egyszeri kézi lépés.

---

## 2. Állapotkezelés

**A szerver az igazság.** A kosár, a checkout piszkozat és az összegek szerveroldali állapotok.

- **Tilos** a kosarat vagy a piszkozatot `localStorage`-ban, `sessionStorage`-ban vagy bármilyen
  böngészőtárolóban tartani.
- Minden kosárművelet a **teljes kosarat** adja vissza. A felület ebből az egy válaszból
  frissíti a fejléc jelvényét, a kosároldalt és az összegzőt — nem számol utána semmit.
- A végösszeget, a szállítási díjat és a részösszeget **mindig a szerver adja**. A felület nem
  számol árat, és nem küld árat.
- A munkamenet-azonosítót a frontend **nem generálja, nem tárolja és nem küldi**.

**A verzió kezelése.** Minden érintett válasz `ETag` fejlécet ad. Ezt a `$Response` változatból
kell kiolvasni, memóriában tartani, és a következő mutáció `If-Match` fejlécébe tenni. A verzió
a kosár- és a checkout-állapotra **közös** — egyetlen értéket kell nyilvántartani.

**412 esetén** a helyes viselkedés: a kosár vagy a checkout újraolvasása, a felhasználó
tájékoztatása arról, hogy közben változott valami, majd — ha még értelmes — a művelet
megismétlése. **Automatikus, néma újrapróbálkozás tilos.**

---

## 3. Útvonalak

| Útvonal | Tartalom |
|---|---|
| `/` | Főoldal. A kiemelt termékek a `GET /products?featured=true` hívásból jönnek. |
| `/termekek` | Katalóguslista. **Minden szűrő, a rendezés és a lapszám query paraméterben**, hogy az állapot megosztható linkként. |
| `/termek/{productSlug}/{variantSlug}` | Termékadatlap. A komponens a `productSlug`-gal kéri le a terméket, és a `variantSlug`-ot a variánsmátrixban oldja fel. Ismeretlen variáns-slug esetén kliensoldali 404. |
| `/kosar` | Kosároldal. |
| `/penztar` | Checkout. |
| demó fizetési oldal | Az átirányítás célja. Egyértelműen demóként jelölt, generikus nevű; valós fizetési szolgáltató nevét vagy arculatát nem viseli. Három kimenet: sikeres, elutasított, függőben. |
| `/rendeles/{orderId}` | Visszaigazolás. |

A katalóguslista állapotának **teljes egészében** az URL-ből visszaállíthatónak kell lennie.

---

## 4. Megjelenítési elvárások

**Képek.** Az `Image.src` **kész URL**: változtatás nélkül kerül az `<img src>`-be. A felület
soha nem rak össze képútvonalat azonosítóból és nem tesz elé előtagot — ettől lesz a későbbi
tartalomszolgáltató-váltás puszta adatcsere, frontend-módosítás nélkül.

**Terméklista.** Egy kártya egy (termék, tárhely) párt jelent, **konkrét árral** — sehol nincs
„…-tól" megjelölés. A kártyán színpöttyök vannak: rájuk kattintva az ár, a kép és a link célja
is vált, a `colors` tömb alapján. A kártya a `highlights` első kettőjét mutatja.

**Szűrők.** Minden szűrőérték mellett ott a darabszám. A nulla találatot adó értéket le kell
tiltani, nem felkínálni. Az ársáv csúszkájának határai a `facets.priceRange`-ből jönnek.

**Lapozó.** A `totalPages` mezőből dolgozik. Üres találati lapnál a felület azonnal tudja, hova
navigáljon — **nincs szükség második lekérésre**.

**Termékadatlap.** A `highlights` mind megjelenik, alatta a leírás és a specifikációs csoportok.
A lap alján a kapcsolódó termékek, külön hívásból — amíg megérkeznek, helyőrző látszik.

**Kosár.** A `notices` tömb elemei **felső sávként** jelennek meg („Egy tétel ára megváltozott",
„A készlet csökkent, módosítottuk a mennyiséget"). Némán elnyelni tilos. A mennyiségválasztó a
soronkénti `maxQuantity`-t veszi figyelembe, és nem enged fölé — a limithibának a felület
megelőzésével nem is szabad előfordulnia normál használatban.

**Checkout.** Négy szakasz: kapcsolat, számlázás, szállítás, fizetés. A számlázási adat
**minden** szállítási módnál kötelező. A „számlázási cím megegyezik a szállítási címmel"
jelölőnégyzet **felületi kényelem** — a szerver felé mindig a teljes cím megy, nem hivatkozás.
Az el nem érhető szállítási vagy fizetési mód letiltva jelenik meg, az `unavailableReason`
alapján megindokolva.

**Demó-jelzés.** Állandóan látható, ki nem kattintható sáv közli, hogy ez bemutató bolt és nem
jön létre valódi rendelés. Ez **nem** jelölőnégyzet, és nem tüntethető el.

---

## 5. A demó fizetési alkalmazás

**Külön, kicsi Angular alkalmazás**, a webshop monorepójában. Nem a webshop SPA egyik route-ja:
önálló app, hogy a fizetés úgy viselkedjen, mint az éles folyamat.

**Miért így.** Éles fizetésnél a böngésző elhagyja a boltot, és visszatéréskor a SPA **nulláról
indul újra**. Ha ezt a demó nem teszi próbára, egy véletlenül kliensoldalon ragadt állapot végig
észrevétlen marad — és majd a valódi fizetési integrációnál derül ki. Külön alkalmazással ez
minden bemutatón lefut.

**Elvárások:**

- **Minimális dizájn.** Nem cél a szépség, hanem hogy a folyamat látványosan működjön.
- **Egyértelműen demóként jelölt, generikus nevű.** Valós fizetési szolgáltató nevét, logóját
  vagy arculatát nem viselheti.
- A **most készülő backendet használja** — ugyanazt az API-t, nem külön mockot.
- Megjeleníti a fizetendő **összeget**, amit a fizetési szándékból olvas ki.
- **Három gomb:** sikeres, elutasított, függőben. Más kimenet nincs.
- **Kártyaadat-mező nincs**, még díszletként sem. Egy kitölthetőnek látszó kártyamező akkor is
  félrevezető, ha nem csinál semmit.
- A választást a **`POST /payment-intents/{id}/outcome`** hívással közli a backenddel, majd
  visszanavigál a `returnUrl`-re, teljes oldalbetöltéssel.
- A művelet **egyszer lövő**: már lezárt szándékra 409 `PAYMENT_ALREADY_RESOLVED` jön. Elveszett
  válasz után nem újraküldeni kell, hanem a szándékot lekérdezni.

**Két technikai megkötés:**

- A fizetési alkalmazás **saját origin-en** fut (a demó stackben `http://localhost:4210`),
  ahogy egy valódi fizetési kapu; a backend ezért abszolút `redirectUrl`-t és `returnUrl`-t ad
  (MIM-251, backend 34. szabály). A munkamenet-süti `localhost` hoston portfüggetlen, így a
  fizetési alkalmazás API-hívásaival is megy; más hoston a sütit a kapu origin-jére is ki kell
  adni, különben nem tudja lekérdezni a fizetési szándékot.
- A visszatérés **GET** navigáció legyen. A `SameSite=Lax` süti felső szintű GET-tel megy, POST-tal
  nem — egy POST-os visszatérés némán munkamenet nélkül hagyná a boltot.

---

## 6. Hibakezelés

- A felület **a `code` mezőn kapcsol**, soha nem a `title` vagy a `detail` szövegén. Azok angol
  fejlesztői szövegek, és nem jeleníthetők meg.
- A `params` értékeit be kell helyettesíteni az üzenetbe („Ebből legfeljebb 5 db rendelhető").
- A `fieldErrors` `path` mezője JSON pointer a kérés törzsébe — ebből kell megtalálni és
  megjelölni a megfelelő űrlapmezőt. A `/acceptedTerms` például a jelölőnégyzetet.
- **Minden** kódhoz tartoznia kell magyar szövegnek. Ismeretlen kódra generikus üzenet megy ki,
  és ezt naplózni kell, mert a két oldal szétcsúszását jelzi.

---

## 7. Mi változott a korábbi specifikációhoz képest

Ez a refactor terjedelme.

### 7.1 Megszűnt végpontok

| Régi | Mi lép a helyére |
|---|---|
| `GET /config` | Semmi. A márkanév és a pénznem build-time konstans; a lejáratok az `expiresAt` mezőkből; a mennyiségi limit a soronkénti `maxQuantity`-ből; a lapméretek a `pageSize` enumból; a kiemelt termékek a `featured=true` szűrőből. |
| `POST /carts` | Semmi. A `GET /cart` létrehozza a kosarat, ha még nincs. |
| `POST /checkout/{cartId}/quote` | A `GET /checkout` mindig friss összegzést ad. Nincs árajánlat-lépés, nincs `quoteId`, nincs ötperces visszaszámláló. |

### 7.2 Átnevezett útvonalak

A **`cartId` minden útvonalból és törzsből eltűnt** — a munkamenet azonosít.

| Régi | Új |
|---|---|
| `GET /carts/{cartId}` | `GET /cart` |
| `POST /carts/{cartId}/items` | `POST /cart/items` |
| `PATCH /carts/{cartId}/items/{itemId}` | `PATCH /cart/items/{variantId}` |
| `DELETE /carts/{cartId}/items/{itemId}` | `DELETE /cart/items/{variantId}` |
| `GET /checkout/{cartId}` | `GET /checkout` |
| `PUT /checkout/{cartId}` | **`PATCH /checkout`** — a metódus is változott |

### 7.3 Új végpontok

- `GET /products/{slug}/related` — kapcsolódó termékek a termékadatlapra.
- `DELETE /cart/items` — a kosár ürítése egy kéréssel.
- `POST /payment-intents/{id}/outcome` — a demó fizetési alkalmazás ezzel közli a kimenetet.
- `GET /media/{imageId}` — a katalógusképeket a backend szolgálja ki. A felület ezt **nem hívja
  közvetlenül**: az `Image.src` értékét teszi a jelölőbe.

### 7.4 Fejlécek

- **`X-Demo-Session` megszűnt.** Helyette szerver által kiállított süti. Az ezt beszúró
  interceptor törlendő.
- **`If-Match` megmaradt**, de a hibája **409-ről 412-re** változott.
- **`Idempotency-Key` már csak két végponton kell**: `POST /payment-intents` és `POST /orders`.
  A kosárműveletekről és a checkoutról **el kell távolítani**.

### 7.5 Séma-változások

| Régi | Új |
|---|---|
| `ProductSummary`, benne `defaultVariant` | Tárhely-bontott katalógus-elem: konkrét `price`, `variantSlug`, egyetlen `image`, és `colors` tömb. A `defaultVariant` **megszűnt**. |
| `Quote` | `CheckoutSummary` a checkout válaszában. `quoteId` sehol. |
| `CartItem.id` | Megszűnt — a `variantId` azonosítja a sort. Bejött a `variantSlug`. |
| `Cart.itemCount` | `lineCount` és `totalQuantity` |
| `Cart.status` | Megszűnt. Rendelés után a munkamenet friss, üres kosarat kap. |
| `Quote.shipping` | `CheckoutSummary.shippingFee`, mellé `paymentFee` |
| `demo_card`, `demo_cod` | `card`, `cash_on_delivery` |
| `demo_pickup` | `pickup_point` |
| `demo_confirmed` | `confirmed` |
| `isDemo`, `isSimulation` | Megszűntek. |
| `acknowledgedSimulation` | Megszűnt — helyette állandó sáv a felületen. |
| `DemoConfig` | Megszűnt. |
| `fieldErrors[].message` | `fieldErrors[].code` — a szöveg a kliensé |
| — | **Új:** `Problem.params`, `Cart.notices`, `billing` szakasz, `facets.colors`, `facets.priceRange`, `ProductPage.totalPages` |

### 7.6 Viselkedésbeli változások

- **Egy kosár böngészőnként**, nem fülönként. A fülenkénti kosarat feltételező logika törlendő.
- **A checkout piszkozat tartós** — nem vész el oldalfrissítéskor. A kontaktadatot újra bekérő
  logika törlendő.
- **A listaelem tárhelyre bontott.** Egy termék több kártyaként jelenik meg, és a kártya
  konkrét árat mutat. A „…-tól" megjelenítés törlendő.
- **Nyolcféle rendezés** a korábbi négy helyett: `recommended`, `newest`, `oldest`,
  `popularity`, `price_asc`, `price_desc`, `name_asc`, `name_desc`.
- **Új szűrő:** `color`. Minden szűrőhöz tartozik facet-darabszám.
- **A fizetés átirányításos** — a boltban maradó szimuláció helyett.
- **A számlázási cím új kötelező szakasz** a checkoutban.
