import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'adm-admins-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Adminok</h1>`,
})
export class AdminsPage {}
