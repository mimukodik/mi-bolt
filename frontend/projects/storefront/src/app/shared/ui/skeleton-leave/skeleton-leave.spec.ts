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

function hostElement(root: unknown): HTMLElement {
  if (!(root instanceof HTMLElement)) {
    throw new Error('the fixture has no host element');
  }
  return root;
}

function setUp(): { directive: SkeletonLeave; skeleton: HTMLElement; bar: HTMLElement } {
  const fixture = TestBed.createComponent(SkeletonHost);
  fixture.detectChanges();
  const directive = fixture.debugElement
    .query(By.directive(SkeletonLeave))
    .injector.get(SkeletonLeave);
  const root = hostElement(fixture.nativeElement);
  const skeleton = root.querySelector('[data-testid="skeleton"]');
  const bar = root.querySelector('[data-testid="bar"]');
  if (!(skeleton instanceof HTMLElement) || !(bar instanceof HTMLElement)) {
    throw new Error('the skeleton did not render');
  }
  return { directive, skeleton, bar };
}

describe('SkeletonLeave', () => {
  it('SL-01 pins the skeleton at its own offset and size and starts the fade', () => {
    const { directive, skeleton } = setUp();
    Object.defineProperty(skeleton, 'offsetTop', { value: 12 });
    Object.defineProperty(skeleton, 'offsetLeft', { value: 34 });
    Object.defineProperty(skeleton, 'offsetWidth', { value: 560 });
    Object.defineProperty(skeleton, 'offsetHeight', { value: 78 });
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

  it('SL-02 the skeleton goes when its own transition ends', () => {
    const { directive, skeleton } = setUp();
    const animationComplete = vi.fn();
    directive.fadeOut({ target: skeleton, animationComplete });

    skeleton.dispatchEvent(new Event('transitionend'));

    expect(animationComplete).toHaveBeenCalledTimes(1);
  });

  it('SL-03 a transition ending inside the skeleton does not end the fade', () => {
    const { directive, skeleton, bar } = setUp();
    const animationComplete = vi.fn();
    directive.fadeOut({ target: skeleton, animationComplete });

    bar.dispatchEvent(new Event('transitionend', { bubbles: true }));

    expect(animationComplete).not.toHaveBeenCalled();
  });

  it('SL-04 an element with no HTML box is released at once and left untouched', () => {
    const { directive } = setUp();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const animationComplete = vi.fn();

    directive.fadeOut({ target: svg, animationComplete });

    expect(animationComplete).toHaveBeenCalledTimes(1);
    expect(svg.classList.contains('skeleton-leave')).toBe(false);
  });
});
