import { ComponentFixture, TestBed } from '@angular/core/testing';
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
// visibly distinct 'memory' state. FIX-10 (the cart-restore task) has
// not exposed a real persistence-mode value, so the call site still
// binds the 'durable' default; this spec drives the 'memory' arm
// directly to cover the branch, per docs/fix/FIX-70.md item 4.
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
    const durableText = root.querySelector('.demo-notice__text')?.textContent?.trim();

    host.persistenceMode.set('memory');
    fixture.detectChanges();

    const notice = root.querySelector('[data-testid="demo-notice"]');
    expect(notice?.classList.contains('demo-notice--memory')).toBe(true);
    const memoryText = root
      .querySelector('[data-testid="demo-notice-memory-text"]')
      ?.textContent?.trim();
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
