import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { CatalogQuery } from './catalog-query';
import { ALLOWED_STORAGE_GB, isStorageBucket } from './catalog-query';
import type { ColorFacetValue } from '../../api/generated/models/color-facet-value';
import type { FacetValue } from '../../api/generated/models/facet-value';
import type { Facets } from '../../api/generated/models/facets';

import { AccessibleDialog } from '../../shared/ui/accessible-dialog/accessible-dialog';
import { Button } from '../../shared/ui/button/button';
import { FormFieldMessage } from '../../shared/ui/form-field-message/form-field-message';
import { isHTMLInputElement } from '../../shared/utils/event-target';

/** What one storage chip needs to render: the size, its label and
 *  the facet count (null when no `Facets` has loaded yet). */
interface StorageBucket {
  readonly gb: 128 | 256 | 512;
  readonly label: string;
  readonly count: number | null;
}

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
 *   - draft-changed— a control was modified; Apply is always active.
 *   - invalid      — the price range fails the local validation; a
 *                    click on Apply applies nothing and focuses the
 *                    invalid price input (owner, 2026-09-22).
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

  /** Live facets — full `Facets` object so the colour group can read
   *  `colors` straight off the generated model. */
  readonly facets = input<Facets | null>(null);

  /** Whether the drawer is mounted. */
  readonly opened = input<boolean>(false);

  /** Whether the controls are inert (loading / error). */
  readonly disabled = input<boolean>(false);

  /** Emits the committed draft exactly once per Apply press. */
  readonly filtersChanged = output<CatalogQuery>();

  /** Emits when the drawer is closed by any path (Apply, Cancel, Escape, backdrop). */
  readonly closed = output();

  // -------------------------------------------------------------------------
  // Draft state — resets to the applied filters every time the drawer opens.
  // -------------------------------------------------------------------------

  private readonly draftBrands = signal<readonly string[]>([]);
  private readonly draftStorage = signal<readonly (128 | 256 | 512)[]>([]);
  private readonly draftColors = signal<readonly string[]>([]);
  private readonly draftInStock = signal<boolean>(false);
  private readonly draftFiveG = signal<boolean>(false);
  private readonly draftMin = signal<string>('');
  private readonly draftMax = signal<string>('');

  /** Storage buckets exposed by the documented storage enum, paired with
   *  the facet count so the chip can show "128 GB (3)". Falls back to
   *  the documented enum with `null` counts when no `Facets` is loaded. */
  readonly storageFacets = computed<readonly StorageBucket[]>(() => {
    const facets = this.facets();
    if (facets === null) {
      return ALLOWED_STORAGE_GB.map((gb) => ({ gb, label: `${String(gb)} GB`, count: null }));
    }
    const out: StorageBucket[] = [];
    for (const entry of facets.storageGb) {
      const bucket = toStorageBucket(entry);
      if (bucket !== null) out.push(bucket);
    }
    return out;
  });

  /** Stock facet count, or null when the latest response carries none. */
  readonly inStockCount = computed<number | null>(() => this.facets()?.inStock ?? null);

  /** 5G facet count, or null when the latest response carries none. */
  readonly fiveGCount = computed<number | null>(() => this.facets()?.is5g ?? null);

  /** Placeholder hint for the min-price input: the lower bound. */
  readonly priceMinHint = computed<string | null>(() => {
    const range = this.facets()?.priceRange;
    return range === undefined ? null : String(range.min.amount);
  });

  /** Placeholder hint for the max-price input: the upper bound. */
  readonly priceMaxHint = computed<string | null>(() => {
    const range = this.facets()?.priceRange;
    return range === undefined ? null : String(range.max.amount);
  });

  /** Brand facets, falling back to an empty list when none are present. */
  readonly brandFacets = computed(() => this.facets()?.brands ?? []);

  /** The brand list collapses to the first five rows behind a
   *  `Még több gyártó` text link. A brand selected beyond the first
   *  five keeps the list expanded so the chip the user picked stays
   *  visible. It survives closing and reopening the drawer
   *  (owner, 2026-09-22). */
  readonly brandsExpanded = signal(false);

  /** Brands to render: the first five when collapsed, otherwise the
   *  full list. When collapsed but a brand beyond row five is selected,
   *  the list stays open so the chip stays visible. */
  readonly visibleBrandFacets = computed<readonly FacetValue[]>(() => {
    const all = this.brandFacets();
    if (this.brandsExpanded()) return all;
    if (all.length <= 5) return all;
    const hasDeeperSelection = this.draftBrands().some((b) => {
      const idx = all.findIndex((f) => f.value === b);
      return idx >= 5;
    });
    if (hasDeeperSelection) return all;
    return all.slice(0, 5);
  });

  /** Whether every brand facet is currently rendered — either because the
   *  user expanded the list, or because a selection beyond row five forces
   *  it open. Drives both the "more" button's `aria-expanded` and its own
   *  label, so the two can never disagree. */
  readonly brandsAllVisible = computed(
    () => this.visibleBrandFacets().length === this.brandFacets().length,
  );

  toggleBrandsExpanded(): void {
    this.brandsExpanded.update((v) => !v);
  }

  /** Colour facets, falling back to an empty list when none are present. */
  readonly colorFacets = computed<readonly ColorFacetValue[]>(() => this.facets()?.colors ?? []);

  /** Element that should regain focus when the dialog closes. The parent
   *  passes its own trigger button through this input so WCAG focus
   *  restoration always lands on the control that opened the drawer. */
  readonly restoreEl = input<HTMLElement | null>(null);

  readonly minDraft = computed<string>(() => this.draftMin());

  readonly maxDraft = computed<string>(() => this.draftMax());

  /** Single source of truth for the price validation: the message that
   *  renders under the fieldset, and which input the error belongs to
   *  (used by `aria-invalid`/`aria-describedby` and by `focusPrice`).
   *  Two computeds reading one validation keeps the two outputs from
   *  drifting apart when the rules change. */
  private readonly priceValidation = computed<{
    readonly field: 'min' | 'max' | null;
    readonly message: string | null;
  }>(() => {
    const min = this.parsePrice(this.draftMin());
    const max = this.parsePrice(this.draftMax());
    if (min !== null && min < 0) {
      return { field: 'min', message: 'A minimum ár nem lehet negatív.' };
    }
    if (max !== null && max < 0) {
      return { field: 'max', message: 'A maximum ár nem lehet negatív.' };
    }
    if (min !== null && max !== null && min > max) {
      return { field: 'min', message: 'A minimum nem lehet nagyobb a maximum árnál.' };
    }
    return { field: null, message: null };
  });

  readonly priceError = computed<string | null>(() => this.priceValidation().message);

  /** Which price input the current error belongs to, in page order. */
  readonly priceInvalidField = computed<'min' | 'max' | null>(() => this.priceValidation().field);

  private readonly minPriceInput = viewChild<ElementRef<HTMLInputElement>>('minPrice');
  private readonly maxPriceInput = viewChild<ElementRef<HTMLInputElement>>('maxPrice');
  private readonly injector = inject(Injector);

  readonly applyLabel = computed<string>(() =>
    this.disabled() ? 'Alkalmazás…' : 'Szűrők alkalmazása',
  );

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
      this.draftColors.set([...(a.colors ?? [])]);
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
    const next = current.includes(bucket)
      ? current.filter((b) => b !== bucket)
      : [...current, bucket];
    this.draftStorage.set(next);
  }

  toggleColor(code: string): void {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    const current = this.draftColors();
    const next = current.includes(trimmed)
      ? current.filter((c) => c !== trimmed)
      : [...current, trimmed];
    this.draftColors.set(next);
  }

  toggleInStock(): void {
    this.draftInStock.set(!this.draftInStock());
  }

  toggleFiveG(): void {
    this.draftFiveG.set(!this.draftFiveG());
  }

  onMinInput(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    this.draftMin.set(event.target.value);
  }

  onMaxInput(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    this.draftMax.set(event.target.value);
  }

  applyDraft(): void {
    if (this.disabled()) return;
    const invalid = this.priceInvalidField();
    if (invalid !== null) {
      this.focusPrice(invalid);
      return;
    }
    const min = this.parsePrice(this.draftMin());
    const max = this.parsePrice(this.draftMax());
    const draft: CatalogQuery = {
      ...this.applied(),
      brands: this.draftBrands().length > 0 ? this.draftBrands() : undefined,
      storageGb: this.draftStorage().length > 0 ? this.draftStorage() : undefined,
      colors: this.draftColors().length > 0 ? this.draftColors() : undefined,
      inStock: this.draftInStock() ? true : undefined,
      is5g: this.draftFiveG() ? true : undefined,
      minPrice: min ?? undefined,
      maxPrice: max ?? undefined,
    };
    this.filtersChanged.emit(draft);
    this.closed.emit();
  }

  /** After the next render, focuses the invalid price input with a
   *  visible ring (WAI forms tutorial: move focus to the first
   *  invalid field). */
  private focusPrice(field: 'min' | 'max'): void {
    afterNextRender(
      () => {
        const ref = field === 'min' ? this.minPriceInput() : this.maxPriceInput();
        ref?.nativeElement.focus({ focusVisible: true });
      },
      { injector: this.injector },
    );
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

  isColorSelected(code: string): boolean {
    return this.draftColors().includes(code);
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

/** Narrow a `FacetValue` from `Facets.storageGb` into a `StorageBucket`,
 *  returning null when the contract publishes a value the documented
 *  enum does not recognise. */
function toStorageBucket(entry: FacetValue): StorageBucket | null {
  const raw = Number(entry.value);
  if (!Number.isInteger(raw)) return null;
  if (!isStorageBucket(raw)) return null;
  return { gb: raw, label: entry.label, count: entry.count };
}
