# Látványtervek és helyi demóképek

A [prototype.html](prototype.html) a magyar, reszponzív, kattintható HTML-látványprototípus. Külön is megnyitható; nem Angular alkalmazás, nem MSW-implementáció, és nem a készülő alkalmazás tesztbizonyítéka. A felső eszközsáv a képernyők és állapotok tervezési megtekintésére szolgál, nem másolható át a felhasználói demóba.

Az [overview.png](overview.png) a négy fő képernyőt mutatja. A `screenshots/` mappában 31 külön képernyőkép szerepel: a nyolc route-nézet 1440 és 390 px szélességen, továbbá a hibás, üres, betöltési és átmeneti állapotok. Ezek a terv vizuális referenciái; megvalósításkor friss képek kellenek a valódi Angular appból.

A pontos geometria és reszponzív viselkedés: [screens.md](../spec/screens.md). A komponensfelelősségek: [components.md](../spec/components.md). Az arculatot a **külön telepített `mi-bolt-design` skill** szabályozza; a skill, tokenjei és eredeti képei szándékosan nincsenek megkettőzve ebben a csomagban.

Az `assets/products/` négy eredeti, fiktív készülékillusztráció WebP-változatát és szerkeszthető SVG-forrását tartalmazza. Ezek nem valódi termékfotók. A T10 során csak a szükséges WebP-fájlokat kell a projekt `public/assets/products/` mappájába átvenni, a [forrásjegyzék](asset-manifest.json) és [asset-szabályok](assets/README.md) megtartásával. Nem mellékeltünk fontfájlt vagy 3D-modellt.
