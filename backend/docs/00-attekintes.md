# MiBolt — elvárás-specifikáció

Ez a csomag **elvárásokat** ír le, nem megvalósítási tervet. Azt rögzíti, mit kell tudnia a
rendszernek és milyen szabályoknak kell megfelelnie — a lépések sorrendje, a fájlszerkezet és a
kódszervezés a megvalósító dolga.

## A csomag fájljai

| Fájl | Kinek szól | Mit tartalmaz |
|---|---|---|
| `01-kommunikacio.md` | **mindkét repó** | A frontend és a backend közti szerződés. Ez a legfontosabb fájl. |
| `02-backend.md` | backend repó | Technológiai keret, generálás, domain-invariánsok, adatmodell. |
| `03-frontend.md` | frontend repó | Angular elvárások, generálás, és a régi→új spec eltérései. |
| `04-adatbazis.md` | backend repó | PostgreSQL 16 és a kötelező kezelési mód. |
| `05-backend-generator-prompt.md` | — | Másolható prompt a backend generálás beüzemeléséhez. |

A fejlesztés során keletkezik egy hatodik hely is: a **`decisions/`** mappa ez alatt, ahova
minden fejlesztés közben hozott döntés bekerül, egy döntés egy fájl. A szabályait a
`02-backend.md` 8. szakasza írja le.

## Az igazság forrása

Az `openapi.yaml` a szerződés. Ha bármelyik dokumentum és a specfájl ellentmond egymásnak,
**a specfájl az érvényes**, és a dokumentumot kell javítani.

Ebből következik: sem a backend, sem a frontend nem definiálhat olyan végpontot, mezőt vagy
státuszkódot, ami nincs a specben. Ha valami hiányzik, előbb a spec bővül.

## Alapelvek

**Demó, de éles felépítéssel.** Nem történik valódi fizetés, kézbesítés vagy e-mail-küldés, és
ez a felületen végig látható marad. Ettől függetlenül a rendszer szerkezetének olyannak kell
lennie, mint egy éles webshopé — nem szabad „úgyis csak demó" alapon egyszerűsíteni.

**A szerver az autoritás.** A kosár, a checkout piszkozat, az árak, a készlet és a végösszegek
szerveroldali állapotok. A kliens soha nem küld árat, végösszeget vagy készletadatot, és a
szerver soha nem fogad el ilyet a kérésből.

**Egy munkamenet, egy kosár.** A munkamenetet süti azonosítja, amit a szerver állít ki. Nincs
olyan, hogy két böngészőfül két kosarat lát.

**Gépi hibakód, emberi szöveg a kliensen.** A hibaválaszok kódot és paramétereket hordoznak;
a magyar szöveget a felület állítja össze. Kivétel a tartalom (terméknevek, címkék,
specifikációs sorok), ami szerveroldali adat és magyarul érkezik.

**Bizonyított viselkedés.** Az elvárások akkor érnek valamit, ha teszt áll mögöttük: smoke,
unit (legalább 90% lefedettség) és API szinten egyaránt. A tesztek **soha nem használhatnak
Docker-adatbázist** — mockolva vagy memóriában futnak. Részletek a `02-backend.md` 7. szakaszában.

**Dokumentált döntések.** Minden fejlesztés közben hozott döntés bekerül a `decisions/` mappába,
a döntéssel egy menetben. Ez alól az ezektől a dokumentumoktól való eltérés sem kivétel — azt
javítani is kell, nem csak feljegyezni.

## Eldöntött, de még megvalósítatlan

- **Adatbázis-migráció:** Liquibase, changelog-alapon. Lásd `04-adatbazis.md`.
- **A specfájl útja:** a `mi-bolt-backend` repóban él `api/openapi.yaml` néven, és a backend
  **git taggel** jelöli a szerződés kiadásait. A frontend egy szkripttel tölti le egy konkrét
  tagről; a letöltött fájl és a forrás-tag is bekerül a frontend repóba. A tag emelése tudatos
  lépés, nem automatikus húzás a legfrissebbre.
- **Katalógus:** a lehető legnagyobb. Lásd `02-backend.md`, „Kezdőadat" szakasz.
- **Képek:** a backend tárolja és szolgálja ki, `GET /media/{imageId}` műveleten. Tartalomból
  származó azonosító, korlátlan gyorsítótárazás. A CDN-re költözés későbbi kör, és a
  szerződést nem érinti.
- **Demó fizetési oldal:** külön, kicsi Angular alkalmazás a webshop monorepójában, minimális
  dizájnnal. A most készülő backendet használja. Lásd `03-frontend.md`.

## Nyitott döntések

1. **A fizetési szándék lezárásának végpontja — lezárva 2026-09-20.** A
   `POST /payment-intents/{id}/outcome` művelet bekerült a contractba és a backend T7 egységében
   elkészült (docs/decisions/0012); a fizetési oldal ezzel közli a kimenetet. Lásd lentebb.
2. **A termékképek forrása.** Hogy a katalógus képei honnan származnak, nincs eldöntve — ez a
   gyűjtés végrehajtásakor dől el, a letöltő szkripttel együtt. Egy szempont hozzá: ha a gyűjtés
   valós boltból hoz képeket, azok harmadik fél szerzői jogi védelem alatt álló művei, és belső
   bemutatón ez más megítélés alá esik, mint egy nyilvánosan elérhető oldalon.

   **A backend munkáját nem blokkolja.** A kiszolgálás szerződése kész (`GET /media/{imageId}`),
   és az `Image.src` a szerver által előállított kész URL — tehát a képek forrása és helye a
   szerződés érintése nélkül cserélhető.
