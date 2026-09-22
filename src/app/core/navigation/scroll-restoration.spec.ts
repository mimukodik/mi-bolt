/**
 * MIM-228: application-managed scroll restoration.
 *
 * The provider under test wraps a subscription to `Router.events` that
 * runs inside the environment injector. The four acceptance cases
 * drive that subscription through a real `Router` whose events stream
 * is fed by hand; the `ViewportScroller` is a test double so the
 * assertions read what the component would have done, not what the
 * DOM ended up doing (jsdom cannot measure scroll position).
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { EnvironmentInjector } from '@angular/core';
import { NavigationEnd, NavigationSkipped, NavigationStart, Router, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideScrollRestoration } from './scroll-restoration';

interface ScrollerCalls {
  readonly positionCalls: readonly (readonly [number, number])[];
  readonly anchorCalls: readonly string[];
}

class StubViewportScroller {
  readonly positionCalls: [number, number][] = [];
  readonly anchorCalls: string[] = [];

  scrollToPosition(position: [number, number]): void {
    this.positionCalls.push(position);
  }

  scrollToAnchor(anchor: string): void {
    this.anchorCalls.push(anchor);
  }

  calls(): ScrollerCalls {
    return {
      positionCalls: this.positionCalls.slice(),
      anchorCalls: this.anchorCalls.slice(),
    };
  }
}

class TestRouter {
  readonly events = new Subject<unknown>();
  emitStart(url: string, restoredState: { navigationId: number } | null = null): void {
    this.events.next(new NavigationStart(1, url, 'imperative', restoredState));
  }
  emitEnd(url: string): void {
    this.events.next(new NavigationEnd(1, url, url));
  }
  scrollToPosition(position: [number, number], urlAfterRedirects?: string): void {
    const url = urlAfterRedirects ?? '/telefonok';
    this.emitStart(url);
    this.events.next(new Scroll(new NavigationEnd(1, url, url), position, null));
    this.emitEnd(url);
  }
  scrollToAnchor(anchor: string, urlAfterRedirects?: string): void {
    const url = urlAfterRedirects ?? '/telefonok';
    this.emitStart(url);
    this.events.next(new Scroll(new NavigationEnd(1, url, url), null, anchor));
    this.emitEnd(url);
  }
  scrollByPath(url: string): void {
    this.emitStart(url);
    this.events.next(new Scroll(new NavigationEnd(1, url, url), null, null));
    this.emitEnd(url);
  }
  popstateTo(url: string, navigationId: number): void {
    this.emitStart(url, { navigationId });
    this.events.next(new Scroll(new NavigationEnd(1, url, url), null, null));
    this.emitEnd(url);
  }
}

/** jsdom polyfills `requestAnimationFrame` but never advances its clock
 *  on its own; tests collect the callback and flush it synchronously
 *  when the assertion needs the deferred scroll. */
function setup(): {
  router: TestRouter;
  scroller: StubViewportScroller;
  rafCallbacks: (() => void)[];
  scrollToCalls: { x: number; y: number }[];
} {
  const router = new TestRouter();
  const scroller = new StubViewportScroller();
  const rafCallbacks: (() => void)[] = [];
  const scrollToCalls: { x: number; y: number }[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  // jsdom's `window.scrollTo` is a getter on the prototype; assigning
  // directly to the instance does not override it. Stub the global
  // instead so the listener writes go where the test can see them.
  vi.stubGlobal('scrollTo', (x: number, y: number): void => {
    scrollToCalls.push({ x, y });
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: router },
      { provide: ViewportScroller, useValue: scroller },
      provideScrollRestoration(),
    ],
  });
  TestBed.inject(EnvironmentInjector);
  return { router, scroller, rafCallbacks, scrollToCalls };
}

/** Run every RAF callback that has been queued and drain the list so a
 *  later check does not see a stale queue. */
function flush(rafCallbacks: (() => void)[]): void {
  for (const cb of rafCallbacks) cb();
  rafCallbacks.length = 0;
}

beforeEach(() => {
  TestBed.resetTestingModule();
});

afterEach(() => {
  vi.unstubAllGlobals();
  TestBed.resetTestingModule();
});

