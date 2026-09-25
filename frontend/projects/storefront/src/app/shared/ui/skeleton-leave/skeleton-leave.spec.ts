import type { AnimationCallbackEvent } from '@angular/core';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

import { SkeletonLeave } from './skeleton-leave';

@Component({
  imports: [SkeletonLeave],
  template: `<div appSkeletonLeave data-testid="skeleton"><span data-testid="bar"></span></div>`,
})
class SkeletonHost {}

/** What the stubbed `getAnimations()` returns: jsdom implements no Web Animations. */
interface FakeAnimation {
  readonly transitionProperty?: string;
  readonly animationName?: string;
  readonly finished: Promise<unknown>;
}

function hostElement(root: unknown): HTMLElement {
  if (!(root instanceof HTMLElement)) {
    throw new Error('the fixture has no host element');
  }
  return root;
}

function setUp(): { directive: SkeletonLeave; skeleton: HTMLElement } {
  const fixture = TestBed.createComponent(SkeletonHost);
  fixture.detectChanges();
  const directive = fixture.debugElement
    .query(By.directive(SkeletonLeave))
    .injector.get(SkeletonLeave);
  const root = hostElement(fixture.nativeElement);
  const skeleton = root.querySelector('[data-testid="skeleton"]');
  if (!(skeleton instanceof HTMLElement)) {
    throw new Error('the skeleton did not render');
  }
  return { directive, skeleton };
}

function stubAnimations(el: HTMLElement, read: () => readonly FakeAnimation[]): void {
  Object.defineProperty(el, 'getAnimations', { value: read, configurable: true });
}

function never(): Promise<unknown> {
  return new Promise<unknown>(() => {
    // never settles
  });
}

function deferred(): { promise: Promise<unknown>; resolve: () => void; reject: () => void } {
  let resolve: () => void = () => undefined;
  let reject: () => void = () => undefined;
  const promise = new Promise<unknown>((onResolve, onReject) => {
    resolve = () => {
      onResolve(undefined);
    };
    reject = () => {
      onReject(new DOMException('cancelled', 'AbortError'));
    };
  });
  return { promise, resolve, reject };
}

describe('SkeletonLeave', () => {
  it('SL-01 pins the skeleton at its own offset and size and starts the fade', () => {
    const { directive, skeleton } = setUp();
    Object.defineProperty(skeleton, 'offsetTop', { value: 12 });
    Object.defineProperty(skeleton, 'offsetLeft', { value: 34 });
    Object.defineProperty(skeleton, 'offsetWidth', { value: 560 });
    Object.defineProperty(skeleton, 'offsetHeight', { value: 78 });
    stubAnimations(skeleton, () => [{ transitionProperty: 'opacity', finished: never() }]);
    const animationComplete = vi.fn();
    const event: AnimationCallbackEvent = { target: skeleton, animationComplete };

    directive.fadeOut(event);

    expect(skeleton.style.position).toBe('absolute');
    expect(skeleton.style.top).toBe('12px');
    expect(skeleton.style.left).toBe('34px');
    expect(skeleton.style.width).toBe('560px');
    expect(skeleton.style.height).toBe('78px');
    expect(skeleton.style.margin).toBe('0px');
    expect(skeleton.classList.contains('skeleton-leave')).toBe(true);
    expect(animationComplete).not.toHaveBeenCalled();
  });

  it('SL-02 the skeleton goes once its fade finishes, not before', async () => {
    const { directive, skeleton } = setUp();
    const fade = deferred();
    stubAnimations(skeleton, () => [{ transitionProperty: 'opacity', finished: fade.promise }]);
    const animationComplete = vi.fn();
    directive.fadeOut({ target: skeleton, animationComplete });

    expect(animationComplete).not.toHaveBeenCalled();
    fade.resolve();

    await vi.waitFor(() => {
      expect(animationComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('SL-03 a shimmer animation on the skeleton itself does not hold it', async () => {
    const { directive, skeleton } = setUp();
    stubAnimations(skeleton, () => [
      { animationName: 'price-shimmer', finished: never() },
      { transitionProperty: 'opacity', finished: Promise.resolve() },
    ]);
    const animationComplete = vi.fn();
    directive.fadeOut({ target: skeleton, animationComplete });

    await vi.waitFor(() => {
      expect(animationComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('SL-04 an element with no HTML box is released at once and left untouched', () => {
    const { directive } = setUp();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const animationComplete = vi.fn();

    directive.fadeOut({ target: svg, animationComplete });

    expect(animationComplete).toHaveBeenCalledTimes(1);
    expect(svg.classList.contains('skeleton-leave')).toBe(false);
  });

  it('SL-05 a skeleton that is not rendered runs no fade and goes at once', async () => {
    const { directive, skeleton } = setUp();
    stubAnimations(skeleton, () => []);
    const animationComplete = vi.fn();
    directive.fadeOut({ target: skeleton, animationComplete });

    await vi.waitFor(() => {
      expect(animationComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('SL-06 a cancelled fade still releases the skeleton once', async () => {
    const { directive, skeleton } = setUp();
    const fade = deferred();
    stubAnimations(skeleton, () => [{ transitionProperty: 'opacity', finished: fade.promise }]);
    const animationComplete = vi.fn();
    directive.fadeOut({ target: skeleton, animationComplete });

    fade.reject();

    await vi.waitFor(() => {
      expect(animationComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('SL-07 the animations are read after the fade class is on the element', () => {
    const { directive, skeleton } = setUp();
    let classWhenRead = false;
    stubAnimations(skeleton, () => {
      classWhenRead = skeleton.classList.contains('skeleton-leave');
      return [];
    });

    directive.fadeOut({ target: skeleton, animationComplete: vi.fn() });

    expect(classWhenRead).toBe(true);
  });
});
