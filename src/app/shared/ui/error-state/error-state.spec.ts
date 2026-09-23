import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ErrorState } from './error-state';

@Component({
  imports: [ErrorState],
  template: `
    <app-error-state
      [message]="message()"
      [pending]="pending()"
      [preserving]="preserving()"
      [retryLabel]="retryLabel()"
      [title]="title()"
      (retryRequested)="retryCount.set(retryCount() + 1)"
    />
  `,
})
class HostComponent {
  readonly title = signal('Nem sikerült betölteni');
  readonly message = signal('A hálózati hiba miatt most nem tudjuk megjeleníteni az adatokat.');
  readonly retryLabel = signal('Újrapróbálom');
  readonly pending = signal(false);
  readonly preserving = signal(true);
  readonly retryCount = signal(0);
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

describe('ErrorState primitive', () => {
  it('announces via role=alert and aria-live=polite', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('alert');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('renders the supplied title and message', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.textContent).toContain('Nem sikerült betölteni');
    expect(root?.textContent).toContain('A hálózati hiba miatt');
  });

  it('shows the preserve hint when configured', () => {
    const { fixture } = setup();
    expect(getNativeElement(fixture).querySelector('[data-testid="error-hint"]')).not.toBeNull();
  });

  it('hides the preserve hint when not configured', () => {
    const { fixture, host } = setup();
    host.preserving.set(false);
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('[data-testid="error-hint"]')).toBeNull();
  });

  it('emits retryRequested when the retry button is clicked', () => {
    const { fixture, host } = setup();
    const btn = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
    if (btn === null) {
      throw new Error('Expected button');
    }
    btn.click();
    expect(host.retryCount()).toBe(1);
  });

  it('swaps to the pending label and makes the button inert while retrying', () => {
    const { fixture, host } = setup();
    host.pending.set(true);
    fixture.detectChanges();
    const btn = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
    if (btn === null) {
      throw new Error('Expected button');
    }
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.textContent).toContain('Újrapróbálom…');
  });

  it('never invents stock, payment or warranty text inside the primitive', () => {
    const { fixture, host } = setup();
    host.message.set('A fizetés nem sikerült. Próbáld újra, vagy válassz másik módot.');
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.textContent).not.toMatch(/készleten|raktáron|24 órán belül/i);
  });
});
