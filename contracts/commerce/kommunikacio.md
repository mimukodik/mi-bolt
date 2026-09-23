# Kommunikációs elvárások

A frontend és a backend közti szerződés. Mindkét oldalnak, a frontendnek és a backendnek, ugyanezt kell teljesítenie.

Az alábbiak mindegyike levezethető az `openapi.yaml`-ből; ez a dokumentum azt mondja el, amit a
gépi leíró önmagában nem tud kikényszeríteni.

---

## Az igazság forrása

A `contracts/commerce/openapi.yaml` a szerződés. Ha bármelyik dokumentum és a specfájl
ellentmond egymásnak, **a specfájl az érvényes**, és a dokumentumot kell javítani.

Ebből következik: sem a backend, sem a frontend nem definiálhat olyan végpontot, mezőt vagy
státuszkódot, ami nincs a specben. Ha valami hiányzik, előbb a spec bővül.

---

## 1. Alapok

- Minden végpont az `/api/v1` előtag alatt él, azonos origin-ről. A futásidejű gyök tiszteletben
  tartja az alkalmazás base href-jét.
- Sikeres válasz: `application/json`. Hibaválasz: **`application/problem+json`**.
- Pénz: **egész forint**, soha nem fillér és soha nem lebegőpontos. Minden pénzérték
  `{ amount, currency: "HUF" }` alakú.
- Dátum és idő: ISO 8601, UTC.
- Képek: az `Image.src` a szerver által előállított, **használatra kész URL**. A kliens
  változtatás nélkül használja, és soha nem épít képútvonalat azonosítóból. Ez teszi lehetővé,
  hogy a képkiszolgálás később máshová költözzön a szerződés érintése nélkül.

---

## 2. Munkamenet

A munkamenetet a szerver által kiállított **süti** azonosítja: `mibolt_session`.

**Backend elvárás.** Az első olyan kérésnél, ami munkamenethez kötött végpontra érkezik süti
nélkül, a szerver kiállít egy újat és `Set-Cookie`-val visszaadja. A süti attribútumai:
`HttpOnly`, `Secure`, `SameSite=Lax`, és a `Max-Age` a kosár élettartamához igazodik (30 nap).
A süti értéke kitalálhatatlan, és semmilyen azonosítót vagy adatot nem hordoz magában.

**Frontend elvárás.** A frontend **nem** generál, nem tárol és nem küld munkamenet-azonosítót.
Azonos origin esetén a böngésző magától küldi a sütit; nincs szükség interceptorra.

**Következmény.** Egy böngésző minden füle ugyanazt a kosarat látja. Ezt a backendnek
ténylegesen biztosítania kell: az állapot nem élhet olyan helyen, ami fülönként külön példány.

**Hatókör.** A katalógus végpontok (`/products*`) és a képkiszolgálás (`/media/*`) munkamenet
nélkül is elérhetők. A `/cart*`, `/checkout*`, `/payment-intents*` és `/orders*` végpontok
munkamenethez kötöttek.

---

## 3. Verziózás és konkurencia

A kosár és a checkout piszkozat **egyetlen közös verziószámlálón** osztozik.

**Minden sikeres mutáció növeli** ezt a számlálót: tétel hozzáadása, mennyiség módosítása,
sor törlése, kosár ürítése, checkout piszkozat módosítása.

**Minden érintett válasz `ETag` fejlécet ad**, idézőjelbe tett egész számként: `ETag: "7"`.
Ezt adják: `GET /cart`, minden kosármutáció, `GET /checkout`, `PATCH /checkout`.

**Minden mutáció `If-Match` fejlécet követel** ugyanilyen alakban. Ha az érték nem egyezik a
szerver aktuális verziójával, a válasz **412 Precondition Failed**, `CART_VERSION_CONFLICT`
kóddal. Nem 409 — ha feltételes kérést használunk, a feltétel bukása HTTP-ben 412.

