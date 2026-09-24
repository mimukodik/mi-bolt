import { Component, computed, input, output } from '@angular/core';

import type { Variant } from '@mi-bolt/api/models/variant';

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
 * in `variants()` are rendered `disabled` and expose the Hungarian
 * reason via `aria-describedby` so the user knows why the option is
 * not available. The component resolves the exact color+storage
 * combination itself (`docs/spec/components.md:424`) and emits the
 * resolved variant id; it never chooses a substitute.
 *
 * The component is purely presentational — it does not own the
 * product or any side-effecting state. The owning page feeds it the
 * variant list, the current selection and a `disabled` flag, and
 * receives one `variantSelected` output to forward to the facade.
 */
@Component({
  selector: 'app-variant-selector',
  templateUrl: './variant-selector.html',
  styleUrl: './variant-selector.scss',
})
export class VariantSelector {
  readonly variants = input<readonly Variant[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly disabled = input<boolean>(false);

  readonly variantSelected = output<string>();

  private readonly selectedVariant = computed<Variant | null>(() => {
    const id = this.selectedId();
    if (id === null) return null;
    return this.variants().find((v) => v.id === id) ?? null;
  });

  readonly selectedColorCode = computed<string | null>(
    () => this.selectedVariant()?.colorCode ?? null,
  );
  readonly selectedStorageGb = computed<number | null>(
    () => this.selectedVariant()?.storageGb ?? null,
  );

  /** Distinct color buckets derived from the variant list. */
  readonly colorOptions = computed(() => {
    const map = new Map<string, { colorCode: string; colorName: string; swatchHex: string }>();
    for (const variant of this.variants()) {
      if (map.has(variant.colorCode)) continue;
      map.set(variant.colorCode, {
        colorCode: variant.colorCode,
        colorName: variant.colorName,
        swatchHex: variant.swatchHex,
      });
    }
    return Array.from(map.values());
  });

  /** Distinct storage buckets derived from the variant list. */
  readonly storageOptions = computed(() => {
    const seen = new Set<number>();
    const list: { storageGb: number }[] = [];
    for (const variant of this.variants()) {
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
    return match !== undefined ? match.colorName : code;
  });

  readonly selectedStorageLabel = computed<string>(() => {
    const value = this.selectedStorageGb();
    if (value === null) return '—';
    return `${String(value)} GB`;
  });

  private lookupColorName(colorCode: string): string {
    const match = this.colorOptions().find((c) => c.colorCode === colorCode);
    return match !== undefined ? match.colorName : colorCode;
  }

  /** Every (color, storage) pair with no matching variant, and the
   *  Hungarian reason to show beside the disabled control. Replaces
   *  the removed `disabledCombinations` input: an unavailable pair is
   *  now simply a pair with no matching variant in `variants()`. */
  private readonly disabledCombinations = computed(() => {
    const list = this.variants();
    const colorSet = new Set<string>();
    const storageSet = new Set<number>();
    for (const variant of list) {
      colorSet.add(variant.colorCode);
      storageSet.add(variant.storageGb);
    }
    const out: { colorCode: string; storageGb: number; reason: string }[] = [];
    for (const colorCode of colorSet) {
      for (const storageGb of storageSet) {
        const exists = list.some((v) => v.colorCode === colorCode && v.storageGb === storageGb);
        if (exists) continue;
        out.push({
          colorCode,
          storageGb,
          reason: `Ez a szín (${this.lookupColorName(colorCode)}) nem elérhető ${String(storageGb)} GB kapacitással.`,
        });
      }
    }
    return out;
  });

  readonly colorDisabledReasons = computed(() =>
    this.disabledCombinations()
      .filter((d) => d.storageGb === (this.selectedStorageGb() ?? -1))
      .map((d) => ({
        id: `variant-color-disabled-${d.colorCode}`,
        text: d.reason,
        colorCode: d.colorCode,
      })),
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

  /** Resolves the exact (color, currentStorage) pair and emits its
   *  variant id. Emits nothing when the pair has no variant. */
  selectColor(colorCode: string): void {
    if (this.disabled() || this.isColorDisabled(colorCode)) return;
    const storage = this.selectedStorageGb();
    const match = this.variants().find((v) => v.colorCode === colorCode && v.storageGb === storage);
    if (match !== undefined) this.variantSelected.emit(match.id);
  }

  /** Resolves the exact (currentColor, storage) pair and emits its
   *  variant id. Emits nothing when the pair has no variant. */
  selectStorage(storageGb: number): void {
    if (this.disabled() || this.isStorageDisabled(storageGb)) return;
    const color = this.selectedColorCode();
    const match = this.variants().find((v) => v.colorCode === color && v.storageGb === storageGb);
    if (match !== undefined) this.variantSelected.emit(match.id);
  }

  isColorDisabled(colorCode: string): boolean {
    if (this.disabled()) return true;
    const storage = this.selectedStorageGb();
    if (storage === null) return false;
    return this.disabledCombinations().some(
      (d) => d.colorCode === colorCode && d.storageGb === storage,
    );
  }

  isStorageDisabled(storageGb: number): boolean {
    if (this.disabled()) return true;
    const color = this.selectedColorCode();
    if (color === null) return false;
    return this.disabledCombinations().some(
      (d) => d.colorCode === color && d.storageGb === storageGb,
    );
  }

  colorDisabledReasonId(colorCode: string): string | null {
    return this.isColorDisabled(colorCode) ? `variant-color-disabled-${colorCode}` : null;
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
