import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import type { Sort } from '@angular/material/sort';
import { RouterLink } from '@angular/router';

import type { AdminProductSortField } from '../../../api/generated/models/admin-product-sort-field';

import { DEFAULT_PRODUCT_LIST_QUERY } from './product-list.query';
import { ProductListStore } from './product-list.store';
import { ProductRow } from './product-row';

/** The columns the header offers as sortable (plan X3); `rank` is the
 *  default order with no active header, and `releasedAt` is not
 *  offered in this UI. */
const SORTABLE_COLUMNS = [
  'name',
  'brand',
  'minPrice',
  'totalStock',
  'featured',
] as const satisfies readonly AdminProductSortField[];

function isSortableColumn(value: string): value is (typeof SORTABLE_COLUMNS)[number] {
  return SORTABLE_COLUMNS.some((column) => column === value);
}

/**
 * The Termékek page (MIM-351, F16a): a sortable header row outside a
 * `cdk-virtual-scroll-viewport` of 52px `ProductRow`s, driven by
 * `ProductListStore`. The filter row (F16b) and the row's
 * archive/restore menu (F17) are not built here.
 */
@Component({
  selector: 'adm-product-list-page',
  templateUrl: './product-list-page.html',
  styleUrl: './product-list-page.css',
  imports: [
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    MatButton,
    MatIcon,
    MatProgressBar,
    MatSort,
    MatSortHeader,
    ProductRow,
    RouterLink,
  ],
  providers: [ProductListStore],
})
export class ProductListPage {
  protected readonly store = inject(ProductListStore);

  protected readonly handset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly sortActive = computed(() => {
    const sort = this.store.query().sort;
    return isSortableColumn(sort) ? sort : '';
  });

  protected readonly sortDirection = computed(() =>
    this.sortActive() === '' ? '' : this.store.query().direction,
  );

  protected readonly filtered = computed(() => {
    const query = this.store.query();
    return (
      query.q !== DEFAULT_PRODUCT_LIST_QUERY.q ||
      query.brands.length !== DEFAULT_PRODUCT_LIST_QUERY.brands.length ||
      query.status !== DEFAULT_PRODUCT_LIST_QUERY.status ||
      query.featured !== DEFAULT_PRODUCT_LIST_QUERY.featured ||
      query.outOfStock !== DEFAULT_PRODUCT_LIST_QUERY.outOfStock
    );
  });

  /** `aria-rowcount`: the header row plus every product, or -1 while the total is unknown (ARIA's value for an unknown count). */
  protected readonly rowCount = computed(() => {
    const total = this.store.total();
    return total === null ? -1 : total + 1;
  });

  protected onSortChange(sort: Sort): void {
    if (sort.direction === '' || !isSortableColumn(sort.active)) return;
    this.store.setQuery({ sort: sort.active, direction: sort.direction });
  }

  /** Szűrők törlése: focus moves to the page title first, because the clear removes the button that holds it. */
  protected clearFilters(title: HTMLElement): void {
    title.focus();
    this.store.setQuery({
      q: DEFAULT_PRODUCT_LIST_QUERY.q,
      brands: DEFAULT_PRODUCT_LIST_QUERY.brands,
      status: DEFAULT_PRODUCT_LIST_QUERY.status,
      featured: DEFAULT_PRODUCT_LIST_QUERY.featured,
      outOfStock: DEFAULT_PRODUCT_LIST_QUERY.outOfStock,
    });
  }

  /** Újra: focus moves to the page title first, because the reload removes the button that holds it. */
  protected retry(title: HTMLElement): void {
    title.focus();
    this.store.retry();
  }
}
