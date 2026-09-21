import type { ElementRef } from '@angular/core';
import { Component, computed, input, output, viewChildren } from '@angular/core';

/**
 * `Pagination` — `docs/spec/components.md:386`.
 *
 * Previous/next plus numbered page navigation with `aria-current`,
 * replacing the plain "x / y" text the pre-`FIX-60` markup showed.
 * `pageNumbers()` lists every page from 1 to `totalPages()` with no
 * ellipsis truncation — the specification does not ask for one, the
 * design prototype renders every page, and a truncation threshold
 * would be a number this task would have to invent
 * (`.claude/rules/planning-deliverables.md`).
 *
 * `disabled` is the one input beyond the entry's declared surface: the
 * entry's required states include `disabled` and no declared input can
 * produce it, the same shape of gap decision **D11** settled for
 * `MobileBuyRail`. It carries what `CatalogPage.controlsDisabled`
 * carries today (true only during the very first load).
 */
@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly disabled = input<boolean>(false);

  readonly pageChanged = output<number>();

  readonly totalPages = computed<number>(() => {
    const total = this.total();
    const size = this.pageSize();
    if (total <= 0) return 1;
    return Math.max(1, Math.ceil(total / size));
  });

  readonly pageNumbers = computed<readonly number[]>(() => {
    const count = this.totalPages();
    return Array.from({ length: count }, (_unused, index) => index + 1);
  });

  private readonly pageButtons = viewChildren<ElementRef<HTMLButtonElement>>('pageButton');

  /**
   * Previous/next hand focus to the button for the page they navigate
   * to, before `pageChanged` reaches the parent and that same button
   * (if it is `prev` or `next`) disables itself under the user's hands.
   * This is the FIX-25-adjacent fix `CatalogPage.handOffPaginationFocus`
   * used to carry: reaching page 1 or the last page disables the
   * boundary button the click was made on, and a browser hands focus
   * back to `<body>` for a focused element that stops being focusable
   * (WCAG 2.4.3, 2.4.7). The numbered button for the target page always
   * exists in the DOM already — every page 1..totalPages is rendered
   * unconditionally — so focusing it here, synchronously, moves focus
   * before the disabling re-render happens rather than chasing it
   * afterwards. A numbered-page click never needs this: those buttons
   * are never disabled (disabling the current page would drop it from
   * the tab order and lose the `aria-current` announcement).
   */
  onBoundary(target: number): void {
    const total = this.totalPages();
    if (target < 1 || target > total) return;
    // Only a boundary — reaching page 1 or the last page — disables the
    // button the click was made on; a click that lands strictly between
    // the two edges leaves both prev and next live, so focus stays
    // exactly where the user put it.
    if (target > 1 && target < total) return;
    const button = this.pageButtons()[target - 1];
    button.nativeElement.focus();
  }

  onPageClick(n: number): void {
    this.pageChanged.emit(n);
  }
}
