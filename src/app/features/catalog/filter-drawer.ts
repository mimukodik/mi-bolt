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
  template: `
    <app-accessible-dialog
      [opened]="opened()"
      [label]="'Szűrők'"
      [restoreTarget]="restoreEl()"
      (closed)="onDialogClosed()"
    >
      <form
        class="drawer"
        data-testid="filter-drawer"
        (submit)="$event.preventDefault(); applyDraft()"
      >
        <p class="intro">Állítsd be a szűrőket, majd az „Alkalmazás" gombra kattints.</p>

        <fieldset class="group" data-testid="drawer-group-brand">
          <legend class="legend">Márka</legend>
          <ul class="options" role="list">
            @for (brand of brandFacets(); track brand.value) {
              <li>
                <button
                  type="button"
                  class="option"
                  [class.is-selected]="isBrandSelected(brand.value)"
                  [attr.data-testid]="'drawer-brand-' + brand.value"
                  [attr.aria-pressed]="isBrandSelected(brand.value) ? 'true' : 'false'"
                  [disabled]="disabled() || brand.count === 0"
                  (click)="toggleBrand(brand.value)"
                >
                  <span class="check" aria-hidden="true">{{ isBrandSelected(brand.value) ? '✓' : '' }}</span>
                  <span class="option__label">{{ brand.label }}</span>
                  <span class="option__count">{{ brand.count }}</span>
                </button>
              </li>
            }
          </ul>
        </fieldset>

        <fieldset class="group" data-testid="drawer-group-storage">
          <legend class="legend">Tárhely</legend>
          <div class="chips">
            @for (bucket of storageBuckets(); track bucket) {
              <button
                type="button"
                class="chip"
                [class.is-selected]="isStorageSelected(bucket)"
                [attr.data-testid]="'drawer-storage-' + bucket"
                [attr.aria-pressed]="isStorageSelected(bucket) ? 'true' : 'false'"
                [disabled]="disabled()"
                (click)="toggleStorage(bucket)"
              >
                <span class="check" aria-hidden="true">{{ isStorageSelected(bucket) ? '✓' : '' }}</span>
                <span>{{ bucket }} GB</span>
              </button>
            }
          </div>
        </fieldset>

        <fieldset class="group" data-testid="drawer-group-price">
          <legend class="legend">Ár (Ft, egész szám)</legend>
          <div class="price">
            <label class="price__field">
              <span class="price__label">Min.</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                step="1000"
                class="input"
                data-testid="drawer-min-price"
                [value]="minDraft()"
                (input)="onMinInput($event)"
                [disabled]="disabled()"
              />
            </label>
            <label class="price__field">
              <span class="price__label">Max.</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                step="1000"
                class="input"
                data-testid="drawer-max-price"
                [value]="maxDraft()"
                (input)="onMaxInput($event)"
                [disabled]="disabled()"
              />
            </label>
          </div>
          @if (priceError()) {
            <app-form-field-message
              data-testid="drawer-price-error"
              [errors]="[{ code: 'INVALID_PRICE', message: priceError()!, pointer: 'price' }]"
              [touched]="true"
              severity="error"
              fieldId="drawer-price"
            ></app-form-field-message>
          }
        </fieldset>

        <fieldset class="group" data-testid="drawer-group-flags">
          <legend class="legend">További szűrők</legend>
          <button
            type="button"
            class="option"
            [class.is-selected]="isInStockSelected()"
            [attr.data-testid]="'drawer-inStock'"
            [attr.aria-pressed]="isInStockSelected() ? 'true' : 'false'"
            [disabled]="disabled()"
            (click)="toggleInStock()"
          >
            <span class="check" aria-hidden="true">{{ isInStockSelected() ? '✓' : '' }}</span>
            <span>Csak raktáron</span>
          </button>
          <button
            type="button"
            class="option"
            [class.is-selected]="isFiveGSelected()"
            [attr.data-testid]="'drawer-is5g'"
            [attr.aria-pressed]="isFiveGSelected() ? 'true' : 'false'"
            [disabled]="disabled()"
            (click)="toggleFiveG()"
          >
            <span class="check" aria-hidden="true">{{ isFiveGSelected() ? '✓' : '' }}</span>
            <span>Csak 5G</span>
          </button>
        </fieldset>

        <footer class="footer" data-testid="drawer-footer">
          <app-button
            variant="secondary"
            label="Mégse"
            data-testid="drawer-cancel"
            (pressed)="cancelDraft()"
          ></app-button>
          <app-button
            variant="primary"
            [label]="applyLabel()"
            data-testid="drawer-apply"
            [disabled]="!canApply()"
            (pressed)="applyDraft()"
          ></app-button>
        </footer>
      </form>
    </app-accessible-dialog>
  `,
  styles: [
    `
      :host { display: contents; }

      .drawer {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        max-height: calc(100vh - 12rem);
        overflow-y: auto;
      }

      .intro {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      .group {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        border: 0;
      }

      .legend {
        font-size: var(--type-helper);
        font-weight: var(--weight-medium);
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .options {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }

      .option {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        line-height: 1;
        cursor: pointer;
        text-align: left;
      }

      .option:hover:not(:disabled) {
        background: var(--color-brand-accent-soft);
        border-color: var(--color-brand-ink);
      }

      .option:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .option.is-selected {
        background: var(--color-brand-accent-soft);
        border-color: var(--color-brand-ink);
        color: var(--color-brand-ink);
        font-weight: var(--weight-medium);
      }

      .option:disabled {
        background: var(--color-surface-section);
        color: var(--color-text-secondary);
        cursor: not-allowed;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        cursor: pointer;
      }

      .chip.is-selected {
        background: var(--color-brand-accent-soft);
        border-color: var(--color-brand-ink);
        color: var(--color-brand-ink);
        font-weight: var(--weight-medium);
      }

      .chip:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        font-weight: var(--weight-bold);
      }

      .option__label {
        flex: 1 1 auto;
      }

      .option__count {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .is-selected .option__count {
        color: var(--color-brand-ink);
      }

      .price {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
      }

      .price__field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .price__label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .input {
        width: 100%;
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border-control);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        line-height: 1;
      }

      .input:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .input:disabled {
        background: var(--color-surface-section);
        color: var(--color-text-secondary);
      }

      .footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3);
        padding-top: var(--space-4);
        border-top: 1px solid var(--color-border-subtle);
        position: sticky;
        bottom: 0;
        background: var(--color-surface-light);
      }
    `,
  ],
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
