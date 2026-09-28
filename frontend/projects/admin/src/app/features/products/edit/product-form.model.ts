import type { Image } from '../../../api/generated/models/image';
import type { StorageGb } from '../../../api/generated/models/storage-gb';

export interface HighlightModel {
  readonly key: string;
  text: string;
}

export interface ColorModel {
  readonly key: string;
  code: string;
  name: string;
  swatchHex: string;
  alt: string;
  image: Image | null;
}

export interface VariantModel {
  readonly key: string;
  readonly id: string | null;
  colorKey: string | null;
  storageGb: StorageGb | null;
  price: number | null;
  discountPrice: number | null;
  stock: number | null;
}

export interface SpecRowModel {
  readonly key: string;
  label: string;
  value: string;
}

export interface SpecGroupModel {
  readonly key: string;
  title: string;
  rows: SpecRowModel[];
}

export interface ProductFormModel {
  slug: string;
  brand: string;
  name: string;
  description: string;
  is5g: boolean;
  releasedAt: Date | null;
  rank: number | null;
  popularityScore: number | null;
  featured: boolean;
  promotionStartAt: string;
  promotionEndAt: string;
  promotionText: string;
  highlights: HighlightModel[];
  colors: ColorModel[];
  variants: VariantModel[];
  specGroups: SpecGroupModel[];
}

/** A fresh identity for a `@for` track and a variant's link to its colour; never sent to the wire. */
export function newKey(): string {
  return crypto.randomUUID();
}

export function emptyHighlight(): HighlightModel {
  return { key: newKey(), text: '' };
}

export function emptyColor(): ColorModel {
  return { key: newKey(), code: '', name: '', swatchHex: '', alt: '', image: null };
}

export function emptyVariant(colorKey: string | null): VariantModel {
  return {
    key: newKey(),
    id: null,
    colorKey,
    storageGb: null,
    price: null,
    discountPrice: null,
    stock: 0,
  };
}

export function emptySpecRow(): SpecRowModel {
  return { key: newKey(), label: '', value: '' };
}

export function emptySpecGroup(): SpecGroupModel {
  return { key: newKey(), title: '', rows: [emptySpecRow()] };
}

export function emptyProductForm(): ProductFormModel {
  const color = emptyColor();
  return {
    slug: '',
    brand: '',
    name: '',
    description: '',
    is5g: false,
    releasedAt: null,
    rank: null,
    popularityScore: null,
    featured: false,
    promotionStartAt: '',
    promotionEndAt: '',
    promotionText: '',
    highlights: [emptyHighlight()],
    colors: [color],
    variants: [emptyVariant(color.key)],
    specGroups: [emptySpecGroup()],
  };
}
