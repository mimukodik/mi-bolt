import type { Product } from '../../api/generated/models/product';
import type { Variant } from '../../api/generated/models/variant';

/**
 * The demo device the product page specs serve from their own MSW
 * handlers, in the contract's `Product` shape (`docs/api/openapi.yaml`).
 * Only the spec files (`product-page.spec.ts`,
 * `product-page-responsive.spec.ts`) import it; no application code does.
 */

const VARIANTS: Variant[] = [
  {
    id: 'demo-one-5g-graphite-256',
    slug: 'demo-one-5g-graphite-256-variant',
    colorCode: 'graphite',
    colorName: 'Grafit',
    swatchHex: '#343B43',
    storageGb: 256,
    price: { amount: 339_990, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      {
        id: 'demo-one-5g-graphite-256-front',
        src: '/assets/products/graphite-front.webp',
        alt: 'Demo One 5G, Grafit, 256 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
  {
    id: 'demo-one-5g-graphite-512',
    slug: 'demo-one-5g-graphite-512-variant',
    colorCode: 'graphite',
    colorName: 'Grafit',
    swatchHex: '#343B43',
    storageGb: 512,
    price: { amount: 378_390, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      {
        id: 'demo-one-5g-graphite-512-front',
        src: '/assets/products/graphite-front.webp',
        alt: 'Demo One 5G, Grafit, 512 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
  {
    id: 'demo-one-5g-silver-256',
    slug: 'demo-one-5g-silver-256-variant',
    colorCode: 'silver',
    colorName: 'Ezüst',
    swatchHex: '#C6C9CB',
    storageGb: 256,
    price: { amount: 344_990, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      {
        id: 'demo-one-5g-silver-256-front',
        src: '/assets/products/silver-front.webp',
        alt: 'Demo One 5G, Ezüst, 256 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
  {
    id: 'demo-one-5g-silver-512',
    slug: 'demo-one-5g-silver-512-variant',
    colorCode: 'silver',
    colorName: 'Ezüst',
    swatchHex: '#C6C9CB',
    storageGb: 512,
    price: { amount: 383_390, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      {
        id: 'demo-one-5g-silver-512-front',
        src: '/assets/products/silver-front.webp',
        alt: 'Demo One 5G, Ezüst, 512 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
];

export const DEMO_PRODUCT: Product = {
  id: 'p-01',
  slug: 'demo-one-5g',
  brand: 'MiBolt Demo',
  name: 'Demo One 5G',
  highlights: ['6,7″ kijelző', '50 MP kamera'],
  is5g: true,
  releasedAt: '2026-01-01',
  description:
    'Fiktív készülék a MiBolt webshop működésének bemutatásához. A kép illusztráció, az ár demóadat.',
  specGroups: [
    {
      id: 'display',
      title: 'Kijelző és kialakítás',
      rows: [
        { label: 'Kijelző', value: '6,7″ • demóadat' },
        { label: 'Képfrissítés', value: '120 Hz • demóadat' },
      ],
    },
    {
      id: 'connection',
      title: 'Kapcsolat és memória',
      rows: [
        { label: 'Kapcsolat', value: '5G / Wi-Fi / Bluetooth • demóadat' },
        { label: 'Tárhely', value: 'Változattól függő • demóadat' },
      ],
    },
  ],
  variants: VARIANTS,
};
