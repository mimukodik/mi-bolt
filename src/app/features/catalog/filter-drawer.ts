import { Component, computed, effect, input, output, signal } from '@angular/core';

import type { CatalogQuery } from './catalog-query';
import type { FacetValue } from '../../api/generated/models/facet-value';

import { AccessibleDialog } from '../../shared/ui/accessible-dialog/accessible-dialog';
import { Button } from '../../shared/ui/button/button';
import { FormFieldMessage } from '../../shared/ui/form-field-message/form-field-message';

/**
 * T13 — mobile filter drawer (FilterDrawer).
 *
 * Behaviour:
 *   - Renders a copy of the parent-supplied filters while open. Edits
 *     are TRANSIENT: Apply emits one `filtersChanged` with the draft;
 *     Cancel and Escape discard the draft and leave the URL untouched.
 *   - The dialog primitive (AccessibleDialog) owns the focus trap,
 *     the Escape-to-close path and the background exclusion, so this
 *     component never reinvents the accessibility machinery.
 *   - The sticky footer keeps "Mégse" and "Szűrők alkalmazása" within
 *     the visible viewport at narrow widths; the body scrolls.
 *
 * Required states:
 *   - closed       — nothing mounted, focus returns to the trigger.
 *   - open         — drawer visible, focus inside.
 *   - draft-changed— a control was modified; Apply becomes enabled
 *                    only when the draft is valid.
 *   - invalid      — the price range fails the local validation; the
 *                    draft is held but Apply stays disabled.
 *   - disabled     — the parent disables Apply during a refresh.
 */
@Component({
  selector: 'app-filter-drawer',
  imports: [AccessibleDialog, Button, FormFieldMessage],
  templateUrl: './filter-drawer.html',
  styleUrl: './filter-drawer.scss',
})
export class FilterDrawer {
  /** Applied filters (the source of truth). */
  readonly applied = input.required<CatalogQuery>();

  /** Live facets. */
  readonly facets = input<{ readonly brands: readonly FacetValue[]; readonly storageGb: readonly FacetValue[] } | null>(null);

  /** Whether the drawer is mounted. */
  readonly opened = input<boolean>(false);

  /** Whether the controls are inert (loading / error). */
  readonly disabled = input<boolean>(false);

  /** Emits the committed draft exactly once per Apply press. */
  readonly filtersChanged = output<CatalogQuery>();

  /** Emits when the drawer is closed by any path (Apply, Cancel, Escape, backdrop). */
  readonly closed = output<void>();

  // -------------------------------------------------------------------------
  // Draft state — resets to the applied filters every time the drawer opens.
  // -------------------------------------------------------------------------

  private readonly draftBrands = signal<readonly string[]>([]);
  private readonly draftStorage = signal<readonly (128 | 256 | 512)[]>([]);
  private readonly draftInStock = signal<boolean>(false);
  private readonly draftFiveG = signal<boolean>(false);
  private readonly draftMin = signal<string>('');
  private readonly draftMax = signal<string>('');

  /** Storage buckets exposed by the documented storage enum. */
  readonly storageBuckets = computed<readonly (128 | 256 | 512)[]>(() => [128, 256, 512]);

  /** Brand facets, falling back to an empty list when none are present. */
  readonly brandFacets = computed<readonly FacetValue[]>(() => this.facets()?.brands ?? []);

  /** Element that should regain focus when the dialog closes. The parent
   *  passes its own trigger button through this input so WCAG focus
   *  restoration always lands on the control that opened the drawer. */
  readonly restoreEl = input<HTMLElement | null>(null);

  readonly minDraft = computed<string>(() => this.draftMin());

  readonly maxDraft = computed<string>(() => this.draftMax());

  readonly priceError = computed<string | null>(() => {
    const min = this.parsePrice(this.draftMin());
    const max = this.parsePrice(this.draftMax());
    if (min !== null && min < 0) return 'A minimum ár nem lehet negatív.';
    if (max !== null && max < 0) return 'A maximum ár nem lehet negatív.';
    if (min !== null && max !== null && min > max) return 'A minimum nem lehet nagyobb a maximum árnál.';
    return null;
  });

  readonly canApply = computed<boolean>(() => !this.disabled() && this.priceError() === null);

  readonly applyLabel = computed<string>(() => (this.disabled() ? 'Alkalmazás…' : 'Szűrők alkalmazása'));

  constructor() {
    // Every time the drawer opens we reseed the draft from the parent
    // value so the user always starts from the URL's truth, not from
    // a previous half-applied state.
    effect(() => {
      const isOpen = this.opened();
      if (!isOpen) return;
      const a = this.applied();
      this.draftBrands.set([...(a.brands ?? [])]);
      this.draftStorage.set([...(a.storageGb ?? [])]);
      this.draftInStock.set(a.inStock === true);
      this.draftFiveG.set(a.is5g === true);
      this.draftMin.set(a.minPrice === undefined ? '' : String(a.minPrice));
      this.draftMax.set(a.maxPrice === undefined ? '' : String(a.maxPrice));
    });
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  toggleBrand(brand: string): void {
    const current = this.draftBrands();
    const next = current.includes(brand) ? current.filter((b) => b !== brand) : [...current, brand];
    this.draftBrands.set(next);
  }

  toggleStorage(bucket: 128 | 256 | 512): void {
    const current = this.draftStorage();
    const next = current.includes(bucket) ? current.filter((b) => b !== bucket) : [...current, bucket];
    this.draftStorage.set(next);
  }

  toggleInStock(): void {
    this.draftInStock.set(!this.draftInStock());
  }

  toggleFiveG(): void {
    this.draftFiveG.set(!this.draftFiveG());
  }

  onMinInput(event: Event): void {
    this.draftMin.set((event.target as HTMLInputElement).value);
  }

  onMaxInput(event: Event): void {
    this.draftMax.set((event.target as HTMLInputElement).value);
  }

  applyDraft(): void {
    if (!this.canApply()) return;
    const min = this.parsePrice(this.draftMin());
    const max = this.parsePrice(this.draftMax());
    const draft: CatalogQuery = {
      ...this.applied(),
      brands: this.draftBrands().length > 0 ? this.draftBrands() : undefined,
      storageGb: this.draftStorage().length > 0 ? this.draftStorage() : undefined,
      inStock: this.draftInStock() ? true : undefined,
      is5g: this.draftFiveG() ? true : undefined,
      minPrice: min === null ? undefined : min,
      maxPrice: max === null ? undefined : max,
    };
    this.filtersChanged.emit(draft);
    this.closed.emit();
  }

  cancelDraft(): void {
    // The draft is discarded; we only emit the close so the parent can
    // hide the dialog. The applied filters (and therefore the URL) are
    // untouched.
    this.closed.emit();
  }

  onDialogClosed(): void {
    // Triggered by Escape / backdrop / close button — same as Cancel.
    this.closed.emit();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isBrandSelected(brand: string): boolean {
    return this.draftBrands().includes(brand);
  }

  isStorageSelected(bucket: 128 | 256 | 512): boolean {
    return this.draftStorage().includes(bucket);
  }

  isInStockSelected(): boolean {
    return this.draftInStock();
  }

  isFiveGSelected(): boolean {
    return this.draftFiveG();
  }

  private parsePrice(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (!/^-?\d+$/.test(trimmed)) return null;
    return Number(trimmed);
  }
}
