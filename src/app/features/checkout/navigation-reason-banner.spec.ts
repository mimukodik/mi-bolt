/**
 * MIM-212 S3-C8 — the redirect banner.
 *
 * The checkout guards redirect with `?navigationReason=…`
 * (`checkout.guards.ts`); this banner reads it off the current route and
 * renders the sentence. Two cases cover the rendered path and the empty
 * route: the empty-cart reason shows the sentence and disappears after the
 * shopper closes it, and a route without a known reason shows nothing.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, type Params } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { NavigationReasonBanner } from './navigation-reason-banner';

interface RenderedBanner {
  readonly host: HTMLElement;
  readonly banner: HTMLElement | null;
  readonly message: HTMLElement | null;
}

function renderBanner(params: Params): {
  readonly fixture: ReturnType<typeof TestBed.createComponent<NavigationReasonBanner>>;
  readonly rendered: RenderedBanner;
} {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap(params)),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(NavigationReasonBanner);
  fixture.detectChanges();
  const rendered = readRendered(fixture);
  return { fixture, rendered };
}

interface BannerFixture {
  readonly nativeElement: unknown;
}

function readRendered(fixture: BannerFixture): RenderedBanner {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return {
    host: raw,
    banner: raw.querySelector('[data-testid="navigation-reason"]'),
    message: raw.querySelector('[data-testid="navigation-reason"] .message'),
  };
}

function requireElement<T extends Element>(el: T | null, description: string): T {
  if (el === null) {
    throw new Error(`Expected ${description}`);
  }
  return el;
}

describe('NavigationReasonBanner on the 2.0.0 contract', () => {
  it('renders the sentence for the navigationReason on the route and hides after the shopper closes it (MIM-212)', () => {
    const { fixture, rendered } = renderBanner({ navigationReason: 'empty-cart' } satisfies Params);
    const message = requireElement(rendered.message, '.message element');
    expect(message.textContent.trim()).toBe('A kosarad üres, ezért ide irányítottunk.');
    expect(rendered.host.style.display).toBe('block');

    const banner = requireElement(rendered.banner, 'banner element');
    const dismiss = banner.querySelector('.actions button');
    if (!(dismiss instanceof HTMLButtonElement)) {
      throw new Error('Expected dismiss button to be HTMLButtonElement');
    }
    dismiss.click();
    fixture.detectChanges();

    expect(rendered.host.querySelectorAll('[data-testid="navigation-reason"]').length).toBe(0);
    expect(rendered.host.style.display).toBe('none');
  });

  it.each([{}, { navigationReason: 'reload' }])(
    'renders nothing for a route without a known navigationReason (%s)',
    (params) => {
      const { rendered } = renderBanner(params);
      expect(rendered.banner).toBeNull();
      expect(rendered.host.style.display).toBe('none');
    },
  );
});
