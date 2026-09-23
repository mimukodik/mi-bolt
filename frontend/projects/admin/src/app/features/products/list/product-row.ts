import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';

import type { ProductListRow } from './product-list.data-source';
import { formatPriceRange } from './price-range';

/**
 * One virtual-scroll row of the Termékek table (MIM-351, F16a): a
 * loaded `AdminProductListItem` or `undefined` while its page is still
 * in flight. The whole row is a `role="row"` that navigates to the
 * edit screen on click or Enter, except when the interaction started
 * on the explicit edit link (or, later, F17's row menu button) — those
 * handle their own activation, so `open` steps aside for them.
 */
@Component({
  selector: 'adm-product-row',
  templateUrl: './product-row.html',
  styleUrl: './product-row.css',
  imports: [MatChip, MatChipSet, MatIcon, MatIconButton, RouterLink],
  host: {
    role: 'row',
    '[attr.aria-rowindex]': 'rowIndex()',
    '[attr.tabindex]': 'item() === undefined ? -1 : 0',
    '[attr.aria-busy]': 'item() === undefined ? true : null',
    '(click)': 'open($event)',
    '(keydown.enter)': 'open($event)',
  },
})
export class ProductRow {
  private readonly router = inject(Router);

  readonly item = input.required<ProductListRow>();
  readonly rowIndex = input.required<number>();
  readonly handset = input(false);

  protected readonly price = computed(() => {
    const row = this.item();
    return row === undefined ? '' : formatPriceRange(row.minPrice, row.maxPrice);
  });

  open(event: Event): void {
    const row = this.item();
    if (row === undefined) return;
    if (event.target instanceof Element && event.target.closest('a, button') !== null) return;
    void this.router.navigate(['/termekek', row.id]);
  }
}
