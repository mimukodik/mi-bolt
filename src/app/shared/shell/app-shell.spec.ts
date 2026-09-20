import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { AppShell } from './app-shell';
import { PERSISTENCE_MODE } from '../../core/persistence-mode';

function getNativeElement(fixture: ComponentFixture<AppShell>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new TypeError('Expected HTMLElement');
  }
  return raw;
}

// FIX-70-AC05: before this test existed, `AppShell` always bound
// `DemoNotice`'s `persistenceMode` to the `'durable'` default, so the
// `'memory'` state could never appear regardless of what
// `PERSISTENCE_MODE` resolved to. This asserts the token's value
// actually reaches the rendered strip.
describe('AppShell wires PERSISTENCE_MODE into DemoNotice (FIX-70-AC05)', () => {
  function setup(mode: 'durable' | 'memory'): ComponentFixture<AppShell> {
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        provideZonelessChangeDetection(),
        { provide: PERSISTENCE_MODE, useValue: mode },
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    fixture.componentRef.setInput('variant', 'marketing');
    fixture.detectChanges();
    return fixture;
  }

  it("renders the default demo-notice surface when PERSISTENCE_MODE is 'durable'", () => {
    const fixture = setup('durable');
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="demo-notice"]')?.classList).not.toContain(
      'demo-notice--memory',
    );
  });

  it("renders the distinct memory-warning surface when PERSISTENCE_MODE is 'memory'", () => {
    const fixture = setup('memory');
    const root = getNativeElement(fixture);
    const notice = root.querySelector('[data-testid="demo-notice"]');
    expect(notice?.classList.contains('demo-notice--memory')).toBe(true);
    expect(root.querySelector('[data-testid="demo-notice-memory-text"]')?.textContent).toContain(
      'A böngésződ nem engedi a mentést',
    );
  });
});
