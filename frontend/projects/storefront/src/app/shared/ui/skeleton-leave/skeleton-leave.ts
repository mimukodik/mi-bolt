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
 * opacity transition fades it. The element goes when that fade finishes.
 * `getAnimations()` applies the pending class change before it answers
 * (https://www.w3.org/TR/css-transitions-2/, "Requirements on pending
 * style changes"), so the fade is in the list whenever it runs; an
 * element that is not rendered (a skeleton in the filter drawer when the
 * drawer closes) starts no transition and goes at once instead of
 * waiting for Angular's four-second fallback. A shimmer animation on the
 * element itself is not the fade and is not waited for.
 * The pin reads `offsetTop` and `offsetLeft`, which measure from the
 * offset parent; they match the absolute containing block because no
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
    el.classList.add('skeleton-leave');
    const fades = el
      .getAnimations()
      .filter(
        (animation) =>
          'transitionProperty' in animation && animation.transitionProperty === 'opacity',
      );
    const release = (): void => {
      event.animationComplete();
    };
    void Promise.all(fades.map((fade) => fade.finished)).then(release, release);
  }
}
