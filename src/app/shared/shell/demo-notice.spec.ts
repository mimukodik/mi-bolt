import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DemoNotice } from './demo-notice';

@Component({
  imports: [DemoNotice],
  template: `<app-demo-notice [persistenceMode]="persistenceMode()" />`,
})
class HostComponent {
  readonly persistenceMode = signal<'durable' | 'memory'>('durable');
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

// FIX-70: DemoNotice gains a `persistenceMode` input and a second,
// visibly distinct 'memory' state. `AppShell` now binds the real
// value from the `PERSISTENCE_MODE` token (see app-shell.spec.ts),
// so this spec drives `DemoNotice` directly, in isolation, to cover
// both arms of the branch against rendered DOM.
describe('DemoNotice', () => {
  it('renders the default surface with no memory warning when persistenceMode is durable (FIX-70-AC04)', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="demo-notice"]')?.classList).not.toContain(
      'demo-notice--memory',
    );
    expect(root.querySelector('[data-testid="demo-notice-memory-text"]')).toBeNull();
    expect(root.querySelector('.demo-notice__text')?.textContent).toContain(
      'Fiktív termékek és árak',
    );
  });

  it('renders a distinct memory-warning surface with different text when persistenceMode is memory (FIX-70-AC03/AC04)', () => {
    const { fixture, host } = setup();
    const root = getNativeElement(fixture);
    const durableText = root.querySelector('.demo-notice__text')?.textContent.trim();

    host.persistenceMode.set('memory');
    fixture.detectChanges();

    const notice = root.querySelector('[data-testid="demo-notice"]');
    expect(notice?.classList.contains('demo-notice--memory')).toBe(true);
    const memoryText = root
      .querySelector('[data-testid="demo-notice-memory-text"]')
      ?.textContent.trim();
    expect(memoryText).toBeTruthy();
    expect(memoryText).not.toBe(durableText);
  });

  it('defaults persistenceMode to durable when unbound', () => {
    TestBed.configureTestingModule({ imports: [DemoNotice] });
    const fixture = TestBed.createComponent(DemoNotice);
    fixture.detectChanges();
    expect(fixture.componentInstance.persistenceMode()).toBe('durable');
  });
});
