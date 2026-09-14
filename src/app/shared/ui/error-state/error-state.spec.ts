import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ErrorState } from './error-state';

@Component({
  imports: [ErrorState],
  template: `
    <app-error-state
      [title]="title()"
      [message]="message()"
      [retryLabel]="retryLabel()"
      [pending]="pending()"
      [preserving]="preserving()"
      (retryRequested)="retryCount.set(retryCount() + 1)"
    ></app-error-state>
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

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('ErrorState primitive', () => {
  it('announces via role=alert and aria-live=polite', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.getAttribute('role')).toBe('alert');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('renders the supplied title and message', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.textContent).toContain('Nem sikerült betölteni');
    expect(root.textContent).toContain('A hálózati hiba miatt');
  });

  it('shows the preserve hint when configured', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('[data-testid="error-hint"]')).not.toBeNull();
  });

  it('hides the preserve hint when not configured', () => {
    const { fixture, host } = setup();
    host.preserving.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="error-hint"]')).toBeNull();
  });

  it('emits retryRequested when the retry button is clicked', () => {
    const { fixture, host } = setup();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    expect(host.retryCount()).toBe(1);
  });

  it('swaps to the pending label and disables the button while retrying', () => {
    const { fixture, host } = setup();
    host.pending.set(true);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.textContent).toContain('Újrapróbálom…');
  });

  it('never invents stock, payment or warranty text inside the primitive', () => {
    const { fixture, host } = setup();
    host.message.set('A fizetés nem sikerült. Próbáld újra, vagy válassz másik módot.');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.textContent).not.toMatch(/készleten|raktáron|24 órán belül/i);
  });
});
