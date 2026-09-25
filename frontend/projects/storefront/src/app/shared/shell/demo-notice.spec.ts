import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import type { SnapshotDiscard } from '@mi-bolt/mocks/persistence';
import { DemoNotice } from './demo-notice';

@Component({
  imports: [DemoNotice],
  template: `<app-demo-notice
    [persistenceMode]="persistenceMode()"
    [snapshotDiscard]="snapshotDiscard()"
  />`,
})
class HostComponent {
  readonly persistenceMode = signal<'durable' | 'memory'>('durable');
  readonly snapshotDiscard = signal<SnapshotDiscard | null>(null);
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
    expect(fixture.componentInstance.snapshotDiscard()).toBeNull();
  });

  it('a corrupt or stale discard shows the reset sentence on the warning strip (MIM-448)', () => {
    const { fixture, host } = setup();
    const root = getNativeElement(fixture);

    for (const discard of ['corrupt', 'stale'] as const) {
      host.snapshotDiscard.set(discard);
      fixture.detectChanges();

      const notice = root.querySelector('[data-testid="demo-notice"]');
      expect(notice?.classList.contains('demo-notice--reset')).toBe(true);
      expect(notice?.classList.contains('demo-notice--memory')).toBe(false);
      expect(root.querySelector('[data-testid="demo-notice-reset-text"]')?.textContent.trim()).toBe(
        'A mentett kosarad nem volt visszaállítható, ezért a bolt üres kosárral indult.',
      );
      expect(root.textContent ?? '').not.toContain('Fiktív termékek és árak');
    }
  });

  it('a version discard names the other version (MIM-448)', () => {
    const { fixture, host } = setup();
    const root = getNativeElement(fixture);

    host.snapshotDiscard.set('version');
    fixture.detectChanges();

    expect(
      root.querySelector('[data-testid="demo-notice"]')?.classList.contains('demo-notice--reset'),
    ).toBe(true);
    expect(root.querySelector('[data-testid="demo-notice-reset-text"]')?.textContent.trim()).toBe(
      'A mentett kosarad a bolt egy másik verziójából való, ezért a bolt üres kosárral indult.',
    );
  });

  it('memory mode wins over a discard (MIM-448)', () => {
    const { fixture, host } = setup();
    const root = getNativeElement(fixture);

    host.persistenceMode.set('memory');
    host.snapshotDiscard.set('corrupt');
    fixture.detectChanges();

    const notice = root.querySelector('[data-testid="demo-notice"]');
    expect(notice?.classList.contains('demo-notice--memory')).toBe(true);
    expect(notice?.classList.contains('demo-notice--reset')).toBe(false);
    expect(root.querySelector('[data-testid="demo-notice-reset-text"]')).toBeNull();
    expect(root.querySelector('[data-testid="demo-notice-memory-text"]')?.textContent).toContain(
      'A böngésződ nem engedi a mentést',
    );
  });

  it('MIM-216: the strip is the slim navy bar with the lime badge', () => {
    const raw: unknown = DemoNotice;
    const cmp: unknown =
      typeof raw === 'function' && 'ɵcmp' in raw ? Reflect.get(raw, 'ɵcmp') : undefined;
    const styles: unknown =
      typeof cmp === 'object' && cmp !== null && 'styles' in cmp
        ? Reflect.get(cmp, 'styles')
        : undefined;
    const css = (Array.isArray(styles) ? styles : [])
      .filter((s): s is string => typeof s === 'string')
      .join(' ')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/%NS%/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1');
    const bar = css.slice(
      css.indexOf('.demo-notice{'),
      css.indexOf('}', css.indexOf('.demo-notice{')),
    );
    const badge = css.slice(
      css.indexOf('.demo-notice__badge{'),
      css.indexOf('}', css.indexOf('.demo-notice__badge{')),
    );
    expect(bar).toContain('background:var(--color-shell-dark)');
    expect(bar).toContain('color:var(--color-text-inverse)');
    expect(bar).toContain('min-height:28px');
    expect(badge).toContain('background:var(--color-brand-accent)');
  });

  it('decision 16: the strip is not a live region', () => {
    const { fixture } = setup();
    const aside = getNativeElement(fixture).querySelector('[data-testid="demo-notice"]');
    expect(aside).not.toBeNull();
    expect(aside?.getAttribute('role')).toBeNull();
    expect(aside?.getAttribute('aria-live')).toBeNull();
  });
});
