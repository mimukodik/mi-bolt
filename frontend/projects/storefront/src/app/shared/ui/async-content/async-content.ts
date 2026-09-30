import { Component, computed, input, output } from '@angular/core';

import type { AsyncStatus } from '../../types/async-status';
import type { UiProblem } from '../../types/ui-problem';
import { EmptyState } from '../empty-state/empty-state';
import { ErrorState } from '../error-state/error-state';
import { ProductCardSkeleton } from '../product-card-skeleton/product-card-skeleton';
import { SkeletonLeave } from '../skeleton-leave/skeleton-leave';

/**
 * `AsyncContent` — `docs/spec/components.md:176`.
 *
 * Composes the loading/empty/error states around whatever content the
 * caller projects, so a list page never repeats the same five-way
 * `@switch` inline. `FIX-60` extracts it out of `CatalogPage`, which is
 * its first and only caller today.
 *
 * The loading branch is the catalogue's: six `ProductCardSkeleton`s in
 * the grid's own columns (`docs/design/yettel.md`, "Product card
 * skeleton"). Its count and shape are baked in rather than projected, so
 * a caller whose loading state is not a six-slot product card grid (the
 * product page's four-slot related strip, say) cannot use this component
 * as it stands: the loading presentation would have to become a
 * projected slot, the way the empty state's action already is.
 *
 * `status` is `AsyncStatus` (`idle|loading|success|empty|error`), which
 * has no `refreshing` member. The caller maps its own richer status
 * (e.g. `CatalogStatus`, which adds `refreshing`) onto `status` plus
 * `hasPrevious` at the call site: `refreshing` becomes
 * `status: 'loading', hasPrevious: true`. `hasPrevious` is what tells
 * `loading` apart from a refresh — "previous usable data can remain
 * under explicit refresh warning" (`components.md:184`'s Functions
 * line) — by keeping the caller's projected content on screen instead
 * of swapping it for a skeleton.
 *
 * Content projection carries the two things this component's declared
 * surface has no room for. The default `<ng-content>` carries the
 * loaded content, shown in both `success` and the refreshing case of
 * `loading`. The empty state's action arrives through a named slot,
 * `[data-async-empty-action]`, rather than a second output: the entry
 * declares only `retryRequested`, and an empty-action output would be a
 * change to the specification that decision **D1** forbids this task
 * from making. Projection lets the caller keep ownership of its own
 * action (e.g. "Szűrők törlése", `components.md:347`'s `AppliedFilters`
 * `cleared` output) without `AsyncContent` needing to know what it is.
 */
@Component({
  selector: 'app-async-content',
  imports: [ProductCardSkeleton, EmptyState, ErrorState, SkeletonLeave],
  templateUrl: './async-content.html',
  styleUrl: './async-content.scss',
})
export class AsyncContent {
  readonly emptyTitle = input('Nincs a szűrőknek megfelelő készülék.');
  readonly status = input.required<AsyncStatus>();
  readonly problem = input<UiProblem | null>(null);
  readonly hasPrevious = input<boolean>(false);

  readonly retryRequested = output();

  /** `loading` with previous content to preserve — the refreshing case. */
  protected readonly isRefreshing = computed<boolean>(
    () => this.status() === 'loading' && this.hasPrevious(),
  );

  protected readonly errorMessage = computed<string>(
    () => this.problem()?.message ?? 'Ismeretlen hiba történt.',
  );
}
