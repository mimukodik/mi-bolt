import type { AnimationCallbackEvent } from '@angular/core';
import { Directive } from '@angular/core';

/** The `.skeleton-leave` fade is 200ms (`src/styles/primitives.css`). A
 *  transition never runs on an element that is not rendered (a skeleton
 *  in the filter drawer when the drawer closes), so no `transitionend`
 *  comes, and Angular's own fallback waits four seconds; the element is
 *  released this long after the fade starts instead. */
export const RELEASE_AFTER_MS = 300;

/**
 * Fades a skeleton out over the content that replaced it instead of
 * dropping it (`docs/design/yettel.md`, "Skeleton loaders and their
 * fade-out"). It goes on the root element of a skeleton that a
 * control-flow block removes, in the template that holds the block.
 * Angular calls the `animate.leave` handler before it takes the element
 * out (https://angular.dev/guide/animations#animateleave): the handler
 * pins the element at its own offset and size, so the content lays out
 * beneath it at once, and adds the global `.skeleton-leave` class, whose
 * opacity transition fades it. The element goes when that transition
 * ends, or `RELEASE_AFTER_MS` after the fade starts, whichever comes
 * first. The pin reads `offsetTop` and `offsetLeft`, which measure from
 * the offset parent; they match the absolute containing block because no
 * skeleton ancestor carries a `transform`, `filter` or `contain` and
 * `body` has no margin (`src/styles/primitives.css`).
 */
@Directive({
  selector: '[appSkeletonLeave]',
  host: { '(animate.leave)': 'fadeOut($event)' },
})
export class SkeletonLeave {
  fadeOut(event: AnimationCallbackEvent): void {
    const el = event.target;
    if (!(el instanceof HTMLElement)) {
      event.animationComplete();
      return;
    }
    const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = el;
    el.style.position = 'absolute';
    el.style.top = `${String(offsetTop)}px`;
    el.style.left = `${String(offsetLeft)}px`;
    el.style.width = `${String(offsetWidth)}px`;
    el.style.height = `${String(offsetHeight)}px`;
    el.style.margin = '0px';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = (): void => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      event.animationComplete();
    };
    el.addEventListener('transitionend', (end) => {
      if (end.target === el) {
        release();
      }
    });
    el.classList.add('skeleton-leave');
    timer = setTimeout(release, RELEASE_AFTER_MS);
  }
}