**Frontend elvárás.** A verziót a válasz `ETag` fejlécéből kell kiolvasni és a következő
mutációhoz visszaküldeni. 412 esetén a helyes viselkedés: a kosár vagy a checkout újraolvasása,
a felhasználó tájékoztatása, majd — ha még értelmes — a művelet megismétlése. Soha nem szabad
automatikusan, a felhasználó tudta nélkül újrapróbálni az új verzióval.

---

## 4. Idempotencia

`Idempotency-Key` fejléc **két végponton kötelező**: `POST /payment-intents` és `POST /orders`.
Máshol nincs rá szükség, és nem is szabad megkövetelni.

Szabályok:

- A kulcs hatóköre: metódus + útvonal + munkamenet. Megőrzési idő 24 óra.
- Ugyanaz a kulcs ugyanazzal a normalizált törzzsel **az eredeti eredményt játssza vissza**,
  **mielőtt** a szerver bármilyen állapot- vagy feltétel-ellenőrzést végezne. Ez azt jelenti,
  hogy egy bizonytalan válasz utáni újraküldés a rendelés visszaigazolását adja vissza, nem
  hibát.
- Ugyanaz a kulcs **más** törzzsel: **409 `IDEMPOTENCY_CONFLICT`**.

**Frontend elvárás.** Bizonytalan válasz (időtúllépés, megszakadt kapcsolat) után a kérést
**pontosan ugyanazzal a kulccsal és törzzsel** kell megismételni. Új kulcsot csak akkor szabad
generálni, ha a felhasználó tudatosan új kísérletet indít — például egy elutasított fizetés után
újra megpróbálja.

---

## 5. Hibakontraktus

Minden hibaválasz `application/problem+json`, a `Problem` séma szerint.

### 5.1 Státuszkódok szétválasztása

| Státusz | Jelentés |
|---|---|
| **400** | A kérés **formailag** hibás: rossz típus, hiányzó kötelező mező, ismeretlen query paraméter. |
| **422** | A kérés formailag helyes, de **üzletileg** nem elfogadható. |
| 404 | A megcímzett erőforrás nem létezik, **vagy nem ehhez a munkamenethez tartozik**. |
| 409 | A kérés ütközik az aktuális állapottal. |
| 410 | A kosár lejárt. |
| 412 | Az `If-Match` verzió nem egyezik. |
| 503 | Átmeneti szolgáltatáskiesés. |

Ez a szétválasztás kötelező és következetes. Egy bepipálatlan ÁSZF-checkbox nem 400, hanem
**422**, mert formailag helyes boolean érkezett.

### 5.2 A hibaválasz tartalma

```json
{
  "type": "urn:mi-bolt:problem:quantity-limit",
  "title": "Quantity limit exceeded",
  "status": 409,
  "code": "QUANTITY_LIMIT",
  "detail": "Merged quantity would exceed the line maximum.",
  "traceId": "01JB8X5Q2U",
  "params": { "max": 5, "requested": 7 },
  "fieldErrors": []
}
```

- **`code`** a gépi azonosító. A felület ezen kapcsol, soha nem a `title` vagy a `detail`
  szövegén.
