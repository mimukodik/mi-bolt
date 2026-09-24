import { Component, effect, inject, input, output, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import type { MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatChipListbox, MatChipOption } from '@angular/material/chips';
import type { MatChipSelectionChange } from '@angular/material/chips';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import type { MatSelectChange } from '@angular/material/select';

import { AdminApi } from '../../../api/generated/admin-api';
import { listAdminBrands } from '../../../api/generated/fn/admin-products/list-admin-brands';
import type { AdminProductStatusFilter } from '../../../api/generated/models/admin-product-status-filter';

import type { ProductListQuery } from './product-list.query';

const STATUS_VALUES: readonly AdminProductStatusFilter[] = ['active', 'archived', 'all'];

/** The Márka select's value while the brand list has not resolved yet, or failed. */
const NO_BRANDS: readonly string[] = [];

/** Guard rather than cast: a `MatButtonToggleChange.value` is `any` until it proves membership in the literal-union source. */
function isStatusFilter(value: unknown): value is AdminProductStatusFilter {
  return STATUS_VALUES.some((status) => status === value);
}

/** Guard rather than cast: a `MatSelectChange.value` is `any` until it proves it is an array of strings. */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
}

/**
 * The Termékek filter row (MIM-351, F16b): search, brand multi-select,
 * the Aktív/Archivált/Mind toggle and the Kiemelt/Készlethiány chips,
 * every change written into the router query through `queryChange`
 * rather than held as the component's own state. Loads the brand list
 * itself, once; while it loads or on failure the Márka select simply
 * carries no options (M3/M4, f16b-f17-facts.md §1).
 */
@Component({
  selector: 'adm-product-filters',
  templateUrl: './product-filters.html',
  imports: [
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatChipListbox,
    MatChipOption,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatPrefix,
    MatSelect,
  ],
})
export class ProductFilters {
  private readonly api = inject(AdminApi);

  readonly query = input.required<ProductListQuery>();
  readonly filtered = input.required<boolean>();

  readonly queryChange = output<Partial<ProductListQuery>>();
  readonly clear = output();

  protected readonly brands = toSignal(
    this.api.invoke(listAdminBrands).pipe(catchError(() => of(NO_BRANDS))),
    { initialValue: NO_BRANDS },
  );

  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  constructor() {
    // Every `query()` change rewrites the search input's DOM value, so a
    // cleared filter (e.g. Szűrők törlése) never leaves a typed-but-not-yet-
    // committed value behind (https://angular.dev/api/core/viewChild,
    // https://angular.dev/guide/signals#reactive-contexts).
    effect(() => {
      this.search().nativeElement.value = this.query().q;
    });
  }

  protected onSearchChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value.trim();
    if (value === this.query().q) return;
    this.queryChange.emit({ q: value });
  }

  protected onBrandsChange(event: MatSelectChange): void {
    const value: unknown = event.value;
    if (!isStringArray(value)) return;
    this.queryChange.emit({ brands: value });
  }

  protected onStatusChange(event: MatButtonToggleChange): void {
    const value: unknown = event.value;
    if (!isStatusFilter(value)) return;
    this.queryChange.emit({ status: value });
  }

  protected onFeaturedChange(event: MatChipSelectionChange): void {
    // The programmatic `[selected]` write also emits `selectionChange`, with
    // `isUserInput` false (chips.mjs: MatChipOption `set selected`, line 880,
    // calls `_setSelectedState(value, false, true)`); only a real click or
    // keypress on the chip's primary action reaches here with `true`
    // (chips.mjs: `_handlePrimaryActionInteraction`, line 906, and
    // `MatChipAction._handleClick`, line 137).
    if (!event.isUserInput) return;
    this.queryChange.emit({ featured: event.selected });
  }

  protected onOutOfStockChange(event: MatChipSelectionChange): void {
    if (!event.isUserInput) return;
    this.queryChange.emit({ outOfStock: event.selected });
  }
}
