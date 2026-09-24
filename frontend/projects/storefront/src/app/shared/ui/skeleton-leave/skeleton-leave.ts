import type { AnimationCallbackEvent } from '@angular/core';
import { Directive } from '@angular/core';

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
 * ends; if it never ends, Angular removes the element itself after four
 * seconds.
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
    el.addEventListener('transitionend', (end) => {
      if (end.target === el) {
        event.animationComplete();
      }
    });
    el.classList.add('skeleton-leave');
  }
}
