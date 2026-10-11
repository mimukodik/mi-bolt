import { utcTimestampKey } from '../../../core/utc-timestamp';
import type { Signal } from '@angular/core';
import {
  applyEach,
  max,
  maxLength,
  min,
  minLength,
  pattern,
  readonly,
  required,
  schema,
  validate,
  validateTree,
} from '@angular/forms/signals';
import type { Schema } from '@angular/forms/signals';

import { MESSAGES, SERVER_FIELD_MESSAGES } from '../../../shared/forms/messages';

import { MAX_VARIANT_ID, variantId } from './variant-id';
import type { ProductFormModel } from './product-form.model';

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SLUG_SEGMENT_PATTERN = /^[a-z0-9]+$/;

/**
 * Same accepted set as the contract's `^[a-z0-9]+(?:-[a-z0-9]+)*$`, without the
 * nested-quantifier shape `security/detect-unsafe-regex` flags: split on `-` and
 * require every segment to match the single-quantifier pattern (the same rewrite
 * `products-write.handlers.ts`'s `isValidSlug` uses for the same contract rule).
 */
function isSlugLike(value: string): boolean {
  return value.split('-').every((segment) => SLUG_SEGMENT_PATTERN.test(segment));
}

export interface ProductFormSchemaContext {
  /** Active featured products other than the one being edited; `null` while unknown. */
  readonly featuredOthers: Signal<number | null>;
  /** True when the product already exists: the backend rejects a changed slug (422 SLUG_IMMUTABLE). */
  readonly slugLocked?: Signal<boolean>;
}

function variantIdTooLongMessage(): string {
  return SERVER_FIELD_MESSAGES['VARIANT_ID_TOO_LONG'].replace('{max}', String(MAX_VARIANT_ID));
}

