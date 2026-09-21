import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundPage } from './not-found-page';

// FIX-06 co-located feature specs beside their components rather than
// under root `tests/`; this spec follows that landed policy rather
// than FIX-41.md's now-stale instruction to place it in `tests/`.

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

function setup(): ComponentFixture<NotFoundPage> {
  TestBed.configureTestingModule({
    imports: [NotFoundPage],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(NotFoundPage);
  fixture.detectChanges();
  return fixture;
}

describe('NotFoundPage', () => {
  it('renders exactly two links inside the useful-links nav (FIX-41-AC10)', () => {
    const fixture = setup();
    const nav = getNativeElement(fixture).querySelector('[aria-label="Hasznos linkek"]');
    expect(nav?.querySelectorAll('a').length).toBe(2);
  });

  it('gives the home link an href of /', () => {
    const fixture = setup();
    const link = getNativeElement(fixture).querySelector<HTMLAnchorElement>(
      '[data-testid="not-found-home-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/');
  });

  it('gives the catalogue link an href of /telefonok', () => {
    const fixture = setup();
    const link = getNativeElement(fixture).querySelector<HTMLAnchorElement>(
      '[data-testid="not-found-catalog-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/telefonok');
  });

  it('renders the heading text', () => {
    const fixture = setup();
    expect(getNativeElement(fixture).querySelector('h1')?.textContent).toBe(
      'Az oldal nem található',
    );
  });
});
