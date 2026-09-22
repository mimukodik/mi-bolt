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
import { NavigationEnd, Router, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  scrollToPosition(position: [number, number]): void {
    this.events.next(buildScroll(position, null));
  }
  scrollToAnchor(anchor: string): void {
    this.events.next(buildScroll(null, anchor));
  }
  scrollByPath(url: string): void {
    this.events.next(buildScroll(null, null, url));
  }
}

function buildScroll(
  position: [number, number] | null,
  anchor: string | null,
  urlAfterRedirects?: string,
): Scroll {
  const url = urlAfterRedirects ?? '/telefonok';
  const routerEvent = new NavigationEnd(1, url, url);
  return new Scroll(routerEvent, position, anchor);
}

function setup(): { router: TestRouter; scroller: StubViewportScroller } {
  const router = new TestRouter();
  const scroller = new StubViewportScroller();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: router },
      { provide: ViewportScroller, useValue: scroller },
      provideScrollRestoration(),
    ],
  });
  // The provider is a `provideEnvironmentInitializer`; its body runs
  // once when the test-bed's environment injector is first created,
  // so just resolving the injector here is enough to wire the
  // subscription against the test doubles above.
  TestBed.inject(EnvironmentInjector);
  return { router, scroller };
}

beforeEach(() => {
  TestBed.resetTestingModule();
});

afterEach(() => {
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