describe('MIM-228: scroll restoration', () => {
  it('MIM-228-AC01: a query-only change on the same path does not scroll', () => {
    const { router, scroller } = setup();
    router.scrollByPath('/telefonok');
    router.scrollByPath('/telefonok?brands=apple');
    expect(scroller.calls()).toEqual({
      positionCalls: [[0, 0]],
      anchorCalls: [],
    });
  });

  it('MIM-228-AC02: a path change scrolls to the top', () => {
    const { router, scroller } = setup();
    router.scrollByPath('/telefonok');
    router.scrollByPath('/telefonok/demo-one-5g');
    expect(scroller.calls()).toEqual({
      positionCalls: [
        [0, 0],
        [0, 0],
      ],
      anchorCalls: [],
    });
  });

  it('MIM-228-AC03: a stored position is restored', () => {
    const { router, scroller } = setup();
    router.scrollToPosition([0, 640]);
    expect(scroller.calls()).toEqual({
      positionCalls: [[0, 640]],
      anchorCalls: [],
    });
  });

  it('MIM-228-AC04: a fragment scrolls to its anchor', () => {
    const { router, scroller } = setup();
    router.scrollToAnchor('talalatok');
    expect(scroller.calls()).toEqual({
      positionCalls: [],
      anchorCalls: ['talalatok'],
    });
  });
});

describe('MIM-228-fix2: forward filter preserves the live scroll offset', () => {
  it('a same-path filter click defers a scroll back to the captured window.scrollY', () => {
    const { router, scroller, rafCallbacks, scrollToCalls } = setup();
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    router.scrollByPath('/telefonok');
    // The shopper scrolls; the listener does not see this because there
    // is no router event.
    Object.defineProperty(window, 'scrollY', {
      value: 1000,
      writable: true,
      configurable: true,
    });
    router.scrollByPath('/telefonok?brands=apple');
    // No synchronous scrollToPosition call — the deferred restore runs
    // on the next animation frame and writes directly to window.
    expect(scroller.calls()).toEqual({ positionCalls: [[0, 0]], anchorCalls: [] });
    flush(rafCallbacks);
    expect(scrollToCalls).toEqual([{ x: 0, y: 1000 }]);
  });

  it('a same-path filter click while the page sits at scrollY 0 does not scroll', () => {
    const { router, scroller, rafCallbacks, scrollToCalls } = setup();
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    router.scrollByPath('/telefonok');
    router.scrollByPath('/telefonok?brands=apple');
    expect(scroller.calls()).toEqual({ positionCalls: [[0, 0]], anchorCalls: [] });
    flush(rafCallbacks);
    expect(scrollToCalls).toEqual([]);
  });

  it('a forward nav to a different path saves the outgoing offset for the back nav', () => {
    const { router, scroller, rafCallbacks, scrollToCalls } = setup();
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    router.scrollByPath('/telefonok');
    // Scroll, then a path change.
    Object.defineProperty(window, 'scrollY', {
      value: 720,
      writable: true,
      configurable: true,
    });
    router.scrollByPath('/telefonok/demo-one-5g');
    expect(scroller.calls()).toEqual({
      positionCalls: [
        [0, 0],
        [0, 0],
      ],
      anchorCalls: [],
    });
    // The forward nav cleared the live offset back to zero, then the
    // shopper scrolls the new page; pressing Back returns to
    // `/telefonok` and the listener writes the saved 720.
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
    router.popstateTo('/telefonok', 1);
    flush(rafCallbacks);
    expect(scrollToCalls).toEqual([{ x: 0, y: 720 }]);
  });

  it('a popstate with no saved offset is a no-op', () => {
    const { router, rafCallbacks, scrollToCalls } = setup();
    router.popstateTo('/telefonok', 1);
    flush(rafCallbacks);
    expect(scrollToCalls).toEqual([]);
  });
});

describe('MIM-228-fix2: branches the reviewer found untested', () => {
  it('a Scroll event whose routerEvent is NavigationSkipped leaves lastPath untouched', () => {
    const { router, scroller, rafCallbacks, scrollToCalls } = setup();
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    router.scrollByPath('/telefonok');
    // A scroll event whose routerEvent is a NavigationSkipped (not a
    // NavigationEnd) is rare but the listener must guard against it.
    router.events.next(
      new Scroll(new NavigationSkipped(1, '/telefonok', 'ignored', 1), null, null),
    );
    // The early return skipped the position call but did not break the
    // subscription: a subsequent same-path filter click still defers a
    // restore.
    expect(scroller.calls()).toEqual({ positionCalls: [[0, 0]], anchorCalls: [] });
    Object.defineProperty(window, 'scrollY', {
      value: 500,
      writable: true,
      configurable: true,
    });
    router.scrollByPath('/telefonok?brands=apple');
    flush(rafCallbacks);
    expect(scrollToCalls).toEqual([{ x: 0, y: 500 }]);
  });

  it('a stored [0, 0] position is ignored (the guard the reviewer flagged)', () => {
    const { router, scroller } = setup();
    router.scrollToPosition([0, 0]);
    expect(scroller.calls()).toEqual({ positionCalls: [], anchorCalls: [] });
  });
});
