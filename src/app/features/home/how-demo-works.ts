import { Component } from '@angular/core';

/**
 * `HowDemoWorks` — three explanatory tiles for the home page.
 *
 * The copy only describes the demo flow (böngészés, kosár, szimulált
 * rendelés) and deliberately avoids any reference to tariffs,
 * internet, services, payments or bank cards (T14-AC04). The three
 * tiles map directly to the documented demo flow so users know
 * exactly what to do once they click the CTA.
 *
 * Each tile renders an icon-shaped SVG mark (decorative, no
 * functional text) and a heading + body in Hungarian with correct
 * accents (R12).
 */
interface TileCopy {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

const TILES: readonly TileCopy[] = [
  {
    id: 'how-tile-browse',
    title: 'Válaszd ki a készüléked',
    body: 'Szűrj 5G-re, készletre vagy tárhelyre, és nézd meg a kiválasztott készülék részletes adatait.',
  },
  {
    id: 'how-tile-cart',
    title: 'Állítsd össze a rendelést',
    body: 'A kiválasztott variánst bármikor visszakeresheted a kosárban — a demó a munkameneted során megőrzi.',
  },
  {
    id: 'how-tile-order',
    title: 'Próbáld végig a folyamatot',
    body: 'A pénztár végigmegy a demó lépésein; a rendelés nem kerül valódi feldolgozásra, sem számlázásra.',
  },
];

@Component({
  selector: 'app-how-demo-works',
  templateUrl: './how-demo-works.html',
  styleUrl: './how-demo-works.scss',
})
export class HowDemoWorks {
  readonly tiles = TILES;

  /**
  Zero-padded step number ("01", "02", "03") for the tile at `index`.
  */
  numberLabel(index: number): string {
    return String(index + 1).padStart(2, '0');
  }
}
