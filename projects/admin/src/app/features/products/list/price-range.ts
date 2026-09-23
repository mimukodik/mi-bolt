import type { Money } from '../../../api/generated/models/money';

const NO_BREAK_SPACE = String.fromCharCode(0xa0);
const EN_DASH = String.fromCharCode(0x2013);

/**
 * Groups a whole forint amount by thousands with a no-break space:
 * 599990 → "599 990". Built by slicing three-digit groups off the end
 * rather than with a regex lookahead, so the pattern never takes the
 * nested-quantifier shape `security/detect-unsafe-regex` flags (the
 * same rewrite `product-form.schema.ts`'s `isSlugLike` and
 * `products-write.handlers.ts`'s `isValidSlug` use for that rule).
 */
export function formatHuf(amount: number): string {
  const digits = String(amount);
  const groups: string[] = [];
  let end = digits.length;
  while (end > 3) {
    groups.unshift(digits.slice(end - 3, end));
    end -= 3;
  }
  groups.unshift(digits.slice(0, end));
  return groups.join(NO_BREAK_SPACE);
}

/** The Ár column (plan M3): "599 990–717 990 Ft", or one amount when both ends are equal. */
export function formatPriceRange(min: Money, max: Money): string {
  const low = formatHuf(min.amount);
  if (min.amount === max.amount) {
    return `${low}${NO_BREAK_SPACE}Ft`;
  }
  return `${low}${EN_DASH}${formatHuf(max.amount)}${NO_BREAK_SPACE}Ft`;
}
