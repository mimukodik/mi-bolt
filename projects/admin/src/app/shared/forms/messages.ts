/** Hungarian validation messages shared by every admin form. */
export const MESSAGES = {
  required: 'Kötelező mező.',
  notNegative: 'Nem lehet negatív.',
  imageRequired: 'Tölts fel képet.',
  maxLength: (max: number): string => `Legfeljebb ${String(max)} karakter.`,
  slugPattern: 'Csak kisbetű, szám és kötőjel.',
  hexPattern: 'Formátum: #RRGGBB.',
  integer: 'Egész számot adj meg.',
  priceMax: 'Legfeljebb 100 000 000 Ft.',
  featuredLimit: 'Legfeljebb 4 kiemelt termék lehet.',
  highlightsMin: 'Legalább egy kiemelés kell.',
  highlightsMax: 'Legfeljebb 6 kiemelés adható meg.',
  colorsMin: 'Legalább egy szín kell.',
  variantsMin: 'Legalább egy változat kell.',
  specGroupsMin: 'Legalább egy specifikációcsoport kell.',
  specRowsMin: 'Legalább egy sor kell.',
} as const;

/** Hungarian messages for the field-level codes of the admin API's 422 answers. */
export const SERVER_FIELD_MESSAGES: Readonly<Record<string, string>> = {
  REQUIRED: 'Kötelező mező.',
  NOTBLANK: 'Kötelező mező.',
  WRONG_PASSWORD: 'Hibás jelenlegi jelszó.',
  PASSWORD_TOO_LONG: 'A jelszó legfeljebb 72 bájt lehet.',
  EMPTY_FILE: 'A fájl üres.',
  UNSUPPORTED_IMAGE_TYPE: 'Csak PNG, JPEG vagy WebP kép tölthető fel.',
  IMAGE_UNREADABLE: 'A kép nem olvasható.',
  DUPLICATE_COLOR_CODE: 'Ez a színkód már szerepel.',
  UNKNOWN_COLOR: 'Ismeretlen szín.',
  DUPLICATE_VARIANT_SLUG: 'Ez a változat-azonosító már szerepel.',
  DUPLICATE_VARIANT: 'Ez a szín és tárhely páros már szerepel.',
  VARIANT_ID_TOO_LONG: 'A változat azonosítója túl hosszú (legfeljebb {max} karakter).',
  SLUG_TAKEN: 'Ez a slug már foglalt.',
  SLUG_IMMUTABLE: 'A slug létrehozás után nem módosítható.',
  UNKNOWN_IMAGE: 'A kép nem található; töltsd fel újra.',
  FEATURED_LIMIT: 'Legfeljebb {max} kiemelt termék lehet.',
};

/** Shown when a code has no Hungarian message yet (the shop's precedent, contact-server-errors.ts). */
export const SERVER_FIELD_FALLBACK = 'Ellenőrizd a mező értékét.';
