import { isRecord } from '../../../core/is-record';
import type { ConflictDifference } from './conflict-dialog';

const LABELS: Readonly<Record<string, string>> = {
  promotion: 'Promóció',
  enabled: 'Engedélyezés',
  text: 'Szöveg',
  startsAt: 'Kezdés',
  endsAt: 'Lejárat',
  slug: 'Azonosító',
  brand: 'Márka',
  name: 'Név',
  description: 'Leírás',
  is5g: '5G',
  releasedAt: 'Megjelenés',
  rank: 'Sorrend',
  popularityScore: 'Népszerűség',
  featured: 'Kiemelt',
  highlights: 'Kiemelések',
  colors: 'Színek',
  code: 'Színkód',
  swatchHex: 'Szín',
  imageId: 'Kép',
  alt: 'Képleírás',
  variants: 'Változatok',
  colorCode: 'Szín',
  storageGb: 'Tárhely',
  price: 'Alapár',
  amount: 'Összeg',
  currency: 'Pénznem',
  stock: 'Készlet',
  salePriceHuf: 'Akciós ár',
  clearSalePrice: 'Akciós ár törlése',
  specGroups: 'Specifikáció',
  title: 'Cím',
  rows: 'Sorok',
  label: 'Megnevezés',
  value: 'Érték',
};

function display(value: unknown): string {
  if (value === undefined || value === null) return 'Nincs megadva';
  if (value === true) return 'Igen';
  if (value === false) return 'Nem';
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'Eltérő adatok';
}

/** Compare every changed value before the administrator may retry a replacement. */
export function conflictDifferences(
  local: unknown,
  server: unknown,
  label = '',
): ConflictDifference[] {
  if (Array.isArray(local) || Array.isArray(server)) {
    const left: readonly unknown[] = Array.isArray(local) ? local : [];
    const right: readonly unknown[] = Array.isArray(server) ? server : [];
    return Array.from({ length: Math.max(left.length, right.length) }, (_, i) =>
      conflictDifferences(left[i], right[i], `${label} ${String(i + 1)}`),
    ).flat();
  }
  if (isRecord(local) || isRecord(server)) {
    const left: Record<string, unknown> = isRecord(local) ? local : {};
    const right: Record<string, unknown> = isRecord(server) ? server : {};
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
      conflictDifferences(left[key], right[key], `${label} ${LABELS[key] ?? key}`.trim()),
    );
  }
  return local === server ? [] : [{ label, local: display(local), server: display(server) }];
}
