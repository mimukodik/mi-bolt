import { Component, computed, input, output } from '@angular/core';

import type { Product } from '../../api/generated/models/product';
import type { DisabledCombination } from './variant-selection';

/**
 * T16 — color and storage variant selector (T16-AC03).
 *
 * Two radio groups, one per axis. Each option button shows:
 *   - a textual label (color name or storage bucket);
 *   - a checkmark glyph when it is the selected option;
 *   - the swatch only as a supplementary visual cue (R03 — selection
 *     is not conveyed by color alone).
 *
 * Buttons whose (color, currentStorage) pair has no matching variant
 * are rendered as `disabled` and expose the Hungarian reason from
 * `DisabledCombination.reason` via `aria-describedby` so the user
 * knows why the option is not available.
 *
 * The component is purely presentational — it does not own the
 * product or any side-effecting state. The owning page feeds it
 * the product, the current selection and the disabled list, and
 * receives `colorChange` / `storageChange` outputs to forward to
 * the facade.
 */
@Component({
  selector: 'app-variant-selector',
  templateUrl: './variant-selector.html',
  styleUrl: './variant-selector.scss',
})
export class VariantSelector {
  readonly product = input.required<Product>();
  readonly selectedColorCode = input<string | null>(null);
  readonly selectedStorageGb = input<number | null>(null);
  readonly disabledCombinations = input<readonly DisabledCombination[]>([]);

  readonly colorChange = output<string>();
  readonly storageChange = output<number>();

  /** Distinct color buckets derived from the product variants. */
  readonly colorOptions = computed(() => {
    const map = new Map<string, { colorCode: string; colorName: string; swatchHex: string }>();
    for (const variant of this.product().variants) {
      if (map.has(variant.colorCode)) continue;
      map.set(variant.colorCode, {
        colorCode: variant.colorCode,
        colorName: variant.colorName,
        swatchHex: variant.swatchHex,
      });
    }
    return Array.from(map.values());
  });

  /** Distinct storage buckets derived from the product variants. */
  readonly storageOptions = computed(() => {
    const seen = new Set<number>();
    const list: { storageGb: number }[] = [];
    for (const variant of this.product().variants) {
      if (seen.has(variant.storageGb)) continue;
      seen.add(variant.storageGb);
      list.push({ storageGb: variant.storageGb });
    }
    return list.sort((a, b) => a.storageGb - b.storageGb);
  });

  readonly selectedColorName = computed<string>(() => {
    const code = this.selectedColorCode();
    if (code === null) return '—';
    const match = this.colorOptions().find((c) => c.colorCode === code);
    return match ? match.colorName : code;
  });

  readonly selectedStorageLabel = computed<string>(() => {
    const value = this.selectedStorageGb();
    if (value === null) return '—';
    return `${String(value)} GB`;
  });

  readonly colorDisabledReasons = computed(() =>
    this.disabledCombinations()
      .filter((d) => d.storageGb === (this.selectedStorageGb() ?? -1))
      .map((d) => {
        return {
          id: `variant-color-disabled-${d.colorCode}`,
          text: d.reason,
          colorCode: d.colorCode,
        };
      }),
  );

  readonly storageDisabledReasons = computed(() =>
    this.disabledCombinations()
      .filter((d) => d.colorCode === (this.selectedColorCode() ?? ''))
      .map((d) => ({
        id: `variant-storage-disabled-${String(d.storageGb)}`,
        text: d.reason,
        storageGb: d.storageGb,
      })),
  );

  selectColor(colorCode: string): void {
    if (this.isColorDisabled(colorCode)) return;
    this.colorChange.emit(colorCode);
  }

  selectStorage(storageGb: number): void {
    if (this.isStorageDisabled(storageGb)) return;
    this.storageChange.emit(storageGb);
  }

  isColorDisabled(colorCode: string): boolean {
    const storage = this.selectedStorageGb();
    if (storage === null) return false;
    return this.disabledCombinations().some(
      (d) => d.colorCode === colorCode && d.storageGb === storage,
    );
  }

  isStorageDisabled(storageGb: number): boolean {
    const color = this.selectedColorCode();
    if (color === null) return false;
    return this.disabledCombinations().some(
      (d) => d.colorCode === color && d.storageGb === storageGb,
    );
  }

  colorDisabledReasonId(colorCode: string): string | null {
    return this.isColorDisabled(colorCode)
      ? `variant-color-disabled-${colorCode}`
      : null;
  }

  storageDisabledReasonId(storageGb: number): string | null {
    return this.isStorageDisabled(storageGb)
      ? `variant-storage-disabled-${String(storageGb)}`
      : null;
  }

  ariaLabelForColor(name: string, selected: boolean): string {
    return `${name}${selected ? ', kiválasztva' : ', elérhető'}`;
  }

  ariaLabelForStorage(gb: number, selected: boolean): string {
    return `${String(gb)} GB${selected ? ', kiválasztva' : ', elérhető'}`;
  }
}