/** The product edit form's validators: every contract limit in the brief, plus the client-side echoes of the backend's uniqueness codes. */
export function productFormSchema(context: ProductFormSchemaContext): Schema<ProductFormModel> {
  return schema<ProductFormModel>((path) => {
    maxLength(path.promotion.text, 280, { message: MESSAGES.maxLength(280) });
    validate(path.promotion.text, (ctx) =>
      ctx.valueOf(path.promotion.enabled) && ctx.value().trim() === ''
        ? { kind: 'required', message: MESSAGES.required }
        : null,
    );
    for (const time of [path.promotion.startsAt, path.promotion.endsAt]) {
      validate(time, (ctx) => {
        const value = ctx.value();
        if (value === '')
          return ctx.valueOf(path.promotion.enabled)
            ? { kind: 'required', message: MESSAGES.required }
            : null;
        return utcTimestampKey(value) === null
          ? { kind: 'date', message: MESSAGES.promotionDate }
          : null;
      });
    }
    validate(path.promotion.endsAt, (ctx) => {
      const starts = ctx.valueOf(path.promotion.startsAt);
      const ends = ctx.value();
      const startKey = utcTimestampKey(starts);
      const endKey = utcTimestampKey(ends);
      return startKey !== null && endKey !== null && startKey >= endKey
        ? { kind: 'period', message: MESSAGES.promotionPeriod }
        : null;
    });
    validate(path.promotion.enabled, (ctx) =>
      ctx.value() && !ctx.valueOf(path.variants).some((variant) => variant.salePriceHuf !== null)
        ? { kind: 'variants', message: MESSAGES.promotionVariant }
        : null,
    );
    required(path.slug, { message: MESSAGES.required });
    maxLength(path.slug, 120, { message: MESSAGES.maxLength(120) });
    validate(path.slug, ({ value }) => {
      const slug = value();
      return slug !== '' && !isSlugLike(slug)
        ? { kind: 'slugPattern', message: MESSAGES.slugPattern }
        : null;
    });
    readonly(path.slug, { when: () => context.slugLocked?.() ?? false });

    validate(path.brand, ({ value }) =>
      value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
    );
    maxLength(path.brand, 80, { message: MESSAGES.maxLength(80) });

    validate(path.name, ({ value }) =>
      value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
    );
    maxLength(path.name, 200, { message: MESSAGES.maxLength(200) });

    maxLength(path.description, 2000, { message: MESSAGES.maxLength(2000) });

    required(path.releasedAt, { message: MESSAGES.required });

    required(path.rank, { message: MESSAGES.required });
    validate(path.rank, ({ value }) => {
      const rank = value();
      return rank !== null && !Number.isInteger(rank)
        ? { kind: 'integer', message: MESSAGES.integer }
        : null;
    });

    required(path.popularityScore, { message: MESSAGES.required });
    validate(path.popularityScore, ({ value }) => {
      const popularityScore = value();
      return popularityScore !== null && !Number.isInteger(popularityScore)
        ? { kind: 'integer', message: MESSAGES.integer }
        : null;
    });

    validate(path.featured, ({ value }) => {
      const others = context.featuredOthers();
      return value() && others !== null && others >= 4
        ? { kind: 'featuredLimit', message: MESSAGES.featuredLimit }
        : null;
    });

    minLength(path.highlights, 1, { message: MESSAGES.highlightsMin });
    maxLength(path.highlights, 6, { message: MESSAGES.highlightsMax });
    applyEach(path.highlights, (highlight) => {
      validate(highlight.text, ({ value }) =>
        value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
      );
      maxLength(highlight.text, 280, { message: MESSAGES.maxLength(280) });
    });

    minLength(path.colors, 1, { message: MESSAGES.colorsMin });
    applyEach(path.colors, (color) => {
      required(color.code, { message: MESSAGES.required });
      maxLength(color.code, 40, { message: MESSAGES.maxLength(40) });
      validate(color.code, ({ value }) => {
        const code = value();
        return code !== '' && !isSlugLike(code)
          ? { kind: 'slugPattern', message: MESSAGES.slugPattern }
          : null;
      });
      validateTree(color, (ctx) => {
        const colors = ctx.valueOf(path.colors);
        const isDuplicate = colors
          .slice(0, ctx.index())
          .some((other) => other.code === ctx.value().code);
        return isDuplicate
          ? {
              kind: 'server',
              message: SERVER_FIELD_MESSAGES['DUPLICATE_COLOR_CODE'],
              fieldTree: ctx.fieldTree.code,
            }
          : null;
      });

      validate(color.name, ({ value }) =>
        value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
      );
      maxLength(color.name, 80, { message: MESSAGES.maxLength(80) });

      required(color.swatchHex, { message: MESSAGES.required });
      pattern(color.swatchHex, HEX_PATTERN, { message: MESSAGES.hexPattern });

      validate(color.alt, ({ value }) =>
        value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
      );
      maxLength(color.alt, 280, { message: MESSAGES.maxLength(280) });

      required(color.image, { message: MESSAGES.imageRequired });
    });

    minLength(path.variants, 1, { message: MESSAGES.variantsMin });
    applyEach(path.variants, (variant) => {
      required(variant.colorKey, { message: MESSAGES.required });
      validate(variant.colorKey, (ctx) => {
        const colorKey = ctx.value();
        if (colorKey === null) {
          return null;
        }
        const colors = ctx.valueOf(path.colors);
        const color = colors.find((candidate) => candidate.key === colorKey);
        if (color === undefined) {
          return { kind: 'server', message: SERVER_FIELD_MESSAGES['UNKNOWN_COLOR'] };
        }
        const storageGb = ctx.valueOf(variant.storageGb);
        if (storageGb === null) {
          return null;
        }
        const slug = ctx.valueOf(path.slug);
        return variantId(slug, color.code, storageGb).length > MAX_VARIANT_ID
          ? { kind: 'server', message: variantIdTooLongMessage() }
          : null;
      });

      required(variant.storageGb, { message: MESSAGES.required });
      validateTree(variant, (ctx) => {
        const value = ctx.value();
        if (value.colorKey === null || value.storageGb === null) {
          return null;
        }
        const variants = ctx.valueOf(path.variants);
        const isDuplicate = variants
          .slice(0, ctx.index())
          .some(
            (other) => other.colorKey === value.colorKey && other.storageGb === value.storageGb,
          );
        return isDuplicate
          ? {
              kind: 'server',
              message: SERVER_FIELD_MESSAGES['DUPLICATE_VARIANT'],
              fieldTree: ctx.fieldTree.storageGb,
            }
          : null;
      });

      required(variant.price, { message: MESSAGES.required });
      validate(variant.price, ({ value }) => {
        const price = value();
        return price !== null && !Number.isInteger(price)
          ? { kind: 'integer', message: MESSAGES.integer }
          : null;
      });
      min(variant.price, 0, { message: MESSAGES.notNegative });
      max(variant.price, 100_000_000, { message: MESSAGES.priceMax });

      validate(variant.salePriceHuf, ({ value }) => {
        const price = value();
        return price !== null && !Number.isInteger(price)
          ? { kind: 'integer', message: MESSAGES.integer }
          : null;
      });
      min(variant.salePriceHuf, 1, { message: MESSAGES.positivePrice });
      max(variant.salePriceHuf, 100_000_000, { message: MESSAGES.priceMax });
      required(variant.stock, { message: MESSAGES.required });
      validate(variant.stock, ({ value }) => {
        const stock = value();
        return stock !== null && !Number.isInteger(stock)
          ? { kind: 'integer', message: MESSAGES.integer }
          : null;
      });
      min(variant.stock, 0, { message: MESSAGES.notNegative });
    });

    minLength(path.specGroups, 1, { message: MESSAGES.specGroupsMin });
    applyEach(path.specGroups, (group) => {
      validate(group.title, ({ value }) =>
        value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
      );
      maxLength(group.title, 120, { message: MESSAGES.maxLength(120) });

      minLength(group.rows, 1, { message: MESSAGES.specRowsMin });
      applyEach(group.rows, (row) => {
        validate(row.label, ({ value }) =>
          value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
        );
        maxLength(row.label, 120, { message: MESSAGES.maxLength(120) });

        validate(row.value, ({ value }) =>
          value().trim() === '' ? { kind: 'required', message: MESSAGES.required } : null,
        );
        maxLength(row.value, 2000, { message: MESSAGES.maxLength(2000) });
      });
    });
  });
}
