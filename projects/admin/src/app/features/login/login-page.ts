import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'adm-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Bejelentkezés</h1>`,
})
export class LoginPage {}