- **`params`** a szöveghez behelyettesítendő értékek. Enélkül a felület nem tud pontos üzenetet
  írni („legfeljebb 5 db rendelhető").
- **`fieldErrors`** elemei `path` (JSON pointer a kérés törzsébe) és `code` párosok, opcionális
  `params`-szal. Ebből tudja a felület, **melyik űrlapmezőt** kell megjelölnie.
- **`traceId`** minden válaszban jelen van, naplóban visszakereshető.

### 5.3 Hibakódok és tipikus helyük

| Kód | Státusz | Mikor |
|---|---|---|
| `INVALID_REQUEST` | 400 | Formai hiba, ismeretlen paraméter. |
| `VALIDATION_FAILED` | 422 | Üzletileg érvénytelen mezőérték; `fieldErrors` kitöltve. |
| `NOT_FOUND` | 404 | Nem létező vagy más munkamenethez tartozó erőforrás. |
| `CART_EXPIRED` | 410 | A kosár lejárt. |
| `CART_VERSION_CONFLICT` | 412 | `If-Match` eltérés. |
| `OUT_OF_STOCK` | 409 | A variáns elfogyott. |
| `QUANTITY_LIMIT` | 409 | A kért mennyiség meghaladja a soronkénti maximumot. |
| `PRICE_CHANGED` | 409 | A katalógusár változott; a felhasználónak látnia kell az újat. |
| `CHECKOUT_INCOMPLETE` | 422 | Hiányzó checkout szakasz. |
| `PAYMENT_REQUIRED` | 422 | A fizetési szándék `requires_action` — a vásárló nem ment végig a fizetési oldalon. |
| `PAYMENT_DECLINED` | 422 | A fizetési szándék elutasított; új kísérlet kell, új idempotencia-kulccsal. |
| `PAYMENT_PENDING` | 422 | A fizetési szándék még nem dőlt el; a rendelés nem véglegesíthető. |
| `PAYMENT_ALREADY_RESOLVED` | 409 | A fizetési szándék már terminális állapotban van, nem írható át. |
| `IDEMPOTENCY_CONFLICT` | 409 | Ugyanaz a kulcs más törzzsel. |
| `SERVICE_UNAVAILABLE` | 503 | Átmeneti kiesés. |

**Elvárás mindkét oldalra:** a felületnek **minden** felsorolt kódhoz tartoznia kell magyar
szöveggel. Ismeretlen kódra generikus üzenet megy ki, de ez naplózandó, mert azt jelenti, hogy a
két oldal szétcsúszott.

---

## 6. Lokalizáció határa

**Hibaüzenet és validáció:** a szerver kódot és paramétereket küld, a szöveget a felület állítja
össze. A `Problem.title` és `detail` **angol fejlesztői szöveg**, ami naplóba és hibakeresésbe
való — a felhasználó soha nem látja.

**Tartalom:** a terméknevek, a `highlights`, a specifikációs sorok, a szállítási és fizetési
módok címkéi és leírásai, valamint az `OrderReceipt.notice` **szerveroldali adat**, és magyarul
érkezik. A felület ezeket változtatás nélkül jeleníti meg.

A határ egyszerű: ami **üzenet**, az a kliensé; ami **adat**, az a szerveré.

---

## 7. Szerver által kezdeményezett változások

Amit a felhasználó kért és nem kaphat meg, az **hiba**. Amit a szerver magától változtatott meg,
az **értesítés**.

A `Cart.notices` tömb ezt hordozza: `code`, opcionális `variantId` és `params`. Kódjai:
`QUANTITY_REDUCED`, `PRICE_CHANGED`, `ITEM_REMOVED`.

**Backend elvárás.** Amikor a készlet a kosárban lévő mennyiség alá csökken, a szerver csökkenti
a sor mennyiségét és értesítést ad; nem hagy ellentmondó állapotot, ahol a `quantity` nagyobb,
mint a `maxQuantity`.

**Frontend elvárás.** A kosároldalnak ezeket az értesítéseket felső sávként meg kell jelenítenie.
Némán elnyelni tilos — a felhasználó árat vagy mennyiséget látna változni magyarázat nélkül.

---

## 8. A teljes folyamat

### 8.1 Vásárlás, sikeres úton

1. `GET /products?...` — katalógus, szűrőkkel. Munkamenet nem kell.
2. `GET /products/{slug}` — termékadatlap a teljes variánsmátrixszal.
   `GET /products/{slug}/related` külön hívásban, a lap aljára.
3. `POST /cart/items` — `If-Match` a jelenlegi verzióval. A válasz a **teljes kosár** és az új
   `ETag`. Ugyanennek a variánsnak az ismételt hozzáadása **összevonódik** a meglévő sorral.
4. `GET /checkout/options` — szállítási és fizetési módok, **a kosár értékéhez igazítva**.
5. `PATCH /checkout` — `contact`, `billing`, `delivery`, `payment` szakaszok, egyenként vagy
   együtt. Csak a küldött szakaszok íródnak felül. Minden sikeres írás növeli a verziót.
6. `GET /checkout` — a piszkozat és a **frissen számolt** összegzés. Nincs külön árajánlat-lépés.
7. Kártyás fizetésnél: `POST /payment-intents` — `If-Match` és `Idempotency-Key`. A válasz
   `redirectUrl`-t ad; a felhasználó odakerül, választ, majd a `returnUrl`-en visszatér.
   `GET /payment-intents/{id}` adja az eredményt.
8. `POST /orders` — `If-Match` és `Idempotency-Key`. Kártyás fizetésnél `paymentIntentId`
   kötelező, utánvétnél a mező nem is létezik. A válasz **201** és a visszaigazolás.
9. A rendeléssel a kosár lezárul, a piszkozat törlődik, és a munkamenet **azonnal friss, üres
   kosarat kap**. A következő `GET /cart` üres kosarat ad, nem a megrendeltet.

### 8.2 Ármódosulás a folyamat közben

Ha a katalógusár megváltozik, mielőtt a rendelés véglegesülne: a szerver **atomikusan**
frissíti a kosár árait, **növeli a verziót**, és a fizetési vagy rendelési kísérletre
**409 `PRICE_CHANGED`** választ ad.

A felületnek ilyenkor újra kell olvasnia a kosarat, meg kell mutatnia az új összeget, és **a
felhasználó kifejezett megerősítését** kell kérnie, mielőtt újra próbálkozik. Az új összeg néma
elfogadása tilos.

### 8.3 Fizetési átirányítás

A `PaymentIntent` négy állapotot vehet fel: `requires_action`, `succeeded`, `declined`,
`pending`. A `declined` és a `pending` **nem hiba**: a `POST /payment-intents` ezekre is
**201**-et ad, az állapot a törzsben van.

A fizetési oldal **külön, kicsi Angular alkalmazás** a webshop monorepójában, egyértelműen
demóként jelölve, generikus néven. **Soha nem viselheti valós fizetési szolgáltató nevét vagy
arculatát.** Három kimenetet kínál: sikeres, elutasított, függőben.

A teljes menet:

1. `POST /payment-intents` — a bolt létrehozza a szándékot, és megkapja a `redirectUrl`-t.
2. A böngésző **teljes oldalbetöltéssel** átmegy a fizetési alkalmazásba. A webshop SPA
   megsemmisül.
3. A fizetési alkalmazás `GET /payment-intents/{id}` hívással lekéri az összeget.
4. A vásárló választ, és az alkalmazás **`POST /payment-intents/{id}/outcome`** hívással közli a
   kimenetet.
5. Visszatérés a `returnUrl`-re, szintén teljes oldalbetöltéssel és **GET** navigációval. A
   webshop SPA nulláról indul, és mindent a szerverről tölt vissza.
6. A bolt `GET /payment-intents/{id}` hívással ellenőrzi az eredményt, majd rendel.

**Az `outcome` művelet egyszer lövő.** Ha a szándék már terminális állapotban van, a válasz
**409 `PAYMENT_ALREADY_RESOLVED`** — ez véd attól, hogy egy visszagomb vagy egy frissítés
felülírjon egy már elkönyvelt fizetést. Elveszett válasz után nem újraküldeni kell, hanem a
szándékot lekérdezni.

**Ez a művelet azért létezik, mert nincs valódi fizetési szolgáltató.** Éles rendszerben a
böngésző soha nem dönthetné el, hogy a saját fizetése sikeres volt-e; ott a szolgáltató
értesíti a boltot a háta mögött. Ezt a végpontot nem szabad éles integrációba átvinni.

Függőben lévő szándéknál a bolt lekérdezéssel vár; a szerver garantálja, hogy az állapot az
`expiresAt` előtt terminálissá válik.

---

## 9. Amit egyik oldal sem tehet meg

- A kliens **nem** küld árat, részösszeget, végösszeget, szállítási díjat vagy készletadatot.
  A szerver ilyet nem fogad el a kérésből, akkor sem, ha megérkezik.
- A kliens **nem** tárol kosarat böngészőtárolóban. Az egyetlen igazság a szerveré.
- A szerver **nem** küld a felhasználónak szánt hibaszöveget.
- Egyik oldal sem vezet be olyan mezőt, végpontot vagy státuszkódot, ami nincs a specben.
