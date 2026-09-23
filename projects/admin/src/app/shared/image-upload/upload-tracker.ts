import { Injectable, computed, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { defer, finalize } from 'rxjs';

/**
 * Counts uploads in flight so a page holding one or more `adm-image-upload`
 * controls can disable its own save button while any of them is still
 * uploading (F19). No `providedIn`: the page provides one instance of its
 * own in `providers`, so two pages never share a counter.
 */
@Injectable()
export class UploadTracker {
  private readonly count = signal(0);

  readonly active: Signal<number> = this.count.asReadonly();
  readonly busy: Signal<boolean> = computed(() => this.active() > 0);

  /**
   * Wraps `source` so the counter goes up on subscribe and back down exactly
   * once on completion, error or unsubscribe.
   */
  track<T>(source: Observable<T>): Observable<T> {
    return defer(() => {
      this.count.update((value) => value + 1);
      return source.pipe(
        finalize(() => {
          this.count.update((value) => value - 1);
        }),
      );
    });
  }
}
